-- offer_audit_log: append-only event log for actions taken on a job offer
-- (currently withdraw/rescind, designed to absorb future events without
-- re-migration). schema_version stamps each row so future enum or column
-- evolutions don't lose the meaning of historical entries.
--
-- RLS: only employers see their own offers' events. Candidates do NOT get
-- direct table access — they receive a sanitised summary via a server-side
-- API endpoint that reads the row server-side and returns only the
-- candidate-safe fields (action + reason_code → human sentence).
-- reason_detail is forensic-only and never reaches a candidate.
--
-- Writes happen via the service-role server-side only; no INSERT/UPDATE/DELETE
-- policies for end users. Append-only — rows are never mutated after insert.

create table if not exists offer_audit_log (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references job_offers(id) on delete cascade,

  -- What happened. Three flavours map to the three modal scenarios.
  action text not null check (action in (
    'withdrawn',                  -- pre-counter-sign withdrawal — low-risk
    'rescinded_for_condition',    -- post-counter-sign with stated condition (RTW/refs/DBS/mutual/other)
    'rescinded_unconditional'     -- post-counter-sign with no carve-out — high-risk
  )),

  -- Who triggered the action and which side they're on.
  actor_user_id uuid not null references auth.users(id),
  actor_role text not null check (actor_role in ('employer', 'candidate', 'system')),

  -- Snapshot of the offer's status at the moment of the action so the log
  -- still reads correctly even if the offer's current status changes later.
  status_at_action text not null check (status_at_action in (
    'pending', 'accepted', 'declined', 'withdrawn', 'rescinded'
  )),

  -- For 'rescinded_for_condition': one of the dropdown values.
  -- For 'withdrawn' / 'rescinded_unconditional': null.
  reason_code text check (reason_code in (
    'failed_rtw',
    'failed_references',
    'failed_dbs',
    'mutual_agreement',
    'other'
  )),

  -- Free-text supplied with reason_code='other' or with unconditional rescind.
  -- Forensic only — never returned to the candidate.
  reason_detail text,

  -- Audit triple — same pattern as the signing flow.
  ip text,
  user_agent text,

  -- Schema versioning so the meaning of action / reason_code values can
  -- evolve without losing the original semantics for old rows.
  schema_version integer not null default 1,

  created_at timestamptz not null default now()
);

create index if not exists idx_offer_audit_log_offer_id
  on offer_audit_log(offer_id);

create index if not exists idx_offer_audit_log_actor
  on offer_audit_log(actor_user_id);

alter table offer_audit_log enable row level security;

-- Employer access only. Candidates are explicitly NOT given a SELECT policy;
-- they interact via /api/offers/[offerId]/status-summary which sanitises
-- before returning.
create policy "Employers read audit log for their own offers"
  on offer_audit_log for select
  using (exists (
    select 1 from job_offers
    where job_offers.id = offer_audit_log.offer_id
      and job_offers.employer_id = auth.uid()
  ));
