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
  meetingLink: string | null
  calendarLink: string | null
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

async function sendThriveMessage(params: {
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
    console.error('Error sending Thrive message:', err)
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
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})
  const [activeFilter, setActiveFilter] = useState<'today' | 'week' | 'all'>('all')
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())

  useEffect(() => { loadInterviews() }, [])

  const loadInterviews = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login')
      return
    }
    const eid = session.user.id
    setEmployerId(eid)

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
        meetingLink: i.meeting_link || null,
        calendarLink: i.calendar_link || null,
        notes: i.notes || null,
        status: i.status,
      }
    })

    const upcomingItems = mapped
      .filter(i => ['scheduled', 'confirmed'].includes(i.status))
      .sort((a, b) => {
        const dtA = new Date(`${a.interviewDate}T${a.interviewTime}`).getTime()
        const dtB = new Date(`${b.interviewDate}T${b.interviewTime}`).getTime()
        return dtA - dtB
      })
    const pastItems = mapped
      .filter(i => ['completed', 'cancelled', 'rescheduled'].includes(i.status))
      .sort((a, b) => b.interviewDate.localeCompare(a.interviewDate))

    const initialNotes: Record<string, string> = {}
    mapped.forEach(i => { initialNotes[i.interviewId] = i.notes || '' })
    setNotesMap(initialNotes)

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

  const formatCardDate = (dateStr: string, timeStr: string, durationMinutes: number) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const dayStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    return `${dayStr} at ${formatTime(timeStr)} · ${durationMinutes} min`
  }

  const formatLongDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
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
      `&location=${encodeURIComponent(interview.locationOrLink || TYPE_LABELS[interview.interviewType] || interview.interviewType)}` +
      `&ctz=Europe%2FLondon`
    )
  }

  const handleNoteBlur = async (interviewId: string, value: string) => {
    await supabase.from('interviews').update({ notes: value }).eq('id', interviewId)
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

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

      // Remove the mirrored Google Calendar event (if any) — fire-and-forget
      fetch('/api/calendar/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewId: interview.interviewId }),
      }).catch(() => {})

      const formattedDate = formatLongDate(interview.interviewDate)

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

      await sendThriveMessage({
        senderId: employerId,
        senderName: companyName,
        recipientId: interview.candidateId,
        recipientName: interview.candidateName,
        jobId: interview.jobId,
        jobTitle: interview.jobTitle,
        content: [
          `Hi ${interview.candidateName.split(' ')[0]}, we need to let you know that your interview for ${interview.jobTitle} scheduled for ${formattedDate} has been cancelled.`,
          '',
          "If you have any questions, please don't hesitate to get in touch.",
          '',
          'Best regards,',
          companyName,
        ].join('\n'),
      })

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
      setPast(prev => [...prev, cancelled].sort((a, b) => b.interviewDate.localeCompare(a.interviewDate)))
    } catch (err) {
      console.error('Error cancelling interview:', err)
    } finally {
      setCancellingId(null)
    }
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

  const filteredUpcoming = upcoming.filter(i => {
    if (activeFilter === 'today') return i.interviewDate === todayStr
    if (activeFilter === 'week') {
      const [y, m, d] = i.interviewDate.split('-').map(Number)
      const dt = new Date(y, m - 1, d)
      return dt >= todayObj && dt <= weekEnd
    }
    return true
  })


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

        {/* Filter Tabs */}
        {upcoming.length > 0 && (
          <div className={styles.filterTabs}>
            {([
              { key: 'today' as const, label: 'Today', count: countToday },
              { key: 'week' as const, label: 'This Week', count: countThisWeek },
              { key: 'all' as const, label: 'All Upcoming', count: upcoming.length },
            ]).map(tab => (
              <button
                key={tab.key}
                className={`${styles.filterTab} ${activeFilter === tab.key ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter(tab.key)}
              >
                {tab.label}<span className={styles.filterTabCount}>({tab.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Upcoming Interviews */}
        {upcoming.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📅</span>
            <h2 className={styles.emptyTitle}>No interviews scheduled</h2>
            <p className={styles.emptyText}>
              When you schedule interviews with candidates they will appear here.
            </p>
            <Link href="/my-jobs" className={styles.emptyLink}>Manage Job Ads</Link>
          </div>
        ) : filteredUpcoming.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📅</span>
            <h2 className={styles.emptyTitle}>No interviews {activeFilter === 'today' ? 'today' : 'this week'}</h2>
            <p className={styles.emptyText}>
              Try viewing all upcoming interviews.
            </p>
            <button className={styles.emptyLink} onClick={() => setActiveFilter('all')}>Show all</button>
          </div>
        ) : (
          <div className={styles.interviewCards}>
            {filteredUpcoming.map(interview => {
                    const isCancelling = cancellingId === interview.interviewId
                    const calendarHref = interview.calendarLink || buildCalendarUrl(interview)

                    return (
                      <div key={interview.interviewId} className={styles.interviewCard}>

                        {/* Card Header: photo LEFT, info RIGHT */}
                        <div className={styles.cardHeader}>
                          <div className={styles.cardPhoto}>
                            {interview.candidatePhoto ? (
                              <img src={interview.candidatePhoto} alt={interview.candidateName} className={styles.cardPhotoImg} />
                            ) : (
                              <div className={styles.cardPhotoPlaceholder}>{getInitials(interview.candidateName)}</div>
                            )}
                          </div>
                          <div className={styles.cardHeaderInfo}>
                            <div className={styles.cardHeaderInfoLeft}>
                              <span className={styles.candidateName}>{interview.candidateName}</span>
                              <p className={styles.cardJobTitle}>{interview.jobTitle} · {interview.company}</p>
                            </div>
                            <span className={`${styles.typeBadge} ${TYPE_BADGE_CLASS[interview.interviewType] || ''}`}>
                              {TYPE_LABELS[interview.interviewType] || interview.interviewType}
                            </span>
                          </div>
                        </div>

                        {/* Bottom row: tags + actions — mirrors jobCardBottom */}
                        <div className={styles.cardBottom}>
                          <div className={styles.cardTags}>
                            <span className={styles.cardTag}>{formatCardDate(interview.interviewDate, interview.interviewTime, interview.durationMinutes)}</span>
                            <span className={`${styles.statusBadge} ${interview.status === 'confirmed' ? styles.statusConfirmed : styles.statusScheduled}`}>
                              {interview.status === 'confirmed' ? '✓ Confirmed' : 'Pending'}
                            </span>
                          </div>
                        </div>

                        {/* Action links row — compact, single line */}
                        <div className={styles.cardMeta}>
                          <div className={styles.cardLinks}>
                            <button className={styles.metaLink} onClick={() => router.push(`/messages?candidate=${interview.candidateId}`)}>Message</button>
                            <span className={styles.metaDot}>·</span>
                            <a href={`mailto:${interview.candidateEmail}`} className={styles.metaLink}>Email</a>
                            <span className={styles.metaDot}>·</span>
                            <Link href={`/my-jobs/${interview.jobId}/applications`} className={styles.metaLink}>Applications</Link>
                            <span className={styles.metaDot}>·</span>
                            <a href={calendarHref} target="_blank" rel="noopener noreferrer" className={styles.metaLink}>Calendar</a>
                            <span className={styles.metaDot}>·</span>
                            <button className={styles.metaLink} onClick={() => setExpandedNotes(prev => { const s = new Set(prev); s.has(interview.interviewId) ? s.delete(interview.interviewId) : s.add(interview.interviewId); return s })}>Notes</button>
                          </div>
                          <div className={styles.cardActions}>
                            <button className={styles.dangerLink} onClick={() => setRescheduleTarget(interview)}>Reschedule</button>
                            <button className={styles.dangerLink} onClick={() => handleCancelInterview(interview)} disabled={isCancelling}>
                              {isCancelling ? '...' : 'Cancel'}
                            </button>
                          </div>
                        </div>

                        {/* Expandable notes */}
                        {expandedNotes.has(interview.interviewId) && (
                          <input
                            type="text"
                            className={styles.notesInput}
                            placeholder="Add notes..."
                            autoFocus
                            value={notesMap[interview.interviewId] ?? ''}
                            onChange={e => setNotesMap(prev => ({ ...prev, [interview.interviewId]: e.target.value }))}
                            onBlur={e => handleNoteBlur(interview.interviewId, e.target.value)}
                          />
                        )}

                      </div>
                    )
                  })}
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
                    <div className={styles.pastPhoto}>
                      {interview.candidatePhoto ? (
                        <img src={interview.candidatePhoto} alt={interview.candidateName} className={styles.cardPhotoImg} />
                      ) : (
                        <div className={styles.cardPhotoPlaceholder}>{getInitials(interview.candidateName)}</div>
                      )}
                    </div>
                    <div className={styles.pastBody}>
                      <span className={styles.candidateName}>{interview.candidateName}</span>
                      <p className={styles.cardJobTitle}>{interview.jobTitle}</p>
                      <span className={styles.cardTag} style={{ display: 'inline-block', marginTop: '0.2rem' }}>
                        {formatCardDate(interview.interviewDate, interview.interviewTime, interview.durationMinutes)}
                      </span>
                    </div>
                    <div className={styles.pastMeta}>
                      <span className={`${styles.pastStatusBadge} ${interview.status === 'completed' ? styles.pastCompleted : styles.pastCancelled}`}>
                        {interview.status.charAt(0).toUpperCase() + interview.status.slice(1)}
                      </span>
                      <Link href={`/my-jobs/${interview.jobId}/applications`} className={styles.btnSm}>
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
          existingMeetingLink={rescheduleTarget.meetingLink ?? undefined}
          onSuccess={() => {
            setRescheduleTarget(null)
            loadInterviews()
          }}
        />
      )}
    </main>
  )
}
