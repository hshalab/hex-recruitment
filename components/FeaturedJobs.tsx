'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { supabaseJobToJob } from '@/lib/types'
import type { Job } from '@/lib/mockJobs'
import { resolveJobBanner } from '@/lib/jobBanner'
import BrandedJobFallback from '@/components/BrandedJobFallback'
import BrandedLogoFallback from '@/components/BrandedLogoFallback'
import CompanyLogo from '@/components/CompanyLogo'
import jobStyles from '@/app/jobs/page.module.css'
import styles from './FeaturedJobs.module.css'

// Curated handful of live roles on the home page — visual proof of real
// inventory and a candidate funnel entry. Deliberately a small set (8) of
// roles WITH photos: a full strip that showcases range and loads fast reads
// more premium on the hero than dumping all inventory; "See all jobs" carries
// anyone who wants the full filterable board one tap away. Each card links to
// the cold-safe /job/<id> page (not /jobs?id=). Cards reuse the exact /jobs
// image-led card classes so there's a single card visual system.

const SHOW = 8

function formatSalary(job: Job): string {
  const single = !job.salaryMax || job.salaryMin === job.salaryMax
  if (job.salaryPeriod === 'hour') {
    return single ? `£${job.salaryMin}/hr` : `£${job.salaryMin}–£${job.salaryMax}/hr`
  }
  return single
    ? `£${Math.round(job.salaryMin / 1000)}k`
    : `£${Math.round(job.salaryMin / 1000)}k–£${Math.round(job.salaryMax / 1000)}k`
}

export default function FeaturedJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .not('company_banner_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(16)
      if (!alive) return
      const mapped = (data || [])
        .map(supabaseJobToJob)
        .filter((j) => j.companyBanner)
        .slice(0, SHOW)
      setJobs(mapped)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  // Nothing to show (and not loading) — hide the strip entirely rather than
  // render an empty section.
  if (!loading && jobs.length === 0) return null

  return (
    <section className={styles.section} aria-label="Featured live roles">
      <div className={styles.inner}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Live roles hiring now</h2>
            <p className={styles.subtitle}>Real openings from employers on Thrive</p>
          </div>
          <Link href="/jobs" className={styles.seeAll}>See all jobs →</Link>
        </div>

        <div className={styles.scroller}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={styles.item} aria-hidden="true">
                  <div className={styles.skeleton} />
                </div>
              ))
            : jobs.map((job) => {
                const banner = resolveJobBanner({
                  id: job.id,
                  companyBanner: job.companyBanner,
                  company: job.company,
                  category: job.category,
                })
                const initial = (job.company || '?').trim().charAt(0).toUpperCase() || '?'
                return (
                  <Link key={job.id} href={`/job/${job.id}`} className={styles.item}>
                    <div className={`${jobStyles.jobCard} ${banner ? '' : jobStyles.jobCardFallback}`}>
                      {banner ? (
                        <div className={jobStyles.cardBg} style={{ backgroundImage: `url(${banner})` }} aria-hidden="true" />
                      ) : job.companyLogo ? (
                        <BrandedLogoFallback logoUrl={job.companyLogo} company={job.company} seed={job.id} />
                      ) : (
                        <BrandedJobFallback company={job.company} seed={job.id} />
                      )}
                      <div className={jobStyles.cardScrim} aria-hidden="true" />
                      <div className={jobStyles.cardContent}>
                        <div className={jobStyles.cardCompanyRow}>
                          <span className={jobStyles.cardChip}>
                            {job.companyLogo ? (
                              <CompanyLogo src={job.companyLogo} alt={job.company} className={jobStyles.cardChipImg} />
                            ) : (
                              initial
                            )}
                          </span>
                          <span className={jobStyles.cardCompany}>
                            {job.company}
                            {job.isRecruiterPosting && <span className={jobStyles.cardViaRecruiter}> · via recruiter</span>}
                          </span>
                        </div>
                        <h3 className={jobStyles.cardRole}>{job.title}</h3>
                        <div className={jobStyles.cardMeta}>
                          <span>{job.location}{job.area ? `, ${job.area}` : ''}</span>
                          <span className={jobStyles.cardDot}>·</span>
                          <span className={jobStyles.cardSalary}>{formatSalary(job)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
        </div>
      </div>
    </section>
  )
}
