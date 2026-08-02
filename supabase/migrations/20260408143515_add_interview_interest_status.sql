ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS interview_interest_status text
    CHECK (interview_interest_status IN ('pending', 'interested', 'not_interested'))
    DEFAULT NULL;
