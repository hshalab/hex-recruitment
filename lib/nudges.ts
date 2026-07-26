// Contextual onboarding nudges — state and rules.
//
// PHASE 2: infrastructure only. This module decides WHETHER a nudge may be
// shown and records what happened; nothing renders a nudge yet (that's Phase 3).
//
// One canonical shape, read and written through this one helper — the same
// discipline notification preferences needed after the flat-vs-nested repair.
// Nothing else should touch candidate_profiles.nudge_state directly.

export type NudgeKey =
  | 'areas'
  | 'cv'
  | 'jobTitle'
  | 'jobSector'
  | 'photo'
  | 'discoverable'
  | 'bio'
  | 'skills'

/** Canonical stored shape. Every field optional on read, always present on write. */
export interface NudgeState {
  /** fieldKey → ISO timestamp it was last shown. */
  shown: Partial<Record<NudgeKey, string>>
  /** fieldKey → how many times the candidate has dismissed it. */
  dismissed: Partial<Record<NudgeKey, number>>
  /** fieldKey → ISO timestamp the field was actually filled in. */
  completed: Partial<Record<NudgeKey, string>>
  /** ISO timestamp of the most recent nudge of any kind. Enforces one-per-session
   *  server-side, so a new tab can't reset it. */
  lastNudgeAt: string | null
}

export const EMPTY_NUDGE_STATE: NudgeState = {
  shown: {},
  dismissed: {},
  completed: {},
  lastNudgeAt: null,
}

// ── Rules ────────────────────────────────────────────────────────────
// Paul's three, plus the three I proposed and he accepted.

/** Never nudge during a candidate's first session — let them see the product
 *  before being asked for anything. */
export const MIN_SESSIONS_BEFORE_NUDGE = 2
/** At most one nudge per session. */
export const MAX_NUDGES_PER_SESSION = 1
/** After a dismissal, leave that field alone for a week. */
export const DISMISSED_COOLDOWN_DAYS = 7
/** Two dismissals means no. Stop asking for that field permanently. */
export const MAX_DISMISSALS = 2
/** Server-side floor between any two nudges, so a new tab can't bypass the
 *  per-session limit. Kept below the cooldown: this throttles, the cooldown
 *  bans. */
export const MIN_MINUTES_BETWEEN_NUDGES = 30

const DAY_MS = 86_400_000

/**
 * Normalise whatever is in the column into the canonical shape. Tolerant by
 * design: a malformed or absent value must degrade to "never nudged", never
 * throw and never block the page a nudge would have appeared on.
 */
export function parseNudgeState(raw: unknown): NudgeState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_NUDGE_STATE }
  const r = raw as Record<string, unknown>
  const obj = (v: unknown): Record<string, any> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {}
  const lastNudgeAt = typeof r.lastNudgeAt === 'string' ? r.lastNudgeAt : null
  return {
    shown: obj(r.shown),
    dismissed: obj(r.dismissed),
    completed: obj(r.completed),
    lastNudgeAt,
  }
}

export interface NudgeContext {
  /** How many sessions this candidate has had, including the current one. */
  sessionCount: number
  /** Has a nudge already been shown in THIS session? (sessionStorage-backed.) */
  shownThisSession: boolean
  /** Current time — injected so the rules are testable. */
  now?: Date
}

export interface NudgeDecision {
  allowed: boolean
  /** Why not, when allowed is false. Surfaced in logs, never to the candidate. */
  reason?:
    | 'first-session'
    | 'already-shown-this-session'
    | 'too-soon'
    | 'dismissed-too-often'
    | 'in-cooldown'
    | 'already-completed'
}

/**
 * May we show this particular nudge right now?
 * Deliberately conservative: every uncertain case resolves to "no". An
 * onboarding prompt is worth far less than the goodwill of not being nagged.
 */
export function canShowNudge(
  key: NudgeKey,
  state: NudgeState,
  ctx: NudgeContext
): NudgeDecision {
  const now = ctx.now ?? new Date()

  if (state.completed[key]) return { allowed: false, reason: 'already-completed' }
  if (ctx.sessionCount < MIN_SESSIONS_BEFORE_NUDGE) return { allowed: false, reason: 'first-session' }
  if (ctx.shownThisSession) return { allowed: false, reason: 'already-shown-this-session' }

  const dismissals = state.dismissed[key] ?? 0
  if (dismissals >= MAX_DISMISSALS) return { allowed: false, reason: 'dismissed-too-often' }

  // A dismissed field goes quiet for a week, timed from when it was last shown
  // (which is when the dismissal happened).
  if (dismissals > 0) {
    const lastShown = state.shown[key]
    if (lastShown) {
      const elapsed = now.getTime() - new Date(lastShown).getTime()
      if (elapsed < DISMISSED_COOLDOWN_DAYS * DAY_MS) return { allowed: false, reason: 'in-cooldown' }
    }
  }

  if (state.lastNudgeAt) {
    const sinceLast = now.getTime() - new Date(state.lastNudgeAt).getTime()
    if (sinceLast < MIN_MINUTES_BETWEEN_NUDGES * 60_000) return { allowed: false, reason: 'too-soon' }
  }

  return { allowed: true }
}

/**
 * Of the nudges a page could show, pick one — the least-recently-shown eligible
 * key, so prompts rotate instead of the same field resurfacing forever.
 */
export function pickNudge(
  candidates: NudgeKey[],
  state: NudgeState,
  ctx: NudgeContext
): NudgeKey | null {
  const eligible = candidates.filter(k => canShowNudge(k, state, ctx).allowed)
  if (eligible.length === 0) return null
  const neverShown = eligible.filter(k => !state.shown[k])
  if (neverShown.length > 0) return neverShown[0]
  return eligible.sort(
    (a, b) => new Date(state.shown[a]!).getTime() - new Date(state.shown[b]!).getTime()
  )[0]
}

// ── Transitions (pure — callers persist the result) ──────────────────

export function markShown(state: NudgeState, key: NudgeKey, now = new Date()): NudgeState {
  const iso = now.toISOString()
  return { ...state, shown: { ...state.shown, [key]: iso }, lastNudgeAt: iso }
}

export function markDismissed(state: NudgeState, key: NudgeKey, now = new Date()): NudgeState {
  return {
    ...state,
    dismissed: { ...state.dismissed, [key]: (state.dismissed[key] ?? 0) + 1 },
    // Re-stamp shown so the cooldown runs from the dismissal.
    shown: { ...state.shown, [key]: now.toISOString() },
  }
}

export function markCompleted(state: NudgeState, key: NudgeKey, now = new Date()): NudgeState {
  return { ...state, completed: { ...state.completed, [key]: now.toISOString() } }
}

/**
 * A skipped onboarding field isn't a dismissal — the candidate hasn't said no,
 * they've said "not now". Recorded as shown so it enters the normal rotation
 * rather than being asked again immediately.
 */
export function queueSkipped(state: NudgeState, keys: NudgeKey[], now = new Date()): NudgeState {
  const iso = now.toISOString()
  const shown = { ...state.shown }
  for (const k of keys) if (!shown[k]) shown[k] = iso
  return { ...state, shown }
}
