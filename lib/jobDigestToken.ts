import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * One-click "stop sending me the job digest" tokens.
 *
 * Wire format:
 *   digest.<userId>.<expiryUnix>.<base64urlHmac>
 *
 * Signed with FOUNDING_APPROVAL_SECRET, the same secret the founding-approval
 * and stay-hidden links use — one secret to rotate, not three. The literal
 * 'digest' prefix is inside the signed payload and the part count is 4, so a
 * token minted here cannot verify as a stay-hidden token (3 parts) and vice
 * versa: unsubscribing from email can never accidentally hide a profile.
 *
 * WHY NO LOGIN: this is an unsubscribe link on a marketing-adjacent email. If
 * stopping it costs a password while receiving it costs nothing, it isn't a
 * real choice — and it's the fastest route to a spam complaint. Same reasoning
 * as lib/stayHiddenToken.ts.
 *
 * Idempotent, not single-use: a second click leaves the first answer in place,
 * so a prefetching mail client can't toggle anything back on. The TTL is long
 * because an unsubscribe link that has expired is worse than useless — someone
 * who wants out must always have a way out.
 */

const TOKEN_TTL_DAYS = 365

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

export function generateDigestUnsubscribeToken(
  userId: string,
  expiryUnix: number = Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 86400,
): string {
  const payload = `digest.${userId}.${expiryUnix}`
  return `${payload}.${sign(payload)}`
}

export function verifyDigestUnsubscribeToken(token: string): { userId: string; expiryUnix: number } | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [prefix, userId, expiryStr, providedSig] = parts
  if (prefix !== 'digest') return null
  const expiryUnix = Number(expiryStr)
  if (!Number.isFinite(expiryUnix)) return null
  if (Math.floor(Date.now() / 1000) > expiryUnix) return null

  const expectedSig = sign(`digest.${userId}.${expiryUnix}`)
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  return { userId, expiryUnix }
}
