-- Dashboard-only candidate photo. Separate from profile_picture_url (which is
-- read on many EMPLOYER-facing surfaces) so the candidate's self-service
-- dashboard photo can NEVER appear employer-side. Nullable/additive; backfilled
-- from the existing photo so current dashboard avatars persist.
alter table public.candidate_profiles add column if not exists dashboard_photo_url text;

update public.candidate_profiles
set dashboard_photo_url = profile_picture_url
where dashboard_photo_url is null and profile_picture_url is not null;
