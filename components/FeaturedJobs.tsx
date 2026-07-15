'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { supabaseJobToJob } from '@/lib/types'
import type { Job } from '@/lib/mockJobs'
import JobCardLink from '@/components/JobCardLink'
import styles from './FeaturedJobs.module.css'

// Curated handful of live roles on the home page — visual proof of real
// inventory and a candidate funnel entry. Deliberately a small set (8) of
// roles WITH photos: a full strip that showcases range and loads fast reads
// more premium on the hero than dumping all inventory; "See all jobs" carries
// anyone who wants the full filterable board one tap away. Each card links to
// the cold-safe /job/<id> page (not /jobs?id=). Cards reuse the exact /jobs
// image-led card classes so there's a single card visual system.

const SHOW = 8

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
            : jobs.map((job) => (
                <JobCardLink key={job.id} job={job} href={`/jobs?id=${job.id}`} className={styles.item} />
              ))}
        </div>
      </div>
    </section>
  )
}
