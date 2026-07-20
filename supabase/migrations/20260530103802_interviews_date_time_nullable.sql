-- Make interview_date / interview_time NULLABLE so "not yet scheduled"
-- can be an honest state (NULL + status='pending_selection') rather
-- than a fake placeholder (today's date + '00:00').
--
-- Audit context (INTERVIEW_AUDIT_2026-05-30.md, bug b, fix #1b):
-- components/ScheduleInterviewModal.tsx's handleSendSelfSchedule
-- inserted new interview rows for the "invite candidate to self-
-- schedule" flow with literal placeholders:
--   interview_date: new Date().toISOString().slice(0, 10), // placeholder
--   interview_time: '00:00',
-- In the normal flow, /api/calendar/book then UPDATEs these to real
-- values when the candidate picks a slot. But if the candidate never
-- self-schedules (or any path flips status to 'confirmed' without
-- updating date/time), the placeholder persists and masquerades as
-- a real interview date in emails, notifications, and downstream
-- gcal sync. Today's prod data had Gianna Lorandi receiving an
-- "Interview Updated" notification for "Wed 6 May 2026 at 00:00:00"
-- because of exactly this row.
--
-- After this migration, the same code paths insert NULL instead of
-- placeholders, and every reader explicitly gates on
-- (status === 'pending_selection' || date == null) to render
-- "Awaiting scheduling" rather than a fabricated date.
--
-- No data backfill needed — existing placeholder rows continue to
-- carry their fake values, but the new render gates handle them via
-- the status check anyway. Cleaning the existing rows is a separate
-- operational task, deliberately deferred to fix #1c alongside the
-- partial UNIQUE index migration.

ALTER TABLE public.interviews
  ALTER COLUMN interview_date DROP NOT NULL;

ALTER TABLE public.interviews
  ALTER COLUMN interview_time DROP NOT NULL;
