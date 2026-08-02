-- Revive the temp_interest flow, and close the comment loop.
--
-- temp_interest was built in temp_work_feed_v1 as the way a candidate puts
-- themselves forward for a shift, then deprecated in v2 in favour of comments.
-- That swapped a structured, workable "I'm interested" for a chat thread an
-- employer has to remember to read. This puts it back. The table, indexes,
-- unique constraint and RLS policies are untouched — they were always correct.

-- 1) NOTIFY THE EMPLOYER WHEN SOMEONE PUTS THEMSELVES FORWARD.
--    Mirrors what an Easy apply on a job already does. The link goes to
--    /temp-work/manage, which is where the list lives.
create or replace function public.temp_interest_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
  v_name  text;
begin
  select employer_id, title into v_owner, v_title
    from public.temp_posts where id = new.temp_post_id;

  -- Denormalised name, same source the comment identity trigger uses, so the
  -- employer sees who it is without a cross-table read at render time.
  select coalesce(nullif(trim(full_name), ''), 'A candidate') into v_name
    from public.profiles where user_id = new.candidate_user_id;

  if v_owner is not null and v_owner <> new.candidate_user_id then
    insert into public.notifications (user_id, type, title, message, read, related_id, related_type, link)
    values (v_owner, 'temp_interest', 'Someone is available for your shift',
            coalesce(v_name, 'A candidate') || ' is interested in “' || coalesce(v_title, 'your shift') || '”',
            false, new.temp_post_id::text, 'temp_post', '/temp-work/manage');
  end if;
  return null;
end; $$;

drop trigger if exists trg_temp_interest_notify on public.temp_interest;
create trigger trg_temp_interest_notify after insert on public.temp_interest
  for each row execute function public.temp_interest_notify();

-- 2) A REPLY MUST REACH THE CANDIDATE.
--
--    The old trigger only ever notified the post owner, and skipped the owner's
--    own comments — so when an employer replied, nobody was told. A chef could
--    comment, get an answer, and never know. That is the failure that costs a
--    candidate rather than annoying them.
--
--    Now it notifies the OTHER PARTY, whichever direction the comment goes:
--      candidate comments -> the employer hears
--      employer comments  -> everyone else in that thread hears, plus anyone
--                            who registered interest, since they are the people
--                            waiting on an answer
--
--    The link deep-links to the post so the notification lands on the thread
--    rather than on a feed the reader then has to search.
create or replace function public.temp_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
  v_link  text;
begin
  select employer_id, title into v_owner, v_title from public.temp_posts where id = new.post_id;
  if v_owner is null then return null; end if;

  v_link := '/temp-work?post=' || new.post_id::text;

  if v_owner <> new.user_id then
    -- A candidate (or anyone who isn't the owner) commented: tell the employer.
    insert into public.notifications (user_id, type, title, message, read, related_id, related_type, link)
    values (v_owner, 'temp_comment', 'New comment on your shift',
            coalesce(new.author_name, 'Someone') || ' commented on “' || coalesce(v_title, 'your shift') || '”',
            false, new.post_id::text, 'temp_post', '/temp-work/manage');
  else
    -- The employer replied: tell everyone waiting on them. Distinct, and never
    -- the employer themselves.
    insert into public.notifications (user_id, type, title, message, read, related_id, related_type, link)
    select u.uid, 'temp_comment_reply', 'The employer replied',
           'There''s a reply on “' || coalesce(v_title, 'a shift') || '”',
           false, new.post_id::text, 'temp_post', v_link
    from (
      select c.user_id as uid from public.temp_post_comments c
        where c.post_id = new.post_id and c.user_id <> v_owner
      union
      select i.candidate_user_id as uid from public.temp_interest i
        where i.temp_post_id = new.post_id and i.candidate_user_id <> v_owner
    ) u;
  end if;
  return null;
end; $$;

drop trigger if exists trg_temp_comment_notify on public.temp_post_comments;
create trigger trg_temp_comment_notify after insert on public.temp_post_comments
  for each row execute function public.temp_comment_notify();
