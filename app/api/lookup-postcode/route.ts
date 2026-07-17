import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Server-side proxy for Postcoder so the API key stays secret.
// Client calls GET /api/lookup-postcode?postcode=SW1A+1AA

// Reading cookies (to attribute the lookup) forces dynamic rendering anyway.
export const dynamic = 'force-dynamic'

// Postcoder / Royal Mail licensing requires every lookup to be attributed to
// the client organisation that performed it (an `identifier` on each request;
// see the Manage Identifiers flow). Our "clients" are employer accounts, so an
// employer's lookups are keyed to their own account id — which maps to their
// registered business name + address in the remittance mapping we provide.
// Candidate / anonymous lookups (profile address, pre-signup employer
// registration) aren't a separate client business, so they roll up under
// Thrive's own platform identifier.
//
// Identifiers must be <= 80 chars and URL-encoded (unreserved set is
// a–z A–Z 0–9 - _ . ~). Account ids are UUIDs, so they satisfy this natively.
const PLATFORM_IDENTIFIER = 'thrive-platform'

async function resolveIdentifier(): Promise<string> {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(_name: string, _value: string, _options: CookieOptions) {},
          remove(_name: string, _options: CookieOptions) {},
        },
      },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.user_metadata?.role === 'employer') return user.id
  } catch {
    // Never let identifier resolution break a lookup — fall back to platform.
  }
  return PLATFORM_IDENTIFIER
}

export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode')?.trim()
  if (!postcode) {
    return NextResponse.json({ error: 'postcode query param required' }, { status: 400 })
  }

  const apiKey = process.env.POSTCODER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Address lookup not configured' }, { status: 500 })
  }

  const identifier = await resolveIdentifier()
  const clean = postcode.replace(/\s+/g, '')
  const url =
    `https://ws.postcoder.com/pcw/${apiKey}/address/uk/${encodeURIComponent(clean)}` +
    `?lines=2&format=json&identifier=${encodeURIComponent(identifier)}`

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
