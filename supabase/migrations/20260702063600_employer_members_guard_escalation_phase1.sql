create or replace function public.guard_member_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
declare caller_is_owner boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  select exists (
    select 1 from public.employer_members me
    where me.employer_id = new.employer_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
      and me.status = 'active'
  ) into caller_is_owner;
  if caller_is_owner then
    return new;
  end if;
  if new.role = 'owner' then
    raise exception 'Only an owner can grant the owner role';
  end if;
  if coalesce((new.permissions ->> 'manage_team') = 'true', false)
     or coalesce((new.permissions ->> 'manage_billing') = 'true', false)
     or coalesce((new.permissions ->> 'edit_company') = 'true', false) then
    raise exception 'Only an owner can grant manage_team, manage_billing or edit_company';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_member_escalation on public.employer_members;
create trigger trg_guard_member_escalation
  before insert or update on public.employer_members
  for each row execute function public.guard_member_escalation();
