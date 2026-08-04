'use client'

import Link from 'next/link'
import styles from './SetupStrip.module.css'

// One strip in place of three onboarding devices.
//
// The employer dashboard carried a "Get started with Thrive" checklist, an
// "Enable interview scheduling" banner — which was ALREADY item 4 of that same
// checklist, so the page nagged twice about one thing — and a "Take the tour"
// button, each in its own block, all above any news.
//
// COMPLETED ITEMS DISAPPEAR RATHER THAN SHOWING AS TICKED. A finished task is
// not information; it is a row of reassurance occupying space on a page read
// for ninety seconds. The strip shrinks as they work and vanishes entirely at
// four of four — which is a better reward than four green ticks, because the
// page gets shorter.

export interface SetupItem {
  key: string
  label: string
  href: string
  done: boolean
}

export default function SetupStrip({
  items,
  onDismiss,
  tour,
}: {
  items: SetupItem[]
  onDismiss: () => void
  /** The tour trigger, absorbed rather than given its own row. */
  tour?: React.ReactNode
}) {
  const remaining = items.filter(i => !i.done)
  const done = items.length - remaining.length

  // Nothing left to do — the strip has earned its own removal.
  if (remaining.length === 0) return null

  return (
    <section className={styles.strip} aria-label="Setup">
      <div className={styles.head}>
        <p className={styles.label}>Setup · {done} of {items.length}</p>
        <button type="button" className={styles.dismiss} onClick={onDismiss}>Dismiss</button>
      </div>
      <div className={styles.chips}>
        {remaining.map(i => (
          <Link key={i.key} href={i.href} className={styles.chip}>{i.label}</Link>
        ))}
        {tour}
      </div>
    </section>
  )
}
