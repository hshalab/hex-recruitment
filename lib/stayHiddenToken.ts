import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Tamper-proof "keep me hidden" tokens for the discoverability notice.
 *
 * Wire format:
 *   <userId>.<expiryUnix>.<base64urlHmac>
 *
 * The HMAC covers `<userId>.<expiryUnix>` with FOUNDING_APPROVAL_SECRET —
 * deliberately the same secret as lib/foundingApprovalToken.ts rather than a
 * new one to configure and forget. The payload shape differs (no action
 * segment, 3 parts not 4), so a token from one flow cannot verify in the
 * other.
 *
 * WHY A SIGNED LINK RATHER THAN "log in and flip the toggle": the people
 * receiving this are, by definition, the disengaged ones — they are hidden
 * because they never came back. If opting out costs a login and the default
 * costs nothing, the choice isn't real. One click, no password, and the
 * dashboard toggle is offered as well for anyone who'd rather do it there.
 *
 * The link is idempotent, not single-use: clicking twice leaves the first
 * answer in place, so a mail client that pre-fetches links can't undo
 * anything. The token outlives the window by a week so that a late click
 * still lands somewhere honest instead of a signature error.
 */

const TOKEN_TTL_DAYS = 21 // the 14-day window, plus a week of grace

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

export function generateStayHiddenToken(
  userId: string,
  expiryUnix: number = Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 86400,
): string {
  const payload = `${userId}.${expiryUnix}`
  return `${payload}.${sign(payload)}`
}

export function verifyStayHiddenToken(token: string): { userId: string; expiryUnix: number } | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expiryStr, providedSig] = parts
  const expiryUnix = Number(expiryStr)
  if (!Number.isFinite(expiryUnix)) return null
  if (Math.floor(Date.now() / 1000) > expiryUnix) return null

  const expectedSig = sign(`${userId}.${expiryUnix}`)
  // timingSafeEqual requires equal-length buffers, so guard length first
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  return { userId, expiryUnix }
}
