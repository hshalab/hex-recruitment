'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { MapPin, Video, Phone, MoreHorizontal } from 'lucide-react'
import { RowInlineFields } from '@/components/RowInlineFields'
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
  // Phase 1: the per-row "⋯" overflow menu is presented but its items
  // do not yet wire to real handlers — see the click handlers below.
  // Phase 2 will hook them up after Paul approves the look.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Outside-click closes the open overflow menu.
  useEffect(() => {
    if (!openMenuId) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [openMenuId])

  useEffect(() => { loadInterviews() }, [])

  const loadInterviews = async () => {
    const session = await getSessionWithRetry()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login/employer')
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
        meetingLink: i.location_or_link || null,
        calendarLink: i.calendar_link || null,
        notes: i.notes || null,
        status: i.status,
      }
    })

    // Defence-in-depth: even within the active statuses, exclude rows
    // with NULL date/time. After fix #1b, those should only exist on
    // 'pending_selection' rows (excluded by the status filter anyway),
    // but if a phantom row slipped through with status='scheduled' /
    // 'confirmed' / 'completed' / 'cancelled' and NULL date/time, the
    // formatters and sort below would crash. Filtering by status is
    // the canonical gate; this NULL filter is the safety net.
    const upcomingItems = mapped
      .filter(i => ['scheduled', 'confirmed'].includes(i.status) && i.interviewDate && i.interviewTime)
      .sort((a, b) => {
        const dtA = new Date(`${a.interviewDate}T${a.interviewTime}`).getTime()
        const dtB = new Date(`${b.interviewDate}T${b.interviewTime}`).getTime()
        return dtA - dtB
      })
    const pastItems = mapped
      .filter(i => ['completed', 'cancelled', 'rescheduled'].includes(i.status) && i.interviewDate)
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

  // Compact row date — drops "at" and duration, e.g. "Tue 12 May, 3:30 PM".
  // Duration is hidden in the row but still in the row's overflow menu /
  // detail screen (Phase 2).
  const formatRowDateTime = (dateStr: string, timeStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const dayStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    return `${dayStr}, ${formatTime(timeStr)}`
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
      // /api/calendar/cancel is the single source of truth for cancellation:
      // it sets interviews.status='cancelled', notifies + messages + emails
      // the candidate, AND deletes the mirrored Google Calendar event (via
      // interview_bookings.gcal_event_id_employer). It soft-skips the Google
      // call when there's no synced event (returns ok:true, skipped). We
      // AWAIT it so the row only moves to "Past" once the cancel actually
      // succeeded, and so we don't double-send the candidate comms (which is
      // what would happen if we also did them client-side here).
      const res = await fetch('/api/calendar/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewId: interview.interviewId, employerId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Cancellation failed')
      }

      const cancelled = { ...interview, status: 'cancelled' }
      setUpcoming(prev => prev.filter(i => i.interviewId !== interview.interviewId))
      setPast(prev => [...prev, cancelled].sort((a, b) => b.interviewDate.localeCompare(a.interviewDate)))
    } catch (err) {
      console.error('Error cancelling interview:', err)
      alert('Sorry — we couldn\'t cancel this interview. Please try again.')
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

        {/* Stats bar removed — the filter tabs below carry the same counts,
            keeping the page glanceable instead of doubling the top region. */}

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
                    // Phase 1: visual-only. Row click + every overflow menu
                    // item logs and closes the menu but does NOT navigate or
                    // call the existing modal handlers. Phase 2 (separate
                    // approval) wires real behaviour.
                    const menuOpen = openMenuId === interview.interviewId
                    const isConfirmed = interview.status === 'confirmed'
                    const modalityIcon =
                      interview.interviewType === 'video'
                        ? <Video size={16} aria-label="Video call" />
                        : interview.interviewType === 'phone'
                          ? <Phone size={16} aria-label="Phone call" />
                          : <MapPin size={16} aria-label="In-person" />
                    const modalityClass =
                      interview.interviewType === 'video'
                        ? styles.modalityVideo
                        : interview.interviewType === 'phone'
                          ? styles.modalityPhone
                          : styles.modalityInPerson
                    const stubLog = (label: string) => () => {
                      console.log(`[Phase 1 stub] ${label} on interview ${interview.interviewId}`)
                      setOpenMenuId(null)
                    }

                    return (
                      <div
                        key={interview.interviewId}
                        className={styles.interviewRow}
                        role="button"
                        tabIndex={0}
                        onClick={() => console.log(`[Phase 1 stub] row-click → interview ${interview.interviewId} (${interview.candidateName})`)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            console.log(`[Phase 1 stub] row-key → interview ${interview.interviewId}`)
                          }
                        }}
                      >
                        <div className={styles.rowMain}>
                          <RowInlineFields
                            sepClassName={styles.fieldSep}
                            fields={[
                              <span key="n" className={styles.candidateName}>{interview.candidateName}</span>,
                              <span key="r" className={styles.jobTitle}>{interview.jobTitle}</span>,
                              <span key="d" className={styles.dateTime}>{formatRowDateTime(interview.interviewDate, interview.interviewTime)}</span>,
                            ]}
                          />
                        </div>

                        <div className={styles.rowAside}>
                          <span
                            className={`${styles.statusPill} ${isConfirmed ? styles.statusConfirmed : styles.statusPending}`}
                            aria-label={isConfirmed ? 'Confirmed' : 'Pending'}
                          >
                            {isConfirmed ? 'Confirmed' : 'Pending'}
                          </span>

                          <span
                            className={`${styles.modalityIcon} ${modalityClass}`}
                            title={TYPE_LABELS[interview.interviewType] || interview.interviewType}
                          >
                            {modalityIcon}
                          </span>

                          <button
                            type="button"
                            className={styles.overflowBtn}
                            aria-label="More actions"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={e => {
                              e.stopPropagation()
                              setOpenMenuId(prev => prev === interview.interviewId ? null : interview.interviewId)
                            }}
                          >
                            <MoreHorizontal size={18} />
                          </button>

                          {menuOpen && (
                            <div
                              ref={menuRef}
                              className={styles.overflowMenu}
                              role="menu"
                              onClick={e => e.stopPropagation()}
                            >
                              <button type="button" className={styles.menuItem} role="menuitem" onClick={stubLog('Message')}>Message</button>
                              <button type="button" className={styles.menuItem} role="menuitem" onClick={stubLog('Email')}>Email</button>
                              <button type="button" className={styles.menuItem} role="menuitem" onClick={stubLog('Applications')}>Applications</button>
                              <button type="button" className={styles.menuItem} role="menuitem" onClick={stubLog('Calendar')}>Calendar</button>
                              <button type="button" className={styles.menuItem} role="menuitem" onClick={stubLog('Notes')}>Notes</button>
                              <div className={styles.menuDivider} />
                              <button
                                type="button"
                                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); setRescheduleTarget(interview) }}
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                role="menuitem"
                                disabled={cancellingId === interview.interviewId}
                                onClick={() => { setOpenMenuId(null); handleCancelInterview(interview) }}
                              >
                                {cancellingId === interview.interviewId ? 'Cancelling…' : 'Cancel'}
                              </button>
                            </div>
                          )}
                        </div>
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
              /* Reskinned to the canonical compact-row standard, just DIMMED
                 (.pastRow) so history reads as de-emphasised — same anatomy
                 as the upcoming rows, not a different tile layout. Avatar +
                 "View Application" action are preserved. */
              <div className={`${styles.interviewCards} ${styles.pastList}`}>
                {past.map(interview => (
                  <div key={interview.interviewId} className={`${styles.interviewRow} ${styles.pastRow}`}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowAvatar} aria-hidden="true">
                        {interview.candidatePhoto ? (
                          <SignedImage src={interview.candidatePhoto} alt="" className={styles.cardPhotoImg} />
                        ) : (
                          <span className={styles.cardPhotoPlaceholder}>{getInitials(interview.candidateName)}</span>
                        )}
                      </span>
                      <RowInlineFields
                        sepClassName={styles.fieldSep}
                        fields={[
                          <span key="n" className={styles.candidateName}>{interview.candidateName}</span>,
                          <span key="r" className={styles.jobTitle}>{interview.jobTitle}</span>,
                          <span key="d" className={styles.dateTime}>{formatRowDateTime(interview.interviewDate, interview.interviewTime)}</span>,
                        ]}
                      />
                    </div>
                    <div className={styles.rowAside}>
                      <span className={`${styles.statusPill} ${interview.status === 'completed' ? styles.statusCompleted : styles.statusCancelled}`}>
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
