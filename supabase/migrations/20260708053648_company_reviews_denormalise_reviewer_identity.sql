-- Denormalise the reviewer's display identity onto the review so the PUBLIC
-- company-reviews page can show who wrote it without reading candidate_profiles
-- (now locked to approved employers + own row). Set at write time from the
-- reviewer's own profile. Table was empty, so no backfill needed.
alter table public.company_reviews
  add column if not exists reviewer_name   text,
  add column if not exists reviewer_avatar text;
