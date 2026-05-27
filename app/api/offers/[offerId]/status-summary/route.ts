import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Candidate-facing sanitised view of an offer's terminal-state context.
 *
 * The audit log table itself is NOT readable by candidates (RLS denies it).
 * This endpoint reads the most recent audit row server-side and returns
 * only the fields a candidate is allowed to see — never reason_detail
 * (which is forensic-only and may contain language the employer wouldn't
 * say to the candidate's face).
 *
 * Used by /applications/[id]/review when the offer's status is 'withdrawn'
 * or 'rescinded'.
 *
 * Response:
 *   { status, action, terminatedAt, message }
 *
 * 404 if offer doesn't exist or doesn't belong to this candidate (RLS).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm the offer belongs to this candidate
  const { data: offer, error: offerErr } = await supabaseAdmin
    .from('job_offers')
    .select('id, status, candidate_id')
    .eq('id', offerId)
    .eq('candidate_id', user.id)
    .maybeSingle()

  if (offerErr || !offer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // If status isn't terminal (withdrawn/rescinded), there's nothing to summarise
  if (offer.status !== 'withdrawn' && offer.status !== 'rescinded') {
    return NextResponse.json({
      status: offer.status,
      action: null,
      terminatedAt: null,
      message: null,
    })
  }

  // Most recent audit row for this offer (we only ever expect one for v1
  // since rescind/withdraw is terminal, but ordering by created_at is robust)
  const { data: audit, error: auditErr } = await supabaseAdmin
    .from('offer_audit_log')
    .select('action, reason_code, created_at')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (auditErr) {
    console.error('[status-summary] audit fetch failed:', auditErr)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // Map (action, reason_code) → candidate-facing message. reason_detail is
  // never read here.
  const message = sanitisedMessage(audit?.action ?? null, audit?.reason_code ?? null, offer.status)

  return NextResponse.json({
    status: offer.status,
    action: audit?.action ?? null,
    terminatedAt: audit?.created_at ?? null,
    message,
  })
}

function sanitisedMessage(
  action: string | null,
  reasonCode: string | null,
  fallbackStatus: string,
): string {
  if (action === 'withdrawn') {
    return 'The employer has withdrawn this offer. As you had not yet counter-signed, no contract was formed.'
  }
  if (action === 'rescinded_for_condition') {
    switch (reasonCode) {
      case 'failed_rtw':
        return 'This offer was rescinded because the right-to-work check could not be completed satisfactorily.'
      case 'failed_references':
        return 'This offer was rescinded because the reference check could not be completed satisfactorily.'
      case 'failed_dbs':
        return 'This offer was rescinded because the DBS / criminal record check could not be completed satisfactorily.'
      case 'mutual_agreement':
        return 'This offer was rescinded by mutual agreement between you and the employer.'
      case 'other':
      default:
        return 'This offer was rescinded by the employer for a stated pre-employment reason.'
    }
  }
  if (action === 'rescinded_unconditional') {
    // Factual statement only — no advice, no recommended action. Broader
    // guidance ("you may wish to consult a solicitor") lives on the Terms
    // page under Section 5 → "Your rights when an offer changes" so this
    // sanitised message stays neutral and consistent with the platform's
    // "not legal advice" disclaimer.
    return 'This offer was rescinded by the employer. Because you had counter-signed, a binding employment contract had been formed when this happened.'
  }
  // Fallback if status is terminal but we have no audit row (legacy data)
  if (fallbackStatus === 'withdrawn') {
    return 'The employer has withdrawn this offer.'
  }
  return 'This offer was rescinded by the employer.'
}
