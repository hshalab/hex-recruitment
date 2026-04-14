import { NextRequest } from 'next/server'
import { handleAuthCallback } from '@/lib/authCallback'

// PKCE callback for candidate Google OAuth.
export async function GET(req: NextRequest) {
  return handleAuthCallback(req, 'employee')
}
