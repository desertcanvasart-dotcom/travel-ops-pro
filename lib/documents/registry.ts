// ============================================
// DOCUMENT TEMPLATE REGISTRY
// ============================================
// Every template this app can render, by slug. One operator's document pack is
// a set of entries here — adding a pack is adding files and listing them, never
// a schema change or a branch inside the renderer.
//
// Kept deliberately dumb: no conditionals on who the operator is. If a template
// only makes sense for one operator, that belongs in which templates an org has
// ENABLED, not in code that inspects the org and decides.

import type { DocumentTemplate } from './types'
import { atsOperationsSheet } from './templates/ats-operations-sheet'

const TEMPLATES: DocumentTemplate<any>[] = [atsOperationsSheet]

export function listTemplates(): Array<Pick<DocumentTemplate<unknown>, 'slug' | 'label' | 'description'>> {
  return TEMPLATES.map(({ slug, label, description }) => ({ slug, label, description }))
}

export function getTemplate(slug: string): DocumentTemplate<any> | null {
  return TEMPLATES.find(t => t.slug === slug) ?? null
}
