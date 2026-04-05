'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { useMessages } from '@/lib/MessagesContext'
import Header from '@/components/Header'
import styles from './page.module.css'

// ── Helpers ─────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatDate(): { day: string; full: string } {
  const now = new Date()
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const full = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return { day, full }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

const PIPELINE_STAGES = ['pending', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const

function getStatusStyle(status: string): string {
  if (status === 'pending') return 'statusPending'
  if (status === 'reviewing' || status === 'shortlisted') return 'statusReviewing'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'statusInterview'
  if (status === 'rejected') return 'statusRejected'
  return 'statusPending'
}



// ── Skeleton placeholder ────────────────────────────────
function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className={`${styles.skeleton} ${styles.skeletonCard}`} style={{ height }} />
}

// ═════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════

export default function EmployerDashboardPage() {
  const router = useRouter()
  const { conversations, totalUnreadCount } = useMessages()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [companyDescription, setCompanyDescription] = useState('')
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null)
  const [freeUntil, setFreeUntil] = useState<string | null>(null)
  const [dismissChecklist, setDismissChecklist] = useState(false)

  // Stats
  const [totalJobs, setTotalJobs] = useState(0)
  const [activeJobs, setActiveJobs] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalViews, setTotalViews] = useState(0)
  const [newJobsThisWeek, setNewJobsThisWeek] = useState(0)
  const [newAppsThisWeek, setNewAppsThisWeek] = useState(0)

  // Data
  const [applications, setApplications] = useState<any[]>([])
  const [jobsData, setJobsData] = useState<any[]>([])

  // ── Load data ───────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // DEV MODE
      if (DEV_MODE) {
        const mockUser = getMockUser()
        const userType = getMockUserType()

        if (userType !== 'employer') {
          router.replace('/dashboard')
          return
        }

        setUser(mockUser)
        setCompanyName(mockUser?.user_metadata?.company_name || 'Your Company')

        // Load company logo from localStorage profile
        const savedProfile = localStorage.getItem('employerProfile')
        if (savedProfile) {
          const profile = JSON.parse(savedProfile)
          if (profile.logoUrl) setCompanyLogo(profile.logoUrl)
        }

        setTotalJobs(8)
        setActiveJobs(5)
        setTotalApplications(34)
        setTotalViews(287)
        setApplications([
          { id: '1', candidate_name: 'Sarah Johnson', job_title: 'Head Chef', status: 'pending', created_at: new Date(Date.now() - 3600000).toISOString() },
          { id: '2', candidate_name: 'Michael Brown', job_title: 'Sous Chef', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '3', candidate_name: 'Emma Wilson', job_title: 'Pastry Chef', status: 'interview', created_at: new Date(Date.now() - 4 * 86400000).toISOString() },
          { id: '4', candidate_name: 'James Taylor', job_title: 'Kitchen Porter', status: 'hired', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
          { id: '5', candidate_name: 'Olivia Davis', job_title: 'Waitress', status: 'rejected', created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
        ])
        setJobsData([
          { id: 'j1', title: 'Head Chef', status: 'active', views: 84, application_count: 12 },
          { id: 'j2', title: 'Sous Chef', status: 'active', views: 67, application_count: 9 },
          { id: 'j3', title: 'Pastry Chef', status: 'active', views: 52, application_count: 7 },
        ])
        setLoading(false)
        return
      }

      // PRODUCTION MODE
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.user_metadata?.role !== 'employer') { router.replace('/dashboard'); return }

      setUser(session.user)
      const userId = session.user.id
      setCompanyName(session.user.user_metadata?.company_name || 'Your Company')

      // Fetch company logo from employer_profiles, fallback to user_metadata
      try {
        const { data: empProfile } = await supabase
          .from('employer_profiles')
          .select('logo_url, description')
          .eq('user_id', userId)
          .maybeSingle()
        if (empProfile?.logo_url) {
          setCompanyLogo(empProfile.logo_url)
        } else if (session.user.user_metadata?.logo_url) {
          setCompanyLogo(session.user.user_metadata.logo_url)
        }
        if (empProfile?.description) {
          setCompanyDescription(empProfile.description)
        }
      } catch { /* employer_profiles may not exist */ }

      // Fetch subscription tier
      try {
        const { data: subData } = await supabase
          .from('employer_subscriptions')
          .select('subscription_tier, current_period_end, trial_ends_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (subData) {
          setSubscriptionTier(subData.subscription_tier || null)
          if (subData.subscription_tier === 'free') {
            setFreeUntil(subData.current_period_end || subData.trial_ends_at || null)
          }
        }
      } catch { /* subscription table may not exist */ }

      // Fetch employer's jobs
      try {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, title, status, views, posted_at')
          .eq('employer_id', userId)
          .order('posted_at', { ascending: false })

        if (jobs) {
          setTotalJobs(jobs.length)
          setActiveJobs(jobs.filter(j => j.status === 'active').length)

          const views = jobs.reduce((sum: number, j: any) => sum + (j.views || 0), 0)
          setTotalViews(views)

          // Compute "new jobs this week" badge
          const now = new Date()
          const dayOfWeek = now.getDay() // 0=Sun
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
          const weekStart = new Date(now)
          weekStart.setHours(0, 0, 0, 0)
          weekStart.setDate(now.getDate() + mondayOffset)
          const jobsThisWeek = jobs.filter(j => j.posted_at && new Date(j.posted_at) >= weekStart).length
          setNewJobsThisWeek(jobsThisWeek)

          // Fetch ALL applications for these jobs (no limit — need accurate total count)
          const jobIds = jobs.map(j => j.id)
          if (jobIds.length > 0) {
            try {
              const { data: appData } = await supabase
                .from('job_applications')
                .select('id, job_id, job_title, company, status, created_at, candidate_id')
                .in('job_id', jobIds)
                .order('created_at', { ascending: false })

              if (appData) {
                setTotalApplications(appData.length)

                // Compute "new apps this week" badge
                const appsThisWeek = appData.filter(a => a.created_at && new Date(a.created_at) >= weekStart).length
                setNewAppsThisWeek(appsThisWeek)

                // Build per-job application count map for enriching jobsData
                const appCountByJob: Record<string, number> = {}
                appData.forEach((a: any) => {
                  appCountByJob[a.job_id] = (appCountByJob[a.job_id] || 0) + 1
                })

                // Enrich jobs with real application counts
                const enrichedJobs = jobs.map(j => ({
                  ...j,
                  application_count: appCountByJob[j.id] || 0,
                }))
                setJobsData(enrichedJobs)

                // Keep only the most recent 50 for the pipeline/recent apps display
                const recentApps = appData.slice(0, 50)
                setApplications(recentApps)

                // Enrich with candidate names
                const candidateIds = Array.from(new Set(recentApps.map((a: any) => a.candidate_id).filter(Boolean)))
                if (candidateIds.length > 0) {
                  try {
                    const { data: profiles } = await supabase
                      .from('candidate_profiles')
                      .select('user_id, full_name')
                      .in('user_id', candidateIds)

                    if (profiles) {
                      const nameMap: Record<string, string> = {}
                      profiles.forEach((p: any) => { nameMap[p.user_id] = p.full_name })
                      setApplications(prev => prev.map(a => ({
                        ...a,
                        candidate_name: nameMap[a.candidate_id] || 'Candidate',
                      })))
                    }
                  } catch { /* candidate_profiles may not exist */ }
                }
              } else {
                // No applications — still set jobsData with zero counts
                setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
              }
            } catch {
              // job_applications table may not exist — set jobsData with zero counts
              setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
            }
          } else {
            setJobsData([])
          }
        }
      } catch { /* jobs table query failed */ }

      setLoading(false)
    }

    load()
  }, [router])

  // ── Derived data ────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    PIPELINE_STAGES.forEach(s => { counts[s] = 0 })
    applications.forEach(a => {
      const s = (a.status || 'pending').toLowerCase()
      if (counts[s] !== undefined) counts[s]++
      else counts['pending']++
    })
    return counts
  }, [applications])

  const candidatesByStage = useMemo(() => {
    const map: Record<string, typeof applications> = {}
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    applications.forEach(app => {
      const s = (app.status || 'pending').toLowerCase()
      if (map[s]) map[s].push(app)
      else map['pending'].push(app)
    })
    return map
  }, [applications])

  const recentApps = useMemo(() => applications.slice(0, 5), [applications])

  const activeJobsList = useMemo(() =>
    jobsData.filter(j => j.status === 'active').slice(0, 5)
  , [jobsData])

  const recentConversations = useMemo(() =>
    [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  , [conversations])

  const staleApplications = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    return applications.filter(a =>
      a.status === 'pending' && new Date(a.created_at || a.appliedAt || '').getTime() < cutoff
    ).length
  }, [applications])

  const dateInfo = formatDate()

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <main className={styles.pageBackground}>
        <Header />
        <div className={styles.dashboardWrap}>
          <div className={styles.welcomeHeader}>
            <div className={styles.welcomeLeft}>
              <div className={`${styles.skeleton} ${styles.skeletonCircle}`} />
              <div style={{ flex: 1 }}>
                <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: '220px' }} />
                <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} style={{ width: '150px' }} />
              </div>
            </div>
          </div>
          <SkeletonCard height={60} />
          <div className={styles.grid}>
            <div className={styles.colLeft}>
              <SkeletonCard height={260} />
              <SkeletonCard height={200} />
            </div>
            <div className={styles.colRight}>
              <SkeletonCard height={200} />
              <SkeletonCard height={180} />
            </div>
          </div>
        </div>
      </main>
    )
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'

  return (
    <main className={styles.pageBackground}>
      <Header />

      <div className={styles.dashboardWrap}>
        {/* ── WELCOME HEADER ─────────────────────────────── */}
        <div className={styles.welcomeHeader}>
          <div className={styles.welcomeLeft}>
            <div className={styles.avatarPlaceholder}>
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className={styles.avatarImage} />
              ) : (
                getInitials(companyName || displayName)
              )}
            </div>
            <div className={styles.welcomeText}>
              <h1>{getGreeting()}, {displayName.split(' ')[0]}</h1>
              <p className={styles.companyLabel}>
                {companyName}
                {subscriptionTier && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 600, color: subscriptionTier === 'free' ? '#d97706' : '#16a34a', background: subscriptionTier === 'free' ? '#fffbeb' : '#f0fdf4', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                    {subscriptionTier === 'free' ? 'Free Launch — 12 months' : subscriptionTier === 'professional' ? 'Professional Plan' : 'Standard Plan'}
                  </span>
                )}
              </p>
              <p className={styles.welcomeSub}>
                {subscriptionTier === 'free' && freeUntil
                  ? `Free access until ${new Date(freeUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'Here\u0027s what\u0027s happening with your jobs today'}
              </p>
            </div>
          </div>
          <div className={styles.welcomeDate}>
            <span className={styles.welcomeDateDay}>{dateInfo.day}</span>
            {dateInfo.full}
          </div>
        </div>

        {/* ── STATS STRIP ── */}
        <div className={styles.statsStrip}>
          <button className={styles.statPill} onClick={() => router.push('/my-jobs')}>
            <span className={styles.statPillNum}>{activeJobs}</span>
            <span className={styles.statPillLabel}>Active Jobs</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/my-jobs')}>
            <span className={styles.statPillNum}>{totalApplications}</span>
            <span className={styles.statPillLabel}>
              Applications{newAppsThisWeek > 0 && <span className={styles.statPillBadge}>+{newAppsThisWeek}</span>}
            </span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/my-jobs?filter=interviewing')}>
            <span className={styles.statPillNum}>{statusCounts['interviewing'] || 0}</span>
            <span className={styles.statPillLabel}>Interviewing</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/messages')}>
            <span className={styles.statPillNum}>{totalViews}</span>
            <span className={styles.statPillLabel}>Views</span>
          </button>
        </div>

        {/* ── GETTING STARTED CHECKLIST ───────────────── */}
        {totalJobs === 0 && !dismissChecklist && (() => {
          const hasLogo = !!companyLogo
          const hasJob = totalJobs > 0
          const hasDescription = companyDescription.length > 50
          const completed = [hasLogo, hasJob, hasDescription].filter(Boolean).length
          return (
            <div className={styles.checklistCard}>
              <button className={styles.checklistDismiss} onClick={() => setDismissChecklist(true)} aria-label="Dismiss">×</button>
              <h3 className={styles.checklistHeading}>Get started with Thrive</h3>
              <p className={styles.checklistSub}>Complete these steps to start finding great candidates</p>
              <div className={styles.checklistItems}>
                <div className={styles.checklistItem}>
                  <span className={`${styles.checklistDot} ${hasLogo ? styles.checklistDotDone : ''}`} />
                  <span className={styles.checklistLabel}>Add your company logo</span>
                  {!hasLogo && <Link href="/settings/company" className={styles.checklistAction}>Add logo →</Link>}
                </div>
                <div className={styles.checklistItem}>
                  <span className={`${styles.checklistDot} ${hasJob ? styles.checklistDotDone : ''}`} />
                  <span className={styles.checklistLabel}>Post your first job</span>
                  {!hasJob && <Link href="/post-job" className={styles.checklistAction}>Post a job →</Link>}
                </div>
                <div className={styles.checklistItem}>
                  <span className={`${styles.checklistDot} ${hasDescription ? styles.checklistDotDone : ''}`} />
                  <span className={styles.checklistLabel}>Complete your company profile</span>
                  {!hasDescription && <Link href="/settings/company" className={styles.checklistAction}>Complete profile →</Link>}
                </div>
              </div>
              <p className={styles.checklistProgress}>{completed} of 3 steps complete</p>
            </div>
          )
        })()}

        {/* ── STALE APPLICATIONS NUDGE ────────────────── */}
        {staleApplications > 0 && (
          <div className={styles.staleNudge}>
            <span className={styles.staleNudgeIcon}>⏳</span>
            <div className={styles.staleNudgeText}>
              <strong>{staleApplications} application{staleApplications !== 1 ? 's' : ''}</strong> {staleApplications !== 1 ? 'have' : 'has'} been waiting for review for over 2 weeks.
            </div>
            <Link href="/my-jobs" className={styles.staleNudgeLink}>Review now →</Link>
          </div>
        )}


        <div className={styles.grid}>
          {/* ════════════════ LEFT COLUMN ═════════════════ */}
          <div className={styles.colLeft}>

            {/* ── APPLICATION PIPELINE ──────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Application Pipeline</h2>
                <Link href="/my-jobs" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.pipelineScroller}>
                  {PIPELINE_STAGES.filter(s => s !== 'rejected').map(s => {
                    const count = statusCounts[s] || 0
                    const candidates = candidatesByStage[s] || []
                    const stageColors: Record<string, string> = {
                      pending: '#f59e0b',
                      reviewing: '#3b82f6',
                      shortlisted: '#8b5cf6',
                      interview: '#06b6d4',
                      offered: '#10b981',
                      hired: '#16a34a',
                    }
                    const color = stageColors[s] || '#6b7280'
                    return (
                      <Link key={s} href={`/my-jobs?filter=${s === 'interview' ? 'interviewing' : s === 'offered' ? 'offers' : s}`} className={styles.pipelineCard} style={{ borderTopColor: color }}>
                        <div className={styles.pipelineCardTop}>
                          <span className={styles.pipelineCardCount} style={{ color }}>{count}</span>
                          <span className={styles.pipelineCardStage}>{STATUS_LABELS[s]}</span>
                        </div>
                        <div className={styles.pipelineCardCandidates}>
                          {candidates.length === 0 ? (
                            <span className={styles.pipelineCardEmpty}>No candidates</span>
                          ) : (
                            candidates.slice(0, 3).map((app, i) => (
                              <div key={i} className={styles.pipelineCardCandidate}>
                                <span className={styles.pipelineCardName}>{app.candidate_name || 'Candidate'}</span>
                                <span className={styles.pipelineCardJob}>{app.job_title || ''}</span>
                              </div>
                            ))
                          )}
                          {candidates.length > 3 && (
                            <span className={styles.pipelineCardMore}>+{candidates.length - 3} more</span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>

                {applications.length > 0 ? (
                  <>
                  <p className={styles.previewLabel}>Showing {recentApps.length} of {totalApplications} applications</p>
                  <div className={styles.recentApps}>
                    {recentApps.map(app => (
                      <Link href={`/my-jobs/${app.job_id}/applications`} key={app.id} className={styles.appCard}>
                        <div className={styles.appCardInfo}>
                          <h4>{app.candidate_name || 'Candidate'}</h4>
                          <p>{app.job_title || 'Position'} &middot; {formatRelativeTime(app.created_at)}</p>
                        </div>
                        <div className={styles.appCardRight}>
                          <span className={`${styles.statusBadge} ${styles[getStatusStyle(app.status)]}`}>
                            {STATUS_LABELS[app.status] || app.status}
                          </span>
                          <span className={styles.appChevron}>&rsaquo;</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128196;</div>
                    <p>No applications yet. Post a job to start receiving applications!</p>
                    <Link href="/post-job" className={styles.cardLink}>Post a Job &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── ACTIVE JOBS ──────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Active Jobs</h2>
                <Link href="/my-jobs" className={styles.cardLink}>Manage Jobs</Link>
              </div>
              <div className={styles.cardBody}>
                {activeJobsList.length > 0 ? (
                  <div className={styles.jobList}>
                    {activeJobsList.map(job => {
                      const appCount = job.application_count || 0
                      const maxApps = 20
                      const fillPct = Math.min((appCount / maxApps) * 100, 100)
                      return (
                        <Link href="/my-jobs" key={job.id} className={styles.jobItem}>
                          <div className={styles.jobItemInfo}>
                            <h4>{job.title}</h4>
                            <div className={styles.jobItemMeta}>
                              <div className={styles.jobProgressWrap}>
                                <div className={styles.jobProgressLabel}>{appCount} apps</div>
                                <div className={styles.jobProgressBar}>
                                  <div className={styles.jobProgressFill} style={{ width: `${fillPct}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className={styles.jobItemStats}>
                            <div className={styles.jobItemStat}>
                              <span className={styles.jobItemStatNum}>{job.views || 0}</span>
                              <span className={styles.jobItemStatLabel}>Views</span>
                            </div>
                            <div className={styles.jobItemStat}>
                              <span className={styles.jobItemStatNum}>{appCount}</span>
                              <span className={styles.jobItemStatLabel}>Apps</span>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128188;</div>
                    <p>No active jobs. Post your first listing!</p>
                    <Link href="/post-job" className={styles.cardLink}>Post a Job &rarr;</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════════════ RIGHT COLUMN ════════════════ */}
          <div className={styles.colRight}>

            {/* ── MESSAGES ───────────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Messages</h2>
                <Link href="/messages" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recentConversations.length > 0 ? (
                  <div className={styles.msgList}>
                    {recentConversations.map(conv => (
                      <Link href="/messages" key={conv.id} className={styles.msgItem}>
                        <div className={styles.msgAvatarWrap}>
                          <div className={styles.msgAvatar}>
                            {conv.participantName ? getInitials(conv.participantName) : '?'}
                          </div>
                          <span className={conv.unreadCount > 0 ? styles.msgOnline : styles.msgOffline} />
                        </div>
                        <div className={styles.msgContent}>
                          <p className={styles.msgSender}>
                            {conv.unreadCount > 0 && <span className={styles.unreadDot} />}
                            {conv.participantName}
                          </p>
                          <p className={styles.msgPreview}>{conv.lastMessage}</p>
                        </div>
                        <span className={styles.msgTime}>{formatRelativeTime(conv.lastMessageAt)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128172;</div>
                    <p>No messages yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
