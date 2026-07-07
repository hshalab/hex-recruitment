-- Record the comment author's role (server-side, in the identity trigger) so the
-- feed/manage can linkify only candidate commenters — employers have no candidate
-- profile page, so their names stay plain text.
alter table public.temp_post_comments add column if not exists author_role text;

create or replace function public.set_temp_comment_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_avatar text; v_role text;
begin
  -- Ignore any client-supplied author fields; look them up from the real profile.
  select full_name into v_name from public.candidate_profiles where user_id = new.user_id;
  if v_name is not null then
    v_role := 'candidate';
  else
    select company_name, logo_url into v_name, v_avatar from public.employer_profiles where user_id = new.user_id;
    if v_name is not null then v_role := 'employer'; end if;
  end if;
  new.author_name := v_name;      -- candidates: real name; employers: company name
  new.author_avatar := v_avatar;  -- candidates have no stored photo (initials shown)
  new.author_role := v_role;      -- drives whether the name links to a profile
  return new;
end; $$;
