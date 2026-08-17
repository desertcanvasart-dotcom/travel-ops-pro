// Server-side helpers for department management. In lib because Next route
// modules may export only HTTP verbs.

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** A service type may belong to ONE active department — routing is a lookup,
 *  and two owners would make task assignment ambiguous. Returns a description
 *  of the conflicting claim, or null. */
export async function findServiceTypeConflict(
  serviceTypes: string[],
  excludeId: string | null
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('departments')
    .select('id, name, service_types')
    .eq('is_active', true)
  for (const dept of data ?? []) {
    if (excludeId && dept.id === excludeId) continue
    const owned = new Set((dept.service_types ?? []).map((s: string) => s.toLowerCase()))
    const clash = serviceTypes.find(s => owned.has(s.toLowerCase()))
    if (clash) return `${dept.name} (${clash})`
  }
  return null
}

export function sanitizeServiceTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((v): v is string => typeof v === 'string')
      .map(v => v.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''))
      .filter(Boolean)
  )].slice(0, 40)
}
