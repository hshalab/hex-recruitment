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
  interviewDate: string
  interviewTime: string
  interviewType: string
  durationMinutes: number
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
  const [upcoming, setUpcoming] = useState<InterviewItem[]>([])
  const [past, setPast] = useState<InterviewItem[]>([])
  const [pastExpanded, setPastExpanded] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<InterviewItem | null>(null)

  useEffect(() => {
    loadInterviews()
  }, [])

  const loadInterviews = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login')
      return
    }

    const employerId = session.user.id

    const { data: interviews } = await supabase
      .from('interviews')
      .select('*')
      .eq('employer_id', employerId)
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
        .select('user_id, full_name, profile_picture_url, email')
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
        company: job?.company || '',
        candidateId: i.candidate_id,
        candidateName: profile?.full_name || 'Candidate',
        candidatePhoto: profile?.profile_picture_url || null,
        candidateEmail: profile?.email || '',
        interviewDate: i.interview_date,
        interviewTime: i.interview_time,
        interviewType: i.interview_type,
        durationMinutes: i.duration_minutes,
        status: i.status,
      }
    })

    const upcomingItems = mapped.filter(i => ['scheduled', 'confirmed'].includes(i.status))
    const pastItems = mapped
      .filter(i => ['completed', 'cancelled', 'rescheduled'].includes(i.status))
      .sort((a, b) => b.interviewDate.localeCompare(a.interviewDate))

    setUpcoming(upcomingItems)
    setPast(pastItems)
    setLoading(false)
  }

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

  // Stats
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  const countToday = upcoming.filter(i => i.interviewDate === todayStr).length
  const countThisWeek = upcoming.filter(i => {
    const [y, m, d] = i.interviewDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt >= today && dt <= weekEnd
  }).length
  const countConfirmed = upcoming.filter(i => i.status === 'confirmed').length
  const countCompleted = past.filter(i => i.status === 'completed').length

  // Group upcoming by date
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

        {/* Upcoming */}
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
                  {items.map(interview => (
                    <div
                      key={interview.interviewId}
                      className={`${styles.interviewCard} ${interview.status === 'confirmed' ? styles.cardConfirmed : ''}`}
                    >
                      <div className={styles.avatar}>
                        {interview.candidatePhoto ? (
                          <img
                            src={interview.candidatePhoto}
                            alt={interview.candidateName}
                            className={styles.avatarImg}
                          />
                        ) : (
                          <div className={styles.avatarPlaceholder}>
                            {getInitials(interview.candidateName)}
                          </div>
                        )}
                      </div>

                      <div className={styles.cardBody}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardNameRow}>
                            <span className={styles.candidateName}>{interview.candidateName}</span>
                            {interview.status === 'confirmed' && (
                              <span className={styles.confirmedBadge}>✓ Confirmed</span>
                            )}
                          </div>
                          <span className={`${styles.typeBadge} ${TYPE_BADGE_CLASS[interview.interviewType] || ''}`}>
                            {TYPE_LABELS[interview.interviewType] || interview.interviewType}
                          </span>
                        </div>

                        <p className={styles.cardJobTitle}>{interview.jobTitle}</p>
                        <p className={styles.cardTime}>
                          🕐 {formatCardDate(interview.interviewDate, interview.interviewTime)}
                          {' · '}{interview.durationMinutes} min
                        </p>

                        <div className={styles.cardActions}>
                          <Link
                            href={`/my-jobs/${interview.jobId}/applications`}
                            className={styles.actionPrimary}
                          >
                            View Application
                          </Link>
                          <button
                            className={styles.actionSecondary}
                            onClick={() => setRescheduleTarget(interview)}
                          >
                            Reschedule
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Past Interviews */}
        {past.length > 0 && (
          <div className={styles.pastSection}>
            <button
              className={styles.pastToggle}
              onClick={() => setPastExpanded(p => !p)}
            >
              <span>Past Interviews ({past.length})</span>
              <span className={`${styles.chevron} ${pastExpanded ? styles.chevronUp : ''}`}>▾</span>
            </button>

            {pastExpanded && (
              <div className={styles.pastList}>
                {past.map(interview => (
                  <div key={interview.interviewId} className={styles.pastCard}>
                    <div className={styles.avatar}>
                      {interview.candidatePhoto ? (
                        <img
                          src={interview.candidatePhoto}
                          alt={interview.candidateName}
                          className={styles.avatarImg}
                        />
                      ) : (
                        <div className={styles.avatarPlaceholder}>
                          {getInitials(interview.candidateName)}
                        </div>
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
                      <Link
                        href={`/my-jobs/${interview.jobId}/applications`}
                        className={styles.actionSecondary}
                      >
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
