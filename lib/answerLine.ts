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

  // ROW 6 — SILENCE IS A LEGITIMATE ANSWER AND TAKES ONE LINE, NOT FIVE PANELS.
  // Deliberately no button: there is nothing to do, and offering an action
  // would manufacture one.
  //
  // The views clause is held until view counts are comparable — before 11
  // August a seven-day window straddles the morning anonymous views started
  // counting, and "{v} views this week" would read as a result when most of it
  // is the instrument being fixed. The sentence is complete without it.
  // ZERO ACTIVE ADS IS A STATE I DID NOT DRIVE, AND IT SHIPPED READING
  // "All quiet. nothing running right now." — a lowercase word after a full
  // stop. Row 6 was built and driven with an ad running; the state that comes
  // LATER, once every ad is filled, is the one nobody looked at. Exactly the
  // shape CLAUDE.md already records three times over.
  //
  // Clause-cased rather than sentence-cased, so it cannot happen again the next
  // time this string is reused mid-sentence: the views variant appends
  // ", {v} views this week" after it, where a capital would be wrong.
  const ads = state.activeJobs
  const adsClause = ads > 0
    ? `${ads} ${plural(ads, 'ad', 'ads')} running`
    : 'nothing running right now'
  const adsSentence = adsClause.charAt(0).toUpperCase() + adsClause.slice(1)

  const showViews = viewCountsAreComparable() && typeof state.viewsThisWeek === 'number' && state.viewsThisWeek > 0
  return {
    eyebrow: 'Today',
    sentence: showViews
      ? `All quiet. ${adsSentence}, ${state.viewsThisWeek} ${plural(state.viewsThisWeek!, 'view', 'views')} this week.`
      : `All quiet. ${adsSentence}.`,
  }
}
