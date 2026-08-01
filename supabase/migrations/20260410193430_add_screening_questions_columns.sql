ALTER TABLE jobs ADD COLUMN IF NOT EXISTS screening_questions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS screening_answers JSONB DEFAULT '[]'::jsonb;
