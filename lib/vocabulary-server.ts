// ============================================
// Org vocabulary, read on the server
// ============================================
// Routes/engine code that need the agency's lists — to validate a stored key,
// widen a "type=hotel" filter to every supplier type that BEHAVES as a hotel,
// or resolve a custom tier onto the preset ladder. Ported from the sibling
// SaaS (lib/vocabulary-server.ts); org-explicit because this app's server
// client is service-role (not RLS-scoped), so every read filters by org_id.

import type { SupabaseClient } from '@supabase/supabase-js'
import { activeInOrder, PRESET_TIERS, type VehicleBand, type VocabularyItem, type VocabularyKind } from '@/lib/vocabulary'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>

const COLS = 'id, org_id, kind, key, label, label_ja, description, behavior, rank, meta, is_active, created_at, updated_at'

/** Every entry of one kind for an org (hidden included). Empty when the
 *  migration is not applied — callers keep their built-in behaviour. */
export async function loadVocabularyForOrg(supabase: Client, orgId: string, kind: VocabularyKind): Promise<VocabularyItem[]> {
  const { data, error } = await supabase
    .from('org_vocabularies')
    .select(COLS)
    .eq('org_id', orgId)
    .eq('kind', kind)
    .order('rank')
  if (error || !data) return []
  return data as unknown as VocabularyItem[]
}

/** Active keys of one kind, in order. */
export async function activeKeysForOrg(supabase: Client, orgId: string, kind: VocabularyKind): Promise<string[]> {
  return activeInOrder(await loadVocabularyForOrg(supabase, orgId, kind)).map(i => i.key)
}

/**
 * The supplier-type KEYS a "type=hotel" filter should match: every entry whose
 * behaviour is one of `behaviors`, plus the behaviour names themselves (rows
 * written before the vocabulary existed store the behaviour as the type).
 */
export async function supplierTypeKeysForBehaviors(supabase: Client, orgId: string, behaviors: string[]): Promise<string[]> {
  const wanted = new Set(behaviors.map(b => b.trim()).filter(Boolean))
  const out = new Set<string>(wanted)
  for (const item of await loadVocabularyForOrg(supabase, orgId, 'supplier_type')) {
    if (item.behavior && wanted.has(item.behavior)) out.add(item.key)
    if (wanted.has(item.key)) out.add(item.key)
  }
  return [...out]
}

/** The org's word for each stored key of one kind — hidden entries included,
 *  so a rate filed under a class since retired still reads as a word. */
export async function vocabularyLabelsForOrg(supabase: Client, orgId: string, kind: VocabularyKind): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const item of await loadVocabularyForOrg(supabase, orgId, kind)) out.set(item.key, item.label)
  return out
}

/** The org's tiers, lowest to highest — the preset when none exist. */
export async function tierLadderForOrg(supabase: Client, orgId: string): Promise<string[]> {
  const keys = activeInOrder(await loadVocabularyForOrg(supabase, orgId, 'tier')).map(i => i.key)
  return keys.length ? keys : [...PRESET_TIERS]
}

/** The org's vehicles with their passenger bands, smallest first. Empty when
 *  none exist (callers keep their built-in bands). */
export async function vehicleBandsForOrg(supabase: Client, orgId: string): Promise<VehicleBand[]> {
  return activeInOrder(await loadVocabularyForOrg(supabase, orgId, 'vehicle_type'))
    .map(i => ({ key: i.key, min_pax: Number(i.meta?.min_pax ?? 0), max_pax: Number(i.meta?.max_pax ?? 0) }))
    .filter(v => v.max_pax > 0)
}
