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
export function countiesOfRegion(regionId: string): { id: string; name: string }[] {
  return COUNTIES.filter(c => c.region === regionId).map(({ id, name }) => ({ id, name }))
}
export function isRegionId(id: string): boolean {
  return REGION_BY_ID.has(id as RegionId)
}
export function isCountyId(id: string): boolean {
  return COUNTY_BY_ID.has(id)
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
  // The 32 London boroughs. postcodes.io reports a London outcode's
  // admin_district as the borough and leaves admin_county empty, so without
  // these a London postcode resolves to no county at all — which is how
  // "Richmond, TW9" ended up in North Yorkshire: the borough was unrecognised,
  // the outcode yielded nothing, and the place-name match won by default.
  'barking and dagenham': 'greater-london', 'barnet': 'greater-london',
  'bexley': 'greater-london', 'brent': 'greater-london',
  'bromley': 'greater-london', 'camden': 'greater-london',
  'croydon': 'greater-london', 'ealing': 'greater-london',
  'enfield': 'greater-london', 'greenwich': 'greater-london',
  'hackney': 'greater-london', 'hammersmith and fulham': 'greater-london',
  'haringey': 'greater-london', 'harrow': 'greater-london',
  'havering': 'greater-london', 'hillingdon': 'greater-london',
  'hounslow': 'greater-london', 'islington': 'greater-london',
  'kensington and chelsea': 'greater-london', 'kingston upon thames': 'greater-london',
  'lambeth': 'greater-london', 'lewisham': 'greater-london',
  'merton': 'greater-london', 'newham': 'greater-london',
  'redbridge': 'greater-london', 'richmond upon thames': 'greater-london',
  'southwark': 'greater-london', 'sutton': 'greater-london',
  'tower hamlets': 'greater-london', 'waltham forest': 'greater-london',
  'wandsworth': 'greater-london', 'westminster': 'greater-london',
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

/**
 * Everywhere an outward code could plausibly be.
 *
 * An outcode is not a point — SN8 spans Swindon, West Berkshire and Wiltshire,
 * RG17 spans Oxfordshire, West Berkshire and Wiltshire. Taking element [0], as
 * this used to, picks whichever the API happened to list first: RG17 would have
 * become Oxfordshire when Hungerford is Berkshire. So collect the whole
 * candidate set and let the caller decide, rather than guessing from it.
 */
interface OutcodeAreas {
  counties: Set<string>
  regions: Set<RegionId>
  /** Only set when the outcode points somewhere unambiguous. */
  primary: AreaResolution | null
}

const asArray = (v: any): any[] => (Array.isArray(v) ? v : v ? [v] : [])

async function outcodeAreas(outcode: string): Promise<OutcodeAreas | null> {
  const data = await getJson(`${BASE}/outcodes/${encodeURIComponent(outcode)}`)
  const r = data?.result
  if (!r) return null

  const counties = new Set<string>()
  for (const raw of [...asArray(r.admin_county), ...asArray(r.admin_district)]) {
    const c = normaliseCounty(raw)
    if (c) counties.add(c)
  }
  const regions = new Set<RegionId>()
  for (const c of Array.from(counties)) {
    const rg = regionOfCounty(c)
    if (rg) regions.add(rg)
  }
  for (const raw of asArray(r.region)) {
    const rg = normaliseRegion(raw)
    if (rg) regions.add(rg)
  }

  let primary: AreaResolution | null = null
  if (counties.size === 1) {
    const c = Array.from(counties)[0]
    primary = { region: regionOfCounty(c)!, county: c, method: 'outcode', matched: `oc:${outcode}` }
  } else if (counties.size === 0 && regions.size === 1) {
    primary = { region: Array.from(regions)[0], county: null, method: 'outcode', matched: `oc:${outcode}` }
  }
  return { counties, regions, primary }
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

  // 3. Place name, CORROBORATED by the outward code when we have one.
  //
  // Place-name lookup alone is not safe: Britain reuses town names, so "Richmond"
  // exact-matches Richmond in North Yorkshire before Richmond upon Thames, and a
  // TW9 job lands 250 miles away — recommended to Yorkshire candidates, invisible
  // to London ones.
  //
  // The naive fix — always prefer the outcode — is worse, because an outcode
  // spans several areas and the API's ordering is arbitrary: it would move
  // Hungerford RG17 from Berkshire (right) to Oxfordshire (wrong) and Marlborough
  // SN8 from Wiltshire to Swindon. So the outcode is used to CHECK the place, not
  // to replace it: if the place agrees with somewhere the postcode actually
  // covers, keep it; if it contradicts the postcode outright, the place match was
  // a same-name collision and the postcode wins.
  const outcodeCandidate = [area, loc].find(c => c && OUTCODE_ONLY.test(c)) || null
  const oa = outcodeCandidate ? await outcodeAreas(outcodeCandidate) : null
  const outcodeKnowsWhere = !!oa && (oa.counties.size > 0 || oa.regions.size > 0)

  if (loc) {
    const place = await resolvePlace(loc)
    if (place) {
      if (!outcodeKnowsWhere) return place
      const agrees =
        (place.county && oa!.counties.has(place.county)) ||
        (place.region && oa!.regions.has(place.region))
      if (agrees) return place

      // Contradicted. Prefer the postcode when it points somewhere definite.
      if (oa!.primary) {
        return { ...oa!.primary, matched: `${oa!.primary.matched} (place "${place.matched}" rejected)` }
      }
      // Ambiguous outcode AND a contradicted place: we know the place match is
      // wrong but not what's right. Leave it unresolved rather than assert a
      // guess — an unresolved job is shown to everyone, which is the harmless
      // direction, whereas a confidently wrong area hides it from the right
      // people and pushes it at the wrong ones.
      return { region: null, county: null, method: 'unresolved', matched: `${lc} (contradicted by ${outcodeCandidate})` }
    }
  }

  // 4. Outward code alone — no usable place name, or the place lookup found nothing.
  if (oa) {
    if (oa.primary) return oa.primary
    if (oa.counties.size > 0) {
      // Several candidates and nothing to disambiguate with. Deterministic pick,
      // same as the previous behaviour, so this path doesn't churn existing rows.
      const c = Array.from(oa.counties).sort()[0]
      return { region: regionOfCounty(c)!, county: c, method: 'outcode', matched: `oc:${outcodeCandidate}` }
    }
    if (oa.regions.size > 0) {
      return { region: Array.from(oa.regions)[0], county: null, method: 'outcode', matched: `oc:${outcodeCandidate}` }
    }
  }

  return { region: null, county: null, method: 'unresolved', matched: lc || area }
}

// ─── Candidate-side area search (town type-ahead) ───────────────────
//
// Deliberately NOT the same as resolveJobArea. A job posts one specific place
// and we take the exact-name match; a candidate types a fragment and means the
// well-known place. "Henley" exact-matches nine hamlets before it reaches
// Henley-on-Thames, so an exact-first rule silently lands them in Shropshire.
// Here we rank real towns and cities above hamlets and return the shortlist, so
// an ambiguous query (there are three notable Henleys) is a choice the
// candidate makes rather than a guess we make badly on their behalf.

const PLACE_TYPE_RANK: Record<string, number> = {
  City: 0,
  Town: 1,
  'Other Settlement': 2,
  'Suburban Area': 3,
  Village: 4,
  Hamlet: 5,
}

export interface AreaSuggestion {
  /** Token to store in preferred_areas. */
  token: string
  /** Area label, e.g. "Surrey · South East". */
  label: string
  /** The place that produced it, e.g. "Henley-on-Thames". Null for a direct
   *  region/county name match. */
  place: string | null
  region: RegionId
  county: string | null
  source: 'region-name' | 'county-name' | 'place' | 'outcode'
}

/**
 * Suggest canonical areas for a candidate's free-text query — a town they know
 * ("Guildford", "Henley"), a county, a region, or an outcode. Best match first.
 * The candidate never needs to know which county a town sits in.
 */
export async function searchAreaSuggestions(
  query: string,
  limit = 6,
  /** Optional tie-break: how many active jobs does this area have? Between two
   *  places of equal significance and equal name-exactness ("Henley-in-Arden",
   *  1 job, vs "Henley-on-Thames", 28), the busier one is far likelier to be
   *  the one a jobseeker means. Injected so this module stays free of database
   *  concerns. */
  areaJobCount?: (token: string) => number
): Promise<AreaSuggestion[]> {
  const q = (query || '').trim()
  if (q.length < 2) return []

  const out: AreaSuggestion[] = []
  const seen = new Set<string>()

  const push = (s: AreaSuggestion) => {
    if (seen.has(s.token)) return
    seen.add(s.token)
    out.push(s)
  }

  const areaLabel = (region: RegionId, county: string | null) =>
    county ? `${countyName(county)} · ${regionName(region)}` : (regionName(region) || region)

  // 1. The query is itself a region or county name — that's the strongest signal.
  const asRegion = normaliseRegion(q)
  if (asRegion) {
    push({
      token: regionToken(asRegion), label: areaLabel(asRegion, null),
      place: null, region: asRegion, county: null, source: 'region-name',
    })
  }
  const asCounty = normaliseCounty(q)
  if (asCounty) {
    const region = regionOfCounty(asCounty)!
    push({
      token: countyToken(asCounty), label: areaLabel(region, asCounty),
      place: null, region, county: asCounty, source: 'county-name',
    })
  }

  // 2. Place search, ranked so towns and cities beat hamlets.
  const data = await getJson(`${BASE}/places?q=${encodeURIComponent(q)}&limit=100`)
  const places: any[] = data?.result || []
  const lc = q.toLowerCase()

  const ranked = places
    .map(p => {
      const name = p.name_1 || ''
      const county = normaliseCounty(p.county_unitary)
      const region = normaliseRegion(p.region) || (county ? regionOfCounty(county) : null)
      const token = county ? countyToken(county) : region ? regionToken(region) : ''
      return {
        name,
        county,
        region,
        typeRank: PLACE_TYPE_RANK[p.local_type] ?? 6,
        exact: name.toLowerCase() === lc ? 0 : 1,
        // Only ever consulted after place type and name-exactness, so an exact
        // match in a quiet county still beats a partial one in a busy county.
        jobCount: areaJobCount && token ? areaJobCount(token) : 0,
        length: name.length,
      }
    })
    .filter(p => !!p.region)
    .sort((a, b) =>
      a.typeRank - b.typeRank ||
      a.exact - b.exact ||
      b.jobCount - a.jobCount ||
      a.length - b.length ||
      a.name.localeCompare(b.name)
    )

  for (const p of ranked) {
    if (out.length >= limit) break
    const region = p.region as RegionId
    push({
      token: p.county ? countyToken(p.county) : regionToken(region),
      label: areaLabel(region, p.county),
      place: p.name,
      region,
      county: p.county,
      source: 'place',
    })
  }

  // 3. Outcode, for anyone who thinks in postcodes. Only suggest when the
  // outcode points somewhere unambiguous — offering the wrong one of three
  // possible counties is worse than offering nothing here, because the
  // candidate would accept it as ours.
  if (out.length === 0 && OUTCODE_ONLY.test(q)) {
    const oc = (await outcodeAreas(q))?.primary ?? null
    if (oc?.region) {
      push({
        token: oc.county ? countyToken(oc.county) : regionToken(oc.region),
        label: areaLabel(oc.region, oc.county),
        place: q.toUpperCase(),
        region: oc.region,
        county: oc.county,
        source: 'outcode',
      })
    }
  }

  return out.slice(0, limit)
}

// ─── Candidate preferred areas ──────────────────────────────────────
//
// Stored in candidate_profiles.preferred_areas as prefixed tokens —
// 'region:south-east' / 'county:surrey' — so a region id can never be confused
// with a county id. Bare ids are also accepted on read, so anything written by
// hand (or by an older client) still matches.

export function regionToken(regionId: string): string { return `region:${regionId}` }
export function countyToken(countyId: string): string { return `county:${countyId}` }

export interface PreferredAreas {
  regions: Set<string>
  counties: Set<string>
  /** True when the candidate has expressed no preference — everything shows. */
  isEmpty: boolean
}

/**
 * Parse preferred_areas tokens into region/county sets. Tolerant by design:
 * accepts 'region:x' / 'county:y' and bare ids, ignores anything unrecognised
 * (an unknown token must never silently hide every job).
 */
export function parsePreferredAreas(tokens: string[] | null | undefined): PreferredAreas {
  const regions = new Set<string>()
  const counties = new Set<string>()

  for (const raw of tokens || []) {
    const t = (raw || '').trim().toLowerCase()
    if (!t) continue
    if (t.startsWith('region:')) {
      const id = t.slice(7)
      if (isRegionId(id)) regions.add(id)
    } else if (t.startsWith('county:')) {
      const id = t.slice(7)
      if (isCountyId(id)) counties.add(id)
    } else if (isRegionId(t)) {
      regions.add(t)
    } else if (isCountyId(t)) {
      counties.add(t)
    }
  }

  return { regions, counties, isEmpty: regions.size === 0 && counties.size === 0 }
}

/**
 * Does a job's resolved area satisfy a candidate's preferred areas?
 * Deliberately generous — the cost of hiding a job the candidate would have
 * wanted is far higher than showing one slightly outside their picks.
 *
 *  - no preferences set          → everything matches (the feature is opt-in)
 *  - job has no resolved area    → matches EVERYONE, never hidden
 *  - job county ∈ picked counties            → match
 *  - job region ∈ picked regions             → match (a region includes all its
 *                                              counties, since every job's
 *                                              area_region is its county's region)
 *  - region-only job in a picked county's    → match (picking Surrey shows
 *    region                                    region-only "South East" jobs)
 */
export function jobMatchesPreferredAreas(
  job: { areaRegion?: string | null; areaCounty?: string | null },
  prefs: PreferredAreas
): boolean {
  if (prefs.isEmpty) return true

  const county = job.areaCounty || null
  const region = job.areaRegion || (county ? regionOfCounty(county) : null)

  // Un-resolvable location — never hidden by an area filter.
  if (!region && !county) return true

  if (county && prefs.counties.has(county)) return true
  if (region && prefs.regions.has(region)) return true

  // Picked a county, job only knows its region: show it if the region is the
  // one that county sits in.
  if (!county && region) {
    for (const c of Array.from(prefs.counties)) {
      if (regionOfCounty(c) === region) return true
    }
  }

  return false
}

/** Human-readable summary of stored tokens, for chips and email copy. */
export function describePreferredAreas(tokens: string[] | null | undefined): string[] {
  const { regions, counties } = parsePreferredAreas(tokens)
  return [
    ...Array.from(regions).map(r => regionName(r) || r),
    ...Array.from(counties).map(c => countyName(c) || c),
  ]
}
