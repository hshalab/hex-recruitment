// Re-runnable Goldenkeys hospitality import.
//   Scrape (Firecrawl) all /industry/hospitality/ listing pages + each
//   /vacancies/<slug>/ detail page -> upsert under the Goldenkeys employer,
//   idempotent on jobs.source_url -> reconcile roles that have gone (status=filled).
//
// Usage:
//   node scripts/import-goldenkeys.mjs --enumerate   # scrape listings -> URL list (scratch json)
//   node scripts/import-goldenkeys.mjs --scrape      # scrape detail pages -> records (scratch json)
//   node scripts/import-goldenkeys.mjs --apply --dry-run   # plan writes, no DB changes
//   node scripts/import-goldenkeys.mjs --apply             # backfill + upsert + reconcile
//   node scripts/import-goldenkeys.mjs --all               # enumerate + scrape + apply
// Env (from .env.local): FIRECRAWL_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const EMPLOYER_ID = '9eb99b46-2b86-454c-be37-30a34e11a3ed'
const COMPANY = 'Goldenkeys Recruitment'
const BASE = 'https://goldenkeys.co.uk/industry/hospitality/'
const PAGES = 19
const SCRATCH = process.env.GK_SCRATCH || path.join(process.cwd(), 'scripts', '.goldenkeys')
const ENUM_FILE = path.join(SCRATCH, 'urls.json')
const REC_FILE = path.join(SCRATCH, 'records.json')

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')

// ── env ──
function loadEnv() {
  const f = fs.existsSync('.env.local') ? '.env.local' : '.env'
  const env = {}
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}
const ENV = loadEnv()
const FC_KEY = ENV.FIRECRAWL_API_KEY

function db() {
  return createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

// ── firecrawl ──
async function fcScrape(url, schema, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FC_KEY}` },
        body: JSON.stringify({ url, formats: ['json'], jsonOptions: { schema }, timeout: 30000 }),
      })
      if (r.status === 429) { await sleep(4000 * t); continue }
      const j = await r.json()
      if (j?.data?.json) return j.data.json
      if (t === tries) return null
    } catch (e) {
      if (t === tries) { console.error('  scrape failed', url, e.message); return null }
    }
    await sleep(1500 * t)
  }
  return null
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function pool(items, n, fn) {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }))
  return out
}

// ── parsing ──
const nums = s => (String(s || '').match(/\d[\d,]*\.?\d*/g) || []).map(x => Math.round(parseFloat(x.replace(/,/g, ''))))
function parseSalary(txt) {
  const n = nums(txt).filter(x => x >= 1000) // ignore stray small numbers
  if (!n.length) return { min: null, max: null }
  return { min: n[0], max: n[n.length - 1] }
}
const cleanLoc = l => String(l || '').replace(/,?\s*(uk|united kingdom)\.?$/i, '').trim() || null
// jobs.{responsibilities,requirements,benefits,work_authorization} are text[] —
// split a scraped bullet/paragraph string into an array of items.
function toArr(str) {
  if (!str) return null
  const items = String(str).split(/\r?\n+/).map(s => s.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean)
  return items.length ? items : null
}
const normTitle = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const cleanUrl = u => { try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/?$/, '/')}` } catch { return null } }

// ── phase: enumerate listing pages -> vacancy URLs ──
async function enumerate() {
  fs.mkdirSync(SCRATCH, { recursive: true })
  const schema = { type: 'object', properties: { jobs: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } } } } } }
  const seen = new Map()
  for (let p = 1; p <= PAGES; p++) {
    const url = p === 1 ? BASE : `${BASE}page/${p}/`
    const data = await fcScrape(url, schema)
    const jobs = data?.jobs || []
    let added = 0
    for (const j of jobs) {
      const u = cleanUrl(j.url)
      if (u && u.includes('/vacancies/') && !seen.has(u)) { seen.set(u, j.title || ''); added++ }
    }
    console.log(`page ${p}: ${jobs.length} listed, ${added} new (total ${seen.size})`)
    await sleep(500)
  }
  const list = [...seen].map(([url, title]) => ({ url, title }))
  fs.writeFileSync(ENUM_FILE, JSON.stringify(list, null, 2))
  console.log(`\nEnumerated ${list.length} unique vacancy URLs -> ${ENUM_FILE}`)
  return list
}

// ── phase: scrape detail pages -> normalized records ──
async function scrapeDetails() {
  const list = JSON.parse(fs.readFileSync(ENUM_FILE, 'utf8'))
  const schema = { type: 'object', properties: {
    title: { type: 'string' }, location: { type: 'string' }, salary_text: { type: 'string' },
    permanent: { type: 'boolean' }, full_time: { type: 'boolean' }, job_id: { type: 'string' },
    about: { type: 'string' }, responsibilities: { type: 'string' }, requirements: { type: 'string' },
    benefits: { type: 'string' }, right_to_work: { type: 'boolean' },
  } }
  let done = 0
  const recs = await pool(list, 5, async (item) => {
    const d = await fcScrape(item.url, schema)
    done++
    if (done % 20 === 0) console.log(`  scraped ${done}/${list.length}`)
    if (!d || !(d.title || item.title)) return null
    const sal = parseSalary(d.salary_text)
    const et = ['Full-time']; et.push(d.permanent === false ? 'Temporary' : 'Permanent')
    return {
      source_url: item.url,
      title: (d.title || item.title).trim(),
      location: cleanLoc(d.location),
      salary_min: sal.min, salary_max: sal.max, salary_type: 'annual',
      employment_type: et,
      description: (d.about || '').trim() || null,
      full_description: (d.about || '').trim() || null,
      responsibilities: (d.responsibilities || '').trim() || null,
      requirements: (d.requirements || '').trim() || null,
      benefits: (d.benefits || '').trim() || null,
      work_authorization: d.right_to_work ? 'Right to work in the UK required' : null,
      job_reference: d.job_id ? `GK-${String(d.job_id).trim()}` : null,
    }
  })
  const clean = recs.filter(Boolean)
  fs.writeFileSync(REC_FILE, JSON.stringify(clean, null, 2))
  console.log(`\nScraped ${clean.length}/${list.length} detail records -> ${REC_FILE}`)
  return clean
}

// ── phase: backfill + upsert + reconcile ──
async function apply() {
  const recs = JSON.parse(fs.readFileSync(REC_FILE, 'utf8'))
  // The full LIVE set is every enumerated vacancy URL (223), NOT only the ones we
  // managed to detail-scrape — so a detail-scrape failure never marks a live role
  // "filled". Un-scraped live roles are simply imported on the next run (idempotent).
  const enumList = JSON.parse(fs.readFileSync(ENUM_FILE, 'utf8'))
  const liveUrls = new Set(enumList.map(e => e.url))
  const supa = db()

  const { data: existing, error: exErr } = await supa
    .from('jobs').select('id, title, source_url, status').eq('employer_id', EMPLOYER_ID)
  if (exErr) throw exErr
  console.log(`Live listing URLs: ${liveUrls.size} | detail records: ${recs.length}`)
  console.log(`Existing GK jobs: ${existing.length} (active ${existing.filter(j => j.status === 'active').length})`)

  // 1) BACKFILL: match existing (no source_url) to a LIVE role by normalized title.
  const enumByNormTitle = new Map()
  for (const e of enumList) if (e.title && !enumByNormTitle.has(normTitle(e.title))) enumByNormTitle.set(normTitle(e.title), e.url)
  let matched = 0, unmatched = 0
  for (const j of existing) {
    if (j.source_url) continue
    const url = enumByNormTitle.get(normTitle(j.title))
    if (url && !existing.some(e => e.source_url === url)) {
      console.log(`  backfill: "${j.title}" -> ${url}`)
      if (!DRY) { const { error } = await supa.from('jobs').update({ source_url: url }).eq('id', j.id); if (error) throw error }
      j.source_url = url; matched++
    } else unmatched++
  }
  console.log(`Backfill: ${matched} matched to live URL, ${unmatched} unmatched`)

  // Refresh existing source_url map (post-backfill) for insert-vs-update decision.
  const urlToId = new Map(existing.filter(j => j.source_url).map(j => [j.source_url, j.id]))

  // 2) UPSERT each scraped role on source_url (update in place if known, else insert).
  let inserted = 0, updated = 0
  for (const r of recs) {
    const row = {
      ...r,
      // NOT-NULL columns: default missing salary to 0 ("not disclosed") and
      // location to 'UK' so a role with a "Competitive" salary still imports.
      salary_min: r.salary_min ?? 0,
      salary_max: r.salary_max ?? r.salary_min ?? 0,
      location: r.location || 'UK',
      responsibilities: toArr(r.responsibilities),
      requirements: toArr(r.requirements),
      benefits: toArr(r.benefits),
      work_authorization: r.work_authorization ? [r.work_authorization] : null,
      employer_id: EMPLOYER_ID, company: COMPANY, category: 'hospitality',
      is_recruiter_posting: true, status: 'active',
    }
    const id = urlToId.get(r.source_url)
    if (id) {
      if (!DRY) { const { error } = await supa.from('jobs').update(row).eq('id', id); if (error) throw error }
      updated++
    } else {
      if (!DRY) { const { error } = await supa.from('jobs').insert({ ...row, posted_at: new Date().toISOString() }); if (error) throw error }
      inserted++
    }
  }
  console.log(`Upsert: ${inserted} inserted, ${updated} updated in place`)

  // 3) RECONCILE: active GK jobs whose source_url is NOT in the LIVE listing -> filled.
  let filled = 0
  for (const j of existing) {
    const stillLive = j.source_url && liveUrls.has(j.source_url)
    if (j.status === 'active' && !stillLive) {
      console.log(`  reconcile filled: "${j.title}" (${j.source_url || 'no source_url'})`)
      if (!DRY) { const { error } = await supa.from('jobs').update({ status: 'filled' }).eq('id', j.id); if (error) throw error }
      filled++
    }
  }
  console.log(`Reconcile: ${filled} set to filled`)
  console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. scraped=${recs.length} inserted=${inserted} updated=${updated} backfilled=${matched} filled=${filled}`)
}

// ── main ──
const run = async () => {
  if (args.has('--all') || args.has('--enumerate')) await enumerate()
  if (args.has('--all') || args.has('--scrape')) await scrapeDetails()
  if (args.has('--all') || args.has('--apply')) await apply()
  if (![...args].some(a => ['--all', '--enumerate', '--scrape', '--apply'].includes(a))) {
    console.log('Specify a phase: --enumerate | --scrape | --apply [--dry-run] | --all')
  }
}
run().catch(e => { console.error(e); process.exit(1) })
