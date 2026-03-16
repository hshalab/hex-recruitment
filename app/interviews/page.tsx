'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

interface InterviewItem {
  interviewId: string
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  candidateId: string
  candidateName: string
  candidatePhoto: string | null
  candidateEmail: string
  candidatePhone: string | null
  interviewDate: string
  interviewTime: string
  interviewType: string
  durationMinutes: number
  locationOrLink: string | null
  notes: string | null
  status: string
}

const TYPE_LABELS: Record<string, string> = {
  'in-person': 'In-Person',
  'video': 'Video Call',
  'phone': 'Phone Call',
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  'in-person': styles.typeInPerson,
  'video': styles.typeVideo,
  'phone': styles.typePhone,
}

// Sends a Hex message to a candidate, finding or creating a conversation
async function sendHexMessage(params: {
  senderId: string
  senderName: string
  recipientId: string
  recipientName: string
  jobId: string
  jobTitle: string
  content: string
}) {
  const { senderId, senderName, recipientId, recipientName, jobId, jobTitle, content } = params
  try {
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${senderId},participant_2.eq.${recipientId}),and(participant_1.eq.${recipientId},participant_2.eq.${senderId})`)
      .eq('related_job_id', jobId)
      .maybeSingle()

    let conversationId = existingConv?.id || null

    if (!conversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          participant_1: senderId,
          participant_2: recipientId,
          participant_1_name: senderName,
          participant_1_role: 'employer',
          participant_1_company: senderName,
          participant_2_name: recipientName,
          participant_2_role: 'candidate',
          related_job_id: jobId,
          related_job_title: jobTitle,
          last_message: content,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single()
      conversationId = newConv?.id || null
    }

    if (conversationId) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: senderId,
        sender_name: senderName,
        sender_role: 'employer',
        content,
        is_read: false,
      })
      if (existingConv) {
        await supabase
          .from('conversations')
          .update({ last_message: content, last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
      }
    }
  } catch (err) {
    console.error('Error sending Hex message:', err)
  }
}

export default function InterviewsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [employerId, setEmployerId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [upcoming, setUpcoming] = useState<InterviewItem[]>([])
  const [past, setPast] = useState<InterviewItem[]>([])
  const [pastExpanded, setPastExpanded] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<InterviewItem | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [followUpId, setFollowUpId] = useState<string | null>(null)
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})

  useEffect(() => { loadInterviews() }, [])

  const loadInterviews = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login')
      return
    }
    const eid = session.user.id
    setEmployerId(eid)

    // Fetch company name from employer profile
    const { data: empProfile } = await supabase
      .from('employer_profiles')
      .select('company_name')
      .eq('user_id', eid)
      .maybeSingle()
    const cName = empProfile?.company_name || 'Company'
    setCompanyName(cName)

    const { data: interviews } = await supabase
      .from('interviews')
      .select('*')
      .eq('employer_id', eid)
      .order('interview_date', { ascending: true })
      .order('interview_time', { ascending: true })

    if (!interviews || interviews.length === 0) {
      setLoading(false)
      return
    }

    const candidateIds = Array.from(new Set(interviews.map((i: any) => i.candidate_id as string)))
    const jobIds = Array.from(new Set(interviews.map((i: any) => i.job_id as string)))

    const [{ data: profiles }, { data: jobs }] = await Promise.all([
      supabase
        .from('candidate_profiles')
        .select('user_id, full_name, profile_picture_url, email, phone')
        .in('user_id', candidateIds),
      supabase
        .from('jobs')
        .select('id, title, company')
        .in('id', jobIds),
    ])

    const profileMap: Record<string, any> = {}
    if (profiles) profiles.forEach((p: any) => { profileMap[p.user_id] = p })
    const jobMap: Record<string, any> = {}
    if (jobs) jobs.forEach((j: any) => { jobMap[j.id] = j })

    const mapped: InterviewItem[] = interviews.map((i: any) => {
      const profile = profileMap[i.candidate_id]
      const job = jobMap[i.job_id]
      return {
        interviewId: i.id,
        applicationId: i.application_id,
        jobId: i.job_id,
        jobTitle: job?.title || 'Unknown Role',
        company: job?.company || cName,
        candidateId: i.candidate_id,
        candidateName: profile?.full_name || 'Candidate',
        candidatePhoto: profile?.profile_picture_url || null,
        candidateEmail: profile?.email || '',
        candidatePhone: profile?.phone || null,
        interviewDate: i.interview_date,
        interviewTime: i.interview_time,
        interviewType: i.interview_type,
        durationMinutes: i.duration_minutes,
        locationOrLink: i.location_or_link || null,
        notes: i.notes || null,
        status: i.status,
      }
    })

    // Seed local notes from fetched data
    const notesInit: Record<string, string> = {}
    mapped.forEach(i => { notesInit[i.interviewId] = i.notes || '' })
    setLocalNotes(notesInit)

    const upcomingItems = mapped.filter(i => ['scheduled', 'confirmed'].includes(i.status))
    const pastItems = mapped
      .filter(i => ['completed', 'cancelled', 'rescheduled'].includes(i.status))
      .sort((a, b) => b.interviewDate.localeCompare(a.interviewDate))

    setUpcoming(upcomingItems)
    setPast(pastItems)
    setLoading(false)
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const formatGroupHeader = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const long = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    if (date.getTime() === today.getTime()) return `Today — ${long}`
    if (date.getTime() === tomorrow.getTime()) return `Tomorrow — ${long}`
    return long
  }

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const h = hours % 12 || 12
    return `${h}:${String(minutes).padStart(2, '0')} ${ampm}`
  }

  const formatCardDate = (dateStr: string, timeStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const dayStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    return `${dayStr} at ${formatTime(timeStr)}`
  }

  const formatLongDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  const isPastDateTime = (dateStr: string, timeStr: string) => {
    const [y, mo, d] = dateStr.split('-').map(Number)
    const [h, mi] = timeStr.split(':').map(Number)
    return new Date(y, mo - 1, d, h, mi) < new Date()
  }

  const buildCalendarUrl = (interview: InterviewItem) => {
    const [year, month, day] = interview.interviewDate.split('-').map(Number)
    const [hours, minutes] = interview.interviewTime.split(':').map(Number)
    const start = new Date(year, month - 1, day, hours, minutes, 0)
    const end = new Date(start.getTime() + interview.durationMinutes * 60000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
    return (
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(`Interview - ${interview.jobTitle}`)}` +
      `&details=${encodeURIComponent(`Interview with ${interview.candidateName} for ${interview.jobTitle}`)}` +
      `&dates=${fmt(start)}/${fmt(end)}` +
      `&location=${encodeURIComponent(TYPE_LABELS[interview.interviewType] || interview.interviewType)}`
    )
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleConfirmInterview = async (interview: InterviewItem) => {
    setConfirmingId(interview.interviewId)
    try {
      await supabase
        .from('interviews')
        .update({ status: 'confirmed' })
        .eq('id', interview.interviewId)

      const formattedDate = formatLongDate(interview.interviewDate)
      const formattedTime = formatTime(interview.interviewTime)

      // In-app notification
      const { error: notifConfirmErr } = await supabase.from('notifications').insert({
        user_id: interview.candidateId,
        title: 'Interview Confirmed',
        message: `Your interview for ${interview.jobTitle} at ${companyName} has been confirmed for ${formattedDate} at ${formattedTime}.`,
        type: 'application_update',
        read: false,
        related_id: interview.applicationId,
        related_type: 'application',
      })
      if (notifConfirmErr) console.error('Notification error:', notifConfirmErr)

      // Hex message
      await sendHexMessage({
        senderId: employerId,
        senderName: companyName,
        recipientId: interview.candidateId,
        recipientName: interview.candidateName,
        jobId: interview.jobId,
        jobTitle: interview.jobTitle,
        content: [
          `Hi ${interview.candidateName.split(' ')[0]}, your interview for ${interview.jobTitle} has been confirmed.`,
          '',
          `Date: ${formattedDate}`,
          `Time: ${formattedTime}`,
          `Type: ${TYPE_LABELS[interview.interviewType] || interview.interviewType}`,
          '',
          'Best regards,',
          companyName,
        ].join('\n'),
      })

      // Email (fire & forget)
      if (interview.candidateEmail) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: interview.candidateEmail,
            type: 'interview_confirmed',
            data: {
              companyName,
              jobTitle: interview.jobTitle,
              candidateName: interview.candidateName,
              date: formattedDate,
              time: formattedTime,
              interviewType: TYPE_LABELS[interview.interviewType] || interview.interviewType,
            },
          }),
        }).catch(() => {})
      }

      setUpcoming(prev =>
        prev.map(i => i.interviewId === interview.interviewId ? { ...i, status: 'confirmed' } : i)
      )
    } catch (err) {
      console.error('Error confirming interview:', err)
    } finally {
      setConfirmingId(null)
    }
  }

  const handleCancelInterview = async (interview: InterviewItem) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel this interview?\nThe candidate will be notified.`
    )
    if (!confirmed) return

    setCancellingId(interview.interviewId)
    try {
      await supabase
        .from('interviews')
        .update({ status: 'cancelled' })
        .eq('id', interview.interviewId)

      const formattedDate = formatLongDate(interview.interviewDate)

      // In-app notification
      const { error: notifCancelErr } = await supabase.from('notifications').insert({
        user_id: interview.candidateId,
        title: 'Interview Cancelled',
        message: `Your interview for ${interview.jobTitle} at ${companyName} on ${formattedDate} has been cancelled.`,
        type: 'application_update',
        read: false,
        related_id: interview.applicationId,
        related_type: 'application',
      })
      if (notifCancelErr) console.error('Notification error:', notifCancelErr)

      // Hex message
      await sendHexMessage({
        senderId: employerId,
        senderName: companyName,
        recipientId: interview.candidateId,
        recipientName: interview.candidateName,
        jobId: interview.jobId,
        jobTitle: interview.jobTitle,
        content: [
          `Hi ${interview.candidateName.split(' ')[0]}, we need to let you know that your interview for ${interview.jobTitle} scheduled for ${formattedDate} has been cancelled.`,
          '',
          'If you have any questions, please don\'t hesitate to get in touch.',
          '',
          'Best regards,',
          companyName,
        ].join('\n'),
      })

      // Email (fire & forget)
      if (interview.candidateEmail) {
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: interview.candidateEmail,
            type: 'interview_cancelled',
            data: {
              companyName,
              jobTitle: interview.jobTitle,
              candidateName: interview.candidateName,
              date: formattedDate,
            },
          }),
        }).catch(() => {})
      }

      const cancelled = { ...interview, status: 'cancelled' }
      setUpcoming(prev => prev.filter(i => i.interviewId !== interview.interviewId))
      setPast(prev => [cancelled, ...prev])
    } catch (err) {
      console.error('Error cancelling interview:', err)
    } finally {
      setCancellingId(null)
    }
  }

  const handleMarkCompleted = (interview: InterviewItem) => {
    setFollowUpId(interview.interviewId)
  }

  const handleFollowUpAction = async (
    interview: InterviewItem,
    action: 'offer' | 'reject' | 'pipeline'
  ) => {
    try {
      await supabase
        .from('interviews')
        .update({ status: 'completed' })
        .eq('id', interview.interviewId)

      if (action === 'reject') {
        await supabase
          .from('job_applications')
          .update({ status: 'rejected', status_updated_at: new Date().toISOString() })
          .eq('id', interview.applicationId)

        const { error: notifRejectErr } = await supabase.from('notifications').insert({
          user_id: interview.candidateId,
          title: 'Application Update',
          message: `Your application for ${interview.jobTitle} at ${companyName} was not selected to move forward.`,
          type: 'application_update',
          read: false,
          related_id: interview.applicationId,
          related_type: 'application',
        })
        if (notifRejectErr) console.error('Notification error:', notifRejectErr)

        if (interview.candidateEmail) {
          fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: interview.candidateEmail,
              type: 'application_status',
              data: { status: 'rejected', companyName, jobTitle: interview.jobTitle },
            }),
          }).catch(() => {})
        }
      } else if (action === 'pipeline') {
        await supabase
          .from('job_applications')
          .update({ status: 'reviewing', status_updated_at: new Date().toISOString() })
          .eq('id', interview.applicationId)
      }
      // 'offer' → navigate to application page where employer clicks Make Offer

      const completed = { ...interview, status: 'completed' }
      setUpcoming(prev => prev.filter(i => i.interviewId !== interview.interviewId))
      setPast(prev => [completed, ...prev])
      setFollowUpId(null)
      setPastExpanded(true)

      if (action === 'offer') {
        router.push(`/my-jobs/${interview.jobId}/applications`)
      }
    } catch (err) {
      console.error('Error completing interview:', err)
    }
  }

  const handleNoteBlur = async (interviewId: string) => {
    const notes = localNotes[interviewId] ?? ''
    const { error: notesErr } = await supabase
      .from('interviews')
      .update({ notes })
      .eq('id', interviewId)
    if (notesErr) console.error('Error saving notes:', notesErr)
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0)
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`
  const weekEnd = new Date(todayObj); weekEnd.setDate(todayObj.getDate() + 7)

  const countToday = upcoming.filter(i => i.interviewDate === todayStr).length
  const countThisWeek = upcoming.filter(i => {
    const [y, m, d] = i.interviewDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt >= todayObj && dt <= weekEnd
  }).length
  const countConfirmed = upcoming.filter(i => i.status === 'confirmed').length
  const countCompleted = past.filter(i => i.status === 'completed').length

  const groupedUpcoming = upcoming.reduce<Record<string, InterviewItem[]>>((acc, item) => {
    if (!acc[item.interviewDate]) acc[item.interviewDate] = []
    acc[item.interviewDate].push(item)
    return acc
  }, {})

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p className={styles.loading}>Loading interviews...</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>

        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Interviews</h1>
          <p className={styles.pageSubtitle}>Your upcoming interview schedule</p>
        </div>

        {/* Stats Bar */}
        <div className={styles.statsBar}>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{countToday}</span>
            <span className={styles.statLabel}>Today</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{countThisWeek}</span>
            <span className={styles.statLabel}>This Week</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{countConfirmed}</span>
            <span className={styles.statLabel}>Confirmed</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{countCompleted}</span>
            <span className={styles.statLabel}>Completed</span>
          </div>
        </div>

        {/* Upcoming Interviews */}
        {upcoming.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📅</span>
            <h2 className={styles.emptyTitle}>No interviews scheduled</h2>
            <p className={styles.emptyText}>
              When you schedule interviews with candidates they will appear here.
            </p>
            <Link href="/my-jobs" className={styles.emptyLink}>Browse My Jobs</Link>
          </div>
        ) : (
          <div className={styles.scheduleList}>
            {Object.entries(groupedUpcoming).map(([dateKey, items]) => (
              <div key={dateKey} className={styles.dateGroup}>
                <h2 className={styles.dateHeader}>{formatGroupHeader(dateKey)}</h2>
                <div className={styles.interviewCards}>
                  {items.map(interview => {
                    const isConfirming = confirmingId === interview.interviewId
                    const isCancelling = cancellingId === interview.interviewId
                    const showFollowUp = followUpId === interview.interviewId
                    const canMarkComplete = isPastDateTime(interview.interviewDate, interview.interviewTime)

                    return (
                      <div
                        key={interview.interviewId}
                        className={`${styles.interviewCard} ${interview.status === 'confirmed' ? styles.cardConfirmed : ''}`}
                      >
                        {/* Avatar */}
                        <div className={styles.avatar}>
                          {interview.candidatePhoto ? (
                            <img src={interview.candidatePhoto} alt={interview.candidateName} className={styles.avatarImg} />
                          ) : (
                            <div className={styles.avatarPlaceholder}>{getInitials(interview.candidateName)}</div>
                          )}
                        </div>

                        {/* Card Body */}
                        <div className={styles.cardBody}>

                          {/* Top row: name + status badge + type badge */}
                          <div className={styles.cardTop}>
                            <div className={styles.cardNameRow}>
                              <span className={styles.candidateName}>{interview.candidateName}</span>
                              <span className={`${styles.statusBadge} ${interview.status === 'confirmed' ? styles.statusConfirmed : styles.statusScheduled}`}>
                                {interview.status === 'confirmed' ? '✓ Confirmed' : 'Pending Confirmation'}
                              </span>
                            </div>
                            <span className={`${styles.typeBadge} ${TYPE_BADGE_CLASS[interview.interviewType] || ''}`}>
                              {TYPE_LABELS[interview.interviewType] || interview.interviewType}
                            </span>
                          </div>

                          {/* Job title */}
                          <p className={styles.cardJobTitle}>{interview.jobTitle}</p>

                          {/* Date + time + duration */}
                          <p className={styles.cardTime}>
                            🕐 {formatCardDate(interview.interviewDate, interview.interviewTime)} · {interview.durationMinutes} min
                          </p>

                          {/* Phone */}
                          {interview.candidatePhone && (
                            <p className={styles.cardInfoRow}>
                              📞 <a href={`tel:${interview.candidatePhone}`} className={styles.infoLink}>{interview.candidatePhone}</a>
                            </p>
                          )}

                          {/* Location or video link */}
                          {interview.locationOrLink && interview.interviewType === 'video' && interview.locationOrLink.startsWith('http') && (
                            <p className={styles.cardInfoRow}>
                              🎥 <a href={interview.locationOrLink} target="_blank" rel="noopener noreferrer" className={styles.infoLink}>Join Video Call</a>
                            </p>
                          )}
                          {interview.locationOrLink && interview.interviewType !== 'video' && !interview.locationOrLink.startsWith('http') && (
                            <p className={styles.cardInfoRow}>📍 {interview.locationOrLink}</p>
                          )}

                          {/* Follow-up prompt (shown after Mark as Completed click) */}
                          {showFollowUp ? (
                            <div className={styles.followUpBox}>
                              <p className={styles.followUpTitle}>What&apos;s your next step?</p>
                              <div className={styles.followUpBtns}>
                                <button
                                  className={styles.followUpOffer}
                                  onClick={() => handleFollowUpAction(interview, 'offer')}
                                >
                                  Make Offer
                                </button>
                                <button
                                  className={styles.followUpReject}
                                  onClick={() => handleFollowUpAction(interview, 'reject')}
                                >
                                  Reject
                                </button>
                                <button
                                  className={styles.followUpPipeline}
                                  onClick={() => handleFollowUpAction(interview, 'pipeline')}
                                >
                                  Keep in Pipeline
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Row 1 — Primary actions */}
                              <div className={styles.primaryActions}>
                                {interview.status === 'scheduled' && (
                                  <button
                                    className={`${styles.btnConfirm} ${isConfirming ? styles.btnConfirming : ''}`}
                                    onClick={() => handleConfirmInterview(interview)}
                                    disabled={isConfirming}
                                  >
                                    {isConfirming ? 'Confirming...' : 'Confirm Interview'}
                                  </button>
                                )}
                                <a
                                  href={buildCalendarUrl(interview)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.btnCalendar}
                                >
                                  Add to Calendar
                                </a>
                                <button
                                  className={styles.btnMessage}
                                  onClick={() => router.push(`/messages?candidate=${interview.candidateId}`)}
                                >
                                  Message
                                </button>
                              </div>

                              {/* Row 2 — Secondary actions */}
                              <div className={styles.secondaryActions}>
                                <Link
                                  href={`/my-jobs/${interview.jobId}/applications`}
                                  className={styles.btnSecondary}
                                >
                                  View Application
                                </Link>
                                <button
                                  className={styles.btnSecondary}
                                  onClick={() => setRescheduleTarget(interview)}
                                >
                                  Reschedule
                                </button>
                                <button
                                  className={styles.btnCancel}
                                  onClick={() => handleCancelInterview(interview)}
                                  disabled={isCancelling}
                                >
                                  {isCancelling ? 'Cancelling...' : 'Cancel'}
                                </button>
                                {canMarkComplete && (
                                  <button
                                    className={styles.btnComplete}
                                    onClick={() => handleMarkCompleted(interview)}
                                  >
                                    Mark Completed
                                  </button>
                                )}
                              </div>
                            </>
                          )}

                          {/* Notes textarea */}
                          <textarea
                            className={styles.notesArea}
                            placeholder="Add interview notes..."
                            value={localNotes[interview.interviewId] ?? ''}
                            onChange={e => setLocalNotes(prev => ({ ...prev, [interview.interviewId]: e.target.value }))}
                            onBlur={() => handleNoteBlur(interview.interviewId)}
                            rows={2}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Past Interviews */}
        {past.length > 0 && (
          <div className={styles.pastSection}>
            <button className={styles.pastToggle} onClick={() => setPastExpanded(p => !p)}>
              <span>Past Interviews ({past.length})</span>
              <span className={`${styles.chevron} ${pastExpanded ? styles.chevronUp : ''}`}>▾</span>
            </button>

            {pastExpanded && (
              <div className={styles.pastList}>
                {past.map(interview => (
                  <div key={interview.interviewId} className={styles.pastCard}>
                    <div className={styles.avatar}>
                      {interview.candidatePhoto ? (
                        <img src={interview.candidatePhoto} alt={interview.candidateName} className={styles.avatarImg} />
                      ) : (
                        <div className={styles.avatarPlaceholder}>{getInitials(interview.candidateName)}</div>
                      )}
                    </div>
                    <div className={styles.pastBody}>
                      <span className={styles.candidateName}>{interview.candidateName}</span>
                      <p className={styles.cardJobTitle}>{interview.jobTitle}</p>
                      <p className={styles.cardTime}>{formatCardDate(interview.interviewDate, interview.interviewTime)}</p>
                    </div>
                    <div className={styles.pastMeta}>
                      <span className={`${styles.pastStatusBadge} ${interview.status === 'completed' ? styles.pastCompleted : styles.pastCancelled}`}>
                        {interview.status.charAt(0).toUpperCase() + interview.status.slice(1)}
                      </span>
                      <Link href={`/my-jobs/${interview.jobId}/applications`} className={styles.btnSecondary}>
                        View Application
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <ScheduleInterviewModal
          isOpen={true}
          onClose={() => setRescheduleTarget(null)}
          applicationId={rescheduleTarget.applicationId}
          jobId={rescheduleTarget.jobId}
          jobTitle={rescheduleTarget.jobTitle}
          company={rescheduleTarget.company}
          candidateId={rescheduleTarget.candidateId}
          candidateName={rescheduleTarget.candidateName}
          candidateEmail={rescheduleTarget.candidateEmail}
          existingInterviewId={rescheduleTarget.interviewId}
          onSuccess={() => {
            setRescheduleTarget(null)
            loadInterviews()
          }}
        />
      )}
    </main>
  )
}
