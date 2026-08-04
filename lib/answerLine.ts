import { ANSWER_LINE_STALL_DAYS, viewCountsAreComparable } from '@/lib/constants/dashboard'
import type { AnswerLineModel } from '@/components/AnswerLine'

// THE EMPLOYER SENTENCE TABLE. Evaluated in order; the first true row wins.
//
// Kept out of the component and out of the page so it can be read as a table
// and reasoned about without a browser. The order IS the product decision —
// it encodes what the employer should look at first — and it should be
// arguable by reading twenty lines rather than by tracing JSX.
//
// ROWS 3 AND 4 (interview today/tomorrow, unread messages) ARE NOT HERE YET.
// Each needs a query the employer dashboard does not currently make, and four
// rows working beats six half-wired. They slot in at their numbered positions
// when the queries land — the gaps are deliberate, not an oversight.

export interface EmployerAnswerState {
  /** Longest-stalled shortlisted candidate, if any. */
  stalled?: { name: string; days: number } | null
  /** Applications created since the employer last opened this dashboard. */
  newApplications: number
  /** Ads the employer has ever posted, any status. */
  totalJobs: number
  /** Ads currently live. */
  activeJobs: number
  /** Views in the last 7 days. Held back until the counts are comparable. */
  viewsThisWeek?: number | null
}

/**
 * A person's name, or an honest fallback.
 *
 * MESS TOLERANCE. Half these rows come from scraped listings and half-finished
 * profiles, so a name can be null, empty, or the string "undefined" written by
 * an earlier import. Any sentence naming a person has to survive all three
 * without printing them at the employer.
 */
function personName(raw: string | null | undefined): string | null {
  const s = (raw || '').trim()
  if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return null
  return s
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

// ── "nothing live right now", in two registers ──────────────────────
//
// ONE FACT, TWO PLACES ON THE SAME PAGE, ONE ROOT STRING. The answer line says
// it at the top; the Active Jobs panel's empty state says it again ~800px down.
//
// The first draft shared the WHOLE sentence, which fixed drift and created
// repetition: the same twenty-word line twice on a page whose entire purpose is
// to say things once. So the panel now takes the short form. They share the
// opening clause, which is what makes them read as the same fact rather than
// two — and they cannot drift, because there is one definition of that clause.
//
// The register is set by the neighbours, not by taste: every other empty state
// in that column is "No messages yet." and "No candidates".
const NOTHING_LIVE = 'Nothing live right now'

/** Panel register. Four words, to sit beside "No messages yet." */
export function nothingLiveShort(): string {
  return `${NOTHING_LIVE}.`
}

/**
 * Answer-line register: "Nothing live right now — your 4 roles are filled or
 * closed." Names the cause, because this is the line that has to carry the
 * whole state on its own.
 *
 * NOT a general-purpose formatter — it assumes the caller has established that
 * the employer has posted before and has nothing live now.
 */
export function nothingLiveSentence(totalJobs: number): string {
  const roles = totalJobs === 1 ? 'role is' : `${totalJobs} roles are`
  return `${NOTHING_LIVE} — your ${roles} filled or closed.`
}

export function employerAnswerLine(state: EmployerAnswerState): AnswerLineModel {
  const name = personName(state.stalled?.name)
  const stalledDays = state.stalled?.days ?? 0
  const isStalled = !!state.stalled && stalledDays >= ANSWER_LINE_STALL_DAYS
  const hasNew = state.newApplications > 0

  // ROWS 1 + 2 COMBINED. Where both are true the spec asks for one sentence of
  // at most two clauses, because two separate lines is two things to read and
  // the whole point is that there is one.
  if (isStalled && hasNew) {
    const n = state.newApplications
    const who = name
      ? `${name} has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}`
      : `someone has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}`
    return {
      eyebrow: 'Today',
      sentence: `${n} new ${plural(n, 'application', 'applications')}, and ${who}.`,
      action: { label: 'Review applications', href: '/applied' },
    }
  }

  // ROW 1 — a candidate has sat in shortlisted long enough that not deciding
  // has become the decision.
  if (isStalled) {
    return {
      eyebrow: 'Today',
      sentence: name
        ? `${name} has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}.`
        : `A candidate has been shortlisted for ${stalledDays} ${plural(stalledDays, 'day', 'days')}.`,
      action: { label: 'Review applications', href: '/applied' },
    }
  }

  // ROW 2 — new since they last looked.
  if (hasNew) {
    const n = state.newApplications
    return {
      eyebrow: 'Today',
      sentence: `${n} new ${plural(n, 'application', 'applications')}.`,
      action: { label: 'Review applications', href: '/applied' },
    }
  }

  // ROW 5 — day one. Names the cause rather than the absence.
  if (state.totalJobs === 0) {
    return {
      eyebrow: 'Today',
      sentence: 'Nothing needs you yet. Post a role and applications will land here.',
      action: { label: 'Post a job', href: '/post-job' },
    }
  }

  // ROW 5b — POSTED BEFORE, NOTHING LIVE NOW. A row of its own, sitting between
  // 5 and 6 because it belongs to neither.
  //
  // It shipped inside row 6 and read "All quiet. nothing running right now." —
  // a lowercase word after a full stop, which is how it was noticed. But the
  // capital was the smaller half of the fault. Row 6's contract is SILENCE IS A
  // LEGITIMATE ANSWER, DELIBERATELY NO BUTTON, and that was written for ads
  // live with nothing pending. An employer with an empty board is not in that
  // state: they have the single most important thing on the platform to do, and
  // answering them with "all quiet" and no action tells them to relax at the
  // exact moment the page should be handing them a button.
  //
  // The state that comes LATER — every ad eventually filled — is the one nobody
  // looked at, which CLAUDE.md now records for the fourth time.
  if (state.activeJobs === 0) {
    return {
      eyebrow: 'Today',
      sentence: nothingLiveSentence(state.totalJobs),
      action: { label: 'Post a job', href: '/post-job' },
    }
  }

  // ROW 6 — SILENCE IS A LEGITIMATE ANSWER AND TAKES ONE LINE, NOT FIVE PANELS.
  // Deliberately no button: there is nothing to do, and offering an action
  // would manufacture one. That claim is only true now that 5b has taken the
  // empty-board case out from under it.
  //
  // ads IS GUARANTEED >= 1 HERE — row 5 returned on totalJobs === 0 and row 5b
  // on activeJobs === 0. The zero branch that used to live in this clause is
  // deleted rather than left as a defensive fallback: an unreachable branch is
  // exactly what this one was mistaken for while it was quietly reachable, and
  // keeping a second, worse sentence for a state 5b now owns is how the two
  // drift apart.
  //
  // The views clause is held until view counts are comparable — before 11
  // August a seven-day window straddles the morning anonymous views started
  // counting, and "{v} views this week" would read as a result when most of it
  // is the instrument being fixed. The sentence is complete without it.
  const ads = state.activeJobs
  const adsClause = `${ads} ${plural(ads, 'ad', 'ads')} running`

  const showViews = viewCountsAreComparable() && typeof state.viewsThisWeek === 'number' && state.viewsThisWeek > 0
  return {
    eyebrow: 'Today',
    sentence: showViews
      ? `All quiet. ${adsClause}, ${state.viewsThisWeek} ${plural(state.viewsThisWeek!, 'view', 'views')} this week.`
      : `All quiet. ${adsClause}.`,
  }
}
