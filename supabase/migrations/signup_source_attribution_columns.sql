-- Signup source attribution (from today forward only; existing rows stay null).
-- signup_ref: raw ?ref tag (e.g. fb-chefsuk) — keep granular so we know WHICH group.
-- utm_*: standard campaign params. heard_from: self-reported dropdown answer.
-- signup_source: normalized channel for clean reporting (ref/utm > heard_from > unknown).
alter table public.candidate_profiles
  add column if not exists signup_ref    text,
  add column if not exists utm_source    text,
  add column if not exists utm_medium    text,
  add column if not exists utm_campaign  text,
  add column if not exists heard_from    text,
  add column if not exists signup_source text;

alter table public.employer_profiles
  add column if not exists signup_ref    text,
  add column if not exists utm_source    text,
  add column if not exists utm_medium    text,
  add column if not exists utm_campaign  text,
  add column if not exists heard_from    text,
  add column if not exists signup_source text;
