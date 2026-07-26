-- Phase 2 (onboarding nudges): per-candidate record of what we've already asked
-- for, so contextual prompts can rotate, respect a dismissal, and never nag the
-- same field twice.
--
-- One jsonb column read and written through a single helper (lib/nudges.ts),
-- deliberately mirroring notification_preferences / privacy_settings /
-- visibility_settings rather than inventing a new pattern — and deliberately
-- ONE canonical shape, after the flat-vs-nested notification-prefs repair.
--
-- Shape:
--   {
--     "shown":     { "<fieldKey>": "<ISO timestamp of last time shown>" },
--     "dismissed": { "<fieldKey>": <count of dismissals> },
--     "completed": { "<fieldKey>": "<ISO timestamp filled in>" },
--     "lastNudgeAt": "<ISO timestamp of the most recent nudge of any kind>"
--   }
--
-- Additive and nullable: NULL means "never nudged", which is the correct
-- starting state for every existing candidate. No backfill required.

alter table public.candidate_profiles
  add column if not exists nudge_state jsonb;

comment on column public.candidate_profiles.nudge_state is
  'Contextual-nudge bookkeeping: { shown, dismissed, completed, lastNudgeAt }. NULL = never nudged. Written only via lib/nudges.ts / /api/profile/nudge-state.';
