// The four statuses a client can have: exactly what clients_status_check
// (migrations/20260829_baseline_schema.sql) lets the database store. The
// screens used to offer Active, Blacklisted and VIP as well, and picking one
// failed the save with a constraint error. VIP is clients.vip_status, a flag,
// not a status.
export const CLIENT_STATUSES = ['lead', 'prospect', 'customer', 'inactive'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export function isClientStatus(value: unknown): value is ClientStatus {
  return typeof value === 'string' && (CLIENT_STATUSES as readonly string[]).includes(value)
}

const BADGE: Record<ClientStatus, string> = {
  lead: 'bg-amber-100 text-amber-800',
  prospect: 'bg-blue-100 text-blue-800',
  customer: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
}

/** Badge colours for a status; anything unrecognised stays grey. */
export function clientStatusClass(status: string | null | undefined): string {
  return isClientStatus(status) ? BADGE[status] : 'bg-gray-100 text-gray-800'
}
