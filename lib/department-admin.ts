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

// Minimal slice of the supabase-js client the delete needs — typed loosely so
// a test can hand in an in-memory fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export type DeleteDepartmentResult =
  | {
      ok: true
      moved: { members: number; tasks: number }
      /** Service types the deleted department owned that now route nowhere
       *  (deleted without a target). Reported, never silent — see lib/departments.ts. */
      unrouted: string[]
    }
  | { ok: false; status: 400 | 404; error: string }

/**
 * Delete a department, first moving everything that points at it.
 *
 * A department with members or task history used to be undeletable — only
 * deactivatable — so every department that had ever been used stayed on the
 * screen forever. Now its members and tasks move to `reassignTo` (or to no
 * department, when null), and if it was active its service types move with
 * them, so the work it routed keeps reaching a team.
 *
 * No transaction (supabase-js has none), so the steps are ordered to be safe
 * to retry: every step before the final delete is idempotent, and the target
 * claims the service types BEFORE the source disappears — a failure midway
 * leaves work routed twice (harmless) rather than nowhere.
 */
export async function deleteDepartment(
  db: Db,
  id: string,
  reassignTo: string | null
): Promise<DeleteDepartmentResult> {
  const { data: source, error: sourceError } = await db
    .from('departments')
    .select('id, name, service_types, is_active')
    .eq('id', id)
    .maybeSingle()
  if (sourceError) throw sourceError
  if (!source) return { ok: false, status: 404, error: 'Department not found' }

  let target: { id: string; service_types: string[] | null } | null = null
  if (reassignTo) {
    if (reassignTo === id) {
      return { ok: false, status: 400, error: 'Cannot move members and tasks to the department being deleted' }
    }
    const { data, error } = await db
      .from('departments')
      .select('id, service_types, is_active')
      .eq('id', reassignTo)
      .maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, status: 404, error: 'Target department not found' }
    if (!data.is_active) {
      return { ok: false, status: 400, error: 'Members and tasks can only be moved to an active department' }
    }
    target = data
  }

  const moveTo = { department_id: target?.id ?? null }
  const [membersRes, tasksRes] = await Promise.all([
    db.from('team_members').update(moveTo).eq('department_id', id).select('id'),
    db.from('tasks').update(moveTo).eq('department_id', id).select('id'),
  ])
  if (membersRes.error) throw membersRes.error
  if (tasksRes.error) throw tasksRes.error

  // An inactive department routes nothing, so its types have nowhere to go —
  // and handing them over could collide with another active owner.
  const ownedTypes: string[] = source.is_active ? source.service_types ?? [] : []
  let unrouted: string[] = []
  if (ownedTypes.length > 0) {
    if (target) {
      const merged = sanitizeServiceTypes([...(target.service_types ?? []), ...ownedTypes])
      const { error } = await db
        .from('departments')
        .update({ service_types: merged, updated_at: new Date().toISOString() })
        .eq('id', target.id)
      if (error) throw error
    } else {
      unrouted = [...ownedTypes]
    }
  }

  const { error: deleteError } = await db.from('departments').delete().eq('id', id)
  if (deleteError) throw deleteError

  return {
    ok: true,
    moved: { members: membersRes.data?.length ?? 0, tasks: tasksRes.data?.length ?? 0 },
    unrouted,
  }
}
