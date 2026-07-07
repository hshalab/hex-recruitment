-- Hardening for temp_post_comments:
-- 1) Identity is server-authoritative — a BEFORE INSERT trigger overwrites
--    author_name/author_avatar from the commenter's own profile, so a client
--    cannot spoof another identity (e.g. comment as "The Example Kitchen").
-- 2) Owners may change ONLY the `hidden` column (column-level grant), so the
--    "owner hide comments" RLS policy can't be leveraged to rewrite body/user_id.

create or replace function public.set_temp_comment_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_avatar text;
begin
  -- Ignore any client-supplied author fields; look them up from the real profile.
  select full_name into v_name from public.candidate_profiles where user_id = new.user_id;
  if v_name is null then
    select company_name, logo_url into v_name, v_avatar from public.employer_profiles where user_id = new.user_id;
  end if;
  new.author_name := v_name;      -- candidates: real name; employers: company name
  new.author_avatar := v_avatar;  -- candidates have no stored photo (initials shown)
  return new;
end; $$;

drop trigger if exists trg_temp_comment_identity on public.temp_post_comments;
create trigger trg_temp_comment_identity before insert on public.temp_post_comments
  for each row execute function public.set_temp_comment_identity();

-- Constrain owner updates to the moderation flag only.
revoke update on public.temp_post_comments from authenticated;
grant update (hidden) on public.temp_post_comments to authenticated;
