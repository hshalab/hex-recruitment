'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { fallbackVariant } from '@/lib/jobBanner'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { Candidate, devMockCandidates } from '@/lib/mockCandidates'
import { DEV_MODE } from '@/lib/mockAuth'
import { supabaseProfileToCandidate } from '@/lib/types'
import {
  MapPin, Clock, Briefcase, GraduationCap, User, Wrench,
  Award, Heart, Globe, MessageSquare, FileDown, Sliders
} from 'lucide-react'
import { Boost } from '@/lib/boostTypes'
import { isEmployerEntitled } from '@/lib/foundingEntitlement'
import { scoreAllCandidates } from '@/lib/recommendations'
import { supabaseJobToJob } from '@/lib/types'
import { Job } from '@/lib/mockJobs'
import styles from './page.module.css'

type Filters = {
  availability: Set<string>
  experienceLevel: Set<string>
  workPreference: Set<string>
  skills: Set<string>
}

const emptyFilters = (): Filters => ({
  availability: new Set(),
  experienceLevel: new Set(),
  workPreference: new Set(),
  skills: new Set(),
})

const candidateFilterSections = [
  { key: 'availability' as const, title: 'Availability', options: ['Available immediately', '2 weeks notice', '1 month notice', 'Flexible'] },
  { key: 'experienceLevel' as const, title: 'Experience Level', options: ['No experience', 'Entry level (0-2 years)', 'Mid level (3-5 years)', 'Senior (6-10 years)', 'Executive (10+ years)'] },
  { key: 'workPreference' as const, title: 'Work Preference', options: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Freelance'] },
  { key: 'skills' as const, title: 'Key Skills', options: ['Right to Work', 'NI Number', 'Food Hygiene', 'First Aid', 'DBS Checked', 'Driving Licence', 'Language Skills', 'Management Experience'] },
]

import { categories as sharedCategories, getCategoryLabel } from '@/lib/categories'
const categories = [{ id: 'all', label: 'All Candidates' }, ...sharedCategories]

const JOB_SECTOR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => getCategoryLabel(key),
})

// Map candidate job title to sector categories
const getCandidateSector = (candidate: { jobTitle: string }): string => {
  const titleLower = candidate.jobTitle.toLowerCase()

  // Hospitality Tourism & Sport (check first — most specific)
  if (['chef', 'cook', 'waiter', 'waitress', 'bartender', 'bar ', 'barista', 'kitchen porter', 'porter', 'housekeeper', 'concierge', 'hotel', 'event', 'banquet', 'catering', 'sushi', 'server', 'host', 'coffee', 'restaurant', 'sommelier'].some(k => titleLower.includes(k)))
    return 'hospitality'

  // Healthcare
  if (['nurse', 'doctor', 'care', 'health', 'medical', 'pharmacy', 'dental'].some(k => titleLower.includes(k)))
    return 'healthcare'

  // Retail & Sales
  if (['sales', 'retail', 'shop', 'store', 'cashier', 'merchandis'].some(k => titleLower.includes(k)))
    return 'retail'

  // Teaching & Education
  if (['teacher', 'teaching', 'tutor', 'lecturer', 'education', 'training', 'early years'].some(k => titleLower.includes(k)))
    return 'teaching'

  // Transport & Logistics
  if (['driver', 'delivery', 'logistics', 'warehouse', 'transport'].some(k => titleLower.includes(k)))
    return 'transport'

  // Property & Construction
  if (['builder', 'plumber', 'electrician', 'construction', 'property', 'estate agent'].some(k => titleLower.includes(k)))
    return 'property'

  // Accountancy Banking & Finance
  if (['accountant', 'finance', 'banking', 'audit', 'tax', 'bookkeep'].some(k => titleLower.includes(k)))
    return 'accountancy'

  // Engineering & Manufacturing
  if (['mechanical', 'manufacturing', 'production', 'factory', 'cnc'].some(k => titleLower.includes(k)))
    return 'engineering'

  // Charity & Voluntary
  if (['charity', 'fundrais', 'volunteer', 'nonprofit', 'ngo'].some(k => titleLower.includes(k)))
    return 'charity'

  // Creative Arts & Design
  if (['designer', 'artist', 'creative', 'photographer', 'illustrat', 'animator'].some(k => titleLower.includes(k)))
    return 'creative'

  // Energy & Utilities
  if (['energy', 'solar', 'wind', 'oil', 'gas', 'renewable', 'utilities'].some(k => titleLower.includes(k)))
    return 'energy'

  // Environment & Agriculture
  if (['environment', 'sustainab', 'ecology', 'conservation', 'agricult', 'farm'].some(k => titleLower.includes(k)))
    return 'environment'

  // Law & Legal
  if (['lawyer', 'solicitor', 'legal', 'barrister', 'paralegal'].some(k => titleLower.includes(k)))
    return 'law'

  // Marketing
  if (['marketing', 'advertising', 'pr ', 'social media', 'content', 'brand'].some(k => titleLower.includes(k)))
    return 'marketing'

  // Media & Publishing
  if (['journalist', 'editor', 'broadcast', 'media', 'publish', 'reporter'].some(k => titleLower.includes(k)))
    return 'media'

  // Public Sector & Government
  if (['civil servant', 'council', 'government', 'public sector', 'policy'].some(k => titleLower.includes(k)))
    return 'public'

  // Recruitment & HR
  if (['recruit', 'talent acquisition', 'hiring', 'staffing', 'human resources', 'hr '].some(k => titleLower.includes(k)))
    return 'recruitment'

  // Science & Research
  if (['scientist', 'research', 'laboratory', 'lab tech', 'biolog', 'chemist', 'physicist'].some(k => titleLower.includes(k)))
    return 'science'

  // Digital & IT
  if (['developer', 'software', 'engineer', 'data', 'analyst', 'devops', 'cloud', 'cyber', 'tech'].some(k => titleLower.includes(k)))
    return 'digital'

  // Business Consulting & Management (catch-all for generic management titles)
  if (['manager', 'head', 'supervisor', 'director', 'consultant'].some(k => titleLower.includes(k)))
    return 'business'

  return 'business'
}

function getAvailabilityColor(availability: string): string {
  const lower = availability.toLowerCase()
  if (lower.includes('immediately') || lower.includes('available') || lower.includes('now')) return 'green'
  if (lower.includes('open') || lower.includes('considering') || lower.includes('notice')) return 'yellow'
  return 'grey'
}

function CandidatesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
  const [locationQuery, setLocationQuery] = useState(searchParams.get('city') || '')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const [sectorsExpanded, setSectorsExpanded] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isEmployer, setIsEmployer] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [boostedProfileIds, setBoostedProfileIds] = useState<Set<string>>(new Set())
  const [matchedJob, setMatchedJob] = useState<Job | null>(null)
  const [matchScores, setMatchScores] = useState<Record<string, number>>({})
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch active profile boosts for sorting (non-blocking — table may not exist yet)
  useEffect(() => {
    const fetchBoosts = async () => {
      try {
        const { data } = await supabase
          .from('boosts')
          .select('target_id')
          .eq('boost_type', 'profile')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
        if (data) {
          setBoostedProfileIds(new Set(data.map((b: any) => b.target_id)))
        }
      } catch {
        // Boosts table may not exist yet — silently ignore
      }
    }
    fetchBoosts()
  }, [])

  // Sync search/location from URL params (e.g. when navbar search navigates here)
  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '')
    setLocationQuery(searchParams.get('city') || '')
  }, [searchParams])

  // Detect mobile for layout switch
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const toggleFilter = (category: keyof Filters, value: string) => {
    setFilters(prev => {
      const newSet = new Set(prev[category])
      if (newSet.has(value)) newSet.delete(value)
      else newSet.add(value)
      return { ...prev, [category]: newSet }
    })
  }

  const toggleCategory = (categoryId: string) => {
    if (categoryId === 'all') {
      setActiveCategories([])
      return
    }
    setActiveCategories(prev =>
      prev.includes(categoryId) ? prev.filter(c => c !== categoryId) : [...prev, categoryId]
    )
  }

  const activeFilterCount = useMemo(() =>
    Object.values(filters).reduce((sum, set) => sum + set.size, 0)
  , [filters])

  const clearAllFilters = () => setFilters(emptyFilters())

  useEffect(() => {
    const checkAuth = async () => {
      // DEV MODE — bypass auth + subscription, render with mock candidates
      if (DEV_MODE) {
        setIsEmployer(true)
        setHasSubscription(true)
        setAllCandidates(devMockCandidates)
        setCheckingAuth(false)
        return
      }

      const session = await getSessionWithRetry()

      if (!session) {
        router.push('/login/employer')
        return
      }

      const userRole = session.user.user_metadata?.role
      if (userRole !== 'employer') {
        setIsEmployer(false)
        setCheckingAuth(false)
        return
      }

      setIsEmployer(true)

      // Entitlement is paying-sub OR in-window founding cohort
      // (lib/foundingEntitlement). approval_status MUST be fetched
      // alongside the subscription fields so isEmployerEntitled can see
      // it; without it the helper fails closed (was previously a
      // silent-pass back-compat hole — pending freemail users wrongly
      // reached this page).
      const [subRes, profileRes] = await Promise.all([
        supabase
          .from('employer_subscriptions')
          .select('subscription_status, subscription_tier, founding_period_ends_at')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('employer_profiles')
          .select('approval_status')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ])
      const approvalStatus: string | null | undefined = (profileRes.data as { approval_status?: string | null } | null)?.approval_status ?? null
      if (approvalStatus === 'pending' || approvalStatus === 'rejected' || approvalStatus === 'waitlisted') {
        router.push('/account-under-review')
        return
      }
      const subWithApproval = subRes.data ? { ...subRes.data, approval_status: approvalStatus } : null

      if (isEmployerEntitled(subWithApproval)) {
        setHasSubscription(true)
      } else {
        setHasSubscription(false)
        setCheckingAuth(false)
        return
      }

      // Fetch candidates only after auth + subscription confirmed
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .limit(200)
      if (!error && data) {
        const candidates = data.map(supabaseProfileToCandidate)
        setAllCandidates(candidates)

        // If jobId param is present, fetch job and compute match scores
        const jobIdParam = searchParams.get('jobId')
        if (jobIdParam) {
          const { data: jobData } = await supabase.from('jobs').select('*').eq('id', jobIdParam).maybeSingle()
          if (jobData) {
            const job = supabaseJobToJob(jobData)
            setMatchedJob(job)
            setMatchScores(scoreAllCandidates(job, candidates))
          }
        }
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router])

  const filteredCandidates = useMemo(() => {
    return allCandidates.filter(candidate => {
      // Match score filter — when viewing matched candidates for a job
      if (matchedJob && Object.keys(matchScores).length > 0) {
        if ((matchScores[candidate.id] || 0) < 25) return false
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          candidate.fullName.toLowerCase().includes(query) ||
          candidate.jobTitle.toLowerCase().includes(query) ||
          candidate.skills.some(skill => skill.toLowerCase().includes(query)) ||
          candidate.bio.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // City filter
      if (locationQuery) {
        const city = locationQuery.toLowerCase()
        if (!candidate.location.toLowerCase().includes(city)) return false
      }

      // Sector filter (OR logic — candidate must match at least one selected sector)
      if (activeCategories.length > 0) {
        const sector = getCandidateSector(candidate)
        if (!activeCategories.includes(sector)) return false
      }

      // Availability filter
      if (filters.availability.size > 0) {
        const avail = candidate.availability.toLowerCase()
        let matches = false
        for (const f of Array.from(filters.availability)) {
          if (f === 'Available immediately' && (avail.includes('immediate') || avail.includes('available now'))) matches = true
          if (f === '2 weeks notice' && avail.includes('2 week')) matches = true
          if (f === '1 month notice' && (avail.includes('1 month') || avail.includes('4 week') || avail.includes('3 week'))) matches = true
          if (f === 'Flexible' && avail.includes('flexib')) matches = true
        }
        if (!matches) return false
      }

      // Experience Level filter
      if (filters.experienceLevel.size > 0) {
        const yrs = candidate.yearsExperience
        let matches = false
        for (const level of Array.from(filters.experienceLevel)) {
          if (level === 'No experience' && yrs === 0) matches = true
          if (level === 'Entry level (0-2 years)' && yrs >= 0 && yrs <= 2) matches = true
          if (level === 'Mid level (3-5 years)' && yrs >= 3 && yrs <= 5) matches = true
          if (level === 'Senior (6-10 years)' && yrs >= 6 && yrs <= 10) matches = true
          if (level === 'Executive (10+ years)' && yrs > 10) matches = true
        }
        if (!matches) return false
      }

      // Skills filter
      if (filters.skills.size > 0) {
        const candidateSkills = candidate.skills.map(s => s.toLowerCase())
        const candidateBio = candidate.bio.toLowerCase()
        let matches = false
        for (const skill of Array.from(filters.skills)) {
          const skillLower = skill.toLowerCase()
          if (candidateSkills.some(s => s.includes(skillLower)) || candidateBio.includes(skillLower)) matches = true
          if (skill === 'Right to Work' && candidate.hasRightToWork) matches = true
          if (skill === 'NI Number' && candidate.hasNiNumber) matches = true
        }
        if (!matches) return false
      }

      // Work Preference filter
      if (filters.workPreference.size > 0) {
        const candidateJobTypes = (candidate.preferredJobTypes || []).map(s => s.toLowerCase())
        let matches = false
        for (const pref of Array.from(filters.workPreference)) {
          if (candidateJobTypes.some(t => t.includes(pref.toLowerCase()))) matches = true
        }
        if (!matches) return false
      }

      return true
    }).sort((a, b) => {
      // Sort by match score when viewing matched candidates
      if (matchedJob && Object.keys(matchScores).length > 0) {
        return (matchScores[b.id] || 0) - (matchScores[a.id] || 0)
      }
      const aBoost = boostedProfileIds.has(a.id) ? 1 : 0
      const bBoost = boostedProfileIds.has(b.id) ? 1 : 0
      return bBoost - aBoost
    })
  }, [allCandidates, searchQuery, locationQuery, activeCategories, filters, boostedProfileIds, matchedJob, matchScores])

  // Clear the open candidate if it drops out of the filtered set (mirrors
  // /jobs). The detail is now a click-opened slide-in modal, so we must NOT
  // auto-select / auto-open a candidate on load or on filter change.
  useEffect(() => {
    if (selectedCandidate && filteredCandidates.length > 0 && !filteredCandidates.some(c => c.id === selectedCandidate.id)) {
      setSelectedCandidate(null)
    }
  }, [filteredCandidates])

  const selectCandidate = (candidate: Candidate) => {
    if (isMobile) {
      router.push(`/candidates/${candidate.id}`)
    } else {
      setSelectedCandidate(candidate)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setLocationQuery('')
    setActiveCategories([])
    clearAllFilters()
  }

  // Filter-strip helpers (mirror /jobs). These re-present the SAME existing
  // filter Sets — no new filter dimensions are introduced.
  const closeOverlays = () => { setSectorsExpanded(false); setFiltersExpanded(false) }
  const availabilityOptions = candidateFilterSections.find(s => s.key === 'availability')!.options
  const experienceOptions = candidateFilterSections.find(s => s.key === 'experienceLevel')!.options
  const selectedExperience = filters.experienceLevel.size === 1 ? Array.from(filters.experienceLevel)[0] : ''
  const setExperience = (val: string) =>
    setFilters(prev => ({ ...prev, experienceLevel: new Set(val ? [val] : []) }))
  const hasActiveFilters =
    activeFilterCount > 0 || !!searchQuery || !!locationQuery || activeCategories.length > 0

  // Slide-in detail modal nav (mirrors /jobs prev/next)
  const navigateToCandidate = (direction: 'prev' | 'next') => {
    if (!selectedCandidate) return
    const i = filteredCandidates.findIndex(c => c.id === selectedCandidate.id)
    const ni = direction === 'prev' ? i - 1 : i + 1
    if (ni >= 0 && ni < filteredCandidates.length) setSelectedCandidate(filteredCandidates[ni])
  }
  const currentCandidateIndex = () =>
    selectedCandidate ? filteredCandidates.findIndex(c => c.id === selectedCandidate.id) : -1

  if (checkingAuth) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p>Loading...</p>
        </div>
      </main>
    )
  }

  if (!isEmployer) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.accessDenied}>
            <div className={styles.accessIcon}>🔒</div>
            <h2>Employer Access Only</h2>
            <p>
              Only employers can browse candidate profiles. Sign up free to
              access thousands of qualified professionals.
            </p>
            <Link href="/register/employer-free" className="btn btn-primary">
              Sign up for free
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (!hasSubscription) {
    router.push('/dashboard/subscription')
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.accessDenied}>
            <div className={styles.accessIcon}>📋</div>
            <h2>Subscription Required</h2>
            <p>Redirecting to subscription page...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="no-pad">
      <Header />

      {/* Search Section (dark) — mirrors /jobs */}
      <div className={styles.searchSection}>
        <div className={styles.searchInner}>
          <h1 className={styles.searchSectionTitle}>Find Your Perfect Candidate</h1>
          <div className={styles.searchControls}>
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Name, role or skill"
                className={styles.searchBox}
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
              )}
            </div>
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                value={locationQuery}
                onChange={e => setLocationQuery(e.target.value)}
                placeholder="City or town"
                className={styles.searchBox}
              />
              {locationQuery && (
                <button className={styles.searchClear} onClick={() => setLocationQuery('')} aria-label="Clear location">✕</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Strip — sticky, mirrors /jobs */}
      <div className={styles.filterStrip}>
        <div className={styles.filterStripInner}>
          <div className={styles.filterStripLeft}>
            {availabilityOptions.map(opt => (
              <button
                key={opt}
                className={`${styles.filterPill} ${filters.availability.has(opt) ? styles.filterPillActive : ''}`}
                onClick={() => toggleFilter('availability', opt)}
              >
                {opt}
              </button>
            ))}
            <select
              value={selectedExperience}
              onChange={e => setExperience(e.target.value)}
              className={`${styles.filterSelect} ${selectedExperience ? styles.filterSelectActive : ''}`}
            >
              <option value="">Experience level</option>
              {experienceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <button
              className={`${styles.filterPill} ${sectorsExpanded ? styles.filterPillActive : ''}`}
              onClick={() => { setFiltersExpanded(false); setSectorsExpanded(!sectorsExpanded) }}
            >
              Sectors{activeCategories.length === 1 ? ` · ${categories.find(c => c.id === activeCategories[0])?.label}` : activeCategories.length > 1 ? ` · ${activeCategories.length}` : ''} ▾
            </button>
            <button
              className={`${styles.filterPill} ${filtersExpanded ? styles.filterPillActive : ''}`}
              onClick={() => { setSectorsExpanded(false); setFiltersExpanded(!filtersExpanded) }}
            >
              More filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} ▾
            </button>
          </div>
          <div className={styles.filterStripRight}>
            <span className={styles.resultCount}>{filteredCandidates.length} candidates</span>
            {hasActiveFilters && (
              <button className={styles.clearFiltersBtn} onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        </div>

        {/* Active filter chips — removable */}
        {(activeCategories.length > 0 || activeFilterCount > 0) && (
          <div className={styles.activeChips}>
            {activeCategories.map(catId => (
              <button key={catId} className={styles.activeChip} onClick={() => toggleCategory(catId)}>
                {categories.find(c => c.id === catId)?.label}<span aria-hidden="true">✕</span>
              </button>
            ))}
            {candidateFilterSections.map(section => Array.from(filters[section.key]).map(option => (
              <button key={`${section.key}-${option}`} className={styles.activeChip} onClick={() => toggleFilter(section.key, option)}>
                {option}<span aria-hidden="true">✕</span>
              </button>
            )))}
          </div>
        )}
      </div>

      {/* Filter overlays — popover on desktop, bottom sheet on mobile */}
      {(sectorsExpanded || filtersExpanded) && (
        <div className={styles.filterBackdrop} onClick={closeOverlays} />
      )}
      {sectorsExpanded && (
        <div className={styles.filterOverlay} role="dialog" aria-label="Job Sectors" aria-modal="true">
          <div className={styles.filterOverlayHead}>
            <span>Job Sectors</span>
            <button className={styles.filterOverlayClose} onClick={() => setSectorsExpanded(false)} aria-label="Close">✕</button>
          </div>
          <div className={styles.filterOverlayBody}>
            <div className={styles.filterGroupOptions}>
              {categories.map(category => (
                <button
                  key={category.id}
                  className={`${styles.filterPill} ${
                    category.id === 'all'
                      ? (activeCategories.length === 0 ? styles.filterPillActive : '')
                      : (activeCategories.includes(category.id) ? styles.filterPillActive : '')
                  }`}
                  onClick={() => toggleCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filterOverlayFoot}>
            <button className={styles.filterOverlayClear} onClick={() => setActiveCategories([])}>Clear</button>
            <button className={styles.filterOverlayApply} onClick={() => setSectorsExpanded(false)}>Show {filteredCandidates.length} candidates</button>
          </div>
        </div>
      )}
      {filtersExpanded && (
        <div className={styles.filterOverlay} role="dialog" aria-label="Filters" aria-modal="true">
          <div className={styles.filterOverlayHead}>
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            <button className={styles.filterOverlayClose} onClick={() => setFiltersExpanded(false)} aria-label="Close">✕</button>
          </div>
          <div className={styles.filterOverlayBody}>
            {candidateFilterSections.map(section => (
              <div key={section.key} className={styles.filterGroup}>
                <h4 className={styles.filterGroupTitle}>{section.title}</h4>
                <div className={styles.filterGroupOptions}>
                  {section.options.map(option => (
                    <button
                      key={option}
                      className={`${styles.filterPill} ${filters[section.key].has(option) ? styles.filterPillActive : ''}`}
                      onClick={() => toggleFilter(section.key, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.filterOverlayFoot}>
            <button className={styles.filterOverlayClear} onClick={clearAllFilters}>Clear all</button>
            <button className={styles.filterOverlayApply} onClick={() => setFiltersExpanded(false)}>Show {filteredCandidates.length} candidates</button>
          </div>
        </div>
      )}

      {/* Matched-job banner (preserved) */}
      {matchedJob && (
        <div className={styles.matchBanner}>
          <span>Showing candidates matched to: <strong>{matchedJob.title}</strong></span>
          <button className={styles.matchBannerClear} onClick={() => { setMatchedJob(null); setMatchScores({}) }}>
            Clear filter ✕
          </button>
        </div>
      )}

      {/* Candidate Card Grid — image-led, mirrors /jobs */}
      <div className={styles.cardsContainer}>
        {filteredCandidates.length > 0 ? (
          <div className={styles.cardsGrid} ref={listRef}>
            {filteredCandidates.map(candidate => {
              const initials = candidate.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              const score = matchScores[candidate.id] || 0
              const availColor = getAvailabilityColor(candidate.availability)
              const boosted = boostedProfileIds.has(candidate.id)
              const v = fallbackVariant(candidate.id || candidate.fullName || 'thrive')
              // Phase 3 (separate, with moderation): a candidate work-photo will
              // render as the faded card background. Until then this is always
              // null, so every card falls back to the simplified branded panel.
              const cardPhoto: string | null = null
              return (
                <div
                  key={candidate.id}
                  className={`${styles.candidateCard} ${boosted ? styles.candidateCardBoosted : ''}`}
                  onClick={() => selectCandidate(candidate)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectCandidate(candidate)}
                >
                  <div
                    className={styles.cardBackdrop}
                    style={{ ['--fb-angle' as any]: `${v.angle}deg`, ['--fb-glow-x' as any]: `${v.glowX}%` }}
                    aria-hidden="true"
                  >
                    {cardPhoto ? (
                      <div className={styles.cardPhotoBg} style={{ backgroundImage: `url(${cardPhoto})` }} />
                    ) : (
                      <span className={styles.cardGhostInitials}>{initials}</span>
                    )}
                  </div>
                  <div className={styles.cardScrim} aria-hidden="true" />

                  {(score > 0 || boosted) && (
                    <div className={styles.cardTopBadges}>
                      {score > 0 && <span className={styles.cardMatch}>{score}% match</span>}
                      {boosted && <span className={styles.cardFeatured}>⚡ Featured</span>}
                    </div>
                  )}

                  {/* Identity — top-left */}
                  <div className={styles.cardIdentity}>
                    <span className={styles.cardChip}>{initials}</span>
                    <span className={styles.cardIdentityName}>{candidate.fullName}</span>
                  </div>

                  {/* Content — bottom */}
                  <div className={styles.cardContent}>
                    <h3 className={styles.cardRole}>{candidate.jobTitle}</h3>
                    {candidate.headline && <p className={styles.cardHeadline}>{candidate.headline}</p>}
                    <div className={styles.cardMeta}>
                      {candidate.location && <span>{candidate.location}</span>}
                      {candidate.location && <span className={styles.cardDot}>·</span>}
                      <span>{candidate.yearsExperience} yrs exp</span>
                    </div>
                    <div className={styles.cardBadges}>
                      {candidate.availability && (
                        <span className={`${styles.cardBadge} ${styles.cardAvail} ${styles[`cardAvail_${availColor}`]}`}>
                          <span className={styles.cardAvailDot} />{candidate.availability}
                        </span>
                      )}
                      {(candidate.specialties && candidate.specialties.length > 0 ? candidate.specialties : candidate.skills).slice(0, 2).map((tag, i) => (
                        <span key={i} className={styles.cardBadge}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>No candidates match your search</h2>
            <p className={styles.emptyText}>Try adjusting your filters or search terms</p>
            <button className={styles.browseBtn} onClick={clearFilters}>
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Candidate Detail — slide-in modal (desktop); mobile routes to /candidates/[id] */}
      {!isMobile && selectedCandidate && (
        <>
          <div className={styles.modalOverlay} onClick={() => setSelectedCandidate(null)} />
          <div className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <div className={styles.modalNav}>
                <button className={styles.modalNavBtn} onClick={() => navigateToCandidate('prev')} disabled={currentCandidateIndex() <= 0} aria-label="Previous candidate">←</button>
                <button className={styles.modalNavBtn} onClick={() => navigateToCandidate('next')} disabled={currentCandidateIndex() >= filteredCandidates.length - 1} aria-label="Next candidate">→</button>
              </div>
              <button className={styles.modalClose} onClick={() => setSelectedCandidate(null)} aria-label="Close">✕</button>
            </div>
            <div className={styles.modalBody}>
                <div className={styles.detailInner}>
                  {/* Profile Header */}
                  <div className={styles.detailProfileHeader}>
                    <div className={styles.detailHeaderContent}>
                      <div className={styles.detailAvatar}>
                        {selectedCandidate.profilePictureUrl ? (
                          <SignedImage src={selectedCandidate.profilePictureUrl} alt={selectedCandidate.fullName} />
                        ) : (
                          <span className={styles.detailAvatarPlaceholder}>
                            {selectedCandidate.fullName.split(' ').map(n => n[0]).join('')}
                          </span>
                        )}
                      </div>
                      <div className={styles.detailHeaderInfo}>
                        <h1 className={styles.detailName}>{selectedCandidate.fullName}</h1>
                        <p className={styles.detailTitle}>{selectedCandidate.jobTitle}</p>
                        {selectedCandidate.headline && <p className={styles.detailHeadline}>{selectedCandidate.headline}</p>}
                        <div className={styles.detailHeaderMeta}>
                          {selectedCandidate.location && (
                            <span className={styles.detailMetaItem}>
                              <MapPin size={15} />
                              {selectedCandidate.location}
                            </span>
                          )}
                          {selectedCandidate.yearsExperience != null && (
                            <span className={styles.detailMetaItem}>
                              <Clock size={15} />
                              {selectedCandidate.yearsExperience} years experience
                            </span>
                          )}
                          {selectedCandidate.availability && (
                            <span className={`${styles.detailAvailBadge} ${styles[`detailAvail_${getAvailabilityColor(selectedCandidate.availability)}`]}`}>
                              <span className={styles.detailAvailDot} />
                              {selectedCandidate.availability}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    {(selectedCandidate.jobSector || (selectedCandidate.preferredJobTypes && selectedCandidate.preferredJobTypes.length > 0) || (selectedCandidate.workLocationPreferences && selectedCandidate.workLocationPreferences.length > 0)) && (
                      <div className={styles.detailQuickStats}>
                        {selectedCandidate.jobSector && (
                          <div className={styles.detailQuickStat}>
                            <span className={styles.detailQuickStatLabel}>Sector</span>
                            <span className={styles.detailQuickStatValue}>{JOB_SECTOR_LABELS[selectedCandidate.jobSector] || selectedCandidate.jobSector}</span>
                          </div>
                        )}
                        {selectedCandidate.preferredJobTypes && selectedCandidate.preferredJobTypes.length > 0 && (
                          <div className={styles.detailQuickStat}>
                            <span className={styles.detailQuickStatLabel}>Work Type</span>
                            <span className={styles.detailQuickStatValue}>{selectedCandidate.preferredJobTypes.join(', ')}</span>
                          </div>
                        )}
                        {selectedCandidate.workLocationPreferences && selectedCandidate.workLocationPreferences.length > 0 && (
                          <div className={styles.detailQuickStat}>
                            <span className={styles.detailQuickStatLabel}>Work Location</span>
                            <span className={styles.detailQuickStatValue}>{selectedCandidate.workLocationPreferences.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className={styles.detailActions}>
                    <Link href={`/messages?candidate=${selectedCandidate.id}`} className={styles.detailActionBtnPrimary}>
                      <MessageSquare size={16} />
                      Message
                    </Link>
                    {selectedCandidate.cvUrl ? (
                      <SignedLink src={selectedCandidate.cvUrl} download className={styles.detailActionBtn}>
                        <FileDown size={16} />
                        Download CV
                      </SignedLink>
                    ) : (
                      <button className={styles.detailActionBtn} disabled>
                        <FileDown size={16} />
                        No CV
                      </button>
                    )}
                    <Link href={`/candidates/${selectedCandidate.id}`} className={styles.detailActionBtn}>
                      View Full Profile
                    </Link>
                  </div>

                  {/* About Me */}
                  {selectedCandidate.bio && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <User size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>About Me</h2>
                      </div>
                      <p className={styles.detailBio}>{selectedCandidate.bio}</p>
                    </div>
                  )}

                  {/* Work Experience */}
                  {selectedCandidate.workHistory && selectedCandidate.workHistory.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Briefcase size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Work Experience</h2>
                      </div>
                      <div className={styles.detailTimeline}>
                        {selectedCandidate.workHistory.map((job, index) => (
                          <div key={index} className={styles.detailTimelineItem}>
                            <div className={styles.detailTimelineTrack}>
                              <div className={styles.detailTimelineDot} />
                              {index < selectedCandidate.workHistory.length - 1 && <div className={styles.detailTimelineLine} />}
                            </div>
                            <div className={styles.detailTimelineBody}>
                              <h3 className={styles.detailTimelineRole}>{job.title}</h3>
                              <p className={styles.detailTimelineCompany}>{job.company} &bull; {job.location}</p>
                              <p className={styles.detailTimelineDates}>{job.startDate} — {job.endDate || 'Present'}</p>
                              {job.description && <p className={styles.detailTimelineDesc}>{job.description}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths (specialties) */}
                  {selectedCandidate.specialties && selectedCandidate.specialties.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Award size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Strengths</h2>
                      </div>
                      <div className={styles.detailSkillsGrid}>
                        {selectedCandidate.specialties.map((s, index) => (
                          <span key={index} className={styles.detailSkillPill}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notable venues */}
                  {selectedCandidate.notableVenues && selectedCandidate.notableVenues.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <MapPin size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Notable venues</h2>
                      </div>
                      <div className={styles.detailSkillsGrid}>
                        {selectedCandidate.notableVenues.map((v, index) => (
                          <span key={index} className={styles.detailSkillPill}>{v}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {selectedCandidate.skills && selectedCandidate.skills.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Wrench size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Skills</h2>
                      </div>
                      <div className={styles.detailSkillsGrid}>
                        {selectedCandidate.skills.map((skill, index) => (
                          <span key={index} className={styles.detailSkillPill}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {selectedCandidate.education && selectedCandidate.education.length > 0 && selectedCandidate.education.some(edu => edu.institution || edu.qualification) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <GraduationCap size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Education</h2>
                      </div>
                      <div className={styles.detailTimeline}>
                        {selectedCandidate.education.filter(edu => edu.institution || edu.qualification).map((edu, index, arr) => (
                          <div key={index} className={styles.detailTimelineItem}>
                            <div className={styles.detailTimelineTrack}>
                              <div className={styles.detailTimelineDot} />
                              {index < arr.length - 1 && <div className={styles.detailTimelineLine} />}
                            </div>
                            <div className={styles.detailTimelineBody}>
                              <h3 className={styles.detailTimelineRole}>{edu.qualification}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}</h3>
                              <p className={styles.detailTimelineCompany}>{edu.institution}{edu.grade ? ` • ${edu.grade}` : ''}</p>
                              <p className={styles.detailTimelineDates}>{edu.startDate} — {edu.inProgress ? 'In Progress' : (edu.endDate || 'N/A')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Languages */}
                  {selectedCandidate.languages && selectedCandidate.languages.length > 0 && selectedCandidate.languages.some(lang => lang.name) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Globe size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Languages</h2>
                      </div>
                      <div className={styles.detailSkillsGrid}>
                        {selectedCandidate.languages.filter(lang => lang.name).map((lang, index) => (
                          <span key={index} className={styles.detailLangPill}>
                            {lang.name} <span className={styles.detailLangLevel}>({lang.proficiency})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {selectedCandidate.certifications && selectedCandidate.certifications.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Award size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Certifications</h2>
                      </div>
                      <ul className={styles.detailCertList}>
                        {selectedCandidate.certifications.map((cert, index) => (
                          <li key={index} className={styles.detailCertItem}>
                            <span className={styles.detailCertCheck}>✓</span>
                            {cert}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Preferences */}
                  {(selectedCandidate.preferredLocations || selectedCandidate.preferredJobTypes || selectedCandidate.salaryMin || selectedCandidate.salaryMax || selectedCandidate.desiredSalary) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Sliders size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Preferences</h2>
                      </div>
                      <div className={styles.detailPrefGrid}>
                        {(selectedCandidate.salaryMin || selectedCandidate.salaryMax || selectedCandidate.desiredSalary) && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Desired Salary</span>
                            <span className={styles.detailPrefValue}>
                              {selectedCandidate.salaryMin && selectedCandidate.salaryMax ? (
                                <>£{Number(selectedCandidate.salaryMin).toLocaleString()} – £{Number(selectedCandidate.salaryMax).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              ) : selectedCandidate.desiredSalary ? (
                                <>£{Number(selectedCandidate.desiredSalary).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              ) : selectedCandidate.salaryMin ? (
                                <>From £{Number(selectedCandidate.salaryMin).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              ) : (
                                <>Up to £{Number(selectedCandidate.salaryMax).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              )}
                            </span>
                          </div>
                        )}
                        {selectedCandidate.preferredJobTypes && selectedCandidate.preferredJobTypes.length > 0 && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Work Type</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.preferredJobTypes.join(', ')}</span>
                          </div>
                        )}
                        {selectedCandidate.workLocationPreferences && selectedCandidate.workLocationPreferences.length > 0 && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Work Location</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.workLocationPreferences.join(', ')}</span>
                          </div>
                        )}
                        {selectedCandidate.preferredLocations && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Preferred Areas</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.preferredLocations}</span>
                          </div>
                        )}
                        {selectedCandidate.availability && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Availability</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.availability}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Interests & Hobbies */}
                  {(selectedCandidate.personalBio || (selectedCandidate.interests && selectedCandidate.interests.length > 0)) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Heart size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Interests & Hobbies</h2>
                      </div>
                      {selectedCandidate.personalBio && <p className={styles.detailBio}>{selectedCandidate.personalBio}</p>}
                      {selectedCandidate.interests && selectedCandidate.interests.length > 0 && (
                        <div className={styles.detailInterestsTags} style={selectedCandidate.personalBio ? { marginTop: '0.75rem' } : undefined}>
                          {selectedCandidate.interests.map((interest, index) => (
                            <span key={index} className={styles.detailInterestTag}>{interest}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verified Documents */}
                  {(selectedCandidate.hasNiNumber || selectedCandidate.hasBankAccount || selectedCandidate.hasRightToWork || selectedCandidate.hasP45) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Award size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Verified Documents</h2>
                      </div>
                      <div className={styles.detailVerificationBadges}>
                        {selectedCandidate.hasNiNumber && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            NI Number
                          </div>
                        )}
                        {selectedCandidate.hasBankAccount && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            UK Bank Account
                          </div>
                        )}
                        {selectedCandidate.hasRightToWork && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            Right to Work
                          </div>
                        )}
                        {selectedCandidate.hasP45 && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            P45 Available
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
    </main>
  )
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div className={styles.container}><p>Loading...</p></div>
      </main>
    }>
      <CandidatesContent />
    </Suspense>
  )
}
