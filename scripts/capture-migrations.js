#!/usr/bin/env node
// THE ONE-COMMAND CAPTURE. Writes a .sql file for every ledger row that has
// none, taking the statements STRAIGHT FROM THE LEDGER.
//
//   npm run migrations:capture           write the missing files
//   npm run migrations:capture -- --dry  list what it would write
//
// Nothing here is retyped or reconstructed from memory. A migration file that
// does not match production is worse than a missing one, because it looks like
// coverage.
//
// It applies nothing and changes no schema — it only makes the repo describe
// the database that already exists.

const fs = require('fs')
const path = require('path')
const { MIGRATIONS_DIR, ledgerVsFiles, fileNameFor, bodyFor } = require('./migrations-lib')

;(async () => {
  const dry = process.argv.includes('--dry')
  const { missing } = await ledgerVsFiles()

  if (!missing.length) {
    console.log('migrations: nothing to capture — every ledger row already has a file.')
    return
  }

  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true })
  let written = 0
  for (const row of missing) {
    const name = fileNameFor(row)
    const body = bodyFor(row)

    if (!row.body.trim()) {
      console.log(`SKIP    ${name} — the ledger stored no statements for this row, so it cannot be recovered this way`)
      continue
    }
    if (dry) {
      console.log(`would write ${name}  ${body.length} bytes`)
      continue
    }
    fs.writeFileSync(path.join(MIGRATIONS_DIR, name), body, 'utf8')
    console.log(`wrote ${name}  ${body.length} bytes`)
    written++
  }

  if (!dry) {
    console.log(`\n${written} file(s) written. Review and commit them — then \`npm run migrations:check\` passes.`)
  }
})().catch(e => { console.error('\nmigrations:capture failed —', e.message); process.exitCode = 1 })
