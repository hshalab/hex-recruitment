'use client'

import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { supabaseProfileToCandidate } from '@/lib/types'
import { Candidate } from '@/lib/mockCandidates'
import { useJobs } from '@/lib/JobsContext'
import { useMessages } from '@/lib/MessagesContext'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { scoreAndRankJobs, RecommendedJob } from '@/lib/recommendations'
import JobCardLink from '@/components/JobCardLink'
import { Boost, getDaysRemaining } from '@/lib/boostTypes'
import { Notification, formatNotificationTime } from '@/lib/mockNotifications'
import { useNotifications } from '@/lib/NotificationsContext'
import Header from '@/components/Header'
import dynamic from 'next/dynamic'

// Lazy-load the boost modal so Stripe.js isn't pulled into the candidate
// dashboard's initial bundle. Only fetches when boostModalOpen flips true.
const ProfileBoostPaymentModal = dynamic(() => import('@/components/ProfileBoostPaymentModal'), {
  ssr: false,
  loading: () => null,
})
import SignedImage from '@/components/SignedImage'
import CandidateCard from '@/components/CandidateCard'
import { STAGE_COLORS } from '@/lib/constants/pipelineStages'
import styles from './page.module.css'

// ── Helpers ─────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
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

// Application status helpers
const STATUS_ORDER = ['pending', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

function getStatusColor(status: string): string {
  if (status === 'pending') return 'statusApplied'
  if (status === 'reviewing' || status === 'shortlisted') return 'statusReviewing'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'statusInterview'
  if (status === 'rejected') return 'statusRejected'
  return 'statusApplied'
}

// Funnel accent per status — reuse the pipeline board's stage colours (single
// source of truth in lib/constants/pipelineStages) so the dashboard funnel and
// the pipeline columns share one palette. 'pending'/Applied isn't a board stage,
// so it gets a warm amber of its own.
function funnelColor(status: string): string {
  if (status === 'pending') return '#f59e0b'
  return (STAGE_COLORS as Record<string, string>)[status] || '#94a3b8'
}
// Soft 14%/32% tint treatment matching the pipeline column count badges, with
// the count itself in the full stage colour for vibrancy.
function funnelChipStyle(status: string): CSSProperties {
  const c = funnelColor(status)
  return {
    background: `color-mix(in srgb, ${c} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${c} 32%, transparent)`,
    color: c,
  }
}

// Profile completion fields
interface ProfileField {
  key: string
  label: string
  check: (c: Candidate) => boolean
  link: string
  // Benefit-framed reward shown next to the prompt ("add X → get Y"), so each
  // nudge offers a payoff rather than reading as a chore.
  benefit?: string
}

// Each field deep-links straight to its own section in Edit Profile via
// ?section=<slug>. JobSeekerProfileForm maps the slug to the right wizard step
// and scrolls to/highlights the control, so "Add →" is genuinely one click
// instead of dropping the user at the top of the form.
const PROFILE_FIELDS: ProfileField[] = [
  { key: 'fullName', label: 'Full name', check: c => !!c.fullName, link: '/profile?section=name' },
  { key: 'phone', label: 'Phone number', check: c => !!c.phone, link: '/profile?section=phone', benefit: 'so employers can reach you' },
  { key: 'location', label: 'Location', check: c => !!c.location, link: '/profile?section=location', benefit: 'see what’s commutable' },
  { key: 'jobTitle', label: 'Job title', check: c => !!c.jobTitle, link: '/profile?section=job-title', benefit: 'match the right roles' },
  { key: 'experience', label: 'Years of experience', check: c => c.yearsExperience > 0, link: '/profile?section=experience', benefit: 'match your level' },
  { key: 'skills', label: 'Skills (at least 3)', check: c => (c.skills || []).length >= 3, link: '/profile?section=skills', benefit: 'see roles that match' },
  { key: 'bio', label: 'About me bio', check: c => !!c.personalBio, link: '/profile?section=bio', benefit: 'stand out to employers' },
  { key: 'cvUrl', label: 'Upload CV', check: c => !!c.cvUrl, link: '/profile?section=cv', benefit: 'apply in one tap' },
  { key: 'photo', label: 'Profile photo', check: c => !!c.profilePictureUrl, link: '/profile?section=photo', benefit: 'get noticed' },
  { key: 'jobSector', label: 'Job sector', check: c => !!c.jobSector, link: '/profile?section=job-sector', benefit: 'see roles that match' },
  { key: 'areas', label: 'Desired work location', check: c => (c.preferredAreas || []).length > 0, link: '/profile?section=areas', benefit: 'only see jobs you can get to' },
  { key: 'salary', label: 'Salary expectations', check: c => !!(c.salaryMin || c.salaryMax || c.desiredSalary), link: '/profile?section=job-preferences', benefit: 'filter to roles that pay' },
  { key: 'jobTypes', label: 'Preferred job type', check: c => !!(c.preferredJobTypes && c.preferredJobTypes.length > 0), link: '/profile?section=job-preferences', benefit: 'see roles that fit' },
  { key: 'workStyle', label: 'Work style (remote/hybrid/on-site)', check: c => !!(c.workLocationPreferences && c.workLocationPreferences.length > 0), link: '/profile?section=job-preferences', benefit: 'match remote or on-site' },
]

// Sector display labels
import { getCategoryLabel } from '@/lib/categories'
const JOB_SECTOR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => getCategoryLabel(key),
})

// ── Circular progress SVG ───────────────────────────────
function CircleProgress({ pct }: { pct: number }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className={styles.progressCircle}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className={styles.progressLabel}>{pct}%</span>
    </div>
  )
}

// ── Skeleton placeholders ───────────────────────────────
function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className={`${styles.skeleton} ${styles.skeletonCard}`} style={{ height }} />
}

// ═════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════

export default function DashboardPage() {
  const router = useRouter()
  const { jobs } = useJobs()
  const { conversations, totalUnreadCount } = useMessages()
  const { savedCount } = useSavedJobs()

  // Core state
  const [user, setUser] = useState<any>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  // Dashboard-only profile photo — kept in local state (NOT on the shared
  // Candidate type) so it can never be read/rendered by employer surfaces.
  const [dashboardPhotoUrl, setDashboardPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [isDiscoverable, setIsDiscoverable] = useState(false)
  // "Not interested" job ids — remembered per device via localStorage (no DB).
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(new Set())
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Recommended row horizontal scroll (desktop arrows; mobile uses touch swipe).
  const recScrollerRef = useRef<HTMLDivElement>(null)
  const scrollRec = (dir: number) => {
    recScrollerRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  // Application data
  const [applications, setApplications] = useState<any[]>([])

  // Profile views
  const [profileViews7d, setProfileViews7d] = useState(0)
  const [profileViews30d, setProfileViews30d] = useState(0)

  // Boost
  const [activeBoost, setActiveBoost] = useState<Boost | null>(null)
  const [boostModalOpen, setBoostModalOpen] = useState(false)

  // Notifications come from the shared NotificationsProvider — no per-page
  // fetch. The dashboard panel just shows the top 5 of the same list.
  const { notifications } = useNotifications()
  const [upcomingInterviews, setUpcomingInterviews] = useState<any[]>([])

  // Activity feed data
  const [profileViewEvents, setProfileViewEvents] = useState<any[]>([])
  const [statusChangeEvents, setStatusChangeEvents] = useState<any[]>([])

  // ── Load data ───────────────────────────────────────────
  useEffect(() => {
    const loadDashboard = async () => {
      // DEV MODE
      if (DEV_MODE) {
        const mockUser = getMockUser()
        const userType = getMockUserType()
        setUser(mockUser)

        if (userType === 'employer') {
          router.replace('/employer/dashboard')
          return
        }

        // Mock candidate profile
        setCandidate({
          id: mockUser?.id || '',
          userId: mockUser?.id || '',
          fullName: mockUser?.user_metadata?.full_name || 'James Wilson',
          profilePictureUrl: null,
          jobTitle: 'Marketing Manager',
          jobSector: 'marketing',
          location: 'Manchester',
          yearsExperience: 5,
          bio: 'Results-driven marketing professional with 5 years of experience across digital and traditional channels.',
          skills: ['Digital Marketing', 'Campaign Management', 'Analytics'],
          workHistory: [],
          cvUrl: null,
          availability: 'Immediately',
          email: mockUser?.email || '',
          phone: '+44 7700 900456',
          createdAt: '2024-01-01',
          education: [],
          languages: [],
          salaryMin: '28000',
          salaryMax: '35000',
          salaryPeriod: 'year' as const,
        })

        // Mock applications
        setApplications([
          { id: '1', job_title: 'Senior Marketing Executive', company: 'Acme Corp', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '2', job_title: 'Content Strategist', company: 'MediaWorks', status: 'pending', created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
          { id: '3', job_title: 'Brand Manager', company: 'Bright Agency', status: 'interview', created_at: new Date(Date.now() - 7 * 86400000).toISOString() },
        ])

        setProfileViews7d(12)
        setProfileViews30d(47)

        // Mock activity feed data
        setProfileViewEvents([
          { id: 'pv1', viewed_at: new Date(Date.now() - 2 * 3600000).toISOString(), company_name: 'Acme Corp', source: 'search' },
          { id: 'pv2', viewed_at: new Date(Date.now() - 8 * 3600000).toISOString(), company_name: 'TechFlow Ltd', source: 'recommendation' },
          { id: 'pv3', viewed_at: new Date(Date.now() - 26 * 3600000).toISOString(), company_name: null, source: 'search' },
          { id: 'pv4', viewed_at: new Date(Date.now() - 3 * 86400000).toISOString(), company_name: 'Bright Agency', source: null },
        ])
        setStatusChangeEvents([
          { id: 'sc1', job_title: 'Senior Marketing Executive', company: 'Acme Corp', status: 'shortlisted', updated_at: new Date(Date.now() - 4 * 3600000).toISOString() },
          { id: 'sc2', job_title: 'Brand Manager', company: 'Bright Agency', status: 'interview', updated_at: new Date(Date.now() - 2 * 86400000).toISOString() },
        ])

        setLoading(false)
        return
      }

      // PRODUCTION MODE
      // Client and server share one cookie-backed session store, so
      // getSession() reads exactly what the server wrote — including the fresh
      // OAuth-redirect case that used to need a separate cookie hydration.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.user_metadata?.role === 'employer') { router.replace('/employer/dashboard'); return }

      setUser(session.user)
      const userId = session.user.id

      // Fetch candidate profile
      try {
        const { data: profileData } = await supabase
          .from('candidate_profiles')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (profileData) {
          setCandidate(supabaseProfileToCandidate(profileData))
          setDashboardPhotoUrl(profileData.dashboard_photo_url || null)
          setIsDiscoverable(!!profileData.is_discoverable)
        } else {
          // Try employees table as fallback
          const { data: empData } = await supabase
            .from('employees')
            .select('*')
            .eq('user_id', userId)
            .single()
          if (empData) {
            setCandidate({
              id: userId,
              userId,
              fullName: session.user.user_metadata?.full_name || '',
              profilePictureUrl: empData.profile_photo_url || null,
              jobTitle: empData.position || '',
              location: empData.location || '',
              yearsExperience: empData.experience_years || 0,
              bio: empData.bio || '',
              skills: empData.skills || [],
              workHistory: [],
              cvUrl: empData.cv_url || null,
              availability: 'Available',
              email: session.user.email || '',
              phone: empData.phone || '',
              createdAt: empData.created_at || '',
              education: [],
              languages: [],
            })
          }
        }
      } catch {
        // Profile tables may not exist yet
      }

      // Fetch applications
      try {
        const { data: appData } = await supabase
          .from('job_applications')
          .select('id, job_id, job_title, company, status, created_at')
          .eq('candidate_id', userId)
          .neq('status', 'withdrawn')
          .order('created_at', { ascending: false })
          .limit(50)
        if (appData) setApplications(appData)
      } catch { /* table may not exist */ }

      // Fetch profile views
      try {
        const now = new Date()
        const d7 = new Date(now.getTime() - 7 * 86400000).toISOString()
        const d30 = new Date(now.getTime() - 30 * 86400000).toISOString()

        const [res7, res30] = await Promise.all([
          supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', userId).gte('viewed_at', d7),
          supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', userId).gte('viewed_at', d30),
        ])
        setProfileViews7d(res7.count || 0)
        setProfileViews30d(res30.count || 0)
      } catch { /* table may not exist */ }

      // Fetch active boost
      try {
        const { data: boostData } = await supabase
          .from('boosts')
          .select('*')
          .eq('user_id', userId)
          .eq('boost_type', 'profile')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1)
        if (boostData && boostData.length > 0) setActiveBoost(boostData[0])
      } catch { /* table may not exist */ }

      // Notifications now come from useNotifications() — no per-page fetch.

      // Fetch upcoming interviews for this candidate
      try {
        const todayStr = new Date().toISOString().slice(0, 10)
        const { data: interviewData } = await supabase
          .from('interviews')
          .select('id, interview_date, interview_time, interview_type, duration_minutes, status, location_or_link, jobs(title, company)')
          .eq('candidate_id', userId)
          .gte('interview_date', todayStr)
          .in('status', ['scheduled', 'confirmed', 'pending_selection'])
          .order('interview_date', { ascending: true })
          .limit(5)
        if (interviewData) setUpcomingInterviews(interviewData)
      } catch { /* table may not exist */ }

      // Fetch recent profile views with employer company names
      try {
        const d30view = new Date(Date.now() - 30 * 86400000).toISOString()
        const { data: viewsData } = await supabase
          .from('profile_views')
          .select('id, viewer_id, viewed_at, source')
          .eq('profile_id', userId)
          .gte('viewed_at', d30view)
          .order('viewed_at', { ascending: false })
          .limit(10)

        if (viewsData && viewsData.length > 0) {
          const viewerIds = Array.from(new Set(viewsData.map((v: any) => v.viewer_id)))
          try {
            const { data: employerData } = await supabase
              .from('employer_profiles')
              .select('user_id, company_name')
              .in('user_id', viewerIds)

            const companyMap: Record<string, string> = {}
            if (employerData) {
              employerData.forEach((ep: any) => { companyMap[ep.user_id] = ep.company_name })
            }
            setProfileViewEvents(viewsData.map((v: any) => ({
              ...v,
              company_name: companyMap[v.viewer_id] || null,
            })))
          } catch {
            setProfileViewEvents(viewsData.map((v: any) => ({ ...v, company_name: null })))
          }
        }
      } catch { /* table may not exist */ }

      // Fetch recent application status changes
      try {
        const { data: changedApps } = await supabase
          .from('job_applications')
          .select('id, job_title, company, status, updated_at')
          .eq('candidate_id', userId)
          .gt('updated_at', new Date(Date.now() - 30 * 86400000).toISOString())
          .neq('status', 'applied')
          .neq('status', 'pending')
          .order('updated_at', { ascending: false })
          .limit(5)
        if (changedApps) setStatusChangeEvents(changedApps)
      } catch { /* table may not exist */ }

      setLoading(false)
    }

    loadDashboard()
  }, [router])

  // ── Derived data ────────────────────────────────────────

  // Dashboard-only profile photo upload. Stores the storage PATH (rendered via
  // SignedImage) on candidate_profiles.dashboard_photo_url — a column read ONLY
  // here, never on any employer surface, so the hard constraint holds.
  const triggerPhotoUpload = () => photoInputRef.current?.click()
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user?.id) return
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    setPhotoUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `photos/${user.id}/dashboard-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('profiles').upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('candidate_profiles').update({ dashboard_photo_url: path }).eq('user_id', user.id)
      if (dbErr) throw dbErr
      setDashboardPhotoUrl(path)
    } catch (err) {
      console.error('Dashboard photo upload failed:', err)
      alert('Could not upload your photo. Please try again.')
    } finally {
      setPhotoUploading(false)
    }
  }
  const handlePhotoRemove = async () => {
    if (!user?.id || !dashboardPhotoUrl) return
    if (!window.confirm('Remove your profile photo?')) return
    setPhotoUploading(true)
    try {
      const { error } = await supabase.from('candidate_profiles').update({ dashboard_photo_url: null }).eq('user_id', user.id)
      if (error) throw error
      setDashboardPhotoUrl(null)
    } catch (err) {
      console.error('Dashboard photo remove failed:', err)
      alert('Could not remove your photo. Please try again.')
    } finally {
      setPhotoUploading(false)
    }
  }
  // "Make my profile visible to employers" → writes is_discoverable (default
  // false). Optimistic; reverts on error.
  const handleToggleDiscoverable = async (next: boolean) => {
    if (!user?.id) return
    setIsDiscoverable(next)
    const { error } = await supabase.from('candidate_profiles').update({ is_discoverable: next }).eq('user_id', user.id)
    if (error) {
      console.error('Visibility toggle failed:', error)
      setIsDiscoverable(!next)
      alert('Could not update your visibility. Please try again.')
    }
  }

  // "Not interested" dismissals for the recommended row — persisted in
  // localStorage (per device), so dismissed jobs stay gone across visits.
  const DISMISSED_KEY = 'thrive_dismissed_jobs'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY)
      if (raw) setDismissedJobIds(new Set(JSON.parse(raw)))
    } catch { /* ignore malformed/unavailable storage */ }
  }, [])
  const dismissJob = (id: string) => {
    setDismissedJobIds(prev => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      return next
    })
  }

  // The photo a candidate signed in with (Google / LinkedIn OAuth) — the same
  // one already shown in the header avatar. Using it means someone who signed
  // up with Google is not asked for a photo they've effectively already given,
  // and never sees bare initials where their face should be.
  const oauthPhotoUrl: string | null =
    user?.user_metadata?.profile_photo || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null

  // What the card should actually display: an explicitly uploaded dashboard
  // photo wins, then the saved profile picture, then the OAuth avatar.
  const effectivePhotoUrl: string | null =
    dashboardPhotoUrl || candidate?.profilePictureUrl || oauthPhotoUrl

  // Profile completion. The "photo" field counts ANY of those sources — being
  // prompted to "add a photo" while your face is on screen is the bug.
  const { completionPct, missingFields } = useMemo(() => {
    const check = (f: typeof PROFILE_FIELDS[number]) =>
      f.key === 'photo' ? !!effectivePhotoUrl : (candidate ? f.check(candidate) : false)
    if (!candidate) return { completionPct: 0, missingFields: PROFILE_FIELDS }
    const pct = Math.round((PROFILE_FIELDS.filter(check).length / PROFILE_FIELDS.length) * 100)
    const missing = PROFILE_FIELDS.filter(f => !check(f))
    return { completionPct: pct, missingFields: missing }
  }, [candidate, effectivePhotoUrl])

  // Application counts by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    STATUS_ORDER.forEach(s => { counts[s] = 0 })
    applications.forEach(a => {
      const s = (a.status || 'pending').toLowerCase()
      if (counts[s] !== undefined) counts[s]++
      else counts['pending']++
    })
    return counts
  }, [applications])

  // Recent 5 applications
  const recentApps = useMemo(() => applications.slice(0, 5), [applications])

  // Recommended jobs (top 3)
  const recommendedJobs: RecommendedJob[] = useMemo(() => {
    if (!candidate || jobs.length === 0) return []
    const appliedIds = new Set(applications.map((a: any) => a.job_id).filter(Boolean))
    return scoreAndRankJobs(jobs, candidate, appliedIds, [])
      .filter(j => !dismissedJobIds.has(j.id))
      .slice(0, 10)
  }, [candidate, jobs, applications, dismissedJobIds])

  // Recent conversations (top 3)
  const recentConversations = useMemo(() => {
    return [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  }, [conversations])

  // Profile view trend
  const viewTrend = useMemo(() => {
    const weeklyRate = profileViews7d
    const prevWeeklyRate = Math.max(0, profileViews30d - profileViews7d) / 3
    if (weeklyRate > prevWeeklyRate) return 'up'
    if (weeklyRate < prevWeeklyRate) return 'down'
    return 'neutral'
  }, [profileViews7d, profileViews30d])

  // ── Career insights (derived from already-loaded jobs) ──

  const sectorJobs = useMemo(() => {
    if (!candidate?.jobSector || jobs.length === 0) return []
    const sector = candidate.jobSector.toLowerCase()
    return jobs.filter(job => {
      const cat = (job.category || '').toLowerCase()
      return cat === sector || cat.includes(sector) || sector.includes(cat)
    })
  }, [candidate, jobs])

  const salaryInsights = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const candPeriod = candidate?.salaryPeriod || 'year'
    const yearlyJobs = sectorJobs.filter(j => j.salaryPeriod === 'year')
    const hourlyJobs = sectorJobs.filter(j => j.salaryPeriod === 'hour')
    const targetJobs = candPeriod === 'hour'
      ? (hourlyJobs.length > 0 ? hourlyJobs : yearlyJobs)
      : (yearlyJobs.length > 0 ? yearlyJobs : hourlyJobs)
    if (targetJobs.length === 0) return null
    const period = targetJobs[0].salaryPeriod
    const avgMin = Math.round(targetJobs.reduce((s, j) => s + j.salaryMin, 0) / targetJobs.length)
    const avgMax = Math.round(targetJobs.reduce((s, j) => s + j.salaryMax, 0) / targetJobs.length)
    const candMin = candidate?.salaryMin ? Number(candidate.salaryMin) : null
    const candMax = candidate?.salaryMax ? Number(candidate.salaryMax) : null
    return { avgMin, avgMax, period, candMin, candMax, jobCount: targetJobs.length }
  }, [sectorJobs, candidate])

  const demandTrend = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const now = Date.now()
    const d30 = now - 30 * 86400000
    const d60 = now - 60 * 86400000
    let last30 = 0
    let prev30 = 0
    sectorJobs.forEach(job => {
      const posted = new Date(job.postedDate || job.postedAt).getTime()
      if (isNaN(posted)) return
      if (posted >= d30) last30++
      else if (posted >= d60) prev30++
    })
    const pctChange = prev30 === 0
      ? (last30 > 0 ? 100 : 0)
      : Math.round(((last30 - prev30) / prev30) * 100)
    return { last30, prev30, pctChange }
  }, [sectorJobs])

  const topSkillsInDemand = useMemo(() => {
    if (sectorJobs.length === 0) return []
    const skillFreq: Record<string, number> = {}
    sectorJobs.forEach(job => {
      (job.skillsRequired || []).forEach((skill: string) => {
        const normalized = skill.trim()
        if (normalized) skillFreq[normalized] = (skillFreq[normalized] || 0) + 1
      })
    })
    const sorted = Object.entries(skillFreq).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const candidateSkillsLower = (candidate?.skills || []).map(s => s.toLowerCase().trim())
    return sorted.map(([skill, count]) => ({
      skill,
      count,
      matched: candidateSkillsLower.some(cs => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs)),
    }))
  }, [sectorJobs, candidate])

  const competitionLevel = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const totalApps = sectorJobs.reduce((s, j) => s + (j.applicationCount || 0), 0)
    const avg = totalApps / sectorJobs.length
    let level: 'Low' | 'Medium' | 'High'
    let color: string
    if (avg < 5) { level = 'Low'; color = '#22c55e' }
    else if (avg <= 15) { level = 'Medium'; color = '#f59e0b' }
    else { level = 'High'; color = '#ef4444' }
    return { level, color, avgAppsPerJob: Math.round(avg), totalJobs: sectorJobs.length }
  }, [sectorJobs])

  const activityFeed = useMemo(() => {
    const events: Array<{ id: string; type: string; icon: string; title: string; subtitle: string; timestamp: string }> = []

    profileViewEvents.forEach(pv => {
      events.push({
        id: `pv-${pv.id}`, type: 'profile_view', icon: '\uD83D\uDC41',
        title: pv.company_name ? `${pv.company_name} viewed your profile` : 'An employer viewed your profile',
        subtitle: pv.source ? `via ${pv.source}` : '',
        timestamp: pv.viewed_at,
      })
    })

    statusChangeEvents.forEach(app => {
      events.push({
        id: `sc-${app.id}`, type: 'status_change', icon: '\uD83D\uDCCB',
        title: `${app.company || 'Employer'} updated your application`,
        subtitle: `${app.job_title || 'Position'} \u2014 now ${STATUS_LABELS[app.status] || app.status}`,
        timestamp: app.updated_at,
      })
    })

    const d7ago = Date.now() - 7 * 86400000
    sectorJobs
      .filter(j => new Date(j.postedDate || j.postedAt).getTime() >= d7ago)
      .slice(0, 3)
      .forEach(job => {
        events.push({
          id: `jm-${job.id}`, type: 'job_match', icon: '\uD83C\uDFAF',
          title: `New match: ${job.title}`,
          subtitle: `${job.company} \u00B7 ${job.location}`,
          timestamp: new Date(job.postedDate || job.postedAt).toISOString(),
        })
      })

    if (activeBoost) {
      const boostStart = new Date(activeBoost.starts_at).getTime()
      const boostedViews = profileViewEvents.filter(pv => new Date(pv.viewed_at).getTime() >= boostStart)
      if (boostedViews.length > 0) {
        events.push({
          id: 'boost-summary', type: 'boost_view', icon: '\u26A1',
          title: `Boost attracted ${boostedViews.length} profile view${boostedViews.length !== 1 ? 's' : ''}`,
          subtitle: `Since ${new Date(activeBoost.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
          timestamp: activeBoost.starts_at,
        })
      }
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return events.slice(0, 8)
  }, [profileViewEvents, statusChangeEvents, sectorJobs, activeBoost])

  // ── Notification icon helper ────────────────────────────
  function notifIcon(type: string): string {
    switch (type) {
      case 'new_application': case 'application_update': return '\uD83D\uDCCB'
      case 'job_match': return '\uD83C\uDFAF'
      case 'message_received': case 'employer_message': return '\uD83D\uDCAC'
      case 'profile_view': case 'profile_viewed': return '\uD83D\uDC41'
      case 'job_approved': return '\u2705'
      case 'job_saved': return '\uD83D\uDD16'
      default: return '\uD83D\uDD14'
    }
  }

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.dashboardWrap}>
          <div className={styles.welcomeHeader}>
            <div className={`${styles.skeleton} ${styles.skeletonCircle}`} />
            <div style={{ flex: 1 }}>
              <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: '200px' }} />
              <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} style={{ width: '140px' }} />
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.colLeft}>
              <SkeletonCard height={180} />
              <SkeletonCard height={260} />
              <SkeletonCard height={200} />
              <SkeletonCard height={280} />
              <SkeletonCard height={220} />
            </div>
            <div className={styles.colRight}>
              <SkeletonCard height={100} />
              <SkeletonCard height={180} />
              <SkeletonCard height={120} />
              <SkeletonCard height={80} />
            </div>
          </div>
        </div>
      </main>
    )
  }

  const displayName = candidate?.fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'

  // Incomplete-field prompts for the dashboard card. Photo opens the inline
  // uploader; everything else deep-links to the right /profile section.
  // Job title is excluded here because the card renders its own prompt in the
  // role slot — otherwise one field would be asked for twice in one card.
  const cardMissing = missingFields
    .filter(f => f.key !== 'jobTitle')
    .map(f => ({
      key: f.key,
      label: f.label.replace(/\s*\(.*\)/, ''),
      benefit: f.benefit,
      onAdd: f.key === 'photo' ? triggerPhotoUpload : () => router.push(f.link),
    }))
    .slice(0, 6)

  const jobTitleField = PROFILE_FIELDS.find(f => f.key === 'jobTitle')!
  const needsJobTitle = missingFields.some(f => f.key === 'jobTitle')

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <main className={styles.page}>
      <Header />

      <div className={styles.dashboardWrap}>
        {/* ── 1. LIGHT GREETING (no boxed header band) ────────── */}
        <div className={styles.greetingRow}>
          <div>
            <h1 className={styles.greeting}>{getGreeting()}, {displayName.split(' ')[0]}</h1>
          </div>
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />

        <div className={styles.grid}>
          {/* ════════════════════ LEFT COLUMN ═════════════════ */}
          <div className={styles.colLeft}>

            {/* ── 2. YOUR PROFILE — shared dual-mode card (dashboard) ── */}
            <div className={styles.mProfile}>
            {candidate ? (
              <CandidateCard
                candidate={candidate}
                mode="dashboard"
                dashboardPhotoUrl={effectivePhotoUrl}
                // Only an uploaded dashboard photo can be removed — there's
                // nothing of ours to delete when the picture came from Google.
                photoRemovable={!!dashboardPhotoUrl}
                photoUploading={photoUploading}
                onPhotoClick={triggerPhotoUpload}
                onPhotoRemove={handlePhotoRemove}
                completionPct={completionPct}
                fieldsComplete={PROFILE_FIELDS.length - missingFields.length}
                fieldsTotal={PROFILE_FIELDS.length}
                missingFields={cardMissing}
                onAddJobTitle={needsJobTitle ? () => router.push(jobTitleField.link) : undefined}
                isDiscoverable={isDiscoverable}
                onToggleDiscoverable={handleToggleDiscoverable}
              />
            ) : (
              <div className={`${styles.card} ${styles.aYellow}`}>
                <div className={styles.cardBody}>
                  <p>Set up your profile so employers can find you. <Link href="/profile" className={styles.cardLink}>Get started &rarr;</Link></p>
                </div>
              </div>
            )}
            </div>

            {/* ── 3. APPLICATION TRACKER ───────────────────── */}
            <div className={`${styles.card} ${styles.aBlue} ${styles.mApplications}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Applications</h2>
                <Link href="/applications" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {applications.length > 0 ? (
                  <>
                    {/* Pipeline */}
                    <div className={styles.pipeline}>
                      {STATUS_ORDER.map(s => (
                        <div key={s} className={styles.pipelineStage}>
                          <div className={styles.pipelineCount} style={funnelChipStyle(s)}>
                            {statusCounts[s]}
                          </div>
                          <span className={styles.pipelineLabel}>{STATUS_LABELS[s]}</span>
                        </div>
                      ))}
                    </div>

                    {/* Recent applications */}
                    <div className={styles.recentApps}>
                      {recentApps.map(app => (
                        <Link key={app.id} href="/applications" className={styles.appCard} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <div className={styles.appCardInfo}>
                            <h4>{app.job_title || 'Untitled Position'}</h4>
                            <p>{app.company || 'Company'} &middot; {formatRelativeTime(app.created_at)}</p>
                          </div>
                          <span className={`${styles.statusBadge} ${styles[getStatusColor(app.status)]}`}>
                            {STATUS_LABELS[app.status] || app.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128196;</div>
                    <p>No applications yet. Start browsing jobs!</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── 4. RECOMMENDED JOBS ─────────────────────── */}
            <div className={`${styles.card} ${styles.aViolet} ${styles.mRecommended}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recommended for You</h2>
                <Link href="/jobs?browse=all" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recommendedJobs.length > 0 ? (
                  <div className={styles.recScrollWrap}>
                    <button
                      type="button"
                      className={`${styles.recNav} ${styles.recNavPrev}`}
                      aria-label="Scroll recommended jobs left"
                      onClick={() => scrollRec(-1)}
                    >
                      &lsaquo;
                    </button>
                    <div className={styles.recScroller} ref={recScrollerRef}>
                      {recommendedJobs.map(job => (
                        <JobCardLink key={job.id} job={job} className={styles.recItem}>
                          <button
                            type="button"
                            className={styles.recDismiss}
                            aria-label={`Not interested in ${job.title}`}
                            title="Not interested"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissJob(job.id) }}
                          >
                            &times;
                          </button>
                        </JobCardLink>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`${styles.recNav} ${styles.recNavNext}`}
                      aria-label="Scroll recommended jobs right"
                      onClick={() => scrollRec(1)}
                    >
                      &rsaquo;
                    </button>
                  </div>
                ) : !candidate?.jobSector && !candidate?.jobTitle && (!candidate?.skills || candidate.skills.length === 0) ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#127919;</div>
                    <p>Complete your profile to get personalised job recommendations.</p>
                    <Link href="/profile" className={styles.cardLink}>Complete Profile &rarr;</Link>
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128269;</div>
                    <p>No matching jobs right now. We&apos;ll notify you when new opportunities match your profile.</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse All Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── 5. CAREER INSIGHTS ─────────────────────── */}
            <div className={`${styles.card} ${styles.aCyan} ${styles.mInsights}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Career Insights</h2>
                {candidate?.jobSector && (
                  <span className={styles.insightsSectorBadge}>
                    {JOB_SECTOR_LABELS[candidate.jobSector] || candidate.jobSector}
                  </span>
                )}
              </div>
              <div className={styles.cardBody}>
                {!candidate?.jobSector ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128202;</div>
                    <p>Set your job sector to see career insights tailored to your industry.</p>
                    <Link href="/profile" className={styles.cardLink}>Complete Profile &rarr;</Link>
                  </div>
                ) : (
                  <>
                    {/* Salary Range Bar */}
                    {salaryInsights && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>
                          Average Salary Range
                          <span className={styles.insightMeta}>
                            Based on {salaryInsights.jobCount} job{salaryInsights.jobCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className={styles.salaryBar}>
                          <div className={styles.salaryBarTrack}>
                            {salaryInsights.candMin != null && salaryInsights.avgMax > salaryInsights.avgMin && (
                              <div
                                className={styles.salaryBarMarker}
                                style={{
                                  left: `${Math.max(0, Math.min(100,
                                    ((salaryInsights.candMin - salaryInsights.avgMin) /
                                    (salaryInsights.avgMax - salaryInsights.avgMin)) * 100
                                  ))}%`,
                                }}
                              />
                            )}
                          </div>
                          <div className={styles.salaryBarLabels}>
                            <span>
                              {salaryInsights.period === 'hour'
                                ? `\u00A3${salaryInsights.avgMin}/hr`
                                : `\u00A3${Math.round(salaryInsights.avgMin / 1000)}k`}
                            </span>
                            <span>
                              {salaryInsights.period === 'hour'
                                ? `\u00A3${salaryInsights.avgMax}/hr`
                                : `\u00A3${Math.round(salaryInsights.avgMax / 1000)}k`}
                            </span>
                          </div>
                        </div>
                        {salaryInsights.candMin != null && (
                          <p className={styles.salaryYouLabel}>
                            &#9650; Your range: {salaryInsights.period === 'hour'
                              ? `\u00A3${salaryInsights.candMin}-\u00A3${salaryInsights.candMax}/hr`
                              : `\u00A3${Math.round(salaryInsights.candMin / 1000)}k-\u00A3${Math.round((salaryInsights.candMax || salaryInsights.candMin) / 1000)}k`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Demand Trend */}
                    {demandTrend && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Sector Demand</div>
                        <div className={styles.demandRow}>
                          <span className={styles.demandCount}>{demandTrend.last30}</span>
                          <span className={styles.demandText}>jobs posted in last 30 days</span>
                          <span className={
                            demandTrend.pctChange > 0 ? styles.trendUp
                            : demandTrend.pctChange < 0 ? styles.trendDown
                            : styles.trendNeutral
                          }>
                            {demandTrend.pctChange > 0 ? '\u25B2' : demandTrend.pctChange < 0 ? '\u25BC' : '\u2014'}
                            {' '}{Math.abs(demandTrend.pctChange)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Top Skills in Demand */}
                    {topSkillsInDemand.length > 0 && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Top Skills in Demand</div>
                        <div className={styles.skillPills}>
                          {topSkillsInDemand.map(({ skill, count, matched }) => (
                            <span
                              key={skill}
                              className={`${styles.skillPill} ${matched ? styles.skillPillGold : styles.skillPillGrey}`}
                            >
                              {skill}
                              <span className={styles.skillPillCount}>{count}</span>
                              {!matched && (
                                <Link href="/profile" className={styles.skillPillAdd} onClick={(e) => e.stopPropagation()}>
                                  +Add
                                </Link>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Competition Level */}
                    {competitionLevel && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Competition Level</div>
                        <div className={styles.competitionRow}>
                          <span
                            className={styles.competitionBadge}
                            style={{ background: competitionLevel.color + '18', color: competitionLevel.color }}
                          >
                            {competitionLevel.level}
                          </span>
                          <span className={styles.competitionMeta}>
                            ~{competitionLevel.avgAppsPerJob} applicants per job across {competitionLevel.totalJobs} listings
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Fallback if no data */}
                    {!salaryInsights && !demandTrend && topSkillsInDemand.length === 0 && !competitionLevel && (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>&#128202;</div>
                        <p>Not enough job data in your sector yet. Check back soon!</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── 6. ACTIVITY FEED ───────────────────────── */}
            <div className={`${styles.card} ${styles.aEmerald} ${styles.mActivity}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Activity</h2>
              </div>
              <div className={styles.cardBody}>
                {activityFeed.length > 0 ? (
                  <div className={styles.timeline}>
                    {activityFeed.map((event, idx) => (
                      <div key={event.id} className={styles.timelineItem}>
                        {idx < activityFeed.length - 1 && <div className={styles.timelineLine} />}
                        <div className={styles.timelineDot}>
                          <span className={styles.timelineIcon}>{event.icon}</span>
                        </div>
                        <div className={styles.timelineContent}>
                          <p className={styles.timelineTitle}>{event.title}</p>
                          {event.subtitle && <p className={styles.timelineSubtitle}>{event.subtitle}</p>}
                          <span className={styles.timelineTime}>{formatRelativeTime(event.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128340;</div>
                    <p>No recent activity. Apply to jobs to see updates here!</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════════════════ RIGHT COLUMN ════════════════ */}
          <div className={styles.colRight}>

            {/* ── 5. PROFILE VIEWS ────────────────────────── */}
            <div className={`${styles.card} ${styles.aGreen} ${styles.mViews}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Profile Views</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.statRow}>
                  <div className={styles.stat}>
                    <span className={styles.statNumber}>{profileViews7d}</span>
                    <span className={styles.statLabel}>Last 7 days</span>
                    {viewTrend === 'up' && <span className={styles.trendUp}>&#9650; Trending up</span>}
                    {viewTrend === 'down' && <span className={styles.trendDown}>&#9660; Trending down</span>}
                    {viewTrend === 'neutral' && <span className={styles.trendNeutral}>&#8212; Steady</span>}
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNumber}>{profileViews30d}</span>
                    <span className={styles.statLabel}>Last 30 days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 6. MESSAGES ─────────────────────────────── */}
            <div className={`${styles.card} ${styles.aAmber} ${styles.mMessages}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  Messages
                  {totalUnreadCount > 0 && (
                    <span style={{
                      background: '#0f172a',
                      color: '#FFE500',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      marginLeft: '0.35rem',
                    }}>
                      {totalUnreadCount}
                    </span>
                  )}
                </h2>
                <Link href="/messages" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recentConversations.length > 0 ? (
                  <div className={styles.msgList}>
                    {recentConversations.map(conv => (
                      <Link href="/messages" key={conv.id} className={styles.msgItem}>
                        <div className={styles.msgAvatar}>
                          {conv.participantName ? getInitials(conv.participantName) : '?'}
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

            {/* ── 7. BOOST STATUS ─────────────────────────── */}
            <div className={`${styles.card} ${styles.aYellow} ${styles.mBoost}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Profile Boost</h2>
              </div>
              <div className={styles.cardBody}>
                {activeBoost ? (
                  <>
                    <div className={styles.boostActive}>
                      <div className={styles.boostActiveLabel}>&#9889; Profile Boosted</div>
                      <span className={styles.boostDays}>{getDaysRemaining(activeBoost.expires_at)} days remaining</span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-gray)', textAlign: 'center', margin: 0 }}>
                      Your profile appears first in employer searches with a Featured badge.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-gray)', margin: '0 0 0.75rem' }}>
                      Stand out to employers — appear first in search results with a Featured badge.
                    </p>
                    <button className={styles.boostBtn} onClick={() => setBoostModalOpen(true)}>
                      &#9889; Boost Profile
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── 8. SAVED JOBS ───────────────────────────── */}
            <div className={`${styles.card} ${styles.aGrey} ${styles.mSaved}`}>
              <div className={styles.cardBody} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--black)' }}>{savedCount}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-gray)', marginLeft: '0.5rem' }}>Saved Jobs</span>
                </div>
                <Link href="/jobs" className={styles.cardLink}>View &rarr;</Link>
              </div>
            </div>

            {/* ── 9. UPCOMING INTERVIEWS ──────────────────── */}
            {upcomingInterviews.length > 0 && (
              <div className={`${styles.card} ${styles.aCyan} ${styles.mInterviews}`}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Upcoming Interviews</h2>
                  <Link href="/applications" className={styles.cardLink}>View all &rarr;</Link>
                </div>
                <div className={styles.cardBody}>
                  {upcomingInterviews.map((iv: any) => {
                    const job = Array.isArray(iv.jobs) ? iv.jobs[0] : iv.jobs
                    // The SELECT above filters via .gte('interview_date', todayStr)
                    // which excludes NULL rows, so iv.interview_date should be
                    // present here. Defensive in case the query changes — render
                    // "Awaiting scheduling" rather than "Invalid Date".
                    // See audit fix #1b.
                    const dateStr = iv.interview_date
                      ? new Date(iv.interview_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                      : 'Awaiting scheduling'
                    const [h, m] = (iv.interview_time || '').split(':').map(Number)
                    const timeStr = !isNaN(h) ? `${h % 12 || 12}:${String(m || 0).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}` : (iv.interview_time || '')
                    const needsAction = iv.status === 'scheduled'
                    return (
                      <div key={iv.id} style={{ padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>📅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>{job?.title || 'Interview'}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{dateStr} at {timeStr} · {job?.company || ''}</div>
                        </div>
                        {needsAction && (
                          <Link href="/applications" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#d97706', textDecoration: 'none', background: '#fffbeb', padding: '0.25rem 0.5rem', borderRadius: 4 }}>
                            Confirm
                          </Link>
                        )}
                        {iv.status === 'confirmed' && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a' }}>Confirmed</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 10. NOTIFICATIONS ───────────────────────── */}
            <div className={`${styles.card} ${styles.aBlue} ${styles.mNotifications}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Notifications</h2>
              </div>
              <div className={styles.cardBody}>
                {notifications.length > 0 ? (
                  <div className={styles.notifList}>
                    {notifications.slice(0, 3).map(n => (
                      <Link href={n.link || '#'} key={n.id} className={styles.notifItem}>
                        <span className={styles.notifIcon}>{notifIcon(n.type)}</span>
                        <div className={styles.notifContent}>
                          <p className={styles.notifTitle}>{n.title}</p>
                          {n.message && <p className={styles.notifMsg}>{n.message}</p>}
                        </div>
                        <span className={styles.notifTime}>{formatNotificationTime(n.created_at)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128276;</div>
                    <p>No notifications yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Boost Payment Modal — only mounted when the user opens it,
          so Stripe.js isn't fetched on every candidate dashboard load. */}
      {boostModalOpen && (
        <ProfileBoostPaymentModal
          isOpen={boostModalOpen}
          onClose={() => setBoostModalOpen(false)}
          onSuccess={async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              try {
                const { data } = await supabase
                  .from('boosts')
                  .select('*')
                  .eq('user_id', session.user.id)
                  .eq('boost_type', 'profile')
                  .eq('is_active', true)
                  .gt('expires_at', new Date().toISOString())
                  .order('expires_at', { ascending: false })
                  .limit(1)
                if (data && data.length > 0) setActiveBoost(data[0])
              } catch { /* ignore */ }
            }
          }}
          userId={user?.id || ''}
          userEmail={user?.email || ''}
          targetId={user?.id || ''}
        />
      )}
    </main>
  )
}
