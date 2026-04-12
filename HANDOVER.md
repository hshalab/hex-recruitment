# Thrive — Project Handover

*Date: 2026-04-12*

## What is Thrive?

Thrive is a multi-sector UK recruitment platform. Employers post jobs, search candidates, manage a hiring pipeline (applications → shortlist → interview → offer → hire), and candidates browse jobs, apply, and track their applications — all in one platform. Free for candidates, free-launch offer (6 months free for first 600 employers) for employers.

**Live URL:** https://hex-recruitment.vercel.app
**Custom domain:** https://thrivecareer.co.uk
**Repo:** https://github.com/pauldaviesgbr-beep/hex-recruitment

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.1.0 (App Router) |
| Language | TypeScript |
| Styling | CSS Modules |
| Database | Supabase (PostgreSQL) — project ref `aaljufxcniacfggqiuls` |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Hosting | Vercel (Hobby plan) |
| Payments | Stripe (test mode) |
| Email | Resend (onboarding@resend.dev sender) |
| AI | Anthropic Claude API (job ad generation, company auto-fill) |
| Web scraping | Firecrawl (company profile auto-fill) |
| Address lookup | Postcoder (UK postcode → address list) |
| Calendar | Google Calendar API (two-way interview sync) |
| ICS feeds | Custom iCalendar feed per employer |

## Project Structure

```
app/                          Next.js App Router pages and API routes
  api/                        Server-side API endpoints
    ai-assist/                AI job ad generation
    auth/google/              Google Calendar OAuth (NOT sign-in OAuth)
    auth/signout/             Session clearing
    calendar/                 Interview booking, cancellation, ICS feed
    company/scrape/           Firecrawl company auto-fill
    cron/                     Scheduled jobs (reminders, expiry, activation emails)
    email/send/               Resend email dispatcher
    lookup-postcode/          Postcoder address lookup proxy
    profile/create/           RLS-bypassing profile creation
    subscription/create/      RLS-bypassing subscription creation
    stripe/                   Stripe checkout, webhooks, portal
  auth/                       OAuth callback pages
    callback/employer/        Google sign-in → employer account (page.tsx)
    callback/employee/        Google sign-in → candidate account (page.tsx)
    confirm/                  Email confirmation callback (route.ts)
  dashboard/                  Candidate dashboard
  employer/dashboard/         Employer dashboard
  jobs/                       Job listing + search + apply
  candidates/                 Candidate browse + detail (employer view)
  post-job/                   Job posting form
  my-jobs/                    Employer job management + applications
  applications/               Candidate application tracking
  interviews/                 Employer interview management
  messages/                   In-app messaging
  settings/                   All settings pages (profile, company, availability, etc.)
  register/                   Registration (employer-free, employer, employee)
  login/                      Login (employer, employee)

components/                   Shared React components
  GoogleSignInButton.tsx      Google OAuth sign-in button
  Header.tsx                  Global header/nav
  JobSeekerProfileForm.tsx    Multi-step candidate registration form
  NotificationBell.tsx        Notification dropdown
  PostcodeLookup.tsx          UK postcode → address dropdown
  ScheduleInterviewModal.tsx  Interview scheduling modal

lib/                          Shared utilities and types
  authCallback.ts             OAuth callback logic (used by /auth/confirm)
  googleCalendar.ts           Google Calendar API helpers
  mockCandidates.ts           Candidate type + DEV_MODE fixtures
  mockJobs.ts                 Job type definition
  supabase.ts                 Supabase client (anon key, localStorage sessions)
  types.ts                    DB↔Frontend type mappers
  subscription-tiers.ts       Pricing tier definitions

emails/                       Email templates (Resend HTML)
  welcome.ts                  Employer welcome
  candidate-welcome.ts        Candidate welcome
  interview-scheduled.ts      Interview booked
  interview-reminder.ts       24h/1h interview reminder
  job-expired.ts              Auto-expiry notification
  application-status.ts       Status change (reviewed, offered, hired, rejected)

supabase/migrations/          SQL migration files (some applied via MCP, not all saved locally)
```

## Key Features

- **Job posting** with pre-screening questions, AI-generated descriptions, category/tag system
- **Candidate profiles** with multi-step registration, CV builder, skills, work history
- **Application pipeline** — Applied → Viewed → Shortlisted → Interview → Offer → Hired
- **Pre-interview interest check** — employer invites, candidate confirms before scheduling
- **Interview scheduling** with proposed time slots, calendar sync
- **Google Calendar two-way sync** — events created/updated/deleted on booking/reschedule/cancel
- **ICS calendar feed** per employer
- **In-app messaging** between employers and candidates
- **Notification system** — in-app bell + email notifications for status changes
- **Company profile auto-fill** via Firecrawl + Claude (scrape website → extract company info)
- **Postcode lookup** via Postcoder (street-level UK address dropdown)
- **Google OAuth** sign-in for both employers and candidates (separate callback paths)
- **Email verification** before dashboard access (email/password registrations)
- **Pre-screening questions** on job listings (up to 5, required/optional)
- **Employer subscription** — free launch tier (6 months, 600 cap) + Stripe paid tiers
- **Job auto-expiry** — active jobs > 60 days old automatically expire
- **Interview reminders** — daily cron sends 24h reminders
- **Admin panel** at /admin (user management, analytics, waitlist)

## Environment Variables Needed

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_STANDARD_PRICE_ID
STRIPE_PROFESSIONAL_PRICE_ID
STRIPE_BOOST_PROFILE_7_PRICE_ID
STRIPE_BOOST_PROFILE_14_PRICE_ID
STRIPE_BOOST_PROFILE_30_PRICE_ID
STRIPE_BOOST_JOB_7_PRICE_ID
STRIPE_BOOST_JOB_14_PRICE_ID
STRIPE_BOOST_JOB_30_PRICE_ID

# Email
RESEND_API_KEY

# AI
ANTHROPIC_API_KEY

# Firecrawl (company auto-fill)
FIRECRAWL_API_KEY

# Postcoder (UK address lookup)
POSTCODER_API_KEY

# Google Calendar OAuth
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

# App
NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_DEV_MODE
NEXT_PUBLIC_MOCK_USER_TYPE
CRON_SECRET
```

## Current Status (April 2026)

### Recently completed
- Google OAuth sign-in for employers and candidates (separate callback paths)
- Pre-interview interest check flow
- Pre-screening questions on job listings
- Google Calendar two-way sync
- Company auto-fill via Firecrawl + Claude (now extracts logo, industry, company size)
- Postcoder address lookup (replaced getAddress.io)
- Email verification on registration
- Interview reminder cron + job auto-expiry cron
- Status-change notifications (reviewing, offered, hired)
- Free launch offer updated to "6 for 600" (6 months free, 600 employer cap)
- Sector-agnostic copy sweep (removed hospitality-specific defaults)

### Known issues / next steps
- **Resend domain not verified** — emails send from `onboarding@resend.dev` which only delivers to the account owner's email. Verify `thrivecareer.co.uk` in Resend to send to all recipients.
- **Google OAuth consent screen** is in testing mode — only test users added in Google Cloud Console can sign in. Publish the OAuth app for production use.
- **Supabase redirect URLs** — ensure all callback paths are in the allowlist (see auth/callback/employer, auth/callback/employee, auth/confirm).
- **Vercel Hobby plan** limits crons to daily — interview reminders run at 7am UTC (can't do 1-hour-before reminders without Pro plan).
- **FIRECRAWL_API_KEY** not set for Preview environment (CLI bug prevents adding).
- **POSTCODER_API_KEY** not set for Preview environment (same CLI bug).

## Database (Supabase)

30 tables in public schema. Key tables:
- `auth.users` — Supabase auth users
- `candidate_profiles` — candidate data (53 columns)
- `employer_profiles` — employer data (including gcal tokens, ICS feed token)
- `employer_subscriptions` — subscription tier + status + trial end date
- `jobs` — job listings (including screening_questions JSONB)
- `job_applications` — applications (including screening_answers, interview_interest_status)
- `interviews` — interview records with proposed slots
- `interview_bookings` — confirmed bookings with calendar sync IDs
- `conversations` / `messages` — in-app messaging
- `notifications` — in-app notification queue
- `employer_availability` / `employer_availability_overrides` — scheduling availability

RLS is enabled on candidate_profiles and employer_profiles. Server endpoints use the service-role key to bypass RLS for profile/subscription creation during registration.
