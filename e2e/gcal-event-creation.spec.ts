import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

// Note on imports: we deliberately do NOT import from '@/lib/googleCalendar'
// here. That module imports lib/supabase-admin.ts which is marked
// `'server-only'` and would block this test file from loading. The
// load-bearing "createCalendarEvent throws on failure" assertion is
// instead enforced by the static-source check below, which greps the
// function body for `throw new GoogleCalendarApiError` and the absence
// of `return null`. That catches the regression at the code level
// without needing the function to be importable at test time.

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// Regression coverage for the "Thrive UI says scheduled but Google
// Calendar shows nothing" bug. Three load-bearing assertions, each
// catching a different shape of the regression:
//
// 1. Static-source check on app/api/calendar/book/route.ts — fails if
//    anyone re-introduces the `if (selfScheduled)` gate that
//    historically caused employer-initiated bookings to never call
//    Google's events.insert.
//
// 2. Static-source check on lib/googleCalendar.ts — fails if anyone
//    reverts createCalendarEvent back to "return null on failure",
//    which was the silent-fail pattern that masked every Google API
//    error in production. Also asserts the GoogleCalendarApiError
//    class export is present.
//
// 3. DB-layer check: insert a booking with gcal_sync_error populated
//    via the new column added by migration
//    20260529160000_interview_bookings_gcal_sync_error. Confirms the
//    schema migration applied and the column is writable.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

test.skip(
  !SUPABASE_URL || !SERVICE_KEY,
  'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.test or .env.local',
)

test.describe('gcal event creation — regression coverage', () => {
  test('book route has no selfScheduled gate + writes gcal_sync_error on catch', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/api/calendar/book/route.ts'),
      'utf8',
    )

    // The OLD code wrapped the entire gcal block in `if (selfScheduled)`
    // — that's exactly the regression we want to prevent. The literal
    // pattern `if (selfScheduled)` must not appear anywhere in the file.
    // (The variable `selfScheduled` itself is still legitimately
    // destructured and used for the `status: selfScheduled ?
    // 'confirmed' : 'scheduled'` line — only the gating pattern is
    // forbidden.)
    expect(
      /if\s*\(\s*selfScheduled\s*\)/.test(src),
      'book/route.ts must NOT gate the gcal block on selfScheduled — that was the bug',
    ).toBe(false)

    // The new code must record gcal_sync_error in the catch block so
    // failures are queryable instead of silently swallowed.
    expect(src, 'book/route.ts catch must record gcal_sync_error').toMatch(
      /gcal_sync_error/,
    )

    // The gcal block must still actually call createCalendarEvent —
    // sanity that nobody removed the call entirely while removing the
    // gate. Pattern is forgiving on whitespace and arguments.
    expect(src, 'book/route.ts must call createCalendarEvent').toMatch(
      /createCalendarEvent\(/,
    )
  })

  test('googleCalendar.ts throws on failure (no silent return null on !res.ok)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../lib/googleCalendar.ts'),
      'utf8',
    )

    // The new error class must be exported (callers import it for
    // instanceof checks). Load-bearing for any caller that wants to
    // distinguish "Google API error" from other thrown errors.
    expect(src, 'GoogleCalendarApiError must be exported').toMatch(
      /export\s+class\s+GoogleCalendarApiError/,
    )

    // Each throw site uses an `operation` label that uniquely
    // identifies which function emitted it. We grep for those labels
    // rather than slicing function bodies — the slicing approach was
    // brittle against editor line-ending variations on Windows.
    expect(
      src,
      'createCalendarEvent must throw GoogleCalendarApiError with operation "events.insert"',
    ).toMatch(/throw\s+new\s+GoogleCalendarApiError\(\s*['"]events\.insert['"]/)

    expect(
      src,
      'updateCalendarEvent must throw GoogleCalendarApiError with operation "events.update"',
    ).toMatch(/throw\s+new\s+GoogleCalendarApiError\(\s*['"]events\.update['"]/)

    // updateCalendarEvent must keep the 404/410 fall-through path so
    // callers can recover from "event no longer exists on Google's
    // side" by creating a fresh event. Without this, a candidate
    // deleting the event from their Google Calendar would brick
    // reschedules.
    expect(src, 'updateCalendarEvent must keep the 404/410 fall-through path').toMatch(
      /res\.status\s*===\s*404\s*\|\|\s*res\.status\s*===\s*410/,
    )

    // The OLD silent-fail pattern: `console.error(...)\n  return null`
    // inside createCalendarEvent on `!res.ok`. We can't easily slice
    // the function body across line-ending variants, but the literal
    // pair "createCalendarEvent failed" + a subsequent `return null`
    // (instead of throw) on the same response error path is the
    // diagnostic signature of the regression. If anyone reintroduces
    // it, this assertion catches it.
    const oldSilentPattern = /createCalendarEvent failed[\s\S]{0,200}?return\s+null/
    expect(
      oldSilentPattern.test(src),
      'createCalendarEvent must not console.error then return null — that was the silent-fail pattern',
    ).toBe(false)
  })

  test('interview_bookings.gcal_sync_error column accepts writes (schema migration applied)', async () => {
    // Cheapest possible check that migration
    // 20260529160000_interview_bookings_gcal_sync_error.sql was
    // applied: insert a row with gcal_sync_error populated, read it
    // back. If the column is missing in this environment, the INSERT
    // returns PostgREST PGRST204 / "column does not exist" and the
    // test fails with a clear diagnostic.
    //
    // We seed a real auth.users + employer_profiles + interview row
    // because interview_bookings has FK constraints on employer_id /
    // candidate_id / interview_id. Teardown removes the lot via the
    // cascade on the auth.users row.
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    const throwawayEmail = `e2e-gcal-error-${crypto.randomUUID()}@example.com`
    const { data: createUserData, error: createUserErr } =
      await supabase.auth.admin.createUser({
        email: throwawayEmail,
        email_confirm: true,
        user_metadata: { role: 'employer' },
      })
    if (createUserErr || !createUserData?.user) {
      throw new Error(`Failed to create throwaway employer: ${createUserErr?.message}`)
    }
    const employerId = createUserData.user.id

    // Need a candidate user too. Reuse the same employer-side user as
    // both employer and candidate would violate intent semantically but
    // not the FK (job_applications.candidate_id is a FK to auth.users,
    // no role check). For maximum isolation we create a second user.
    const candidateEmail = `e2e-gcal-cand-${crypto.randomUUID()}@example.com`
    const { data: createCandData } = await supabase.auth.admin.createUser({
      email: candidateEmail,
      email_confirm: true,
      user_metadata: { role: 'employee' },
    })
    const candidateId = createCandData?.user?.id
    if (!candidateId) throw new Error('Failed to create throwaway candidate')

    let bookingId: string | null = null
    try {
      // Seed employer_profiles via the same defensive upsert
      // pattern lib/authCallback.ts now uses post-fix.
      await supabase
        .from('employer_profiles')
        .upsert(
          { user_id: employerId, company_name: 'E2E Co', contact_name: 'E2E Tester', email: throwawayEmail },
          { onConflict: 'user_id', ignoreDuplicates: true },
        )

      // Seed a throwaway job so the application has somewhere to live.
      const { data: job } = await supabase
        .from('jobs')
        .insert({
          employer_id: employerId,
          title: '__e2e_gcal__ Role',
          company: 'E2E Co',
          location: 'London',
          salary_min: 25000,
          salary_max: 30000,
        })
        .select('id')
        .single()
      if (!job?.id) throw new Error('job seed failed')

      // Insert a booking with gcal_sync_error populated. This is the
      // load-bearing assertion: column must exist + must accept text.
      const { data: booking, error: bookErr } = await supabase
        .from('interview_bookings')
        .insert({
          employer_id: employerId,
          candidate_id: candidateId,
          booked_date: '2099-01-01',
          booked_time: '10:00:00',
          duration_minutes: 45,
          status: 'scheduled',
          gcal_sync_error: 'Google Calendar events.insert failed: 401 Unauthorized',
        })
        .select('id, gcal_sync_error, gcal_event_id_employer')
        .single()
      if (bookErr) {
        throw new Error(
          `interview_bookings insert with gcal_sync_error failed — ` +
          `migration 20260529160000 likely not applied. PostgREST: ${bookErr.code} ${bookErr.message}`,
        )
      }
      bookingId = booking?.id || null

      expect(booking?.gcal_sync_error).toBe(
        'Google Calendar events.insert failed: 401 Unauthorized',
      )
      // gcal_event_id_employer NULL is the failure-mode invariant:
      // when sync failed, we have an error message but no event id.
      expect(booking?.gcal_event_id_employer).toBeNull()
    } finally {
      // Teardown — explicit delete of booking + job (FK CASCADE on
      // auth.users would also catch these, but explicit is faster to
      // debug).
      if (bookingId) await supabase.from('interview_bookings').delete().eq('id', bookingId)
      await supabase.from('jobs').delete().eq('employer_id', employerId)
      await supabase.auth.admin.deleteUser(candidateId)
      await supabase.auth.admin.deleteUser(employerId)
    }
  })
})
