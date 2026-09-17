'use client'

// ============================================
// Send an email through the duplicate guard (client side)
// ============================================
// Every composer that calls /api/gmail/send goes through this, so each one
// behaves the same (lib/email/send-guard.ts has the rules):
//   - one requestKey per reply — the caller keeps it until the reply is sent,
//     so a double click or a retry is the same attempt, never a second email
//   - seenUpTo: when the newest message on screen was sent
//   - "already answered" / "same reply just sent" (409) asks the sender, and
//     "send anyway" resends with the same key and confirmDuplicate

export interface SendConflict {
  code: 'ALREADY_REPLIED' | 'SAME_REPLY' | 'IN_PROGRESS'
  repliedAt?: string
  repliedBy?: string | null
  sentAt?: string
  error?: string
}

export function newRequestKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function sendGuardedEmail(
  payload: Record<string, unknown>,
  opts: {
    requestKey: string
    seenUpTo?: string | null
    /** Ask the sender whether to send despite the conflict. */
    confirmConflict: (conflict: SendConflict) => Promise<boolean>
  },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string; cancelled?: boolean }> {
  const post = async (confirmDuplicate: boolean) => {
    const res = await fetch('/api/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        requestKey: opts.requestKey,
        ...(opts.seenUpTo !== undefined ? { seenUpTo: opts.seenUpTo } : {}),
        ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
      }),
    })
    const data = await res.json().catch(() => ({})) as Record<string, unknown>
    return { res, data }
  }

  let { res, data } = await post(false)
  if (res.status === 409 && (data.code === 'ALREADY_REPLIED' || data.code === 'SAME_REPLY')) {
    const go = await opts.confirmConflict(data as unknown as SendConflict)
    if (!go) return { ok: false, error: String(data.error ?? ''), cancelled: true }
    ;({ res, data } = await post(true))
  }
  if (!res.ok || data.error) return { ok: false, error: String(data.error ?? `Send failed (${res.status})`) }
  return { ok: true, data }
}
