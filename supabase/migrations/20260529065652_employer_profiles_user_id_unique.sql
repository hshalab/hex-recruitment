-- Load-bearing for the upsert pattern used in:
--   app/api/auth/google/callback/route.ts  (gcal token persist)
--   app/api/calendar/regenerate-token/route.ts  (ics token regen)
--   lib/authCallback.ts  (defensive profile-row upsert on every auth callback)
--   app/auth/callback/employer/route.ts  (Google-OAuth signup profile create)
--   app/api/profile/create/route.ts       (free-tier signup profile create)
--   app/api/activate-trial/route.ts       (Stripe trial activation)
--
-- Without a unique constraint on user_id, PostgREST upserts that send
--   ON CONFLICT (user_id)
-- fail at the database layer with 42P10 "no unique or exclusion
-- constraint matching the ON CONFLICT specification". The Supabase
-- client's .upsert(..., { onConflict: 'user_id' }) emits exactly that
-- pattern, and the callers in this codebase only console.error the
-- failure rather than throwing — so the upserts have been silently
-- erroring in production. Empirical confirmation: of 9 employer-role
-- accounts, only 5 have employer_profiles rows, and those 5 were all
-- created via the settings/company page's plain INSERT path (which
-- doesn't use ON CONFLICT), not via any upsert.
--
-- Adding the constraint makes every existing upsert call site actually
-- work as intended, and is also the prerequisite for the defensive
-- upsert added to lib/authCallback.ts in this commit.
--
-- Safe to add: a pre-flight DISTINCT check confirmed all 5 existing rows
-- have unique non-NULL user_ids. The constraint won't reject any current
-- row.

ALTER TABLE public.employer_profiles
  ADD CONSTRAINT employer_profiles_user_id_key UNIQUE (user_id);
