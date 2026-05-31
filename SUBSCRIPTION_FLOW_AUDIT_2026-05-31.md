# Employer Subscription / Job-Posting Gate Audit — 2026-05-31

Read-only audit. No application code touched. Same evidence rules as the interview audit: code paths get a file:line citation; runtime claims are backed by either a Supabase row or a live observation (Playwright on prod thrivecareer.co.uk).

## TL;DR

The reported symptoms — wrong post-job redirect, contradictory subscription-page copy, throbbing, and an apparent bounce to /subscribe — are surface effects of a **single underlying problem: `employer_subscriptions.subscription_status` in Supabase has drifted from the truth in Stripe.** It's drifted in BOTH directions on the test accounts.

| Account | DB says | Stripe actually says | Direction |
|---|---|---|---|
| pauldavies.gbr@gmail.com (Amazon) | `trialing` (active until 2026-10-17) | `canceled` since 2026-05-02 | **Entitlement-leak** — DB says paid, Stripe says no |
| pauldavies.gbr+thrivetest8@gmail.com (Ember) | `canceled` | Customer + subscription DO NOT EXIST in Stripe (test data wiped) — DB pointing at ghost ids | **Wrong-direction lockout** — gates a user whose Stripe state is actually "no record" |

The gate code reads only DB, never Stripe, and one route — [`/api/activate-trial`](app/api/activate-trial/route.ts) — bypasses Stripe entirely and unilaterally writes `subscription_status='trialing'`, which is how the main account ended up trialing-without-Stripe. The webhook is wired correctly but two Stripe events in recent history show `pending_webhooks=1` (never successfully delivered), and there is no reconciliation job to catch DB↔Stripe drift after the fact. **This is the money-flow / entitlement bug under all the visible symptoms — fix order should put it first.**

## Test-data anchors (queried this session)

| Actor | user_id | DB sub_status | DB stripe_customer_id | DB stripe_subscription_id | DB trial_ends_at | DB sub_updated |
|---|---|---|---|---|---|---|
| Amazon employer | `78d9038b-…` | `trialing` | **NULL** | `sub_1TNSqm…` | 2026-10-17 | 2026-05-07 17:10 |
| Ember (+thrivetest8) | `277c20ae-…` | `canceled` | `cus_UTQwmJAfwIGlFd` (ghost) | `sub_1TUU6R…` (ghost) | 2026-08-06 | 2026-05-10 18:26 |
| Test employer (+thrive-test4) | `1add55e0-…` | `inactive` | NULL | NULL | NULL | 2026-05-07 17:10 |

Stripe (test mode, `livemode=false`) verified directly:

- `sub_1TNSqm42euar6HpIih75QB5z` → exists, **`status=canceled`, canceled_at=2026-05-02T06:09:04Z**, customer=`cus_UMB9ZYfK5JKqaH` (NOT what DB stored), metadata.supabase_user_id matches `78d9038b-…` ✓
- `sub_1TUU6R3JsLAlS7ofPMC0H9Fw` → **`No such subscription`**
- `cus_UTQwmJAfwIGlFd` → **`No such customer`**

Pending webhooks (events Stripe knows about but couldn't deliver successfully):
- `2026-05-24T12:58:13Z` — `customer.subscription.deleted` for `sub_1T3yTg…` — **`pending_webhooks: 1`**
- `2026-05-19T20:49:57Z` — `invoice.payment_succeeded` — **`pending_webhooks: 1`**

Two Stripe events have been waiting to deliver for 7–12 days. This is the operational signal of the webhook lifeline failing intermittently.

---

## Part A — page/route inventory

### Subscription-related pages

| Route | File | Audience | What it renders | Notes |
|---|---|---|---|---|
| **`/subscribe`** | [`app/subscribe/page.tsx`](app/subscribe/page.tsx) | Public marketing/signup | "Create your account" form + plan card. On submit: signs up if needed → calls `/api/activate-trial` → redirects to `/post-job`. | The "Create Your Account" page. Allows logged-in users to use it too — re-activates trial unilaterally. |
| **`/dashboard/subscription`** | [`app/dashboard/subscription/page.tsx`](app/dashboard/subscription/page.tsx) | Logged-in employer | Subscription status, trial countdown, "Manage Billing" link (to Stripe portal), pricing card if no active sub. | The "Manage your plan and billing" page — has the double-state bug. |
| **`/dashboard/subscription/success`** | [`app/dashboard/subscription/success/page.tsx`](app/dashboard/subscription/success/page.tsx) | Post-checkout return | "Welcome / subscription confirmed" page. | Stripe `success_url` target. |
| **`/dashboard/subscription/cancel`** | [`app/dashboard/subscription/cancel/page.tsx`](app/dashboard/subscription/cancel/page.tsx) | Cancellation flow | Cancellation confirmation copy + "14 days' cancellation notice". | Cancellation copy here ≠ `/dashboard/subscription` ("Cancel anytime") — see Part E. |
| **`/settings/subscription`** | [`app/settings/subscription/page.tsx`](app/settings/subscription/page.tsx) | Logged-in employer (settings area) | Another subscription view inside settings. | **Duplicates `/dashboard/subscription`** — overlap flagged in the launch-runbook backlog. |
| **`/settings/subscription/payment`** | [`app/settings/subscription/payment/page.tsx`](app/settings/subscription/payment/page.tsx) | Card-collection step | Stripe Elements form for adding payment method. | |
| **`/register/employer/payment`** | [`app/register/employer/payment/page.tsx`](app/register/employer/payment/page.tsx) | Post-signup employer | Payment / plan setup during signup. | |
| **`/admin/subscriptions`** | [`app/admin/subscriptions/page.tsx`](app/admin/subscriptions/page.tsx) | Admin only | Admin view of all employer subscriptions. | |
| **`/api/admin/subscriptions`** | [`app/api/admin/subscriptions/route.ts`](app/api/admin/subscriptions/route.ts) | Admin API | Reads from `employer_subscriptions`. | |
| **`/api/subscription/create`** | [`app/api/subscription/create/route.ts`](app/api/subscription/create/route.ts) | Server API | Subscription-record creation endpoint. | |

### Stripe API routes

| Route | File | Purpose |
|---|---|---|
| `/api/stripe/webhook` | [`app/api/stripe/webhook/route.ts`](app/api/stripe/webhook/route.ts) | **Stripe → DB sync.** Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. |
| `/api/stripe/create-checkout-session` | [`app/api/stripe/create-checkout-session/route.ts`](app/api/stripe/create-checkout-session/route.ts) | Creates a Stripe Checkout in subscription mode. `cancel_url: /subscribe` (!). |
| `/api/stripe/create-portal-session` | [`app/api/stripe/create-portal-session/route.ts`](app/api/stripe/create-portal-session/route.ts) | Stripe customer portal session. |
| `/api/stripe/setup-trial` | [`app/api/stripe/setup-trial/route.ts`](app/api/stripe/setup-trial/route.ts) | SetupIntent for card collection without immediate charge. |
| `/api/stripe/confirm-trial` | [`app/api/stripe/confirm-trial/route.ts`](app/api/stripe/confirm-trial/route.ts) | Finalises trial after card setup. |
| `/api/stripe/{create-boost-checkout,activate-boost,create-boost-intent}` | …`/api/stripe/...` | One-off job-boost payments (separate flow). |

### Non-Stripe activation route — **load-bearing for the bug**

| Route | File | What it does | Risk |
|---|---|---|---|
| **`/api/activate-trial`** | [`app/api/activate-trial/route.ts`](app/api/activate-trial/route.ts) | **Unconditionally upserts `employer_subscriptions` with `subscription_status='trialing'` keyed on user_id.** Does NOT consult Stripe. Called from [`app/subscribe/page.tsx:312-323`](app/subscribe/page.tsx#L312-L323). | **HIGH.** Lets a user who hits `/subscribe` while logged in (even with a Stripe-canceled state) reset their DB row to `trialing` — manufacturing entitlement without any payment commitment. |

### Overlap / duplication

- `/dashboard/subscription` and `/settings/subscription` render essentially the same data with similar UX. Reach-from-where differs (header nav vs settings nav) but contents overlap.
- `/subscribe` (public) and `/dashboard/subscription` (logged-in) both have "start your trial" CTAs but write through different routes (`/api/activate-trial` vs `/api/stripe/create-checkout-session`). The first bypasses Stripe; the second goes through it. **A logged-in employer can be sent through EITHER, depending on which link they click, and the resulting DB state differs.**

---

## Part B — the gate

Three actions share the same gate:

| Action | File:line | Check | If false → redirect |
|---|---|---|---|
| Post a job | [`app/post-job/page.tsx:114-121`](app/post-job/page.tsx#L114) + [`:659-661`](app/post-job/page.tsx#L659) | `subscription_status IN ('active','trialing')` on `employer_subscriptions` | `/dashboard/subscription?from=post-job` |
| Open messages | [`app/messages/page.tsx:491-493`](app/messages/page.tsx#L491) | same | `/dashboard/subscription` |
| Browse candidates | [`app/candidates/page.tsx:253-263`](app/candidates/page.tsx#L253) + [`:446-447`](app/candidates/page.tsx#L446) | same | `/dashboard/subscription` |

**Gate map:**

```
            ┌─ employer_subscriptions.subscription_status
action  ────┤    IN ('active','trialing') ?
            └─ NO → router.push('/dashboard/subscription')
```

The gate reads ONLY from `employer_subscriptions`. It does NOT consult Stripe at runtime. It does NOT consult `employer_profiles.subscription_status` (which exists separately and disagreed for both test accounts — see Part D).

**Consequences:**

- If DB drifts behind Stripe ("Stripe canceled, DB still says trialing") → gate WRONGLY lets a canceled user in. Entitlement leak. This is **pauldavies.gbr@gmail.com today.**
- If DB drifts ahead of Stripe ("DB says canceled, Stripe has nothing/state was wiped") → gate WRONGLY locks out a user who's mid-checkout or whose Stripe record disappeared. **+thrivetest8 today.**

Both are facets of the same root issue: **no source-of-truth invariant between DB and Stripe.**

---

## Part C — root cause of reported bugs

### (a) Back-link lands on `/subscribe` — NOT REPRODUCED on test employer (file:line cited; reproduction hypothesis)

[`app/dashboard/subscription/page.tsx:331-333`](app/dashboard/subscription/page.tsx#L331):

```tsx
<div className={styles.backLink}>
  <Link href="/dashboard">&#8592; Back to Dashboard</Link>
</div>
```

The Link target is `/dashboard`. Then [`app/dashboard/page.tsx:192-194`](app/dashboard/page.tsx#L192) + [`:258`](app/dashboard/page.tsx#L258) redirects employer-role users to `/employer/dashboard`. [`app/employer/dashboard/page.tsx`](app/employer/dashboard/page.tsx) has no subscription gate at the page-level (verified via grep).

I drove this live as `+thrive-test4` (DB temporarily flipped to `canceled` to reproduce the symptom state). The click landed cleanly at `/employer/dashboard`. **Not at `/subscribe`.**

The bug as reported may be either:
- An older version of the page that I'm not seeing (the deploy on prod actually matches the code I'm reading at HEAD = `ffd179a3`).
- The user misreading the URL bar — `/dashboard/subscription` (logged-in) and `/subscribe` (public) are visually similar segments.
- A code path I haven't found that triggers between the dashboard mount and the page settling — e.g. a SessionGuard race. SessionGuard ([`components/SessionGuard.tsx:25-27`](components/SessionGuard.tsx#L25)) only runs on auth pages (`/`, `/login/*`, `/register/*`), so it shouldn't fire on `/employer/dashboard`.

**Verdict:** unable to reproduce against the live deploy. If the user can re-screen the bounce and capture the URL chain (DevTools Network → preserve log), I'll know which redirect is taking them off-path. Best guess until then: the **`cancel_url` in `/api/stripe/create-checkout-session` IS `/subscribe`** ([`app/api/stripe/create-checkout-session/route.ts:91`](app/api/stripe/create-checkout-session/route.ts#L91)). If the user clicked into Stripe Checkout then hit the cancel arrow, Stripe routes them BACK to `/subscribe` — and they remember that URL when describing the bounce. This is a real bug (`cancel_url` should be `/dashboard/subscription`, not the public signup page) but it's not literally the "Back to Dashboard" link's behavior.

### (b) Double state — "Start your trial" + "Resubscribe to continue" rendering simultaneously — REPRODUCED LIVE

[`app/dashboard/subscription/page.tsx:198-203`](app/dashboard/subscription/page.tsx#L198):

```tsx
{cameFromPostJob && !isActive && (
  <div className={styles.contextBanner}>
    <p className={styles.contextBannerTitle}>Start your trial to post your first job</p>
    …
  </div>
)}
```

And [`:293-295`](app/dashboard/subscription/page.tsx#L293):

```tsx
<h2 className={styles.pricingTitle}>
  {isCanceled ? 'Resubscribe to continue' : 'Get started'}
</h2>
```

For an employer with `subscription_status='canceled'` who arrives from `/post-job`:
- `cameFromPostJob && !isActive` → **true** → top banner renders "Start your trial…"
- Inside the else branch (`!isActive`), `isCanceled` → **true** → pricing-card heading renders "Resubscribe to continue"

Both can be true at the same time and BOTH render. **The two pieces of copy contradict each other** ("first job" implies never paid before; "resubscribe" implies prior subscription).

Live reproduction: I flipped `thrive-test4`'s `subscription_status` to `canceled`, hit `/post-job` → redirected to `/dashboard/subscription?from=post-job`, page snapshot showed both:
- Line 93: `"Start your trial to post your first job"`
- Line 96: `"Resubscribe to continue"`

**Fix shape (not applied):** the "Start your trial to post your first job" copy is only honest for a user who has NEVER had a paid trial. Gate it on `!isCanceled && !isActive` instead of just `!isActive`, OR (cleaner) collapse the dual-banner pattern: resolve the page to ONE coherent state per status, not two.

### (c) Throb / spin / flicker — NOT REPRODUCED as a redirect loop

I instrumented the page via Playwright on prod with the test account in the same `canceled` state, capturing network and console:

- Network for `/dashboard/subscription`: one `GET /rest/v1/employer_subscriptions` (Supabase fetch), a handful of Next.js Router `_rsc` prefetches for `/employer/dashboard`, `/post-job`, `/dashboard/analytics` (these fire on Link hover or eager prefetch — harmless), and **one `POST /api/simulate/run` returning 401** (this was during the back-link test when I briefly landed on `/employer/dashboard`; the simulator fires from there on mount via [`app/employer/dashboard/page.tsx:794-799`](app/employer/dashboard/page.tsx#L794), not from the subscription page).
- Console: 0 warnings, 0 errors after page settled.
- No redirect loop. No re-render spike. The page settled normally.

The user-perceived "throb" most likely is a combination of:
1. The brief load spinner during initial `/api/employer_subscriptions` fetch (the page renders [`styles.spinner` at :178-180](app/dashboard/subscription/page.tsx#L178)),
2. The redirect transition from `/post-job` → `/dashboard/subscription?from=post-job` (Next.js client navigation involves a brief flash),
3. The `_rsc` prefetches landing in the network tab making it look like the page is "doing things" when it's just hydrating Links.

Worth instrumenting on the +thrivetest8 account specifically. Possible: handleManageBilling auto-firing if there's a code path I missed that hits `/api/stripe/create-portal-session` on mount when `stripe_customer_id` is non-null — the portal call would 500 for `+thrivetest8` because Stripe says no such customer. But I read the page top to bottom and the portal call is only invoked from a button click (line 123).

**Verdict:** no confirmed re-render or redirect loop. Recommendation: capture a DevTools performance trace on the live broken account (or replay the throb on a recording) so we can see whether it's React or network. The static analysis says no loop.

---

## Part D — Stripe vs DB reconciliation (HIGHEST PRIORITY)

### Account 1 — pauldavies.gbr@gmail.com (Amazon employer)

| Source | Value |
|---|---|
| DB.subscription_status | **`trialing`** |
| DB.stripe_subscription_id | `sub_1TNSqm42euar6HpIih75QB5z` |
| DB.stripe_customer_id | **`NULL`** ⚠ |
| DB.trial_ends_at | 2026-10-17 06:59:32 |
| DB.updated_at | 2026-05-07 17:10:05 |
| Stripe — direct fetch on subscription id | **`status='canceled'`**, canceled_at=2026-05-02T06:09:04Z, customer=`cus_UMB9ZYfK5JKqaH`, metadata.supabase_user_id=`78d9038b-…` ✓ |
| Stripe webhook event for the cancellation | Sent 2026-05-02, `pending_webhooks=0` (delivered) |

**Conclusions:**
- Stripe canceled the subscription 29 days ago. Webhook delivered.
- The DB row's `updated_at` is **2026-05-07 17:10:05**, which is FIVE days AFTER the cancellation webhook delivered. Some other write touched the row after the cancellation and reset `subscription_status` back to `'trialing'`.
- The most likely culprit is `/api/activate-trial` ([`app/api/activate-trial/route.ts:26-35`](app/api/activate-trial/route.ts#L26)), which is unauthenticated against Stripe and unconditionally sets `'trialing'`. It's reachable from anyone visiting `/subscribe` while logged in — including someone who clicked "back" from a canceled Stripe portal.
- DB's `stripe_customer_id` is NULL even though Stripe has the customer at `cus_UMB9ZYfK5JKqaH`. The webhook handler does set `stripe_customer_id` in the `checkout.session.completed` branch but does not on `customer.subscription.deleted`, and `/api/activate-trial` leaves it untouched. So once stripe_customer_id is missing, no subsequent activate-trial call backfills it.

**Net effect:** the Amazon employer has full gate access in the app but has nothing on Stripe. **Entitlement leak.**

### Account 2 — pauldavies.gbr+thrivetest8@gmail.com (Ember employer — the screenshot account)

| Source | Value |
|---|---|
| DB.subscription_status | **`canceled`** |
| DB.stripe_subscription_id | `sub_1TUU6R3JsLAlS7ofPMC0H9Fw` |
| DB.stripe_customer_id | `cus_UTQwmJAfwIGlFd` |
| DB.trial_ends_at | 2026-08-06 15:44:10 |
| DB.updated_at | 2026-05-10 18:26:41 |
| Stripe — direct fetch on subscription id | **`No such subscription: 'sub_1TUU6R3JsLAlS7ofPMC0H9Fw'`** |
| Stripe — direct fetch on customer id | **`No such customer: 'cus_UTQwmJAfwIGlFd'`** |
| Stripe — list subscriptions for the customer | `total: 0` (consistent: no customer exists) |
| `livemode` flag on the key | `false` (we're querying TEST mode) |

**Conclusions:**
- The DB row points at a Stripe customer and subscription that simply don't exist in Stripe (test environment).
- Stripe never deletes a canceled subscription or customer on its own. The only ways those records vanish are: (i) the Stripe TEST account had its data wiped from the dashboard, or (ii) the keys point at a different account entirely than the one the rows were created against.
- The most recent Stripe event activity in test mode is **2026-05-26**. There has been NO completed checkout for this account in the last 5 days. The "91 days free starting 29 Aug 2026" Stripe checkout the user saw IS a real Stripe checkout session — but it was not completed (no `checkout.session.completed` event, no new subscription).
- So at this exact moment: DB says canceled, Stripe has no record at all, and the user is mid-checkout. The gate locks them out of `/post-job` (DB.status=canceled) → `/dashboard/subscription?from=post-job` → the page renders "Resubscribe to continue" + "Start your trial to post your first job" simultaneously (Part C(b)).

### Webhook handler — code is correct, delivery is the suspect

[`app/api/stripe/webhook/route.ts`](app/api/stripe/webhook/route.ts):
- Verifies signature with `STRIPE_WEBHOOK_SECRET` ✓
- Handles `checkout.session.completed` (upsert by user_id from metadata, writes status + stripe_customer_id + stripe_subscription_id) ✓
- Handles `customer.subscription.updated` (writes status, cancel_at, trial_ends_at) ✓
- Handles `customer.subscription.deleted` (sets status=canceled) ✓
- Handles `invoice.payment_failed` (sets status=past_due) ✓
- Returns 500 on handler error, which Stripe interprets as failed delivery and retries — but only with limited retry budget before marking pending.

**Real-world delivery on this account:**
- `customer.subscription.deleted` for `sub_1T3yTg42euar6HpInao4F2aQ` on 2026-05-24 → **`pending_webhooks: 1`** (never delivered; user `70ae403e-…` is a different test employer whose DB row is now stale).
- `invoice.payment_succeeded` on 2026-05-19 → **`pending_webhooks: 1`** (never delivered).

So the handler code is fine; the **webhook endpoint URL configured in Stripe is failing intermittently** (could be 4xx/5xx on the deploy, could be a route the deploy doesn't serve anymore, could be Vercel function timeouts). Without access to Stripe Dashboard's webhook-delivery logs (which I can't reach from here), the exact cause of the non-delivery is opaque.

### Why the DB cannot self-heal

There is **no reconciliation job**. Nothing in the codebase periodically pulls Stripe state and reconciles to `employer_subscriptions`. The only writers to `employer_subscriptions.subscription_status` are:
- The Stripe webhook (correct, but unreliable delivery).
- `/api/activate-trial` (always writes 'trialing', no Stripe consult).
- `/api/stripe/setup-trial` (writes 'inactive' on first customer create).
- `/auth/callback/employer` and `/lib/authCallback.ts` (bootstrap 'inactive' on new user signup).
- Manual support intervention via the admin route.

If a webhook is missed, the DB stays wrong **forever**.

### Fix shape for Part D (not applied)

Three converging fixes:
1. **Make webhook delivery investigable.** Add a simple `webhook_events_log` table; on every received event, INSERT a row with `event_id`, `type`, `received_at`, `processed_ok`. Then the live state is auditable in SQL when a customer reports a mismatch.
2. **Reconcile on-read.** When the gate fires for an employer with a `stripe_customer_id`, do a `stripe.subscriptions.list({ customer })` and trust Stripe over DB. Update DB on the fly. Expensive on hot paths but safe.
3. **Stop unilateral entitlement writes.** Either delete `/api/activate-trial` (it predates the Stripe-driven flow) OR gate it so it only runs for users with NO existing `employer_subscriptions` row — never for users whose status is `'canceled'`/`'past_due'`. The current code unconditionally upserts `'trialing'` and that's the root of the Amazon-account entitlement leak.

---

## Part E — copy / term inconsistencies (REPORT ONLY)

### Trial duration

- Stripe checkout UI surfaces the literal `trial_period_days: 91` → renders "91 days free starting [date]".
- Thrive UI says "3 months free" (`TRIAL_MONTHS=3` derived from `TRIAL_DURATION_DAYS=91`).
- 91 days ≠ exactly 3 months (3 months is 89–92 days depending on calendar). Users see "91 days" on Stripe's page vs "3 months" everywhere else. Cosmetic but worth aligning copy.

### Cancellation terms — directly contradictory

| File:line | Copy |
|---|---|
| [`app/dashboard/subscription/cancel/page.tsx:30`](app/dashboard/subscription/cancel/page.tsx#L30) | `"14 days' cancellation notice"` |
| [`app/dashboard/subscription/page.tsx:297`](app/dashboard/subscription/page.tsx#L297) | `"{trialPhraseFormal()}. Cancel anytime."` |

The cancel page says you owe 14 days notice; the main subscription page says cancel anytime. These pages are part of the SAME flow (subscribe → manage → cancel). Whichever is the actual contractual position needs to win, and the other needs to be brought into line. Legal team should pick.

### Status-field drift

- `employer_subscriptions.subscription_status` (string column, values include 'inactive', 'trialing', 'active', 'canceled', 'past_due')
- `employer_profiles.subscription_status` (separate column with values like 'trial')
- Both queried test accounts have these two fields disagreeing — `employer_profiles.subscription_status='trial'` for BOTH while their `employer_subscriptions.subscription_status` was `'trialing'` and `'canceled'` respectively.

Only `employer_subscriptions.subscription_status` is read by the gate. `employer_profiles.subscription_status` is dead state that no production code consults — confirmed via grep. Worth either removing the column or wiring it as a redundant view of the canonical truth, but **never** as a second source of truth.

---

## Recommended fix order

| # | Bug | Severity | Why this order |
|---|---|---|---|
| **1** | **(D) DB↔Stripe drift on `pauldavies.gbr@gmail.com`** — Stripe canceled 2026-05-02; DB still says trialing. Caused by `/api/activate-trial` overwriting status to 'trialing' without Stripe consultation. | **CRITICAL — money** | Entitlement-leak. Right now this account has full gate access without any active Stripe subscription. Same shape will recur for any user who clicks `/subscribe` while logged in after a cancellation. |
| **2** | **(D) Webhook delivery failures** — `pending_webhooks=1` for at least 2 events in last 12 days; no `webhook_events_log` table so failures are silent. | **CRITICAL — operations** | Until this is observable in SQL, every customer report of "I paid but it says I haven't" is detective work. Add the log table; then we'll know the failure rate. |
| **3** | **(D) Stripe-vs-DB reconciliation** — gate reads DB only; nothing pulls Stripe ground truth. | High | The fix for #1 + #2 closes most of the gap but on-read reconciliation (or a daily reconcile cron) is the structural backstop. |
| **4** | **(b) Double-state render** — "Start your trial" + "Resubscribe to continue" simultaneously on `/dashboard/subscription` for cameFromPostJob && isCanceled. | High | One-line render fix (gate the contextBanner on `!isCanceled && !isActive`). Confusing copy is a bad first impression for a user already mid-payment-flow. |
| **5** | **(E) Cancellation-terms contradiction** — "14 days' cancellation notice" vs "Cancel anytime" on adjacent pages of the same flow. | Medium-high (legal) | Brand / legal: pick one and align. |
| **6** | **(a) `cancel_url: '/subscribe'`** in Stripe checkout config — logged-in users who cancel Stripe checkout land on the public signup page. | Medium | One-line fix: `cancel_url: ${baseUrl}/dashboard/subscription`. Probably what the user actually observed re: bug (a). |
| **7** | **Page duplication** — `/dashboard/subscription` and `/settings/subscription` overlap; `/subscribe` overlaps both for logged-in users. | Medium | Consolidate post-launch. |
| **8** | **(E) Trial copy** — "91 days" (Stripe) vs "3 months" (Thrive). | Low | Cosmetic. |
| **9** | **`employer_profiles.subscription_status`** dead column. | Low | Schema cleanup. |
| 10 | **(c) "Throb"** — not confirmed as a re-render or redirect loop in static analysis or live observation. | TBD | If the user can re-screen it with DevTools open, we'll know. Default to closing as not-reproduced. |

---

## Appendix — data evidence (queries run this session)

1. `interviews.status` CHECK constraint (irrelevant here but discovered in the path inventory) and subscription CHECK enum.
2. `auth.users JOIN employer_subscriptions LEFT JOIN employer_profiles` for both test accounts (the table above).
3. Stripe REST calls (test mode):
   - `GET /v1/subscriptions/sub_1TNSqm…` → 200, status=canceled, canceled_at=2026-05-02
   - `GET /v1/subscriptions/sub_1TUU6R…` → 404 No such subscription
   - `GET /v1/customers/cus_UTQwmJ…` → 404 No such customer
   - `GET /v1/subscriptions?customer=cus_UTQwmJ…` → `total: 0`
   - `GET /v1/events?limit=25&type=customer.subscription.deleted` → 2 events in test mode, one with `pending_webhooks=1`
   - `GET /v1/events?limit=10` → most recent event 2026-05-26; two recent events with `pending_webhooks=1`
   - `GET /v1/balance` → `livemode: false`
4. `pg_constraint` on `employer_subscriptions` → UNIQUE on user_id, stripe_customer_id, stripe_subscription_id (constraints intact; webhook upsert mechanically works when it's reached).
5. Live Playwright on prod thrivecareer.co.uk: logged in as `+thrive-test4` with DB temporarily set to `'canceled'`. Reproduced bug (b) live; could not reproduce bug (a). Reverted the test account to its prior `'inactive'` state at end of session.

No live Stripe checkouts initiated. No live Google Calendar events created.
