// ============================================
// IN-MEMORY RATE LIMITER (fixed window)
// ============================================
// Caps how often one key (a user id) may hit an expensive endpoint. This guards
// the AI draft-generator against a runaway retry loop or an impatient operator
// spamming "generate" — an authenticated, trusted-user budget concern, not a
// data risk, so a simple per-process counter is proportionate.
//
// DELIBERATE LIMITS OF THIS APPROACH, stated so they are not a surprise:
//   * Per PROCESS. The count lives in this server's memory, so it resets on
//     deploy/restart and each replica counts independently. That is fine for
//     "stop a loop"; it is NOT a hard, abuse-proof cap. If that is ever needed,
//     move the counter to a table — the call sites do not change.
//
// Fixed-window (not sliding) for simplicity: N requests per window per key.

interface Bucket {
  count: number
  resetAt: number // epoch ms
}

const store = new Map<string, Bucket>()

// Opportunistic cleanup so the Map cannot grow without bound. Runs at most once
// per window when a request comes in, not on a timer (timers keep a process
// alive and are awkward in serverless).
let lastSweep = 0
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return
  lastSweep = now
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k)
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets — for a Retry-After header. */
  retryAfterSeconds: number
}

/**
 * Consume one unit for `key`. `limit` requests are allowed per `windowMs`.
 *
 * `now` is injectable for tests (production passes Date.now()). It is NOT read
 * from a module-level default, so the function stays pure per call.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  sweep(now, windowMs)

  const existing = store.get(key)
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
  }

  existing.count += 1
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
}

/** Test seam: clear all counters. */
export function resetRateLimiterForTests(): void {
  store.clear()
  lastSweep = 0
}
