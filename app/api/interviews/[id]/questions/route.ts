import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'
import {
  INTERVIEW_QUESTION_MODEL,
  INTERVIEW_QUESTION_FEATURE,
  INTERVIEW_QUESTION_DAILY_LIMIT,
  parseGeneratedQuestions,
  formatQuestionsToHtml,
} from '@/lib/aiModel'

// AI interview-question generation. Reads the candidate + job evidence
// SERVER-SIDE (the browser only sends the interview id — no candidate PII from
// the client), calls Anthropic Sonnet, and returns allowlist-sanitised notes
// HTML to append below the employer's existing prep notes. Owner-only, capability
// flagged, and capped at INTERVIEW_QUESTION_DAILY_LIMIT successful generations
// per employer per UTC day.

export const dynamic = 'force-dynamic'
// 60s (Vercel ceiling is 300s) — the questions route does several DB lookups
// then a large Sonnet generation; 30s occasionally timed out (504) on a cold
// start + slow model response. 60s gives ample headroom.
export const maxDuration = 60

const todayUtc = () => new Date().toISOString().slice(0, 10)

async function getUserId(req: NextRequest): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(_n: string, _v: string, _o: CookieOptions) {},
        remove(_n: string, _o: CookieOptions) {},
      },
    },
  )
  const { data, error } = await supabase.auth.getUser()
  if (!error && data?.user) return data.user.id
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  const token = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null
  if (token) {
    const { data: b, error: be } = await supabaseAdmin.auth.getUser(token)
    if (!be && b?.user) return b.user.id
  }
  return null
}

// Returns the interview row (with evidence FKs) only if this employer owns it.
async function getOwnedInterview(interviewId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('interviews')
    .select('id, application_id, job_id, candidate_id, employer_id')
    .eq('id', interviewId)
    .eq('employer_id', userId)
    .maybeSingle()
  return data
}

async function isFeatureEnabled(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('employer_profiles')
    .select('ai_questions_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  // Default-on during the free period: absent row/flag → enabled.
  return (data as { ai_questions_enabled?: boolean } | null)?.ai_questions_enabled !== false
}

async function usedToday(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('ai_generation_usage')
    .select('count')
    .eq('employer_id', userId)
    .eq('usage_date', todayUtc())
    .eq('feature', INTERVIEW_QUESTION_FEATURE)
    .maybeSingle()
  return (data as { count?: number } | null)?.count ?? 0
}

// GET — capability + today's usage, so the modal can show/hide the button and a
// remaining count. No generation, no quota consumption.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await getOwnedInterview(params.id, userId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const [enabled, used] = await Promise.all([isFeatureEnabled(userId), usedToday(userId)])
  return NextResponse.json({
    enabled,
    used,
    limit: INTERVIEW_QUESTION_DAILY_LIMIT,
    remaining: Math.max(0, INTERVIEW_QUESTION_DAILY_LIMIT - used),
  })
}

// ── Evidence assembly (server-side) ──────────────────────────────────────────
function fmtWorkHistory(wh: unknown): string {
  if (!Array.isArray(wh)) return ''
  return wh.slice(0, 8).map((e: any) => {
    const role = e?.role || e?.title || ''
    const venue = e?.venue || e?.company || ''
    const from = e?.from || e?.startDate || ''
    const to = e?.to || e?.endDate || 'present'
    const detail = e?.detail || e?.description || ''
    const head = [role, venue].filter(Boolean).join(' at ')
    const when = from ? ` (${from}–${to})` : ''
    return `- ${head}${when}${detail ? `: ${detail}` : ''}`
  }).filter(Boolean).join('\n').slice(0, 4000)
}

function fmtScreening(sa: unknown): string {
  if (!Array.isArray(sa)) return ''
  return sa.slice(0, 10).map((e: any) => {
    const q = e?.question || ''
    const a = e?.answer || ''
    if (!q && !a) return ''
    return `Q: ${q}\nA: ${a}`
  }).filter(Boolean).join('\n').slice(0, 2500)
}

function fmtList(v: unknown): string {
  return Array.isArray(v) ? v.filter(Boolean).join(', ') : ''
}

async function buildEvidence(interview: { application_id: string | null; job_id: string | null; candidate_id: string }) {
  const [jobRes, candRes, appRes] = await Promise.all([
    interview.job_id
      ? supabaseAdmin.from('jobs').select('title, description, full_description, requirements, responsibilities, skills_required, experience_required, category').eq('id', interview.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('candidate_profiles').select('full_name, job_title, job_sector, years_experience, skills, bio, personal_bio, work_history').eq('user_id', interview.candidate_id).maybeSingle(),
    interview.application_id
      ? supabaseAdmin.from('job_applications').select('cover_letter, screening_answers').eq('id', interview.application_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const job: any = jobRes.data || {}
  const cand: any = candRes.data || {}
  const app: any = appRes.data || {}

  const jobTitle = job.title || cand.job_title || 'the role'
  const industry = job.category || cand.job_sector || ''
  const jobDesc = (job.full_description || job.description || '').slice(0, 3000)

  const lines: string[] = []
  lines.push(`ROLE: ${jobTitle}`)
  if (industry) lines.push(`INDUSTRY/SECTOR: ${industry}`)
  if (jobDesc) lines.push(`JOB DESCRIPTION:\n${jobDesc}`)
  if (fmtList(job.responsibilities)) lines.push(`RESPONSIBILITIES: ${fmtList(job.responsibilities)}`)
  if (fmtList(job.requirements)) lines.push(`REQUIREMENTS: ${fmtList(job.requirements)}`)
  if (fmtList(job.skills_required)) lines.push(`SKILLS REQUIRED: ${fmtList(job.skills_required)}`)
  if (job.experience_required) lines.push(`EXPERIENCE REQUIRED: ${job.experience_required}`)
  lines.push('')
  lines.push('CANDIDATE EVIDENCE (their own claims — pressure-test these):')
  if (cand.years_experience != null) lines.push(`Years of experience (stated): ${cand.years_experience}`)
  if (fmtList(cand.skills)) lines.push(`Skills (stated): ${fmtList(cand.skills)}`)
  const bio = (cand.bio || cand.personal_bio || '').slice(0, 1200)
  if (bio) lines.push(`Profile bio: ${bio}`)
  const wh = fmtWorkHistory(cand.work_history)
  if (wh) lines.push(`Work history:\n${wh}`)
  const cover = (app.cover_letter || '').slice(0, 2500)
  if (cover) lines.push(`Cover letter:\n${cover}`)
  const screening = fmtScreening(app.screening_answers)
  if (screening) lines.push(`Application screening answers:\n${screening}`)

  const hasRichEvidence = !!(wh || cover || fmtList(cand.skills))
  return { prompt: lines.join('\n'), jobTitle, industry, hasRichEvidence }
}

const SYSTEM_PROMPT = `You are an expert UK hiring interviewer. Given a specific job (role + industry + requirements) and a candidate's own stated evidence (work history, skills, profile bio, cover letter, application answers), generate a focused set of interview questions to help the employer prepare.

Rules:
- Tailor every question to THIS role and THIS industry. Never produce generic questions that would fit any job.
- WEIGHT TOWARD VERIFICATION: most questions should pressure-test whether the candidate's stated experience is real and as deep as claimed (a CV/profile can over- or under-state). Reference concrete evidence the candidate provided — a named employer/venue, a specific stated skill, a claim in their cover letter — so the question cannot be answered with generic waffle.
- Also include a few role-fit questions (can they actually do the day-to-day of this role) and 1-2 culture/values questions.
- NEVER invent facts the candidate did not provide. If a detail isn't in the evidence, do not assert it. If the evidence is thin, ask more general questions that are still specific to the role and industry.
- Each question gets a one-line "why" explaining what it tests.
- Return STRICT JSON ONLY — no prose, no markdown fences. A JSON array of 10-12 objects, each exactly: {"type": "verification" | "role-fit" | "culture", "question": string, "why": string}. Order verification first.`

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const interview = await getOwnedInterview(params.id, userId)
  if (!interview) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  if (!(await isFeatureEnabled(userId))) {
    return NextResponse.json({ error: 'AI question generation is not enabled for your account.' }, { status: 403 })
  }

  // Rate-limit CHECK (increment happens only after a successful generation).
  const used = await usedToday(userId)
  if (used >= INTERVIEW_QUESTION_DAILY_LIMIT) {
    return NextResponse.json(
      { error: `You've used today's ${INTERVIEW_QUESTION_DAILY_LIMIT} AI generations.`, limit: INTERVIEW_QUESTION_DAILY_LIMIT, used },
      { status: 429 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })

  const { prompt: userPrompt } = await buildEvidence(interview)

  let aiText = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: INTERVIEW_QUESTION_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('Anthropic API error (interview-questions):', res.status, errText)
      return NextResponse.json({ error: "Couldn't generate right now — try again." }, { status: 502 })
    }
    const result = await res.json()
    aiText = result.content?.[0]?.text || ''
  } catch (e) {
    console.error('interview-questions fetch error:', e)
    return NextResponse.json({ error: "Couldn't generate right now — try again." }, { status: 502 })
  }

  // Reuse the strip-fences + direct-parse + regex-fallback pattern from the
  // job-ad path in ai-assist.
  const cleaned = aiText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  let parsedRaw: unknown = null
  try {
    parsedRaw = JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (match) { try { parsedRaw = JSON.parse(match[0]) } catch { /* falls through */ } }
  }

  const questions = parseGeneratedQuestions(parsedRaw)
  if (!questions.length) {
    console.error('interview-questions parse failure:', cleaned.slice(0, 400))
    return NextResponse.json({ error: "Couldn't generate right now — try again." }, { status: 502 })
  }

  const html = sanitizeNoteHtml(formatQuestionsToHtml(questions))

  // Success → consume one unit of today's quota (read-modify-write; a soft cap,
  // so the rare concurrent-double-spend is acceptable).
  const newCount = used + 1
  await supabaseAdmin
    .from('ai_generation_usage')
    .upsert(
      { employer_id: userId, usage_date: todayUtc(), feature: INTERVIEW_QUESTION_FEATURE, count: newCount },
      { onConflict: 'employer_id,usage_date,feature' },
    )

  return NextResponse.json({
    questions,
    html,
    used: newCount,
    limit: INTERVIEW_QUESTION_DAILY_LIMIT,
    remaining: Math.max(0, INTERVIEW_QUESTION_DAILY_LIMIT - newCount),
  })
}
