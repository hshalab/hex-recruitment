import { NextRequest } from 'next/server'
import { handleAuthCallback } from '@/lib/authCallback'

// PKCE callback for employer Google OAuth.
// With flowType: 'pkce', Supabase redirects here with ?code= (not #access_token=).
// The server-side route handler exchanges the code for a session via
// createRouteHandlerClient — no CORS issues since it's server-to-server.
export async function GET(req: NextRequest) {
  return handleAuthCallback(req, 'employer')
}
