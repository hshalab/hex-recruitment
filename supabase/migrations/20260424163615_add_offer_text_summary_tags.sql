ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS offer_letter_text TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_tags TEXT[];

COMMENT ON COLUMN public.job_offers.offer_letter_text IS 'Plain-text source of the offer letter (AI-generated or manual). Retained for search and re-summarisation without re-parsing the PDF.';
COMMENT ON COLUMN public.job_offers.ai_summary IS 'One-line AI summary of key terms (salary, probation, notice, notable clauses). Populated on send.';
COMMENT ON COLUMN public.job_offers.ai_tags IS 'AI-detected tags for filtering (e.g. "has-nda", "6mo-probation", "noncompete"). Populated on send.';

CREATE INDEX IF NOT EXISTS job_offers_ai_tags_gin ON public.job_offers USING GIN (ai_tags);
