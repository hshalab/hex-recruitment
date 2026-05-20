/**
 * Single source of truth for the free-launch employer cohort cap.
 *
 * "First N employers on Thrive get 3 months free."
 *
 * Until this constant existed, the cap drifted: the gate at
 * /api/check-spots used 600 while the /waitlist page UI and the admin
 * waitlist endpoint were stuck at an earlier 100. The cap leaked into
 * marketing copy as a literal in many surfaces (homepage hero, login
 * page, subscription page, waitlist email…). Centralise it here so
 * raising or lowering the cohort is a one-line change.
 *
 * If the number changes, every consumer rebuilds and renders the new
 * value automatically — no hunting through grep for stale literals.
 */
export const EMPLOYER_COHORT_CAP = 600
