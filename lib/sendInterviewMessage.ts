import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Send an in-app message from an employer to a candidate about an interview.
 * Finds or creates a conversation thread, then inserts the message.
 * Server-side only (uses service-role client).
 */
export async function sendInterviewMessage({
  employerId,
  candidateId,
  companyName,
  candidateName,
  jobId,
  jobTitle,
  content,
}: {
  employerId: string
  candidateId: string
  companyName: string
  candidateName: string
  jobId: string | null
  jobTitle: string
  content: string
}) {
  try {
    // Find existing conversation
    let conversationId: string | null = null
    const { data: existingConv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .or(
        `and(participant_1.eq.${employerId},participant_2.eq.${candidateId}),and(participant_1.eq.${candidateId},participant_2.eq.${employerId})`
      )
      .eq('related_job_id', jobId || '')
      .maybeSingle()

    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv } = await supabaseAdmin
        .from('conversations')
        .insert({
          participant_1: employerId,
          participant_2: candidateId,
          participant_1_name: companyName,
          participant_1_role: 'employer',
          participant_1_company: companyName,
          participant_2_name: candidateName,
          participant_2_role: 'candidate',
          related_job_id: jobId,
          related_job_title: jobTitle,
          last_message: content,
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (newConv) conversationId = newConv.id
    }

    if (!conversationId) return

    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: employerId,
      sender_name: companyName,
      sender_role: 'employer',
      content,
      is_read: false,
    })

    if (existingConv) {
      await supabaseAdmin
        .from('conversations')
        .update({ last_message: content, last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
    }
  } catch (err) {
    console.error('[sendInterviewMessage]', err)
  }
}
