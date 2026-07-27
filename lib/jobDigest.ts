// "New jobs in your areas" digest — selection rules.
//
// Pure and side-effect free so the cron route stays a thin shell around it and
// every rule below is testable without a database or a mail provider. Nothing
// here sends, writes or reads: callers pass rows in and get decisions out.
//
// Keyed off preferred_areas, NOT job_alerts. job_alerts has never had a row and
// is treated as legacy — see lib/areas.ts for the matching primitives, which
// already back the in-app filter.

import { jobMatchesPreferredAreas, parsePreferredAreas, describePreferredAreas } from './areas'
import { normalisePrefs, type CandidatePrefs, type NotificationFrequency } from './notificationPrefs'

/**
 * How far back a candidate's FIRST digest looks. Without this, a null watermark
 * would read as "everything ever posted" and the first email would list all 246
 * active jobs. A week is the same horizon the weekly cadence implies.
 */
export const FIRST_RUN_LOOKBACK_DAYS = 7

/** Most roles listed in one email. Beyond this the email stops being scannable. */
export const MAX_JOBS_PER_EMAIL = 10

const DAY_MS = 86_400_000

export interface DigestCandidateRow {
  user_id: string
  email: string | null
  full_name: string | null
  preferred_areas: string[] | null
  notification_preferences: unknown
  last_digest_sent_at: string | null
}

export interface DigestJobRow {
  id: string
  title: string | null
  company: string | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  salary_type: string | null
  posted_at: string | null
  created_at: string | null
  area_region: string | null
  area_county: string | null
}

export type ExclusionReason =
  | 'no-email'
  | 'digest-off'
  | 'no-areas'
  | 'not-due'
  | 'unconfirmed'
  | 'no-new-jobs'

/** Cadence in days for a stored frequency. 'instant' is treated as daily —
 *  a digest is by definition a batch, so there is no instant digest. */
export function cadenceDays(frequency: NotificationFrequency): number {
  return frequency === 'weekly' ? 7 : 1
}

export function candidatePrefs(row: DigestCandidateRow): CandidatePrefs {
  return normalisePrefs('employee', row.notification_preferences) as CandidatePrefs
}

/**
 * Is this candidate's cadence up? A null watermark is always due (they have
 * never had one). Uses >= so a run at the same time each day isn't skipped by
 * a few seconds of drift.
 */
export function isDue(row: DigestCandidateRow, now: Date = new Date()): boolean {
  if (!row.last_digest_sent_at) return true
  const last = new Date(row.last_digest_sent_at).getTime()
  if (!Number.isFinite(last)) return true
  const elapsedDays = (now.getTime() - last) / DAY_MS
  // Half a day of slack, so a cron that runs a little early still counts.
  return elapsedDays >= cadenceDays(candidatePrefs(row).frequency) - 0.5
}

/** Jobs created after this instant are "new" for this candidate. */
export function windowStart(row: DigestCandidateRow, now: Date = new Date()): Date {
  if (row.last_digest_sent_at) {
    const d = new Date(row.last_digest_sent_at)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * DAY_MS)
}

/**
 * Why this candidate gets nothing, or null if they're eligible. Order matters:
 * the first true reason is the one reported, cheapest and most decisive first.
 *
 * `confirmedEmails` is the set of user_ids with a confirmed email address.
 * Unconfirmed accounts are skipped for the same reason the employer activation
 * drip skips them — mailing an address nobody has proven they own is a
 * deliverability risk, and abandoned signups are exactly where bounces come from.
 */
export function exclusionReason(
  row: DigestCandidateRow,
  confirmedEmails: Set<string>,
  now: Date = new Date()
): ExclusionReason | null {
  if (!row.email || !row.email.trim()) return 'no-email'
  if (!confirmedEmails.has(row.user_id)) return 'unconfirmed'
  if (!candidatePrefs(row).email.job_digest) return 'digest-off'
  // Deliberately stricter than the in-app filter. There, "no areas picked"
  // means "show everything" — right for browsing, wrong for push. We do not
  // email a national job list to somebody who never asked for one.
  if (parsePreferredAreas(row.preferred_areas).isEmpty) return 'no-areas'
  if (!isDue(row, now)) return 'not-due'
  return null
}

/**
 * The jobs this candidate should be shown: active, in their areas, created
 * since their watermark, newest first. Caller passes only active jobs.
 */
export function selectJobs(
  row: DigestCandidateRow,
  jobs: DigestJobRow[],
  now: Date = new Date()
): DigestJobRow[] {
  const prefs = parsePreferredAreas(row.preferred_areas)
  const since = windowStart(row, now).getTime()

  return jobs
    .filter(j => {
      const created = j.created_at ? new Date(j.created_at).getTime() : NaN
      if (!Number.isFinite(created) || created <= since) return false
      return jobMatchesPreferredAreas({ areaRegion: j.area_region, areaCounty: j.area_county }, prefs)
    })
    .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
}

export interface DigestPlan {
  row: DigestCandidateRow
  jobs: DigestJobRow[]
  /** How many matched beyond MAX_JOBS_PER_EMAIL. */
  overflow: number
  areaNames: string[]
}

/**
 * Full plan for one candidate: null when they should get no email at all.
 * Zero matches is a null plan, not an empty email — an "0 new jobs" digest
 * teaches people to ignore the next one.
 */
export function planFor(
  row: DigestCandidateRow,
  jobs: DigestJobRow[],
  confirmedEmails: Set<string>,
  now: Date = new Date()
): { plan: DigestPlan | null; reason: ExclusionReason | null } {
  const reason = exclusionReason(row, confirmedEmails, now)
  if (reason) return { plan: null, reason }

  const matched = selectJobs(row, jobs, now)
  if (matched.length === 0) return { plan: null, reason: 'no-new-jobs' }

  return {
    plan: {
      row,
      jobs: matched.slice(0, MAX_JOBS_PER_EMAIL),
      overflow: Math.max(0, matched.length - MAX_JOBS_PER_EMAIL),
      areaNames: describePreferredAreas(row.preferred_areas),
    },
    reason: null,
  }
}

/** Salary line for one job, or null when we don't have honest numbers.
 *  Never invents a range: min-only and max-only are phrased as such. */
export function formatSalary(job: DigestJobRow): string | null {
  const { salary_min: min, salary_max: max, salary_type: type } = job
  const hasMin = typeof min === 'number' && min > 0
  const hasMax = typeof max === 'number' && max > 0
  if (!hasMin && !hasMax) return null

  const unit = type === 'hour' ? '/hr' : type === 'day' ? '/day' : type === 'month' ? '/mo' : type === 'week' ? '/wk' : ''
  const money = (n: number) =>
    unit === '' ? `£${Math.round(n).toLocaleString('en-GB')}` : `£${Number(n.toFixed(2)).toLocaleString('en-GB')}`

  if (hasMin && hasMax) {
    return min === max ? `${money(min!)}${unit}` : `${money(min!)}–${money(max!)}${unit}`
  }
  return hasMin ? `From ${money(min!)}${unit}` : `Up to ${money(max!)}${unit}`
}
