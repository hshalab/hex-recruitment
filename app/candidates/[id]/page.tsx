'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { Candidate, devMockCandidates } from '@/lib/mockCandidates'
import { DEV_MODE } from '@/lib/mockAuth'
import { supabaseProfileToCandidate } from '@/lib/types'
import { FaLinkedinIn, FaInstagram, FaFacebookF } from 'react-icons/fa'
import {
  MapPin, Clock, Briefcase, GraduationCap, User, Wrench,
  Award, Heart, Globe, MessageSquare, FileDown, Mail,
  ChevronLeft, Sliders
} from 'lucide-react'
import styles from './page.module.css'

interface VisibilitySettings {
  show_email: boolean
  show_phone: boolean
  show_address: boolean
  show_date_of_birth: boolean
  show_nationality: boolean
  show_desired_salary: boolean
  show_social_links: boolean
  show_availability: boolean
  show_verification_badges: boolean
  show_cv: boolean
}

const DEFAULT_VISIBILITY: VisibilitySettings = {
  show_email: true,
  show_phone: true,
  show_address: false,
  show_date_of_birth: false,
  show_nationality: true,
  show_desired_salary: true,
  show_social_links: true,
  show_availability: true,
  show_verification_badges: true,
  show_cv: true,
}

import { getCategoryLabel } from '@/lib/categories'
const JOB_SECTOR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => getCategoryLabel(key),
})

function normalizeUrl(url: string | undefined): string {
  if (!url || url.trim() === '') return ''
  let normalized = url.trim()
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized
  }
  return normalized
}

function getAvailabilityStyle(availability: string | undefined) {
  if (!availability) return 'Grey'
  const lower = availability.toLowerCase()
  if (lower.includes('immediately') || lower.includes('available') || lower.includes('now')) return 'Green'
  if (lower.includes('open') || lower.includes('considering') || lower.includes('notice')) return 'Yellow'
  return 'Grey'
}

export default function CandidateDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const fromPipeline = searchParams.get('from') === 'pipeline'
  const candidateId = params.id as string

  const handleBack = () => {
    // Prefer browser history so the user returns to wherever they came from
    // (pipeline, candidates list, search results, etc.). Fall back to a sensible
    // default if there's no history — e.g. opened from an external link.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fromPipeline ? '/pipeline' : '/candidates')
    }
  }

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [visibility, setVisibility] = useState<VisibilitySettings>(DEFAULT_VISIBILITY)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isEmployer, setIsEmployer] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [lastActive, setLastActive] = useState<string | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [completionPct, setCompletionPct] = useState(0)
  useEffect(() => {
    const checkAuth = async () => {
      // DEV MODE — bypass auth, load from dev mock fixture
      if (DEV_MODE) {
        setIsEmployer(true)
        const mock = devMockCandidates.find(c => c.id === candidateId) || devMockCandidates[0]
        if (mock) {
          setCandidate(mock)
          setLastActive('Active today')
        }
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

      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', candidateId)
        .maybeSingle()

      if (!error && data) {
        const candidateData = supabaseProfileToCandidate(data)
        setCandidate(candidateData)
        if (data.visibility_settings) {
          setVisibility({ ...DEFAULT_VISIBILITY, ...data.visibility_settings })
        }

        // Last active timestamp from profile updated_at
        if (data.updated_at) {
          const date = new Date(data.updated_at)
          const now = new Date()
          const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays === 0) setLastActive('Active today')
          else if (diffDays <= 7) setLastActive('Active this week')
          else if (diffDays <= 30) setLastActive('Active this month')
          else setLastActive(null)
        }

        // Record profile view (only when an employer views someone else's profile)
        if (session.user.id !== candidateId) {
          supabase.from('profile_views').insert({
            profile_id: candidateId,
            viewer_id: session.user.id,
          }).then()
        }

        // Profile completeness (visible only to the candidate themselves)
        if (session.user.id === candidateId) {
          setIsOwnProfile(true)
          const fields = [
            candidateData.profilePictureUrl,
            candidateData.jobTitle,
            candidateData.bio,
            candidateData.location,
            candidateData.skills && candidateData.skills.length > 0,
            candidateData.yearsExperience != null,
            candidateData.availability,
          ]
          setCompletionPct(Math.round((fields.filter(Boolean).length / fields.length) * 100))
        }
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router, candidateId])

  // Loading
  if (checkingAuth) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading profile...</p>
        </div>
      </main>
    )
  }

  // Access denied
  if (!isEmployer) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.accessDenied}>
          <div className={styles.accessIcon}>🔒</div>
          <h2>Employer Access Only</h2>
          <p>Only employers with a subscription can view candidate profiles.</p>
          <Link href="/subscribe" className={styles.backBtnPrimary}>
            View Subscription Plans
          </Link>
        </div>
      </main>
    )
  }

  // Not found
  if (!candidate) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.notFound}>
          <h2>Candidate Not Found</h2>
          <p>The candidate you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <Link href={fromPipeline ? '/pipeline' : '/candidates'} className={styles.backBtnPrimary}>
            {fromPipeline ? 'Back to Pipeline' : 'Back to Candidates'}
          </Link>
        </div>
      </main>
    )
  }

  const hasVisibleEmail = visibility.show_email && candidate.email
  const hasVisiblePhone = visibility.show_phone && candidate.phone
  const hasAnyContact = hasVisibleEmail || hasVisiblePhone
  const availStyle = getAvailabilityStyle(candidate.availability)

  const hasSalary = visibility.show_desired_salary && (candidate.salaryMin || candidate.salaryMax || candidate.desiredSalary)
  const hasPreferencesContent = Boolean(
    hasSalary ||
    (candidate.preferredLocations && candidate.preferredLocations.length > 0)
  )

  return (
    <main className={styles.page}>
      <Header />

      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <button onClick={handleBack} className={styles.breadcrumbLink} type="button">
            <ChevronLeft size={16} />
            Back
          </button>
        </div>

        {/* Profile completeness (own profile only) */}
        {isOwnProfile && completionPct < 100 && (
          <div className={styles.completionBar}>
            <div className={styles.completionBarFill} style={{ width: `${completionPct}%` }} />
            <span className={styles.completionBarText}>
              Profile {completionPct}% complete — <Link href="/settings/profile" className={styles.completionBarLink}>complete your profile</Link>
            </span>
          </div>
        )}

        {/* ===== PROFILE HEADER ===== */}
        <div className={styles.profileHeader}>
          <div className={styles.headerContent}>
            <div className={styles.avatar}>
              {candidate.profilePictureUrl ? (
                <SignedImage src={candidate.profilePictureUrl} alt={candidate.fullName} />
              ) : (
                <span className={styles.avatarPlaceholder}>
                  {candidate.fullName.split(' ').map(n => n[0]).join('')}
                </span>
              )}
            </div>
            <div className={styles.headerInfo}>
              <h1 className={styles.candidateName}>{candidate.fullName}</h1>
              <p className={styles.candidateTitle}>{candidate.jobTitle}</p>

              {/* Prominent availability badge */}
              {visibility.show_availability && candidate.availability && (
                <div className={styles.availabilityRow}>
                  <span className={`${styles.availabilityBadgeLarge} ${styles[`availability${availStyle}`]}`}>
                    <span className={styles.availabilityDot} />
                    {candidate.availability}
                  </span>
                </div>
              )}

              {/* Verification badges in header */}
              {visibility.show_verification_badges && (candidate.hasNiNumber || candidate.hasBankAccount || candidate.hasRightToWork || candidate.hasP45) && (
                <div className={styles.headerVerification}>
                  {candidate.hasRightToWork && (
                    <span className={styles.headerVerificationBadge}>
                      <span className={styles.headerVerificationCheck}>✓</span>
                      Right to Work
                    </span>
                  )}
                  {candidate.hasNiNumber && (
                    <span className={styles.headerVerificationBadge}>
                      <span className={styles.headerVerificationCheck}>✓</span>
                      NI Number
                    </span>
                  )}
                  {candidate.hasBankAccount && (
                    <span className={styles.headerVerificationBadge}>
                      <span className={styles.headerVerificationCheck}>✓</span>
                      UK Bank Account
                    </span>
                  )}
                  {candidate.hasP45 && (
                    <span className={styles.headerVerificationBadge}>
                      <span className={styles.headerVerificationCheck}>✓</span>
                      P45
                    </span>
                  )}
                </div>
              )}

              <div className={styles.headerMeta}>
                {candidate.location && (
                  <span className={styles.metaItem}>
                    <MapPin size={15} className={styles.metaItemIcon} />
                    {candidate.location}
                  </span>
                )}
                {candidate.yearsExperience != null && (
                  <span className={styles.metaItem}>
                    <Clock size={15} className={styles.metaItemIcon} />
                    {candidate.yearsExperience} years experience
                  </span>
                )}
                {lastActive && (
                  <span className={styles.metaItem}>
                    <span className={styles.lastActiveDot} />
                    {lastActive}
                  </span>
                )}
              </div>

              {/* Quick Stats */}
              <div className={styles.quickStats}>
                {candidate.jobSector && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Sector</span>
                    <span className={styles.quickStatValue}>{JOB_SECTOR_LABELS[candidate.jobSector] || candidate.jobSector}</span>
                  </div>
                )}
                {candidate.preferredJobTypes && candidate.preferredJobTypes.length > 0 && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Work Type</span>
                    <span className={styles.quickStatValue}>{candidate.preferredJobTypes.join(', ')}</span>
                  </div>
                )}
                {candidate.workLocationPreferences && candidate.workLocationPreferences.length > 0 && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Work Location</span>
                    <span className={styles.quickStatValue}>{candidate.workLocationPreferences.join(', ')}</span>
                  </div>
                )}
                {visibility.show_nationality && candidate.nationality && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Nationality</span>
                    <span className={styles.quickStatValue}>{candidate.nationality}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== CONTENT GRID ===== */}
        <div className={styles.contentGrid}>
          {/* === Main Content === */}
          <div className={styles.mainContent}>
            {/* About Me */}
            {candidate.bio && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <User size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>About Me</h2>
                </div>
                <p className={styles.bio}>{candidate.bio}</p>
              </div>
            )}

            {/* Work Experience */}
            {candidate.workHistory && candidate.workHistory.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Briefcase size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Work Experience</h2>
                </div>
                <div className={styles.timeline}>
                  {candidate.workHistory.map((job, index) => (
                    <div key={index} className={styles.timelineItem}>
                      <div className={styles.timelineTrack}>
                        <div className={styles.timelineDot} />
                        {index < candidate.workHistory.length - 1 && <div className={styles.timelineLine} />}
                      </div>
                      <div className={styles.timelineBody}>
                        <h3 className={styles.timelineRole}>{job.title}</h3>
                        <p className={styles.timelineCompany}>{job.company} • {job.location}</p>
                        <p className={styles.timelineDates}>{job.startDate} — {job.endDate || 'Present'}</p>
                        {job.description && <p className={styles.timelineDesc}>{job.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Wrench size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Skills</h2>
                </div>
                <div className={styles.skillsGrid}>
                  {candidate.skills.map((skill, index) => (
                    <span key={index} className={styles.skillPill}>{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {candidate.education && candidate.education.length > 0 && candidate.education.some(edu => edu.institution || edu.qualification) && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <GraduationCap size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Education & Qualifications</h2>
                </div>
                <div className={styles.timeline}>
                  {candidate.education.filter(edu => edu.institution || edu.qualification).map((edu, index, arr) => (
                    <div key={index} className={styles.timelineItem}>
                      <div className={styles.timelineTrack}>
                        <div className={styles.timelineDot} />
                        {index < arr.length - 1 && <div className={styles.timelineLine} />}
                      </div>
                      <div className={styles.timelineBody}>
                        <h3 className={styles.timelineRole}>{edu.qualification}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}</h3>
                        <p className={styles.timelineCompany}>{edu.institution}{edu.grade ? ` • ${edu.grade}` : ''}</p>
                        <p className={styles.timelineDates}>{edu.startDate} — {edu.inProgress ? 'In Progress' : (edu.endDate || 'N/A')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Languages */}
            {candidate.languages && candidate.languages.length > 0 && candidate.languages.some(lang => lang.name) && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Globe size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Languages</h2>
                </div>
                <div className={styles.skillsGrid}>
                  {candidate.languages.filter(lang => lang.name).map((lang, index) => (
                    <span key={index} className={styles.langPill}>
                      {lang.name} <span className={styles.langLevel}>({lang.proficiency})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {candidate.certifications && candidate.certifications.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Award size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Certifications</h2>
                </div>
                <ul className={styles.certList}>
                  {candidate.certifications.map((cert, index) => (
                    <li key={index} className={styles.certItem}>
                      <span className={styles.certCheck}>✓</span>
                      {cert}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preferences */}
            {hasPreferencesContent && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Sliders size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Preferences</h2>
                </div>
                <div className={styles.prefGrid}>
                  {hasSalary && (
                    <div className={styles.prefRow}>
                      <span className={styles.prefLabel}>Desired Salary</span>
                      <span className={styles.prefValue}>
                        {candidate.salaryMin && candidate.salaryMax ? (
                          <>£{Number(candidate.salaryMin).toLocaleString()} – £{Number(candidate.salaryMax).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        ) : candidate.desiredSalary ? (
                          <>£{Number(candidate.desiredSalary).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        ) : candidate.salaryMin ? (
                          <>From £{Number(candidate.salaryMin).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        ) : (
                          <>Up to £{Number(candidate.salaryMax).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        )}
                      </span>
                    </div>
                  )}
                  {candidate.preferredLocations && (
                    <div className={styles.prefRow}>
                      <span className={styles.prefLabel}>Preferred Areas</span>
                      <span className={styles.prefValue}>{candidate.preferredLocations}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Interests & Hobbies */}
            {candidate.interests && candidate.interests.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Heart size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Interests & Hobbies</h2>
                </div>
                <div className={styles.interestsTags}>
                  {candidate.interests.map((interest, index) => (
                    <span key={index} className={styles.interestTag}>{interest}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarSticky}>
              {/* Actions Card */}
              <div className={styles.actionsCard}>
                <h3 className={styles.actionsTitle}>Contact {candidate.fullName.split(' ')[0]}</h3>

                <button
                  onClick={() => router.push(`/messages?candidate=${candidateId}`)}
                  className={styles.connectBtn}
                  type="button"
                >
                  <MessageSquare size={18} />
                  Message {candidate.fullName.split(' ')[0]}
                </button>

                <div className={styles.actionRow}>
                  {hasAnyContact ? (
                    !showContact ? (
                      <button className={styles.actionBtn} onClick={() => setShowContact(true)}>
                        <Mail size={15} />
                        View Contact
                      </button>
                    ) : (
                      <button className={styles.actionBtn} onClick={() => setShowContact(false)}>
                        <Mail size={15} />
                        Hide Contact
                      </button>
                    )
                  ) : (
                    <button className={styles.actionBtn} disabled>
                      <Mail size={15} />
                      Contact Private
                    </button>
                  )}
                  {visibility.show_cv && candidate.cvUrl ? (
                    <SignedLink src={candidate.cvUrl} download className={styles.actionBtn}>
                      <FileDown size={15} />
                      Download CV
                    </SignedLink>
                  ) : (
                    <button className={styles.actionBtn} disabled>
                      <FileDown size={15} />
                      No CV
                    </button>
                  )}
                </div>

                {showContact && hasAnyContact && (
                  <div className={styles.contactDetails}>
                    {hasVisibleEmail && (
                      <div className={styles.contactItem}>
                        <span className={styles.contactLabel}>Email</span>
                        <a href={`mailto:${candidate.email}`} className={styles.contactValue}>{candidate.email}</a>
                      </div>
                    )}
                    {hasVisiblePhone && (
                      <div className={styles.contactItem}>
                        <span className={styles.contactLabel}>Phone</span>
                        <a href={`tel:${candidate.phone}`} className={styles.contactValue}>{candidate.phone}</a>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Quick Info — only fields not already in header */}
              {(visibility.show_date_of_birth && candidate.age) ? (
                <div className={styles.quickInfo}>
                  <h3 className={styles.quickInfoTitle}>Quick Info</h3>
                  <div className={styles.quickInfoItem}>
                    <span className={styles.quickInfoLabel}>Age</span>
                    <span className={styles.quickInfoValue}>{candidate.age} years old</span>
                  </div>
                </div>
              ) : null}

              {/* Social Links */}
              {visibility.show_social_links && (candidate.linkedinUrl || candidate.instagramUrl || candidate.facebookUrl) && (
                <div className={styles.quickInfo}>
                  <h3 className={styles.quickInfoTitle}>Social Links</h3>
                  <div className={styles.socialLinks}>
                    {candidate.linkedinUrl && (
                      <a href={normalizeUrl(candidate.linkedinUrl)} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        <span className={`${styles.socialIcon} ${styles.linkedinIcon}`}><FaLinkedinIn /></span>
                        LinkedIn Profile
                      </a>
                    )}
                    {candidate.facebookUrl && (
                      <a href={normalizeUrl(candidate.facebookUrl)} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        <span className={`${styles.socialIcon} ${styles.facebookIcon}`}><FaFacebookF /></span>
                        Facebook Profile
                      </a>
                    )}
                    {candidate.instagramUrl && (
                      <a href={normalizeUrl(candidate.instagramUrl)} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        <span className={`${styles.socialIcon} ${styles.instagramIcon}`}><FaInstagram /></span>
                        Instagram Profile
                      </a>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

    </main>
  )
}
