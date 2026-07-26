import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseNotice,
  markFlipped,
  flipBlocker,
  canFlip,
  type CandidateNoticeRow,
  type FlipBlocker,
} from '@/lib/discoverabilityNotice'

// STEP TWO of notify-then-flip: actually make the profiles visible.
//
// Every condition lives in lib/discoverabilityNotice.flipBlocker, and it is
// fail-closed — a row is flipped only when it is provably: hidden, still worth
// showing, notified, not opted out, not already flipped, and past its own
// stored deadline. Anything unexpected blocks. Wrongly flipping somebody is a
// privacy breach; wrongly skipping them leaves them exactly as they are.
//
// Deliberately separate from the notice route so the 14 days cannot be
// collapsed by one careless call, and dry-run by default for the same reason.
//
// POST { mode: 'dry-run' | 'flip', confirm: 'FLIP' }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const SELECT = 'user_id, email, full_name, job_title, cv_url, is_discoverable, discoverability_notice'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const live = body?.mode === 'flip'
  if (live && body?.confirm !== 'FLIP') {
    return NextResponse.json(
      { error: "mode 'flip' also requires confirm:'FLIP' — refusing to change visibility without it" },
      { status: 400 },
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase.from('candidate_profiles').select(SELECT)
  if (error) {
    // No column means no proof anybody was ever notified, and this route must
    // never flip on an assumption. Fail rather than degrade.
    const missing = error.code === '42703' || /discoverability_notice/.test(error.message || '')
    return NextResponse.json(
      { error: missing ? 'candidate_profiles.discoverability_notice does not exist — nobody can have been notified, so there is nothing to flip.' : error.message },
      { status: missing ? 409 : 500 },
    )
  }

  const rows = (data || []) as unknown as CandidateNoticeRow[]
  const now = new Date()

  const ready = rows.filter(r => canFlip(r, now))
  const blocked: Record<FlipBlocker, number> = {
    'not-notified': 0, 'opted-out': 0, 'window-open': 0,
    'already-flipped': 0, 'already-discoverable': 0, 'nothing-to-show': 0,
  }
  for (const r of rows) {
    const b = flipBlocker(r, now)
    if (b) blocked[b] += 1
  }

  const summary = {
    mode: live ? 'flip' : 'dry-run',
    candidatesTotal: rows.length,
    readyToFlip: ready.length,
    blocked,
  }

  if (!live) {
    return NextResponse.json({
      ...summary,
      wouldFlip: ready.map(r => ({
        email: r.email,
        name: r.full_name,
        deadlineWas: parseNotice(r.discoverability_notice).deadlineAt,
      })),
      flipped: 0,
      note: 'Dry run — nobody\'s visibility was changed.',
    })
  }

  // The audit trail Paul asked for: who was flipped and when, one line each.
  const flipped: { userId: string; email: string | null; at: string }[] = []
  const failures: { userId: string; error: string }[] = []

  for (const row of ready) {
    const notice = markFlipped(parseNotice(row.discoverability_notice), now)
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ is_discoverable: true, discoverability_notice: notice })
      .eq('user_id', row.user_id)
      // Re-assert the precondition at write time so a candidate who flips their
      // own toggle mid-run isn't overwritten by a stale read.
      .eq('is_discoverable', false)

    if (writeError) {
      failures.push({ userId: row.user_id, error: writeError.message })
      continue
    }
    flipped.push({ userId: row.user_id, email: row.email, at: notice.flippedAt! })
    console.log(`[discoverability-flip] flipped ${row.user_id} (${row.email}) at ${notice.flippedAt}`)
  }

  return NextResponse.json({ ...summary, flipped: flipped.length, flippedRows: flipped, failures })
}
