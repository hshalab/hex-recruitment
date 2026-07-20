-- Add views column to jobs table for tracking total candidate views
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;

-- Function to safely increment view count.
-- SECURITY DEFINER so candidates (who can't UPDATE jobs directly) can still
-- increment the counter without bypassing any other RLS protections.
CREATE OR REPLACE FUNCTION increment_job_views(p_job_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE jobs
  SET views = COALESCE(views, 0) + 1
  WHERE id = p_job_id;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION increment_job_views(UUID) TO authenticated;
