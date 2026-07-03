'use client'

// Display-only onboarding showcase. Renders illustrative EXAMPLE data (never
// from/to the DB) so a brand-new employer's empty dashboard teaches instead of
// looking broken. Pure presentation — no Supabase, no writes; every CTA is real
// navigation. Rendered by the employer dashboard only when the account is empty.

import Link from 'next/link'
import {
  exampleJob, exampleApplicants, EXAMPLE_PIPELINE_STAGES, exampleInterview, exampleOffer,
} from '@/lib/example-data'
import styles from './ExampleShowcase.module.css'

function Badge() {
  return <span className={styles.badge}>Example</span>
}

export default function ExampleShowcase() {
  return (
    <section className={styles.wrap} aria-label="Example preview of your dashboard">
      <div className={styles.header}>
        <h2 className={styles.heading}>Here&apos;s what Thrive looks like once you&apos;re hiring</h2>
        <p className={styles.sub}>
          The cards below are examples to show you around — nothing here is real. Post your first job to start seeing your own candidates.
        </p>
      </div>

      {/* Example job */}
      <div className={styles.card} data-tour="example-job">
        <div className={styles.cardTop}>
          <span className={styles.cardKicker}>Your job listing</span>
          <Badge />
        </div>
        <div className={styles.jobRow}>
          <div className={styles.jobLogo}>{exampleJob.title.charAt(0)}</div>
          <div className={styles.jobMeta}>
            <div className={styles.jobTitle}>{exampleJob.title}</div>
            <div className={styles.jobSub}>
              {exampleJob.location} · £{exampleJob.salaryMin}–£{exampleJob.salaryMax}/{exampleJob.salaryPeriod}
            </div>
          </div>
          <div className={styles.jobStats}>
            <span><strong>{exampleJob.viewCount}</strong> views</span>
            <span><strong>{exampleJob.applicationCount}</strong> applicants</span>
          </div>
        </div>
        <Link href="/post-job" className={styles.cta}>Post your first job →</Link>
      </div>

      {/* Example pipeline */}
      <div className={styles.card} data-tour="example-pipeline">
        <div className={styles.cardTop}>
          <span className={styles.cardKicker}>Your hiring pipeline</span>
          <Badge />
        </div>
        <div className={styles.board}>
          {EXAMPLE_PIPELINE_STAGES.map(stage => {
            const cards = exampleApplicants.filter(a => a.stage === stage.key)
            return (
              <div key={stage.key} className={styles.col}>
                <div className={styles.colHead}>
                  <span>{stage.label}</span>
                  <span className={styles.colCount}>{cards.length}</span>
                </div>
                {cards.map(a => (
                  <div key={a.id} className={styles.chip}>
                    <span className={styles.avatar}>{a.initials}</span>
                    <span className={styles.chipMeta}>
                      <span className={styles.chipName}>{a.name}</span>
                      <span className={styles.chipSub}>{a.appliedAgo}</span>
                    </span>
                  </div>
                ))}
                {cards.length === 0 && <span className={styles.colEmpty}>—</span>}
              </div>
            )
          })}
        </div>
        <Link href="/pipeline" className={styles.ctaGhost}>Go to your pipeline →</Link>
      </div>

      {/* Example interview + offer */}
      <div className={styles.grid2}>
        <div className={styles.card} data-tour="example-interview">
          <div className={styles.cardTop}>
            <span className={styles.cardKicker}>Upcoming interview</span>
            <Badge />
          </div>
          <div className={styles.miniTitle}>{exampleInterview.candidate}</div>
          <div className={styles.miniSub}>{exampleInterview.role}</div>
          <div className={styles.miniLine}>📅 {exampleInterview.when}</div>
          <div className={styles.miniLine}>{exampleInterview.type}</div>
          <Link href="/settings/availability" className={styles.ctaGhost}>Set your availability →</Link>
        </div>

        <div className={styles.card} data-tour="example-offer">
          <div className={styles.cardTop}>
            <span className={styles.cardKicker}>Offer sent</span>
            <Badge />
          </div>
          <div className={styles.miniTitle}>{exampleOffer.candidate}</div>
          <div className={styles.miniSub}>{exampleOffer.role} · {exampleOffer.salary}</div>
          <div className={styles.miniLine}>Starts {exampleOffer.start}</div>
          <div className={styles.offerStatus}>{exampleOffer.status}</div>
          <Link href="/offers" className={styles.ctaGhost}>View offers →</Link>
        </div>
      </div>
    </section>
  )
}
