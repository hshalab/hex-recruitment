-- Employer-discoverability flag. Default FALSE (privacy-safe): a candidate only
-- appears in proactive browse/search once they opt in. Backfill TRUE for
-- already browse-ready profiles (job title + a location + >=3 skills + a bio)
-- so the live candidate-browse page isn't emptied for complete profiles.
alter table public.candidate_profiles
  add column if not exists is_discoverable boolean not null default false;

update public.candidate_profiles
set is_discoverable = true
where is_discoverable = false
  and nullif(btrim(job_title), '') is not null
  and coalesce(nullif(btrim(location), ''), nullif(btrim(city), '')) is not null
  and coalesce(array_length(skills, 1), 0) >= 3
  and nullif(btrim(bio), '') is not null;
