import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseNudgeState,
  markShown,
  markDismissed,
  markCompleted,
  queueSkipped,
  touchSession,
  EMPTY_NUDGE_STATE,
  type NudgeKey,
  type NudgeState,
} from '@/lib/nudges'

// The single writer of candidate_profiles.nudge_state.
//
// Transitions are applied SERVER-SIDE from a named action rather than letting
// the client PUT a whole state object — otherwise "you've dismissed this twice,
// stop asking" is enforced by the same client that wants to ask again.
//
//   GET                                     → { nudgeState }
//   POST { action, key }                    → applies one transition
//     action: 'shown' | 'dismissed' | 'completed'
//   POST { action: 'completed', keys: [] }  → retires several fields in ONE write
//   POST { action: 'skipped', keys: [] }    → queues onboarding fields for later
//   POST { action: 'seen' }                 → records a dashboard load, starting
//                                             a new session after a 30-min gap
//
// 'completed' accepts either one key or an array on purpose. The client used to
// fire one request per satisfied field; each read the same jsonb, applied its
// own transition and wrote the whole object back, so concurrent requests
// clobbered each other and a field was silently lost. Paul's own record showed
// it: two fields satisfied, only one recorded, the second landing four minutes
// later on a subsequent page load. One request, one read-modify-write.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Set once per process if the column isn't there yet, so a missing migration
// degrades to "nudges are off" instead of erroring on a page load.
let columnMissing = false

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || /nudge_state/.test(error?.message || '')
}

async function authenticate(request: NextRequest) {
  const admin = createClient(supabaseUrl, supabaseServiceKey)
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { admin, userId: null as string | null }
  const { data: { user }, error } = await admin.auth.getUser(token)
  return { admin, userId: error || !user ? null : user.id }
}

export async function GET(request: NextRequest) {
  const { admin, userId } = await authenticate(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (columnMissing) return NextResponse.json({ nudgeState: EMPTY_NUDGE_STATE, available: false })

  const { data, error } = await admin
    .from('candidate_profiles')
    .select('nudge_state')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingColumn(error)) {
      columnMissing = true
      console.warn('[nudge-state] nudge_state column not present — nudges disabled until the migration is applied')
      return NextResponse.json({ nudgeState: EMPTY_NUDGE_STATE, available: false })
    }
    return NextResponse.json({ error: 'Failed to load nudge state' }, { status: 500 })
  }

  return NextResponse.json({
    nudgeState: parseNudgeState(data?.nudge_state),
    available: true,
  })
}

const ACTIONS = ['shown', 'dismissed', 'completed', 'skipped', 'seen'] as const
type Action = typeof ACTIONS[number]

/** Actions carrying a list of keys rather than a single one. */
function keyList(body: Record<string, unknown>): NudgeKey[] | null {
  return Array.isArray(body.keys) ? (body.keys.filter(k => typeof k === 'string') as NudgeKey[]) : null
}

export async function POST(request: NextRequest) {
  const { admin, userId } = await authenticate(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const action = body?.action as Action | undefined
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}` }, { status: 400 })
  }
  const keys = keyList(body || {})
  // 'seen' carries nothing; 'skipped' needs a list; 'completed' takes either.
  if (action === 'skipped' && !keys) {
    return NextResponse.json({ error: 'keys must be an array' }, { status: 400 })
  }
  if (action !== 'skipped' && action !== 'seen' && typeof body?.key !== 'string' && !keys) {
    return NextResponse.json({ error: 'key or keys is required' }, { status: 400 })
  }

  if (columnMissing) return NextResponse.json({ nudgeState: EMPTY_NUDGE_STATE, available: false })

  const { data: row, error: readError } = await admin
    .from('candidate_profiles')
    .select('nudge_state')
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) {
    if (isMissingColumn(readError)) {
      columnMissing = true
      console.warn('[nudge-state] nudge_state column not present — transition ignored')
      return NextResponse.json({ nudgeState: EMPTY_NUDGE_STATE, available: false })
    }
    return NextResponse.json({ error: 'Failed to load nudge state' }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })

  const current = parseNudgeState(row.nudge_state)
  let next: NudgeState
  let isNewSession = false
  switch (action) {
    case 'shown':     next = markShown(current, body.key as NudgeKey); break
    case 'dismissed': next = markDismissed(current, body.key as NudgeKey); break
    case 'completed':
      next = (keys ?? [body.key as NudgeKey]).reduce((s, k) => markCompleted(s, k), current)
      break
    case 'skipped':   next = queueSkipped(current, keys as NudgeKey[]); break
    case 'seen': {
      const touched = touchSession(current)
      next = touched.state
      isNewSession = touched.isNewSession
      break
    }
  }

  const { error: writeError } = await admin
    .from('candidate_profiles')
    .update({ nudge_state: next })
    .eq('user_id', userId)

  if (writeError) {
    if (isMissingColumn(writeError)) {
      columnMissing = true
      return NextResponse.json({ nudgeState: EMPTY_NUDGE_STATE, available: false })
    }
    return NextResponse.json({ error: 'Failed to save nudge state' }, { status: 500 })
  }

  return NextResponse.json({ nudgeState: next, available: true, isNewSession })
}
