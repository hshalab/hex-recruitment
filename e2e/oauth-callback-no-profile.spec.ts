import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// Regression coverage for the Google OAuth callback "no_profile" bug:
// previously the callback issued an UPDATE … WHERE user_id = state and
// emitted gcal=error&reason=no_profile whenever the UPDATE matched zero
// rows. Email/password employer signups frequently reached the OAuth
// step without an employer_profiles row (because the client-side
// upsert during signup is RLS-blocked pre-confirm, and the server-side
// fallback in lib/authCallback.ts was gated by !existingRole — never
// true for email/password signups since role is stamped at signUp
// time). The fix replaces UPDATE with UPSERT (onConflict: user_id) and
// adds a UNIQUE constraint on user_id so the upsert actually works.
//
// Two assertions in this file, each load-bearing in a different way:
// 1. Static-source check on app/api/auth/google/callback/route.ts —
//    fails immediately if anyone reverts the upsert back to UPDATE.
//    This is the cheapest, most direct regression signal.
// 2. Database-layer check — issues an upsert through PostgREST's API
//    against a throwaway user_id with no pre-existing row, confirms
//    the row is created. This catches the orthogonal failure mode
//    where the UNIQUE constraint on employer_profiles.user_id is
//    missing (without it the upsert returns 42P10 and silently fails).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

test.skip(
  !SUPABASE_URL || !SERVICE_KEY,
  'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.test or .env.local',
)

test.describe('OAuth callback — no_profile regression', () => {
  test('callback route uses .upsert() with onConflict user_id, not .update().eq()', () => {
    // Static-source check. Mirrors the test 11 pattern in
    // pipeline-mobile.spec.ts. The route file must declare its persist
    // step as `.upsert(...)` with `onConflict: 'user_id'`; the old
    // `.update(...).eq('user_id', state).select(...)` pattern + the
    // `length === 0 → no_profile` branch are the regression we're
    // guarding against. If anyone reverts to UPDATE, this assertion
    // fails with a clear diagnostic — without needing to spin up a
    // browser or hit Google.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/api/auth/google/callback/route.ts'),
      'utf8',
    )

    // Positive assertions: the new upsert is present and well-formed.
    expect(src, 'callback must call .upsert on employer_profiles').toMatch(
      /\.from\(['"]employer_profiles['"]\)\s*\.upsert\(/,
    )
    expect(src, 'callback must pass onConflict: user_id').toMatch(
      /onConflict:\s*['"]user_id['"]/,
    )

    // Negative assertions: the reverted patterns must NOT reappear.
    // The OLD code did `.update({...}).eq('user_id', state).select(...)`
    // followed by a `updated.length === 0 → no_profile` branch. If
    // either of those resurface, this test fails.
    expect(
      /\.from\(['"]employer_profiles['"]\)\s*\.update\(/.test(src),
      'callback must not use .update() on employer_profiles (regression: see "no_profile" bug)',
    ).toBe(false)

    expect(
      /reason=no_profile/.test(src),
      'callback must not emit ?gcal=error&reason=no_profile — upsert creates the row defensively',
    ).toBe(false)
  })

  test('upsert on employer_profiles creates a row when none exists (DB layer)', async () => {
    // Behavioral check at the PostgREST/database layer. Issues exactly
    // the upsert the callback now issues, against a freshly-created
    // auth.users row that has no pre-existing employer_profiles row.
    // If the UNIQUE constraint on user_id is missing, this throws with
    // code 42P10. If the upsert syntax is wrong, the row won't appear
    // afterwards.
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    })

    // Create a real throwaway auth.users row — employer_profiles.user_id
    // FK-references auth.users(id) with ON DELETE CASCADE, so a synthetic
    // user_id alone won't satisfy the FK. The test deletes this user in
    // its finally block, which cascades-deletes any employer_profiles
    // row created during the test (defence-in-depth: we also explicitly
    // delete the row first).
    const throwawayEmail = `e2e-oauth-noprofile-${crypto.randomUUID()}@example.com`
    const { data: createUserData, error: createUserErr } =
      await supabase.auth.admin.createUser({
        email: throwawayEmail,
        email_confirm: true,
        user_metadata: { role: 'employer' },
      })
    if (createUserErr || !createUserData?.user) {
      throw new Error(`Failed to create throwaway test user: ${createUserErr?.message}`)
    }
    const throwawayUserId = createUserData.user.id

    try {
      // Pre-condition: row absent. (handle_new_user trigger inserts a
      // public.employees row but NOT an employer_profiles row, so we
      // expect the latter to be missing.)
      const { data: pre } = await supabase
        .from('employer_profiles')
        .select('user_id')
        .eq('user_id', throwawayUserId)
        .maybeSingle()
      expect(pre, 'pre-condition: throwaway user_id must have no employer_profiles row').toBeNull()

      // Same shape as app/api/auth/google/callback/route.ts after the fix.
      const { error: upsertErr } = await supabase
        .from('employer_profiles')
        .upsert(
          {
            user_id: throwawayUserId,
            gcal_access_token: 'test-access',
            gcal_refresh_token: 'test-refresh',
            gcal_calendar_id: 'primary',
          },
          { onConflict: 'user_id' },
        )

      if (upsertErr) {
        // 42P10 = no unique constraint matching ON CONFLICT. Make the
        // diagnostic explicit so a future engineer reading the CI log
        // immediately knows the migration was reverted or dropped.
        throw new Error(
          `Upsert failed — likely missing UNIQUE constraint on employer_profiles.user_id ` +
          `(see migration 20260529120000_employer_profiles_user_id_unique.sql). ` +
          `PostgREST error: ${upsertErr.code} ${upsertErr.message}`,
        )
      }

      // Post-condition: row present, tokens set.
      const { data: post } = await supabase
        .from('employer_profiles')
        .select('user_id, gcal_access_token, gcal_calendar_id')
        .eq('user_id', throwawayUserId)
        .maybeSingle()
      expect(post, 'upsert must create the row when it did not exist').not.toBeNull()
      expect(post?.gcal_access_token).toBe('test-access')
      expect(post?.gcal_calendar_id).toBe('primary')
    } finally {
      // Tear down employer_profiles row explicitly (don't rely on
      // cascade in case the constraint changes), then the auth.users
      // row. Order matters: cascade would delete the profile when the
      // user goes, but explicit teardown is cheaper to debug if it ever
      // fails.
      await supabase.from('employer_profiles').delete().eq('user_id', throwawayUserId)
      await supabase.auth.admin.deleteUser(throwawayUserId)
    }
  })
})
