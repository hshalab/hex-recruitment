import { supabase } from '@/lib/supabase'

// Breaks the login <-> dashboard redirect loop, and nothing else.
//
// THE LOOP
// The session lives in two places that can disagree: the browser client's
// localStorage, and the SSR cookie. When the cookie has drifted (expired access
// token, spent refresh token) but localStorage is still valid:
//
//   1. server guard finds no valid cookie session -> redirect('/login/employer')
//   2. the login page finds a perfectly good client session -> push to dashboard
//   3. go to 1, forever
//
// Neither side ever reconsiders. Measured at 465-777 navigations before the page
// gave up, which is an unusable page rather than a slow one.
//
// WHAT THIS DOES
// One-shot bounce detection. The login page stamps a mark before it pushes to
// the dashboard. If it finds itself back on a login page within a few seconds,
// the push evidently didn't stick, so we stop instead of pushing again: clear
// the client session so both sides agree nobody is signed in, and show the
// login form with "Your session has expired."
//
// WHAT THIS DELIBERATELY DOES NOT DO
// It does not try to REPAIR the drifted cookie. An earlier version bridged the
// client session into the cookie here and then hard-navigated, which raced two
// separate cookie erasers and — because the hard navigation dropped the
// ?redirect= target — broke the legitimate "already signed in, honour the
// returnTo" journey. This is containment only. The real cure is removing the
// dual store; see the single-store work.

/** How recently a push must have happened to count as "we are in the loop". */
const BOUNCE_WINDOW_MS = 8_000
const MARK_KEY = 'thrive_login_bounce_at'

/**
 * True if this page pushed to a destination moments ago and we are somehow back
 * on a login page — i.e. the server rejected us and we are one lap into the
 * loop. A legitimate later visit to a login page is minutes apart and so falls
 * outside the window, leaving normal use unaffected.
 */
export function bouncedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(MARK_KEY) || 0)
    return last > 0 && Date.now() - last < BOUNCE_WINDOW_MS
  } catch {
    return false
  }
}

/** Stamp the mark immediately before navigating away to a protected page. */
export function markPush(): void {
  try { sessionStorage.setItem(MARK_KEY, String(Date.now())) } catch { /* ignore */ }
}

/** Clear the mark — called whenever we find the visitor genuinely signed out. */
export function clearBounceMark(): void {
  try { sessionStorage.removeItem(MARK_KEY) } catch { /* ignore */ }
}

/**
 * The safe dead-end. Drops the local client session so client and server agree
 * that nobody is signed in, and the visitor simply gets the login form. Local
 * scope only — no network call, no refresh-token revocation — so it cannot
 * itself fail and cannot affect the user's other devices.
 */
export async function endBounceLoop(): Promise<void> {
  clearBounceMark()
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
}
