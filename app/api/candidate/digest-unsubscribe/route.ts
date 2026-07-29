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

type Status = 'invalid' | 'notfound' | 'already' | 'ok' | 'error'

/** The opt-out itself. Shared so GET and POST cannot drift apart. */
async function optOut(token: string | null): Promise<Status> {
  const verified = token ? verifyDigestUnsubscribeToken(token) : null
  if (!verified) return 'invalid'

  // The preview token in a test send is signed for the all-zero UUID: a real
  // UUID shape that is never a real row, so it lands on 'notfound'.
  if (!UUID_RE.test(verified.userId)) return 'invalid'

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('candidate_profiles')
    .select('user_id, notification_preferences')
    .eq('user_id', verified.userId)
    .maybeSingle()

  if (error) {
    console.error('[digest-unsubscribe] lookup failed', error.message)
    return 'error'
  }
  if (!data) return 'notfound'

  const prefs = normalisePrefs('employee', data.notification_preferences) as CandidatePrefs
  if (!prefs.email.job_digest) return 'already'

  const next: CandidatePrefs = { ...prefs, email: { ...prefs.email, job_digest: false } }
  const { error: writeError } = await supabase
    .from('candidate_profiles')
    .update({ notification_preferences: next, updated_at: new Date().toISOString() })
    .eq('user_id', data.user_id)

  if (writeError) {
    console.error('[digest-unsubscribe] write failed', writeError.message)
    return 'error'
  }

  console.log(`[digest-unsubscribe] ${data.user_id} opted out of the job digest`)
  return 'ok'
}

/** A person clicking the link in the email — redirect them to a page that
 *  tells them what happened. */
export async function GET(req: NextRequest) {
  const base = new URL(req.url)
  const status = await optOut(base.searchParams.get('token'))
  return NextResponse.redirect(new URL(`/digest-unsubscribe?status=${status}`, base.origin))
}

/**
 * ONE-CLICK UNSUBSCRIBE (RFC 8058), for the List-Unsubscribe-Post header.
 *
 * Gmail and Outlook POST here themselves, with no human and no browser, when
 * the recipient uses the provider's own unsubscribe button. That is the whole
 * point of the header: the reader never has to find our footer link.
 *
 * Differences from GET, both required:
 *  - it must answer 2xx, not a redirect. Nothing is following redirects here,
 *    and a 3xx reads as a failure to the provider.
 *  - the token may arrive in the POSTED BODY as well as the query string, so
 *    both are accepted.
 *
 * It deliberately reports 2xx even for an unknown or already-unsubscribed
 * token. The provider is asking "is this person off your list?", and for
 * anything but a genuine server fault the honest answer is yes.
 */
export async function POST(req: NextRequest) {
  const base = new URL(req.url)
  let token = base.searchParams.get('token')

  if (!token) {
    // RFC 8058 sends "List-Unsubscribe=One-Click" as form data; some providers
    // put the whole original URL in there instead. Read the body defensively —
    // a parse failure must not become a 500.
    try {
      const raw = await req.text()
      const fromForm = new URLSearchParams(raw).get('token')
      if (fromForm) token = fromForm
    } catch {
      /* no body, or not form-encoded — the query string was the only chance */
    }
  }

  const status = await optOut(token)
  if (status === 'error') {
    return NextResponse.json({ status }, { status: 500 })
  }
  return NextResponse.json({ status }, { status: 200 })
}
