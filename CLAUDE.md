# Thrive — working agreements

Standing rules for Claude Code on this project. These override default behaviour.

## Process

- **Read-only / diagnosis prompts must not write code, create branches, or modify the database or storage without explicit approval.** When a task is framed as a diagnosis / "map & plan" / read-only, produce a findings report + a proposed plan (with migration SQL for review) and STOP for the go before building or applying anything.

- **Branch only. Nothing merges until Paul says go.** Work on a branch off `main`, push it, report. Merging, deploying and closing a branch are his call, every time — including when the work is obviously finished.
- **Diagnose first, then STOP, for anything non-trivial.** Report findings and a proposed plan, and wait. Being blocked is cheaper than undoing.
- **Reports come back as a Gmail draft, subject `claude code report`.** Not as chat alone — the draft is what he reads and forwards.

## Saying what you actually did

- **Say plainly what you DROVE and what you only READ. Never dress up one as the other.** "Verified" means a browser was pointed at it and something was clicked. If a state could not be reached — no data existed, the account was wrong, it would have touched real rows — say so and say why, rather than reasoning about the code and calling that verification. Every UI bug found on this project so far was found by a person unable to click something, never by reading.
- Give rollback targets **read at the time**, not from memory.

## Live data and email

- **The 247 live listings, and all Host and Goldenkeys data, are READ ONLY.** Real employer and candidate rows are read-only too, without Paul's explicit per-task authorisation naming the rows.
- **The preview shares production's database AND a live Resend key.** So the dangerous surface is not the UI, it is the triggers. Before any action that could notify or email, check from the rows *who it would reach*. Never send to an address that isn't Paul's or a test account's.
- Guard destructive writes with a condition that makes the wrong target impossible (`and status = 'filled'`, an explicit id list), and count dependent rows **before and after** so "nothing cascaded" is a measurement, not a hope.
- **Clean up what you create**, and state in every report what was made and whether it still exists.

## Previews and secrets

- **Use `VERCEL_AUTOMATION_BYPASS_SECRET` as a header, never a share link.** Share links are bound to one URL, die on the next deployment, and have expired mid-session. Drive previews with the repo's own Playwright.
- **Read secrets from the environment inside a script.** No credential may reach a URL, a log, a commit message, a report or a Gmail draft. If one ever appears in a diff about to be committed, stop and say so.

## Migrations

- **Apply, capture, commit.** `apply_migration` writes the database and the ledger but never a `.sql` file, which is how six migrations once went four days unfiled — including the one creating a bucket the app fails closed without.
  - `npm run migrations:check` — fails if the ledger holds anything the repo doesn't
  - `npm run migrations:capture` — writes the missing files from the ledger
- Never run `supabase db push`.
- Verify a captured migration by **convergence** — does the last definition of each object match what is live? — not by comparing it to the ledger it came from, which is circular.

## A habit that has earned its place

- **For any control, ask which states the object can actually be in, and whether the control should exist in each.** The gate always gets written for the state in mind while building — the fresh, happy one: no comments yet, no jobs yet, shift still open. The states that come *later* are the ones nobody looked at. Three bugs so far were this exact shape: a reply button that only existed once someone had replied; a section that only rendered once a job was posted; Close only existing while a post was open.

## Product boundary

- **Thrive is a recruitment product, not HR/onboarding software.** Do not build visa/right-to-work compliance logic (visa types, hours-limited conditions, document acceptance, DBS levels, a rules engine, etc.) beyond a simple confirmation flag the employer ticks once they've verified through their own proper channel. Deeper compliance is integration territory (dedicated HR systems / a future integration), not something we model or store here — no candidate documents, no special-category data.
