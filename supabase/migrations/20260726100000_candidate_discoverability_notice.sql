-- Notify-then-flip bookkeeping for the existing candidates who are hidden by
-- an accident of the old default rather than by a choice they made.
--
-- The flip is deliberately a SECOND, separate step. This column is what makes
-- that second step safe: it records that we gave notice, when the window
-- closes, whether they opted out, and — afterwards — exactly who was flipped
-- and when. Without it the flip has no evidence that notice was ever given.
--
-- One jsonb column read and written through a single helper
-- (lib/discoverabilityNotice.ts), mirroring notification_preferences /
-- privacy_settings / visibility_settings / nudge_state rather than inventing
-- a new pattern.
--
-- Shape:
--   {
--     "notifiedAt":  "<ISO timestamp the notice email was sent>",
--     "deadlineAt":  "<ISO timestamp the opt-out window closes>",
--     "optedOutAt":  "<ISO timestamp they said keep me hidden>" | null,
--     "flippedAt":   "<ISO timestamp is_discoverable was set true>" | null,
--     "channel":     "email"
--   }
--
-- Additive and nullable: NULL means "never notified", which is the correct
-- starting state for every candidate, including the 13 excluded as too empty
-- to be worth showing an employer. No backfill.

alter table public.candidate_profiles
  add column if not exists discoverability_notice jsonb;

comment on column public.candidate_profiles.discoverability_notice is
  'Notify-then-flip bookkeeping: { notifiedAt, deadlineAt, optedOutAt, flippedAt, channel }. NULL = never notified. Written only via lib/discoverabilityNotice.ts. The flip step refuses to act on any row where this is NULL.';
