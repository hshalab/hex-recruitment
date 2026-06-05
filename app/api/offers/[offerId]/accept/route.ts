import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Candidate plain-accept for offers that carry NO letter/document.
 *
 * The counter-sign route requires a document to stamp the signature onto and
 * returns 400 "Offer has no document to sign" when an offer has neither
 * offer_letter_text nor offer_letter_url. Employers can send an offer without
 * a letter (the letter is optional in MakeOfferModal), which previously left
 * the candidate unable to accept — only Decline. This endpoint closes that gap.
 *
 * Symmetric with the counter-sign flow: it only flips the OFFER to 'accepted'.
 * It does NOT mark the application 'hired' — the employer still confirms the
 * hire via "Confirm Hire" (handleConfirmHire), exactly as for a counter-signed
 * offer. That keeps the two accept paths consistent and keeps the employer in
 * control of the final hire.
 *
 * Guard: this path is ONLY for letter-less offers. An offer that has a letter
 * must go through counter-sign (signature capture), so we 400 here to avoid a
 * bypass of the signing ceremony.
 *
 * Status semantics mirror counter-sign:
 *   - 200: accepted
 *   - 401/404: auth or RLS — indistinguishable to avoid leaking existence
 *   - 409: already accepted (idempotent) OR previously declined
 *   - 410: employer withdrew between page load and submit
 *   - 400: offer has a letter (use counter-sign) / invalid state
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

  // ── Load the offer (scoped to the candidate) ────────
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('job_offers')
    .select('id, status, employer_id, candidate_id, application_id, offer_letter_text, offer_letter_url, jobs(title, company)')
    .eq('id', offerId)
    .eq('candidate_id', user.id)
    .maybeSingle()

  if (fetchErr) {
    console.error('[accept] offer fetch failed:', fetchErr)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
  if (!offer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── This endpoint is only for letter-less offers ────
  if (offer.offer_letter_text || offer.offer_letter_url) {
    return NextResponse.json(
      { error: 'This offer has a letter and must be counter-signed.' },
      { status: 400 },
    )
  }

  // ── Status branching (mirrors counter-sign) ─────────
  if (offer.status === 'accepted') {
    return NextResponse.json({ ok: true, status: 'accepted', alreadyAccepted: true }, { status: 409 })
  }
  if (offer.status === 'withdrawn') {
    return NextResponse.json(
      { error: 'This offer has been withdrawn by the employer.', status: 'withdrawn' },
      { status: 410 },
    )
  }
  if (offer.status === 'declined') {
    return NextResponse.json(
      { error: 'You previously declined this offer.', status: 'declined' },
      { status: 409 },
    )
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({ error: 'Invalid offer state.' }, { status: 400 })
  }

  // ── Flip the offer to accepted ──────────────────────
  // Record the acceptance time via signature_timestamp so the candidate's
  // "You accepted this offer on …" line renders. No signature image/name —
  // there was no document to sign.
  const nowIso = new Date().toISOString()
  const { error: updateErr } = await supabaseAdmin
    .from('job_offers')
    .update({ status: 'accepted', signature_timestamp: nowIso })
    .eq('id', offerId)
    .eq('candidate_id', user.id)

  if (updateErr) {
    console.error('[accept] job_offers update failed:', updateErr)
    return NextResponse.json({ error: 'Failed to update offer status' }, { status: 500 })
  }

  const candidateName = (user.user_metadata as { full_name?: string } | null)?.full_name || 'The candidate'
  const company = (Array.isArray(offer.jobs) ? offer.jobs[0]?.company : (offer.jobs as { company?: string } | null)?.company) || 'The Company'
  const jobTitle = (Array.isArray(offer.jobs) ? offer.jobs[0]?.title : (offer.jobs as { title?: string } | null)?.title) || 'the role'

  // ── Notifications + emails (best-effort) ────────────
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: offer.employer_id,
      title: 'Offer Accepted',
      message: `${candidateName} has accepted the offer for ${jobTitle}`,
      type: 'application_status_change',
      read: false,
      related_id: offer.application_id,
      related_type: 'application',
      link: '/my-jobs',
    })
  } catch (err) {
    console.error('[accept] employer notification insert failed:', err)
  }

  fetch(new URL('/api/email/send', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'application_status',
      data: { recipientUserId: offer.employer_id, status: 'offer_accepted', companyName: company, jobTitle, candidateName },
    }),
  }).catch(err => console.error('[accept] employer email failed:', err))

  return NextResponse.json({ ok: true, status: 'accepted' })
}
