-- Interview prep notes (Phase 1): one private, rich-text (sanitised HTML) note
-- per interview, owned by the employer. Candidates have NO access.
--
-- DEPLOY NOTE: this is a DB MIGRATION (new table) — the deploy is NOT code-only.
-- Rollback requires dropping this table (and its trigger/function) in addition
-- to reverting the application code.

-- One note per interview => interview_id is the primary key.
CREATE TABLE IF NOT EXISTS public.interview_notes (
  interview_id uuid PRIMARY KEY
    REFERENCES public.interviews(id) ON DELETE CASCADE,
  employer_id  uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  body         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Speeds up "all my notes" style lookups and the owner-id RLS checks.
CREATE INDEX IF NOT EXISTS interview_notes_employer_id_idx
  ON public.interview_notes (employer_id);

-- updated_at maintenance — mirrors the existing per-table trigger convention
-- (e.g. public.update_interviews_updated_at): a dedicated function that stamps
-- NEW.updated_at, with search_path pinned to public.
CREATE OR REPLACE FUNCTION public.update_interview_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interview_notes_set_updated_at ON public.interview_notes;
CREATE TRIGGER interview_notes_set_updated_at
  BEFORE UPDATE ON public.interview_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_interview_notes_updated_at();

-- ── Row Level Security: owner-only ───────────────────────────────────────────
-- Only the owning employer can see or write their note. There are deliberately
-- NO candidate policies, so a candidate (or anyone else) is denied by default.
ALTER TABLE public.interview_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: owner only.
DROP POLICY IF EXISTS interview_notes_select_owner ON public.interview_notes;
CREATE POLICY interview_notes_select_owner
  ON public.interview_notes
  FOR SELECT
  USING (employer_id = auth.uid());

-- INSERT: owner only, AND the referenced interview must belong to the same
-- employer (prevents attaching a note row to someone else's interview).
DROP POLICY IF EXISTS interview_notes_insert_owner ON public.interview_notes;
CREATE POLICY interview_notes_insert_owner
  ON public.interview_notes
  FOR INSERT
  WITH CHECK (
    employer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE i.id = interview_id AND i.employer_id = auth.uid()
    )
  );

-- UPDATE: owner only (both the existing row and the new row).
DROP POLICY IF EXISTS interview_notes_update_owner ON public.interview_notes;
CREATE POLICY interview_notes_update_owner
  ON public.interview_notes
  FOR UPDATE
  USING (employer_id = auth.uid())
  WITH CHECK (employer_id = auth.uid());

-- DELETE: owner only.
DROP POLICY IF EXISTS interview_notes_delete_owner ON public.interview_notes;
CREATE POLICY interview_notes_delete_owner
  ON public.interview_notes
  FOR DELETE
  USING (employer_id = auth.uid());

COMMENT ON TABLE public.interview_notes IS
  'Private, owner-only rich-text (sanitised HTML) prep notes — one per interview. Candidates have no RLS access.';
