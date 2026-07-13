// Verifies the aggregator feed against live data via a LOCAL dev server (no SSO).
//   node scripts/verify-jobs-feed.mjs            (defaults to http://localhost:3210)
//   FEED_BASE=http://localhost:3000 node scripts/verify-jobs-feed.mjs
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { XMLValidator, XMLParser } from 'fast-xml-parser'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const BASE = process.env.FEED_BASE || 'http://localhost:3210'
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const fail = m => { console.error('❌ ' + m); process.exitCode = 1 }
const ok = m => console.log('✅ ' + m)

// 1. Pull the feed from the local route
const res = await fetch(`${BASE}/feed/jobs.xml`)
const ct = res.headers.get('content-type') || ''
const xml = await res.text()
console.log(`\nGET ${BASE}/feed/jobs.xml → ${res.status}, ${ct}, ${(xml.length / 1024).toFixed(1)}KB`)
if (!res.ok) { fail(`feed returned ${res.status}`); process.exit(1) }
ct.includes('xml') ? ok(`content-type is XML`) : fail(`content-type not XML: ${ct}`)

// 2. Well-formed XML?
const v = XMLValidator.validate(xml, { allowBooleanAttributes: true })
v === true ? ok('XML is well-formed (fast-xml-parser validator)') : fail(`XML invalid: ${JSON.stringify(v.err)}`)

// 3. Count in feed vs live active count
const feedCount = (xml.match(/<job>/g) || []).length
const { count: activeCount } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'active')
console.log(`\nfeed <job> count: ${feedCount}   |   DB active count: ${activeCount}`)
feedCount === activeCount ? ok('feed count matches live active count') : fail(`count mismatch (${feedCount} vs ${activeCount})`)

// 4. Spot-check a real active role (prefer one with salary + postcode)
const { data: sample } = await supabase.from('jobs')
  .select('id,title,company,location,full_location,salary_min,salary_type')
  .eq('status', 'active').gt('salary_min', 0).order('posted_at', { ascending: false }).limit(1)
const job = sample?.[0]
if (!job) { fail('no active job with salary found to spot-check') } else {
  console.log(`\nspot-check: "${job.title}" (${job.id})`)
  const urlOk = xml.includes(`/job/${job.id}`)
  urlOk ? ok(`apply URL points to Thrive /job/${job.id}`) : fail('apply URL missing')
  const city = job.full_location?.city || job.location
  city && xml.includes(`<![CDATA[${city}`) ? ok(`location present (${city})`) : console.log(`   (location "${city}" not matched verbatim — check manually)`)
  // Extract the sample's <job>…</job> block by its unique apply URL, then check salary
  const jobBlocks = xml.split('<job>').slice(1).map(b => '<job>' + b.split('</job>')[0] + '</job>')
  const block = jobBlocks.find(b => b.includes(`/job/${job.id}`)) || ''
  block.includes('<salary>') ? ok('salary tag present for the sample') : console.log('   (salary tag not detected in sample block — check manually)')
}

// 5. Confirm a filled/expired role is ABSENT
const { data: closed } = await supabase.from('jobs')
  .select('id,status').in('status', ['filled', 'expired']).limit(1)
if (!closed?.length) {
  console.log('\n(no filled/expired role in DB to test absence — skipped)')
} else {
  const c = closed[0]
  xml.includes(`/job/${c.id}`) ? fail(`closed role ${c.id} (${c.status}) IS in the feed`) : ok(`closed role ${c.id} (${c.status}) is absent from the feed`)
}

// 6. Parse sanity: root + a job has required tags
const parsed = new XMLParser({ ignoreAttributes: true }).parse(xml)
const jobsArr = parsed?.source?.job ? [].concat(parsed.source.job) : []
const first = jobsArr[0]
first && first.title && first.url && first.company ? ok('parsed structure has title/url/company') : fail('parsed job missing required tags')

console.log(`\nDone. exitCode=${process.exitCode || 0}`)
