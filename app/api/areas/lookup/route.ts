import { NextRequest, NextResponse } from 'next/server'
import { searchAreaSuggestions } from '@/lib/areas'
import { getJobAreaCounts, makeAreaJobCount } from '@/lib/jobAreaCounts'

// Town type-ahead for the preferred-areas picker. The candidate types a place
// they actually know — "Guildford", "Henley", "Bath", a county, a region, or an
// outcode — and gets back canonical areas to pick from. They never need to know
// which county a town belongs to, which is the point: an overseas candidate
// can't be expected to know UK county geography.
//
// Returns a SHORTLIST rather than one answer, best first. Place names in the UK
// repeat constantly (there are three notable Henleys and nine Henley hamlets),
// so letting the candidate choose is the difference between the right area and
// a silent wrong-county match.
//
//   GET /api/areas/lookup?q=Guildford
//     → { found: true, suggestions: [
//           { token: 'county:surrey', label: 'Surrey · South East',
//             place: 'Guildford', region: 'south-east', county: 'surrey' } ] }

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim()

  if (q.length < 2) {
    return NextResponse.json({ found: false, suggestions: [], reason: 'too-short' })
  }
  // Guard against the lookup being used as a proxy for junk input.
  if (q.length > 60) {
    return NextResponse.json({ found: false, suggestions: [], reason: 'too-long' })
  }

  try {
    const counts = await getJobAreaCounts()
    const suggestions = await searchAreaSuggestions(q, 6, makeAreaJobCount(counts))

    return NextResponse.json(
      { found: suggestions.length > 0, query: q, suggestions },
      {
        headers: {
          'Cache-Control': suggestions.length
            ? 'public, s-maxage=86400'
            : 'public, s-maxage=3600',
        },
      }
    )
  } catch {
    return NextResponse.json(
      { found: false, suggestions: [], error: 'lookup-failed' },
      { status: 500 }
    )
  }
}
