// Browser side of deleting a client: what the three screens that can do it
// (the Clients list, the client page and /contacts) share.
import type { ClientAttachments } from './delete-guard'

export type DeleteOutcome =
  | { ok: true }
  // Refused because something is attached: the counts say what.
  | { ok: false; blocked: true; counts: ClientAttachments; message: string }
  | { ok: false; blocked: false; message: string }

export async function requestDeleteClient(id: string): Promise<DeleteOutcome> {
  const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => null)
  const message = body?.error || `HTTP ${res.status}`
  if (res.status === 409 && body?.counts) return { ok: false, blocked: true, counts: body.counts, message }
  return { ok: false, blocked: false, message }
}

/** The alternative offered when a client cannot be deleted. */
export async function requestMarkInactive(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/clients/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'inactive' }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => null)
  return { ok: false, message: body?.error || `HTTP ${res.status}` }
}

/** The non-zero counts as [kind, n] pairs, in display order. */
export function attachedKinds(counts: ClientAttachments): Array<[keyof ClientAttachments, number]> {
  return (['trips', 'bookings', 'invoices', 'payments', 'conversations', 'documents'] as const)
    .filter(k => counts[k] > 0)
    .map(k => [k, counts[k]])
}
