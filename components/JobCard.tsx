'use client'

import type { Job } from '@/lib/mockJobs'
import FeedCard from '@/components/FeedCard'
import { cardModelFromJob } from '@/lib/jobCard'
import styles from '@/app/jobs/page.module.css'

// The job board card. Everything visual now lives in <FeedCard>; this file is
// the job-shaped half of it — the model mapping plus the controls only a job has
// (save, applied, shortlisted).
//
// It kept its name and its props on purpose: /jobs is the busiest page in the
// product and this refactor should be invisible there. Nothing about how a job
// renders changed, only where the code for it lives.

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
  const showSave = typeof onToggleSave === 'function'

  return (
    <FeedCard
      model={cardModelFromJob(job)}
      onSelect={onSelect ? () => onSelect(job) : undefined}
      boosted={boosted}
      controls={showSave ? (
        <button
          className={`${styles.cardSave} ${saved ? styles.cardSaved : ''}`}
          onClick={e => { e.stopPropagation(); onToggleSave!(job) }}
          aria-label={saved ? 'Unsave job' : 'Save job'}
        >
          <svg viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      ) : undefined}
      stamps={<>
        {applied && <span className={styles.cardApplied}>Applied ✓</span>}
        {shortlisted && <span className={styles.jobCardStamp}>SHORTLISTED</span>}
      </>}
    />
  )
}
