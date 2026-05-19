import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const pad = (n: number) => String(n).padStart(2, '0')

/** Fold a single logical line to max 75 bytes per RFC 5545. */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let remaining = line
  chunks.push(remaining.slice(0, 75))
  remaining = remaining.slice(75)
  while (remaining.length > 0) {
    chunks.push(' ' + remaining.slice(0, 74))
    remaining = remaining.slice(74)
  }
  return chunks.join('\r\n')
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function formatLocal(dateStr: string, timeStr: string): string {
  // dateStr YYYY-MM-DD, timeStr HH:MM or HH:MM:SS
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00`
}

function addMinutes(dateStr: string, timeStr: string, minutes: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const dt = new Date(y, mo - 1, d, h, mi, 0)
  dt.setMinutes(dt.getMinutes() + minutes)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
}

/** YYYY-MM-DD → YYYYMMDD for iCalendar all-day events (no time portion). */
function formatDateOnly(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

/** Add N days to a YYYY-MM-DD date. iCalendar all-day DTEND is exclusive
 *  per RFC 5545, so a Mon–Fri block needs DTSTART=Mon, DTEND=Sat. */
function addDaysYMD(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function utcStamp(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token: rawToken } = await params
    const token = rawToken.replace(/\.ics$/i, '')

    const { data: profile } = await supabaseAdmin
      .from('employer_profiles')
      .select('user_id, company_name')
      .eq('ics_feed_token', token)
      .maybeSingle()

    if (!profile) {
      return new NextResponse('Not found', { status: 404 })
    }

    const { data: bookings } = await supabaseAdmin
      .from('interview_bookings')
      .select(`
        id, ics_uid, booked_date, booked_time, duration_minutes, status, candidate_id,
        interviews ( interview_type, location_or_link, notes, job_id, candidate_id, jobs ( title ) )
      `)
      .eq('employer_id', profile.user_id)
      .order('booked_date', { ascending: true })

    // Also fetch block-outs so subscribed calendars (Google, Apple,
    // Outlook) show the employer's marked-unavailable days alongside
    // their scheduled interviews. Filter to recent history + future
    // only — historical blocks are noise in a subscription feed.
    const horizonStart = new Date()
    horizonStart.setDate(horizonStart.getDate() - 30)
    const horizonStartStr = horizonStart.toISOString().slice(0, 10)
    const { data: blocks } = await supabaseAdmin
      .from('employer_availability_overrides')
      .select('id, override_date, reason, block_group_id')
      .eq('employer_id', profile.user_id)
      .eq('is_blocked', true)
      .gte('override_date', horizonStartStr)
      .order('override_date', { ascending: true })

    // Collect unique candidate IDs for name lookup
    const candidateIds = Array.from(
      new Set((bookings || []).map(b => b.candidate_id).filter(Boolean))
    ) as string[]

    let nameByCandidate = new Map<string, string>()
    if (candidateIds.length) {
      const { data: candidates } = await supabaseAdmin
        .from('candidate_profiles')
        .select('user_id, full_name')
        .in('user_id', candidateIds)
      for (const c of candidates || []) {
        nameByCandidate.set(c.user_id, c.full_name || 'Candidate')
      }
    }

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Thrive//Interview Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeText((profile.company_name || 'Thrive') + ' — Interviews')}`,
      'X-WR-TIMEZONE:Europe/London',
      'X-PUBLISHED-TTL:PT1H',
    ]

    const stamp = utcStamp()

    for (const b of bookings || []) {
      const iv: any = Array.isArray(b.interviews) ? b.interviews[0] : b.interviews
      const job: any = iv?.jobs ? (Array.isArray(iv.jobs) ? iv.jobs[0] : iv.jobs) : null
      const candidateName = nameByCandidate.get(b.candidate_id) || 'Candidate'
      const jobTitle = job?.title || 'Interview'
      const interviewType: string = iv?.interview_type || 'in-person'
      const locationOrLink: string = iv?.location_or_link || ''
      const notes: string = iv?.notes || ''

      const summary = `Interview: ${candidateName} — ${jobTitle}`
      const descParts: string[] = [`Type: ${interviewType}`]
      if (interviewType === 'video' && locationOrLink) descParts.push(`Join: ${locationOrLink}`)
      if (notes) descParts.push(`Notes: ${notes}`)
      descParts.push('Managed via Thrive — thrivecareer.co.uk')
      const description = descParts.join('\\n')

      const location =
        interviewType === 'video' ? locationOrLink : locationOrLink || ''

      const dtstart = formatLocal(String(b.booked_date), String(b.booked_time))
      const dtend = addMinutes(String(b.booked_date), String(b.booked_time), b.duration_minutes || 45)

      const vevent = [
        'BEGIN:VEVENT',
        foldLine(`UID:${b.ics_uid}@thrivecareer.co.uk`),
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/London:${dtstart}`,
        `DTEND;TZID=Europe/London:${dtend}`,
        foldLine(`SUMMARY:${escapeText(summary)}`),
        foldLine(`DESCRIPTION:${description}`),
        ...(location ? [foldLine(`LOCATION:${escapeText(location)}`)] : []),
        `STATUS:${b.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
        'END:VEVENT',
      ]
      lines.push(...vevent)
    }

    // ── Block-out VEVENTs ───────────────────────────────────────────
    // A range (rows sharing a block_group_id) emits as ONE multi-day
    // all-day VEVENT so subscribers see "Blocked · Holiday — Mon-Fri"
    // rather than five separate all-day events. Solo blocks
    // (block_group_id NULL) emit as single all-day VEVENTs and are
    // never grouped — matches the in-app list rendering.
    type BlockGroup = { groupKey: string; from: string; to: string; reason: string | null }
    const soloBlocks: BlockGroup[] = []
    const groupedBlocks = new Map<string, BlockGroup>()
    for (const b of blocks || []) {
      if (!b.block_group_id) {
        soloBlocks.push({
          groupKey: `blocked-${b.id}`,
          from: b.override_date,
          to: b.override_date,
          reason: b.reason ?? null,
        })
        continue
      }
      const existing = groupedBlocks.get(b.block_group_id)
      if (!existing) {
        groupedBlocks.set(b.block_group_id, {
          groupKey: `blocked-group-${b.block_group_id}`,
          from: b.override_date,
          to: b.override_date,
          reason: b.reason ?? null,
        })
      } else {
        // Extend the range — `blocks` is sorted asc by override_date so
        // a later row is always the new max end.
        if (b.override_date < existing.from) existing.from = b.override_date
        if (b.override_date > existing.to) existing.to = b.override_date
      }
    }
    const allBlocks: BlockGroup[] = [...soloBlocks, ...Array.from(groupedBlocks.values())]
      .sort((a, b) => a.from.localeCompare(b.from))

    for (const entry of allBlocks) {
      const summary = entry.reason ? `Blocked: ${entry.reason}` : 'Blocked'
      const dtstart = formatDateOnly(entry.from)
      // RFC 5545: all-day DTEND is EXCLUSIVE, so a Mon–Fri block must
      // span DTSTART=Mon, DTEND=Sat to cover Friday.
      const dtend = formatDateOnly(addDaysYMD(entry.to, 1))
      const vevent = [
        'BEGIN:VEVENT',
        foldLine(`UID:${entry.groupKey}@thrivecareer.co.uk`),
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `DTEND;VALUE=DATE:${dtend}`,
        foldLine(`SUMMARY:${escapeText(summary)}`),
        // OPAQUE = busy/blocking on the subscriber's calendar; TRANSPARENT
        // would let other events overlap it. OPAQUE matches the
        // employer's intent ("I am unavailable on these days").
        'TRANSP:OPAQUE',
        'STATUS:CONFIRMED',
        'END:VEVENT',
      ]
      lines.push(...vevent)
    }

    lines.push('END:VCALENDAR')

    return new NextResponse(lines.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err: any) {
    console.error('[calendar/feed] error', err)
    return new NextResponse('Error', { status: 500 })
  }
}
