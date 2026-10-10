// ============================================
// Which Gmail mailbox a request works in
// ============================================
// A Gmail connection is stored per user (gmail_tokens.user_id), so the
// mailbox a staff member connected was invisible to everyone else: the owner
// saw "Connect Gmail" on Email Settings, an empty Email Inbox — and the main
// Settings page claimed "Connected" because it fell back to ANY token
// (operator, 2026-10-10). The company's connected mailbox is shared:
//
//   - your own connection, when you have one;
//   - else the organisation's shared mailbox — the most recently refreshed
//     connection of a member of your organisation — for the roles that may
//     use the inbox (the same roles middleware gives /inbox).
//
// Replying from the unified inbox already worked this way (gmail/send picks
// the conversation owner's mailbox); this makes it the one rule.

import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError, type AuthenticatedGmail } from '@/lib/gmail'
import { getCurrentOrgId, getCurrentUserRole } from '@/lib/auth/current-org'
import { roleAllows } from '@/lib/auth/roles'

/** Who may work in the organisation's shared mailbox: the /inbox roles. */
export const SHARED_MAILBOX_ROLES = ['admin', 'manager', 'agent']

export interface MailboxChoice {
  /** The user whose stored Gmail connection is used. */
  mailboxUserId: string
  /** True when it is a colleague's connection — the organisation's mailbox. */
  shared: boolean
  /** The mailbox address. */
  email: string
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** The mailbox this (session) user works in, or null when there is none. */
export async function resolveMailbox(userId: string): Promise<MailboxChoice | null> {
  const supabase = admin()

  const { data: own } = await supabase
    .from('gmail_tokens')
    .select('user_id, email')
    .eq('user_id', userId)
    .maybeSingle()
  if (own) return { mailboxUserId: userId, shared: false, email: own.email || '' }

  // The shared mailbox is for a signed-in request: the role and the
  // organisation come from the session. Outside one (a scheduled job) there
  // is none, and only the user's own connection counts — as before.
  let orgId: string | null = null
  try {
    if (!roleAllows(await getCurrentUserRole(), SHARED_MAILBOX_ROLES)) return null
    orgId = await getCurrentOrgId()
  } catch {
    return null
  }
  if (!orgId) return null

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
  const memberIds = (members ?? []).map(m => m.user_id).filter((id): id is string => !!id && id !== userId)
  if (memberIds.length === 0) return null

  const { data: shared } = await supabase
    .from('gmail_tokens')
    .select('user_id, email')
    .in('user_id', memberIds)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return shared ? { mailboxUserId: shared.user_id, shared: true, email: shared.email || '' } : null
}

/** An authenticated Gmail client on the mailbox this user works in. */
export async function getMailboxGmail(userId: string): Promise<AuthenticatedGmail & MailboxChoice> {
  const choice = await resolveMailbox(userId)
  if (!choice) throw new GmailAuthError('Gmail not connected. Please connect your Gmail account first.')
  const auth = await getAuthenticatedGmail(choice.mailboxUserId)
  return { ...auth, ...choice, email: auth.emailAddress || choice.email }
}
