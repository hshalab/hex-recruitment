import { NextRequest } from 'next/server'
import { handleAuthCallback } from '@/lib/authCallback'

// Email/password flow callback — reads role from ?role= query param.
export async function GET(req: NextRequest) {
  return handleAuthCallback(req)
}
