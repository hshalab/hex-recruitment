import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// Repairs a drifted SSR auth cookie from a still-valid client session.
//
// THE PROBLEM
// The browser client keeps its session in localStorage and refreshes it
// indefinitely. The SSR cookie is only written at login. Over time the cookie
// dies (expired access_token, spent refresh_token) while localStorage stays
// perfectly valid. The server guard in app/employer/layout.tsx then sees no
// user and redirects to /login/employer — and the login page, reading the good
// localStorage session, pushes straight back to the dashboard. Neither side
// reconsiders, so it loops. Measured at 350-465 navigations before settling.
//
// THE REPAIR
// When a login page finds a valid client session, POST it to the EXISTING
// /api/auth/set-session bridge before navigating. That route already validates
// the tokens with Supabase and writes the chunked cookies, and is the same
// route the password flow uses — this is deliberately not a parallel bridge.
// Once it returns 200 the server agrees with the client and the loop cannot
// start.
//
// Unlike middleware.ts, which only PREVENTS future drift, this REPAIRS a user
// who has already drifted — which is everyone currently affected.

/** How recently a repair must have run to count as "we are in a loop". */
const LOOP_WINDOW_MS = 10_000
const ATTEMPT_KEY = 'thrive_cookie_repair_at'

/**
 * True if a repair was attempted moments ago — i.e. we bridged, navigated, and
 * have been bounced straight back here. That means the repair did not take, and
 * retrying would spin. A legitimate later visit to a login page is minutes
 * apart, so it falls outside the window and is unaffected.
 */
export function repairJustAttempted(): boolean {
  try {
    const last = Number(sessionStorage.getItem(ATTEMPT_KEY) || 0)
    return last > 0 && Date.now() - last < LOOP_WINDOW_MS
  } catch {
    return false
  }
}

function markAttempt(): void {
  try { sessionStorage.setItem(ATTEMPT_KEY, String(Date.now())) } catch { /* ignore */ }
}

export function clearRepairMark(): void {
  try { sessionStorage.removeItem(ATTEMPT_KEY) } catch { /* ignore */ }
}

/**
 * Bridge `session` into the SSR cookies. Returns true only on a 200 — any
 * failure (network, 401 from a token Supabase rejects, malformed body) returns
 * false so the caller can dead-end into a clean signed-out state rather than
 * navigating into the same redirect again.
 */
export async function repairSessionCookie(session: Session | null): Promise<boolean> {
  if (!session?.access_token || !session?.refresh_token) return false
  markAttempt()
  try {
    const res = await fetch('/api/auth/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * The safe dead-end. Clears the local client session so the two sides agree
 * that nobody is signed in, and the visitor simply sees the login form. Local
 * scope only — no network call, no refresh-token revocation — so this cannot
 * itself fail and cannot affect the user's other devices.
 */
export async function abandonBrokenSession(): Promise<void> {
  clearRepairMark()
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
}
