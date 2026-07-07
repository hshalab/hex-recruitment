-- Temp Work v2: social engagement (likes + comments) replacing the interest flow,
-- plus a multi-day date range (date_from/date_to) on posts.

-- 1) Date range: rename shift_date -> date_from (preserves the existing post's date),
--    add date_to for multi-day shifts.
alter table public.temp_posts rename column shift_date to date_from;
alter table public.temp_posts add column if not exists date_to date;

-- 2) Denormalised engagement counts (public feed reads these directly off the post).
alter table public.temp_posts
  add column if not exists like_count int not null default 0,
  add column if not exists comment_count int not null default 0;

-- Post visibility / ownership helpers (SECURITY DEFINER so RLS on the child tables
-- can gate on the parent post without exposing non-public post rows).
create or replace function public.temp_post_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.temp_posts p
    where p.id = p_id
      and (p.status = 'open' or public.has_employer_permission(p.employer_id, 'manage_jobs'))
  );
$$;
create or replace function public.temp_post_is_owner(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.temp_posts p
    where p.id = p_id and public.has_employer_permission(p.employer_id, 'manage_jobs')
  );
$$;

-- 3) Likes
create table if not exists public.temp_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.temp_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists temp_post_likes_post_idx on public.temp_post_likes(post_id);

-- 4) Comments (public, LinkedIn-style). Author identity denormalised so the public
--    feed shows who commented without cross-table RLS reads. hidden = owner-moderated.
create table if not exists public.temp_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.temp_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  author_name text,
  author_avatar text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists temp_post_comments_post_idx on public.temp_post_comments(post_id, created_at);

alter table public.temp_post_likes enable row level security;
alter table public.temp_post_comments enable row level security;

-- Likes RLS: readable by anyone who can see the post; a user manages only their own.
drop policy if exists "read likes on visible posts" on public.temp_post_likes;
create policy "read likes on visible posts" on public.temp_post_likes
  for select to anon, authenticated using (public.temp_post_visible(post_id));
drop policy if exists "like as self" on public.temp_post_likes;
create policy "like as self" on public.temp_post_likes
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "unlike own" on public.temp_post_likes;
create policy "unlike own" on public.temp_post_likes
  for delete to authenticated using (user_id = auth.uid());

-- Comments RLS: public read on visible posts (hidden ones only to author/owner);
-- any logged-in user comments as self; author deletes own; post owner deletes/hides.
drop policy if exists "read comments on visible posts" on public.temp_post_comments;
create policy "read comments on visible posts" on public.temp_post_comments
  for select to anon, authenticated using (
    public.temp_post_visible(post_id)
    and (hidden = false or user_id = auth.uid() or public.temp_post_is_owner(post_id))
  );
drop policy if exists "comment as self" on public.temp_post_comments;
create policy "comment as self" on public.temp_post_comments
  for insert to authenticated with check (user_id = auth.uid() and length(btrim(body)) > 0);
drop policy if exists "delete own or as owner" on public.temp_post_comments;
create policy "delete own or as owner" on public.temp_post_comments
  for delete to authenticated using (user_id = auth.uid() or public.temp_post_is_owner(post_id));
drop policy if exists "owner hide comments" on public.temp_post_comments;
create policy "owner hide comments" on public.temp_post_comments
  for update to authenticated using (public.temp_post_is_owner(post_id)) with check (public.temp_post_is_owner(post_id));

-- Grants
grant select on public.temp_post_likes to anon, authenticated;
grant insert, delete on public.temp_post_likes to authenticated;
grant select on public.temp_post_comments to anon, authenticated;
grant insert, update, delete on public.temp_post_comments to authenticated;

-- Count maintenance
create or replace function public.temp_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.temp_posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.temp_posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_temp_like_count on public.temp_post_likes;
create trigger trg_temp_like_count after insert or delete on public.temp_post_likes
  for each row execute function public.temp_like_count();

create or replace function public.temp_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.temp_posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.temp_posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_temp_comment_count on public.temp_post_comments;
create trigger trg_temp_comment_count after insert or delete on public.temp_post_comments
  for each row execute function public.temp_comment_count();

-- Notify the post owner on a new comment (skip the owner's own comments).
create or replace function public.temp_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
begin
  select employer_id, title into v_owner, v_title from public.temp_posts where id = new.post_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications (user_id, type, title, message, read, related_id, related_type, link)
    values (v_owner, 'temp_comment', 'New comment on your shift',
            coalesce(new.author_name, 'Someone') || ' commented on “' || coalesce(v_title, 'your shift') || '”',
            false, new.post_id::text, 'temp_post', '/temp-work/manage');
  end if;
  return null;
end; $$;
drop trigger if exists trg_temp_comment_notify on public.temp_post_comments;
create trigger trg_temp_comment_notify after insert on public.temp_post_comments
  for each row execute function public.temp_comment_notify();

-- 5) The old temp_interest flow is deprecated (table left in place, unused, empty).
