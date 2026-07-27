-- Watermark for the "new jobs in your areas" digest.
--
-- One timestamp per candidate rather than a per-job send log: the guarantee we
-- need ("never send the same job twice") follows from a monotonic watermark —
-- each run selects jobs created strictly after it — with no join and no row
-- growth. A send log's real value is auditing, which the cron's JSON response
-- and Resend's own delivery log already cover at this volume.
--
-- NULL means "never sent". The route treats that as a bounded first-run
-- lookback, NOT as "everything ever posted" — otherwise a candidate's first
-- digest would list all 246 active jobs.
alter table public.candidate_profiles
  add column if not exists last_digest_sent_at timestamptz;

comment on column public.candidate_profiles.last_digest_sent_at is
  'Last "new jobs in your areas" digest send. Jobs created after this are eligible for the next one. NULL = never sent (bounded first-run lookback applies).';
