-- Add block_group_id to support multi-day block-out ranges.
-- A range = N rows in employer_availability_overrides sharing a single
-- block_group_id, one row per date. A solo single-day block = NULL,
-- which is never grouped with anything in the UI.
ALTER TABLE public.employer_availability_overrides
  ADD COLUMN IF NOT EXISTS block_group_id uuid;

-- Partial index — most rows will be NULL (single-day blocks) so the
-- index is small and only useful for the "delete by group" lookup.
CREATE INDEX IF NOT EXISTS idx_employer_availability_overrides_block_group
  ON public.employer_availability_overrides(block_group_id)
  WHERE block_group_id IS NOT NULL;
