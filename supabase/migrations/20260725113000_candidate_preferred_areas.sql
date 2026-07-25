-- Phase 2 (preferred areas): match candidates to jobs on canonical AREAS
-- (region + county) rather than coordinates/distance. Supersedes the coordinate
-- approach — no lat/lng/radius columns.
--
-- jobs get a resolved region (+ optional county), derived once from their text
-- location via lib/areas.ts (postcodes.io). NULL area_region = un-resolvable
-- (e.g. "Loch Ness") and such jobs are NEVER hidden by the filter.
-- candidate_profiles get preferred_areas: tokens like 'region:south-east' /
-- 'county:surrey'. Empty/absent = no area filter (feature is opt-in).

alter table public.jobs
  add column if not exists area_region text,
  add column if not exists area_county text;

alter table public.candidate_profiles
  add column if not exists preferred_areas text[];

comment on column public.jobs.area_region is
  'Canonical region id (e.g. south-east). NULL = un-resolvable; such jobs are never hidden by the area filter.';
comment on column public.jobs.area_county is
  'Canonical ceremonial-county id (e.g. surrey), nullable when only a region is known.';
comment on column public.candidate_profiles.preferred_areas is
  'Areas the candidate will work in, as tokens: region:<id> / county:<id>. Empty/NULL = no area filter (opt-in).';
