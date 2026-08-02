ALTER TABLE company_reviews
  ADD COLUMN IF NOT EXISTS employer_response text,
  ADD COLUMN IF NOT EXISTS employer_response_at timestamptz;
