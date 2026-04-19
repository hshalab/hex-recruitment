import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Validate a scheduling token and return interview context.
 * The candidate uses this to load the self-scheduling page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    const { data: interview, error } = await supabaseAdmin
      .from('interviews')
      .select('id, employer_id, candidate_id, application_id, job_id, interview_type, location_or_link, duration_minutes, status, jobs ( title, company )')
      .eq('scheduling_token', token)
      .maybeSingle()

    if (error || !interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }

    if (interview.status !== 'pending_self_schedule') {
      return NextResponse.json({
        error: interview.status === 'scheduled' || interview.status === 'confirmed'
          ? 'This interview has already been scheduled'
          : 'This invitation is no longer valid',
      }, { status: 410 })
    }

    const job: any = interview.jobs ? (Array.isArray(interview.jobs) ? interview.jobs[0] : interview.jobs) : null

    return NextResponse.json({
      interviewId: interview.id,
      employerId: interview.employer_id,
      candidateId: interview.candidate_id,
      applicationId: interview.application_id,
      jobId: interview.job_id,
      jobTitle: job?.title || '',
      company: job?.company || '',
      interviewType: interview.interview_type,
      duration: interview.duration_minutes || 45,
      locationOrLink: interview.location_or_link || '',
    })
  } catch (err: any) {
    console.error('[interview/schedule] error:', err.message)
    return NextResponse.json({ error: 'Failed to load scheduling page' }, { status: 500 })
  }
}
