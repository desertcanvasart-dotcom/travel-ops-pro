// The rate limiter keyed on the LEFTMOST X-Forwarded-For — a value a client
// can simply make up — so public limits were bypassable by rotating a header.
import { describe, it, expect, afterEach } from 'vitest'
import { clientIp } from '@/lib/client-ip'

const h = (o: Record<string, string>) => new Headers(o)
afterEach(() => { delete process.env.CLIENT_IP_HEADER })

describe('clientIp', () => {
  it('prefers X-Real-IP (overwritten by the Railway edge) over a forged X-Forwarded-For', () => {
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4', 'x-real-ip': '1.2.3.4' }))).toBe('1.2.3.4')
  })
  it('an operator-named header wins (self-hosted behind their own proxy)', () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
    expect(clientIp(h({ 'cf-connecting-ip': '9.9.9.9', 'x-real-ip': '10.0.0.1' }))).toBe('9.9.9.9')
  })
  it('falls back to the first X-Forwarded-For entry, then null', () => {
    expect(clientIp(h({ 'x-forwarded-for': '5.5.5.5, 10.0.0.1' }))).toBe('5.5.5.5')
    expect(clientIp(h({}))).toBeNull()
  })
})
