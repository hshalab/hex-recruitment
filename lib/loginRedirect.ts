import { safeInternalPath } from '@/lib/safeRedirect'

// Builds the login URL a signed-out visitor should be bounced to, carrying the
// page they were trying to reach as ?redirect= so login can return them there.
//
// Client-only: reads window.location. On the server (or if the current path is
// somehow not a safe internal path) it falls back to the bare login URL, which
// is exactly the pre-existing behaviour — the returnTo is an enhancement, never
// a requirement.
//
// The ?redirect= value is validated on the way OUT as well as on the way in.
// It's our own URL so it should always be safe, but the login page's rule is
// "same-origin relative paths only" and there's no reason for the two ends to
// disagree. See lib/safeRedirect.ts (shared, security-critical — do not fork).
function loginPathFor(loginRoute: string): string {
  if (typeof window === 'undefined') return loginRoute
  const current = safeInternalPath(`${window.location.pathname}${window.location.search}`)
  // Never bounce a login page back to itself — that produces a ?redirect= loop
  // and a confusing post-login landing.
  if (!current || current.startsWith('/login')) return loginRoute
  return `${loginRoute}?redirect=${encodeURIComponent(current)}`
}

/** /login/employer, carrying the current page as ?redirect= where possible. */
export function employerLoginPath(): string {
  return loginPathFor('/login/employer')
}

/** /login/employee, carrying the current page as ?redirect= where possible. */
export function employeeLoginPath(): string {
  return loginPathFor('/login/employee')
}

/**
 * The /login role chooser, carrying the current page as ?redirect=. For SHARED
 * routes (e.g. /messages) where we can't tell which role the signed-out visitor
 * is — the chooser forwards the value on to whichever card they pick.
 */
export function chooserLoginPath(): string {
  return loginPathFor('/login')
}
