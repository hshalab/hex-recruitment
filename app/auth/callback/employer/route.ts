import { NextRequest } from 'next/server'
import { handleAuthCallback } from '@/lib/authCallback'

// Google OAuth callback for employers — role is hard-coded to 'employer'.
// Supabase strips query params from redirectTo during OAuth, so we use
// a dedicated path instead of relying on ?role=employer.
export async function GET(req: NextRequest) {
  return handleAuthCallback(req, 'employer')
}
