-- Phase 1: stage_entered_at on job_applications + pipeline_sort_order on employer_profiles.
--
-- stage_entered_at: when the application entered its CURRENT status. Used
-- by the pipeline page to compute live "N days in [Stage]" badges and as
-- the ORDER BY anchor for the new "oldest in stage" sort. Backfilled from
-- the cascade log when available, falling back to status_updated_at (the
-- field the page is currently using as a stage-anchor proxy), then
-- created_at as a last resort.
--
-- pipeline_sort_order: per-employer pipeline view preference, persisted
-- on employer_profiles to mirror the existing notification_preferences /
-- privacy_settings shape.

-- 1. Add stage_entered_at with a temporary default so the column is
--    populated on existing rows; backfill overwrites it next.
ALTER TABLE public.job_applications
  ADD COLUMN stage_entered_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Backfill from the cascade log when the application's CURRENT status
--    has a logged transition row; fall back through status_updated_at
--    (already populated on ~64% of rows pre-migration) then created_at.
UPDATE public.job_applications ja
SET stage_entered_at = COALESCE(
  (SELECT MAX(pcl.created_at)
   FROM public.pipeline_cascade_log pcl
   WHERE pcl.application_id = ja.id
     AND pcl.to_status = ja.status),
  ja.status_updated_at,
  ja.created_at,
  NOW()
);

-- 3. Lock it down: NOT NULL, default NOW() going forward.
ALTER TABLE public.job_applications
  ALTER COLUMN stage_entered_at SET NOT NULL;

-- 4. pipeline_sort_order on employer_profiles.
ALTER TABLE public.employer_profiles
  ADD COLUMN pipeline_sort_order TEXT NOT NULL DEFAULT 'oldest_in_stage'
  CHECK (pipeline_sort_order IN ('oldest_in_stage','newest_first'));

-- Index supports the new ORDER BY stage_entered_at ASC path the pipeline
-- card query uses when the preference is 'oldest_in_stage'.
CREATE INDEX IF NOT EXISTS job_applications_stage_entered_at_idx
  ON public.job_applications (stage_entered_at);
