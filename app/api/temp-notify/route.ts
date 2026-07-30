import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { resolveEmployerEmail } from '@/lib/employerEmail'
import { tempInterestEmail, tempCommentEmail } from '@/emails/temp-shift'
import { formatWhen, type TempPost } from '@/lib/tempWork'

/**
 * Email the employer when something happens on their shift.
 *
 * The IN-APP notification is written by a database trigger, so it cannot be
 * skipped by a client that navigates away mid-request. The EMAIL has to be an
 * HTTP call because it needs Resend, and it deliberately mirrors
 * /api/send-application-email: same auth check, same employer address lookup
 * (shared via lib/employerEmail), same "a missing address is not an error"
 * behaviour. An agency should not be able to tell that a shift and a job travel
 * down different paths.
 *
 * Everything here is best-effort by design. A candidate who has already put
 * themselves forward must never see a failure because an email bounced — their
 * row is committed before this is called.
 */
export async function POST(req: Request) {
  try {
    // Same shape as send-application-email: a token, if present, must be valid.
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    if (token) {
      const { data: { user }, error } = await admin.auth.getUser(token)
      if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { kind, postId, actorName, body: commentBody, note } = await req.json()
    if (kind !== 'interest' && kind !== 'comment') {
      return NextResponse.json({ error: 'kind must be interest or comment' }, { status: 400 })
    }
    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

    // Read the post server-side rather than trusting the client for the title,
    // the dates or — most importantly — whose shift it is.
    const { data: post } = await admin
      .from('temp_posts')
      .select('id, employer_id, title, is_ongoing, date_from, date_to, start_time, end_time')
      .eq('id', postId)
      .maybeSingle()
    if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 })

    const to = await resolveEmployerEmail(post.employer_id)
    if (!to) {
      // Not a failure: the in-app notification has already been written by the
      // trigger, so the employer is still told. Reported so a silent gap is
      // visible in the logs rather than inferred later from a complaint.
      console.warn('[temp-notify] no employer address for post', postId)
      return NextResponse.json({ success: true, emailed: false, reason: 'no employer address' })
    }

    const who = (actorName || '').trim() || 'A candidate'
    const when = formatWhen(post as unknown as Pick<TempPost, 'is_ongoing' | 'date_from' | 'date_to' | 'start_time' | 'end_time'>)

    const { subject, html } = kind === 'interest'
      ? tempInterestEmail(who, post.title, when, note)
      : tempCommentEmail(who, post.title, String(commentBody || '').slice(0, 500))

    // sendEmail returns { success, error } — report what actually happened
    // rather than defaulting to true, or a rejected key looks like a clean send.
    // That exact defaulting is how the roundup reported "sent: 0" as a success.
    const result = await sendEmail(to, subject, html)
    return NextResponse.json({ success: true, emailed: result.success, error: result.error })
  } catch (e: any) {
    console.error('[temp-notify] failed:', e?.message)
    // Still 200: the caller's action already succeeded and must not be undone.
    return NextResponse.json({ success: true, emailed: false, reason: 'send failed' })
  }
}
