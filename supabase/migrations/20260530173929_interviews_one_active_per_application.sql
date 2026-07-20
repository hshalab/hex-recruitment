-- Partial UNIQUE index enforcing "at most one ACTIVE interview per
-- application" at the database level. Backstop behind the
-- reuse-in-place pattern in components/ScheduleInterviewModal.tsx
-- (fix #1c, commit 25dbba29).
--
-- "Active interview" = status IN ('pending_selection','scheduled','confirmed').
-- The other three legal statuses (completed, cancelled, rescheduled)
-- represent terminal/superseded rows and are intentionally excluded
-- from the predicate — multiple of those can coexist per application
-- (e.g. an application's history of cancellations).
--
-- Preconditions verified before applying this migration:
-- 1. status CHECK enum was inspected (pg_constraint): only the three
--    listed states represent live interviews.
-- 2. All INSERT sites in components/ScheduleInterviewModal.tsx have
--    the findActiveInterviewSlot lookup prelude (fix #1c) so they
--    never INSERT a second active row for the same application.
-- 3. All UPDATE-to-active sites target a specific row by id
--    (book/route.ts:99, applications/page.tsx:349 + :563,
--    NotificationBell.tsx:151, simulator.ts:165) — they transition an
--    existing row's status, never produce a new one.
-- 4. The simulator at lib/simulator.ts is reachable via
--    /api/simulate/tick and /api/simulate/run but only UPDATEs by id;
--    safe under the index.
-- 5. Global pre-creation violation count: zero applications with
--    more than one active interview.
--
-- Plain CREATE (not CONCURRENTLY): pre-launch table, tiny row count.
-- No blocking concern.

CREATE UNIQUE INDEX interviews_one_active_per_application
  ON public.interviews (application_id)
  WHERE status IN ('pending_selection', 'scheduled', 'confirmed');

COMMENT ON INDEX public.interviews_one_active_per_application IS
  'Enforces at most one ACTIVE interview per application_id. Active = status IN (pending_selection, scheduled, confirmed). Cancelled / completed / rescheduled rows are excluded so they can coexist freely as historical records. See audit INTERVIEW_AUDIT_2026-05-30.md fix #1d.';
