import 'server-only'

// Build the base URL for an invite-accept link from the request, but only trust
// the Host header when it matches an allowlist — otherwise a poisoned Host would
// send recipients an attacker-controlled accept link. Production hosts and Vercel
// preview hosts (*.vercel.app) are allowed so preview deploys still self-link;
// anything else falls back to the configured site URL.
//
// Matching is anchored at a dot boundary (exact host or *.<domain>) so a
// look-alike like "evilthrivecareer.co.uk" does NOT pass.
const ALLOWED_DOMAINS = ['thrivecareer.co.uk']

export function inviteOrigin(req: { headers: { get(name: string): string | null } }): string {
  const fallback = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'
  const rawHost = req.headers.get('host') || ''
  const host = rawHost.toLowerCase().split(':')[0]
  if (!host) return fallback
  const ok =
    ALLOWED_DOMAINS.some(d => host === d || host.endsWith('.' + d)) ||
    host.endsWith('.vercel.app')
  if (!ok) return fallback
  const proto = req.headers.get('x-forwarded-proto') === 'http' ? 'http' : 'https'
  return `${proto}://${rawHost}`
}
