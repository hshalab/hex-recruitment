# Legacy migrations — applied, but never recorded

These 18 SQL files predate this project's migration history. Every object they
create **already exists in production** (verified 2026-07-20 against project
`aaljufxcniacfggqiuls`), but none of them has a row in
`supabase_migrations.schema_migrations` — the earliest recorded migration is
`20260407082712_interview_scheduling_system`, and this schema was built before
that tracking began.

## Why they are here and not in `supabase/migrations/`

They cannot be given timestamp prefixes. A migration file whose version is not in
`schema_migrations` is treated by the CLI as **pending**, so naming these would
make `supabase db push` attempt to re-run the original `create table` statements
against live data.

Leaving them bare-named in `supabase/migrations/` would also have worked — the CLI
ignores non-conforming filenames — but that relies on unverified CLI behaviour and
reads as an accident rather than a decision. Moving them here puts them
definitively outside the CLI's path while preserving the SQL as the only record of
the original schema.

**Do not move these back into `supabase/migrations/`, and do not add timestamp
prefixes to them.**

## Known issue parked in here

`create_platform_settings_table.sql` and `combined_migration.sql` are
near-duplicates, and are **partially applied** in production:

- `platform_settings` table — EXISTS
- `update_platform_settings_updated_at()` trigger function — **DOES NOT EXIST**

That gap is real and pre-existing. It needs a conscious decision (write a proper
forward migration for the missing function, or drop the intent), not a rename.

## Related open items

- 21 migrations recorded in production have no SQL file anywhere in this repo.
  Closing that needs `supabase db pull`, which requires linking the project.
- Some files here may correspond to those 21 under different names — e.g.
  `create_employer_members_and_membership_rls` ↔
  `employer_members_and_membership_rls_phase1` (20260702054754). Unconfirmed;
  matching them on a guess would re-open the push hazard.
