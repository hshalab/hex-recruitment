import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { runSimulatorTick } from '@/lib/simulator'

// Employer-session entry into the simulator. The employer dashboard fires a
// fire-and-forget call to this endpoint on mount, which keeps the simulator
// feeling live even though Vercel Hobby plans only allow daily crons.
//
// Auth: must be a logged-in user with role=employer in user_metadata.
// Throttle: at most one tick every 60s per server instance — successive
// dashboard loads from the same employer (or noisy useEffect re-runs in dev)
// are short-circuited so we don't pile up parallel admin DB writes.

let lastRunAt = 0
const MIN_INTERVAL_MS = 60_000

export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(_name: string, _value: string, _options: CookieOptions) { /* read-only */ },
        remove(_name: string, _options: CookieOptions) { /* read-only */ },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.user_metadata?.role !== 'employer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = Date.now()
  if (now - lastRunAt < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: true, throttled: true, nextRunInMs: MIN_INTERVAL_MS - (now - lastRunAt) })
  }
  lastRunAt = now

  const counts = await runSimulatorTick()
  return NextResponse.json({ ok: true, ...counts })
}
