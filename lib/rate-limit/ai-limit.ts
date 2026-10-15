// AI rate limit — one place, so the endpoints share a budget per user (a user
// hitting whatsapp + email drafts still counts against one pool). Parsing
// pasted text and uploaded files has a pool of its own (AUDIT M8, M9, M27):
// every call there is one or two paid model calls on input up to 50MB.

import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { rateLimit } from './memory-limiter'

const LIMIT = 20 // generations
const WINDOW_MS = 5 * 60 * 1000 // per 5 minutes, per user

export type AiRatePool = 'draft' | 'parse'

/**
 * Returns a 429 response if the signed-in user is over the AI generation limit,
 * or null to proceed. A missing session returns 401 (these are authed routes).
 */
export async function guardAiRate(pool: AiRatePool = 'draft'): Promise<NextResponse | null> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })
  }

  const r = rateLimit(`ai-${pool}:${userId}`, LIMIT, WINDOW_MS)
  if (!r.allowed) {
    return NextResponse.json(
      { success: false, error: `Too many AI ${pool === 'parse' ? 'parsing' : 'draft'} requests. Please wait a moment and try again.` },
      { status: 429, headers: { 'Retry-After': String(r.retryAfterSeconds) } }
    )
  }
  return null
}
