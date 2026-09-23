// ============================================
// The client's IP address, as the proxy in front of us reports it
// ============================================
// Rate limits (portal surname check, order form, public endpoints) and the
// audit trail key on this. It used to be the LEFTMOST X-Forwarded-For entry
// first — the one value a client can simply make up on any proxy that appends
// rather than rewrites, which made every public limit bypassable by rotating a
// header.
//
// Order of trust:
//   1. CLIENT_IP_HEADER, when the operator names the header their own proxy
//      sets (a self-hosted install behind nginx/Caddy/Cloudflare, say);
//   2. X-Real-IP — on Railway the edge OVERWRITES it with the connecting IP
//      (or Cf-Connecting-IP for traffic arriving through Cloudflare), so a
//      client cannot choose it;
//   3. the leftmost X-Forwarded-For, the last resort it always was.
type HeaderSource = { get(name: string): string | null }

export function clientIp(headers: HeaderSource): string | null {
  const configured = process.env.CLIENT_IP_HEADER?.trim()
  if (configured) {
    const v = headers.get(configured)?.split(',')[0]?.trim()
    if (v) return v
  }
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
}
