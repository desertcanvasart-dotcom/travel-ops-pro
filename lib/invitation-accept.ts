// ============================================
// INVITATION ACCEPTANCE — deciding what to do with the email
// ============================================
// An invited person clicked a link containing an unguessable token that was
// emailed to THEIR address. That is already proof they control the mailbox,
// so asking them to confirm a SECOND email (Supabase's own signup
// confirmation) adds no security and one more way to fail — which is exactly
// how egypt@ats-hj.com ended up with an account that existed but could never
// sign in: `supabase.auth.signUp()` left email_confirmed_at NULL, the
// confirmation mail was never actioned, and every retry answered "User
// already registered".
//
// So acceptance creates the account server-side, already confirmed. This
// module is the pure decision: given the invitation and whatever auth account
// already exists for that address, what should happen?

export type AcceptAction =
  /** No account yet — create it, pre-confirmed, with the chosen password. */
  | { action: 'create' }
  /** An account exists but was never confirmed (the stranded case): confirm
   *  it and set the password the invitee just chose. The invitation token is
   *  the authority for doing so. */
  | { action: 'repair'; userId: string }
  /** A confirmed account already exists. Do NOT touch its password — an
   *  invitation must never become a password-reset oracle for a live
   *  account. Bind the membership and tell them to sign in as themselves. */
  | { action: 'link'; userId: string }

export interface ExistingAuthUser {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
  confirmed_at?: string | null
}

export function decideAcceptAction(existing: ExistingAuthUser | null | undefined): AcceptAction {
  if (!existing) return { action: 'create' }
  const confirmed = Boolean(existing.email_confirmed_at || existing.confirmed_at)
  return confirmed ? { action: 'link', userId: existing.id } : { action: 'repair', userId: existing.id }
}

export type InvitationState =
  | { usable: true }
  | { usable: false; status: number; error: string }

/** Token validity, independent of any auth state. */
export function checkInvitationState(
  invitation: { accepted_at?: string | null; expires_at?: string | null } | null | undefined,
  now: Date = new Date()
): InvitationState {
  if (!invitation) return { usable: false, status: 404, error: 'Invalid invitation token' }
  if (invitation.accepted_at) {
    return { usable: false, status: 400, error: 'This invitation has already been used' }
  }
  if (invitation.expires_at && new Date(invitation.expires_at) < now) {
    return { usable: false, status: 400, error: 'This invitation has expired' }
  }
  return { usable: true }
}

/** Supabase's own minimum. Checked server-side too: the client form is not a
 *  security boundary. */
export const MIN_PASSWORD_LENGTH = 6

export function checkPassword(password: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }
  }
  return { ok: true }
}

/** Case/whitespace-insensitive match, so an invitation addressed to
 *  "Egypt@ATS-HJ.com" still finds the account stored as lowercase. */
export function emailsMatch(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Invitation DELIVERY — the outcome, never swallowed
// ---------------------------------------------------------------------------
// The creation route used to catch a failed send, log it, and answer
// { success: true }. So when this app's Gmail connection lapsed, every
// invitation reported as sent and none arrived: the operator re-invited the
// same person repeatedly, deleted accounts, and had no way to see that the
// mail had never left. Creating the invitation IS still a success — the link
// works — but the caller has to be told the email did not go, and be handed
// the link to pass on by hand.

export type InviteDelivery =
  | { sent: true }
  | { sent: false; reason: 'not_connected' | 'failed'; detail: string }

export function inviteDelivery(
  result: { success?: boolean; noAccount?: boolean; error?: string } | null | undefined,
  thrown?: unknown
): InviteDelivery {
  if (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    return {
      sent: false,
      reason: /not connected|no account/i.test(message) ? 'not_connected' : 'failed',
      detail: message,
    }
  }
  if (result?.success) return { sent: true }
  if (result?.noAccount) {
    return {
      sent: false,
      reason: 'not_connected',
      detail: result.error || 'No email account is connected, so nothing was sent.',
    }
  }
  return { sent: false, reason: 'failed', detail: result?.error || 'The email could not be sent.' }
}

/** What the operator should be told, in their own terms. */
export function inviteDeliveryMessage(delivery: InviteDelivery): string | null {
  if (delivery.sent) return null
  return delivery.reason === 'not_connected'
    ? 'The invitation was created, but no email was sent because no email account is connected (Settings → Email). Share the link below instead.'
    : `The invitation was created, but the email could not be sent (${delivery.detail}). Share the link below instead.`
}
