// ============================================
// ACTIVITY LOG — the audit trail's write path
// ============================================
// Called from middleware for every authenticated mutating API request.
// Fire-and-forget: an audit insert must never slow or fail a real request,
// so callers wrap it in event.waitUntil and errors are swallowed after a
// console.error (losing one log line beats failing the user's action).

import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "/api/rates/attractions/123" → { entity_type: 'rates/attractions', entity_id: '123' } */
export function parsePath(path: string): { entity_type: string | null; entity_id: string | null } {
  const parts = path.split('?')[0].split('/').filter(Boolean)
  if (parts[0] !== 'api') return { entity_type: null, entity_id: null }
  const rest = parts.slice(1)
  const idIdx = rest.findIndex(p => UUID_RE.test(p) || /^\d+$/.test(p))
  if (idIdx === -1) return { entity_type: rest.join('/') || null, entity_id: null }
  return { entity_type: rest.slice(0, idIdx).join('/') || null, entity_id: rest[idIdx] }
}

export function actionFor(method: string): string {
  if (method === 'POST') return 'create'
  if (method === 'PUT' || method === 'PATCH') return 'update'
  if (method === 'DELETE') return 'delete'
  return 'action'
}

export async function recordActivity(input: {
  user_id: string
  user_email: string | null
  method: string
  path: string
  ip: string | null
  user_agent: string | null
}): Promise<void> {
  try {
    const { entity_type, entity_id } = parsePath(input.path)
    // The org is looked up here, inside the deferred promise, so the request
    // itself never waits on it.
    const { data: membership } = await admin
      .from('organization_members')
      .select('org_id')
      .eq('user_id', input.user_id)
      .limit(1)
      .maybeSingle()

    await admin.from('activity_log').insert({
      org_id: membership?.org_id ?? null,
      user_id: input.user_id,
      user_email: input.user_email,
      method: input.method,
      path: input.path.slice(0, 500),
      action: actionFor(input.method),
      entity_type,
      entity_id,
      ip: input.ip,
      user_agent: input.user_agent?.slice(0, 300) ?? null,
    })
  } catch (err) {
    console.error('activity log write failed:', err)
  }
}
