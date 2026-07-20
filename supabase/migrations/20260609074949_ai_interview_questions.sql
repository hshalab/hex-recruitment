-- Phase 2 — AI interview question generation.
--
-- DEPLOY NOTE: this is a DB MIGRATION (new table + new column) — the deploy is
-- NOT code-only. Rollback requires dropping the table and the column in
-- addition to reverting the application code.

-- ── Daily-per-employer usage counter ─────────────────────────────────────────
-- One row per (employer, day, feature). A new UTC day = a new row, so there's
-- no reset job to run. Used to enforce 10 successful generations/day/employer.
CREATE TABLE IF NOT EXISTS public.ai_generation_usage (
  employer_id uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date  date    NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  feature     text    NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (employer_id, usage_date, feature)
);

ALTER TABLE public.ai_generation_usage ENABLE ROW LEVEL SECURITY;

-- Owner-only: an employer may only see/write their own usage rows. The API
-- increments via the service-role client behind an explicit ownership check, so
-- these policies are defence-in-depth + they guard any direct client access.
DROP POLICY IF EXISTS ai_generation_usage_select_owner ON public.ai_generation_usage;
CREATE POLICY ai_generation_usage_select_owner
  ON public.ai_generation_usage FOR SELECT
  USING (employer_id = auth.uid());

DROP POLICY IF EXISTS ai_generation_usage_insert_owner ON public.ai_generation_usage;
CREATE POLICY ai_generation_usage_insert_owner
  ON public.ai_generation_usage FOR INSERT
  WITH CHECK (employer_id = auth.uid());

DROP POLICY IF EXISTS ai_generation_usage_update_owner ON public.ai_generation_usage;
CREATE POLICY ai_generation_usage_update_owner
  ON public.ai_generation_usage FOR UPDATE
  USING (employer_id = auth.uid())
  WITH CHECK (employer_id = auth.uid());

COMMENT ON TABLE public.ai_generation_usage IS
  'Per-employer per-UTC-day counter for AI generations (e.g. interview questions). Owner-only RLS.';

-- ── Capability flag ──────────────────────────────────────────────────────────
-- Gates the AI question feature per employer. DEFAULT-ON for everyone during the
-- current free period; can later be flipped per employer (or have its default
-- changed) to restrict the feature to paid tiers WITHOUT a code change.
-- employer_profiles is the established per-employer prefs table, so a scalar
-- boolean column matches the existing convention.
ALTER TABLE public.employer_profiles
  ADD COLUMN IF NOT EXISTS ai_questions_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.employer_profiles.ai_questions_enabled IS
  'Per-employer capability flag for the AI interview-question generator. Default true (free period); flip false to restrict.';
