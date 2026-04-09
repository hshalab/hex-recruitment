import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

// Handles the redirect back from Google with an auth code. Exchanges
// the code for access + refresh tokens, fetches the user's primary
// calendar id, and stores all three on the employer's profile row.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(new URL(`/settings/availability?gcal=error&reason=${encodeURIComponent(errorParam)}`, req.url))
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings/availability?gcal=error&reason=missing_code', req.url))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL('/settings/availability?gcal=error&reason=not_configured', req.url))
  }

  // 1. Exchange code → tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    console.error('[gcal callback] token exchange failed', tokenRes.status, text)
    return NextResponse.redirect(new URL('/settings/availability?gcal=error&reason=token_exchange', req.url))
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  const accessToken = tokenJson.access_token
  const refreshToken = tokenJson.refresh_token
  if (!accessToken || !refreshToken) {
    // Missing refresh_token usually means the user has already granted
    // consent previously — we forced prompt=consent so this should be rare.
    console.error('[gcal callback] missing tokens', tokenJson)
    return NextResponse.redirect(new URL('/settings/availability?gcal=error&reason=no_refresh_token', req.url))
  }

  // 2. Fetch primary calendar id
  const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!calRes.ok) {
    const text = await calRes.text().catch(() => '')
    console.error('[gcal callback] primary calendar fetch failed', calRes.status, text)
    return NextResponse.redirect(new URL('/settings/availability?gcal=error&reason=calendar_fetch', req.url))
  }
  const calJson = (await calRes.json()) as { id?: string }
  const calendarId = calJson.id || 'primary'

  // 3. Persist on employer profile
  const { error: updateErr } = await supabaseAdmin
    .from('employer_profiles')
    .update({
      gcal_access_token: accessToken,
      gcal_refresh_token: refreshToken,
      gcal_calendar_id: calendarId,
    })
    .eq('user_id', state)

  if (updateErr) {
    console.error('[gcal callback] profile update failed', updateErr)
    return NextResponse.redirect(new URL('/settings/availability?gcal=error&reason=db_update', req.url))
  }

  return NextResponse.redirect(new URL('/settings/availability?gcal=connected', req.url))
}
