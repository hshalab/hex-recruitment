-- job_offers column-level write lockdown.
--
-- Problem: RLS on job_offers is row-level only. "Candidates can respond to
-- offers" (USING auth.uid() = candidate_id) and the symmetric employer policy
-- grant UPDATE on the ROW, and the `authenticated` role holds UPDATE on all 32
-- columns. A candidate calling PostgREST directly could therefore rewrite
-- salary, start_date, offer_letter_text, right_to_work_confirmed or the
-- employer_signature_* fields on their own offer — not just accept or decline.
-- The employer side was symmetrically able to forge the candidate signature.
--
-- Approach: keep the row policies (three legitimate client-side writes depend
-- on them) and add a BEFORE UPDATE guard enforcing a per-actor column
-- allowlist. This closes the hole regardless of how many client paths exist,
-- including any added later.
--
-- The three legitimate direct client writes this must keep working:
--   components/DeclineOfferModal.tsx:57      candidate → status, decline_reason
--   components/MakeOfferModal.tsx:384        employer  → ai_summary, ai_tags
--   app/my-jobs/[jobId]/applications:579     employer  → right_to_work_confirmed
--
-- The four API routes (accept, counter-sign, withdraw, status-summary) all go
-- through supabaseAdmin (service role) and are exempt — they are the audited
-- paths that legitimately write status, signatures and letters.

create or replace function public.enforce_job_offers_column_scope()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid     uuid   := auth.uid();
  v_role    text   := coalesce(auth.role(), '');
  v_changed text[];
begin
  -- Exempt: service role (the offer API routes via supabaseAdmin), and any
  -- context with no authenticated end-user — migrations, psql, the Supabase
  -- SQL editor, service-key cron. Anonymous PostgREST callers are already
  -- blocked upstream by RLS (every UPDATE policy requires auth.uid() to match),
  -- so a null uid here never represents an untrusted actor.
  if v_role = 'service_role' or v_uid is null then
    return new;
  end if;

  -- Which columns actually changed? updated_at is always allowed — the
  -- job_offers_updated_at trigger maintains it.
  select array_agg(n.key order by n.key)
    into v_changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key)
    and n.key <> 'updated_at';

  -- No substantive change (e.g. a no-op write): nothing to police.
  if v_changed is null then
    return new;
  end if;

  -- Candidate: may only respond to the offer.
  if v_uid = old.candidate_id then
    if v_changed <@ array['status', 'decline_reason'] then
      return new;
    end if;
    raise exception
      'job_offers: candidates may only update status, decline_reason (attempted: %)',
      array_to_string(v_changed, ', ')
      using errcode = '42501';
  end if;

  -- Employer (owner or active team member): may only annotate the offer.
  -- Everything material — status, salary, terms, signatures, letters — must go
  -- through the offer API routes.
  if v_uid = old.employer_id or public.is_employer_member(old.employer_id) then
    if v_changed <@ array[
      'ai_summary',
      'ai_tags',
      'right_to_work_confirmed',
      'right_to_work_confirmed_at',
      'right_to_work_confirmed_by'
    ] then
      return new;
    end if;
    raise exception
      'job_offers: employers may only update ai_summary, ai_tags, right_to_work_confirmed* (attempted: %)',
      array_to_string(v_changed, ', ')
      using errcode = '42501';
  end if;

  -- Neither party to this offer. RLS should already have refused; belt and braces.
  raise exception 'job_offers: no permitted column scope for this actor'
    using errcode = '42501';
end;
$$;

comment on function public.enforce_job_offers_column_scope() is
  'BEFORE UPDATE guard on job_offers: per-actor column allowlist. Candidates may write status/decline_reason; employers may write ai_summary/ai_tags/right_to_work_confirmed*; service_role is unrestricted. Complements row-level RLS, which cannot express column scope.';

drop trigger if exists job_offers_column_scope_guard on public.job_offers;
create trigger job_offers_column_scope_guard
  before update on public.job_offers
  for each row
  execute function public.enforce_job_offers_column_scope();
