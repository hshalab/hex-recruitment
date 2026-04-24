import { supabase } from './supabase'

const BUCKET = 'profiles'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

/**
 * Extract the storage path from a Supabase public URL or return the
 * value as-is if it's already a relative path.
 *
 * Public URLs look like:
 *   https://<ref>.supabase.co/storage/v1/object/public/profiles/<path>
 */
function extractPath(urlOrPath: string): string {
  if (!urlOrPath) return ''
  // Already a relative path (no protocol)
  if (!urlOrPath.startsWith('http')) return urlOrPath
  // Extract path after /profiles/
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = urlOrPath.indexOf(marker)
  if (idx !== -1) return urlOrPath.slice(idx + marker.length)
  // Signed URL marker
  const signedMarker = `/storage/v1/object/sign/${BUCKET}/`
  const sIdx = urlOrPath.indexOf(signedMarker)
  if (sIdx !== -1) return urlOrPath.slice(sIdx + signedMarker.length).split('?')[0]
  return urlOrPath
}

/**
 * Get a signed URL for a file in the profiles bucket. Returns the
 * original value unchanged if it's not a Supabase storage URL (e.g.
 * an external avatar URL from Google).
 *
 * @param urlOrPath - full public URL, signed URL, or relative path
 * @param expiresIn - seconds until the signed URL expires (default 1 hour)
 * @param download - if true, Supabase adds Content-Disposition: attachment so
 *   browsers save the file instead of viewing it inline. Pass a filename to
 *   override what the browser saves it as.
 */
export async function getSignedStorageUrl(
  urlOrPath: string | null | undefined,
  expiresIn = 3600,
  download?: boolean | string
): Promise<string> {
  if (!urlOrPath) return ''
  // External URLs (Google avatar, etc.) — pass through
  if (urlOrPath.startsWith('http') && !urlOrPath.includes(SUPABASE_URL)) {
    return urlOrPath
  }
  const path = extractPath(urlOrPath)
  if (!path) return ''
  const options: { download?: string | boolean } = {}
  if (download !== undefined) options.download = download
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn, options)
  if (error || !data?.signedUrl) return ''
  return data.signedUrl
}
