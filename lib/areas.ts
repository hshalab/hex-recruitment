// Canonical UK area taxonomy + job→area resolver (Phase 2, preferred-areas model).
//
// Jobs are posted at mixed granularity — a county ("Surrey"), a town
// ("Henley-on-Thames"), an outcode ("RG17"), or a region ("South East"). We
// resolve each to a canonical REGION (always, ~99%) and, where possible, a
// canonical ceremonial COUNTY. Candidates pick regions/counties; matching is set
// overlap (see lib/recommendations.ts). Coordinates/distance are NOT used.
//
// Uses postcodes.io (free, no key, UK) for the town→area lift — the same client
// investment as the binned radius attempt, repurposed. Region is the reliable
// backbone; county needs a normalisation from administrative *unitary* names
// (e.g. "West Berkshire") to the ceremonial county a candidate would recognise
// ("Berkshire").

export type RegionId =
  | 'london' | 'south-east' | 'south-west' | 'east-of-england'
  | 'east-midlands' | 'west-midlands' | 'north-east' | 'north-west'
  | 'yorkshire-and-the-humber' | 'scotland' | 'wales' | 'northern-ireland'

export const REGIONS: { id: RegionId; name: string }[] = [
  { id: 'london', name: 'London' },
  { id: 'south-east', name: 'South East' },
  { id: 'south-west', name: 'South West' },
  { id: 'east-of-england', name: 'East of England' },
  { id: 'east-midlands', name: 'East Midlands' },
  { id: 'west-midlands', name: 'West Midlands' },
  { id: 'north-east', name: 'North East' },
  { id: 'north-west', name: 'North West' },
  { id: 'yorkshire-and-the-humber', name: 'Yorkshire & the Humber' },
  { id: 'scotland', name: 'Scotland' },
  { id: 'wales', name: 'Wales' },
  { id: 'northern-ireland', name: 'Northern Ireland' },
]

// Ceremonial counties → region. Names here are the candidate-facing ones.
export const COUNTIES: { id: string; name: string; region: RegionId }[] = [
  { id: 'greater-london', name: 'Greater London', region: 'london' },
  // South East
  { id: 'berkshire', name: 'Berkshire', region: 'south-east' },
  { id: 'buckinghamshire', name: 'Buckinghamshire', region: 'south-east' },
  { id: 'east-sussex', name: 'East Sussex', region: 'south-east' },
  { id: 'hampshire', name: 'Hampshire', region: 'south-east' },
  { id: 'isle-of-wight', name: 'Isle of Wight', region: 'south-east' },
  { id: 'kent', name: 'Kent', region: 'south-east' },
  { id: 'oxfordshire', name: 'Oxfordshire', region: 'south-east' },
  { id: 'surrey', name: 'Surrey', region: 'south-east' },
  { id: 'west-sussex', name: 'West Sussex', region: 'south-east' },
  // South West
  { id: 'bristol', name: 'Bristol', region: 'south-west' },
  { id: 'cornwall', name: 'Cornwall', region: 'south-west' },
  { id: 'devon', name: 'Devon', region: 'south-west' },
  { id: 'dorset', name: 'Dorset', region: 'south-west' },
  { id: 'gloucestershire', name: 'Gloucestershire', region: 'south-west' },
  { id: 'somerset', name: 'Somerset', region: 'south-west' },
  { id: 'wiltshire', name: 'Wiltshire', region: 'south-west' },
  // East of England
  { id: 'bedfordshire', name: 'Bedfordshire', region: 'east-of-england' },
  { id: 'cambridgeshire', name: 'Cambridgeshire', region: 'east-of-england' },
  { id: 'essex', name: 'Essex', region: 'east-of-england' },
  { id: 'hertfordshire', name: 'Hertfordshire', region: 'east-of-england' },
  { id: 'norfolk', name: 'Norfolk', region: 'east-of-england' },
  { id: 'suffolk', name: 'Suffolk', region: 'east-of-england' },
  // East Midlands
  { id: 'derbyshire', name: 'Derbyshire', region: 'east-midlands' },
  { id: 'leicestershire', name: 'Leicestershire', region: 'east-midlands' },
  { id: 'lincolnshire', name: 'Lincolnshire', region: 'east-midlands' },
  { id: 'northamptonshire', name: 'Northamptonshire', region: 'east-midlands' },
  { id: 'nottinghamshire', name: 'Nottinghamshire', region: 'east-midlands' },
  { id: 'rutland', name: 'Rutland', region: 'east-midlands' },
  // West Midlands
  { id: 'herefordshire', name: 'Herefordshire', region: 'west-midlands' },
  { id: 'shropshire', name: 'Shropshire', region: 'west-midlands' },
  { id: 'staffordshire', name: 'Staffordshire', region: 'west-midlands' },
  { id: 'warwickshire', name: 'Warwickshire', region: 'west-midlands' },
  { id: 'west-midlands-county', name: 'West Midlands', region: 'west-midlands' },
  { id: 'worcestershire', name: 'Worcestershire', region: 'west-midlands' },
  // North West
  { id: 'cheshire', name: 'Cheshire', region: 'north-west' },
  { id: 'cumbria', name: 'Cumbria', region: 'north-west' },
  { id: 'greater-manchester', name: 'Greater Manchester', region: 'north-west' },
  { id: 'lancashire', name: 'Lancashire', region: 'north-west' },
  { id: 'merseyside', name: 'Merseyside', region: 'north-west' },
  // North East
  { id: 'county-durham', name: 'County Durham', region: 'north-east' },
  { id: 'northumberland', name: 'Northumberland', region: 'north-east' },
  { id: 'tyne-and-wear', name: 'Tyne and Wear', region: 'north-east' },
  // Yorkshire & the Humber
  { id: 'east-riding-of-yorkshire', name: 'East Riding of Yorkshire', region: 'yorkshire-and-the-humber' },
  { id: 'north-yorkshire', name: 'North Yorkshire', region: 'yorkshire-and-the-humber' },
  { id: 'south-yorkshire', name: 'South Yorkshire', region: 'yorkshire-and-the-humber' },
  { id: 'west-yorkshire', name: 'West Yorkshire', region: 'yorkshire-and-the-humber' },
]

export function toId(name: string): string {
  return (name || '').toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const COUNTY_BY_ID = new Map(COUNTIES.map(c => [c.id, c]))
const COUNTY_ID_BY_NAME = new Map(COUNTIES.map(c => [c.name.toLowerCase(), c.id]))
const REGION_BY_ID = new Map(REGIONS.map(r => [r.id, r]))
const REGION_ID_BY_NAME = new Map(REGIONS.map(r => [r.name.toLowerCase(), r.id]))

export function regionOfCounty(countyId: string): RegionId | null {
  return COUNTY_BY_ID.get(countyId)?.region ?? null
}
export function countyName(countyId: string): string | null {
  return COUNTY_BY_ID.get(countyId)?.name ?? null
}
export function regionName(regionId: string): string | null {
  return REGION_BY_ID.get(regionId as RegionId)?.name ?? null
}

// Region-label aliases people/data use.
const REGION_ALIASES: Record<string, RegionId> = {
  'east anglia': 'east-of-england',
  eastern: 'east-of-england',
  'yorkshire': 'yorkshire-and-the-humber',
  'yorkshire and the humber': 'yorkshire-and-the-humber',
  'home counties': 'south-east',
  // Nation sub-areas people post as a "region"
  'south wales': 'wales', 'north wales': 'wales', 'mid wales': 'wales', 'west wales': 'wales',
  'scottish borders': 'scotland', 'the borders': 'scotland', 'highlands': 'scotland',
  'highland': 'scotland', 'loch ness': 'scotland',
}

// Administrative unitary / district names → the ceremonial county a candidate
// would pick. Only entries that DIFFER from the ceremonial name are needed
// (county_unitary values that already equal a ceremonial county pass through).
const CEREMONIAL: Record<string, string> = {
  'west berkshire': 'berkshire', 'reading': 'berkshire', 'wokingham': 'berkshire',
  'bracknell forest': 'berkshire', 'slough': 'berkshire', 'windsor and maidenhead': 'berkshire',
  'bath and north east somerset': 'somerset', 'north somerset': 'somerset',
  'south gloucestershire': 'gloucestershire',
  'bournemouth christchurch and poole': 'dorset',
  'brighton and hove': 'east-sussex', 'medway': 'kent',
  'milton keynes': 'buckinghamshire',
  'central bedfordshire': 'bedfordshire', 'bedford': 'bedfordshire', 'luton': 'bedfordshire',
  'peterborough': 'cambridgeshire', 'southend-on-sea': 'essex', 'thurrock': 'essex',
  'portsmouth': 'hampshire', 'southampton': 'hampshire',
  'city of london': 'greater-london',
  'kingston upon hull': 'east-riding-of-yorkshire', 'york': 'north-yorkshire',
}

function normaliseCounty(rawName: string | null | undefined): string | null {
  if (!rawName) return null
  const lc = rawName.toLowerCase().trim()
  if (CEREMONIAL[lc]) return CEREMONIAL[lc]
  if (COUNTY_ID_BY_NAME.has(lc)) return COUNTY_ID_BY_NAME.get(lc)!
  const id = toId(rawName)
  return COUNTY_BY_ID.has(id) ? id : null
}

function normaliseRegion(rawName: string | null | undefined): RegionId | null {
  if (!rawName) return null
  const lc = rawName.toLowerCase().trim()
  if (REGION_ID_BY_NAME.has(lc)) return REGION_ID_BY_NAME.get(lc)!
  if (REGION_ALIASES[lc]) return REGION_ALIASES[lc]
  const id = toId(rawName)
  return REGION_BY_ID.has(id as RegionId) ? (id as RegionId) : null
}

const OUTCODE_ONLY = /^[A-Z]{1,2}\d[A-Z\d]?$/i
const BASE = 'https://api.postcodes.io'

async function getJson(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429 || res.status >= 500) { await sleep(300 * (attempt + 1)); continue }
      if (!res.ok) return null
      return await res.json()
    } catch { await sleep(200 * (attempt + 1)) }
  }
  return null
}
export function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

export interface AreaResolution {
  region: RegionId | null
  county: string | null
  method: 'region-label' | 'county-label' | 'place' | 'outcode' | 'unresolved'
  matched?: string
}

// Resolve a place name (town/city) via postcodes.io /places → ceremonial county +
// region. Prefers an exact-name City/Town to avoid same-named mismatches.
async function resolvePlace(name: string): Promise<AreaResolution | null> {
  const data = await getJson(`${BASE}/places?q=${encodeURIComponent(name)}&limit=10`)
  const results: any[] = data?.result || []
  if (results.length === 0) return null
  const lc = name.toLowerCase()
  const exact = results.filter(r => (r.name_1 || '').toLowerCase() === lc)
  const isTownCity = (r: any) => ['City', 'Town'].includes(r.local_type)
  const pick = exact.find(isTownCity) || exact[0] || results.find(isTownCity) || results[0]
  if (!pick) return null
  const county = normaliseCounty(pick.county_unitary)
  const region = normaliseRegion(pick.region) || (county ? regionOfCounty(county) : null)
  if (!region) return null
  return { region, county, method: 'place', matched: `${pick.name_1}/${pick.local_type}` }
}

// Outward code → county (+ region). Falls back to place lookup on the town when
// the outcode's unitary has no county (e.g. RG18 → West Berkshire), so towns like
// Thatcham/Marlborough resolve instead of dropping to null.
async function resolveOutcode(outcode: string, townFallback?: string): Promise<AreaResolution | null> {
  const data = await getJson(`${BASE}/outcodes/${encodeURIComponent(outcode)}`)
  const r = data?.result
  if (r) {
    const rawCounty = Array.isArray(r.admin_county) ? r.admin_county[0] : r.admin_county
    const county = normaliseCounty(rawCounty)
    if (county) return { region: regionOfCounty(county)!, county, method: 'outcode', matched: `oc:${outcode}` }
    // No county on the outcode (unitary) — try the district name, then the town.
    const rawDistrict = Array.isArray(r.admin_district) ? r.admin_district[0] : r.admin_district
    const dc = normaliseCounty(rawDistrict)
    if (dc) return { region: regionOfCounty(dc)!, county: dc, method: 'outcode', matched: `oc:${outcode}/${rawDistrict}` }
  }
  if (townFallback) return resolvePlace(townFallback)
  return null
}

/**
 * Resolve a job's text location to a canonical { region, county }.
 * Order: region label → county label → town/place → outcode → unresolved.
 * region null = un-resolvable (job is shown to everyone, never hidden).
 */
export async function resolveJobArea(job: { location?: string | null; area?: string | null }): Promise<AreaResolution> {
  const loc = (job.location || '').trim()
  const area = (job.area || '').trim()
  const lc = loc.toLowerCase()

  // 1. region label
  const asRegion = normaliseRegion(loc)
  if (asRegion) return { region: asRegion, county: null, method: 'region-label', matched: lc }

  // 2. county label (ceremonial or a recognised unitary/admin name)
  const asCounty = normaliseCounty(loc)
  if (asCounty) return { region: regionOfCounty(asCounty)!, county: asCounty, method: 'county-label', matched: lc }

  // 3. town / place
  if (loc) {
    const place = await resolvePlace(loc)
    if (place) return place
  }

  // 4. outcode (from area, else location), with town fallback
  for (const cand of [area, loc]) {
    if (cand && OUTCODE_ONLY.test(cand)) {
      const oc = await resolveOutcode(cand, loc || undefined)
      if (oc) return oc
    }
  }

  return { region: null, county: null, method: 'unresolved', matched: lc || area }
}
