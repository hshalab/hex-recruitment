'use client'

import type { Job } from '@/lib/mockJobs'
import CompanyLogo from '@/components/CompanyLogo'
import BrandedJobFallback from '@/components/BrandedJobFallback'
import BrandedLogoFallback from '@/components/BrandedLogoFallback'
import { resolveJobBanner } from '@/lib/jobBanner'
import { formatJobSalary, getPostedDaysAgo } from '@/lib/jobCard'

// The job board card, extracted so /jobs and /temp-work render the SAME thing.
//
// Two pages showing the same roles in different cards reads as two products.
// This is the one card; anything that differs between the pages is a prop, not
// a fork.
//
// ON THE STYLESHEET: this imports app/jobs/page.module.css rather than owning a
// copy. That is deliberate and it is a trade.
//
// Moving the ~30 card rules into a component stylesheet is the tidier shape,
// but /jobs is the busiest page in the product and a missed rule would show up
// as a subtly broken card there rather than here. Sharing the existing sheet
// makes it impossible for the two pages to drift apart visually, which is the
// property actually being bought today. Worth moving properly when someone can
// regression-test /jobs at leisure — noted rather than pretended away.
import styles from '@/app/jobs/page.module.css'

export interface JobCardProps {
  job: Job
  onSelect?: (job: Job) => void
  /** Save control. Omit both and no bookmark button renders — /temp-work does
   *  not carry save state today. */
  saved?: boolean
  onToggleSave?: (job: Job) => void
  applied?: boolean
  shortlisted?: boolean
  boosted?: boolean
}

export default function JobCard({
  job, onSelect, saved, onToggleSave, applied, shortlisted, boosted,
}: JobCardProps) {
  const banner = resolveJobBanner({
    id: job.id, companyBanner: job.companyBanner, company: job.company, category: job.category,
  })
  const initial = (job.company || '?').trim().charAt(0).toUpperCase() || '?'
  const isNew = getPostedDaysAgo(job.postedAt) <= 2
  const easyApply = !job.tags?.includes('CV required') && !job.tags?.includes('Cover letter required')
  const badges = Array.isArray(job.employmentType)
    ? job.employmentType.slice(0, 2)
    : (job.employmentType ? [job.employmentType] : [])
  const showSave = typeof onToggleSave === 'function'

  return (
    <div
      className={`${styles.jobCard} ${banner ? '' : styles.jobCardFallback} ${boosted ? styles.jobCardBoosted : ''}`}
      onClick={() => onSelect?.(job)}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={e => { if (onSelect && e.key === 'Enter') onSelect(job) }}
    >
      {banner
        ? <div className={styles.cardBg} style={{ backgroundImage: `url(${banner})` }} aria-hidden="true" />
        : job.companyLogo
          ? <BrandedLogoFallback logoUrl={job.companyLogo} company={job.company} seed={job.id} />
          : <BrandedJobFallback company={job.company} seed={job.id} />}
      <div className={styles.cardScrim} aria-hidden="true" />

      {isNew && <span className={styles.cardNew}>New</span>}
      {showSave && (
        <button
          className={`${styles.cardSave} ${saved ? styles.cardSaved : ''}`}
          onClick={e => { e.stopPropagation(); onToggleSave!(job) }}
          aria-label={saved ? 'Unsave job' : 'Save job'}
        >
          <svg viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      <div className={styles.cardContent}>
        <div className={styles.cardCompanyRow}>
          <span className={styles.cardChip}>
            {job.companyLogo
              ? <CompanyLogo src={job.companyLogo} alt={job.company} className={styles.cardChipImg} />
              : initial}
          </span>
          <span className={styles.cardCompany}>
            {job.company}
            {job.isRecruiterPosting && <span className={styles.cardViaRecruiter}> · via recruiter</span>}
          </span>
        </div>
        <h3 className={styles.cardRole}>{job.title}</h3>
        <div className={styles.cardMeta}>
          <span>{job.location}{job.area ? `, ${job.area}` : ''}</span>
          <span className={styles.cardDot}>·</span>
          <span className={styles.cardSalary}>{formatJobSalary(job)}</span>
        </div>
        <div className={styles.cardBadges}>
          {badges.map((t, i) => <span key={i} className={styles.cardBadge}>{t}</span>)}
          {job.workLocationType && <span className={styles.cardBadge}>{job.workLocationType}</span>}
          {job.urgent && <span className={styles.cardBadge}>Urgent</span>}
          {easyApply && <span className={`${styles.cardBadge} ${styles.cardBadgeApply}`}>⚡ Easy apply</span>}
        </div>
      </div>

      {applied && <span className={styles.cardApplied}>Applied ✓</span>}
      {shortlisted && <span className={styles.jobCardStamp}>SHORTLISTED</span>}
    </div>
  )
}
