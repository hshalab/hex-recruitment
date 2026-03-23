import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { rating, comment, pageUrl } = await request.json()

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error } = await supabase.from('platform_feedback').insert({
      page_url: pageUrl ?? null,
      rating,
      comment: typeof comment === 'string' ? comment.trim() || null : JSON.stringify(comment),
    })

    if (error) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    // Send email notification for questionnaire feedback
    if (typeof comment === 'string' && comment.startsWith('{')) {
      try {
        const parsed = JSON.parse(comment)
        if (parsed.type === 'employer-questionnaire' || parsed.type === 'candidate-questionnaire') {
          const roleLabel = parsed.type === 'employer-questionnaire' ? 'Employer' : 'Candidate'
          const lines = [
            `<h2>${roleLabel} Feedback — ${rating} stars</h2>`,
            `<p><strong>Page:</strong> ${pageUrl || 'Unknown'}</p>`,
            parsed.q2 ? `<p><strong>Q2:</strong> ${parsed.q2}</p>` : '',
            parsed.q3 ? `<p><strong>Q3:</strong> ${parsed.q3}</p>` : '',
            parsed.q4 ? `<p><strong>Q4:</strong> ${parsed.q4}</p>` : '',
            parsed.q5 ? `<p><strong>Q5:</strong> ${parsed.q5}</p>` : '',
            parsed.notes ? `<p><strong>Notes:</strong> ${parsed.notes}</p>` : '',
          ].filter(Boolean).join('')

          await sendEmail(
            'pauldavies.gbr@gmail.com',
            `New ${roleLabel.toLowerCase()} feedback — ${rating} stars`,
            `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">${lines}</div>`
          )
        }
      } catch {
        // Parsing failed — not a questionnaire, skip email
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
