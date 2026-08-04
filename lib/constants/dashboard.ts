// Thresholds and windows the two dashboards answer questions with.
//
// ONE PLACE, because the same page was about to carry two different ideas of
// "stalled". The pipeline's StageDurationBadge already emphasises a card at 7
// and 14 days; the answer line's top sentence fires at 3. Those are genuinely
// different questions and both are right — but only if the numbers are declared
// side by side, where the difference is visible, rather than inlined in two
// files that can drift.

/**
 * How long a candidate sits in shortlisted before the answer line names them.
 *
 * Three days, not seven. The answer line asks "what needs me TODAY" and is read
 * for a few seconds on a phone; by the time the badge's 7-day emphasis appears,
 * the employer has already failed to act for a week. The badge is a status on a
 * card you are already looking at; this is the thing that makes you look.
 */
export const ANSWER_LINE_STALL_DAYS = 3

/**
 * The candidate side's "no news" threshold. Longer on purpose: a fortnight of
 * silence is normal in hiring and telling someone their application is stalled
 * after three days would be alarming rather than useful.
 */
export const CANDIDATE_NO_NEWS_DAYS = 14

/**
 * VIEW COUNTS ARE COMPARABLE FROM 11 AUGUST 2026.
 *
 * Anonymous views started counting on 4 August. Before that a click from a
 * shared link, a LinkedIn post or a search result counted zero, so any 7-day
 * window before this date straddles the change and mixes two different
 * measurements. "42 views this week" would read as a result when most of it is
 * the instrument being fixed.
 *
 * ON OR AFTER THIS DATE, the two view cells and the views clause in answer-line
 * row 6 can be turned on: search for VIEWS_COMPARABLE_FROM and the tests that
 * reference it. Deliberately a date rather than a feature flag — there is
 * nothing to decide, only a day to wait for.
 */
export const VIEWS_COMPARABLE_FROM = new Date('2026-08-11T00:00:00Z')

/** True once a full 7-day window sits entirely after the instrumentation change. */
export function viewCountsAreComparable(now: Date = new Date()): boolean {
  return now >= VIEWS_COMPARABLE_FROM
}
