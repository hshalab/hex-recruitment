ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS employer_signature_image_url TEXT,
  ADD COLUMN IF NOT EXISTS employer_signature_name TEXT,
  ADD COLUMN IF NOT EXISTS employer_signature_timestamp TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS employer_signature_ip TEXT,
  ADD COLUMN IF NOT EXISTS employer_signature_user_agent TEXT;

COMMENT ON COLUMN public.job_offers.employer_signature_image_url IS 'Path to the employer signature PNG in the profiles bucket. Captured when the employer signs the offer before sending.';
