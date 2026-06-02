-- Follow-up to 20260601120000_employer_approval_gate_rls.
--
-- The first migration gated jobs / conversations / messages INSERT. A
-- pending/rejected/waitlisted employer could still bypass via direct
-- REST on five other employer-only mutations:
--   interviews          (INSERT, UPDATE)
--   interview_bookings  (INSERT, UPDATE — and a broader ALL policy)
--   job_offers          (INSERT, UPDATE)
--   boosts              (INSERT, UPDATE)
--   saved_candidates    (single ALL policy covering INSERT/UPDATE/DELETE)
--
-- Close them with one RESTRICTIVE policy per table that AND-restricts
-- the existing PERMISSIVE policies. Restrictive policies compose: a
-- mutation must satisfy ALL restrictive policies in addition to at
-- least one permissive policy. By targeting WITH CHECK (INSERT/UPDATE)
-- with `NOT is_employer_blocked_by_approval()` and leaving USING=true,
-- pending employers are blocked from writes while reads/deletes are
-- governed by the existing permissive policies (so pending users can
-- still read their own existing rows during the bounce-to-under-review
-- flow without breakage).
--
-- For candidates this is a no-op: they have no employer_profiles row,
-- so is_employer_blocked_by_approval() returns false, NOT false = true,
-- restrictive check passes.
--
-- Helper is_employer_blocked_by_approval() was introduced in
-- 20260601120000_employer_approval_gate_rls.sql and is reused here.

DROP POLICY IF EXISTS "approval_gate_blocks_writes" ON public.interviews;
CREATE POLICY "approval_gate_blocks_writes"
  ON public.interviews
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (NOT public.is_employer_blocked_by_approval());

DROP POLICY IF EXISTS "approval_gate_blocks_writes" ON public.interview_bookings;
CREATE POLICY "approval_gate_blocks_writes"
  ON public.interview_bookings
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (NOT public.is_employer_blocked_by_approval());

DROP POLICY IF EXISTS "approval_gate_blocks_writes" ON public.job_offers;
CREATE POLICY "approval_gate_blocks_writes"
  ON public.job_offers
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (NOT public.is_employer_blocked_by_approval());

DROP POLICY IF EXISTS "approval_gate_blocks_writes" ON public.boosts;
CREATE POLICY "approval_gate_blocks_writes"
  ON public.boosts
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (NOT public.is_employer_blocked_by_approval());

DROP POLICY IF EXISTS "approval_gate_blocks_writes" ON public.saved_candidates;
CREATE POLICY "approval_gate_blocks_writes"
  ON public.saved_candidates
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (NOT public.is_employer_blocked_by_approval());
