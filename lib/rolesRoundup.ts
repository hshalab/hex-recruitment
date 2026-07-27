// "Roles for you this week" — recurring re-engagement roundup.
//
// SIBLING OF, NOT THE SAME AS, lib/jobDigest.ts:
//   digest  = "NEW jobs since we last wrote" — recency-gated, silent when
//             nothing has been posted (which is the case right now).
//   roundup = "what's on the market for you RIGHT NOW" — ranked over the
//             CURRENT active inventory, so it works even while ingestion is
//             stalled. To a dormant candidate who has never seen them, roles
//             already on the board are new.
//
// Pure and side-effect free, same as the digest: the cron route stays a thin
// shell and every rule here is testable without a database or a mail provider.

import { jobMatchesPreferredAreas, parsePreferredAreas, describePreferredAreas } from './areas'
import { normalisePrefs, type CandidatePrefs } from './notificationPrefs'
import { formatSalary, type DigestJobRow } from './jobDigest'

/** Roles per email. Eight stays scannable on a phone and reads curated. */
export const ROLES_PER_EMAIL = 8

/** How many recently-sent job ids to remember, so consecutive weeks differ.
 *  Three weeks' worth: enough to rotate, small enough to keep in one column. */
export const ROUNDUP_MEMORY = ROLES_PER_EMAIL * 3

/** Fixed weekly cadence — this product is a weekly roundup by definition, so
 *  it does NOT read the per-candidate daily/weekly frequency the digest uses. */
export const CADENCE_DAYS = 7

const DAY_MS = 86_400_000

export type MatchMode = 'area' | 'profile'

export interface RoundupCandidateRow {
  user_id: string
  email: string | null
  full_name: string | null
  job_title: string | null
  job_sector: string | null
  preferred_areas: string[] | null
  notification_preferences: unknown
  roundup_state: unknown
}

export interface RoundupState {
  lastSentAt: string | null
  recentJobIds: string[]
}

export const EMPTY_ROUNDUP_STATE: RoundupState = { lastSentAt: null, recentJobIds: [] }

export type ExclusionReason =
  | 'no-email'
  | 'unconfirmed'
  | 'digest-off'
  | 'no-signal'
  | 'not-due'
  | 'no-matches'

/** Tolerant read: anything malformed degrades to "never sent", never throws. */
export function parseRoundupState(raw: unknown): RoundupState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_ROUNDUP_STATE }
  const r = raw as Record<string, unknown>
  return {
    lastSentAt: typeof r.lastSentAt === 'string' ? r.lastSentAt : null,
    recentJobIds: Array.isArray(r.recentJobIds) ? r.recentJobIds.filter(x => typeof x === 'string') as string[] : [],
  }
}

/** New state after a successful send: newest ids first, capped. */
export function markSent(state: RoundupState, jobIds: string[], now = new Date()): RoundupState {
  const merged = [...jobIds, ...state.recentJobIds.filter(id => !jobIds.includes(id))]
  return { lastSentAt: now.toISOString(), recentJobIds: merged.slice(0, ROUNDUP_MEMORY) }
}

export function candidatePrefs(row: RoundupCandidateRow): CandidatePrefs {
  return normalisePrefs('employee', row.notification_preferences) as CandidatePrefs
}

export function isDue(row: RoundupCandidateRow, now: Date = new Date()): boolean {
  const { lastSentAt } = parseRoundupState(row.roundup_state)
  if (!lastSentAt) return true
  const last = new Date(lastSentAt).getTime()
  if (!Number.isFinite(last)) return true
  // Half a day of slack so a cron running slightly early doesn't skip a week.
  return (now.getTime() - last) / DAY_MS >= CADENCE_DAYS - 0.5
}

// ── Title matching ───────────────────────────────────────────────────
//
// Candidate titles in the wild are messy — "Head.chef ", "exec chef/head chef",
// "Sous Chef, pizza chef". Split on anything non-alphabetic and normalise.

const STOPWORDS = new Set([
  'de', 'the', 'and', 'of', 'for', 'a', 'an', 'to', 'in', 'at', 'with', 'or', 'my', 'we',
])

const ALIASES: Record<string, string> = {
  exec: 'executive',
  chefs: 'chef',
  managers: 'manager',
  asst: 'assistant',
  snr: 'senior',
  jnr: 'junior',
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  const raw = text.toLowerCase().split(/[^a-z]+/)
  const out: string[] = []
  for (const t of raw) {
    if (t.length < 2) continue
    const token = ALIASES[t] || t
    if (STOPWORDS.has(token)) continue
    if (!out.includes(token)) out.push(token)
  }
  return out
}

/**
 * Inverse document frequency over the CURRENT job titles.
 *
 * Computed from live inventory rather than a hand-kept weighting list, so it
 * tunes itself: with a board that is 100% chef roles, "chef" is worth almost
 * nothing and "pastry", "partie" or "sous" carry the match. If the mix changes,
 * the weights change with it and nobody has to remember to update a constant.
 */
export function buildIdf(jobs: DigestJobRow[]): Map<string, number> {
  const df = new Map<string, number>()
  for (const j of jobs) {
    for (const t of tokenize(j.title)) df.set(t, (df.get(t) || 0) + 1)
  }
  const n = Math.max(1, jobs.length)
  const idf = new Map<string, number>()
  for (const [t, count] of Array.from(df)) idf.set(t, Math.log(1 + n / (1 + count)))
  return idf
}

/** How well a job's title matches what this candidate says they do. */
export function titleScore(
  candidateTokens: string[],
  job: DigestJobRow,
  idf: Map<string, number>
): number {
  if (candidateTokens.length === 0) return 0
  const jobTokens = tokenize(job.title)
  let score = 0
  for (const t of candidateTokens) {
    if (jobTokens.includes(t)) score += idf.get(t) ?? Math.log(2)
  }
  return score
}

function sectorBonus(row: RoundupCandidateRow, job: DigestJobRow & { category?: string | null }): number {
  const want = (row.job_sector || '').trim().toLowerCase()
  if (!want) return 0
  return want === (job.category || '').trim().toLowerCase() ? 0.5 : 0
}

/** Which signal do we have for this candidate? Areas win when both exist. */
export function matchModeFor(row: RoundupCandidateRow): MatchMode | null {
  if (!parsePreferredAreas(row.preferred_areas).isEmpty) return 'area'
  if (tokenize(row.job_title).length > 0 || (row.job_sector || '').trim()) return 'profile'
  return null
}

export function exclusionReason(
  row: RoundupCandidateRow,
  confirmedEmails: Set<string>,
  now: Date = new Date()
): ExclusionReason | null {
  if (!row.email || !row.email.trim()) return 'no-email'
  if (!confirmedEmails.has(row.user_id)) return 'unconfirmed'
  // Same opt-in key as the digest: the "Job digest" toggle on
  // /settings/notifications governs both roundup-style emails.
  if (!candidatePrefs(row).email.job_digest) return 'digest-off'
  // Nothing on the profile to match against. We do not send a generic national
  // list under a subject line that claims it matches their profile.
  if (!matchModeFor(row)) return 'no-signal'
  if (!isDue(row, now)) return 'not-due'
  return null
}

export interface RoundupPlan {
  row: RoundupCandidateRow
  mode: MatchMode
  jobs: DigestJobRow[]
  /** Total matching roles on the board, before the top-8 cut. */
  totalMatches: number
  areaNames: string[]
  /** True when everything matching had been sent recently and we recycled. */
  recycled: boolean
}

/**
 * Rank this candidate's CURRENT matching roles, best first.
 *
 * area mode:    areas are a filter (they asked for those places); title
 *               affinity then orders what's left, recency breaks ties.
 * profile mode: title/sector affinity is the filter AND the order; a job that
 *               matches nothing about them is not "a role for you".
 */
export function rankMatches(
  row: RoundupCandidateRow,
  jobs: (DigestJobRow & { category?: string | null })[],
  idf: Map<string, number>
): { mode: MatchMode; ranked: DigestJobRow[] } | null {
  const mode = matchModeFor(row)
  if (!mode) return null

  const tokens = tokenize(row.job_title)
  const prefs = parsePreferredAreas(row.preferred_areas)

  const scored = jobs
    .map(j => ({ job: j, score: titleScore(tokens, j, idf) + sectorBonus(row, j) }))
    .filter(({ job, score }) =>
      mode === 'area'
        ? jobMatchesPreferredAreas({ areaRegion: job.area_region, areaCounty: job.area_county }, prefs)
        : score > 0
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.job.created_at || 0).getTime() - new Date(a.job.created_at || 0).getTime()
    })

  return { mode, ranked: scored.map(s => s.job) }
}

export function planFor(
  row: RoundupCandidateRow,
  jobs: (DigestJobRow & { category?: string | null })[],
  idf: Map<string, number>,
  confirmedEmails: Set<string>,
  now: Date = new Date()
): { plan: RoundupPlan | null; reason: ExclusionReason | null } {
  const reason = exclusionReason(row, confirmedEmails, now)
  if (reason) return { plan: null, reason }

  const result = rankMatches(row, jobs, idf)
  if (!result || result.ranked.length === 0) return { plan: null, reason: 'no-matches' }

  const { recentJobIds } = parseRoundupState(row.roundup_state)
  const fresh = result.ranked.filter(j => !recentJobIds.includes(j.id))

  // Everything matching has been sent recently: start the rotation again rather
  // than going silent. Someone still looking would rather see the board again
  // than hear nothing.
  const recycled = fresh.length === 0
  const pool = recycled ? result.ranked : fresh

  return {
    plan: {
      row,
      mode: result.mode,
      jobs: pool.slice(0, ROLES_PER_EMAIL),
      totalMatches: result.ranked.length,
      areaNames: describePreferredAreas(row.preferred_areas),
      recycled,
    },
    reason: null,
  }
}

/**
 * Collapse plans that would mail the same address twice in one run.
 *
 * Defensive hygiene, not a fix for any known bug: profile rows are already
 * UNIQUE on user_id, so one account cannot produce two plans. This guards the
 * case where two accounts share an address — nobody should receive the same
 * roundup twice on the same morning because of how our data happens to be
 * shaped.
 *
 * NOTE it does NOT catch one person holding two accounts under two DIFFERENT
 * addresses: each mailbox gets one email, which is the correct behaviour for a
 * mailbox even when it's the wrong outcome for a human. Recognising a person
 * across different addresses is identity resolution and a product decision.
 *
 * When two plans do collide, keep the one with more matches — the better email
 * of the two — with user_id as a deterministic tiebreak.
 */
export function dedupeByEmail(plans: RoundupPlan[]): { kept: RoundupPlan[]; collapsed: number } {
  const best = new Map<string, RoundupPlan>()
  for (const plan of plans) {
    const key = (plan.row.email || '').trim().toLowerCase()
    if (!key) continue
    const existing = best.get(key)
    if (
      !existing ||
      plan.totalMatches > existing.totalMatches ||
      (plan.totalMatches === existing.totalMatches && plan.row.user_id < existing.row.user_id)
    ) {
      best.set(key, plan)
    }
  }
  const kept = Array.from(best.values())
  return { kept, collapsed: plans.length - kept.length }
}

export { formatSalary }
