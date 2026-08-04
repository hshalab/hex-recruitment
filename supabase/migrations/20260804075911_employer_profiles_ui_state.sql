-- Per-account UI state for the employer dashboard.
--
-- Two things need a home and neither belongs in notification_preferences or
-- privacy_settings, which are about what we send and who can see them:
--
--   dashboardSeenAt   the "new since your last visit" anchor for the answer line
--   setupDismissedAt  the onboarding strip, whose dismissal persists per account
--
-- One jsonb column rather than two timestamptz columns, deliberately: the next
-- piece of dashboard UI state then has somewhere honest to live instead of
-- squatting in a column that means something else. This is intended to be the
-- last migration of its kind for this surface.
--
-- Additive and defaulted, so every existing row is immediately valid and no
-- backfill is required.
alter table public.employer_profiles
  add column if not exists ui_state jsonb not null default '{}'::jsonb;

comment on column public.employer_profiles.ui_state is
  'Per-account dashboard UI state. Known keys: dashboardSeenAt (ISO timestamp, the "new since last visit" anchor), setupDismissedAt (ISO timestamp, onboarding strip dismissal). Add keys here rather than new columns.';

notify pgrst, 'reload schema';
