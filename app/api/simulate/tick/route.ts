import { NextRequest, NextResponse } from 'next/server'
import { runSimulatorTick } from '@/lib/simulator'

// Cron-style entry into the simulator. Authenticated by a Bearer secret so it
// can be poked by a Vercel deploy hook or any external scheduler. The actual
// tick logic lives in lib/simulator.ts and is shared with /api/simulate/run.

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const counts = await runSimulatorTick()
  return NextResponse.json({ ok: true, ...counts })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
