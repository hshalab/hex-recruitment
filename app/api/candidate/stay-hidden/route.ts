import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyStayHiddenToken } from '@/lib/stayHiddenToken'
import { parseNotice, markOptedOut, type CandidateNoticeRow } from '@/lib/discoverabilityNotice'

// The one-click opt-out from the discoverability notice. No login: the people
// receiving that email are the disengaged ones, and an opt-out that costs a
// password while the default costs nothing isn't a real choice.
//
// GET is correct here even though it writes. The write direction is the
// conservative one — it preserves the status quo — so a mail client that
// prefetches the link can only ever keep somebody hidden, never expose them.
// It is also idempotent: a second click keeps the first answer.
//
// Does the work, then redirects to /stay-hidden?status=… which renders the
// confirmation, so a refresh doesn't re-run anything.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const base = new URL(req.url)
  const to = (status: string) => NextResponse.redirect(new URL(`/stay-hidden?status=${status}`, base.origin))

  const token = base.searchParams.get('token')
  const verified = token ? verifyStayHiddenToken(token) : null
  if (!verified) return to('invalid')

  // The preview token in a test send is signed for the all-zero UUID, which is
  // a real UUID shape but never a real row — it falls through to 'notfound'.
  if (!UUID_RE.test(verified.userId)) return to('invalid')

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('candidate_profiles')
    .select('user_id, email, full_name, job_title, cv_url, is_discoverable, discoverability_notice')
    .eq('user_id', verified.userId)
    .maybeSingle()

  if (error) {
    // Before the migration lands there is nowhere to record the answer. Say so
    // loudly in the log, and show the honest "we didn't change anything" page
    // rather than a confirmation we can't back up.
    if (error.code === '42703' || /discoverability_notice/.test(error.message || '')) {
      console.error('[stay-hidden] discoverability_notice column missing — cannot record an opt-out')
    } else {
      console.error('[stay-hidden] lookup failed', error.message)
    }
    return to('error')
  }
  if (!data) return to('notfound')

  const row = data as unknown as CandidateNoticeRow
  const current = parseNotice(row.discoverability_notice)
  if (current.optedOutAt) return to('already')

  const next = markOptedOut(current)
  const { error: writeError } = await supabase
    .from('candidate_profiles')
    // Belt and braces: the flip step already refuses on optedOutAt, but
    // writing is_discoverable=false here means the answer holds even if a
    // future caller forgets to check.
    .update({ discoverability_notice: next, is_discoverable: false })
    .eq('user_id', row.user_id)

  if (writeError) {
    console.error('[stay-hidden] write failed', writeError.message)
    return to('error')
  }

  console.log(`[stay-hidden] ${row.user_id} opted out at ${next.optedOutAt}`)
  return to('ok')
}
