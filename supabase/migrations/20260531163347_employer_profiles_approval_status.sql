-- Founding-signup approval workflow: add an approval_status column to
-- employer_profiles so freemail / generic-provider signups can sit in a
-- "pending" state until Paul approves them. Business-domain signups
-- auto-land at 'approved' on email confirmation; disposable domains are
-- hard-rejected at the API layer and never get an auth.users row.
--
-- States:
--   pending     — confirmed-email freemail signup awaiting manual review.
--                 No employer_subscriptions row written yet; gate closed;
--                 spot NOT consumed (check-spots ignores them).
--   approved    — confirmed business-domain signup, OR freemail signup
--                 Paul has approved. Has employer_subscriptions(tier='free',
--                 founding_period_ends_at = NOW()+12mo); spot consumed.
--   rejected    — Paul rejected. No subscription row, no spot consumed.
--   waitlisted  — Paul approved BUT cohort was already full at approval
--                 time. No subscription row, no spot consumed; can be
--                 manually flipped to 'approved' if a spot opens later.
--
-- Existing employer_profiles rows are left at NULL approval_status —
-- pre-pivot accounts aren't founding-cohort members anyway (they have
-- tier='standard' if anything), so the gate ignores them via the absence
-- of a tier='free' employer_subscriptions row. Backfill not required.

ALTER TABLE public.employer_profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'waitlisted'));

COMMENT ON COLUMN public.employer_profiles.approval_status IS
  'Founding-signup approval state. NULL for pre-pivot rows. See lib/foundingEntitlement.ts and app/api/admin/approve-founding.';

CREATE INDEX IF NOT EXISTS idx_employer_profiles_approval_status
  ON public.employer_profiles (approval_status)
  WHERE approval_status IN ('pending', 'waitlisted');
