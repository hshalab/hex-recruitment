-- Remove the unused bank-detail columns from candidate_profiles. They have zero
-- references in the app and zero rows populated. Thrive is a recruitment product,
-- not payroll/HR (CLAUDE.md), so these don't belong on the browseable profile;
-- if bank details are ever needed they should live in a separate, access-controlled
-- table never exposed to employers.
--
-- Applied to production 2026-07-08. Verified: all four columns removed.
alter table public.candidate_profiles
  drop column if exists bank_name,
  drop column if exists sort_code,
  drop column if exists account_number,
  drop column if exists account_holder_name;
