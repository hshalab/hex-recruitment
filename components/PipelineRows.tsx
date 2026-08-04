'use client'

import Link from 'next/link'
import styles from './PipelineRows.module.css'

// THE PIPELINE AS SIX ROWS, ON A PHONE.
//
// The dashboard's pipeline was a horizontal scroller of stage columns. At 390
// that put the board's later stages off-screen behind a sideways swipe nobody
// makes, inside a page that scrolls vertically — and it was one of TWO nested
// horizontal scrollers on the same screen, which was the specific failure.
//
// Six full-width rows instead. Everything is visible without a gesture, the
// counts line up in a column so they can be compared at a glance, and each row
// is a tap target that lands on that stage.
//
// DESKTOP IS UNTOUCHED. The Kanban columns still render above 960; this
// component is only mounted below it. The two are not a shared abstraction with
// a breakpoint switch, deliberately — the desktop board shows named candidate
// cards and this shows counts, and pretending they are one component with two
// skins would make both harder to change.
//
// ZERO ROWS ARE STILL TAPPABLE. A row that does nothing when pressed invites a
// second, harder press and then a complaint that the dashboard is broken. An
// empty stage list is a real answer — "nobody is at offer yet" — and it is the
// answer the tap was asking for.

export interface PipelineRow {
  /** Stage key, e.g. 'shortlisted'. Used for the route and the React key. */
  key: string
  label: string
  count: number
  /** Plain-language note: "2 new", "waiting 4d". Omit when there is nothing
   *  worth saying — an empty note reads better than a padded one. */
  note?: string | null
  href: string
}

export default function PipelineRows({ rows }: { rows: PipelineRow[] }) {
  return (
    <div className={styles.rows}>
      {rows.map(r => {
        const active = r.count > 0
        return (
          <Link
            key={r.key}
            href={r.href}
            className={`${styles.row} ${active ? styles.rowActive : styles.rowEmpty}`}
            aria-label={`${r.label}, ${r.count} ${r.count === 1 ? 'candidate' : 'candidates'}${r.note ? `, ${r.note}` : ''}`}
          >
            <span className={styles.count}>{r.count}</span>
            <span className={styles.label}>{r.label}</span>
            {r.note ? <span className={styles.note}>{r.note}</span> : null}
            <span className={styles.chevron} aria-hidden="true">&rsaquo;</span>
          </Link>
        )
      })}
    </div>
  )
}
