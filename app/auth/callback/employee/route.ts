import { NextRequest } from 'next/server'
import { handleAuthCallback } from '@/lib/authCallback'

// Google OAuth callback for candidates — role is hard-coded to 'employee'.
export async function GET(req: NextRequest) {
  return handleAuthCallback(req, 'employee')
}
