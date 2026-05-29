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
  //
  // UPSERT (not UPDATE): historically this was UPDATE WHERE user_id = state,
  // which returned 0 rows for any employer who somehow reached OAuth without
  // an employer_profiles row already existing — the email/password signup
  // path can leave the row missing (client-side upsert blocked by RLS
  // pre-confirm, and lib/authCallback.ts's server-side fallback was gated
  // by !existingRole, which is never true for email/password signups
  // because role is stamped into user_metadata at signUp time). The UPDATE
  // would silently return zero rows updated and emit gcal=error&reason=
  // no_profile. The UPSERT here creates the row on the fly if it's missing
  // — calendar connect can no longer fail on missing-row. Idempotent:
  // running on every reconnect just overwrites the three gcal_* token
  // columns, which is what we want anyway.
  const { error: upsertErr } = await supabaseAdmin
    .from('employer_profiles')
    .upsert(
      {
        user_id: state,
        gcal_access_token: accessToken,
        gcal_refresh_token: refreshToken,
        gcal_calendar_id: calendarId,
      },
      { onConflict: 'user_id' }
    )

  if (upsertErr) {
    console.error('[gcal callback] profile upsert failed', upsertErr)
    return redirectTo(origin, `gcal=error&reason=db_update`)
  }

  console.log('[gcal callback] success', { userId: state, calendarId })
  return redirectTo(origin, 'gcal=connected')
}
