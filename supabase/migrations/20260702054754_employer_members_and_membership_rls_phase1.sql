-- Multi-user employer accounts — PHASE 1: employer_members + membership RLS (non-destructive)
create table if not exists public.employer_members (
  id           uuid primary key default gen_random_uuid(),
  employer_id  uuid not null references public.employer_profiles(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  invited_email text,
  role         text not null default 'member' check (role in ('owner','member')),
  permissions  jsonb not null default '{}'::jsonb,
  status       text not null default 'invited' check (status in ('invited','active','suspended')),
  invited_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
create unique index if not exists employer_members_employer_user_uk  on public.employer_members (employer_id, user_id);
create unique index if not exists employer_members_employer_email_uk on public.employer_members (employer_id, lower(invited_email));
create index if not exists employer_members_user_idx     on public.employer_members (user_id);
create index if not exists employer_members_employer_idx on public.employer_members (employer_id);
alter table public.employer_members enable row level security;
grant select, insert, update, delete on public.employer_members to authenticated;

create or replace function public.is_employer_member(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employer_members m join public.employer_profiles ep on ep.id = m.employer_id
    where ep.user_id = target and m.user_id = auth.uid() and m.status = 'active');
$$;
create or replace function public.current_employer_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ep.user_id from public.employer_members m join public.employer_profiles ep on ep.id = m.employer_id
  where m.user_id = auth.uid() and m.status = 'active';
$$;
create or replace function public.has_employer_permission(target uuid, cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employer_members m join public.employer_profiles ep on ep.id = m.employer_id
    where ep.user_id = target and m.user_id = auth.uid() and m.status = 'active'
      and (m.role = 'owner' or (m.permissions ->> cap) = 'true'));
$$;
grant execute on function public.is_employer_member(uuid)            to authenticated;
grant execute on function public.current_employer_ids()              to authenticated;
grant execute on function public.has_employer_permission(uuid, text) to authenticated;

insert into public.employer_members (employer_id, user_id, role, permissions, status, accepted_at)
select ep.id, ep.user_id, 'owner',
  '{"manage_jobs":true,"view_applications":true,"manage_pipeline":true,"manage_interviews":true,"manage_team":true,"manage_billing":true,"edit_company":true}'::jsonb,
  'active', now()
from public.employer_profiles ep where ep.user_id is not null
on conflict (employer_id, user_id) do nothing;

drop policy if exists "members read same-employer members" on public.employer_members;
create policy "members read same-employer members" on public.employer_members for select to authenticated
  using (exists (select 1 from public.employer_profiles ep where ep.id = employer_members.employer_id and public.is_employer_member(ep.user_id)));
drop policy if exists "manage_team can add members" on public.employer_members;
create policy "manage_team can add members" on public.employer_members for insert to authenticated
  with check (exists (select 1 from public.employer_profiles ep where ep.id = employer_members.employer_id and public.has_employer_permission(ep.user_id, 'manage_team')));
drop policy if exists "manage_team can update members" on public.employer_members;
create policy "manage_team can update members" on public.employer_members for update to authenticated
  using (exists (select 1 from public.employer_profiles ep where ep.id = employer_members.employer_id and public.has_employer_permission(ep.user_id, 'manage_team')))
  with check (exists (select 1 from public.employer_profiles ep where ep.id = employer_members.employer_id and public.has_employer_permission(ep.user_id, 'manage_team')));
drop policy if exists "manage_team can remove non-owner members" on public.employer_members;
create policy "manage_team can remove non-owner members" on public.employer_members for delete to authenticated
  using (role <> 'owner' and exists (select 1 from public.employer_profiles ep where ep.id = employer_members.employer_id and public.has_employer_permission(ep.user_id, 'manage_team')));

create or replace function public.prevent_owner_demotion()
returns trigger language plpgsql as $$
begin
  if old.role = 'owner' and (new.role is distinct from 'owner' or new.status is distinct from 'active') then
    raise exception 'The owner member cannot be demoted or suspended';
  end if; return new;
end; $$;
drop trigger if exists trg_prevent_owner_demotion on public.employer_members;
create trigger trg_prevent_owner_demotion before update on public.employer_members for each row execute function public.prevent_owner_demotion();

drop policy if exists "members select jobs" on public.jobs;
create policy "members select jobs" on public.jobs for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select interviews" on public.interviews;
create policy "members select interviews" on public.interviews for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select interview_bookings" on public.interview_bookings;
create policy "members select interview_bookings" on public.interview_bookings for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select interview_notes" on public.interview_notes;
create policy "members select interview_notes" on public.interview_notes for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select job_offers" on public.job_offers;
create policy "members select job_offers" on public.job_offers for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select employer_availability" on public.employer_availability;
create policy "members select employer_availability" on public.employer_availability for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select employer_availability_overrides" on public.employer_availability_overrides;
create policy "members select employer_availability_overrides" on public.employer_availability_overrides for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select employer_email_templates" on public.employer_email_templates;
create policy "members select employer_email_templates" on public.employer_email_templates for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select ai_generation_usage" on public.ai_generation_usage;
create policy "members select ai_generation_usage" on public.ai_generation_usage for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select saved_candidates" on public.saved_candidates;
create policy "members select saved_candidates" on public.saved_candidates for select to authenticated using (public.is_employer_member(employer_id));
drop policy if exists "members select company_reviews" on public.company_reviews;
create policy "members select company_reviews" on public.company_reviews for select to authenticated using (public.is_employer_member(employer_id));

drop policy if exists "members select employer_profile" on public.employer_profiles;
create policy "members select employer_profile" on public.employer_profiles for select to authenticated using (public.is_employer_member(user_id));

drop policy if exists "members select job_applications" on public.job_applications;
create policy "members select job_applications" on public.job_applications for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_applications.job_id and public.is_employer_member(j.employer_id)));

drop policy if exists "manage_billing update subscription" on public.employer_subscriptions;
create policy "manage_billing update subscription" on public.employer_subscriptions for update to authenticated
  using (public.has_employer_permission(user_id, 'manage_billing')) with check (public.has_employer_permission(user_id, 'manage_billing'));
drop policy if exists "edit_company update employer_profile" on public.employer_profiles;
create policy "edit_company update employer_profile" on public.employer_profiles for update to authenticated
  using (public.has_employer_permission(user_id, 'edit_company')) with check (public.has_employer_permission(user_id, 'edit_company'));
