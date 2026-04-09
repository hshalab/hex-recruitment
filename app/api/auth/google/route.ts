import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Starts the Google OAuth flow for an authenticated employer.
//
// NOTE on auth: this app's Supabase client stores sessions in
// localStorage (not cookies), so a GET navigation from an <a> tag
// wouldn't carry any auth to the server. Instead, the client is
// expected to POST here with `Authorization: Bearer <access_token>`
// in the headers. We return { authUrl } as JSON and let the client
// navigate. The employer's user_id is put in `state` so the callback
// can persist the returned tokens onto the right profile.
//
// The redirect URI sent to Google is derived from the request origin,
// not an env var, so it always matches what the browser thinks the
// site is. This mirrors what the callback route uses for the token
// exchange — both sides must be identical or Google returns
// redirect_uri_mismatch.

function getOrigin(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(req.url).origin
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null
  const token = authHeader.slice(7).trim()
  if (!token) return null

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function POST(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not set' }, { status: 500 })
  }

  const userId = await resolveUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const origin = getOrigin(req)
  const redirectUri = `${origin}/api/auth/google/callback`
  const authUrl = buildAuthUrl(clientId, redirectUri, userId)

  console.log('[gcal start] POST ok', { origin, redirectUri, userId })
  return NextResponse.json({ authUrl, redirectUri })
}

// Keep a GET for dev convenience only — if the user hits /api/auth/google
// directly in a browser we send them back to settings with an error so
// it's obvious the button must be used.
export async function GET(req: NextRequest) {
  const origin = getOrigin(req)
  console.log('[gcal start] GET hit — no POST, redirecting to settings with error', { origin })
  return NextResponse.redirect(`${origin}/settings/availability?gcal=error&reason=use_button`)
}
