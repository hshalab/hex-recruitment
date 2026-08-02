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

## State beats screen

- **When a driven check says "nothing happened", confirm from the database before reporting it.** Twice in one session a UI check read as a clean pass when the click had never landed — once because the button label carried an icon the selector didn't expect, once because a chat widget's send button was also a `type="submit"` and won `.last()`. Both would have been written up as product faults. What settled it was counting the rows.
- **A result too absolute to be true is the instrument, not the product.** "All six words missing", "no icon advertised at all", "the section doesn't exist" — check the tool first. Five such false alarms in one day, every one the harness.

## Defaults must not make claims

- **A form field may not assert something only the employer can state.** `employmentType` defaulted to Full-time, `contractType` to Permanent and `salaryPeriod` to hour — so an advert claimed a permanent full-time job nobody had chosen, and the AI generator then repeated it as a sentence in the employer's own voice.
- Distinguish a **convenience** (right nearly always, harmless when wrong — e.g. work location in a hospitality-only board) from a **claim** (only the employer knows). Fix the second kind at the data, not in the copy or the prompt: the wrong value still reaches the row, the card, the filters and the matching.
- **"Absurd, so someone would spot it" is only true on the page.** Six code paths annualise hourly pay before comparing, so a mis-set period misfires silently in matching long before a human reads the ad.

## Correct today because of the board, not because of the product

- Things that are right only because every live row is hospitality, and become wrong the day Thrive broadens: the **work-location default** ("In person"), the **sectors filter** (32 of 33 options match nothing), and the **site meta description** ("for restaurants, hotels and hospitality groups"). Hospitality is the starting vertical because that is where the contacts are, not what the product is. Recorded so nobody has to rediscover why they were left alone.

## No prices, anywhere

- **Publish no price, no monthly rate, and no trial length.** The tier structure is undecided and will stay undecided until the platform has many more users — possibly a year. Any figure published now is one that has to be walked back, and walking a price back is worse than never naming one, especially to the founding employers being signed up now, who will remember what they were told.
- A **trial length is a price claim in disguise** — "3 months free" only means something against what happens in month four. So is anything of the shape "free for X, then Y".
- **The one allowed money claim is the founding-cohort offer**, because it is an offer actually being run and can be honoured: *the first 100 employers get 12 months free, no card needed*. Free-while-we-build is fine.
- This covers page copy, meta and Open Graph descriptions, JSON-LD, email templates, the chatbot, and Stripe product descriptions — anywhere a number can reach a stranger.
- **Check the deployed HTML, not the source.** The £99 that reached Google sat in the ROOT description, so it was served on the homepage, on `/waitlist`, and on every 404 — including `/pricing`, `/for-employers` and `/employers`, which are not routes at all.

## A habit that has earned its place

- **For any control, ask which states the object can actually be in, and whether the control should exist in each.** The gate always gets written for the state in mind while building — the fresh, happy one: no comments yet, no jobs yet, shift still open. The states that come *later* are the ones nobody looked at. Three bugs so far were this exact shape: a reply button that only existed once someone had replied; a section that only rendered once a job was posted; Close only existing while a post was open.

## Product boundary

- **Thrive is a recruitment product, not HR/onboarding software.** Do not build visa/right-to-work compliance logic (visa types, hours-limited conditions, document acceptance, DBS levels, a rules engine, etc.) beyond a simple confirmation flag the employer ticks once they've verified through their own proper channel. Deeper compliance is integration territory (dedicated HR systems / a future integration), not something we model or store here — no candidate documents, no special-category data.
