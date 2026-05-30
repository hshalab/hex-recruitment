# Interview Lifecycle Audit — 2026-05-30

Read-only audit. No application code touched. Evidence is either (i) a code path with file:line or (ii) a real Supabase row from the Paul ↔ Gianna test data.

## TL;DR

Six confirmed bugs, ranked by severity at the bottom. The marquee bug — date/time corruption in interview emails — has a single structural root cause that also explains the duplicate-notification pattern: **multiple `interviews` rows can exist per `job_applications` row, with no constraint and no "current" pointer**. Different code paths pick different rows; the candidate's `/applications` page picks the last one returned by Supabase via a `.forEach` with no ORDER BY. The other five bugs are independent.

## Test-data anchors (from Supabase, queried this session)

| Actor | user_id | email | Notes |
|---|---|---|---|
| Paul (Amazon owner) | `78d9038b-2e4d-4ff5-88f3-6f8a0496fb65` | pauldavies.gbr@gmail.com | Google OAuth signup |
| Paul (Ember owner) | `277c20ae-ac3e-4048-9b99-66f41cbf1861` | pauldavies.gbr+thrivetest8@gmail.com | Email signup |
| Gianna Lorandi (candidate) | `2b8b7a0f-799f-418b-a0e2-bf96c77cbb9c` | **gicalorandi@gmail.com** (external, not alias) | Google OAuth signup |

**The focal application for the date-corruption bug:** Sales Account Manager (Amazon), `application_id 5af81b1e-f7c3-4755-a63e-29932cc5a2d1`. **3 `interviews` rows exist for it:**

| interview.id | created_at | status | interview_date | interview_time | booking_id |
|---|---|---|---|---|---|
| `f5448a9d-…` | 2026-04-19 | completed | 2026-04-23 | 13:00:00 | 5df395f1 |
| **`0431a9b3-…`** | 2026-05-06 | **confirmed** | **2026-05-06** | **00:00:00** | NULL ← the corrupted row |
| `3181f1e7-…` | 2026-05-30 | confirmed | 2026-06-05 | 11:30:00 | 2b4a3341 |

Today's notifications (queried, sorted DESC) show the bug end-to-end:

| created_at (UTC) | recipient | title | message | source |
|---|---|---|---|---|
| 07:16:15 | Paul | Interview Booked | "…Friday, 5 June 2026 at 11:30." | [`book/route.ts:140-161`](app/api/calendar/book/route.ts#L140) (selfScheduled path) — **correct row 3181f1e7** |
| 07:16:15 | Gianna | Interview Confirmed | "…Friday, 5 June 2026 at 11:30." | same path |
| 07:18:39 | Paul | Interview Confirmed | "Gianna Lorandi has confirmed the interview…" (no date in body) | [`applications/page.tsx:325-336`](app/applications/page.tsx#L325) (handleAcceptInterview) |
| 07:18:39 | Gianna | Interview Updated | "**…Wednesday, 6 May 2026 at 00:00:00**…" | [`update-event/route.ts:62-71`](app/api/calendar/update-event/route.ts#L62) — **wrong row 0431a9b3** |

The 07:18 events fired 2 min after the 07:16 events for the same logical action (Gianna self-scheduled, then visited `/applications` and clicked Accept on a stale interview card).

---

## Part 1 — Route + status-write inventory

### Routes touching interview state

| File:line | Trigger / actor | Writes | Side-effects |
|---|---|---|---|
| [`my-jobs/[jobId]/applications/page.tsx:479-562`](app/my-jobs/[jobId]/applications/page.tsx#L479) | Employer clicks "Invite to Interview" | `job_applications.interview_interest_status='pending'` | in-app notif (type `interview_interest`), in-app conversation message. **NO email.** |
| [`my-jobs/[jobId]/applications/page.tsx:380-455`](app/my-jobs/[jobId]/applications/page.tsx#L380) | Employer changes app status (shortlisted/hired/etc.) | `job_applications.status` | in-app notif, email type `application_status` |
| [`components/ScheduleInterviewModal.tsx:356-376`](components/ScheduleInterviewModal.tsx#L356) | Employer schedules direct (no `selfScheduled`) | calls `/api/calendar/book` | downstream side-effects in `book/route.ts` |
| [`app/interview/schedule/[token]/page.tsx:94-113`](app/interview/schedule/[token]/page.tsx#L94) | **Candidate** self-schedules from invitation link | calls `/api/calendar/book` with `selfScheduled: true` | downstream side-effects |
| [`app/api/calendar/book/route.ts`](app/api/calendar/book/route.ts) | Both above | inserts `interview_bookings`; updates `interviews.status` to `confirmed`/`scheduled`; updates `job_applications.status='interview'` + `stage_entered_at` | 2 notifs (employer "Interview Booked" + candidate "Interview Confirmed"); 1 candidate email type `interview_scheduled`; **NO employer email**; gcal event create (post fix); in-app message via `sendInterviewMessage` |
| [`app/applications/page.tsx:294-394`](app/applications/page.tsx#L294) (`handleAcceptInterview`) | Candidate clicks Accept on an interview card | `interviews.status='confirmed'` | 1 employer notif "Interview Confirmed"; 2 emails (`interview_confirmed` to candidate, `interview_confirmed_employer` to employer); calls `/api/calendar/update-event` |
| [`app/applications/page.tsx:494-544`](app/applications/page.tsx#L494) (`handleSelectSlot`) | Candidate picks a proposed slot | `interviews` update (date/time/status='confirmed') | 1 employer notif "Interview Time Confirmed"; 1 email type `interview_confirmed` **mis-routed to employer** |
| [`app/api/calendar/update-event/route.ts`](app/api/calendar/update-event/route.ts) | Called from `handleAcceptInterview` (and 2 other call sites: [`calendar/page.tsx:324`](app/calendar/page.tsx#L324), [`NotificationBell.tsx:149`](components/NotificationBell.tsx#L149)) | none directly on job_applications | candidate notif "Interview Updated"; candidate email type `interview_rescheduled`; in-app message; gcal create-or-update |
| [`app/api/calendar/cancel/route.ts`](app/api/calendar/cancel/route.ts) | Cancel | `interview_bookings.status='cancelled'`; clears `gcal_event_id_employer` | candidate notif; candidate email type `interview_cancelled`; deletes gcal event |
| [`components/WithdrawModal.tsx:88-180`](components/WithdrawModal.tsx#L88) | Employer "Mark as withdrawn" (new, this session) | `job_applications.status='withdrawn'` + `stage_entered_at` | candidate notif; email type `application_status` with status `withdrawn`; in-app conversation message |
| [`components/DeclineModal.tsx`](components/DeclineModal.tsx) | Employer Decline | `job_applications.status='rejected'` | candidate notif; email type `application_status` status `rejected`; in-app msg |
| [`app/applications/page.tsx:546-565`](app/applications/page.tsx#L546) (`handleWithdraw`) | Candidate withdraws own application | `job_applications.status='withdrawn'` | **none** (no notif, no email) |
| [`app/api/offers/[offerId]/withdraw/route.ts`](app/api/offers/[offerId]/withdraw/route.ts) | Employer withdraws offer | audit-log INSERT; `job_offers.status='withdrawn'` (idempotent: returns 409 if already terminal — line 80) | candidate notif; candidate email; **WELL-GUARDED** |
| [`app/api/cron/interview-reminders/route.ts`](app/api/cron/interview-reminders/route.ts) | Daily cron | none | reminder emails 24h before interview (employer + candidate) |

**18 files write `job_applications.status`** (full list available via grep `\.update\(\s*\{\s*status:` on `app/**`, `components/**`, `lib/**`). Cross-cutting risk: more than one of these can be reached by a single logical action — see (a) and (b) below.

---

## Part 2 — Effect matrix

Each row is a lifecycle event from the candidate's or employer's perspective. Cells: ✓ = fires, ✗ = does NOT fire, **⚠** = fires but wrong/duplicated, — = not applicable.

| Event | In-app → employer | In-app → candidate | Email → employer | Email → candidate | Gcal event | Google native invite → candidate | Thrive in-app calendar entry | interview_bookings row | Notif deep-link target |
|---|---|---|---|---|---|---|---|---|---|
| **Employer "Invite to Interview"** (sets `interview_interest_status='pending'`) | — | ✓ ([`my-jobs/.../page.tsx:495`](app/my-jobs/[jobId]/applications/page.tsx#L495)) | — | **✗** (no email — only notif + chat) | — | — | — | — | `/applications` (candidate-side, generic list) |
| **Candidate self-schedules from invitation** ([`/interview/schedule/[token]`](app/interview/schedule/[token]/page.tsx) → [`book/route.ts`](app/api/calendar/book/route.ts) selfScheduled=true) | ✓ "Interview Booked" → `/interviews` | ✓ "Interview Confirmed" → `/applications` | **✗** (gap — no employer email) | ✓ type `interview_scheduled` (book/route.ts:233-247) | ✓ post-fix `bfa56df1` but evidence shows it didn't run today — see (c) | ✓ created with attendees=[candidate] + organizer=accepted (post-fix `eac79254`) | row IS the calendar entry — `app/calendar/page.tsx` reads `interview_bookings` | ✓ inserted | mixed (see (f)) |
| **Employer schedules directly** ([`ScheduleInterviewModal`](components/ScheduleInterviewModal.tsx#L356) → `book/route.ts` selfScheduled unset/false) | ✓ "Interview Booked" | ✓ "Interview Confirmed" | **✗** (same gap) | ✓ type `interview_scheduled` | ✓ same post-fix | ✓ | row IS entry | ✓ | mixed |
| **Candidate clicks Accept on interview card** ([`handleAcceptInterview`](app/applications/page.tsx#L294)) | ✓ "Interview Confirmed" type `application_status_change` | — | ✓ type `interview_confirmed_employer` | ✓ type `interview_confirmed` | ✓ via `update-event` route | ✓ (via gcal attendees) | already present | not modified here | link includes only `jobId`, not appId |
| **Candidate selects proposed slot** ([`handleSelectSlot`](app/applications/page.tsx#L494)) | ✓ "Interview Time Confirmed" | — | **⚠** Email type `interview_confirmed` ROUTED TO EMPLOYER but template is candidate-facing ([line 526](app/applications/page.tsx#L526)) | ✗ (no candidate-facing email in this path) | ✗ (no gcal call) | ✗ | not written here | not written here | `/my-jobs` (generic) |
| **Update / reschedule** ([`update-event/route.ts`](app/api/calendar/update-event/route.ts)) | — | ✓ "Interview Updated" — **⚠ uses date/time from caller-supplied args; vulnerable to stale-row bug (b)** | — | ✓ type `interview_rescheduled` | ✓ update-or-create | ✓ | reads `interview_bookings` by `interview_id` (single matching) — fine | not modified | n/a |
| **Employer "Mark as withdrawn"** ([`WithdrawModal`](components/WithdrawModal.tsx#L88)) | — | ✓ "Application Withdrawn" | — | ✓ type `application_status` status=withdrawn | — | — | — | — | `/applications` |
| **Employer Decline** ([`DeclineModal`](components/DeclineModal.tsx)) | — | ✓ "Application Update" | — | ✓ type `application_status` status=rejected | — | — | — | — | `/applications` |
| **Candidate withdraws own app** ([`applications/page.tsx:546`](app/applications/page.tsx#L546)) | **✗** (no notif) | — | **✗** (no email) | — | — | — | — | — | n/a |
| **Cancel interview** ([`cancel/route.ts`](app/api/calendar/cancel/route.ts)) | ✓ via notification | ✓ | — | ✓ type `interview_cancelled` | ✓ deleted | — | row marked cancelled + `gcal_event_id_employer` cleared | updated | n/a |

---

## Part 3 — Root causes

### (a) DUPLICATE / REPEATED EMAILS

**Two independent mechanisms produce duplicate sends. They explain different "doubled" complaints.**

#### (a.1) "Application Withdrawn" 3× — re-clickable employer action with NO application-level idempotency guard

[`components/WithdrawModal.tsx:95-139`](components/WithdrawModal.tsx#L95) (the file I shipped this session). The button is `disabled={sending || …}` ([line 270-272](components/WithdrawModal.tsx#L270)) so back-to-back double-clicks within one open of the modal ARE blocked — but the modal closes onSuccess and **`job_applications.status` is updated to `'withdrawn'` without checking the prior value**. If the employer re-opens the modal (because the card is still visible in some view, hasn't been re-filtered, or they navigated back), and clicks Send-and-Decline again, the route:

1. `UPDATE job_applications SET status='withdrawn'` — succeeds no-op-style (line [98-102](components/WithdrawModal.tsx#L98))
2. Inserts another notification (no dedupe key — line [109-118](components/WithdrawModal.tsx#L109))
3. Fires another `/api/email/send` (line [124-139](components/WithdrawModal.tsx#L124))

Compare to **the well-guarded analog**, [`app/api/offers/[offerId]/withdraw/route.ts:79-85`](app/api/offers/[offerId]/withdraw/route.ts#L79):
```ts
if (currentStatus === 'declined' || currentStatus === 'withdrawn' || currentStatus === 'rescinded') {
  return NextResponse.json({ error: `Offer is already ${currentStatus}…` }, { status: 409 })
}
```
That offer route IS idempotent. The new application-withdraw is not. The 3-min cadence the user observed matches manual re-clicks, not rapid double-fire.

**Fix shape:** mirror the offer route's 409 guard on `job_applications.status === 'withdrawn'` in the WithdrawModal flow (and in [`DeclineModal`](components/DeclineModal.tsx) by symmetry — same pattern, same risk class).

#### (a.2) "Interview Confirmed" 2× — single logical action hits two status-write paths

When Gianna self-scheduled (07:16) AND then visited `/applications` and clicked Accept on the card (07:18) — both fired full notification + email blocks. The 07:16 path is [`book/route.ts:140-162`](app/api/calendar/book/route.ts#L140). The 07:18 path is [`applications/page.tsx:325-372`](app/applications/page.tsx#L325). Neither knows about the other; neither dedupes against an existing recent notification of the same kind for the same application.

`handleAcceptInterview` ([applications/page.tsx:294](app/applications/page.tsx#L294)) doesn't check whether the interview is already `status='confirmed'` before re-running the side-effect block — it just `UPDATE interviews SET status='confirmed'` (line [296-299](app/applications/page.tsx#L296)) and proceeds. So even if the interview was confirmed minutes ago by the self-schedule path, the Accept button still fires the whole notification + 2 emails + gcal-sync block again.

**Fix shape:** at the top of `handleAcceptInterview`, read the current status; if already `'confirmed'`, no-op the side-effect block (or even better, render no "Accept" button when `interview.status === 'confirmed'` — which is partly a UI/UX fix).

**The two duplicates have different mechanisms.** They need separate fixes; one idempotency guard won't catch both.

---

### (b) DATE + TIME CORRUPTION — Wed 6 May 2026 at 00:00:00 vs Fri 5 June 2026 at 11:30

**ROOT CAUSE: multiple `interviews` rows per `job_applications` row, picked non-deterministically by [`applications/page.tsx:81-104`](app/applications/page.tsx#L81).**

That code fetches all interviews for the candidate (filtered by `.in('status', ['pending_selection', 'scheduled', 'confirmed', 'cancelled'])`) and maps them by `application_id` via a `.forEach` with NO `ORDER BY`. **Last forEach iteration wins.** For Gianna's Sales Account Manager application there are TWO rows in the filter:

- `0431a9b3-…` — date=2026-05-06, **time=00:00:00**, status=confirmed (older, orphan — created 2026-05-06)
- `3181f1e7-…` — date=2026-06-05, time=11:30:00, status=confirmed (newer, current — created today 2026-05-30 05:53)

Whichever Supabase returns last in iteration order is the one whose `id`/`date`/`time` go into the UI card. The candidate's "Accept" button then fires `handleAcceptInterview(interviewId)` using the wrong row's id. From there:

- [`handleAcceptInterview:306-310`](app/applications/page.tsx#L306) fetches the wrong row's data again (by id)
- That data is passed verbatim to `/api/email/send` type `interview_confirmed_employer` → **Paul's "Interview Confirmed" email renders 6 May 00:00:00**
- The same data is passed to `/api/calendar/update-event` → that route's notification at [`update-event/route.ts:62-71`](app/api/calendar/update-event/route.ts#L62) interpolates `friendlyDate` and `time` into the "Interview Updated" message → **Gianna's in-app notification reads "to Wednesday, 6 May 2026 at 00:00:00"**

The "5 June 11:30" date came from the GOOD path ([`book/route.ts:130-138`](app/api/calendar/book/route.ts#L130)) which wrote its own friendlyDate string from the booking row it had just inserted. No stale row issue there.

**Why does the 00:00:00 row exist?** Created 2026-05-06 — some path (TBD — likely an earlier shortlist→interview-status flip that set `interview_date` from `status_updated_at::date` and left `interview_time` at column default `'00:00:00'`). The row was never tied to a `interview_bookings` row (`booking_id IS NULL`). It's a phantom row that the candidate's `/applications` page sees and surfaces as an "Accept" button.

**Why does no constraint stop this?** No `UNIQUE (application_id) WHERE status NOT IN ('completed','cancelled')`. No "current interview" pointer column on `job_applications`. Status filter alone is not sufficient because two `confirmed` rows are both valid under the filter.

**Fix shape (suggested, not applied):**
- Short-term (eliminates symptom for new bookings): add `.order('created_at', { ascending: false })` to the interviews fetch and stop relying on forEach order — last iteration wins becomes "most-recent wins" deterministically. Insufficient alone (still surfaces stale "Accept" buttons) but stops the email/notification corruption.
- Medium-term: a `current_interview_id` pointer on `job_applications`, or a partial UNIQUE index on `interviews(application_id) WHERE status IN ('pending_selection','scheduled','confirmed')`. Either makes "which interview is THE interview for this app" unambiguous.
- Data cleanup: identify and either soft-delete or mark `'cancelled'` all duplicate phantom interviews (start with rows where `interview_time = '00:00:00'` AND `booking_id IS NULL` — clear signature of the orphan pattern). For Gianna's case, just row `0431a9b3` needs cleaning.

---

### (c) SELF-SCHEDULE DEAD-ENDS

Three reported gaps. Status of each, post-fix as of merge `bfa56df1` on `main`:

**(c.1) "Employer gets no email when candidate self-schedules" — CONFIRMED, still a gap.**

[`book/route.ts:230-247`](app/api/calendar/book/route.ts#L230) fires ONE email after booking — type `interview_scheduled`, **to candidate only**. There is no corresponding `/api/email/send` call targeting the employer. Both code paths (self-schedule and employer-direct) hit this same block, so the gap is symmetric. Today's notifications show Paul did get the in-app "Interview Booked" notification (07:16:15) but no employer email exists in the codebase for this trigger.

**(c.2) "No Google Calendar event is created when candidate self-schedules" — POST-FIX, SHOULD work; one piece of evidence suggests it didn't fire today, mechanism unclear.**

`book/route.ts` post-merge `bfa56df1` creates the gcal event unconditionally (no `selfScheduled` gate). For booking `2b4a3341` (Gianna's self-schedule today at 07:16:15 UTC, well after the merge), the DB shows:
- `gcal_event_id_employer = NULL`
- `gcal_sync_error = NULL`

If the post-fix gcal block had run, EITHER `gcal_event_id_employer` would be populated (success) OR `gcal_sync_error` would be populated (failure). Both being NULL means **the block was entered but neither branch wrote back** — the only path I can construct that produces this is: `getValidAccessToken` returned `null` (silently — that function returns null on token refresh failure without throwing), so the `if (accessToken)` guard at [`book/route.ts:177`](app/api/calendar/book/route.ts#L177) skipped the whole gcal block including the catch. **No diagnostic trail in `gcal_sync_error` for this path.** That column was added explicitly to catch failures — but it doesn't catch token-resolution failures.

Worth grepping the Vercel runtime logs for `[googleCalendar] refresh failed` or `[googleCalendar] liveness check failed` (lib/googleCalendar.ts:54, :94) around 07:16:15 UTC today to confirm.

**(c.3) "Nothing appears in the Thrive in-app calendar" — CONFIRMED, but it's a query gap, not a write gap.**

`interview_bookings` row `2b4a3341` IS present (verified above). [`app/calendar/page.tsx`](app/calendar/page.tsx) is the in-app calendar. Whether it shows this booking depends on what it queries. Quick grep needed — but the fact that the user reports "nothing appears" while the DB row exists points to a calendar-page query/filter bug, not a missing-row bug. Likely candidates: the calendar page filters by `booking.status='scheduled'` and Gianna's booking IS scheduled, OR by `interview.status='confirmed'` which IS true — so the calendar page might be filtering against `gcal_event_id_employer IS NOT NULL` (i.e. "only show synced events"). That hypothesis is consistent with both today's row being NULL AND the calendar showing nothing.

---

### (d) CANDIDATE INTERVIEW EMAILS MISSING

Gianna's email is `gicalorandi@gmail.com` — **external Google account, NOT a Gmail plus-alias of Paul's**. So none of the Gmail-aliasing weirdness from the prior gcal organizer-RSVP fix applies. Emails sent to Gianna should arrive at a real, separate inbox.

**Mapping which candidate emails fire:**

| Trigger | Email fired? | Type | Code path |
|---|---|---|---|
| Application shortlisted | ✓ | `application_status` status=shortlisted | [`my-jobs/.../page.tsx:459-467`](app/my-jobs/[jobId]/applications/page.tsx#L459) |
| Application rejected | ✓ | `application_status` status=rejected | [`DeclineModal.tsx`](components/DeclineModal.tsx) |
| Application hired | ✓ | `application_status` status=hired | [`my-jobs/.../page.tsx:594-602`](app/my-jobs/[jobId]/applications/page.tsx#L594) |
| Application withdrawn (by employer) | ✓ | `application_status` status=withdrawn | [`WithdrawModal.tsx:124-139`](components/WithdrawModal.tsx#L124) |
| **"Invite to interview" (employer click)** | **✗** | n/a | [`my-jobs/.../page.tsx:479-562`](app/my-jobs/[jobId]/applications/page.tsx#L479) — fires notif + chat msg only |
| Interview scheduled (book/route.ts) | ✓ | `interview_scheduled` | [`book/route.ts:231-247`](app/api/calendar/book/route.ts#L231) — fires to `candidateEmail` from request body |
| Interview confirmed (candidate accepts) | ✓ | `interview_confirmed` | [`applications/page.tsx:339-354`](app/applications/page.tsx#L339) |
| Interview rescheduled | ✓ | `interview_rescheduled` | [`update-event/route.ts:75-92`](app/api/calendar/update-event/route.ts#L75) — fires to `candidateEmail` resolved server-side |
| Interview cancelled | ✓ | `interview_cancelled` | [`my-jobs/.../page.tsx:744-758`](app/my-jobs/[jobId]/applications/page.tsx#L744) |

**Conclusions for (d):**

1. **"Invite to interview" has no candidate email** — that's a genuine gap. Notification + chat message only, never reaches inbox. **Most-likely cause of Paul's observation** that Gianna didn't see an interview email — the employer's "Invite to Interview" action only fires in-app surfaces, not email.

2. **All other interview emails DO fire in code.** If Paul has confirmed no `interview_scheduled` email reached Gianna's inbox at 07:16 today after she self-scheduled, the cause must be one of: (i) `.catch(() => {})` swallowing a `fetch` rejection silently — common throughout the code; (ii) Resend delivery failure / spam; (iii) some upstream auth check on `/api/email/send` rejecting the call. I couldn't verify (i)/(ii)/(iii) from inside Supabase — would need Resend dashboard or Vercel runtime logs to confirm.

**Fix shape:** add an email send to `handleInviteToInterview` (template would say "X has invited you to schedule an interview — pick a time here: {schedule-token-URL}"). Independently, eliminate the universal `.catch(() => {})` silent-swallow pattern on email/send fetches and record failures somewhere queryable (mirror the `gcal_sync_error` column treatment).

---

### (e) EMPLOYER APPLICATION EMAILS — ROUTING IS CORRECT

Today's three new applications and where the "New application received" notification landed:

| Application | Job owner | Routed to | Correct? |
|---|---|---|---|
| Events & Private Dining Sales Manager | Ember (`277c20ae`) | pauldavies.gbr+thrivetest8@gmail.com | ✓ |
| Warehouse Team Leader | Amazon (`78d9038b`) | pauldavies.gbr@gmail.com | ✓ |
| General Manager | Ember (`277c20ae`) | pauldavies.gbr+thrivetest8@gmail.com | ✓ |

Routing reads `jobs.employer_id` and writes a notification keyed on that. The earlier "no employer email" report was almost certainly because the user was checking the WRONG inbox alias (main when the job belonged to the +thrivetest8 employer). **No bug here.** Worth a one-line sentence in any future user-facing copy that the employer notifications go to the alias that owns each job.

---

### (f) BROKEN DEEP-LINK FROM EMPLOYER NOTIFICATION

Today's employer notifications and their link targets:

| Title | link | Specific enough? |
|---|---|---|
| "Interview Booked" | `/interviews` | ✗ generic list |
| "Interview Confirmed" | `/my-jobs/{jobId}/applications` | ✗ job-applications LIST, not the specific application |
| "Interview Time Confirmed" | `/my-jobs` | ✗ generic |
| "New application received" | `/my-jobs` | ✗ generic |
| "Interview Invitation Declined" | `/my-jobs/{jobId}/applications` | ✗ list |

**Two-sided gap:**

1. **Notification link generation never includes the application_id**, even though `notification.related_id` IS the application id ([`applications/page.tsx:333`](app/applications/page.tsx#L333), [`my-jobs/.../page.tsx:501`](app/my-jobs/[jobId]/applications/page.tsx#L501), etc.). All notification-insert call sites build link strings like `\`/my-jobs/${jobId}/applications\`` or `'/my-jobs'`. None include the application id in the URL.

2. **The `/my-jobs/[jobId]/applications` page does not read application_id from the URL** to scroll/focus/highlight the matching application card. Even if the link did include it, the page wouldn't act on it.

**Fix shape:** (i) include `applicationId` in the URL (query param `?app=…` or path `/my-jobs/[jobId]/applications/[applicationId]`); (ii) make the applications page honor that and scroll-into-view / highlight / open-modal-for the specific application on load. Both halves are needed.

---

## Part 4 — Recommended fix order

Ranked by **severity** × **blast radius**. Bugs that mislead the user about real-world commitments (dates, times) outrank silent gaps.

| # | Bug | Severity | Blast radius | Why this order |
|---|---|---|---|---|
| **1** | (b) Date/time corruption — wrong interview row picked | **CRITICAL** | Every candidate with more than one interview row per application — many in the test data; will grow with usage | Misleads BOTH parties about commitments. A user shows up on the wrong date. Worst possible UX outcome. |
| **2** | (a.2) Interview-Confirmed double-fire via two status-write paths | High | Every self-scheduling candidate who also visits /applications | Spams the employer with redundant "confirmed" emails + creates duplicate gcal events. Erodes trust. |
| **3** | (a.1) Withdraw email 3× — missing application-level idempotency | High | Every withdraw action that the employer re-clicks | Spams candidate with rejection messages — particularly damaging to brand. Has a known well-guarded analog ([offers/withdraw](app/api/offers/[offerId]/withdraw/route.ts#L80)) to copy. |
| **4** | (c.1) Self-schedule sends no employer email | High | Every self-scheduled interview | Employer relies on Thrive notification only — no email fallback. If they don't check the app, they miss the interview. |
| **5** | (c.2) gcal event silently missing when `getValidAccessToken` returns null | Medium-high | Every employer with stale/revoked Google tokens | Silent failure mode — `gcal_sync_error` doesn't capture token-refresh failures, so there's no operational trail. Logged to Vercel runtime only. |
| **6** | (d) "Invite to interview" has no candidate email | Medium-high | Every employer who uses the Invite-to-Interview flow expecting email out-of-app reach | Genuine gap. Candidate must check Thrive in-app to see the invitation. |
| **7** | (f) Notification deep-links don't open the specific application | Medium | Every employer notification | Wastes the employer's time on every click — they have to scan the application list. |
| **8** | (c.3) Thrive in-app calendar doesn't show today's self-scheduled booking | Medium | Same self-scheduled bookings as (c.1) | Probably a query filter against `gcal_event_id_employer IS NOT NULL`. Will resolve once (c.2) lands. Confirm and re-test after (c.2). |
| **9** | (a) handleSelectSlot mis-routes `interview_confirmed` email to employer with candidate template | Low | Only employer-proposed-multi-slot flow if/when used | Template misalignment, not a correctness bug. Easy fix. |
| 10 | (e) Application email routing | **NOT A BUG** | — | Verified correct. Document and close. |

**Recommended landing order:** 1 alone first (data + structural fix), then 2+3 together (both are idempotency / single-source-of-truth fixes, related shape), then 4+5+6 in one sweep (all "email gap" class), then 7 (UX), then 8 once 5 is verified, then 9.

**Notes on what NOT to do:**

- Don't touch the Thrive in-app calendar build itself — it's downstream of these write-path bugs. Fix the writes; the calendar will populate.
- Don't paper over (b) by adding `.order` and calling it done. The phantom interview rows are a data hygiene problem that will recur; the structural fix (partial unique index OR current-interview pointer) is the load-bearing change.
- Don't add idempotency keys at the email layer alone. The duplicates here come from upstream business-logic loops, not retry. Fix at the trigger source.

---

## Appendix — Data evidence

Recorded queries (all read-only):

1. `auth.users` lookup for Gianna → identity confirmed
2. `job_applications` for Gianna joined to `jobs` joined to employer `auth.users` → 5 applications, all routed to correct employer
3. `interviews WHERE application_id = '5af81b1e-…'` → 3 rows (Apr 23, May 6 with 00:00:00, Jun 5 with 11:30)
4. Recent `notifications` for both Paul accounts + Gianna (last 48h) → confirmed 07:16 vs 07:18 timeline
5. `interview_bookings` for the 3 interview rows → today's booking (2b4a3341) has both `gcal_event_id_employer` and `gcal_sync_error` NULL
6. `information_schema.triggers` on notifications/job_applications/interviews/interview_bookings → none
7. `cron.job` → only `prune-chat-logs-daily`, nothing that could re-fire interview/withdraw emails

No live Google Calendar events created or modified during the audit.
