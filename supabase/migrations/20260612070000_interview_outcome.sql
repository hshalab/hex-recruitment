-- Past-interview lifecycle: record how a passed interview was resolved.
--
-- DEPLOY NOTE: this is a DB MIGRATION (new column) — the deploy is NOT code-only.
--
-- `outcome` is the employer's resolution of an interview whose time has passed:
--   NULL        — unresolved (the employer hasn't said what happened yet)
--   'completed' — the interview took place
--   'no_show'   — the candidate didn't attend
-- It is deliberately SEPARATE from `status` (the lifecycle: scheduled/confirmed/
-- cancelled/…). v1 records the outcome only — it does NOT auto-advance or reject
-- the candidate in the pipeline (a later, separate follow-up). Whether an
-- interview is "past" is derived from start time + duration_minutes, not from
-- this column, so a NULL outcome on a passed interview = "needs resolving".
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.interviews
  DROP CONSTRAINT IF EXISTS interviews_outcome_check;
ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('completed', 'no_show'));

COMMENT ON COLUMN public.interviews.outcome IS
  'Employer resolution of a passed interview: completed | no_show | NULL (unresolved). Separate from status; records outcome only (no pipeline side-effects in v1).';

-- RLS: no new policy needed. The existing "Employers can update their own
-- interviews" policy (USING/WITH CHECK auth.uid() = employer_id) is row-level,
-- so an owner can update this new column on their own rows; non-owners cannot.
