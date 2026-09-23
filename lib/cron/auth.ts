// ============================================
// Who may run a cron route
// ============================================
// Every route under app/api/cron checked `if (CRON_SECRET && header !== ...)`:
// with CRON_SECRET unset — a fresh or self-hosted install — the check was
// skipped and anyone on the internet could trigger the jobs (send every
// reminder email, re-sync mail, purge documents). It now FAILS CLOSED.
//
// Two ways in:
//   1. the in-process scheduler (lib/cron/scheduler.ts), which presents a
//      token minted in THIS process at startup — so the app's own jobs keep
//      running whether or not CRON_SECRET is configured;
//   2. an external caller presenting CRON_SECRET (constant-time compare).
import { randomBytes, timingSafeEqual } from 'node:crypto'

const g = globalThis as { __cronInternalToken?: string }

/** The per-process token the in-process scheduler presents. Never leaves the
 *  process: it is not logged, stored or sent anywhere. */
export function internalCronToken(): string {
  if (!g.__cronInternalToken) g.__cronInternalToken = randomBytes(32).toString('hex')
  return g.__cronInternalToken
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function cronAuthorized(request: { headers: { get(name: string): string | null } }): boolean {
  const presented = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!presented) return false
  if (g.__cronInternalToken && same(presented, g.__cronInternalToken)) return true
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && same(presented, secret!)
}
