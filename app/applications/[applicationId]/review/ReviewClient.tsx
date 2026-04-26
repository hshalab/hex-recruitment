'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ReviewAndSign from '@/components/ReviewAndSign'
import { supabase } from '@/lib/supabase'
import { getSignedStorageUrl } from '@/lib/storageUrl'

interface ReviewClientProps {
  offerId: string
  applicationId: string
  candidateName: string
  company: string
  jobTitle: string
  employerSignatureName: string | null
  offerLetterText: string
  offerLetterUrl: string | null
  /** Called after a successful counter-sign with the new signed PDF path. */
  onAccepted: (newOfferLetterUrl: string) => void
  /** Called when the counter-sign fails because the employer withdrew (HTTP 410). */
  onWithdrawn: () => void
}

/**
 * Hosts ReviewAndSign for the candidate side and POSTs the resulting
 * signature to /api/offers/[offerId]/counter-sign. Maps the API's status
 * codes back to UI state transitions on the parent page.
 */
export default function ReviewClient({
  offerId,
  applicationId,
  candidateName,
  company,
  jobTitle,
  employerSignatureName,
  offerLetterText,
  offerLetterUrl,
  onAccepted,
  onWithdrawn,
}: ReviewClientProps) {
  const router = useRouter()
  const [signerName, setSignerName] = useState(candidateName === 'Candidate' ? '' : candidateName)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownloadCurrent = async () => {
    if (!offerLetterUrl) return
    const signed = await getSignedStorageUrl(offerLetterUrl, 600, true)
    if (!signed) return
    // Same-tab nav so iOS Safari intercepts the attachment header in place
    // (matches the SignedLink fix from earlier this session).
    window.location.href = signed
  }

  const handleSign = async () => {
    if (!signatureDataUrl || !signerName.trim()) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login/employee')
        return
      }
      const res = await fetch(`/api/offers/${offerId}/counter-sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ signatureDataUrl, signerName: signerName.trim() }),
      })

      const body = await res.json().catch(() => ({}))

      if (res.ok) {
        onAccepted(body.offerLetterUrl as string)
        return
      }

      // 409 with alreadySigned=true is idempotent success — show the user
      // the accepted state instead of an error.
      if (res.status === 409 && body.alreadySigned && body.offerLetterUrl) {
        onAccepted(body.offerLetterUrl as string)
        return
      }

      // 410: employer withdrew between page load and submit
      if (res.status === 410) {
        onWithdrawn()
        return
      }

      setError(body.error || 'Counter-sign failed. Please try again.')
    } catch (err) {
      console.error('[counter-sign] request failed:', err)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Context strip — what the candidate is about to sign */}
      <div
        style={{
          padding: '0.875rem 1rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          fontSize: '0.85rem',
          color: '#334155',
        }}
      >
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
          Counter-signing offer for
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
          {jobTitle} <span style={{ fontWeight: 400, color: '#475569' }}>at {company}</span>
        </p>
        {employerSignatureName && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#15803d' }}>
            ✓ Already signed by {employerSignatureName}
          </p>
        )}
      </div>

      <ReviewAndSign
        bodyText={offerLetterText}
        role="candidate"
        subCopy="Read the offer carefully before counter-signing. You can download a copy for your records."
        signerNameLabel="Your full legal name"
        declarationText="I have read and accept the terms of this offer."
        signButtonLabel="Counter-sign offer"
        signerName={signerName}
        onSignerNameChange={setSignerName}
        signatureDataUrl={signatureDataUrl}
        onSignatureChange={setSignatureDataUrl}
        onSign={handleSign}
        onCancel={() => router.push('/applications')}
        submitting={submitting}
        onDownloadPdf={offerLetterUrl ? handleDownloadCurrent : undefined}
      />

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#b91c1c',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
