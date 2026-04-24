'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import SignaturePad from './SignaturePad'
import styles from './SignatureModal.module.css'

// Convert a PNG data URL into a Blob for Supabase Storage upload.
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

interface SignatureModalProps {
  isOpen: boolean
  onClose: () => void
  offerId: string
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateName: string
  employerId: string
  onSuccess: () => void
}

export default function SignatureModal({
  isOpen,
  onClose,
  offerId,
  applicationId,
  jobId,
  jobTitle,
  company,
  candidateName,
  employerId,
  onSuccess,
}: SignatureModalProps) {
  const [signatureName, setSignatureName] = useState('')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSignatureName('')
      setSignatureDataUrl(null)
      setConfirmed(false)
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!signatureName.trim()) {
      setError('Please type your full name')
      return
    }
    if (!signatureDataUrl) {
      setError('Please draw your signature above')
      return
    }
    if (!confirmed) {
      setError('Please confirm the declaration')
      return
    }

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in')
        setSubmitting(false)
        return
      }

      const now = new Date().toISOString()

      // Upload the drawn signature PNG to storage. Path mirrors offer letters
      // so storage policies that gate the "profiles" bucket apply uniformly.
      let signatureImageUrl: string | null = null
      try {
        const blob = dataUrlToBlob(signatureDataUrl)
        const path = `signatures/${session.user.id}/${offerId}-${Date.now()}.png`
        const { error: upErr } = await supabase.storage
          .from('profiles')
          .upload(path, blob, { contentType: 'image/png', upsert: true })
        if (upErr) {
          console.error('Signature upload failed:', upErr)
          setError('Could not upload your signature. Please try again.')
          setSubmitting(false)
          return
        }
        signatureImageUrl = path
      } catch (err) {
        console.error('Signature blob conversion failed:', err)
        setError('Could not process your signature. Please try again.')
        setSubmitting(false)
        return
      }

      // Audit trail data. IP is best-effort from a public echo endpoint;
      // we fall back to null if the fetch fails (still have UA + timestamp).
      let ip: string | null = null
      try {
        const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (typeof data?.ip === 'string') ip = data.ip
        }
      } catch { /* audit IP is best-effort */ }
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null

      // Update job_offers: status -> 'accepted', store signature + audit
      const { error: updateError } = await supabase
        .from('job_offers')
        .update({
          status: 'accepted',
          signature_name: signatureName.trim(),
          signature_timestamp: now,
          signature_image_url: signatureImageUrl,
          signature_ip: ip,
          signature_user_agent: userAgent,
        })
        .eq('id', offerId)

      if (updateError) {
        console.error('Error accepting offer:', updateError)
        setError('Failed to accept offer. Please try again.')
        setSubmitting(false)
        return
      }

      // Notify employer
      await supabase.from('notifications').insert({
        user_id: employerId,
        title: 'Offer Accepted',
        message: `${candidateName} has accepted the offer for ${jobTitle}`,
        type: 'application_status_change',
        read: false,
        related_id: applicationId,
        related_type: 'application',
        link: '/my-jobs',
      })

      // Send email to employer
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'application_status',
          data: { recipientUserId: employerId, status: 'offer_accepted', companyName: company, jobTitle, candidateName },
        }),
      }).catch(() => {})

      // Send acceptance message via conversation
      const senderName = session.user.user_metadata?.full_name || candidateName
      const messageContent = [
        `Hello,`,
        '',
        `I am pleased to accept the offer for the ${jobTitle} position at ${company}.`,
        '',
        `Signed: ${signatureName.trim()}`,
        `Date: ${new Date(now).toLocaleDateString('en-GB')}`,
        '',
        'I look forward to starting. Thank you for this opportunity.',
      ].join('\n')

      // Find existing conversation
      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${employerId}),and(participant_1.eq.${employerId},participant_2.eq.${session.user.id})`)
        .eq('related_job_id', jobId)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            participant_1: session.user.id,
            participant_2: employerId,
            participant_1_name: senderName,
            participant_1_role: 'candidate',
            participant_2_name: company,
            participant_2_role: 'employer',
            participant_2_company: company,
            related_job_id: jobId,
            related_job_title: jobTitle,
            last_message: messageContent,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (convError) {
          console.error('Error creating conversation:', convError)
        } else if (newConv) {
          conversationId = newConv.id
        }
      }

      if (conversationId) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: session.user.id,
          sender_name: senderName,
          sender_role: 'candidate',
          content: messageContent,
          is_read: false,
        })

        if (existingConv) {
          await supabase.from('conversations').update({
            last_message: messageContent,
            last_message_at: new Date().toISOString(),
          }).eq('id', conversationId)
        }
      }

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error signing offer:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Accept Offer & Sign</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.offerSummary}>
          <p><strong>Position:</strong> {jobTitle} at {company}</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Typed Name Input */}
          <div className={styles.formGroup}>
            <label htmlFor="signatureName" className={styles.label}>
              Your full legal name *
            </label>
            <input
              type="text"
              id="signatureName"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder="e.g. Gianna Lorandi"
              className={styles.input}
              autoComplete="off"
            />
          </div>

          {/* Drawn Signature */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Draw your signature *</label>
            <SignaturePad onChange={setSignatureDataUrl} />
          </div>

          {/* Confirmation Checkbox */}
          <div className={styles.confirmationGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className={styles.checkbox}
              />
              <span>I confirm that I accept this job offer and that the signature above is my own, intended to bind me to the terms of this letter.</span>
            </label>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelBtn}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || !confirmed || !signatureName.trim() || !signatureDataUrl}
            >
              {submitting ? 'Signing...' : 'Sign & Accept Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
