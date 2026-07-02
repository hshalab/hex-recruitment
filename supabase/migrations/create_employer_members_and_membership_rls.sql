-- ============================================================================
-- Multi-user employer accounts — PHASE 1: employer_members + membership RLS
-- Non-destructive foundation. Keeps employer_profiles.user_id (UNIQUE) as the
-- OWNER pointer and all existing user_id-based policies. Adds a membership layer.
--
-- IMPORTANT identifier note: every employer-scoped table stores employer_id =
-- the OWNER'S auth user_id (verified: 58/58 jobs.employer_id = employer_profiles.user_id,
-- 0 = employer_profiles.id). So the helper functions are keyed on the owner user_id
-- (the value those tables hold), while employer_members.employer_id FKs to
-- employer_profiles.id per spec; the helpers bridge id <-> user_id internally.
-- ============================================================================

-- ---------- STEP 1: table ----------
create table if not exists public.employer_members (
  id           uuid primary key default gen_random_uuid(),
  employer_id  uuid not null references public.employer_profiles(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,   -- null until invite accepted
  invited_email text,                                              -- set at invite time
  role         text not null default 'member' check (role in ('owner','member')),
  permissions  jsonb not null default '{}'::jsonb,
  status       text not null default 'invited' check (status in ('invited','active','suspended')),
  invited_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

create unique index if not exists employer_members_employer_user_uk
  on public.employer_members (employer_id, user_id);
create unique index if not exists employer_members_employer_email_uk
  on public.employer_members (employer_id, lower(invited_email));
create index if not exists employer_members_user_idx     on public.employer_members (user_id);
create index if not exists employer_members_employer_idx on public.employer_members (employer_id);

alter table public.employer_members enable row level security;

-- Explicit grants for the Data API (grant convention taking effect 2026-10-30).
grant select, insert, update, delete on public.employer_members to authenticated;

-- ---------- STEP 2: SECURITY DEFINER helper functions ----------
-- Keyed on the OWNER user_id (= employer_profiles.user_id = <scoped table>.employer_id).
-- SECURITY DEFINER + fixed search_path so policies never self-subquery employer_members
-- (breaks RLS recursion). auth.uid() still resolves to the CALLER inside a definer fn.

create or replace function public.is_employer_member(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.employer_members m
    join public.employer_profiles ep on ep.id = m.employer_id
    where ep.user_id = target
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.current_employer_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select ep.user_id
  from public.employer_members m
  join public.employer_profiles ep on ep.id = m.employer_id
  where m.user_id = auth.uid()
    and m.status = 'active';
$$;

create or replace function public.has_employer_permission(target uuid, cap text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.employer_members m
    join public.employer_profiles ep on ep.id = m.employer_id
    where ep.user_id = target
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.role = 'owner' or (m.permissions ->> cap) = 'true')
  );
$$;

grant execute on function public.is_employer_member(uuid)             to authenticated;
grant execute on function public.current_employer_ids()               to authenticated;
grant execute on function public.has_employer_permission(uuid, text)  to authenticated;

-- ---------- STEP 3: backfill one OWNER row per employer_profile ----------
insert into public.employer_members (employer_id, user_id, role, permissions, status, accepted_at)
select ep.id, ep.user_id, 'owner',
  '{"manage_jobs":true,"view_applications":true,"manage_pipeline":true,"manage_interviews":true,"manage_team":true,"manage_billing":true,"edit_company":true}'::jsonb,
  'active', now()
from public.employer_profiles ep
where ep.user_id is not null
on conflict (employer_id, user_id) do nothing;

-- ---------- STEP 4: RLS (ADD alongside existing user_id policies; keep old) ----------

-- employer_members self-policies (use the SECURITY DEFINER helpers; never self-subquery).
drop policy if exists "members read same-employer members" on public.employer_members;
create policy "members read same-employer members" on public.employer_members
  for select to authenticated
  using (exists (select 1 from public.employer_profiles ep
                 where ep.id = employer_members.employer_id
                   and public.is_employer_member(ep.user_id)));

drop policy if exists "manage_team can add members" on public.employer_members;
create policy "manage_team can add members" on public.employer_members
  for insert to authenticated
  with check (exists (select 1 from public.employer_profiles ep
                      where ep.id = employer_members.employer_id
                        and public.has_employer_permission(ep.user_id, 'manage_team')));

drop policy if exists "manage_team can update members" on public.employer_members;
create policy "manage_team can update members" on public.employer_members
  for update to authenticated
  using (exists (select 1 from public.employer_profiles ep
                 where ep.id = employer_members.employer_id
                   and public.has_employer_permission(ep.user_id, 'manage_team')))
  with check (exists (select 1 from public.employer_profiles ep
                      where ep.id = employer_members.employer_id
                        and public.has_employer_permission(ep.user_id, 'manage_team')));

drop policy if exists "manage_team can remove non-owner members" on public.employer_members;
create policy "manage_team can remove non-owner members" on public.employer_members
  for delete to authenticated
  using (role <> 'owner'
         and exists (select 1 from public.employer_profiles ep
                     where ep.id = employer_members.employer_id
                       and public.has_employer_permission(ep.user_id, 'manage_team')));

-- Protect the owner row: cannot be demoted or suspended (RLS can't compare OLD/NEW).
create or replace function public.prevent_owner_demotion()
returns trigger language plpgsql as $$
begin
  if old.role = 'owner' and (new.role is distinct from 'owner' or new.status is distinct from 'active') then
    raise exception 'The owner member cannot be demoted or suspended';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prevent_owner_demotion on public.employer_members;
create trigger trg_prevent_owner_demotion
  before update on public.employer_members
  for each row execute function public.prevent_owner_demotion();

-- Anti-escalation: a non-owner (e.g. a manage_team member) must NOT be able to grant
-- the owner role or the sensitive caps (manage_team / manage_billing / edit_company)
-- — otherwise manage_team would be a self-serve path to full control. Only owners may.
-- Backend/service writes (auth.uid() null: migrations, admin, invite-accept) are allowed.
create or replace function public.guard_member_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
declare caller_is_owner boolean;
begin
  if auth.uid() is null then
    return new;  -- service_role / backend context
  end if;
  select exists (
    select 1 from public.employer_members me
    where me.employer_id = new.employer_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
      and me.status = 'active'
  ) into caller_is_owner;
  if caller_is_owner then
    return new;
  end if;
  if new.role = 'owner' then
    raise exception 'Only an owner can grant the owner role';
  end if;
  if coalesce((new.permissions ->> 'manage_team') = 'true', false)
     or coalesce((new.permissions ->> 'manage_billing') = 'true', false)
     or coalesce((new.permissions ->> 'edit_company') = 'true', false) then
    raise exception 'Only an owner can grant manage_team, manage_billing or edit_company';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_member_escalation on public.employer_members;
create trigger trg_guard_member_escalation
  before insert or update on public.employer_members
  for each row execute function public.guard_member_escalation();

-- Member SELECT on employer-scoped tables (employer_id = owner user_id).
drop policy if exists "members select jobs" on public.jobs;
create policy "members select jobs" on public.jobs
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select interviews" on public.interviews;
create policy "members select interviews" on public.interviews
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select interview_bookings" on public.interview_bookings;
create policy "members select interview_bookings" on public.interview_bookings
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select interview_notes" on public.interview_notes;
create policy "members select interview_notes" on public.interview_notes
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select job_offers" on public.job_offers;
create policy "members select job_offers" on public.job_offers
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select employer_availability" on public.employer_availability;
create policy "members select employer_availability" on public.employer_availability
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select employer_availability_overrides" on public.employer_availability_overrides;
create policy "members select employer_availability_overrides" on public.employer_availability_overrides
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select employer_email_templates" on public.employer_email_templates;
create policy "members select employer_email_templates" on public.employer_email_templates
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select ai_generation_usage" on public.ai_generation_usage;
create policy "members select ai_generation_usage" on public.ai_generation_usage
  for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select saved_candidates" on public.saved_candidates;
create policy "members select saved_candidates" on public.saved_candidates
  for select to authenticated using (public.is_employer_member(employer_id));

-- company_reviews.employer_id present (reviews are already public-read; added for completeness).
drop policy if exists "members select company_reviews" on public.company_reviews;
create policy "members select company_reviews" on public.company_reviews
  for select to authenticated using (public.is_employer_member(employer_id));

-- employer_profiles (keyed user_id = owner uid): members can read the profile.
drop policy if exists "members select employer_profile" on public.employer_profiles;
create policy "members select employer_profile" on public.employer_profiles
  for select to authenticated using (public.is_employer_member(user_id));

-- job_applications (gated via jobs.employer_id): members can read their employer's apps.
drop policy if exists "members select job_applications" on public.job_applications;
create policy "members select job_applications" on public.job_applications
  for select to authenticated
  using (exists (select 1 from public.jobs j
                 where j.id = job_applications.job_id
                   and public.is_employer_member(j.employer_id)));

-- Sensitive writes gated on capability (billing / company). Team writes gated above.
drop policy if exists "manage_billing update subscription" on public.employer_subscriptions;
create policy "manage_billing update subscription" on public.employer_subscriptions
  for update to authenticated
  using (public.has_employer_permission(user_id, 'manage_billing'))
  with check (public.has_employer_permission(user_id, 'manage_billing'));

drop policy if exists "edit_company update employer_profile" on public.employer_profiles;
create policy "edit_company update employer_profile" on public.employer_profiles
  for update to authenticated
  using (public.has_employer_permission(user_id, 'edit_company'))
  with check (public.has_employer_permission(user_id, 'edit_company'));
