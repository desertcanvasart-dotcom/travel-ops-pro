// ============================================
// A SERVICE PRICE THAT CHANGED AFTER ITS COMMISSION WAS MADE
// ============================================
// A commission stores its base (the supplier cost, or the profit) as it was on
// the day it was generated. Reprice the service afterwards and the commission
// kept the old base: the Commissions page and the P&L carried a figure the
// trip no longer supports, and generating again did nothing because the
// service was already marked 'generated'.
//
// planPriceChanges compares each linked commission with what the generator
// would make from the service today:
//
//   pending                   recalculated: base, cost, rate and amount follow
//                             the current price
//   paid / received           NEVER changed. Money moved on the old figure, so
//                             it is flagged "price changed since paid" and a
//                             person settles the difference
//   invoiced / disputed       not changed either (the figure is with the other
//                             party); flagged with its status
//   cancelled                 ignored
//
// A pending commission whose service can no longer give one (the price was
// removed, or the profit went to nothing) is flagged, not zeroed.
//
// "Changed" means the base, the cost, the rate or the amount differs from what
// the generator makes today, so a supplier's rate changed on its own (or a
// cost that moved with the client price) is caught too, not only a new base.
//
// Only commissions linked to their service (commissions.service_id) can be
// compared; a manual commission, or one generated before the link existed and
// not matched by migration 20261229, is left alone.

import {
  buildCommissions,
  type CommissionContext,
  type CommissionPair,
  type CommissionRow,
  type CommissionSourceService,
} from './commission-generation'

export interface ExistingLinkedCommission {
  id: string
  service_id: string | null
  supplier_id?: string | null
  commission_type?: string | null
  description?: string | null
  status?: string | null
  base_amount?: number | string | null
  cost_amount?: number | string | null
  commission_rate?: number | string | null
  commission_amount?: number | string | null
}

export interface CommissionRecalc {
  commission_id: string
  service_id: string
  service_name: string
  old_base: number
  new_base: number
  old_amount: number
  new_amount: number
  /** The service's current supplier cost and client price (what the new figures come from). */
  service_cost: number
  service_client_price: number
  /** The columns to write. */
  update: Pick<CommissionRow, 'base_amount' | 'cost_amount' | 'commission_rate' | 'commission_amount'>
}

export interface CommissionPriceFlag {
  commission_id: string
  service_id: string
  service_name: string
  status: string
  old_base: number
  /** null when the service can no longer produce this commission. */
  new_base: number | null
  /** The service's current supplier cost and client price. */
  service_cost: number
  service_client_price: number
  /** What the Commissions page shows beside it. */
  label: string
}

export interface PriceChangePlan {
  recalculated: CommissionRecalc[]
  flagged: CommissionPriceFlag[]
}

const FLAG_LABEL: Record<string, string> = {
  paid: 'price changed since paid',
  received: 'price changed since paid',
  invoiced: 'price changed since invoiced',
  disputed: 'price changed while disputed',
}

const cents = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function planPriceChanges(
  services: CommissionSourceService[],
  existing: ExistingLinkedCommission[],
  ctx: CommissionContext
): PriceChangePlan {
  const plan: PriceChangePlan = { recalculated: [], flagged: [] }
  if (existing.length === 0) return plan

  // What the generator makes today, with every service treated as not yet
  // generated: this is a comparison, not a generation.
  const { pairs } = buildCommissions(services.map(s => ({ ...s, commission_status: 'pending' })), ctx)
  const byService = new Map<string, CommissionPair[]>()
  for (const p of pairs) byService.set(p.serviceId, [...(byService.get(p.serviceId) ?? []), p])
  const serviceById = new Map(services.map(s => [s.id, { cost: cents(num(s.total_cost)), price: cents(num(s.client_price)) }]))
  const nameOf = new Map(services.map(s => [s.id, s.service_name || s.service_type || 'service']))
  const taken = new Set<CommissionPair>()

  for (const c of existing) {
    if (!c.service_id || c.status === 'cancelled') continue
    // The same commission of the same service: provider and seller differ by
    // supplier, so the supplier and direction pick it; the description breaks a tie.
    const candidates = (byService.get(c.service_id) ?? []).filter(p =>
      !taken.has(p) &&
      (p.commission.supplier_id ?? null) === (c.supplier_id ?? null) &&
      p.commission.commission_type === c.commission_type)
    const fresh = candidates.find(p => p.commission.description === c.description) ?? candidates[0]
    const oldBase = cents(num(c.base_amount))
    const serviceName = nameOf.get(c.service_id) ?? 'service'
    const now = serviceById.get(c.service_id) ?? { cost: 0, price: 0 }

    if (!fresh) {
      // The service no longer yields this commission. Only a pending one is
      // worth a flag: a settled one is history either way.
      if (c.status === 'pending' && nameOf.has(c.service_id)) {
        plan.flagged.push({
          commission_id: c.id, service_id: c.service_id, service_name: serviceName,
          status: 'pending', old_base: oldBase, new_base: null,
          service_cost: now.cost, service_client_price: now.price,
          label: 'service no longer gives this commission',
        })
      }
      continue
    }
    taken.add(fresh)

    const newBase = cents(fresh.commission.base_amount)
    // Anything the generator would write differently today. The base alone
    // missed a supplier's rate changing (same cost, new percentage); the cost
    // is compared too, since a payable row's base is the profit and a cost and
    // price moving together leave it where it was. A column the commission
    // never stored (null) is not a difference.
    const differs = (stored: unknown, fresh: number) => stored != null && stored !== '' && Math.abs(cents(num(stored)) - cents(fresh)) >= 0.005
    const changed =
      Math.abs(newBase - oldBase) >= 0.005 ||
      differs(c.commission_amount, fresh.commission.commission_amount) ||
      differs(c.commission_rate, fresh.commission.commission_rate) ||
      differs(c.cost_amount, fresh.commission.cost_amount)
    if (!changed) continue

    if (c.status === 'pending' || !c.status) {
      plan.recalculated.push({
        commission_id: c.id, service_id: c.service_id, service_name: serviceName,
        old_base: oldBase, new_base: newBase,
        service_cost: now.cost, service_client_price: now.price,
        old_amount: cents(num(c.commission_amount)), new_amount: fresh.commission.commission_amount,
        update: {
          base_amount: fresh.commission.base_amount,
          cost_amount: fresh.commission.cost_amount,
          commission_rate: fresh.commission.commission_rate,
          commission_amount: fresh.commission.commission_amount,
        },
      })
    } else {
      plan.flagged.push({
        commission_id: c.id, service_id: c.service_id, service_name: serviceName,
        status: c.status, old_base: oldBase, new_base: newBase,
        service_cost: now.cost, service_client_price: now.price,
        label: FLAG_LABEL[c.status] || `price changed since ${c.status}`,
      })
    }
  }
  return plan
}

/** One sentence for a result message, or '' when nothing changed. */
export function describePriceChanges(plan: PriceChangePlan, max = 4): string {
  const parts: string[] = []
  const r = plan.recalculated.length
  if (r > 0) parts.push(`Recalculated ${r} pending commission${r === 1 ? '' : 's'} after a price change.`)
  if (plan.flagged.length > 0) {
    const shown = plan.flagged.slice(0, max).map(f => `${f.service_name} (${f.label})`)
    const more = plan.flagged.length - shown.length
    parts.push(`Not changed: ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}.`)
  }
  return parts.join(' ')
}
