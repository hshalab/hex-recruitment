// Use Goldenkeys' own per-vacancy featured image for each job card.
// Scrape all 19 listing pages (Firecrawl) for {detail_url -> image_url}, download
// each image into our public job-banners bucket, and set company_banner_url on the
// matching job (by source_url). Idempotent: image stored by content hash; re-runs
// overwrite the same object. Only touches jobs we can match to a live listing image.
//
// Usage: node scripts/import-goldenkeys-images.mjs [--enumerate] [--apply] [--dry-run] [--all]

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const EMPLOYER_ID = '9eb99b46-2b86-454c-be37-30a34e11a3ed'
const BASE = 'https://goldenkeys.co.uk/industry/hospitality/'
const PAGES = 19
const BUCKET = 'job-banners'
const SCRATCH = path.join(process.cwd(), 'scripts', '.goldenkeys')
const MAP_FILE = path.join(SCRATCH, 'images.json')
const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const FC = env.FIRECRAWL_API_KEY
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const cleanUrl = u => { try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/?$/, '/')}` } catch { return null } }

async function fcScrape(url, schema, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FC}` },
        body: JSON.stringify({ url, formats: ['json'], jsonOptions: { schema }, timeout: 30000 }),
      })
      if (r.status === 429) { await sleep(4000 * t); continue }
      const j = await r.json()
      if (j?.data?.json) return j.data.json
    } catch { /* retry */ }
    await sleep(1500 * t)
  }
  return null
}

async function enumerate() {
  fs.mkdirSync(SCRATCH, { recursive: true })
  const schema = { type: 'object', properties: { jobs: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, image: { type: 'string' } } } } } }
  const map = {} // detail_url -> image_url
  for (let p = 1; p <= PAGES; p++) {
    const url = p === 1 ? BASE : `${BASE}page/${p}/`
    const data = await fcScrape(url, schema)
    let added = 0
    for (const j of data?.jobs || []) {
      const u = cleanUrl(j.url)
      if (u && u.includes('/vacancies/') && j.image && !map[u]) { map[u] = j.image; added++ }
    }
    console.log(`page ${p}: +${added} (total ${Object.keys(map).length})`)
    await sleep(400)
  }
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2))
  const imgs = new Set(Object.values(map))
  console.log(`\nMapped ${Object.keys(map).length} vacancies -> ${imgs.size} distinct images`)
}

const EXT = ct => ct?.includes('png') ? 'png' : ct?.includes('webp') ? 'webp' : 'jpg'

async function apply() {
  const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
  const { data: jobs, error } = await supa.from('jobs').select('id, title, source_url, company_banner_url').eq('employer_id', EMPLOYER_ID)
  if (error) throw error
  const targets = jobs.filter(j => j.source_url && map[j.source_url])
  console.log(`GK jobs: ${jobs.length} | with a live listing image: ${targets.length}`)

  let uploaded = 0, set = 0, failed = 0
  const publicUrlOf = p => supa.storage.from(BUCKET).getPublicUrl(p).data.publicUrl
  for (const j of targets) {
    const src = map[j.source_url]
    try {
      const key = crypto.createHash('sha256').update(src).digest('hex').slice(0, 20)
      const res = await fetch(src)
      if (!res.ok) { failed++; continue }
      const ct = res.headers.get('content-type') || 'image/jpeg'
      const buf = Buffer.from(await res.arrayBuffer())
      const objPath = `goldenkeys/${key}.${EXT(ct)}`
      if (!DRY) {
        const up = await supa.storage.from(BUCKET).upload(objPath, buf, { contentType: ct, upsert: true })
        if (up.error) throw up.error
        uploaded++
        const publicUrl = publicUrlOf(objPath)
        const { error: uerr } = await supa.from('jobs').update({ company_banner_url: publicUrl }).eq('id', j.id)
        if (uerr) throw uerr
        set++
      } else { uploaded++; set++ }
    } catch (e) { failed++; console.error('  fail', j.title, e.message) }
  }
  console.log(`${DRY ? '[DRY] ' : ''}uploaded ${uploaded}, banner set on ${set}, failed ${failed}`)
}

const run = async () => {
  if (args.has('--all') || args.has('--enumerate')) await enumerate()
  if (args.has('--all') || args.has('--apply')) await apply()
  if (![...args].some(a => ['--all', '--enumerate', '--apply'].includes(a))) console.log('phases: --enumerate | --apply [--dry-run] | --all')
}
run().catch(e => { console.error(e); process.exit(1) })
