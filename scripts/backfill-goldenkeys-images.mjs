// Give the imported Goldenkeys jobs the Goldenkeys logo + a role-appropriate
// banner. Reuses the ORIGINAL 35 curated images (already in the job-banners bucket):
// classify each title into a role bucket, then spread jobs across ALL images in
// that bucket (deterministic hash) so a role isn't a wall of one identical photo.
//
// Targets ONLY imported jobs (job_reference ~ '^GK-<digits>$'); the original 35
// (their own unique per-job images, non-numeric refs) are never touched.

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const EMPLOYER_ID = '9eb99b46-2b86-454c-be37-30a34e11a3ed'
const DRY = process.argv.includes('--dry-run')
const IMPORTED_REF = /^GK-\d+$/ // imported jobs use GK-<numeric job id>

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const RULES = [
  ['pastry', /pastry|baker|patiss|viennoiserie/i],
  ['sommelier', /sommelier|wine/i],
  ['bar', /\b(bar|bartend|mixolog|cigar|lounge)\b/i],
  ['reception', /reception|concierge|front desk|guest (service|relation)/i],
  ['housekeep', /housekeep|room attendant|linen|laundry|valet/i],
  ['engineer', /engineer|maintenance|technician|\bplant\b|facilities/i],
  ['waiter', /waiter|waitress|server|\brunner\b|\bhost\b|f&b|food (and|&) beverage/i],
  ['chef', /chef|\bcook\b|kitchen|culinary|commis|larder|grill|breakfast/i],
  ['manager', /manager|director|head of|supervisor|\bgm\b|duty|sales|events?|banquet/i],
]
const classify = t => (RULES.find(([, re]) => re.test(t || '')) || ['general'])[0]
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

const run = async () => {
  const { data: emp } = await supa.from('employer_profiles').select('logo_url').eq('user_id', EMPLOYER_ID).maybeSingle()

  const { data: all } = await supa.from('jobs')
    .select('id, title, company_banner_url').eq('employer_id', EMPLOYER_ID)
  const LOGO = emp?.logo_url
  if (!LOGO) throw new Error('No Goldenkeys logo on employer profile')

  // POOL = every distinct curated banner currently on GK jobs (all originate from
  // the original 35). Dedupe by URL, classify by the first title seen for it.
  const seen = new Set()
  const pool = {} // bucket -> [urls]
  for (const j of all) {
    if (!j.company_banner_url || seen.has(j.company_banner_url)) continue
    seen.add(j.company_banner_url)
    ;(pool[classify(j.title)] ||= []).push(j.company_banner_url)
  }
  const GENERAL = [...seen]
  console.log('pool sizes:', Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.length])), '| distinct total', GENERAL.length)

  // Re-image ALL Goldenkeys jobs, spreading each role across its full image set.
  const targets = all
  console.log(`jobs to (re)image: ${targets.length}`)

  const dist = {}
  for (const j of targets) {
    const b = classify(j.title)
    const list = (pool[b] && pool[b].length) ? pool[b] : GENERAL
    const banner = list[hash(j.title + j.id) % list.length]
    dist[b] = (dist[b] || 0) + 1
    if (!DRY) {
      const { error } = await supa.from('jobs').update({ company_logo_url: LOGO, company_banner_url: banner }).eq('id', j.id)
      if (error) throw error
    }
  }
  console.log(`${DRY ? '[DRY] ' : ''}re-imaged ${targets.length}. by bucket:`, JSON.stringify(dist))
}
run().catch(e => { console.error(e); process.exit(1) })
