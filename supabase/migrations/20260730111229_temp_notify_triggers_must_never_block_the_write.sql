-- A NOTIFICATION IS A SIDE EFFECT AND MUST NEVER ABORT THE ACTION THAT CAUSED IT.
--
-- Found by testing rather than reading: notifications.user_id carries a foreign
-- key to auth.users, and temp_posts.employer_id carries none. So a post whose
-- employer account has since been deleted is a reachable state — and in that
-- state the AFTER INSERT notify trigger raises, which rolls back the candidate's
-- insert. A chef would tap "I'm interested" and get a foreign-key error.
--
-- This is not hypothetical for comments: trg_temp_comment_notify has been live
-- since 7 July with exactly the same exposure. Nobody has hit it only because
-- no shift has ever been posted.
--
-- Both functions now (a) check the recipient still exists and (b) swallow any
-- remaining failure, so the worst case is a missing notification rather than a
-- candidate who cannot put themselves forward. The app side already treats
-- notification failure as non-blocking; the database now agrees.

create or replace function public.temp_interest_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
  v_name  text;
begin
  select employer_id, title into v_owner, v_title
    from public.temp_posts where id = new.temp_post_id;

  select nullif(trim(full_name), '') into v_name
    from public.candidate_profiles where user_id = new.candidate_user_id;
  if v_name is null then
    select nullif(trim(company_name), '') into v_name
      from public.employer_profiles where user_id = new.candidate_user_id;
  end if;

  if v_owner is not null and v_owner <> new.candidate_user_id
     and exists (select 1 from auth.users where id = v_owner) then
    begin
      insert into public.notifications (user_id, type, title, message, read, related_id, related_type, link)
      values (v_owner, 'temp_interest', 'Someone is available for your shift',
              coalesce(v_name, 'A candidate') || ' is interested in “' || coalesce(v_title, 'your shift') || '”',
              false, new.temp_post_id::text, 'temp_post', '/temp-work/manage');
    exception when others then
      raise warning 'temp_interest_notify: could not notify %: %', v_owner, sqlerrm;
    end;
  end if;
  return null;
end; $$;

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

  begin
    if v_owner <> new.user_id then
      -- Someone other than the owner commented: tell the employer.
      if exists (select 1 from auth.users where id = v_owner) then
        insert into public.notifications (user_id, type, title, message, read, related_id, related_type, link)
        values (v_owner, 'temp_comment', 'New comment on your shift',
                coalesce(new.author_name, 'Someone') || ' commented on “' || coalesce(v_title, 'your shift') || '”',
                false, new.post_id::text, 'temp_post', '/temp-work/manage');
      end if;
    else
      -- The employer replied: tell everyone waiting on them — the other people
      -- in the thread, and anyone who registered interest. Distinct, never the
      -- employer, and only recipients who still exist.
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
      ) u
      where exists (select 1 from auth.users au where au.id = u.uid);
    end if;
  exception when others then
    raise warning 'temp_comment_notify: could not notify on post %: %', new.post_id, sqlerrm;
  end;
  return null;
end; $$;
