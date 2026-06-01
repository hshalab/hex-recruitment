import { FOUNDING_PERIOD_MONTHS, FREE_FOUNDING_MODE } from '@/lib/constants/cohort'

export type EmployerSubscriptionRow = {
  subscription_status?: string | null
  subscription_tier?: string | null
  founding_period_ends_at?: string | null
  /**
   * Optional employer_profiles.approval_status carried via a JOIN. If the
   * gate caller didn't fetch it, the field is undefined and we treat it
   * as approved (back-compat with pre-pivot callers). The new gate sites
   * fetch it via `employer_profiles(approval_status)` relationship.
   */
  approval_status?: string | null
}

/**
 * Compute founding_period_ends_at = startedAt + FOUNDING_PERIOD_MONTHS.
 * Used at signup to stamp the entitlement window. setMonth handles
 * variable-length months (Feb 29 → Feb 28 next year, etc.) correctly.
 */
export function calculateFoundingPeriodEnd(startedAt: Date = new Date()): Date {
  const end = new Date(startedAt)
  end.setMonth(end.getMonth() + FOUNDING_PERIOD_MONTHS)
  return end
}

/**
 * True if this row is an in-window founding-cohort member. Used by the
 * post-job / messages / candidates gates to short-circuit the Stripe
 * subscription check while FREE_FOUNDING_MODE is on.
 *
 * Independent of subscription_status by design — founding-cohort rows
 * stay at status='inactive' because no Stripe subscription was created
 * for them.
 */
export function isFoundingEntitled(sub: EmployerSubscriptionRow | null | undefined): boolean {
  if (!FREE_FOUNDING_MODE) return false
  if (!sub) return false
  if (sub.subscription_tier !== 'free') return false
  if (!sub.founding_period_ends_at) return false
  if (new Date(sub.founding_period_ends_at).getTime() <= Date.now()) return false
  // approval_status MUST be present on the row. Earlier code treated
  // `undefined` (caller didn't include it in the SELECT) as approved —
  // that let pending freemail users silently pass the gate on
  // /post-job, /messages, /candidates. Fail closed on undefined so a
  // missed SELECT can never masquerade as approved again. In dev we
  // throw so the omission is loud during local development.
  //
  // Explicit NULL is preserved as legacy pre-pivot back-compat (9 rows
  // in prod at the time of writing, all subscription_tier='standard'
  // so they pass via the active/trialing branch in isEmployerEntitled,
  // not this one — but the NULL handling stays for any future row that
  // genuinely sits on the legacy path).
  const status = sub.approval_status
  if (status === undefined) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('[isFoundingEntitled] approval_status missing from sub row — caller must SELECT employer_profiles.approval_status and pass it in. Fail-closed in prod.')
    }
    return false
  }
  if (status === null) return true
  if (status === 'approved') return true
  return false
}

/**
 * Combined gate decision: classic paying-employer entitlement OR
 * in-window founding-cohort entitlement. Use this everywhere the
 * subscription gate used to live.
 */
export function isEmployerEntitled(sub: EmployerSubscriptionRow | null | undefined): boolean {
  if (!sub) return false
  const status = sub.subscription_status
  if (status === 'active' || status === 'trialing') return true
  return isFoundingEntitled(sub)
}
