import type { SupabaseClient } from '@supabase/supabase-js'
import { laterContact } from './activity'

/**
 * Move the client's last contact to a logged communication, when it is later
 * than the one on file. Only a communication that happened counts (status
 * 'completed'): one still pending or scheduled is not a contact yet. Logging
 * a call never moved clients.last_contacted_at before, so the "Last contact"
 * on the client page stayed blank however much was logged.
 */
export async function touchLastContact(
  db: SupabaseClient,
  clientId: string,
  orgId: string,
  comm: { status?: string | null; communication_date?: string | null },
): Promise<void> {
  if (comm.status && comm.status !== 'completed') return
  if (!comm.communication_date) return
  const { data: client } = await db
    .from('clients').select('last_contacted_at').eq('id', clientId).eq('org_id', orgId).maybeSingle()
  const current = (client as { last_contacted_at?: string | null } | null)?.last_contacted_at
  const next = laterContact(current, comm.communication_date)
  if (next === current) return
  const { error } = await db
    .from('clients').update({ last_contacted_at: next }).eq('id', clientId).eq('org_id', orgId)
  // The communication is saved; only the convenience date failed.
  if (error) console.error('Could not update last_contacted_at:', error)
}
