// ============================================
// An extra's programmes (extras_catalogue_programmes)
// ============================================
// Which programmes an extra is offered with, each with an optional price of
// its own. Written from the Extras page (the whole set, on save) and from a
// programme's own page (one link at a time). Every id is checked against the
// caller's company first: the routes run on the service role.

import { usableRate } from '@/lib/pricing/usable-rate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface ProgrammePick {
  template_id: string
  /** This programme's price; null/blank = the extra's own. */
  selling_price: number | null
}

/** The programme picks in a request body, or an error. Absent = undefined. */
export function parseProgrammePicks(raw: unknown): { picks?: ProgrammePick[]; error?: string } {
  if (raw === undefined) return {}
  if (!Array.isArray(raw)) return { error: 'programmes must be a list' }
  const picks: ProgrammePick[] = []
  const seen = new Set<string>()
  for (const p of raw) {
    const id = typeof p === 'string' ? p : (p as { template_id?: unknown })?.template_id
    if (typeof id !== 'string' || !id) return { error: 'Each programme needs a template_id' }
    if (seen.has(id)) continue
    seen.add(id)
    const rawPrice = typeof p === 'object' && p !== null ? (p as { selling_price?: unknown }).selling_price : null
    if (rawPrice !== null && rawPrice !== undefined && rawPrice !== '') {
      const n = Number(rawPrice)
      if (!Number.isFinite(n)) return { error: 'A programme price must be a number' }
      if (n < 0) return { error: 'A programme price cannot be negative' }
    }
    picks.push({ template_id: id, selling_price: usableRate(rawPrice) })
  }
  return { picks }
}

/** The ids among `ids` that are NOT this company's programmes. */
export async function foreignTemplates(db: Db, orgId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await db.from('tour_templates').select('id').eq('org_id', orgId).in('id', ids)
  if (error) throw error
  const own = new Set(((data ?? []) as { id: string }[]).map(r => r.id))
  return ids.filter(id => !own.has(id))
}

/** Make the extra's programmes exactly `picks` (delete the rest). */
export async function replaceProgrammeLinks(
  db: Db,
  orgId: string,
  extraId: string,
  picks: readonly ProgrammePick[]
): Promise<void> {
  const keep = picks.map(p => p.template_id)
  let del = db.from('extras_catalogue_programmes').delete().eq('org_id', orgId).eq('extra_id', extraId)
  if (keep.length) del = del.not('template_id', 'in', `(${keep.join(',')})`)
  const { error: delError } = await del
  if (delError) throw delError
  if (picks.length === 0) return
  const { error } = await db
    .from('extras_catalogue_programmes')
    .upsert(
      picks.map(p => ({ org_id: orgId, extra_id: extraId, template_id: p.template_id, selling_price: p.selling_price })),
      { onConflict: 'extra_id,template_id' }
    )
  if (error) throw error
}

export interface ProgrammeLinkView {
  id: string
  extra_id: string
  template_id: string
  template_name: string | null
  template_code: string | null
  selling_price: number | null
}

/** The links of these extras, with each programme's name and code. */
export async function linksForExtras(db: Db, orgId: string, extraIds: readonly string[]): Promise<ProgrammeLinkView[]> {
  if (extraIds.length === 0) return []
  const { data, error } = await db
    .from('extras_catalogue_programmes')
    .select('id, extra_id, template_id, selling_price')
    .eq('org_id', orgId)
    .in('extra_id', extraIds)
  // An unmigrated database has no table: no links.
  if (error) {
    console.warn('[extras] programme links:', error.message)
    return []
  }
  const links = (data ?? []) as Omit<ProgrammeLinkView, 'template_name' | 'template_code'>[]
  const templateIds = [...new Set(links.map(l => l.template_id))]
  const names = new Map<string, { template_name: string | null; template_code: string | null }>()
  if (templateIds.length) {
    const { data: tpl } = await db.from('tour_templates').select('id, template_name, template_code').eq('org_id', orgId).in('id', templateIds)
    for (const t of (tpl ?? []) as { id: string; template_name: string | null; template_code: string | null }[]) {
      names.set(t.id, { template_name: t.template_name, template_code: t.template_code })
    }
  }
  return links.map(l => ({ ...l, template_name: names.get(l.template_id)?.template_name ?? null, template_code: names.get(l.template_id)?.template_code ?? null }))
}
