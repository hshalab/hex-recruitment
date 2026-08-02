-- The name lookup in temp_interest_notify referenced public.profiles, which does
-- not exist. Because the trigger is SECURITY DEFINER and fires AFTER INSERT, a
-- missing relation would have raised and aborted the insert — so expressing
-- interest would have failed outright rather than degrading to a blank name.
--
-- The correct source is the one the comment identity trigger already uses:
-- candidate_profiles.full_name, falling back to employer_profiles.company_name
-- for the case where an employer account puts itself forward.
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

  if v_owner is not null and v_owner <> new.candidate_user_id then
    insert into public.notifications (user_id, type, title, message, read, related_id, related_type, link)
    values (v_owner, 'temp_interest', 'Someone is available for your shift',
            coalesce(v_name, 'A candidate') || ' is interested in “' || coalesce(v_title, 'your shift') || '”',
            false, new.temp_post_id::text, 'temp_post', '/temp-work/manage');
  end if;
  return null;
end; $$;
