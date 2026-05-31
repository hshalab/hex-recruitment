import { FOUNDING_PERIOD_MONTHS, FREE_FOUNDING_MODE } from '@/lib/constants/cohort'

export type EmployerSubscriptionRow = {
  subscription_status?: string | null
  subscription_tier?: string | null
  founding_period_ends_at?: string | null
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
  return new Date(sub.founding_period_ends_at).getTime() > Date.now()
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
