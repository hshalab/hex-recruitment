// Client-side session bookkeeping for nudges.
//
// lib/nudges.ts asks for `sessionCount` and `shownThisSession` but nothing ever
// produced them — that was the missing half of "infrastructure only". This is
// that half, and nothing more.
//
// A "session" is one browser tab-session: sessionStorage clears when the tab
// closes, so returning tomorrow counts as a new one. The COUNT lives in
// localStorage so it survives across sessions; a sessionStorage flag makes sure
// we only increment it once per session rather than on every dashboard render.
//
// Deliberately client-side: the server-side floor (MIN_MINUTES_BETWEEN_NUDGES,
// enforced through nudge_state.lastNudgeAt) is what actually stops a new tab
// being used to farm nudges. This just handles the ordinary case cheaply.

const SESSION_FLAG = 'thrive_nudge_session'
const SESSION_COUNT = 'thrive_session_count'
const SHOWN_FLAG = 'thrive_nudge_shown'

function safeGet(store: Storage | undefined, key: string): string | null {
  try { return store?.getItem(key) ?? null } catch { return null }
}
function safeSet(store: Storage | undefined, key: string, value: string): void {
  try { store?.setItem(key, value) } catch { /* private mode — degrade quietly */ }
}

/**
 * Count this session if we haven't already, and return the running total.
 * Returns 0 when storage is unavailable, which reads as "first session" and so
 * shows no nudge — the conservative direction.
 */
export function registerSession(): number {
  if (typeof window === 'undefined') return 0
  const already = safeGet(window.sessionStorage, SESSION_FLAG)
  const stored = Number(safeGet(window.localStorage, SESSION_COUNT) || '0')
  const current = Number.isFinite(stored) && stored > 0 ? stored : 0

  if (already) return current

  const next = current + 1
  safeSet(window.sessionStorage, SESSION_FLAG, '1')
  safeSet(window.localStorage, SESSION_COUNT, String(next))
  return next
}

export function hasShownThisSession(): boolean {
  if (typeof window === 'undefined') return true // never nudge during SSR
  return safeGet(window.sessionStorage, SHOWN_FLAG) === '1'
}

export function markShownThisSession(): void {
  if (typeof window === 'undefined') return
  safeSet(window.sessionStorage, SHOWN_FLAG, '1')
}
