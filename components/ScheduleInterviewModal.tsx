'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './ScheduleInterviewModal.module.css'

const INTERVIEW_TYPES = [
  { value: 'in-person', label: 'In-Person' },
  { value: 'video',     label: 'Video Call' },
  { value: 'phone',     label: 'Phone Call' },
]

interface ScheduleInterviewModalProps {
  isOpen: boolean
  onClose: () => void
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateId: string
  candidateName: string
  candidateEmail?: string
  jobLocation?: string
  existingInterviewId?: string
  existingMeetingLink?: string
  onSuccess: () => void
}

export default function ScheduleInterviewModal({
  isOpen,
  onClose,
  applicationId,
  jobId,
  jobTitle,
  company,
  candidateId,
  candidateName,
  candidateEmail,
  existingInterviewId,
  existingMeetingLink,
  onSuccess,
}: ScheduleInterviewModalProps) {
  const [interviewDate, setInterviewDate] = useState('')
  const [interviewTime, setInterviewTime] = useState('')
  const [duration, setDuration] = useState(30)
  const [interviewType, setInterviewType] = useState('in-person')
  const [meetingLink, setMeetingLink] = useState(existingMeetingLink || '')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [conflictWarning, setConflictWarning] = useState('')

  const interviewTypeLabel = INTERVIEW_TYPES.find(t => t.value === interviewType)?.label ?? 'In-Person'

  const checkConflict = async (date: string, time: string) => {
    if (!date || !time) { setConflictWarning(''); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: existing } = await supabase
        .from('interviews')
        .select('interview_date, interview_time, candidate_id')
        .eq('employer_id', session.user.id)
        .eq('interview_date', date)
        .in('status', ['scheduled', 'confirmed'])
      if (existing && existing.length > 0) {
        const clash = existing.find(i => i.interview_time === time && i.candidate_id !== candidateId)
        if (clash) {
          setConflictWarning(`⚠️ You already have an interview scheduled at this time on ${date}. You can still proceed but consider rescheduling.`)
        } else {
          setConflictWarning('')
        }
      } else {
        setConflictWarning('')
      }
    } catch { setConflictWarning('') }
  }

  const handleOpenCalendar = () => {
    const title = jobTitle ? `Interview - ${jobTitle}` : 'Interview'
    const details = candidateName ? `Interview with ${candidateName}` : 'Interview'
    const guestParam = candidateEmail ? `&add=${encodeURIComponent(candidateEmail)}` : ''

    let dateParams = ''
    if (interviewDate && interviewTime) {
      const [year, month, day] = interviewDate.split('-').map(Number)
      const [hours, minutes] = interviewTime.split(':').map(Number)
      const start = new Date(year, month - 1, day, hours, minutes, 0)
      const end = new Date(start.getTime() + duration * 60000)
      const pad = (n: number) => String(n).padStart(2, '0')
      const fmt = (d: Date) =>
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
      dateParams = `&dates=${fmt(start)}/${fmt(end)}`
    }

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(title)}` +
      `&details=${encodeURIComponent(details)}` +
      dateParams +
      `&location=${encodeURIComponent(interviewTypeLabel)}` +
      guestParam
    window.open(url, '_blank')
  }

  const handleSubmit = async () => {
    setError('')

    if (!interviewDate || !interviewTime) {
      setError('Please enter the interview date and time')
      return
    }

    setSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in to send interview invites')
        setSubmitting(false)
        return
      }

      const isReschedule = !!existingInterviewId

      // If rescheduling, mark the old interview as rescheduled
      if (isReschedule) {
        const { error: rescheduleError } = await supabase
          .from('interviews')
          .update({ status: 'rescheduled' })
          .eq('id', existingInterviewId)
        if (rescheduleError) console.error('Error marking old interview as rescheduled:', rescheduleError)
      }

      // Update application status to "interviewing"
      await supabase
        .from('job_applications')
        .update({ status: 'interviewing' })
        .eq('id', applicationId)

      // Insert new interview record
      await supabase.from('interviews').insert({
        application_id: applicationId,
        job_id: jobId,
        employer_id: session.user.id,
        candidate_id: candidateId,
        interview_date: interviewDate,
        interview_time: interviewTime,
        duration_minutes: duration,
        interview_type: interviewType,
        location_or_link: interviewTypeLabel,
        meeting_link: interviewType === 'video' ? (meetingLink.trim() || null) : null,
        notes: notes.trim() || null,
        status: 'scheduled',
      })

      // Format date for messages and emails
      const [year, month, day] = interviewDate.split('-').map(Number)
      const formattedDate = new Date(year, month - 1, day).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })

      // Build message content
      let messageContent: string
      let notificationTitle: string
      let notificationMessage: string

      const trimmedMeetingLink = interviewType === 'video' ? meetingLink.trim() : ''

      if (isReschedule) {
        const firstName = candidateName.split(' ')[0]
        const rescheduleLines = [
          `Hi ${firstName}, I wanted to let you know your interview for ${jobTitle} has been rescheduled.`,
          '',
          `Your new interview is on ${formattedDate} at ${interviewTime} (${interviewTypeLabel}).`,
        ]
        if (trimmedMeetingLink) {
          rescheduleLines.push('', `Join the video call here: ${trimmedMeetingLink}`)
        }
        rescheduleLines.push('', 'Please let me know if you have any questions.', '', 'Best regards,', company)
        messageContent = rescheduleLines.join('\n')
        notificationTitle = 'Interview Rescheduled'
        notificationMessage = `${company} has rescheduled your interview for ${jobTitle}. New date: ${formattedDate} at ${interviewTime}.`
      } else {
        const messageLines = [
          `Hello ${candidateName},`,
          '',
          `You've been invited to an interview for the ${jobTitle} position at ${company}.`,
          '',
          `Date: ${formattedDate}`,
          `Time: ${interviewTime}`,
          `Type: ${interviewTypeLabel}`,
        ]
        if (trimmedMeetingLink) {
          messageLines.push('', `Join the video call here: ${trimmedMeetingLink}`)
        }
        if (notes.trim()) {
          messageLines.push('', notes.trim())
        }
        messageLines.push('', 'Best regards,', company)
        messageContent = messageLines.join('\n')
        notificationTitle = 'Interview Invitation'
        notificationMessage = `${company} has invited you for an interview for the ${jobTitle} position on ${formattedDate} at ${interviewTime}.`
      }

      // Send in-app notification
      await supabase.from('notifications').insert({
        user_id: candidateId,
        title: notificationTitle,
        message: notificationMessage,
        type: 'application_update',
        read: false,
        related_id: applicationId,
        related_type: 'application',
        link: '/applications',
      })

      // Send email notification (fire & forget — never block the save)
      if (candidateEmail) {
        if (isReschedule) {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: candidateEmail,
              type: 'interview_rescheduled',
              data: {
                companyName: company,
                jobTitle,
                candidateName,
                date: formattedDate,
                time: interviewTime,
                interviewType: interviewTypeLabel,
                meetingLink: trimmedMeetingLink || undefined,
              },
            }),
          }).catch((err: unknown) => console.error('Error sending reschedule email:', err))
        } else {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: candidateEmail,
              type: 'interview_scheduled',
              data: {
                companyName: company,
                jobTitle,
                date: formattedDate,
                time: interviewTime,
                notes: notes.trim() || undefined,
                meetingLink: trimmedMeetingLink || undefined,
              },
            }),
          }).catch(() => {})
        }
      }

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
          await supabase
            .from('conversations')
            .update({ last_message: messageContent, last_message_at: new Date().toISOString() })
            .eq('id', conversationId)
        }
      }

      onSuccess()

      // Auto-open Google Calendar so employer can add it to their calendar
      if (interviewDate && interviewTime) {
        handleOpenCalendar()
      }

      onClose()
      setInterviewDate('')
      setInterviewTime('')
      setDuration(30)
      setInterviewType('in-person')
      setMeetingLink('')
      setNotes('')
    } catch (err) {
      console.error('Error sending interview invite:', err)
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
          <div>
            <h2 className={styles.title}>{existingInterviewId ? 'Reschedule Interview' : 'Schedule Interview'}</h2>
            <p className={styles.subtitle}>The candidate will be notified instantly by email and in-app message</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.dateTimeRow}>
            <div className={styles.dateTimeField}>
              <label htmlFor="interviewDate" className={styles.fieldLabel}>Date</label>
              <input
                type="date"
                id="interviewDate"
                value={interviewDate}
                onChange={(e) => { setInterviewDate(e.target.value); checkConflict(e.target.value, interviewTime) }}
                className={styles.input}
              />
            </div>
            <div className={styles.dateTimeField}>
              <label htmlFor="interviewTime" className={styles.fieldLabel}>Time</label>
              <input
                type="time"
                id="interviewTime"
                value={interviewTime}
                onChange={(e) => { setInterviewTime(e.target.value); checkConflict(interviewDate, e.target.value) }}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="interviewType" className={styles.fieldLabel}>Interview Type</label>
            <select
              id="interviewType"
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value)}
              className={styles.input}
            >
              {INTERVIEW_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {interviewType === 'video' && (
            <div className={styles.field}>
              <label htmlFor="meetingLink" className={styles.fieldLabel}>
                Meeting link <span className={styles.optional}>(Optional)</span>
              </label>
              <input
                type="url"
                id="meetingLink"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="Paste your Google Meet link here (e.g. https://meet.google.com/xxx-xxxx-xxx)"
                className={styles.input}
              />
              <p className={styles.helperText}>
                Create your Google Calendar event first — it will automatically generate a Meet link. Copy and paste it here.
              </p>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="notes" className={styles.fieldLabel}>
              Additional Notes <span className={styles.optional}>(Optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information for the candidate..."
              rows={3}
              className={styles.textarea}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {conflictWarning && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#856404', marginBottom: '0.75rem' }}>
              {conflictWarning}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            className={styles.sendBtn}
            disabled={submitting}
          >
            {submitting ? 'Sending...' : 'Send Interview Invite'}
          </button>
          <button
            type="button"
            onClick={handleOpenCalendar}
            className={styles.calendarLink}
            disabled={submitting}
          >
            + Add to Google Calendar (optional)
          </button>
        </div>
      </div>
    </div>
  )
}
