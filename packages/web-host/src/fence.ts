/**
 * Loopback Host/Origin fence (S0 agreement §2 / 格 H).
 *
 * Only loopback Host values are ever allowed; a present Origin must match
 * the loopback request Host exactly (cross-origin browsers are rejected).
 * Absent Origin is permitted for same-host non-browser clients on loopback.
 * Fail-closed: missing Host, non-loopback Host, or any mismatch → false.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function isLoopbackHost(host: string): boolean {
  // 去端口：IPv6 [::1]:port / 127.0.0.1:port / localhost:port
  const bare = host.startsWith('[') ? (host.match(/^\[[^\]]+\]/)?.[0] ?? '') : host.split(':')[0] ?? ''
  if (!bare) return false
  return LOOPBACK_HOSTS.has(bare.toLowerCase()) || LOOPBACK_HOSTS.has(bare.toLowerCase().replace(/^\[|\]$/g, '') && `[${bare.toLowerCase().replace(/^\[|\]$/g, '')}]`) || bare.toLowerCase() === 'localhost' || bare.toLowerCase() === '127.0.0.1'
}

export interface FenceRequestHead {
  host: string | undefined
  origin: string | undefined
}

export function isLoopbackRequest(head: FenceRequestHead): boolean {
  if (!head.host || !isLoopbackHost(head.host)) return false
  if (head.origin === undefined) return true
  // Origin 形如 scheme://authority；必须与 loopback Host 精确一致
  let originAuthority: string
  try {
    originAuthority = new URL(head.origin).host
  } catch {
    return false
  }
  return originAuthority === head.host && isLoopbackHost(originAuthority)
}
