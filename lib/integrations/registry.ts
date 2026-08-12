// ============================================
// ADAPTER REGISTRY
// ============================================
// The one place that knows which partner platforms exist. Onboarding a new one
// is: write an adapter, add it here, insert a row in `integrations`. No
// migration, no change to any route.

import type { IntegrationAdapter } from './types'
import { genericAdapter } from './adapters/generic'
import { sawaAdapter } from './adapters/sawa'

const ADAPTERS: IntegrationAdapter[] = [genericAdapter, sawaAdapter]

const BY_SLUG = new Map(ADAPTERS.map(a => [a.slug, a]))

export function getAdapter(slug: string | null | undefined): IntegrationAdapter | null {
  if (!slug) return null
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null
}

/**
 * Resolve an adapter, falling back to the canonical one.
 *
 * A connection whose provider slug no longer has an adapter (renamed, removed)
 * must not start rejecting a partner's live traffic — the generic adapter
 * accepts our documented shape, which is the most useful thing to try. The
 * caller records which adapter actually ran, so a silent fallback is visible in
 * the event log rather than inferred.
 */
export function resolveAdapter(slug: string | null | undefined): {
  adapter: IntegrationAdapter
  fellBack: boolean
} {
  const found = getAdapter(slug)
  if (found) return { adapter: found, fellBack: false }
  return { adapter: genericAdapter, fellBack: true }
}

/** For the connection UI's provider picker. */
export function listAdapters(): Array<{ slug: string; label: string; description: string }> {
  return ADAPTERS.map(a => ({ slug: a.slug, label: a.label, description: a.description }))
}
