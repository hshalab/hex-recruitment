const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

// Clean up stale entries periodically to prevent memory leak
setInterval(() => {
  const now = Date.now()
  rateLimitMap.forEach((record, key) => {
    if (now > record.resetTime) rateLimitMap.delete(key)
  })
}, 60000)

/**
 * Simple in-memory rate limiter.
 * Returns true if the request is allowed, false if rate limited.
 */
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(key)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= maxRequests) return false
  record.count++
  return true
}
