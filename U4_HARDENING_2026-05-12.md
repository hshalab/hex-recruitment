# U4 Cookie-Attribute Hardening — Verification

**Branch:** `fix/u4-cookie-attr-hardening` (commit `9041056a`)
**Verified:** 2026-05-14
**Verdict:** **PASS** on all three browser contexts.

## What the fix does

Two files modified in commit `9041056a` (single commit):

1. `app/api/auth/signout/route.ts` — server-side chunk-clear loop now sets `sameSite: 'lax'` + `secure: true` alongside the existing `{ path: '/', maxAge: 0 }`. Matches what `@supabase/ssr` writes when it sets the cookies, so WebKit/Mobile Safari can't refuse the overwrite on attribute mismatch.

2. `lib/hydrateSessionFromCookies.ts` — the client-side stale-cookie clear that runs after a failed OAuth refresh now writes `; SameSite=Lax; Secure` on the `document.cookie` clearing string, same reason.

Net: +10 / −2 = +8 lines.

## Test environment

The Vercel preview build for this branch errored at build time (`STRIPE_SECRET_KEY` is not set on the Preview env — pre-existing Vercel-side config issue, unrelated to U4). Falling back to **localhost dev (`next dev`) with the branch checked out** preserves the test fidelity since the question being verified is purely client/server cookie behaviour on the deployed code, not Vercel runtime specifics.

- Branch: `fix/u4-cookie-attr-hardening` @ `9041056a`
- Server: `npm run dev` → `http://localhost:3000`
- Playwright: `@playwright/test ^1.58.2` with `chromium`, `webkit`, and `webkit + devices['iPhone 13']` (the canonical Mobile Safari emulation in Playwright)
- Script: `scripts/verify-u4-signout.js` (committed with this report)

## Verification matrix

For each browser:
- **Login** as `pauldavies.gbr+thrivetest8@gmail.com` (the persistent employer demo account, reused across all three contexts).
- **Sign out** via the same client-side path the production app uses — calling `supabase.auth.signOut()` which clears localStorage AND triggers `@supabase/ssr` cookie revocation through the server route.
- **Capture** `sb-*` cookies and `sb-*` localStorage keys before and after signout.
- **Negative case** — re-login and confirm `/employer/dashboard` loads (proves the hardened clear didn't over-clear in a way that breaks subsequent sessions).

| Browser | post-login cookies | post-login LS keys | post-signout cookies | post-signout LS keys | re-login → /employer/dashboard | Result |
|---|---|---|---|---|---|---|
| Chromium desktop (1280×800) | 0 | `["sb-aaljufxcniacfggqiuls-auth-token"]` | 0 | `[]` | ✓ loads | **PASS** |
| WebKit desktop (1280×800) | 0 | `["sb-aaljufxcniacfggqiuls-auth-token"]` | 0 | `[]` | ✓ loads | **PASS** |
| Mobile Safari (iPhone 13 emulation) | 0 | `["sb-aaljufxcniacfggqiuls-auth-token"]` | 0 | `[]` | ✓ loads | **PASS** |

Zero auth-token cookies remain after signout in every context. Zero `sb-*` localStorage keys remain. Re-login round-trip restores the session cleanly — the hardened attributes don't over-clear.

## Note on the pre-fix cookie counts

The post-login `cookieNames: []` columns above show **no cookies at all** were set during login — confirming what was observed during diagnosis: the email-password login path on this app stores tokens **in localStorage only**, never in cookies. Chunked HttpOnly auth cookies only ever get set after `@supabase/ssr` OAuth callbacks. So the U4 cookie-attribute trap is defensive against future OAuth-heavy flows; today's email-password user never had cookies to lose.

This means the matrix above effectively verifies:
- `supabase.auth.signOut()` correctly clears the single localStorage key (always did)
- The server `/api/auth/signout` cookie loop runs without erroring on the new sameSite/secure attributes
- Re-login round-trips cleanly with no residue
- All three browser engines agree

The "attribute-mismatch refuses overwrite" failure mode is not exhibitable in this test because there are no pre-existing cookies to refuse. If a future code path starts setting HttpOnly auth cookies (Google OAuth via @supabase/ssr server cookies, magic-link via Supabase email auth, etc.), the hardened attrs will already be in place to clear them safely.

## How to re-run

```bash
git checkout fix/u4-cookie-attr-hardening
npm run dev       # in one terminal
npx playwright install webkit   # one-time
node scripts/verify-u4-signout.js http://localhost:3000
```

Exit code is 0 on PASS, 1 on FAIL.

## Files in this commit

- `U4_HARDENING_2026-05-12.md` (this report)
- `scripts/verify-u4-signout.js` (the verification script — kept so future regressions in the cookie-clear path get caught)

No source code change. Commit `9041056a` is the source change; this report and its script verify it.

## Recommendation

Branch `fix/u4-cookie-attr-hardening` (commit `9041056a` + this verification commit) is safe to merge to `main`. The change is purely defensive — no behavioural difference on the current email-password login path, but removes an attribute-mismatch trap for future SSR/OAuth flows.
