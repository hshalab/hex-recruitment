import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy for Postcoder so the API key stays secret.
// Client calls GET /api/lookup-postcode?postcode=SW1A+1AA
export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode')?.trim()
  if (!postcode) {
    return NextResponse.json({ error: 'postcode query param required' }, { status: 400 })
  }

  const apiKey = process.env.POSTCODER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Address lookup not configured' }, { status: 500 })
  }

  const clean = postcode.replace(/\s+/g, '')
  const url = `https://ws.postcoder.com/pcw/${apiKey}/address/uk/${encodeURIComponent(clean)}?lines=2&format=json`

  try {
    const res = await fetch(url)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[lookup-postcode] postcoder error', { status: res.status, postcode: clean, body })
      if (res.status === 404) {
        return NextResponse.json({ error: 'Postcode not found' }, { status: 404 })
      }
      return NextResponse.json({ error: `Lookup failed (${res.status})` }, { status: 502 })
    }

    const data = await res.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No addresses found for this postcode' }, { status: 404 })
    }

    const addresses = data.map((a: any) => ({
      line_1: a.addressline1 || '',
      line_2: a.addressline2 || '',
      town_or_city: a.posttown || '',
      county: a.county || '',
      postcode: a.postcode || postcode,
      formatted: a.summaryline || [a.addressline1, a.addressline2, a.posttown, a.county].filter(Boolean).join(', '),
    }))

    return NextResponse.json({ postcode: data[0]?.postcode || postcode, addresses })
  } catch (err: any) {
    console.error('[lookup-postcode] error', err)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}
