-- A dated shift's natural end is ITS DATE, not the moment someone takes it.
--
-- Marking a shift filled used to remove it from the world: the public read
-- policy admits only status='open', so the post AND its comment thread vanished
-- the instant an agency booked someone. That treated "filled" as "over", and
-- they are different events — a Saturday shift is still a real thing happening
-- on Saturday whether or not it has a name against it.
--
-- It also broke the notification loop for the worst possible person. The reply
-- notification deep-links into the thread; the candidate who actually got the
-- work would click it and find nothing, because booking them had hidden the
-- conversation they were being told about.
--
-- So a filled shift stays readable until it expires. expires_at has been sitting
-- on this table unused since v1 — it was built for exactly this.

-- 1) SET THE EXPIRY IN THE DATABASE, not the client.
--    "Mark filled" is one button in one file today, but a rule that lives in the
--    client is a rule the next caller forgets. This fires however status gets
--    set.
create or replace function public.temp_post_set_expiry()
returns trigger language plpgsql as $$
begin
  if new.status = 'filled' and (old.status is distinct from 'filled') and new.expires_at is null then
    if new.is_ongoing then
      -- No date to expire on, so it expires on a clock. SEVEN DAYS, tied to the
      -- roundup: the candidate email goes weekly, and a filled shift that
      -- outlived the email advertising it would send a chef to work that has
      -- been gone for days. Nothing may outlive the next send.
      new.expires_at := now() + interval '7 days';
    else
      -- Through the end of the shift's own last day, in UK local time — a shift
      -- finishing at 23:30 should not disappear at 00:00 UTC that morning.
      new.expires_at := ((coalesce(new.date_to, new.date_from) + 1)::timestamp
                          at time zone 'Europe/London');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_temp_post_set_expiry on public.temp_posts;
create trigger trg_temp_post_set_expiry before update on public.temp_posts
  for each row execute function public.temp_post_set_expiry();

-- 2) THE READ POLICY, in both the places that gate this.
--
--    NOTE — tightened from what I proposed and Paul approved: a NULL expires_at
--    on a filled post now counts as EXPIRED (hidden) rather than visible.
--    Treating null as visible would let a filled shift linger for ever if the
--    trigger were ever bypassed, which is the one outcome this whole change
--    exists to prevent. Hiding is also the old behaviour, so the failure mode is
--    the status quo rather than something new.
drop policy if exists "public read open temp_posts" on public.temp_posts;
create policy "public read open temp_posts" on public.temp_posts
  for select to anon, authenticated
  using (
    status = 'open'
    or (status = 'filled' and expires_at is not null and expires_at > now())
    or public.has_employer_permission(employer_id, 'manage_jobs')
  );

create or replace function public.temp_post_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.temp_posts p
    where p.id = p_id
      and (
        p.status = 'open'
        or (p.status = 'filled' and p.expires_at is not null and p.expires_at > now())
        or public.has_employer_permission(p.employer_id, 'manage_jobs')
      )
  );
$$;
