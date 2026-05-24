import { NextRequest, NextResponse } from 'next/server'
import { isOfferConditional } from '@/lib/offerConditional'

import { supabaseAdmin } from '@/lib/supabase-admin'

type Action = 'withdrawn' | 'rescinded_for_condition' | 'rescinded_unconditional'
type ReasonCode = 'failed_rtw' | 'failed_references' | 'failed_dbs' | 'mutual_agreement' | 'other'

const VALID_ACTIONS = new Set<Action>([
  'withdrawn', 'rescinded_for_condition', 'rescinded_unconditional',
])
const VALID_REASON_CODES = new Set<ReasonCode>([
  'failed_rtw', 'failed_references', 'failed_dbs', 'mutual_agreement', 'other',
])

/**
 * Employer terminates an offer — withdraws (pre-counter-sign) or rescinds
 * (post-counter-sign, with stated condition or unconditionally).
 *
 * Request body:
 *   { action, reasonCode?, reasonDetail? }
 *
 * Strict audit-first ordering:
 *   1. INSERT into offer_audit_log     ← if this fails: 500, nothing changed
 *   2. UPDATE job_offers status        ← if this fails: 500, audit row exists
 *                                        but candidate-visible state unchanged
 *                                        (recoverable; no false-positive view)
 *   3. notifications insert + email    ← best-effort, errors don't fail the call
 *
 * The action/scenario combination is validated against current status:
 *   - status='pending'  → only 'withdrawn' is valid
 *   - status='accepted' → 'rescinded_for_condition' or 'rescinded_unconditional'
 *   - any other status  → 409 (already terminal)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params

  // ── Auth ────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse body ──────────────────────────────────────
  let body: { action?: string; reasonCode?: string | null; reasonDetail?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const action = body.action as Action | undefined
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  const reasonCode = body.reasonCode == null ? null : (body.reasonCode as ReasonCode)
  if (reasonCode !== null && !VALID_REASON_CODES.has(reasonCode)) {
    return NextResponse.json({ error: 'Invalid reason code' }, { status: 400 })
  }
  const reasonDetail = (body.reasonDetail || '').toString().slice(0, 500).trim() || null

  // ── Load offer (scoped to employer) ─────────────────
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('job_offers')
    .select('id, status, employer_id, candidate_id, application_id, offer_letter_text, jobs(title, company)')
    .eq('id', offerId)
    .eq('employer_id', user.id)
    .maybeSingle()

  if (fetchErr) {
    console.error('[withdraw] offer fetch failed:', fetchErr)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
  if (!offer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Validate action against current status ──────────
  const currentStatus = offer.status as 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'rescinded'
  if (currentStatus === 'declined' || currentStatus === 'withdrawn' || currentStatus === 'rescinded') {
    return NextResponse.json(
      { error: `Offer is already ${currentStatus}; no further action allowed.`, status: currentStatus },
      { status: 409 },
    )
  }
  if (currentStatus === 'pending' && action !== 'withdrawn') {
    return NextResponse.json(
      { error: 'Use action=withdrawn for offers that have not been counter-signed.' },
      { status: 400 },
    )
  }
  if (currentStatus === 'accepted' && action === 'withdrawn') {
    return NextResponse.json(
      { error: 'Use a rescind action for offers that have been counter-signed.' },
      { status: 400 },
    )
  }

  // For rescind_for_condition, reasonCode is required. For 'other', reasonDetail
  // is required. For rescind_unconditional, reasonDetail is required.
  if (action === 'rescinded_for_condition') {
    if (!reasonCode) {
      return NextResponse.json({ error: 'reasonCode required for rescind_for_condition' }, { status: 400 })
    }
    if (reasonCode === 'other' && !reasonDetail) {
      return NextResponse.json({ error: 'reasonDetail required when reasonCode=other' }, { status: 400 })
    }
  }
  if (action === 'rescinded_unconditional') {
    if (!reasonDetail) {
      return NextResponse.json({ error: 'reasonDetail required for rescind_unconditional' }, { status: 400 })
    }
    // Server-side belt-and-suspenders: if the offer text actually does contain
    // pre-employment conditions, reject the unconditional path. Forces the
    // employer back to the conditional flow.
    if (isOfferConditional(offer.offer_letter_text)) {
      return NextResponse.json(
        {
          error: 'Offer letter contains pre-employment conditions; use rescinded_for_condition instead.',
        },
        { status: 400 },
      )
    }
  }

  // ── Audit triple captured server-side ───────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null
  const userAgent = req.headers.get('user-agent') || null

  // ── 1. Audit log INSERT (must succeed before status flips) ──
  const { error: auditErr } = await supabaseAdmin
    .from('offer_audit_log')
    .insert({
      offer_id: offerId,
      action,
      actor_user_id: user.id,
      actor_role: 'employer',
      status_at_action: currentStatus,
      reason_code: action === 'rescinded_for_condition' ? reasonCode : null,
      reason_detail: action === 'rescinded_unconditional'
        ? reasonDetail
        : (action === 'rescinded_for_condition' && reasonCode === 'other' ? reasonDetail : null),
      ip,
      user_agent: userAgent,
      // schema_version defaults to 1
    })

  if (auditErr) {
    console.error('[withdraw] audit log insert failed; aborting:', auditErr)
    return NextResponse.json({ error: 'Could not write audit log; action aborted.' }, { status: 500 })
  }

  // ── 2. Status update on job_offers ──────────────────
  const newStatus: 'withdrawn' | 'rescinded' = action === 'withdrawn' ? 'withdrawn' : 'rescinded'
  const { error: updateErr } = await supabaseAdmin
    .from('job_offers')
    .update({ status: newStatus })
    .eq('id', offerId)
    .eq('employer_id', user.id)

  if (updateErr) {
    console.error('[withdraw] status update failed AFTER audit row written:', updateErr)
    // Audit row is in place but status didn't flip. Don't notify the candidate
    // — their view is still unchanged. Surface error to employer; recovery is
    // a manual DB fix or retry.
    return NextResponse.json(
      { error: 'Audit log written but status update failed. Try again or contact support.' },
      { status: 500 },
    )
  }

  // ── 3. Notify candidate (best-effort; doesn't fail the call) ──
  const jobTitle = (Array.isArray(offer.jobs) ? offer.jobs[0]?.title : (offer.jobs as { title?: string } | null)?.title) || 'the role'
  const company = (Array.isArray(offer.jobs) ? offer.jobs[0]?.company : (offer.jobs as { company?: string } | null)?.company) || 'the employer'

  const candidateMsg = action === 'withdrawn'
    ? `${company} has withdrawn the offer for ${jobTitle}.`
    : `${company} has rescinded the offer for ${jobTitle}. Open the offer for details.`

  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: offer.candidate_id,
      title: action === 'withdrawn' ? 'Offer withdrawn' : 'Offer rescinded',
      message: candidateMsg,
      type: 'application_status_change',
      read: false,
      related_id: offer.application_id,
      related_type: 'application',
      link: `/applications/${offer.application_id}/review`,
    })
  } catch (err) {
    console.error('[withdraw] candidate notification insert failed (non-fatal):', err)
  }

  // Email is best-effort and async — don't block the response. applicationId
  // is threaded so the email template can build a /applications/[id]/review
  // URL that's auth-gated and generates a fresh signed URL on demand.
  fetch(new URL('/api/email/send', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'application_status',
      data: {
        recipientUserId: offer.candidate_id,
        status: action === 'withdrawn' ? 'offer_withdrawn' : 'offer_rescinded',
        companyName: company,
        jobTitle,
        applicationId: offer.application_id,
      },
    }),
  }).catch(err => console.error('[withdraw] candidate email failed (non-fatal):', err))

  return NextResponse.json({ ok: true, action, status: newStatus })
}
