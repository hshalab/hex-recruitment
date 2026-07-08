-- SECURITY: job_alerts had an open "System can read active alerts for matching"
-- USING(true) SELECT policy + anon SELECT grant, exposing every candidate's alert
-- criteria. The matching job runs as service_role (bypasses RLS), so the open
-- policy isn't needed. Drop it and revoke anon; the existing own-row policies
-- ("Candidates can view/insert/update/delete own alerts") remain.
--
-- Applied to production 2026-07-08. (Table was empty at the time.)
drop policy if exists "System can read active alerts for matching" on public.job_alerts;
revoke select on public.job_alerts from anon;
