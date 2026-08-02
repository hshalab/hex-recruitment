ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS signature_image_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_ip TEXT,
  ADD COLUMN IF NOT EXISTS signature_user_agent TEXT;

COMMENT ON COLUMN public.job_offers.signature_image_url IS 'Path to the candidate signature PNG in the profiles storage bucket. Forms part of the audit trail.';
COMMENT ON COLUMN public.job_offers.signature_ip IS 'IP address the signature was submitted from (audit trail).';
COMMENT ON COLUMN public.job_offers.signature_user_agent IS 'User-agent the signature was submitted from (audit trail).';
