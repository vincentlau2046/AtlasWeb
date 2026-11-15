/**
 * Launch token → signed session cookie auth (S0 agreement §2 / dsh-decided
 * loopback trust fence, Atlas implementation).
 *
 * - launch token: single-use, redeem-exactly-once (in-memory registry);
 * - session cookie: HMAC-SHA256 signed, expiring; verification is
 *   constant-time over the signature comparison;
 * - fail-closed: any malformed/tampered/expired input → null/false.
 *
 * Zero external dependencies; zero side effects at import.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export interface LaunchAuthOptions {
  /** Host-side secret (>=32 bytes recommended). Never logged, never sent. */
  secret: string
  /** Session cookie TTL; default 12h. Non-positive → immediately expired. */
  sessionTtlMs?: number
}

export interface LaunchAuth {
  issueLaunchToken(): string
  /** Redeem a launch token exactly once → signed cookie, or null. */
  redeemLaunchToken(token: string): string | null
  verifySessionCookie(cookie: string | undefined): boolean
}

interface CookiePayload {
  exp: number
  nonce: string
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function encodePayload(payload: CookiePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function parseCookie(cookie: string): { payload: CookiePayload; sig: string } | null {
  const dot = cookie.lastIndexOf('.')
  if (dot <= 0 || dot === cookie.length - 1) return null
  try {
    const payload = JSON.parse(Buffer.from(cookie.slice(0, dot), 'base64url').toString('utf8')) as CookiePayload
    if (typeof payload.exp !== 'number' || typeof payload.nonce !== 'string') return null
    return { payload, sig: cookie.slice(dot + 1) }
  } catch {
    return null
  }
}

export function createLaunchAuth(options: LaunchAuthOptions): LaunchAuth {
  if (!options.secret || options.secret.length < 16) {
    throw new Error('secret must be at least 16 bytes')
  }
  const ttl = options.sessionTtlMs ?? 12 * 60 * 60 * 1000
  const unredeemed = new Set<string>()

  return {
    issueLaunchToken(): string {
      const token = randomBytes(32).toString('base64url')
      unredeemed.add(token)
      return token
    },
    redeemLaunchToken(token: string): string | null {
      if (!token || !unredeemed.delete(token)) return null // 单次兑换：删除即消费
      const payload: CookiePayload = { exp: Date.now() + ttl, nonce: randomBytes(16).toString('base64url') }
      const encoded = encodePayload(payload)
      return `${encoded}.${sign(options.secret, encoded)}`
    },
    verifySessionCookie(cookie: string | undefined): boolean {
      if (!cookie) return false
      const parsed = parseCookie(cookie)
      if (!parsed) return false
      const expected = sign(options.secret, cookie.slice(0, cookie.lastIndexOf('.')))
      if (!safeEqual(parsed.sig, expected)) return false
      return Date.now() < parsed.payload.exp
    },
  }
}
