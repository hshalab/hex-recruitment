// Google Calendar helper — server-only. Uses the service-role Supabase
// client so it can read/write employer tokens from any route handler.
//
// All functions throw on hard errors and return null on "no token yet"
// so callers can decide whether to soft-fail (e.g. a booking should still
// succeed even if the calendar sync fails).

import { supabaseAdmin } from '@/lib/supabase-admin'

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

function toGoogleEventBody(event: GCalEventInput, calendarId: string) {
  const timeZone = event.timeZone || 'Europe/London'

  // Build the attendees list. Callers pass the candidate (and any other
  // real guests) in event.attendees. The organizer — the user whose
  // calendar this event is being inserted into — must ALSO be in the
  // attendees array, with responseStatus 'accepted'.
  //
  // Why: Google's events.insert auto-adds the calendar owner to the
  // attendees list server-side whenever the request includes any
  // attendees + sendUpdates=all. The auto-added entry's
  // responseStatus defaults to 'needsAction', which makes the owner's
  // own copy of the event show a Yes/Maybe/No RSVP bar — which is
  // wrong, the organizer can't RSVP to their own event. Explicitly
  // sending them in the attendees array with responseStatus 'accepted'
  // overrides the auto-add and suppresses the RSVP prompt.
  //
  // Note on `organizer` / `self` fields: per Google's API reference
  // (https://developers.google.com/workspace/calendar/api/v3/reference/events)
  // those fields are READ-ONLY on writes — Google sets them server-side
  // based on which calendar the event is inserted into. The only field
  // we can usefully set for the organizer is responseStatus.
  //
  // calendarId is the employer's Google calendar identifier. In
  // production it's always the employer's email address (the OAuth
  // callback at app/api/auth/google/callback fetches /calendars/primary
  // and stores the returned `id`, which is the user's email). We only
  // append it as an attendee when it looks like an email — defensive
  // against the edge case of calendarId being the literal string
  // "primary", which Google accepts as a calendar reference but would
  // be rejected as an attendee email.
  const attendees: Array<{ email: string; responseStatus?: string }> =
    (event.attendees || []).filter(Boolean).map(email => ({ email }))

  if (calendarId && calendarId.includes('@')) {
    const alreadyPresent = attendees.some(
      a => a.email.toLowerCase() === calendarId.toLowerCase(),
    )
    if (!alreadyPresent) {
      attendees.push({ email: calendarId, responseStatus: 'accepted' })
    } else {
      // Defensive: if the candidate email canonical-matches the
      // organizer (rare in production, possible in dev with the same
      // Google account on both sides of a test schedule), make sure
      // that entry is marked accepted so the user doesn't see an RSVP
      // bar on their own calendar.
      for (const a of attendees) {
        if (a.email.toLowerCase() === calendarId.toLowerCase()) {
          a.responseStatus = 'accepted'
        }
      }
    }
  }

  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startIso, timeZone },
    end: { dateTime: event.endIso, timeZone },
    attendees,
    reminders: { useDefault: true },
  }
}

/**
 * Custom error class for Google Calendar API failures. Carries the HTTP
 * status and the response body excerpt so callers can decide how to
 * react (retry, surface to user, record on the booking row, etc.) and
 * so the stored error message in interview_bookings.gcal_sync_error is
 * diagnostically useful.
 *
 * Pre-existing behaviour: createCalendarEvent/updateCalendarEvent
 * returned null on any !res.ok and only console.error'd. Callers
 * silently noticed via `if (gEvent?.id)` and left
 * interview_bookings.gcal_event_id_employer NULL. That's the same
 * silent-fail shape as the no_profile bug — it produced UI-says-success
 * but DB-says-NULL with no diagnostic trail. Now: throw with full
 * context so the catch block at the call site can record what happened.
 */
export class GoogleCalendarApiError extends Error {
  status: number
  body: string
  constructor(operation: string, status: number, body: string) {
    super(`Google Calendar ${operation} failed: ${status} ${body.slice(0, 500)}`)
    this.name = 'GoogleCalendarApiError'
    this.status = status
    this.body = body
  }
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: GCalEventInput
): Promise<GCalEventResponse> {
  const res = await fetch(
    `${GOOGLE_CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toGoogleEventBody(event, calendarId)),
    }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[googleCalendar] createCalendarEvent failed', res.status, text)
    throw new GoogleCalendarApiError('events.insert', res.status, text)
  }
  return (await res.json()) as GCalEventResponse
}

/**
 * Updates a Google Calendar event by ID.
 *
 * Two different failure modes, deliberately distinguished:
 * - 404/410: the event no longer exists on Google's side (deleted from
 *   Google Calendar directly, expired, etc.). Returns null so callers
 *   can fall through to createCalendarEvent and produce a fresh event.
 *   This is the "expected, recoverable" case.
 * - Anything else (401/403/5xx/network): throws GoogleCalendarApiError
 *   so the caller records the failure on interview_bookings.gcal_sync_error
 *   rather than silently leaving the row in a bad state.
 */
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
      body: JSON.stringify(toGoogleEventBody(event, calendarId)),
    }
  )
  if (res.status === 404 || res.status === 410) {
    // Event no longer exists on Google's side — expected fall-through
    // to createCalendarEvent. Don't throw; the caller's null check
    // handles this case explicitly.
    return null
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[googleCalendar] updateCalendarEvent failed', res.status, text)
    throw new GoogleCalendarApiError('events.update', res.status, text)
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
