/**
 * Detect whether an offer letter body is conditional — i.e. contains any
 * pre-employment carve-out (RTW, references, DBS, probation completion,
 * generic "subject to" or "conditional upon" language).
 *
 * Used at withdraw-time by the rescind/withdraw flow to choose between two
 * post-counter-sign modal flavours: "Rescind for stated reason" (with
 * dropdown — for offers that have a contractual escape hatch) vs
 * "Rescind binding offer" (type-to-confirm — for offers that don't).
 *
 * Bias direction: prefer false positives (offer detected as conditional
 * when it strictly isn't) over false negatives. Wrong-bucket false positive
 * just shows the easier modal; wrong-bucket false negative throws an
 * alarming warning at an action that didn't deserve it.
 *
 * Detection runs on-demand at withdraw-time, not at offer-creation, so
 * future regex improvements apply retroactively to existing offers without
 * a backfill.
 *
 * Falls back to FALSE (unconditional) when bodyText is absent — e.g.
 * legacy offers and employer-uploaded PDFs where we never persisted text.
 * Conservative default: those route to the strong-warning rescind path.
 */

const CONDITIONAL_PATTERNS: readonly RegExp[] = [
  /\bright to work\b/i,
  /\brtw\b/i,                              // word boundary so "growth" doesn't match
  /\bdbs\b/i,                              // covers DBS / enhanced DBS / DBS check / etc.
  /satisfactory references/i,
  /reference check/i,
  /pre[-\s]?employment\s+check/i,          // pre-employment / pre employment / preemployment
  /background check/i,
  /subject to satisfactory/i,              // generic conditional construction
  /this offer is conditional/i,            // explicit conditionality
  /conditional upon/i,                     // same
  /probationary period/i,                  // probation completion is also a contractual carve-out
]

export function isOfferConditional(bodyText: string | null | undefined): boolean {
  if (!bodyText) return false
  return CONDITIONAL_PATTERNS.some(p => p.test(bodyText))
}
