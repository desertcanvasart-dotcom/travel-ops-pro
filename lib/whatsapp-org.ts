// ============================================
// WhatsApp number ⇄ organization
// ============================================
// Each organization has its own sender number in the one Twilio account
// (organizations.whatsapp_number, migration 20261125). The number a customer
// writes TO is what says whose inbox the message belongs to, and the org's own
// number is the only one its replies may go out from — a reply from another
// org's number would land the customer's answer in that org's inbox.
//
// SINGLE-NUMBER DEPLOYMENTS: until any organization has a number set, the
// deployment runs as before — inbound goes to the default org
// (lib/auth/default-org.ts) and every org sends from the env sender
// (TWILIO_WHATSAPP_FROM / TWILIO_WHATSAPP_NUMBER). The moment one org has a
// number, that fallback stops for everyone: an org without a number cannot
// send, and a message to a number nobody owns is not filed anywhere. Guessing
// an owner there is exactly the cross-org leak this replaces.
//
// Lookups throw on a database error so the webhook can ask Twilio to retry
// and a send refuses, rather than either falling back to the shared number.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDefaultOrgId } from '@/lib/auth/default-org'
import { toWhatsAppE164 } from '@/lib/whatsapp-phone'

export const NO_WHATSAPP_SENDER =
  'This organization has no WhatsApp number set up. Add it in Settings → Company profile.'

/** Whether any organization has its own WhatsApp number (per-org mode). */
export async function anyOrgHasWhatsAppNumber(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .not('whatsapp_number', 'is', null)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/**
 * The organization whose number received an inbound message (Twilio's `To`,
 * "whatsapp:+81…" or "+81…"). null when numbers are configured and none is
 * this one: the caller must not file the message under any org.
 */
export async function orgForWhatsAppNumber(
  supabase: SupabaseClient,
  toNumber: unknown,
): Promise<string | null> {
  const number = toWhatsAppE164(toNumber)
  if (number) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('whatsapp_number', number)
      .maybeSingle()
    if (error) throw error
    if (data) return (data as { id: string }).id
  }
  if (await anyOrgHasWhatsAppNumber(supabase)) return null
  return getDefaultOrgId(supabase)
}

/**
 * Twilio `from` for an org's outbound messages ("whatsapp:+81…"), or null
 * when the org may not send — the caller refuses with NO_WHATSAPP_SENDER.
 */
export async function senderForOrg(
  supabase: SupabaseClient,
  orgId: string | null | undefined,
): Promise<string | null> {
  if (!orgId) return null
  const { data, error } = await supabase
    .from('organizations')
    .select('whatsapp_number')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw error
  const own = toWhatsAppE164((data as { whatsapp_number?: string | null } | null)?.whatsapp_number)
  if (own) return `whatsapp:${own}`
  if (await anyOrgHasWhatsAppNumber(supabase)) return null
  const env = toWhatsAppE164(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER)
  return env ? `whatsapp:${env}` : null
}

/**
 * Whether a team member is the org's own (team_members.org_id, migration
 * 20261203) — who may hold its conversations, tasks and trips. A member with
 * no login is the org that created them, like any other.
 */
export async function teamMemberInOrg(
  supabase: SupabaseClient,
  teamMemberId: string,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id')
    .eq('id', teamMemberId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

/**
 * What an inbound message changes on its existing conversation: a deleted
 * (hidden) or archived one comes back to the inbox; a blocked one stays
 * blocked; anything else is left alone (null — no write).
 */
export function whatsappRevival(
  conv: { is_hidden?: boolean | null; status?: string | null },
): { is_hidden?: false; hidden_at?: null; hidden_by?: null; status?: 'active' } | null {
  if (conv.status === 'blocked') return null
  const out: { is_hidden?: false; hidden_at?: null; hidden_by?: null; status?: 'active' } = {}
  if (conv.is_hidden) Object.assign(out, { is_hidden: false, hidden_at: null, hidden_by: null })
  if (conv.status === 'archived') out.status = 'active'
  return Object.keys(out).length ? out : null
}

/**
 * Open WhatsApp chats per team member — the figure the agent lists show.
 * Counted from the conversations themselves (active, not hidden, assigned to
 * them) rather than team_members.current_conversations: that counter was only
 * ever added to on a new chat, never taken from on a reassign, unassign,
 * archive or delete, so it drifted upward for good.
 */
export function openChatsByMember(
  rows: Array<{ assigned_team_member_id: string | null; status?: string | null; is_hidden?: boolean | null }>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.assigned_team_member_id) continue
    if ((r.status ?? 'active') !== 'active' || r.is_hidden) continue
    counts.set(r.assigned_team_member_id, (counts.get(r.assigned_team_member_id) ?? 0) + 1)
  }
  return counts
}

/**
 * Who a new chat goes to: the member longest without one, among those who can
 * actually work it — active, available, with a linked login (a member with no
 * login, a driver or guide say, would be handed chats nobody can see) and not
 * already at max_conversations open chats. null when nobody qualifies: the
 * chat stays unassigned for the team to claim.
 */
export function pickAutoAssignee(
  members: Array<{
    id: string
    user_id: string | null
    is_active?: boolean | null
    is_available?: boolean | null
    max_conversations?: number | null
    last_assigned_at?: string | null
    created_at?: string | null
  }>,
  openChats: Map<string, number>,
): string | null {
  const stamp = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0)
  const eligible = members.filter(m => {
    if (!m.user_id || m.is_active === false || m.is_available === false) return false
    const max = m.max_conversations
    return !(typeof max === 'number' && max > 0 && (openChats.get(m.id) ?? 0) >= max)
  })
  // Never-assigned first (0), then oldest assignment; ties by who joined first.
  eligible.sort((a, b) =>
    stamp(a.last_assigned_at) - stamp(b.last_assigned_at) || stamp(a.created_at) - stamp(b.created_at))
  return eligible[0]?.id ?? null
}

/**
 * The org member whose login has this email address, or null. Adding an agent
 * with a colleague's address links the agent to that login, so the chats
 * assigned to the agent are theirs ("Mine", claiming, the assignment
 * notification). Only this org's members are considered: another company's
 * login with the same address is never linked.
 */
export async function orgLoginForEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => any },
  orgId: string,
  email: string | null | undefined,
): Promise<string | null> {
  const wanted = (email ?? '').trim().toLowerCase()
  if (!wanted) return null
  const { data: members, error } = await db
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
  if (error) return null
  const ids = ((members ?? []) as { user_id: string | null }[])
    .map(m => m.user_id)
    .filter((id): id is string => !!id)
  if (ids.length === 0) return null
  const { data: profiles, error: profileError } = await db
    .from('user_profiles')
    .select('id, email')
    .in('id', ids)
  if (profileError) return null
  // Exactly one login: two members of the org sharing an address is
  // ambiguous, and guessing would hand one person's notifications to the other.
  const matches = ((profiles ?? []) as { id: string; email: string | null }[])
    .filter(p => (p.email ?? '').trim().toLowerCase() === wanted)
  return matches.length === 1 ? matches[0].id : null
}
