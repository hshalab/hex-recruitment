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
  const [offerMode, setOfferMode] = useState<'none' | 'upload' | 'generate'>('none')
  const [sector, setSector] = useState('general')
  const [extras, setExtras] = useState<Set<string>>(new Set())
  const [offerLetterText, setOfferLetterText] = useState('')
  const [generateStep, setGenerateStep] = useState<'idle' | 'edit' | 'review'>('idle')

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
      setGenerating(false)
      setSector('general')
      setExtras(new Set())
      setOfferLetterText('')
      setGenerateStep('idle')
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

  // Sector-specific clauses that AI will auto-include
  const SECTOR_CLAUSES: Record<string, string[]> = {
    hospitality: ['DBS check required', 'Uniform provided', 'Staff meals included', 'Shift pattern may include evenings, weekends and bank holidays', 'Tips/gratuities policy applies'],
    finance: ['Non-compete clause (6 months)', 'Confidentiality and NDA required', 'Bonus structure subject to separate agreement', 'PILON (pay in lieu of notice) at employer discretion'],
    tech: ['IP assignment — all work product belongs to the company', 'Equipment provided (laptop, peripherals)', 'Remote/hybrid working arrangements as agreed', 'Garden leave may apply during notice period', 'Confidentiality and NDA required'],
    education: ['Enhanced DBS check with children\'s barred list required', 'Safeguarding training mandatory before start', 'Subject to Ofsted compliance requirements', 'Term-time working (if applicable)'],
    healthcare: ['Enhanced DBS check required', 'Occupational health clearance required', 'Shift pattern may include nights and weekends', 'Uniform provided', 'Professional registration must be maintained'],
    retail: ['Uniform provided', 'Staff discount applicable', 'Shift pattern may include weekends and bank holidays', 'DBS check may be required'],
    general: [],
  }

  // Extra toggles the employer can add on top of sector defaults
  const EXTRA_OPTIONS = [
    'Probation period (3 months)', 'Probation period (6 months)',
    'Notice period (1 week)', 'Notice period (1 month)', 'Notice period (3 months)',
    'Pension scheme', 'Health insurance', 'Paid training included',
    'Right to work check required', 'References required',
    'Company car', 'Childcare vouchers', 'Training bond',
  ]

  const toggleExtra = (item: string) => {
    setExtras(prev => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })
  }

  const handleGenerateOfferLetter = async () => {
    if (!salary || !startDate) { setError('Enter salary and start date first'); return }
    setGenerating(true)
    setError('')
    try {
      const allClauses = [
        ...(SECTOR_CLAUSES[sector] || []),
        ...Array.from(extras),
        ...(additionalTerms.trim() ? [additionalTerms.trim()] : []),
      ]

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
            sector,
            clausesList: allClauses,
          },
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }

      setOfferLetterText(data.text || '')
      setGenerateStep('edit')
    } catch (err: any) {
      setError(err.message || 'Failed to generate offer letter')
    } finally {
      setGenerating(false)
    }
  }

  const buildPdfFromText = async (text: string): Promise<File> => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
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
    return new File([blob], `Offer-Letter-${candidateName.replace(/\s+/g, '-')}.pdf`, { type: 'application/pdf' })
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

      // In generate mode, require the employer to review the letter first
      if (offerMode === 'generate') {
        if (!offerLetterText.trim()) {
          setError('Please generate or write an offer letter')
          setSubmitting(false)
          return
        }
        if (generateStep !== 'review') {
          setError('Please click "Review Offer Letter" to check it before sending')
          setSubmitting(false)
          return
        }
      }

      // Build PDF from edited text at send-time (generate mode only)
      let generatedFile: File | null = null
      if (offerMode === 'generate' && offerLetterText.trim()) {
        try {
          generatedFile = await buildPdfFromText(offerLetterText)
        } catch (err) {
          console.error('Failed to build PDF:', err)
          setError('Failed to build offer letter PDF')
          setSubmitting(false)
          return
        }
      }
      const fileToUpload = offerLetter || generatedFile

      // Upload offer letter if provided
      let offerLetterUrl: string | null = null
      if (fileToUpload) {
        const fileExt = fileToUpload.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`
        const filePath = `offer-letters/${session.user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('profiles')
          .upload(filePath, fileToUpload, { contentType: fileToUpload.type, upsert: true })

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

            {offerMode === 'none' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => { setOfferMode('generate'); setGenerateStep('idle') }} style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
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

            {offerMode === 'generate' && generateStep === 'idle' && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.875rem' }}>
                {/* Sector dropdown */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Sector</label>
                  <select value={sector} onChange={e => setSector(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', background: '#fff' }}>
                    <option value="general">General</option>
                    <option value="hospitality">Hospitality</option>
                    <option value="finance">Finance</option>
                    <option value="tech">Tech</option>
                    <option value="education">Education</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="retail">Retail</option>
                  </select>
                  {sector !== 'general' && SECTOR_CLAUSES[sector] && (
                    <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.35rem 0 0', lineHeight: 1.4 }}>
                      Auto-includes: {SECTOR_CLAUSES[sector].slice(0, 3).join(' · ')}{SECTOR_CLAUSES[sector].length > 3 ? ` + ${SECTOR_CLAUSES[sector].length - 3} more` : ''}
                    </p>
                  )}
                </div>

                {/* Optional extras — small pill toggles */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>Add extras <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {EXTRA_OPTIONS.map(opt => {
                      const active = extras.has(opt)
                      return (
                        <button key={opt} type="button" onClick={() => toggleExtra(opt)}
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', borderRadius: 99, border: active ? '1px solid #0f172a' : '1px solid #e2e8f0', background: active ? '#0f172a' : '#fff', color: active ? '#FFE500' : '#64748b', cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
                          {active ? '✓ ' : ''}{opt}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button type="button" onClick={handleGenerateOfferLetter} disabled={generating || !salary}
                  style={{ width: '100%', padding: '0.625rem', background: generating ? '#94a3b8' : '#0f172a', color: '#FFE500', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: generating ? 'not-allowed' : 'pointer' }}>
                  {generating ? 'Generating...' : '✨ Generate Offer Letter'}
                </button>

                <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.5rem 0 0', textAlign: 'center' }}>
                  or <button type="button" onClick={() => { setOfferLetterText(''); setGenerateStep('edit') }} style={{ color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.7rem', padding: 0 }}>write it yourself</button>
                </p>

                <button type="button" onClick={() => { setOfferMode('none'); setOfferLetterText(''); setGenerateStep('idle') }} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.375rem' }}>Cancel</button>
              </div>
            )}

            {offerMode === 'generate' && generateStep === 'edit' && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>Offer Letter — Edit</label>
                  <button type="button" onClick={handleGenerateOfferLetter} disabled={generating || !salary}
                    style={{ fontSize: '0.72rem', color: '#0369a1', background: 'none', border: 'none', cursor: generating ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}>
                    {generating ? 'Regenerating...' : '↻ Regenerate with AI'}
                  </button>
                </div>
                <textarea
                  value={offerLetterText}
                  onChange={(e) => setOfferLetterText(e.target.value)}
                  placeholder="Write your offer letter here, or generate one with AI..."
                  rows={14}
                  style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.5rem 0 0.75rem', lineHeight: 1.4 }}>
                  Tip: replace any <code style={{ background: '#f1f5f9', padding: '0 0.25rem', borderRadius: 3 }}>[Address Line 1]</code> / <code style={{ background: '#f1f5f9', padding: '0 0.25rem', borderRadius: 3 }}>[City]</code> placeholders with the candidate's details.
                </p>
                <button type="button" onClick={() => setGenerateStep('review')} disabled={!offerLetterText.trim()}
                  style={{ width: '100%', padding: '0.625rem', background: !offerLetterText.trim() ? '#94a3b8' : '#0f172a', color: '#FFE500', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: !offerLetterText.trim() ? 'not-allowed' : 'pointer' }}>
                  Review Offer Letter →
                </button>
                <button type="button" onClick={() => { setOfferMode('none'); setOfferLetterText(''); setGenerateStep('idle') }} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', marginTop: '0.375rem' }}>Cancel</button>
              </div>
            )}

            {offerMode === 'generate' && generateStep === 'review' && (
              <div style={{ border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.875rem', background: '#f0fdf4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#15803d' }}>✓ Review — this is what the candidate will receive</label>
                  <button type="button" onClick={() => setGenerateStep('edit')}
                    style={{ fontSize: '0.72rem', color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    ← Back to edit
                  </button>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.875rem', maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', fontSize: '0.85rem', lineHeight: 1.6, color: '#1e293b' }}>
                  {offerLetterText}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#15803d', margin: '0.625rem 0 0', fontWeight: 500 }}>
                  Looks good? Click <strong>Send Offer</strong> below to deliver it to {candidateName}.
                </p>
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
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || (offerMode === 'generate' && generateStep !== 'review')}
              title={offerMode === 'generate' && generateStep !== 'review' ? 'Click "Review Offer Letter" above first' : undefined}
            >
              {submitting ? 'Sending Offer...' : 'Send Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
