'use client'

// Display-only onboarding showcase. Renders illustrative EXAMPLE data (never
// from/to the DB) so a brand-new employer's empty dashboard teaches instead of
// looking broken. Pure presentation — no Supabase, no writes; every CTA is real
// navigation. Rendered by the employer dashboard only when the account is empty.
//
// The example "job" is a mini form-preview whose fields fill in one at a time as
// the guided tour advances (via window events dispatched by EmployerTour), so a
// new employer sees how a posting comes together. Outside the tour it just shows
// the completed example.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  exampleJob, exampleApplicants, EXAMPLE_PIPELINE_STAGES, exampleInterview, exampleOffer,
} from '@/lib/example-data'
import styles from './ExampleShowcase.module.css'

const JOB_FIELDS = 4 // title, pay, location, description

function Badge() {
  return <span className={styles.badge}>Example</span>
}

export default function ExampleShowcase() {
  // How many job fields are revealed. Full by default; the tour resets to 0 and
  // reveals them step by step, then marks done.
  const [jobReveal, setJobReveal] = useState(JOB_FIELDS)

  useEffect(() => {
    const onReset = () => setJobReveal(0)
    const onReveal = (e: Event) => setJobReveal((e as CustomEvent).detail as number)
    const onDone = () => setJobReveal(JOB_FIELDS)
    window.addEventListener('thrive-tour:job-reset', onReset)
    window.addEventListener('thrive-tour:job-reveal', onReveal as EventListener)
    window.addEventListener('thrive-tour:job-done', onDone)
    return () => {
      window.removeEventListener('thrive-tour:job-reset', onReset)
      window.removeEventListener('thrive-tour:job-reveal', onReveal as EventListener)
      window.removeEventListener('thrive-tour:job-done', onDone)
    }
  }, [])

  const field = (revealAt: number, label: string, value: string, placeholder: string, anchor: string) => (
    <div className={styles.field} data-tour={anchor}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldBox}>
        {jobReveal >= revealAt
          ? <span className={styles.fieldVal}>{value}</span>
          : <span className={styles.fieldGhost}>{placeholder}</span>}
      </div>
    </div>
  )

  return (
    <section className={styles.wrap} aria-label="Example preview of your dashboard">
      <div className={styles.header}>
        <h2 className={styles.heading}>Here&apos;s what Thrive looks like once you&apos;re hiring</h2>
        <p className={styles.sub}>
          The cards below are examples to show you around — nothing here is real. Post your first job to start seeing your own candidates.
        </p>
      </div>

      {/* Example job — a mini form preview that fills in during the tour */}
      <div className={styles.card}>
        <div className={styles.cardTop}>
          <span className={styles.cardKicker}>Post a job</span>
          <Badge />
        </div>
        <div className={styles.form}>
          {field(1, 'Job title', exampleJob.title, 'e.g. Bartender', 'ex-title')}
          {field(2, 'Pay', `£${exampleJob.salaryMin}–£${exampleJob.salaryMax}/${exampleJob.salaryPeriod}`, 'e.g. £12–£14/hour', 'ex-pay')}
          {field(3, 'Location', `${exampleJob.location} · ${exampleJob.area}`, 'e.g. London', 'ex-location')}
          {field(4, 'Description', exampleJob.description, 'A short summary of the role…', 'ex-desc')}
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
