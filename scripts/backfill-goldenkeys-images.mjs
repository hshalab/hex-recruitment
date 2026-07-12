// Give the imported Goldenkeys jobs the Goldenkeys logo + a role-appropriate
// banner, matching the original 35. Reuses the existing curated banner images
// (already in the job-banners bucket) by classifying each job title into a role
// bucket and assigning that bucket's representative image. Only fills NULLs — the
// original 35 (their own per-job images) are never overwritten.

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const EMPLOYER_ID = '9eb99b46-2b86-454c-be37-30a34e11a3ed'
const DRY = process.argv.includes('--dry-run')

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Ordered role classifier — first match wins (pastry before chef, bar before manager…).
const RULES = [
  ['pastry', /pastry|baker|patiss|viennoiserie/i],
  ['sommelier', /sommelier|wine/i],
  ['bar', /\b(bar|bartend|mixolog|cigar|lounge)\b/i],
  ['reception', /reception|concierge|front desk|guest (service|relation)|nights? team/i],
  ['housekeep', /housekeep|room attendant|linen|laundry|valet/i],
  ['engineer', /engineer|maintenance|technician|\bplant\b|facilities/i],
  ['waiter', /waiter|waitress|server|\brunner\b|\bhost\b|f&b assistant|food (and|&) beverage assistant/i],
  ['chef', /chef|\bcook\b|kitchen|culinary|commis|larder|grill|breakfast/i],
  ['manager', /manager|director|head of|supervisor|\bgm\b|duty|sales|events?|banquet/i],
]
const classify = t => (RULES.find(([, re]) => re.test(t || '')) || ['general'])[0]

const run = async () => {
  // Logo: the Goldenkeys logo used by the original jobs (fall back to employer profile).
  const { data: logoJob } = await supa.from('jobs').select('company_logo_url').eq('employer_id', EMPLOYER_ID).not('company_logo_url', 'is', null).limit(1).maybeSingle()
  const { data: emp } = await supa.from('employer_profiles').select('logo_url').eq('user_id', EMPLOYER_ID).maybeSingle()
  const LOGO = logoJob?.company_logo_url || emp?.logo_url
  if (!LOGO) throw new Error('No Goldenkeys logo found')

  // Build bucket -> representative banner URL from the original images.
  const { data: withBanners } = await supa.from('jobs').select('title, company_banner_url').eq('employer_id', EMPLOYER_ID).not('company_banner_url', 'is', null)
  const bucketUrl = {}
  for (const j of withBanners || []) { const b = classify(j.title); if (!bucketUrl[b]) bucketUrl[b] = j.company_banner_url }
  const GENERAL = bucketUrl.general || bucketUrl.manager || bucketUrl.chef || withBanners?.[0]?.company_banner_url
  console.log('banner buckets available:', Object.keys(bucketUrl).join(', '), '| general fallback:', !!GENERAL)

  // Jobs needing a logo and/or banner.
  const { data: todo } = await supa.from('jobs').select('id, title, company_logo_url, company_banner_url').eq('employer_id', EMPLOYER_ID).or('company_logo_url.is.null,company_banner_url.is.null')
  console.log(`jobs needing images: ${todo.length}`)

  const counts = {}
  let logoSet = 0, bannerSet = 0
  for (const j of todo) {
    const patch = {}
    if (!j.company_logo_url) { patch.company_logo_url = LOGO; logoSet++ }
    if (!j.company_banner_url) {
      const b = classify(j.title)
      patch.company_banner_url = bucketUrl[b] || GENERAL
      counts[b] = (counts[b] || 0) + 1; bannerSet++
    }
    if (Object.keys(patch).length && !DRY) {
      const { error } = await supa.from('jobs').update(patch).eq('id', j.id)
      if (error) throw error
    }
  }
  console.log(`${DRY ? '[DRY] ' : ''}logo set on ${logoSet}, banner set on ${bannerSet}`)
  console.log('banner assignment by role bucket:', JSON.stringify(counts))
}
run().catch(e => { console.error(e); process.exit(1) })
