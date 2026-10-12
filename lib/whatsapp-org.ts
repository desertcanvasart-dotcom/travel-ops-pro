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
