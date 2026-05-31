import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Tamper-proof approve/reject tokens for the founding-signup manual
 * review flow. The token is the only proof of intent we accept on the
 * approval endpoint — IDs alone are guessable so we sign them.
 *
 * Wire format:
 *   <userId>.<action>.<expiryUnix>.<base64urlHmac>
 *
 * The HMAC covers `<userId>.<action>.<expiryUnix>` with FOUNDING_APPROVAL_SECRET.
 *
 * Single-use is enforced by approval_status: once the row flips to
 * approved/rejected/waitlisted, replaying the token is harmless because
 * the endpoint refuses to re-act on non-pending rows.
 */

export type ApprovalAction = 'approve' | 'reject'

const TOKEN_TTL_HOURS = 7 * 24 // 7 days

function getSecret(): string {
  const s = process.env.FOUNDING_APPROVAL_SECRET
  if (!s || s.length < 32) {
    throw new Error('FOUNDING_APPROVAL_SECRET must be set and >=32 chars')
  }
  return s
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', getSecret()).update(payload).digest())
}

export function generateApprovalToken(
  userId: string,
  action: ApprovalAction,
  expiryUnix: number = Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 3600,
): string {
  const payload = `${userId}.${action}.${expiryUnix}`
  return `${payload}.${sign(payload)}`
}

export type VerifiedToken = {
  userId: string
  action: ApprovalAction
  expiryUnix: number
}

export function verifyApprovalToken(token: string): VerifiedToken | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [userId, action, expiryStr, providedSig] = parts
  if (action !== 'approve' && action !== 'reject') return null
  const expiryUnix = Number(expiryStr)
  if (!Number.isFinite(expiryUnix)) return null
  if (Math.floor(Date.now() / 1000) > expiryUnix) return null

  const expectedSig = sign(`${userId}.${action}.${expiryUnix}`)
  // timingSafeEqual requires equal-length buffers, so guard length first
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  return { userId, action, expiryUnix }
}
