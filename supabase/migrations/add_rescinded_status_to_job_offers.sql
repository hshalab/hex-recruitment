-- Extend job_offers.status to include 'rescinded' (post-counter-sign
-- termination), distinct from 'withdrawn' (pre-counter-sign termination).
-- The candidate's review page branches on this distinction to show
-- appropriate copy — withdraw is low-impact (offer never became binding),
-- rescind is high-impact (a binding contract was terminated).
--
-- Existing rows already use the four legacy values; this migration only
-- widens the constraint, never narrows it. No data backfill needed.

alter table job_offers
  drop constraint if exists job_offers_status_check;

alter table job_offers
  add constraint job_offers_status_check
  check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'rescinded'));
