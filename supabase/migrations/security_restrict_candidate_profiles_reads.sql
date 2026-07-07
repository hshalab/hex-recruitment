-- SECURITY: candidate_profiles was world-readable — an open "USING (true)" SELECT
-- policy for the public role plus a table-level anon SELECT grant let anyone with
-- the public anon key read every candidate's PII (name, email, phone, DOB, address,
-- CV, work history, and the unused bank-detail columns). Lock reads to the
-- candidate's own row and to authenticated APPROVED employers only.
--
-- Applied directly to production 2026-07-07 (live exposure). Verified before/after:
--   anon: 9 -> permission denied;  candidate: 9 -> 1 (own only);
--   pending employer: 9 -> 0;  approved employer: 9 -> 9;  legacy(NULL): 9 -> 9.

-- Approved employer = owner of, or active member of, an employer_profiles whose
-- approval_status is 'approved' or NULL (legacy) — matching the app's gate
-- (lib/foundingEntitlement.ts / is_employer_blocked_by_approval). pending /
-- rejected / waitlisted and anon get nothing. SECURITY DEFINER so it can read
-- employer_profiles/members regardless of the caller's own row visibility.
create or replace function public.is_approved_employer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employer_profiles ep
    where ep.user_id = auth.uid()
      and (ep.approval_status = 'approved' or ep.approval_status is null)
  ) or exists (
    select 1
    from public.employer_members m
    join public.employer_profiles ep on ep.id = m.employer_id
    where m.user_id = auth.uid()
      and m.status = 'active'
      and (ep.approval_status = 'approved' or ep.approval_status is null)
  );
$$;
grant execute on function public.is_approved_employer() to authenticated, anon;

-- Remove the over-broad SELECT policies (any authenticated user, and USING(true)).
drop policy if exists "Anyone authenticated can view candidate profiles" on public.candidate_profiles;
drop policy if exists "Employers can view all candidate profiles" on public.candidate_profiles;
drop policy if exists "Employers can view candidate profiles" on public.candidate_profiles;

-- Reads now require an approved employer. (The existing "Users can view their own
-- candidate profile" policy still lets each candidate read their own row.)
create policy "Approved employers can view candidate profiles"
  on public.candidate_profiles for select to authenticated
  using (public.is_approved_employer());

-- Close the anonymous hole at the privilege layer too (defence in depth).
revoke select on public.candidate_profiles from anon;
