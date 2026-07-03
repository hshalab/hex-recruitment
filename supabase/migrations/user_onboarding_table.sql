-- Per-user onboarding flags (multi-user aware: keyed on the user, not the employer,
-- so each team member has their own tour state). RLS: a user only sees/writes their row.
create table if not exists public.user_onboarding (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  employer_tour_completed_at timestamptz,
  created_at                 timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;
grant select, insert, update on public.user_onboarding to authenticated;

drop policy if exists "own onboarding select" on public.user_onboarding;
create policy "own onboarding select" on public.user_onboarding
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own onboarding insert" on public.user_onboarding;
create policy "own onboarding insert" on public.user_onboarding
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own onboarding update" on public.user_onboarding;
create policy "own onboarding update" on public.user_onboarding
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
