-- Phase 2 "sell yourself" candidate fields. All NULLABLE, additive — existing
-- candidate_profiles rows are unaffected and read surfaces render fine when
-- these are null. headline = one short candidate-written line; specialties =
-- free-form strength tags (sector-agnostic); notable_venues = highlight
-- employers/venues; certifications + interests back the existing (until now
-- dead) detail-modal sections that lib/types already mapped.
ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS specialties text[],
  ADD COLUMN IF NOT EXISTS notable_venues text[],
  ADD COLUMN IF NOT EXISTS certifications text[],
  ADD COLUMN IF NOT EXISTS interests text[];
