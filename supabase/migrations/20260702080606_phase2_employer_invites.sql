-- ============================================================================
-- Multi-user employer accounts — PHASE 2: invite tokens + accept RPC +
-- owner-membership-on-signup + escalation-guard refinement.
--
-- Additive on top of PHASE 1 (create_employer_members_and_membership_rls.sql).
-- Preview-only until sign-off. Does NOT drop any legacy user_id RLS policy.
-- ============================================================================

-- ---------- STEP A: invite token columns ----------
alter table public.employer_members
  add column if not exists invite_token      uuid,
  add column if not exists invite_expires_at timestamptz;

create index if not exists employer_members_invite_token_idx
  on public.employer_members (invite_token) where invite_token is not null;

-- Re-affirm the Data API grant (covers the new columns).
grant select, insert, update, delete on public.employer_members to authenticated;

-- ---------- STEP B: create the OWNER membership row on employer signup ----------
-- PHASE 1 backfilled one owner row per existing employer_profile, but that was a
-- one-time INSERT. New signups after PHASE 1 would have no membership row, so
-- current_employer_ids() (and the query helpers) would return nothing for them.
-- This trigger keeps every employer_profile paired with an owner member row.
create or replace function public.create_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    insert into public.employer_members
      (employer_id, user_id, role, permissions, status, accepted_at)
    values (new.id, new.user_id, 'owner',
      '{"manage_jobs":true,"view_applications":true,"manage_pipeline":true,"manage_interviews":true,"manage_team":true,"manage_billing":true,"edit_company":true}'::jsonb,
      'active', now())
    on conflict (employer_id, user_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_create_owner_membership on public.employer_profiles;
create trigger trg_create_owner_membership
  after insert on public.employer_profiles
  for each row execute function public.create_owner_membership();

-- ---------- STEP C: refine the anti-escalation guard ----------
-- PHASE 1's guard blocked any non-owner from writing an owner row or a sensitive
-- cap. That correctly stops a manage_team member escalating, but it also blocks
-- two legitimate flows we now need:
--   1. the invitee accepting their OWN invite (invited→active) — the perms were
--      already vetted by the guard at INSERT time, so re-checking is wrong;
--   2. the owner-bootstrap above (the employer's own profile owner being set as
--      role=owner by the signup trigger, running under the signing-up user).
create or replace function public.guard_member_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_is_owner boolean;
  profile_owner   uuid;
begin
  if auth.uid() is null then
    return new;  -- service_role / backend context
  end if;

  -- (1) invitee accepting their own invite: invited→active, no role/perm change.
  if tg_op = 'UPDATE'
     and old.status = 'invited' and new.status = 'active'
     and new.user_id = auth.uid()
     and new.role = old.role
     and new.permissions = old.permissions then
    return new;
  end if;

  -- (2) bootstrap: the employer's own profile owner set as role=owner.
  select ep.user_id into profile_owner
    from public.employer_profiles ep where ep.id = new.employer_id;
  if new.role = 'owner' and new.user_id is not distinct from profile_owner then
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
-- trigger definition unchanged (PHASE 1 already created trg_guard_member_escalation).

-- ---------- STEP D: accept_employer_invite RPC ----------
-- SECURITY DEFINER so it can flip the invited row despite RLS. Validates token,
-- expiry, status, and that the caller's email matches the invited email. v1:
-- one active employer per user (block if already active somewhere else).
create or replace function public.accept_employer_invite(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_member public.employer_members%rowtype;
  v_active int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_member
    from public.employer_members
    where invite_token = p_token
    limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_member.status <> 'invited' then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;
  if v_member.invite_expires_at is not null and v_member.invite_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if lower(coalesce(v_member.invited_email, '')) <> coalesce(v_email, '') then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select count(*) into v_active
    from public.employer_members
    where user_id = v_uid and status = 'active';
  if v_active > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_in_account');
  end if;

  update public.employer_members
    set user_id           = v_uid,
        status            = 'active',
        accepted_at       = now(),
        invite_token      = null,
        invite_expires_at = null
    where id = v_member.id;

  return jsonb_build_object('ok', true, 'employer_id', v_member.employer_id);
end;
$$;
grant execute on function public.accept_employer_invite(uuid) to authenticated;
