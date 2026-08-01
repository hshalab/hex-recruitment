ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS venue text;
COMMENT ON COLUMN public.jobs.venue IS 'Optional property/site name for multi-venue operators (e.g. "The Ember", "Ember Soho"). Null for single-site operators or multi-site roles.';
