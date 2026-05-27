import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function getOrigin(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(req.url).origin
}

function redirectTo(origin: string, query: string): NextResponse {
  return NextResponse.redirect(`${origin}/settings/availability?${query}`)
}

// Handles the redirect back from Google with an auth code. Exchanges
// the code for access + refresh tokens, fetches the user's primary
// calendar id, and stores all three on the employer's profile row.
//
// The redirect_uri used for the token exchange MUST be identical to
// the one sent at the start of the flow — we derive both from the
// current request origin so they can't drift.
export async function GET(req: NextRequest) {
  const origin = getOrigin(req)
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  console.log('[gcal callback] GET', {
    origin,
    hasCode: Boolean(code),
    hasState: Boolean(state),
    state: state ? `${state.slice(0, 8)}…` : null,
    errorParam,
  })

  if (errorParam) {
    return redirectTo(origin, `gcal=error&reason=${encodeURIComponent(errorParam)}`)
  }
  if (!code || !state) {
    return redirectTo(origin, 'gcal=error&reason=missing_code_or_state')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('[gcal callback] missing GOOGLE_CLIENT_ID/SECRET')
    return redirectTo(origin, 'gcal=error&reason=not_configured')
  }

  // Identical to the start route's computation — must match byte-for-byte
  const redirectUri = `${origin}/api/auth/google/callback`

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
    return redirectTo(origin, `gcal=error&reason=token_exchange_${tokenRes.status}`)
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }

  const accessToken = tokenJson.access_token
  const refreshToken = tokenJson.refresh_token
  if (!accessToken || !refreshToken) {
    console.error('[gcal callback] missing tokens in response', {
      hasAccess: Boolean(accessToken),
      hasRefresh: Boolean(refreshToken),
      scope: tokenJson.scope,
    })
    return redirectTo(origin, 'gcal=error&reason=no_refresh_token')
  }

  // 2. Fetch primary calendar id
  const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!calRes.ok) {
    const text = await calRes.text().catch(() => '')
    console.error('[gcal callback] primary calendar fetch failed', calRes.status, text)
    return redirectTo(origin, `gcal=error&reason=calendar_fetch_${calRes.status}`)
  }
  const calJson = (await calRes.json()) as { id?: string }
  const calendarId = calJson.id || 'primary'

  // 3. Persist on employer profile. `state` is the employer's Supabase user_id.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('employer_profiles')
    .update({
      gcal_access_token: accessToken,
      gcal_refresh_token: refreshToken,
      gcal_calendar_id: calendarId,
    })
    .eq('user_id', state)
    .select('user_id, gcal_calendar_id')

  if (updateErr) {
    console.error('[gcal callback] profile update failed', updateErr)
    return redirectTo(origin, `gcal=error&reason=db_update`)
  }
  if (!updated || updated.length === 0) {
    // The state didn't match any employer_profiles row — probably because
    // the user hasn't completed employer onboarding yet, or state was
    // tampered with. Log and surface.
    console.error('[gcal callback] no employer_profiles row for state', { state })
    return redirectTo(origin, 'gcal=error&reason=no_profile')
  }

  console.log('[gcal callback] success', { userId: state, calendarId })
  return redirectTo(origin, 'gcal=connected')
}
