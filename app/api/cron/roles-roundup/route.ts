import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { rolesRoundupEmail } from '@/emails/roles-roundup'
// Same unsubscribe token and the same email.job_digest opt-in as the digest —
// one "stop these emails" answer covers both, which is what a candidate means
// when they click it.
import { generateDigestUnsubscribeToken } from '@/lib/jobDigestToken'
import { BASE_URL } from '@/emails/layout'
import type { DigestJobRow } from '@/lib/jobDigest'
import {
  planFor,
  buildIdf,
  markSent,
  parseRoundupState,
  matchModeFor,
  ROLES_PER_EMAIL,
  CADENCE_DAYS,
  ROUNDUP_MEMORY,
  type RoundupCandidateRow,
  type RoundupPlan,
  type ExclusionReason,
} from '@/lib/rolesRoundup'

// "Roles for you this week" — recurring re-engagement over CURRENT inventory.
//
// Modes, POST body { mode }:
//   'dry-run' (default) — full audience split + a real rendered sample.
//                         Sends nothing, writes nothing.
//   'test'              — one email to ONE nominated address. Writes nothing.
//   'send'              — the real thing, and also requires confirm:'SEND'.
//
// CRON_SECRET, fail-closed. GET is status-only and has NO send path at all:
// unlike the digest this is not scheduled to send yet, so there is deliberately
// no way for a scheduler to trigger a campaign here.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const CANDIDATE_SELECT =
  'user_id, email, full_name, job_title, job_sector, preferred_areas, notification_preferences, roundup_state'
const JOB_SELECT =
  'id, title, company, location, salary_min, salary_max, salary_type, category, posted_at, created_at, area_region, area_county'

type Mode = 'dry-run' | 'test' | 'send'
type JobRow = DigestJobRow & { category?: string | null }

const EMPTY_EXCLUSIONS: Record<ExclusionReason, number> = {
  'no-email': 0, 'unconfirmed': 0, 'digest-off': 0, 'no-signal': 0, 'not-due': 0, 'no-matches': 0,
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || /roundup_state/.test(error?.message || '')
}

/** Tolerates a not-yet-applied migration for counting/rendering; `send` refuses. */
async function loadCandidates(supabase: SupabaseClient) {
  const full = await supabase.from('candidate_profiles').select(CANDIDATE_SELECT)
  if (!full.error) {
    return { rows: (full.data || []) as unknown as RoundupCandidateRow[], columnMissing: false, error: null }
  }
  if (!isMissingColumn(full.error)) {
    return { rows: [] as RoundupCandidateRow[], columnMissing: false, error: full.error.message }
  }
  const bare = await supabase
    .from('candidate_profiles')
    .select('user_id, email, full_name, job_title, job_sector, preferred_areas, notification_preferences')
  if (bare.error) return { rows: [] as RoundupCandidateRow[], columnMissing: true, error: bare.error.message }
  const rows = (bare.data || []).map(r => ({ ...(r as object), roundup_state: null })) as unknown as RoundupCandidateRow[]
  return { rows, columnMissing: true, error: null }
}

async function confirmedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const confirmed = new Set<string>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    for (const u of data.users) if (u.email_confirmed_at) confirmed.add(u.id)
    if (data.users.length < 200) break
  }
  return confirmed
}

/**
 * Real, working unsubscribe link — ONLY for a genuine send.
 *
 * Dry runs and test sends must never mint one of these for a real candidate:
 * a dry run's output gets pasted into reports and a test send lands in our own
 * inbox, and in both cases a live token is one click away from opting somebody
 * else out. Those paths use previewUnsubscribeUrl() instead.
 */
function unsubscribeUrlFor(userId: string): string {
  return `${BASE_URL}/api/candidate/digest-unsubscribe?token=${generateDigestUnsubscribeToken(userId)}`
}

/** Inert stand-in: right shape, cannot unsubscribe anybody, needs no secret. */
function previewUnsubscribeUrl(): string {
  return `${BASE_URL}/api/candidate/digest-unsubscribe?token=SAMPLE_TOKEN_NOT_VALID`
}

/** Browse link, filtered to their areas where we can express it. */
function browseUrlFor(plan: RoundupPlan): string {
  if (plan.mode === 'area' && plan.areaNames.length > 0) {
    return `${BASE_URL}/jobs?area=${encodeURIComponent(plan.areaNames.join(','))}`
  }
  const q = (plan.row.job_title || '').trim()
  return q ? `${BASE_URL}/jobs?q=${encodeURIComponent(q)}` : `${BASE_URL}/jobs`
}

function renderPlan(plan: RoundupPlan, opts: { live: boolean }) {
  return rolesRoundupEmail({
    candidateName: plan.row.full_name,
    mode: plan.mode,
    areaNames: plan.areaNames,
    roleLabel: plan.row.job_title,
    jobs: plan.jobs,
    totalMatches: plan.totalMatches,
    unsubscribeUrl: opts.live ? unsubscribeUrlFor(plan.row.user_id) : previewUnsubscribeUrl(),
    browseUrl: browseUrlFor(plan),
  })
}

async function build(supabase: SupabaseClient, now: Date) {
  const { rows, columnMissing, error } = await loadCandidates(supabase)
  if (error) return { error, columnMissing, plans: [], exclusions: EMPTY_EXCLUSIONS, rows: [], jobs: [] as JobRow[] }

  const jobsResult = await supabase.from('jobs').select(JOB_SELECT).eq('status', 'active')
  if (jobsResult.error) {
    return { error: jobsResult.error.message, columnMissing, plans: [], exclusions: EMPTY_EXCLUSIONS, rows, jobs: [] as JobRow[] }
  }
  const jobs = (jobsResult.data || []) as unknown as JobRow[]
  const idf = buildIdf(jobs)
  const confirmed = await confirmedUserIds(supabase)

  const plans: RoundupPlan[] = []
  const exclusions = { ...EMPTY_EXCLUSIONS }
  for (const row of rows) {
    const { plan, reason } = planFor(row, jobs, idf, confirmed, now)
    if (plan) plans.push(plan)
    else if (reason) exclusions[reason] += 1
  }

  return { error: null, columnMissing, plans, exclusions, rows, jobs }
}

function summarise(rows: RoundupCandidateRow[], jobs: JobRow[], plans: RoundupPlan[], exclusions: Record<ExclusionReason, number>, columnMissing: boolean) {
  return {
    migrationApplied: !columnMissing,
    candidatesTotal: rows.length,
    activeJobs: jobs.length,
    wouldEmailCount: plans.length,
    audienceSplit: {
      areaMatched: plans.filter(p => p.mode === 'area').length,
      profileMatched: plans.filter(p => p.mode === 'profile').length,
      recycled: plans.filter(p => p.recycled).length,
    },
    // How many candidates COULD ever qualify, ignoring cadence and opt-in —
    // the ceiling this product has to work with.
    signalCeiling: {
      area: rows.filter(r => matchModeFor(r) === 'area').length,
      profile: rows.filter(r => matchModeFor(r) === 'profile').length,
      none: rows.filter(r => matchModeFor(r) === null).length,
    },
    excluded: exclusions,
    rolesPerEmail: ROLES_PER_EMAIL,
    cadenceDays: CADENCE_DAYS,
    antiRepeatMemory: ROUNDUP_MEMORY,
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const mode: Mode = body?.mode === 'send' || body?.mode === 'test' ? body.mode : 'dry-run'

  if (mode === 'send' && body?.confirm !== 'SEND') {
    return NextResponse.json(
      { error: "mode 'send' also requires confirm:'SEND' — refusing to mail real candidates without it" },
      { status: 400 },
    )
  }
  if (mode === 'test' && (typeof body?.testTo !== 'string' || !body.testTo.includes('@'))) {
    return NextResponse.json({ error: "mode 'test' requires testTo:'you@example.com'" }, { status: 400 })
  }

  const now = new Date()
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error, columnMissing, plans, exclusions, rows, jobs } = await build(supabase, now)

  if (error) return NextResponse.json({ error: 'Failed to build roundup: ' + error }, { status: 500 })
  if (columnMissing && mode === 'send') {
    return NextResponse.json(
      {
        error: 'candidate_profiles.roundup_state does not exist — refusing to send. ' +
          'Apply supabase/migrations/20260727081532_candidate_roundup_state.sql first, ' +
          'otherwise every week would repeat the same eight roles.',
      },
      { status: 409 },
    )
  }

  const summary = { mode, ...summarise(rows, jobs, plans, exclusions, columnMissing) }

  // ── dry run ────────────────────────────────────────────────────────
  if (mode === 'dry-run') {
    const sample = plans[0] ? renderPlan(plans[0], { live: false }) : null
    return NextResponse.json({
      ...summary,
      wouldEmail: plans.map(p => ({
        email: p.row.email,
        name: p.row.full_name,
        mode: p.mode,
        areas: p.areaNames,
        roleLabel: p.row.job_title,
        rolesListed: p.jobs.length,
        totalMatches: p.totalMatches,
        recycled: p.recycled,
        firstEver: !parseRoundupState(p.row.roundup_state).lastSentAt,
        titles: p.jobs.map(j => j.title),
      })),
      sample: sample ? { subject: sample.subject, html: sample.html } : null,
      sent: 0,
      note: 'Dry run — no email sent, no row written.',
    })
  }

  // ── test ───────────────────────────────────────────────────────────
  if (mode === 'test') {
    const realPlan = plans[0]
    if (!realPlan) {
      return NextResponse.json(
        { ...summary, sent: 0, error: 'Nobody is currently due, so there is no real plan to render. Re-run when someone qualifies.' },
        { status: 409 },
      )
    }
    const { subject, html } = renderPlan(realPlan, { live: false })
    const result = await sendEmail(body.testTo, subject, html)
    return NextResponse.json({
      ...summary,
      testTo: body.testTo,
      renderedFor: { mode: realPlan.mode, areas: realPlan.areaNames, roleLabel: realPlan.row.job_title },
      sent: result.success ? 1 : 0,
      sendError: result.error,
      note: 'Test send only — no real candidate was contacted and no row was written. The unsubscribe link in this email is inert, so clicking it cannot opt anybody out.',
    })
  }

  // ── send ───────────────────────────────────────────────────────────
  const sentTo: string[] = []
  const failed: { email: string | null; error?: string }[] = []

  for (const plan of plans) {
    const { subject, html } = renderPlan(plan, { live: true })
    const result = await sendEmail(plan.row.email!, subject, html)
    if (!result.success) {
      failed.push({ email: plan.row.email, error: result.error })
      continue
    }
    // Stamp only after a confirmed send. A failed stamp means they may see the
    // same roles next week — the right way to fail, versus stamping first and
    // silently skipping a week nobody received.
    const next = markSent(parseRoundupState(plan.row.roundup_state), plan.jobs.map(j => j.id), now)
    const { error: writeError } = await supabase
      .from('candidate_profiles')
      .update({ roundup_state: next })
      .eq('user_id', plan.row.user_id)
    if (writeError) {
      console.error('[roles-roundup] emailed but not stamped', plan.row.user_id, writeError.message)
      failed.push({ email: plan.row.email, error: 'emailed but not stamped: ' + writeError.message })
      continue
    }
    sentTo.push(plan.row.email!)
  }

  return NextResponse.json({ ...summary, sent: sentTo.length, sentTo, failed })
}

/** Status only. There is deliberately no send path on GET for this route. */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = new Date()
  const supabase = createClient(supabaseUrl, supabaseKey)
  const { error, columnMissing, plans, exclusions, rows, jobs } = await build(supabase, now)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({
    mode: 'status',
    ...summarise(rows, jobs, plans, exclusions, columnMissing),
    sent: 0,
    note: 'Status only — this route never sends on GET.',
  })
}
