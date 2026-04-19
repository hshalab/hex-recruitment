// Google Calendar helper — server-only. Uses the service-role Supabase
// client so it can read/write employer tokens from any route handler.
//
// All functions throw on hard errors and return null on "no token yet"
// so callers can decide whether to soft-fail (e.g. a booking should still
// succeed even if the calendar sync fails).

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CAL_BASE = 'https://www.googleapis.com/calendar/v3'

export interface GCalEventInput {
  summary: string
  description?: string
  startIso: string // full ISO-8601 string with timezone offset, e.g. '2026-05-01T10:00:00+01:00'
  endIso: string
  timeZone?: string // IANA name, default Europe/London
  attendees?: string[] // email strings
}

export interface GCalEventResponse {
  id?: string
  htmlLink?: string
  [k: string]: any
}

/**
 * Exchange a refresh token for a fresh access token and persist the new
 * access token on the employer's profile. Returns the new access token
 * (or null on failure).
 */
export async function refreshAccessToken(employerId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('[googleCalendar] Missing GOOGLE_CLIENT_ID/SECRET')
    return null
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[googleCalendar] refresh failed', res.status, text)
    return null
  }

  const data = (await res.json()) as { access_token?: string }
  const newToken = data.access_token
  if (!newToken) return null

  await supabaseAdmin
    .from('employer_profiles')
    .update({ gcal_access_token: newToken })
    .eq('user_id', employerId)

  return newToken
}

/**
 * Return a valid access token for the employer, refreshing if needed.
 * Returns null if the employer has no Google Calendar tokens at all.
 */
export async function getValidAccessToken(employerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('employer_profiles')
    .select('gcal_access_token, gcal_refresh_token')
    .eq('user_id', employerId)
    .maybeSingle()

  if (error || !data?.gcal_refresh_token) return null

  const accessToken = data.gcal_access_token as string | null
  if (accessToken) {
    // Cheap liveness check — /calendar/v3/users/me/calendarList is read-only
    // and doesn't mutate anything. 401 → token expired → refresh.
    const ping = await fetch(`${GOOGLE_CAL_BASE}/users/me/calendarList?maxResults=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (ping.ok) return accessToken
    if (ping.status !== 401) {
      // Some other error (403, 500) — surface null, caller can soft-fail
      const text = await ping.text().catch(() => '')
      console.error('[googleCalendar] liveness check failed', ping.status, text)
      return null
    }
  }

  return refreshAccessToken(employerId, data.gcal_refresh_token)
}

function toGoogleEventBody(event: GCalEventInput) {
  const timeZone = event.timeZone || 'Europe/London'
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startIso, timeZone },
    end: { dateTime: event.endIso, timeZone },
    attendees: (event.attendees || []).filter(Boolean).map(email => ({ email })),
    reminders: { useDefault: true },
  }
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: GCalEventInput
): Promise<GCalEventResponse | null> {
  const res = await fetch(
    `${GOOGLE_CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toGoogleEventBody(event)),
    }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[googleCalendar] createCalendarEvent failed', res.status, text)
    return null
  }
  return (await res.json()) as GCalEventResponse
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GCalEventInput
): Promise<GCalEventResponse | null> {
  const res = await fetch(
    `${GOOGLE_CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toGoogleEventBody(event)),
    }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[googleCalendar] updateCalendarEvent failed', res.status, text)
    return null
  }
  return (await res.json()) as GCalEventResponse
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  const res = await fetch(
    `${GOOGLE_CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  // 204 No Content is success. 410 Gone means the event was already deleted — treat as success.
  if (res.status === 204 || res.status === 410) return true
  const text = await res.text().catch(() => '')
  console.error('[googleCalendar] deleteCalendarEvent failed', res.status, text)
  return false
}

/**
 * Query Google Calendar's freeBusy API to get busy periods for a calendar.
 * Returns an array of { start, end } ISO strings representing busy times.
 */
export async function fetchFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<Array<{ start: string; end: string }>> {
  const res = await fetch(`${GOOGLE_CAL_BASE}/freeBusy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
      timeZone: 'Europe/London',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[googleCalendar] freeBusy failed', res.status, text)
    return []
  }

  const data = await res.json()
  const busy = data?.calendars?.[calendarId]?.busy || []
  return busy as Array<{ start: string; end: string }>
}

/**
 * Combine a YYYY-MM-DD date and HH:mm time into an ISO string with the
 * correct offset for Europe/London on that date (handles BST/GMT).
 */
export function buildLondonIso(dateStr: string, timeStr: string): string {
  // Interpret the supplied local wall-clock time as if it were Europe/London.
  // We construct a UTC date at that wall-clock time, then compute what offset
  // Europe/London has on that actual instant and subtract it.
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const asUtc = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0)

  // Ask Intl what the offset is at that instant in London.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
    year: 'numeric',
  })
  const parts = fmt.formatToParts(new Date(asUtc))
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT'
  // tzPart is like "GMT+1" (BST) or "GMT" (GMT)
  const match = /GMT([+-]\d+)?/.exec(tzPart)
  const offsetHours = match && match[1] ? parseInt(match[1], 10) : 0
  const sign = offsetHours >= 0 ? '+' : '-'
  const absH = Math.abs(offsetHours).toString().padStart(2, '0')
  return `${dateStr}T${timeStr.padStart(5, '0')}:00${sign}${absH}:00`
}

export function addMinutesToLondonIso(iso: string, minutes: number): string {
  // iso is e.g. '2026-05-01T10:00:00+01:00'
  const t = new Date(iso).getTime() + minutes * 60_000
  const end = new Date(t)
  // Preserve the offset from the source iso string
  const offsetMatch = /([+-]\d{2}:\d{2})$/.exec(iso)
  const offset = offsetMatch ? offsetMatch[1] : '+00:00'
  // Build YYYY-MM-DDTHH:mm:ss in the same offset
  const sign = offset.startsWith('-') ? -1 : 1
  const [oh, om] = offset.slice(1).split(':').map(Number)
  const shiftMs = sign * (oh * 60 + om) * 60_000
  const local = new Date(end.getTime() + shiftMs)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const s = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${offset}`
  return s
}
