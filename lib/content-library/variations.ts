// ============================================
// Which tier variations a content save writes
// ============================================
// The editor keeps a slot for every tier on the company's ladder and sends
// them all, written or not. The routes used to store every slot — a blank
// description included — so each item "had" every tier and the list said
// "All Tiers" for content written for one. A tier with no description is not
// a variation: it is not stored, and clearing a saved one removes it.

export interface VariationInput {
  tier: string
  title?: string | null
  description?: string | null
  highlights?: string[] | null
  inclusions?: string[] | null
  internal_notes?: string | null
  is_active?: boolean | null
}

export const isWrittenVariation = (v: VariationInput): boolean =>
  typeof v.description === 'string' && v.description.trim() !== ''

export interface VariationPlan {
  update: { id: string; variation: VariationInput }[]
  insert: VariationInput[]
  /** Saved rows whose tier the save cleared. */
  remove: string[]
}

/** What a save does to an item's saved variations (existing: its rows). */
export function planVariationWrites(existing: { id: string; tier: string }[], sent: VariationInput[]): VariationPlan {
  const byTier = new Map(existing.map(v => [v.tier, v.id]))
  const plan: VariationPlan = { update: [], insert: [], remove: [] }
  for (const v of sent) {
    const id = byTier.get(v.tier)
    if (isWrittenVariation(v)) {
      if (id) plan.update.push({ id, variation: v })
      else plan.insert.push(v)
    } else if (id) {
      plan.remove.push(id)
    }
  }
  return plan
}
