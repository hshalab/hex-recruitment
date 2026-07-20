-- Failure-capture column for Google Calendar event-creation attempts.
--
-- Pre-existing behaviour: lib/googleCalendar.ts returned null on every
-- Google API failure (401, 403, 404, 5xx, network errors) and the
-- callers in app/api/calendar/{book,update-event}/route.ts only
-- console.error'd, leaving interview_bookings.gcal_event_id_employer
-- as NULL with no record of why. Pattern: same silent-fail shape as
-- the no_profile bug.
--
-- New behaviour (this commit): lib/googleCalendar.ts now throws on
-- unexpected failures; callers catch the error and write the message
-- here so we have a queryable trail of which bookings need a retry /
-- diagnosis. Bookings still SUCCEED on gcal failure — the interview
-- is real and important, the calendar sync is supporting infra.
-- gcal_event_id_employer stays NULL on failure; the presence of a
-- value in gcal_sync_error is the "needs attention" signal.
--
-- Nullable. RLS unchanged (existing policies cover this column;
-- service-role writes from the route handlers are the only producers).

ALTER TABLE public.interview_bookings
  ADD COLUMN gcal_sync_error TEXT;

COMMENT ON COLUMN public.interview_bookings.gcal_sync_error IS
  'Captures the Google Calendar API error message when event creation/update fails. NULL means either no failure or no attempt made. Queryable via: SELECT id, gcal_sync_error FROM interview_bookings WHERE gcal_sync_error IS NOT NULL;';
