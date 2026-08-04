// HOW LONG A CANDIDATE HAS SAT IN A STAGE — one calculation, two renderings.
//
// This was a private helper inside components/StageDurationBadge.tsx. The phone
// pipeline's "waiting 4d" note is the same number in different words, and a
// second implementation of it would have been a second thing to get wrong: the
// midnight semantics below are subtle enough that two copies WOULD diverge, and
// two different answers to "how long has this person been waiting" on one page
// is worse than either answer alone.
//
// So the badge and the row note both call this. The wording lives with each
// caller; the arithmetic lives here.

/**
 * Whole days between a stage entry timestamp and now, by LOCAL CALENDAR DAY.
 *
 * Deliberately not `Math.floor(msElapsed / 86400000)`. A card moved at 23:59
 * yesterday should read as 1 day this morning, not as 0 until 23:59 tonight —
 * employers count sleeps, not elapsed hours. Normalising both ends to local
 * midnight gives that; UTC math would split cards by the timezone offset, so a
 * card moved at 01:00 GMT would read "1 day" to a UK user immediately.
 *
 * Never negative: a clock skew or a future timestamp reads as 0 rather than as
 * a negative day count rendering "-1 days in Shortlisted".
 */
export function daysInStage(stageEnteredAt: string, now: Date = new Date()): number {
  const from = new Date(stageEnteredAt)
  if (Number.isNaN(from.getTime())) return 0
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.round((nowMidnight - fromMidnight) / 86_400_000))
}
