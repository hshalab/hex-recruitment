'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './MakeOfferModal.module.css'

interface MakeOfferModalProps {
  isOpen: boolean
  onClose: () => void
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateId: string
  candidateName: string
  candidateEmail?: string
  onSuccess: () => void
}

export default function MakeOfferModal({
  isOpen,
  onClose,
  applicationId,
  jobId,
  jobTitle,
  company,
  candidateId,
  candidateName,
  candidateEmail,
  onSuccess,
}: MakeOfferModalProps) {
  const [salary, setSalary] = useState('')
  const [startDate, setStartDate] = useState('')
  const [contractType, setContractType] = useState('full-time')
  const [additionalTerms, setAdditionalTerms] = useState('')
  const [offerLetter, setOfferLetter] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedPdf, setGeneratedPdf] = useState<Blob | null>(null)
  const [offerMode, setOfferMode] = useState<'none' | 'upload' | 'generate'>('none')
  const [clauses, setClauses] = useState<Record<string, string | boolean>>({
    probation: '',
    noticePeriod: '',
    workingHours: '',
    holiday: '',
    dbsCheck: false,
    uniformProvided: false,
    pension: false,
  })

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const twoWeeks = new Date()
      twoWeeks.setDate(twoWeeks.getDate() + 14)
      setStartDate(twoWeeks.toISOString().split('T')[0])
      setSalary('')
      setContractType('full-time')
      setAdditionalTerms('')
      setOfferLetter(null)
      setError('')
      setOfferMode('none')
      setGeneratedPdf(null)
      setGenerating(false)
      setClauses({ probation: '', noticePeriod: '', workingHours: '', holiday: '', dbsCheck: false, uniformProvided: false, pension: false })
    }
  }, [isOpen])

  const contractTypes = [
    { value: 'full-time', label: 'Full-time' },
    { value: 'part-time', label: 'Part-time' },
    { value: 'temporary', label: 'Temporary' },
    { value: 'fixed-term', label: 'Fixed-term' },
    { value: 'zero-hours', label: 'Zero-hours' },
    { value: 'casual', label: 'Casual' },
  ]

  const handleGenerateOfferLetter = async () => {
    if (!salary || !startDate) { setError('Enter salary and start date first'); return }
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          type: 'offer-letter',
          data: {
            candidateName, company, jobTitle, salary, startDate, contractType, additionalTerms,
            clauses,
          },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }

      // Build PDF from returned text using jsPDF
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      const text = data.text || ''
      const margin = 20
      const pageWidth = doc.internal.pageSize.getWidth() - margin * 2
      doc.setFontSize(11)
      const lines = doc.splitTextToSize(text, pageWidth)
      let y = margin
      for (const line of lines) {
        if (y > 270) { doc.addPage(); y = margin }
        doc.text(line, margin, y)
        y += 6
      }
      const blob = doc.output('blob')
      setGeneratedPdf(blob)
      setOfferLetter(new File([blob], `Offer-Letter-${candidateName.replace(/\s+/g, '-')}.pdf`, { type: 'application/pdf' }))
    } catch (err: any) {
      setError(err.message || 'Failed to generate offer letter')
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in to make offers')
        setSubmitting(false)
        return
      }

      if (!salary.trim()) {
        setError('Please enter a salary')
        setSubmitting(false)
        return
      }

      if (!startDate) {
        setError('Please select a start date')
        setSubmitting(false)
        return
      }

      // Upload offer letter if provided
      let offerLetterUrl: string | null = null
      if (offerLetter) {
        const fileExt = offerLetter.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`
        const filePath = `offer-letters/${session.user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('profiles')
          .upload(filePath, offerLetter, { contentType: offerLetter.type, upsert: true })

        if (uploadError) {
          console.error('Error uploading offer letter:', uploadError)
          setError('Failed to upload offer letter. Please try again.')
          setSubmitting(false)
          return
        }

        // Store the path — signed URLs generated at render time
        offerLetterUrl = filePath
      }

      // Create job_offers record
      const { error: insertError } = await supabase
        .from('job_offers')
        .insert({
          application_id: applicationId,
          job_id: jobId,
          employer_id: session.user.id,
          candidate_id: candidateId,
          salary: salary.trim(),
          start_date: startDate,
          contract_type: contractType,
          additional_terms: additionalTerms.trim() || null,
          offer_letter_url: offerLetterUrl,
          status: 'pending',
        })

      if (insertError) {
        console.error('Error creating offer:', insertError)
        setError('Failed to create offer. Please try again.')
        setSubmitting(false)
        return
      }

      // Update application status to 'offered'
      await supabase
        .from('job_applications')
        .update({ status: 'offered' })
        .eq('id', applicationId)

      // Send notification to candidate
      const formattedDate = new Date(startDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      await supabase.from('notifications').insert({
        user_id: candidateId,
        title: 'Job Offer Received',
        message: `${company} has sent you a job offer for the ${jobTitle} position starting ${formattedDate}`,
        type: 'application_update',
        read: false,
        related_id: applicationId,
        related_type: 'application',
        link: '/applications',
      })

      // Send email to candidate
      if (candidateEmail) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: candidateEmail,
            type: 'application_status',
            data: { status: 'offered', companyName: company, jobTitle },
          }),
        }).catch(() => {})
      }

      // Send message via conversation
      const contractLabel = contractTypes.find(c => c.value === contractType)?.label || contractType
      const messageContent = [
        `Hello ${candidateName},`,
        '',
        `We are pleased to offer you the position of ${jobTitle} at ${company}.`,
        '',
        'Offer Details:',
        `Salary: ${salary.trim()}`,
        `Start Date: ${formattedDate}`,
        `Contract Type: ${contractLabel}`,
        ...(additionalTerms.trim() ? ['', `Additional Terms: ${additionalTerms.trim()}`] : []),
        ...(offerLetterUrl ? ['', `Offer Letter: ${offerLetterUrl}`] : []),
        '',
        'Please review the offer and respond via your Applications page.',
        '',
        'Best regards,',
        company,
      ].join('\n')

      // Find or create conversation
      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${candidateId}),and(participant_1.eq.${candidateId},participant_2.eq.${session.user.id})`)
        .eq('related_job_id', jobId)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            participant_1: session.user.id,
            participant_2: candidateId,
            participant_1_name: company,
            participant_1_role: 'employer',
            participant_1_company: company,
            participant_2_name: candidateName,
            participant_2_role: 'candidate',
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
          sender_name: company,
          sender_role: 'employer',
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
      console.error('Error making offer:', err)
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
          <h2 className={styles.title}>Make Job Offer</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.candidateInfo}>
          <p className={styles.candidateName}>
            <strong>Candidate:</strong> {candidateName}
          </p>
          <p className={styles.jobInfo}>
            <strong>Position:</strong> {jobTitle} at {company}
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Salary */}
          <div className={styles.formGroup}>
            <label htmlFor="salary" className={styles.label}>
              Annual Salary / Hourly Rate *
            </label>
            <input
              type="text"
              id="salary"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 28,000 per annum or 12.50 per hour"
              className={styles.input}
              required
            />
          </div>

          {/* Start Date */}
          <div className={styles.formGroup}>
            <label htmlFor="startDate" className={styles.label}>
              Proposed Start Date *
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className={styles.input}
              required
            />
          </div>

          {/* Contract Type */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Contract Type *</label>
            <div className={styles.radioGroup}>
              {contractTypes.map((ct) => (
                <label key={ct.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="contractType"
                    value={ct.value}
                    checked={contractType === ct.value}
                    onChange={(e) => setContractType(e.target.value)}
                    className={styles.radio}
                  />
                  <span>{ct.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Offer Letter */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Offer Letter (Optional)</label>

            {offerMode === 'none' && !generatedPdf && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setOfferMode('generate')} style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                  ✨ Generate with AI
                </button>
                <button type="button" onClick={() => setOfferMode('upload')} style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
                  📎 Upload your own
                </button>
              </div>
            )}

            {offerMode === 'upload' && (
              <div className={styles.fileUpload}>
                <input type="file" id="offerLetter" accept=".pdf,.doc,.docx" onChange={(e) => setOfferLetter(e.target.files?.[0] || null)} className={styles.fileInput} />
                <span className={styles.fileUploadLabel}><strong>Click to upload</strong> PDF, DOC, or DOCX</span>
                {offerLetter && <p className={styles.fileName}>{offerLetter.name}</p>}
                <button type="button" onClick={() => { setOfferMode('none'); setOfferLetter(null) }} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.25rem' }}>Cancel</button>
              </div>
            )}

            {offerMode === 'generate' && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.875rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.75rem' }}>Select clauses to include — AI will write a formal offer letter.</p>

                {/* Quick toggle chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.75rem' }}>
                  {[
                    { key: 'probation', label: 'Probation', options: ['3 months', '6 months'] },
                    { key: 'noticePeriod', label: 'Notice', options: ['1 week', '1 month', '3 months'] },
                    { key: 'workingHours', label: 'Hours', options: ['40hrs/week', '37.5hrs/week', '20hrs/week'] },
                    { key: 'holiday', label: 'Holiday', options: ['28 days', '25 days + bank hols', '20 days + bank hols'] },
                  ].map(({ key, label, options }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, minWidth: 55 }}>{label}:</span>
                      {options.map(opt => {
                        const active = clauses[key] === opt
                        return (
                          <button key={opt} type="button" onClick={() => setClauses(prev => ({ ...prev, [key]: active ? '' : opt }))}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', borderRadius: 99, border: active ? '1px solid #0f172a' : '1px solid #d1d5db', background: active ? '#0f172a' : '#fff', color: active ? '#FFE500' : '#334155', cursor: 'pointer', fontWeight: active ? 600 : 400 }}>
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {/* Boolean toggles */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.75rem' }}>
                  {[
                    { key: 'pension', label: 'Pension' },
                    { key: 'dbsCheck', label: 'DBS check required' },
                    { key: 'uniformProvided', label: 'Uniform provided' },
                  ].map(({ key, label }) => {
                    const active = !!clauses[key]
                    return (
                      <button key={key} type="button" onClick={() => setClauses(prev => ({ ...prev, [key]: !prev[key] }))}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: 99, border: active ? '1px solid #16a34a' : '1px solid #d1d5db', background: active ? '#f0fdf4' : '#fff', color: active ? '#15803d' : '#64748b', cursor: 'pointer', fontWeight: active ? 600 : 400 }}>
                        {active ? '✓ ' : ''}{label}
                      </button>
                    )
                  })}
                </div>

                <button type="button" onClick={handleGenerateOfferLetter} disabled={generating || !salary}
                  style={{ width: '100%', padding: '0.625rem', background: generating ? '#94a3b8' : '#0f172a', color: '#FFE500', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: generating ? 'not-allowed' : 'pointer' }}>
                  {generating ? 'Generating...' : '✨ Generate Offer Letter'}
                </button>

                {generatedPdf && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 500 }}>✓ Offer letter generated</span>
                    <button type="button" onClick={() => { const url = URL.createObjectURL(generatedPdf); window.open(url) }} style={{ fontSize: '0.75rem', color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Preview</button>
                  </div>
                )}

                <button type="button" onClick={() => { setOfferMode('none'); setGeneratedPdf(null); setOfferLetter(null) }} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.375rem' }}>Cancel</button>
              </div>
            )}
          </div>

          {/* Additional Terms */}
          <div className={styles.formGroup}>
            <label htmlFor="additionalTerms" className={styles.label}>
              Additional Terms (Optional)
            </label>
            <textarea
              id="additionalTerms"
              value={additionalTerms}
              onChange={(e) => setAdditionalTerms(e.target.value)}
              placeholder="Any additional terms, benefits, or conditions..."
              rows={4}
              className={styles.textarea}
            />
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
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Sending Offer...' : 'Send Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
