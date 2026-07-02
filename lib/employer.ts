import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve the OWNER user_id of the employer the current signed-in user belongs to.
 *
 * Multi-user accounts (Phase 1/2): a user may be an OWNER of an employer or an
 * invited MEMBER of someone else's. Every employer-scoped table stores
 * `employer_id` = the OWNER'S auth user_id (a historical quirk — not
 * employer_profiles.id), so callers keep using `.eq('employer_id', X)` /
 * `employer_profiles.eq('user_id', X)` unchanged — only the SOURCE of X changes:
 * from "my own session id" to "the owner id of the employer I'm active in".
 *
 * Implemented on the SECURITY DEFINER `current_employer_ids()` RPC (returns the
 * owner user_ids the caller is an active member of). For an owner this returns
 * their own id, so behaviour is unchanged for the existing single-user accounts.
 *
 * v1 assumption: one active employer per user (we take the first). Returns null
 * if the user is not an active member of any employer.
 *
 * Works with either the browser client (lib/supabase) or a server client
 * (createServerClient) — pass whichever the caller already has.
 */
export async function getCurrentEmployerOwnerId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_employer_ids')
  if (error || !Array.isArray(data) || data.length === 0) return null
  return (data[0] as string) ?? null
}

/**
 * Server/admin variant of getCurrentEmployerOwnerId for API routes that hold a
 * service-role client (supabaseAdmin) — there is no auth.uid() context there,
 * so the RPC can't be used. Resolves the owner user_id for a KNOWN user id by
 * reading their active membership and bridging employer_profiles.id → user_id.
 *
 * Returns null if the user is not an active member of any employer (callers
 * should fall back to the user's own id to preserve single-user behaviour).
 */
export async function getEmployerOwnerIdForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: member } = await admin
    .from('employer_members')
    .select('employer_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!member) return null
  const { data: profile } = await admin
    .from('employer_profiles')
    .select('user_id')
    .eq('id', (member as { employer_id: string }).employer_id)
    .maybeSingle()
  return (profile as { user_id: string } | null)?.user_id ?? null
}
