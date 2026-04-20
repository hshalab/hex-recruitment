import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

/**
 * Fetch a custom email template for an employer. Returns null if no
 * custom template exists (caller should fall back to the default).
 */
export async function getCustomTemplate(
  employerId: string,
  templateType: string
): Promise<{ subject: string; body: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('employer_email_templates')
    .select('subject, body, is_active')
    .eq('employer_id', employerId)
    .eq('template_type', templateType)
    .maybeSingle()

  if (error || !data || !data.is_active) return null
  return { subject: data.subject, body: data.body }
}

/**
 * Replace template variables like {{candidateName}}, {{jobTitle}}, etc.
 */
export function applyVariables(
  text: string,
  vars: Record<string, string>
): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}
