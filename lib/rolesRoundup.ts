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
import { isCredibleAnnualAsk } from './salaryInput'

/** Roles per email. Eight stays scannable on a phone and reads curated. */
export const ROLES_PER_EMAIL = 8

/** How many recently-sent job ids to remember, so consecutive weeks differ.
 *  Three weeks' worth: enough to rotate, small enough to keep in one column. */
export const ROUNDUP_MEMORY = ROLES_PER_EMAIL * 3

/** Fixed weekly cadence — this product is a weekly roundup by definition, so
 *  it does NOT read the per-candidate daily/weekly frequency the digest uses. */
export const CADENCE_DAYS = 7

/**
 * How far short of seven days still counts as due.
 *
 * A weekly schedule must never silently skip a week because the previous send
 * drifted by a few hours, and a manual send drifts by a lot. This was half a
 * day, which is enough for a cron running slightly early but NOT enough for a
 * human pressing send in the afternoon: a send at 20:01 on a Tuesday leaves
 * 6.49 days before the next Tuesday 08:00 slot, isDue returns false for
 * everybody, and the run goes green having mailed nobody.
 *
 * A full day covers the entire weekday. Even a send at 23:59 leaves 6.33 days,
 * which clears. The cost is that nothing can now go out closer than six days
 * apart rather than six and a half — reachable only by deliberately sending
 * off-cycle, and one email six days after the last is not a harm.
 *
 * The alternative was "hasn't been sent this ISO week", which reads more like
 * what a weekly email means but has a worse worst case: a manual send on a
 * Sunday would still let Tuesday fire two days later. A tolerance cannot
 * produce a surprise send; a calendar rule can.
 */
export const CADENCE_SLACK_DAYS = 1

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
  /** Bottom of their stated range, and its unit. Optional: most haven't set one. */
  salary_min?: number | null
  salary_period?: string | null
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
  return (now.getTime() - last) / DAY_MS >= CADENCE_DAYS - CADENCE_SLACK_DAYS
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

/**
 * Words that describe HOW SENIOR a role is, not WHAT THE JOB IS.
 *
 * "Executive Head Housekeeper" ranked first for two executive chefs, purely on
 * the words "executive" and "head". A pay penalty barely touched it — it is
 * only 14–20% under ask — and it is a worse email than any salary mismatch,
 * because it tells the candidate we don't know what they do.
 *
 * These words still count towards the SCORE once a role qualifies; a Head Chef
 * matching "Head Chef" should rank above one matching only "Chef". They just
 * cannot qualify a role on their own. See qualifies().
 */
const SENIORITY_WORDS = new Set([
  'head', 'senior', 'junior', 'executive', 'assistant', 'deputy',
  'lead', 'principal', 'chief', 'trainee', 'general', 'group',
])

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

/**
 * Does this job match on anything more than seniority?
 *
 * The overlap has to contain at least one word that says what the job IS.
 * "Head Chef" against "Head Chef" overlaps on {head, chef} and qualifies on
 * 'chef'. "Group/Executive chef" against "Executive Head Housekeeper" overlaps
 * only on {executive}, and does not.
 */
function qualifies(overlap: string[]): boolean {
  return overlap.some(t => !SENIORITY_WORDS.has(t))
}

/** How well a job's title matches what this candidate says they do. */
export function titleScore(
  candidateTokens: string[],
  job: DigestJobRow,
  idf: Map<string, number>
): number {
  if (candidateTokens.length === 0) return 0
  const jobTokens = tokenize(job.title)
  const overlap = candidateTokens.filter(t => jobTokens.includes(t))
  if (!qualifies(overlap)) return 0
  let score = 0
  for (const t of overlap) score += idf.get(t) ?? Math.log(2)
  return score
}

// ── Pay ──────────────────────────────────────────────────────────────
//
// A stated expectation is aspirational, not a floor: people ask for more than
// they will take, so a role a little under does no harm and a role a lot under
// does. That makes this a soft penalty, never a filter — nothing is excluded
// and nobody's recommendations can be emptied.

/** Assumed full-time week when converting between hourly and annual. */
export const ASSUMED_WEEKLY_HOURS = 45
/** Within this of the ask, pay is not held against a role at all. */
export const SALARY_TOLERANCE = 0.10
/** Ceiling, so pay can reorder a list but never outweigh being the right job. */
export const MAX_SALARY_PENALTY = 1.5
/**
 * Agency hours are not salaried money: no guaranteed hours, no paid holiday, no
 * sick pay. Annualising the headline rate flatters it, so it is discounted
 * before comparison rather than allowed to outrank a permanent role.
 */
export const AGENCY_HAIRCUT = 0.85

/** What the ROLE pays, as an annual figure. salary_max is the package in both
 *  sources: Goldenkeys stores base+service charge in both columns, Host stores
 *  base in min and the package in max. */
export function annualPayOf(job: DigestJobRow): number | null {
  const top = Number(job.salary_max ?? job.salary_min)
  if (!Number.isFinite(top) || top <= 0) return null
  if (job.salary_type === 'hourly') return top * ASSUMED_WEEKLY_HOURS * 52 * AGENCY_HAIRCUT
  return top
}

/** What the CANDIDATE asked for, read from the BOTTOM of their range — the
 *  least they said they'd take, which already allows for aspiration. */
export function annualAskOf(row: RoundupCandidateRow): number | null {
  const v = Number(row.salary_min)
  if (!Number.isFinite(v) || v <= 0) return null
  if (row.salary_period === 'hour') {
    return isCredibleAnnualAsk(v, 'hour') ? v * ASSUMED_WEEKLY_HOURS * 52 : null
  }
  return isCredibleAnnualAsk(v, 'year') ? v : null
}

/**
 * Things a chef will trade money for. Derived at read time from what we already
 * store rather than modelled as a field: live-in is expressible today on ~70
 * roles from benefits and title, and until that earns its place a heuristic
 * that only ever SOFTENS a penalty is the honest version — it can misjudge a
 * role's ranking, never hide it.
 */
// \b, not \y. Postgres spells a word boundary \y and JavaScript spells it \b;
// \y in a JS regex is an identity escape matching a literal "y", so the
// live-in clause silently required the word to be preceded by one. It matched
// nothing, and the only reason the softener appeared to work at all was
// "accommodation" and "no late" catching some of the same roles.
const COMPENSATING = /\blive[ -]?in\b|accommodation|no late|early finish|day-?time|mon(day)?[ -]*(to|–|-|—)[ -]*fri(day)?/i

export function hasCompensatingBenefit(job: DigestJobRow & { benefits?: string[] | null }): boolean {
  const text = [job.title || '', ...(job.benefits || [])].join(' ')
  return COMPENSATING.test(text)
}

/**
 * How far to push a role down for paying under what they asked. Zero for most
 * roles and every candidate who hasn't stated a salary.
 */
export function salaryPenalty(
  ask: number | null,
  job: DigestJobRow & { benefits?: string[] | null }
): number {
  if (ask === null) return 0
  const pay = annualPayOf(job)
  if (pay === null) return 0
  const shortfall = (ask - pay) / ask
  if (shortfall <= SALARY_TOLERANCE) return 0
  const raw = Math.min(MAX_SALARY_PENALTY, (shortfall - SALARY_TOLERANCE) * 4)
  // Cheap-with-a-roof is a trade, not a bad match.
  return hasCompensatingBenefit(job) ? raw / 2 : raw
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
  jobs: (DigestJobRow & { category?: string | null; benefits?: string[] | null })[],
  idf: Map<string, number>
): { mode: MatchMode; ranked: DigestJobRow[] } | null {
  const mode = matchModeFor(row)
  if (!mode) return null

  const tokens = tokenize(row.job_title)
  const prefs = parsePreferredAreas(row.preferred_areas)
  const ask = annualAskOf(row)

  const scored = jobs
    .map(j => ({ job: j, score: titleScore(tokens, j, idf) + sectorBonus(row, j) }))
    // QUALIFYING happens on `score` alone.
    .filter(({ job, score }) =>
      mode === 'area'
        ? jobMatchesPreferredAreas({ areaRegion: job.area_region, areaCounty: job.area_county }, prefs)
        : score > 0
    )
    // ORDERING happens on `rank`, which is score minus the pay penalty.
    //
    // The split is the whole point and must not be collapsed. Profile mode
    // filters on score > 0; fold the penalty into `score` and a pay gap can
    // drive a positive title match to zero and silently DELETE the role —
    // turning a soft penalty into a hard salary filter, which is exactly what
    // was rejected. Subtracting only after the filter means pay can move a
    // role down the list and never off it.
    .map(s => ({ ...s, rank: s.score - salaryPenalty(ask, s.job) }))
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank
      return new Date(b.job.created_at || 0).getTime() - new Date(a.job.created_at || 0).getTime()
    })

  return { mode, ranked: scored.map(s => s.job) }
}

export function planFor(
  row: RoundupCandidateRow,
  jobs: (DigestJobRow & { category?: string | null; benefits?: string[] | null })[],
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
