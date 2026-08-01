#!/usr/bin/env node
// THE LOUD CHECK. Exits non-zero if the database's migration ledger holds a
// version with no .sql file in this repo.
//
// It does not prevent drift — nothing run at push time can. It makes drift
// impossible to go unnoticed past the same day, which is the failure that
// actually happened: six migrations sat live and unfiled for four days because
// nothing was looking.
//
//   npm run migrations:check
//
// A check that fails without telling you the next command is half a tool, so
// the failure names the command that fixes it.

const { ledgerVsFiles, fileNameFor } = require('./migrations-lib')

;(async () => {
  const { rows, files, missing, orphanFiles } = await ledgerVsFiles()

  if (orphanFiles.length) {
    console.log(`\nNOTE: ${orphanFiles.length} .sql file(s) have no ledger row — never applied, or applied to a different project:`)
    for (const f of orphanFiles.slice(0, 10)) console.log(`  ${f}`)
  }

  if (!missing.length) {
    console.log(`migrations: OK — ${rows.length} ledger rows, ${files.length} files, nothing uncaptured.`)
    return
  }

  console.error(`\nMIGRATION DRIFT — ${missing.length} migration(s) are live on the database with no .sql file in this repo:\n`)
  for (const r of missing) console.error(`  ${fileNameFor(r)}`)
  console.error(`
This matters more than it looks. A schema rebuilt from supabase/migrations would
silently be missing these — and at least one past instance created a storage
bucket that application code fails closed without.

TO FIX, run:

  npm run migrations:capture

then commit the files it writes. Nothing is applied and no schema changes.
`)
  // SET exitCode, DO NOT CALL process.exit().
  //
  // process.exit() tears the process down while stdout is still draining. When
  // this runs through a pipe on Windows — which is exactly how it runs in a hook
  // or in CI — that aborts libuv mid-flush and the shell sees 127 instead of 1,
  // with the output truncated. A guard that reports the wrong exit code cannot
  // fail a push, which is the entire job. Found by piping it to `tail`.
  process.exitCode = 1
})().catch(e => {
  console.error('\nmigrations:check could not run —', e.message)
  process.exitCode = 2
})
