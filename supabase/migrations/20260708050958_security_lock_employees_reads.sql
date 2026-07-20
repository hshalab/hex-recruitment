-- SECURITY: employees is a legacy pre-pivot table (superseded by candidate_profiles;
-- read only as an own-row dashboard fallback). It had the same world-readable hole
-- as candidate_profiles: a "Public can view employee profiles" USING(true) SELECT
-- policy + anon SELECT grant. Drop the open policy and revoke anon so reads fall
-- back to the existing own-row policy ("Users can view own profile").
--
-- Applied to production 2026-07-08. Verified: anon read -> permission denied;
-- owner still reads own row (1).
drop policy if exists "Public can view employee profiles" on public.employees;
revoke select on public.employees from anon;
