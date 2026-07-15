# Candidate email verification — Option A (parked future phase)

**Status:** deliberately deferred, not dropped. Shipped instead: **Option B** —
keep Supabase's global email-confirmation ON, and replace the old dead-end
"check your email" screen with a strong holding screen (Resend + live count +
browse link). The email-link click remains the entry (it logs the candidate in
via the unchanged `/auth/confirm` → `lib/authCallback.ts` path).

## Why Option A is not built yet

Supabase's "Confirm email" is a **single global toggle**, and `email_confirmed_at`
is derived from it:

- **Confirm ON** (current): `signUp()` returns **no session** — we can't log the
  user in immediately. `email_confirmed_at` stays null until they click the link.
- **Confirm OFF**: `signUp()` returns a session, **but** Supabase auto-sets
  `email_confirmed_at` at creation — so it can't be used as an "unverified" signal,
  and there's effectively no verification left to enforce.

So "log them in immediately AND gate on `email_confirmed_at`" is not achievable
with the built-in toggle. And the toggle is global, so flipping it also affects
**employers**, whose provisioning (`provisionFoundingEmployer()` + subscription/
founding-row writes in `lib/authCallback.ts`) currently fires **on the confirm-link
click**. Turning confirmation off would give employers instant sessions that may
never traverse `/auth/confirm`, so provisioning wouldn't fire where it does today.

## The Option A plan (for when we do it)

True "browse-while-unverified, hard-gate at Apply":

1. **Turn Supabase "Confirm email" OFF** so `signUp()` returns a session (candidate
   is logged in immediately).
2. **Add our own verification flag** — `candidate_profiles.email_verified boolean
   default false` (nullable; existing rows backfill true or are treated as verified).
3. **Send our own verification email** at signup (Supabase `generateLink`/OTP or a
   custom token) — don't rely on the built-in confirm mail.
4. **Banner + Apply-gate key on `email_verified = false`** (NOT `email_confirmed_at`,
   which is now always set). Non-blocking banner in the logged-in state; hard gate
   only at Apply.
5. **Our `/auth/confirm` sets `email_verified = true`** and clears the banner.
6. **Move employer provisioning off the confirm-click** to signup / first-login,
   because turning the global toggle off removes the confirm-link step employers
   rely on. This is the main blast-radius item — scope it carefully and test the
   employer flow explicitly.

### Security invariant to preserve (both options)
An unconfirmed / unverified candidate must NOT be able to: apply to roles, message
employers, or appear in employer-facing candidate lists — until verified.
