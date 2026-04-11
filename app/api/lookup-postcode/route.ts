import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy for getAddress.io so the API key stays secret.
// Client calls GET /api/lookup-postcode?postcode=SW1A+1AA
export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode')?.trim()
  if (!postcode) {
    return NextResponse.json({ error: 'postcode query param required' }, { status: 400 })
  }

  const apiKey = process.env.GETADDRESS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Address lookup not configured' }, { status: 500 })
  }

  const clean = postcode.replace(/\s+/g, '')
  const url = `https://api.getAddress.io/find/${encodeURIComponent(clean)}?api-key=${apiKey}&expand=true`

  try {
    const res = await fetch(url)

    if (res.status === 404) {
      return NextResponse.json({ error: 'Postcode not found' }, { status: 404 })
    }
    if (res.status === 401) {
      return NextResponse.json({ error: 'Address lookup API key invalid' }, { status: 500 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Lookup failed (${res.status})` }, { status: 502 })
    }

    const data = await res.json()
    const addresses = (data.addresses || []).map((a: any) => ({
      line_1: a.line_1 || '',
      line_2: a.line_2 || '',
      town_or_city: a.town_or_city || '',
      county: a.county || '',
      postcode: data.postcode || postcode,
      formatted: [a.line_1, a.line_2, a.town_or_city, a.county]
        .filter(Boolean)
        .join(', '),
    }))

    return NextResponse.json({ postcode: data.postcode || postcode, addresses })
  } catch (err: any) {
    console.error('[lookup-postcode] error', err)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}
