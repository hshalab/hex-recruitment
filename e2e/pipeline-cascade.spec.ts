import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local first (supabase URL + anon key) then .env.test (account creds).
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: false })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMPLOYER_EMAIL = process.env.EMPLOYER_EMAIL
const EMPLOYER_PASS = process.env.EMPLOYER_PASS
const CANDIDATE_EMAIL = process.env.CANDIDATE_EMAIL
const CANDIDATE_PASS = process.env.CANDIDATE_PASS

// RLS on these tables splits inserts across roles:
//   jobs / interviews / job_offers → employer-side
//   job_applications              → candidate-side
// So the seed needs both sessions. Each test creates its own pair of
// clients, runs through the cascade, then cleans up by deleting the
// seed job (which cascades to application + interview + log rows).

interface Sessions { employer: SupabaseClient; candidate: SupabaseClient; employerId: string; candidateId: string }

async function openSessions(): Promise<Sessions> {
  // Smoke-check the network from inside the runner — surface a clearer
  // error than supabase-js's bare "fetch failed" if DNS or TLS is hosed.
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: 'GET' })
    if (!r.ok && r.status !== 404 && r.status !== 401) {
      throw new Error(`supabase reachable but health returned ${r.status}`)
    }
  } catch (e) {
    throw new Error(`runner cannot reach supabase at ${SUPABASE_URL}: ${(e as Error).message}`)
  }

  const employer = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error: empErr } = await employer.auth.signInWithPassword({ email: EMPLOYER_EMAIL!, password: EMPLOYER_PASS! })
  if (empErr) throw new Error(`employer sign-in: ${empErr.message}`)
  const employerId = (await employer.auth.getSession()).data.session?.user.id
  if (!employerId) throw new Error('employer session missing')

  const candidate = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error: candErr } = await candidate.auth.signInWithPassword({ email: CANDIDATE_EMAIL!, password: CANDIDATE_PASS! })
  if (candErr) throw new Error(`candidate sign-in: ${candErr.message}`)
  const candidateId = (await candidate.auth.getSession()).data.session?.user.id
  if (!candidateId) throw new Error('candidate session missing')

  return { employer, candidate, employerId, candidateId }
}

interface Fixture { jobId: string; applicationId: string; interviewId: string }

async function seed(s: Sessions, label: string): Promise<Fixture> {
  const { data: job, error: jobErr } = await s.employer
    .from('jobs')
    .insert({
      employer_id: s.employerId,
      title: `[SEED-CASCADE] ${label}`,
      company: 'Test Co',
      location: 'London',
      salary_min: 30000, salary_max: 35000, salary_type: 'annual',
      views: 0, is_recruiter_posting: false, status: 'active',
      description: 'Cascade trigger seed. Safe to delete.',
    })
    .select('id')
    .single()
  if (jobErr || !job) throw new Error(`seed jobs: ${jobErr?.message}`)

  const { data: app, error: appErr } = await s.candidate
    .from('job_applications')
    .insert({
      job_id: job.id,
      candidate_id: s.candidateId,
      status: 'interview',
      job_title: `[SEED-CASCADE] ${label}`,
      company: 'Test Co',
    })
    .select('id')
    .single()
  if (appErr || !app) throw new Error(`seed application: ${appErr?.message}`)

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: iv, error: ivErr } = await s.employer
    .from('interviews')
    .insert({
      application_id: app.id,
      job_id: job.id,
      employer_id: s.employerId,
      candidate_id: s.candidateId,
      interview_date: yesterday,
      interview_time: '14:00',
      duration_minutes: 30,
      interview_type: 'video',
      status: 'confirmed',
    })
    .select('id')
    .single()
  if (ivErr || !iv) throw new Error(`seed interview: ${ivErr?.message}`)

  return { jobId: job.id, applicationId: app.id, interviewId: iv.id }
}

async function teardown(s: Sessions, jobId: string): Promise<void> {
  await s.employer.from('jobs').delete().eq('id', jobId)
}

test.describe('Pipeline cascade trigger', () => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY || !EMPLOYER_EMAIL || !EMPLOYER_PASS || !CANDIDATE_EMAIL || !CANDIDATE_PASS,
    'Supabase env or account creds missing — set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local plus EMPLOYER_* and CANDIDATE_* in .env.test',
  )

  test('forward → hired: past-dated interview becomes completed and a log row is written', async () => {
    const s = await openSessions()
    const fx = await seed(s, 'forward-to-hired')

    try {
      const { error: updErr } = await s.employer
        .from('job_applications')
        .update({ status: 'hired', status_updated_at: new Date().toISOString() })
        .eq('id', fx.applicationId)
      expect(updErr, 'application update').toBeNull()

      const { data: iv } = await s.employer
        .from('interviews')
        .select('status')
        .eq('id', fx.interviewId)
        .single()
      expect(iv?.status, 'interview status after hired').toBe('completed')

      const { data: logs } = await s.employer
        .from('pipeline_cascade_log')
        .select('cascade_kind')
        .eq('application_id', fx.applicationId)
      const kinds = (logs || []).map(r => r.cascade_kind)
      expect(kinds, 'log row written for interview_completed').toContain('interview_completed')
    } finally {
      await teardown(s, fx.jobId)
    }
  })

  test('decline-from-interview: live interview becomes cancelled and a log row is written', async () => {
    const s = await openSessions()
    const fx = await seed(s, 'decline-from-interview')

    try {
      const { error: updErr } = await s.employer
        .from('job_applications')
        .update({ status: 'rejected', status_updated_at: new Date().toISOString() })
        .eq('id', fx.applicationId)
      expect(updErr, 'application update').toBeNull()

      const { data: iv } = await s.employer
        .from('interviews')
        .select('status')
        .eq('id', fx.interviewId)
        .single()
      expect(iv?.status, 'interview status after rejected').toBe('cancelled')

      const { data: logs } = await s.employer
        .from('pipeline_cascade_log')
        .select('cascade_kind')
        .eq('application_id', fx.applicationId)
      const kinds = (logs || []).map(r => r.cascade_kind)
      expect(kinds, 'log row written for interview_cancelled').toContain('interview_cancelled')
    } finally {
      await teardown(s, fx.jobId)
    }
  })
})
