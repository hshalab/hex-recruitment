import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Reaper: delete auth.users that never confirmed their email after a
// threshold. Without this, abandoned signups accumulate forever and
// (under the old code path) could have held a founding spot. Under the
// new code path the founding row is only written at confirmation, so
// the row-holding risk is gone — but stale unconfirmed auth.users still
// (a) pollute the user list, (b) block re-signup with the same address,
// and (c) leave any orphaned pending employer_profiles rows behind.
//
// Threshold: 72 hours. Long enough that someone on holiday returning to
// the link still works. The cap on founding spots means we can't be
// generous indefinitely — a never-confirming signup mustn't tie up the
// email forever.

export const dynamic = 'force-dynamic'

const REAP_AFTER_HOURS = 72

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(req: NextRequest) {
  // Fail-closed cron auth — refuse if secret missing OR mismatched.
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  if (!supabaseServiceKey) {
    return NextResponse.json({ error: 'service-role key missing' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })

  // Find unconfirmed users older than the threshold. supabase-js's
  // listUsers paginates at 50 by default; the cohort is small but be
  // defensive and walk pages until empty.
  const cutoff = new Date(Date.now() - REAP_AFTER_HOURS * 60 * 60 * 1000)
  const cutoffIso = cutoff.toISOString()

  const toDelete: { id: string; email: string | undefined }[] = []
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users || data.users.length === 0) break
    for (const u of data.users) {
      if (!u.email_confirmed_at && u.created_at && new Date(u.created_at) < cutoff) {
        toDelete.push({ id: u.id, email: u.email })
      }
    }
    if (data.users.length < perPage) break
    page++
    if (page > 50) break // hard safety bound
  }

  let deleted = 0
  for (const u of toDelete) {
    // Clean up orphaned profile rows first (FK is ON DELETE CASCADE for
    // most but not all — be explicit).
    await admin.from('employer_profiles').delete().eq('user_id', u.id)
    await admin.from('employer_subscriptions').delete().eq('user_id', u.id)
    await admin.from('candidate_profiles').delete().eq('user_id', u.id)
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (!error) deleted++
    else console.error('[reap-unconfirmed] delete failed', u.id, error.message)
  }

  return NextResponse.json({
    cutoff: cutoffIso,
    candidates: toDelete.length,
    deleted,
    threshold_hours: REAP_AFTER_HOURS,
  })
}
