// ============================================
// Which Gmail mailbox a request works in
// ============================================
// A Gmail connection is stored per user (gmail_tokens.user_id), so the
// mailbox a staff member connected was invisible to everyone else: the owner
// saw "Connect Gmail" on Email Settings, an empty Email Inbox — and the main
// Settings page claimed "Connected" because it fell back to ANY token
// (operator, 2026-10-10). The company's connected mailbox is shared:
//
//   - your own connection, when it serves the organisation you are working in;
//   - else the organisation's mailbox — its longest-standing connection
//     (lib/email/org-gmail-sender, the one rule reading and sending share) —
//     for the roles that may use the inbox (the same roles middleware gives
//     /inbox).
//
// A connection serves ONE organisation (gmail_tokens.org_id, 20261204). A
// person in both companies whose own mailbox is connected to the other one
// works here in this company's mailbox, never their own.

import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError, type AuthenticatedGmail } from '@/lib/gmail'
import { getCurrentOrgId, getCurrentUserRole } from '@/lib/auth/current-org'
import { roleAllows } from '@/lib/auth/roles'
import { orgMailbox } from '@/lib/email/org-gmail-sender'

/** Who may work in the organisation's shared mailbox: the /inbox roles. */
export const SHARED_MAILBOX_ROLES = ['admin', 'manager', 'agent']

export interface MailboxChoice {
  /** The user whose stored Gmail connection is used. */
  mailboxUserId: string
  /** True when it is a colleague's connection — the organisation's mailbox. */
  shared: boolean
  /** The mailbox address. */
  email: string
  /** The organisation the mailbox serves (the active workspace). */
  orgId: string
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** The mailbox this (session) user works in, or null when there is none. */
export async function resolveMailbox(userId: string): Promise<MailboxChoice | null> {
  // The organisation and the role come from the session. Outside a signed-in
  // request (a scheduled job) there is no workspace, so no mailbox: the jobs
  // use the connection they sync (lib/email/sync-mailbox).
  let orgId: string | null = null
  let shareAllowed = false
  try {
    orgId = await getCurrentOrgId()
    shareAllowed = roleAllows(await getCurrentUserRole(), SHARED_MAILBOX_ROLES)
  } catch {
    return null
  }
  if (!orgId) return null

  const box = await orgMailbox(admin(), orgId, userId, { ownOnly: !shareAllowed })
  return box ? { mailboxUserId: box.user_id, shared: box.shared, email: box.email, orgId } : null
}

/** An authenticated Gmail client on the mailbox this user works in. */
export async function getMailboxGmail(userId: string): Promise<AuthenticatedGmail & MailboxChoice> {
  const choice = await resolveMailbox(userId)
  if (!choice) throw new GmailAuthError('Gmail not connected. Please connect your Gmail account first.')
  const auth = await getAuthenticatedGmail(choice.mailboxUserId)
  // Moved to another company between the two reads (reconnected there).
  if (auth.orgId && auth.orgId !== choice.orgId) throw new GmailAuthError('Gmail not connected. Please connect your Gmail account first.')
  return { ...auth, ...choice, email: auth.emailAddress || choice.email }
}
