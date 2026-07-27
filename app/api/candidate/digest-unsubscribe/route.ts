import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyDigestUnsubscribeToken } from '@/lib/jobDigestToken'
import { normalisePrefs, type CandidatePrefs } from '@/lib/notificationPrefs'

// One-click unsubscribe from the "new jobs in your areas" digest. No login —
// see lib/jobDigestToken.ts for why.
//
// GET is correct here even though it writes: the write direction is the
// conservative one (it stops email), so a mail client that prefetches the link
// can only ever reduce what we send, never start sending. Idempotent — a second
// click leaves the first answer in place.
//
// Writes ONLY email.job_digest, through normalisePrefs, so the rest of the
// candidate's preferences survive untouched. This is the same canonical shape
// /settings/notifications reads and writes, which is what finally makes that
// page's "Job digest" toggle control something real.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const base = new URL(req.url)
  const to = (status: string) => NextResponse.redirect(new URL(`/digest-unsubscribe?status=${status}`, base.origin))

  const token = base.searchParams.get('token')
  const verified = token ? verifyDigestUnsubscribeToken(token) : null
  if (!verified) return to('invalid')

  // The preview token in a test send is signed for the all-zero UUID: a real
  // UUID shape that is never a real row, so it lands on 'notfound'.
  if (!UUID_RE.test(verified.userId)) return to('invalid')

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('candidate_profiles')
    .select('user_id, notification_preferences')
    .eq('user_id', verified.userId)
    .maybeSingle()

  if (error) {
    console.error('[digest-unsubscribe] lookup failed', error.message)
    return to('error')
  }
  if (!data) return to('notfound')

  const prefs = normalisePrefs('employee', data.notification_preferences) as CandidatePrefs
  if (!prefs.email.job_digest) return to('already')

  const next: CandidatePrefs = { ...prefs, email: { ...prefs.email, job_digest: false } }
  const { error: writeError } = await supabase
    .from('candidate_profiles')
    .update({ notification_preferences: next, updated_at: new Date().toISOString() })
    .eq('user_id', data.user_id)

  if (writeError) {
    console.error('[digest-unsubscribe] write failed', writeError.message)
    return to('error')
  }

  console.log(`[digest-unsubscribe] ${data.user_id} opted out of the job digest`)
  return to('ok')
}
