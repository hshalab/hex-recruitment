-- Server-side gate: pending/rejected/waitlisted employers must not be
-- able to create jobs, conversations, or messages. Client-side gates
-- in app/post-job, app/messages, app/candidates can be bypassed by
-- direct REST or by an attacker who hand-rolls a Supabase client; RLS
-- is the only enforcement point that holds.
--
-- Pre-pivot legacy employers have approval_status IS NULL — they pass
-- (back-compat). The gate only rejects rows where the user has an
-- employer_profiles row AND approval_status is one of the locked-out
-- states. Candidates have no employer_profiles row at all, so the
-- NOT-pending-employer check is implicit no-op for them.
--
-- Companion to:
--   lib/foundingEntitlement.ts   (client helper fail-closed on undefined)
--   app/post-job/page.tsx         (client gate now fetches approval_status)
--   app/messages/page.tsx
--   app/candidates/page.tsx
--
-- Pairs with audit AUDIT_2026-06-01: DEFECT-1.

-- ---------------------------------------------------------------
-- Reusable: is the calling user blocked by approval status?
-- SECURITY DEFINER so it can read employer_profiles regardless of the
-- caller's row-visibility. STABLE so the planner can fold it.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_employer_blocked_by_approval()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employer_profiles
    WHERE user_id = auth.uid()
      AND approval_status IN ('pending', 'rejected', 'waitlisted')
  );
$$;

COMMENT ON FUNCTION public.is_employer_blocked_by_approval() IS
  'True if the calling user has an employer_profiles row whose approval_status is pending/rejected/waitlisted. Used in INSERT WITH CHECK clauses on jobs/messages/conversations to enforce the founding-cohort approval gate server-side. NULL and approved both return false (allowed).';

GRANT EXECUTE ON FUNCTION public.is_employer_blocked_by_approval() TO authenticated, anon;

-- ---------------------------------------------------------------
-- jobs: replace the insert policy so pending employers cannot post
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Employers insert own jobs" ON public.jobs;
CREATE POLICY "Employers insert own jobs"
  ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = employer_id
    AND NOT public.is_employer_blocked_by_approval()
  );

-- ---------------------------------------------------------------
-- conversations: pending employers cannot start new threads either
-- (otherwise they could create a conversation row and then try to
-- send into it). Candidates have no employer_profiles row, so the
-- block clause is a no-op for them.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations"
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (participant_1 = auth.uid() OR participant_2 = auth.uid())
    AND NOT public.is_employer_blocked_by_approval()
  );

-- ---------------------------------------------------------------
-- messages: pending employers cannot send messages, even into a
-- conversation that already exists. Same candidate no-op as above.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1 = auth.uid() OR participant_2 = auth.uid()
    )
    AND NOT public.is_employer_blocked_by_approval()
  );
