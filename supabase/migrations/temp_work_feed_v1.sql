-- Temp Work feed (v1): temp_posts + temp_interest. employer_id follows the jobs
-- convention (OWNER's auth user_id) so the existing membership/capability helpers apply.

create table if not exists public.temp_posts (
  id            uuid primary key default gen_random_uuid(),
  employer_id   uuid not null,
  title         text not null,
  category      text not null,
  description   text,
  shift_date    date,
  start_time    time,
  end_time      time,
  is_ongoing    boolean not null default false,
  location_area text not null,
  postcode      text,
  hourly_rate   numeric,
  rate_type     text not null default 'hour' check (rate_type in ('hour','shift','day')),
  headcount     int not null default 1,
  image_url     text,
  external_link text,
  status        text not null default 'open' check (status in ('open','filled','closed','expired')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz
);
create index if not exists temp_posts_status_created_idx on public.temp_posts (status, created_at desc);
create index if not exists temp_posts_employer_idx on public.temp_posts (employer_id);

alter table public.temp_posts enable row level security;
grant select on public.temp_posts to anon;
grant select, insert, update, delete on public.temp_posts to authenticated;

drop policy if exists "public read open temp_posts" on public.temp_posts;
create policy "public read open temp_posts" on public.temp_posts
  for select to anon, authenticated
  using (status = 'open' or public.has_employer_permission(employer_id, 'manage_jobs'));

drop policy if exists "manage_jobs insert temp_posts" on public.temp_posts;
create policy "manage_jobs insert temp_posts" on public.temp_posts
  for insert to authenticated
  with check (public.has_employer_permission(employer_id, 'manage_jobs'));

drop policy if exists "manage_jobs update temp_posts" on public.temp_posts;
create policy "manage_jobs update temp_posts" on public.temp_posts
  for update to authenticated
  using (public.has_employer_permission(employer_id, 'manage_jobs'))
  with check (public.has_employer_permission(employer_id, 'manage_jobs'));

drop policy if exists "manage_jobs delete temp_posts" on public.temp_posts;
create policy "manage_jobs delete temp_posts" on public.temp_posts
  for delete to authenticated
  using (public.has_employer_permission(employer_id, 'manage_jobs'));

create table if not exists public.temp_interest (
  id                uuid primary key default gen_random_uuid(),
  temp_post_id      uuid not null references public.temp_posts(id) on delete cascade,
  candidate_user_id uuid not null references auth.users(id) on delete cascade,
  message           text,
  status            text not null default 'interested' check (status in ('interested','shortlisted','booked','declined')),
  created_at        timestamptz not null default now(),
  unique (temp_post_id, candidate_user_id)
);
create index if not exists temp_interest_post_idx on public.temp_interest (temp_post_id);
create index if not exists temp_interest_candidate_idx on public.temp_interest (candidate_user_id);

alter table public.temp_interest enable row level security;
grant select, insert, update, delete on public.temp_interest to authenticated;

drop policy if exists "read own or as post owner" on public.temp_interest;
create policy "read own or as post owner" on public.temp_interest
  for select to authenticated
  using (candidate_user_id = auth.uid()
         or exists (select 1 from public.temp_posts tp
                    where tp.id = temp_interest.temp_post_id
                      and public.has_employer_permission(tp.employer_id, 'manage_jobs')));

drop policy if exists "candidate inserts own interest" on public.temp_interest;
create policy "candidate inserts own interest" on public.temp_interest
  for insert to authenticated
  with check (candidate_user_id = auth.uid());

drop policy if exists "owner updates interest status" on public.temp_interest;
create policy "owner updates interest status" on public.temp_interest
  for update to authenticated
  using (exists (select 1 from public.temp_posts tp
                 where tp.id = temp_interest.temp_post_id
                   and public.has_employer_permission(tp.employer_id, 'manage_jobs')))
  with check (exists (select 1 from public.temp_posts tp
                      where tp.id = temp_interest.temp_post_id
                        and public.has_employer_permission(tp.employer_id, 'manage_jobs')));

drop policy if exists "candidate withdraws own interest" on public.temp_interest;
create policy "candidate withdraws own interest" on public.temp_interest
  for delete to authenticated
  using (candidate_user_id = auth.uid());

-- public storage bucket for one optional image per post
insert into storage.buckets (id, name, public) values ('temp-posts', 'temp-posts', true)
  on conflict (id) do nothing;
