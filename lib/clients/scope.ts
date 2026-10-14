// Helpers shared by the /api/clients routes, which run on the service role.
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/** True when the client exists in this company. Anything else is a plain 404:
 *  a 403 would confirm that the id exists elsewhere. */
export async function clientInOrg(db: SupabaseClient, id: string, orgId: string): Promise<boolean> {
  const { data } = await db.from('clients').select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
  return !!data
}

export const clientNotFound = () => NextResponse.json({ error: 'Client not found' }, { status: 404 })

/**
 * Who is acting, as the text stored beside a note or a logged communication
 * (client_notes.created_by, communication_history.handled_by — both
 * varchar(100)). The person's name, else their email, else null.
 */
export async function actorLabel(db: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null
  const { data } = await db.from('user_profiles').select('full_name, email').eq('id', userId).maybeSingle()
  const row = data as { full_name?: string | null; email?: string | null } | null
  const label = row?.full_name?.trim() || row?.email?.trim() || null
  return label ? label.slice(0, 100) : null
}
