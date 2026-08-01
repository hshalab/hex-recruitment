// Shared plumbing for the migration guards.
//
// WHY THESE EXIST: `apply_migration` (the Supabase MCP) writes the DATABASE and
// the LEDGER — supabase_migrations.schema_migrations — but never a .sql file in
// this repo. On 1 Aug 2026 that had left six migrations live with no file on any
// branch, including the one that creates the company-logos bucket, which the
// logo upload FAILS CLOSED without. A schema rebuilt from migrations would not
// have drifted quietly; it would have taken every logo upload down.
//
// The real failure was not the drift, it was that it went unnoticed for four
// days. So the check exists to make it loud, and the capture exists to make
// fixing it one command.

const fs = require('fs')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const MIGRATIONS_DIR = path.join(REPO, 'supabase', 'migrations')

function readEnvLocal() {
  const file = path.join(REPO, '.env.local')
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

function projectRef() {
  const env = readEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ''
  const m = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)
  if (!m) throw new Error('Could not read the project ref from NEXT_PUBLIC_SUPABASE_URL in .env.local')
  return m[1]
}

function accessToken() {
  const t = process.env.SUPABASE_ACCESS_TOKEN
  if (!t) {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN is not set.\n' +
      'It is a personal access token from https://supabase.com/dashboard/account/tokens.\n' +
      'Set it in your shell, not in .env.local — nothing should commit it.'
    )
  }
  return t
}

/** Runs SQL through the Management API. Never logs the token or the SQL. */
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

const LEDGER_SQL = `select version, name, coalesce(array_to_string(statements, E';\\n'), '') as body
                    from supabase_migrations.schema_migrations order by version`

/** Ledger rows joined to whether a matching .sql file exists locally. */
async function ledgerVsFiles() {
  const rows = await query(LEDGER_SQL)
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
    : []
  const versionsOnDisk = new Set(files.map(f => f.split('_')[0]))
  return {
    rows,
    files,
    missing: rows.filter(r => !versionsOnDisk.has(r.version)),
    orphanFiles: files.filter(f => !rows.some(r => r.version === f.split('_')[0])),
  }
}

function fileNameFor(row) {
  return `${row.version}_${row.name}.sql`
}

/**
 * The bytes a captured file should hold.
 *
 * The ledger stores statements WITHOUT their trailing semicolon and
 * array_to_string rejoins them with one, so the final statement needs its own to
 * make the file valid SQL on replay.
 */
function bodyFor(row) {
  return row.body.trimEnd().replace(/;?$/, ';') + '\n'
}

module.exports = { REPO, MIGRATIONS_DIR, query, ledgerVsFiles, fileNameFor, bodyFor }
