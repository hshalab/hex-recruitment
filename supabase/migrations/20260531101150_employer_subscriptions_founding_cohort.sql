-- Free-founding-mode: add a 'free' tier and a founding_period_ends_at
-- column to employer_subscriptions so the launch-cohort entitlement is
-- captured independently of Stripe subscription state.
--
-- Context (see SUBSCRIPTION_FLOW_AUDIT_2026-05-31.md and the
-- free-founding-mode branch):
--   - The first 100 employers get 12 months free with no card.
--   - No Stripe subscription is created at signup, so subscription_status
--     stays 'inactive' for founding rows. Writing 'active'/'trialing'
--     against an absent Stripe sub was rejected as dishonest.
--   - The post-job / messages / candidates gates consult
--     isFoundingEntitled(sub) — tier='free' AND founding_period_ends_at
--     > NOW() — alongside the classic subscription_status check.
--   - If FREE_FOUNDING_MODE is later flipped off, founding rows still
--     carry both signals so the offboarding decision can be implemented
--     against captured data rather than a manual SQL audit.
--
-- The original CHECK constraint allowed only ('standard','professional').
-- Drop and re-add it with 'free' included.

ALTER TABLE public.employer_subscriptions
  DROP CONSTRAINT IF EXISTS employer_subscriptions_subscription_tier_check;

ALTER TABLE public.employer_subscriptions
  ADD CONSTRAINT employer_subscriptions_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'standard', 'professional'));

ALTER TABLE public.employer_subscriptions
  ADD COLUMN IF NOT EXISTS founding_period_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN public.employer_subscriptions.founding_period_ends_at IS
  'When the free-founding-mode entitlement expires for this employer. Set at signup to NOW() + FOUNDING_PERIOD_MONTHS (12). Independent of Stripe state — founding rows carry status=inactive because no Stripe subscription exists. See lib/foundingEntitlement.ts.';

CREATE INDEX IF NOT EXISTS idx_employer_subscriptions_founding
  ON public.employer_subscriptions (subscription_tier, founding_period_ends_at)
  WHERE subscription_tier = 'free';
