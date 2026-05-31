-- Helper function for the founding-cohort spot counter.
-- /api/check-spots calls this so the JOIN to auth.users (which lives in a
-- different schema, behind RLS, and isn't joinable via supabase-js
-- relationship hints) happens server-side in a single query rather than
-- N+1 round-trips.
--
-- A row counts if and only if:
--   - subscription_tier='free' (founding marker)
--   - the user's email is confirmed (auth.users.email_confirmed_at IS NOT NULL)
--   - approval_status is NULL or 'approved' (not pending/rejected/waitlisted)
--
-- Defined SECURITY DEFINER so the anon-key caller of /api/check-spots
-- can still execute it; the function only reads aggregated counts so it
-- leaks no per-user data.

CREATE OR REPLACE FUNCTION public.count_founding_spots_claimed()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COUNT(*)::int
  FROM public.employer_subscriptions s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.employer_profiles p ON p.user_id = s.user_id
  WHERE s.subscription_tier = 'free'
    AND u.email_confirmed_at IS NOT NULL
    AND (p.approval_status IS NULL OR p.approval_status = 'approved');
$$;

COMMENT ON FUNCTION public.count_founding_spots_claimed() IS
  'Count of confirmed + approved (or pre-pivot null-approval) founding-cohort rows. Used by /api/check-spots.';

GRANT EXECUTE ON FUNCTION public.count_founding_spots_claimed() TO anon, authenticated, service_role;
