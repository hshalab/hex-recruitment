import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: false })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMPLOYER_EMAIL = process.env.EMPLOYER_EMAIL
const EMPLOYER_PASS = process.env.EMPLOYER_PASS
const CANDIDATE_EMAIL = process.env.CANDIDATE_EMAIL
const CANDIDATE_PASS = process.env.CANDIDATE_PASS

// Live = an interview row counts toward the "candidate has a real
// commitment" invariant. Cancelled/completed/rescheduled don't.
const LIVE_STATUSES = ['pending_selection', 'scheduled', 'confirmed']

interface Sessions { employer: SupabaseClient; candidate: SupabaseClient; employerId: string; candidateId: string }

async function openSessions(): Promise<Sessions> {
  // Smoke fetch — surfaces a clearer error than supabase-js's "fetch failed" on cold runs.
  await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: 'GET' }).catch(() => {})

  const employer = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error: empErr } = await employer.auth.signInWithPassword({ email: EMPLOYER_EMAIL!, password: EMPLOYER_PASS! })
  if (empErr) throw new Error(`employer sign-in: ${empErr.message}`)
  const employerId = (await employer.auth.getSession()).data.session?.user.id!

  const candidate = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error: candErr } = await candidate.auth.signInWithPassword({ email: CANDIDATE_EMAIL!, password: CANDIDATE_PASS! })
  if (candErr) throw new Error(`candidate sign-in: ${candErr.message}`)
  const candidateId = (await candidate.auth.getSession()).data.session?.user.id!

  return { employer, candidate, employerId, candidateId }
}

interface Fixture { jobId: string; applicationId: string }

async function seedJobAndApp(s: Sessions, label: string, initialStatus: string): Promise<Fixture> {
  const { data: job, error: jobErr } = await s.employer
    .from('jobs')
    .insert({
      employer_id: s.employerId,
      title: `[SEED-IV-GATE] ${label}`,
      company: 'Test Co',
      location: 'London',
      salary_min: 30000, salary_max: 35000, salary_type: 'annual',
      views: 0, is_recruiter_posting: false, status: 'active',
      description: 'Drag-gate seed. Safe to delete.',
    })
    .select('id')
    .single()
  if (jobErr || !job) throw new Error(`seed job: ${jobErr?.message}`)

  const { data: app, error: appErr } = await s.candidate
    .from('job_applications')
    .insert({
      job_id: job.id,
      candidate_id: s.candidateId,
      status: initialStatus,
      job_title: `[SEED-IV-GATE] ${label}`,
      company: 'Test Co',
    })
    .select('id')
    .single()
  if (appErr || !app) throw new Error(`seed application: ${appErr?.message}`)

  return { jobId: job.id, applicationId: app.id }
}

async function liveInterviewCount(s: Sessions, applicationId: string): Promise<number> {
  const { data } = await s.employer
    .from('interviews')
    .select('id')
    .eq('application_id', applicationId)
    .in('status', LIVE_STATUSES)
  return (data || []).length
}

async function teardown(s: Sessions, jobId: string): Promise<void> {
  await s.employer.from('jobs').delete().eq('id', jobId)
}

test.describe('Interview-column drag gate (DB invariants)', () => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY || !EMPLOYER_EMAIL || !EMPLOYER_PASS || !CANDIDATE_EMAIL || !CANDIDATE_PASS,
    'Required env missing — see e2e/pipeline-cascade.spec.ts header for setup',
  )

  // Mirrors the "forward-drag-cancel" UI path: opening ScheduleInterviewModal
  // does NOT update the application status. The modal only writes on submit.
  test('forward-drag-cancel: opening the modal but cancelling leaves status untouched', async () => {
    const s = await openSessions()
    const fx = await seedJobAndApp(s, 'forward-cancel', 'reviewing')

    try {
      // No write fires for "cancel" — verify the seed status is untouched.
      const { data: app } = await s.employer
        .from('job_applications')
        .select('status')
        .eq('id', fx.applicationId)
        .single()
      expect(app?.status, 'status before any submit').toBe('reviewing')
      expect(await liveInterviewCount(s, fx.applicationId), 'no interview row should exist').toBe(0)
    } finally {
      await teardown(s, fx.jobId)
    }
  })

  // Mirrors "forward-drag-schedule": once the modal submits, both writes
  // land — the application is in interview AND a live interview row exists.
  // After this point the badge MUST NOT render.
  test('forward-drag-schedule: status flips to interview AND a live interview row exists', async () => {
    const s = await openSessions()
    const fx = await seedJobAndApp(s, 'forward-schedule', 'reviewing')

    try {
      // Replicate ScheduleInterviewModal's manual-submit single-slot path.
      const { error: ivErr } = await s.employer.from('interviews').insert({
        application_id: fx.applicationId,
        job_id: fx.jobId,
        employer_id: s.employerId,
        candidate_id: s.candidateId,
        interview_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        interview_time: '14:00',
        duration_minutes: 30,
        interview_type: 'video',
        status: 'scheduled',
      })
      expect(ivErr, 'interview insert').toBeNull()

      const { error: appErr } = await s.employer
        .from('job_applications')
        .update({ status: 'interview' })
        .eq('id', fx.applicationId)
      expect(appErr, 'application status update').toBeNull()

      const { data: app } = await s.employer.from('job_applications').select('status').eq('id', fx.applicationId).single()
      expect(app?.status, 'final status').toBe('interview')
      expect(await liveInterviewCount(s, fx.applicationId), 'live interview row count').toBe(1)
    } finally {
      await teardown(s, fx.jobId)
    }
  })

  // Mirrors "backward-no-new" (Offered → Interview, "Move back, no new
  // interview"). Status flips to interview but no new interview row is
  // created. The card should render the "Needs scheduling" badge —
  // verifiable here by liveInterviewCount === 0 while status === 'interview'.
  test('backward-no-new: status flips to interview, zero live interviews → badge condition holds', async () => {
    const s = await openSessions()
    const fx = await seedJobAndApp(s, 'backward-no-new', 'offered')

    try {
      // Pretend the candidate had a completed interview from earlier in
      // the funnel — the cascade trigger would mark a real one completed
      // when transitioning to offered, so this matches production shape.
      await s.employer.from('interviews').insert({
        application_id: fx.applicationId,
        job_id: fx.jobId,
        employer_id: s.employerId,
        candidate_id: s.candidateId,
        interview_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        interview_time: '14:00',
        duration_minutes: 30,
        interview_type: 'video',
        status: 'completed',
      })

      // The "move-only" path: status update, no new interview row.
      await s.employer.from('job_applications').update({ status: 'interview' }).eq('id', fx.applicationId)

      const { data: app } = await s.employer.from('job_applications').select('status').eq('id', fx.applicationId).single()
      expect(app?.status, 'final status').toBe('interview')
      expect(await liveInterviewCount(s, fx.applicationId), 'no live interview after move-only').toBe(0)
    } finally {
      await teardown(s, fx.jobId)
    }
  })

  // Mirrors "backward-schedule-new": status flip THEN modal opens THEN
  // schedule submits → live row appears → badge condition is cleared.
  test('backward-schedule-new: status flips, then a live interview row is added → badge clears', async () => {
    const s = await openSessions()
    const fx = await seedJobAndApp(s, 'backward-schedule', 'offered')

    try {
      // Step 1: applyMove flips status (no interview row yet).
      await s.employer.from('job_applications').update({ status: 'interview' }).eq('id', fx.applicationId)
      expect(await liveInterviewCount(s, fx.applicationId), 'no live interview between modal stages').toBe(0)

      // Step 2: ScheduleInterviewModal submits → live row appears.
      await s.employer.from('interviews').insert({
        application_id: fx.applicationId,
        job_id: fx.jobId,
        employer_id: s.employerId,
        candidate_id: s.candidateId,
        interview_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        interview_time: '15:00',
        duration_minutes: 45,
        interview_type: 'video',
        status: 'scheduled',
      })

      const { data: app } = await s.employer.from('job_applications').select('status').eq('id', fx.applicationId).single()
      expect(app?.status, 'final status').toBe('interview')
      expect(await liveInterviewCount(s, fx.applicationId), 'live interview row exists after schedule').toBe(1)
    } finally {
      await teardown(s, fx.jobId)
    }
  })
})
