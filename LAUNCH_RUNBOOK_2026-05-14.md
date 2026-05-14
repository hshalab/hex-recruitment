# Launch Runbook — 2026-05-14

Pre-launch verification of every external system thrivecareer.co.uk depends on.
Doc-only. No fixes applied. Each section ends with a **GO / NO-GO / NEEDS-MANUAL-STEP** verdict against an explicit launch gate.

Verification mode is inspect-only:
- Resend: no test sends (free-tier exhaustion risk)
- Stripe: no test events (LIVE mode)
- Postcoder: single 1-credit live lookup performed (no other test calls)
- All other reads are list/status endpoints

---

## 1. DNS — `thrivecareer.co.uk`

Gate: apex + www both point at Vercel, SSL cert valid ≥ 30 days out.

| Check | Method | Result |
|---|---|---|
| Apex A record | `nslookup thrivecareer.co.uk 8.8.8.8` | `216.198.79.1` — Vercel anycast IP |
| www CNAME | `nslookup www.thrivecareer.co.uk 8.8.8.8` | `0d71605dfe7215f2.vercel-dns-017.com.` → `216.198.79.65`, `64.29.17.65` (both Vercel) |
| SSL cert subject | `openssl s_client` | `CN=thrivecareer.co.uk` |
| SSL issuer | `openssl s_client` | Let's Encrypt R13 |
| SSL `notBefore` | cert inspection | 2026-04-29 |
| SSL `notAfter` | cert inspection | 2026-07-28 (≈ 75 days from today) |

Verdict: **GO**. Both records resolve to Vercel, certificate is valid through 2026-07-28 — comfortably past the 30-day gate.

Side note: `vercel domains inspect thrivecareer.co.uk` returns 403 ("you don't have access") on this scope — known issue, not blocking. Direct DNS + cert inspection above is authoritative.

---

## 2. Resend — transactional email

Gate: domain verified, SPF + DKIM verified, sender is the verified domain (not `onboarding@resend.dev`).

Inspect-only — no test send was attempted (per launch-checklist instruction; free-tier quota suspect).

| Check | Method | Result |
|---|---|---|
| Sender address in code | `lib/email.ts:10` | `Thrive <noreply@thrivecareer.co.uk>` — verified domain ✓ |
| Domain `thrivecareer.co.uk` registered | `GET /domains` | `status: verified`, `region: eu-west-1`, `sending: enabled` |
| DKIM record (`resend._domainkey` TXT) | `GET /domains/{id}` | `status: verified` |
| SPF MX record (`send` MX) | `GET /domains/{id}` | `status: verified` |
| SPF TXT record (`send` TXT) | `GET /domains/{id}` | `status: verified` |
| DMARC record (`_dmarc.thrivecareer.co.uk`) | `nslookup -type=TXT` | **Non-existent domain — no DMARC published** |
| Real-world delivery (recent send) | `GET /emails?limit=1` | Last send 2026-05-14 12:24 UTC, `last_event: delivered` — sender `Thrive <noreply@thrivecareer.co.uk>`, recipient was an E2E test address |

Verdict: **GO** for launch. Sending is provably working in the last hour (E2E test email delivered). All three records Resend manages are verified.

Open item (not blocking): **DMARC is not published.** SPF + DKIM alignment is sufficient for Gmail/Microsoft to accept, but a `_dmarc` TXT record (`v=DMARC1; p=none; rua=...`) is best practice for deliverability monitoring. Post-launch cleanup.

---

## 3. Stripe webhook

Gate: production endpoint `https://thrivecareer.co.uk/api/stripe/webhook` registered in Stripe LIVE mode, `STRIPE_WEBHOOK_SECRET` set on Vercel Production.

Inspect-only — no test events sent (LIVE mode).

| Check | Method | Result |
|---|---|---|
| Handler route exists | `app/api/stripe/webhook/route.ts` | Present — `POST` with `stripe.webhooks.constructEvent` signature verification |
| `STRIPE_WEBHOOK_SECRET` on Vercel Production | `vercel env ls production` | Listed, created 74d ago (existence confirmed; value is "Sensitive" / write-only — can't read via CLI) |
| Endpoint registered on Stripe | `GET /v1/webhook_endpoints` (LIVE key) | URL `https://thrivecareer.co.uk/api/stripe/webhook`, `status: enabled`, `api_version: 2026-01-28.clover` |
| Subscribed events | (same) | 6: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed` |
| Handler covers all critical events | code read | Handles 4 of 6 (`checkout.session.completed`, `customer.subscription.{updated,deleted}`, `invoice.payment_failed`). `customer.subscription.created` and `invoice.payment_succeeded` hit the default `break` — silent 200, no error |

Verdict: **GO**. Endpoint URL matches prod hostname, status enabled, secret present. The two events that fall through to default are intentional no-ops (sub creation is already persisted in `checkout.session.completed`; payment_succeeded doesn't change any tracked state).

---

## 4. Google OAuth

Two distinct OAuth flows exist in this app; both audited separately.

### 4a. Sign-in with Google (Supabase-mediated)

Gate: button kicks off `supabase.auth.signInWithOAuth` with redirect into a real callback route on the prod domain.

| Check | Method | Result |
|---|---|---|
| Sign-in button | `components/GoogleSignInButton.tsx:36-42` | Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${siteUrl}/auth/callback/${role}` } })` |
| `NEXT_PUBLIC_BASE_URL` on Vercel Production | `vercel env pull` | Present (74d), drives `siteUrl` |
| App-side callback routes | filesystem | `app/auth/callback/employer/route.ts` ✓, `app/auth/callback/employee/route.ts` ✓ |
| Google → Supabase redirect URI | (Supabase dashboard — not CLI-readable) | **Cannot verify from terminal.** Supabase Auth → Providers → Google holds the client_id / secret and the redirect URI `https://aaljufxcniacfggqiuls.supabase.co/auth/v1/callback`, which is what Google sees. The GCP OAuth client must whitelist this exact URI |
| Google Cloud OAuth client redirect URI whitelist | (GCP Console — not CLI-readable) | **Cannot verify from terminal.** |

Sub-verdict: **NEEDS-MANUAL-STEP** — code paths are correct, but Supabase Auth provider config and GCP redirect-URI whitelist are dashboard-only. A real sign-in attempt with a fresh Google account is the canonical test.

### 4b. Google Calendar integration (interview booking)

Gate: distinct OAuth client uses env-var redirect URI, both sides match.

| Check | Method | Result |
|---|---|---|
| `GOOGLE_CLIENT_ID` on Vercel Production | `vercel env pull` | Present |
| `GOOGLE_CLIENT_SECRET` on Vercel Production | `vercel env ls` | Present (35d) |
| `GOOGLE_REDIRECT_URI` on Vercel Production | `vercel env pull` | `https://thrivecareer.co.uk/api/auth/google/callback` |
| Redirect URI in code | `app/api/auth/google/route.ts:69`, `app/api/auth/google/callback/route.ts:58` | Both derive `${origin}/api/auth/google/callback` from `x-forwarded-host` — matches env on prod |
| App-side callback route | filesystem | `app/api/auth/google/callback/route.ts` ✓ |

Sub-verdict: **GO** for code + env. GCP-side whitelist still has to include this same URI in the Calendar OAuth client; same dashboard-only caveat as 4a.

### 4c. OAuth consent screen publish status — CRITICAL

Gate: consent screen status is **In Production** (PUBLISHED), not **Testing**. In Testing mode, only users on the explicit test-user list can sign in — every other Google account gets a `403 access_denied` error.

| Check | Method | Result |
|---|---|---|
| Consent screen publish status | (GCP Console — APIs & Services → OAuth consent screen) | **CANNOT VERIFY FROM CLI.** No public API exposes this. |

Sub-verdict: **NEEDS-MANUAL-STEP — own gate**. Before launch, open https://console.cloud.google.com/apis/credentials/consent for the project that owns the OAuth clients (one for Sign-in with Google, one for Calendar) and confirm the **Publishing status** banner shows **In production**, not **Testing**. If it shows Testing, click **Publish App** and proceed through Google's verification flow (no immediate Google review needed for basic scopes; calendar.events requires verification). **A "Testing" status here will silently break sign-in for every Google account that isn't on the test list.**

---

## 5. B2 — anon EXECUTE revoked on SECURITY DEFINER notification RPCs

Gate: none of the 10 RPCs locked down by migration `20260503120000_revoke_anon_execute_notification_rpcs.sql` (shipped as commit `7a74deee`) still have `anon` or `PUBLIC` in their `EXECUTE` grantee list.

Method: query `pg_proc.proacl` via `aclexplode()` in the prod database (project `aaljufxcniacfggqiuls`).

| Function | `prosecdef` | Current EXECUTE grantees | Expected | Match |
|---|---|---|---|---|
| `create_notification(uuid,text,text,text,text,text,text)` | SECURITY DEFINER | `postgres`, `service_role` | (no anon/PUBLIC/authenticated) | ✓ |
| `notify_new_application(uuid,text,text,text)` | SECURITY DEFINER | `postgres`, `service_role` | (no anon/PUBLIC/authenticated) | ✓ |
| `notify_new_message(uuid,text,text)` | SECURITY DEFINER | `postgres`, `service_role` | (no anon/PUBLIC/authenticated) | ✓ |
| `notify_profile_viewed(uuid,text)` | SECURITY DEFINER | `postgres`, `service_role` | (no anon/PUBLIC/authenticated) | ✓ |
| `notify_application_status_change()` | SECURITY DEFINER | `postgres`, `service_role` | (no anon/PUBLIC/authenticated) | ✓ |
| `handle_new_user()` | SECURITY DEFINER | `postgres`, `service_role` | (no anon/PUBLIC/authenticated) | ✓ |
| `increment_application_count(uuid)` | SECURITY DEFINER | `postgres`, `service_role` | (no anon/PUBLIC/authenticated) | ✓ |
| `increment_job_views(uuid)` | SECURITY DEFINER | `authenticated`, `postgres`, `service_role` | (authenticated kept; no anon/PUBLIC) | ✓ |
| `increment_review_helpful(uuid)` | SECURITY DEFINER | `authenticated`, `postgres`, `service_role` | (authenticated kept; no anon/PUBLIC) | ✓ |
| `decrement_review_helpful(uuid)` | SECURITY DEFINER | `authenticated`, `postgres`, `service_role` | (authenticated kept; no anon/PUBLIC) | ✓ |

All 10 match expected post-migration state. No `anon` and no `PUBLIC` in any grantee list.

Trigger-fired functions (`notify_application_status_change`, `handle_new_user`) still execute correctly because triggers run as function owner regardless of EXECUTE grants — confirmed by the migration's own note and unchanged in the live state.

Verdict: **GO**. The B1 lockdown is in effect; the residual DROP cleanup is post-launch (≥30 days, backlog memory `backlog_drop_dead_notification_rpcs`).

---

## 6. Metered-service credit / quota sweep

Gate: no service is **EXHAUSTED**. EXHAUSTED on any user-facing dependency is a hard launch blocker.

| Service | Status | Evidence |
|---|---|---|
| **Resend** | **OK** | Real send delivered 2026-05-14 12:24 UTC; no quota indicator in response but `sending: enabled` and recent `last_event: delivered`. Free tier (3k/mo) almost certainly not exhausted given send volume. |
| **Postcoder** | **EXHAUSTED-OR-DISABLED — HARD BLOCKER** | `GET https://ws.postcoder.com/pcw/{key}/address/uk/SW1A1AA` returns `HTTP 403 Forbidden` from both direct API and the prod `/api/lookup-postcode` route (proxied 403 → 502). Postcoder uses key-in-URL; 403 means the key is being rejected (quota exhausted, account suspended, or key revoked). **Address-lookup is broken in production** — candidates trying to use the postcode autocomplete on signup get a 502. Manual address typing still works as fallback, but this is a known-suspect from the launch brief and the 403 confirms it. |
| **Firecrawl** | **OK** | `GET /v1/team/credit-usage` → `remaining_credits: 1016`, `plan_credits: 1000`, billing window ends 2026-06-11. Fresh window, plenty of headroom. |
| **Anthropic** | **OK** | `GET /v1/models` returns 200 with valid model list, key authenticates. Usage endpoint not exposed without admin scope, so absolute spend isn't visible — but reachability and auth are confirmed. The key is used by Ask-Thrive, CV builder, and job-ad generator. |
| **Cloudinary** | **N/A** | Grep across `app/`, `lib/`, `components/`, `package.json` returns zero matches for `cloudinary` / `Cloudinary` / `CLOUDINARY`. Not in use in this codebase. |

Verdict on section: **NO-GO until Postcoder resolved.** Per the brief criteria ("EXHAUSTED = hard launch blocker"), the 403 from Postcoder is a NO-GO. Mitigations the user can choose between, listed for completeness (no action taken):
- top up / reactivate the Postcoder account, OR
- swap to the alternative postcode provider whose key is already on file in `.env.local` (`GETADDRESSES_API_KEY`) — but no code path currently uses it (the lookup route is hard-wired to Postcoder), so this would require a code change, OR
- accept manual address entry as the launch experience and disable the autocomplete UI.

The 502 from the prod route is real and reproducible right now.

---

## Overall launch readiness

| # | Section | Verdict |
|---|---|---|
| 1 | DNS + SSL | **GO** |
| 2 | Resend transactional email | **GO** (DMARC missing — non-blocking) |
| 3 | Stripe webhook | **GO** |
| 4a | Google OAuth (Sign-in) — code + env | GO; **4c CONSENT-SCREEN STATUS = NEEDS-MANUAL-STEP — own gate** |
| 4b | Google OAuth (Calendar) — code + env | **GO** |
| 4c | Google OAuth consent screen publish status | **NEEDS-MANUAL-STEP (critical)** |
| 5 | B2 — anon EXECUTE revoked on 10 SECURITY DEFINER RPCs | **GO** |
| 6 | Metered service credits | **NO-GO** — Postcoder 403 (HARD BLOCKER) |

**Overall: NO-GO.**

Two items must clear before launch:
1. **Postcoder 403 resolved** (section 6) — hard blocker.
2. **OAuth consent screen confirmed In Production** (section 4c) — silent breakage risk for every non-test-list Google account.

Everything else is GO. No source code change recommended in this pass — all findings are configuration / external-service state, not bugs in the app code.
