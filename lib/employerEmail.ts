import { createClient } from '@supabase/supabase-js'

/**
 * The employer's email address, by the same two-step lookup an Easy apply uses.
 *
 * Extracted rather than reimplemented: /api/send-application-email has resolved
 * employer addresses this way for months, including the auth.users fallback that
 * exists because an employer who signed up with OAuth can have a thin
 * employer_profiles row with no email on it. A second copy of this would drift,
 * and the failure mode of drifting is an agency who never hears that someone
 * applied.
 *
 * Returns null when there is genuinely nowhere to send — callers should treat
 * that as "no email", never as an error worth failing the user's action for.
 */
export async function resolveEmployerEmail(employerId: string): Promise<string | null> {
  if (!employerId) return null

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  // Primary: the address the employer gave us.
  const { data: profile } = await admin
    .from('employer_profiles')
    .select('email')
    .eq('user_id', employerId)
    .maybeSingle()
  if (profile?.email) return profile.email

  // Fallback: the address they authenticate with. Only available with the
  // service role, which is why this is server-only.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await admin.auth.admin.getUserById(employerId)
    if (data?.user?.email) {
      console.log('[employerEmail] using auth.users fallback for', employerId)
      return data.user.email
    }
  }

  console.warn('[employerEmail] no address found for', employerId)
  return null
}
