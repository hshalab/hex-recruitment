-- Phase 2 (candidate travel-radius): geocoordinates + radius preference.
--
-- Adds NULLABLE lat/lng to jobs and candidate_profiles, and travel_radius_miles
-- on candidate_profiles. No backfill in this migration — coordinates are populated
-- separately by the geocode util (lib/geocode.ts) via a one-off backfill script and
-- on-post / on-profile-save hooks. Nullable so existing rows are valid immediately
-- and a job we can't geocode simply keeps NULL coords (it is never hidden on that
-- basis — see lib/recommendations.ts).

alter table public.jobs
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

alter table public.candidate_profiles
  add column if not exists latitude           double precision,
  add column if not exists longitude          double precision,
  add column if not exists travel_radius_miles integer;

comment on column public.candidate_profiles.travel_radius_miles is
  'Candidate max travel distance in miles for job recommendations. NULL = no limit.';
