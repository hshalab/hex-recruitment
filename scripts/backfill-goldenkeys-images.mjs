// Give the imported Goldenkeys jobs the Goldenkeys logo + a role-appropriate
// banner, reusing the original 35 curated images already in the job-banners bucket.
//
// Each curated image is bucketed by its ORIGINAL role (authoritative map below),
// NOT by whatever title happens to carry it now — so e.g. the cigar images only
// ever land on cigar roles. Jobs are spread across their bucket's full image set
// (deterministic hash) so a role isn't a wall of one identical photo.

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const EMPLOYER_ID = '9eb99b46-2b86-454c-be37-30a34e11a3ed'
const DRY = process.argv.includes('--dry-run')
const PREFIX = 'https://aaljufxcniacfggqiuls.supabase.co/storage/v1/object/public/job-banners/'

// Authoritative original image set: [role bucket, uuid, original title].
const CURATED = [
  ['cigar', '8799b00b-def2-49dd-a213-883d1d550524', 'Bar Manager – Cigar Lounge'],
  ['cigar', 'e391d388-2919-44fc-8831-6d3644999036', 'Head of Cigars'],
  ['chef', '14131ee8-e483-46d2-9036-4604715f1b26', 'Breakfast Chef'],
  ['chef', 'a30cde8a-a1d1-49e1-a31d-715069320261', 'Breakfast Chef 2'],
  ['chef', '08ef43f8-a958-49cf-94ea-73585daf301a', 'Chef De Partie 3 Rosette'],
  ['chef', '4e6a87e4-369e-42d3-bf80-d44557703ee2', 'Chef De Partie Boutique'],
  ['chef', 'dca93c5f-c063-4e27-a677-f4941d11d60e', 'Chef De Partie French'],
  ['chef', '9b4d83ac-d6df-44c6-ad27-e2261ebae042', 'Chef De Partie Luxury'],
  ['chef', '98abff83-4a68-4460-a92b-bfe5fb20b2e0', 'Chef De Partie Fine Dining'],
  ['chef', 'b050e97c-e4b1-4845-b81c-ccbf9b9c4499', 'Demi Chef De Partie'],
  ['chef', '98239683-6bbc-4d69-936b-a14387492d50', 'Development Sous Chef'],
  ['chef', 'ba9d9ffd-da5a-4866-ba0e-a45bf05151d3', 'Executive Sous Chef'],
  ['chef', '9b1ea2bd-2f65-4060-9ef1-7b7373bcd671', 'Head Chef'],
  ['chef', 'aa6d04f2-0f4b-4dc7-9439-9cc95b7e1d46', 'Head Chef 3 Rosette'],
  ['chef', '8fe8f3b1-242a-42d9-867a-399c996d4e04', 'Head Chef Michelin'],
  ['chef', '3d04bb78-fdfd-4886-b911-75ed45c60115', 'Head Chef Fine Dining'],
  ['chef', 'c66ee479-0c1f-4239-8f50-5f2dee4bdc8a', 'Junior Sous Chef'],
  ['chef', 'b5405d87-5aa6-42bc-aaed-2fff6ac49450', 'Senior Chef De Partie'],
  ['chef', 'e39f3b43-d352-4ace-af2a-b3cdbe579bdd', 'Senior Sous Chef'],
  ['chef', '8c228b9b-443b-4832-ac02-f34621ebe33b', 'Sous Chef Fine Dining'],
  ['chef', '92d4bdd9-1b7e-46a3-b822-e1c916e1f9a8', 'Sous Chef Stylish'],
  ['pastry', '3ab0eab2-d49c-4d50-a452-b97c81b50ea2', 'Head Pastry Chef Elite'],
  ['pastry', '9b09e5ae-1a3d-467e-93a6-853fb6353885', 'Head Pastry Chef Luxury'],
  ['pastry', '6268a7ef-50ca-4774-9d62-4eaa2589a19c', 'Night Baker'],
  ['sommelier', '4421aee5-9682-4d77-93b5-ba75f99d9456', 'Sommelier'],
  ['waiter', '1e994952-6a58-4485-acac-453e5134392a', 'Head Waiter/Waitress'],
  ['reception', 'a839b943-f445-4b9e-b15e-c898de4902ea', 'Night Receptionist'],
  ['reception', 'd94b3779-88c6-4c32-9af9-f52be917c457', 'Receptionist'],
  ['housekeep', '9760fa84-ee5f-4f24-a332-ef01921c2df5', 'Private Housekeeper'],
  ['engineer', 'f878accc-2693-4c65-ab3c-ca1f403bc2d5', 'Plant Shift Engineer'],
  ['engineer', '7acd04d8-3644-4b68-a2e5-a89b15416ae2', 'Shift Engineer Elite'],
  ['engineer', '99b24b3b-7aa7-41f8-b38c-386958252cfc', 'Shift Engineer Residential'],
  ['bar', '1d1424b2-9623-42bc-a4c9-988bbd289793', 'Lounge Manager'],
  ['manager', '7e198ec5-b9fb-4b34-9a6b-69d1562d4eb2', 'General Manager'],
  ['manager', '7cdec3bf-2d39-4924-b9b4-a51077dd1dbe', 'Restaurant Manager'],
]

// Job title -> role bucket. cigar BEFORE bar so only cigar roles get cigar images.
const RULES = [
  ['cigar', /cigar/i],
  ['pastry', /pastry|baker|patiss|viennoiserie/i],
  ['sommelier', /sommelier|wine/i],
  ['bar', /\b(bar|bartend|mixolog|lounge)\b/i],
  ['reception', /reception|concierge|front desk|guest (service|relation)/i],
  ['housekeep', /housekeep|room attendant|linen|laundry|valet/i],
  ['engineer', /engineer|maintenance|technician|\bplant\b|facilities/i],
  ['waiter', /waiter|waitress|server|\brunner\b|\bhost\b|f&b|food (and|&) beverage/i],
  ['chef', /chef|\bcook\b|kitchen|culinary|commis|larder|grill|breakfast/i],
  ['manager', /manager|director|head of|supervisor|\bgm\b|duty|sales|events?|banquet|spa|marketing|hr|people|talent/i],
]
const classify = t => (RULES.find(([, re]) => re.test(t || '')) || ['manager'])[0] // default to a neutral venue image
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const run = async () => {
  const { data: emp } = await supa.from('employer_profiles').select('logo_url').eq('user_id', EMPLOYER_ID).maybeSingle()
  const LOGO = emp?.logo_url
  if (!LOGO) throw new Error('No Goldenkeys logo on employer profile')

  const pool = {} // bucket -> [urls]
  for (const [bucket, uuid] of CURATED) (pool[bucket] ||= []).push(PREFIX + uuid + '.webp')
  console.log('pool sizes:', Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.length])))

  const { data: jobs } = await supa.from('jobs').select('id, title').eq('employer_id', EMPLOYER_ID)
  const dist = {}
  for (const j of jobs) {
    const b = classify(j.title)
    const list = pool[b] && pool[b].length ? pool[b] : pool.manager
    const banner = list[hash(j.title + j.id) % list.length]
    dist[b] = (dist[b] || 0) + 1
    if (!DRY) {
      const { error } = await supa.from('jobs').update({ company_logo_url: LOGO, company_banner_url: banner }).eq('id', j.id)
      if (error) throw error
    }
  }
  console.log(`${DRY ? '[DRY] ' : ''}imaged ${jobs.length}. by bucket:`, JSON.stringify(dist))
}
run().catch(e => { console.error(e); process.exit(1) })
