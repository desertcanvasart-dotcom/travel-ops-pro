import { describe, it, expect } from 'vitest'
import {
  decideAcceptAction,
  checkInvitationState,
  checkPassword,
  emailsMatch,
  MIN_PASSWORD_LENGTH,
} from '@/lib/invitation-accept'

// The invitation flow stranded a real manager: signUp() left the account
// unconfirmed, the confirmation mail was never actioned, and from then on
// signup said "already registered" while login always failed. These pin the
// decisions that make that unrecoverable state impossible.

describe('decideAcceptAction', () => {
  it('no account yet → create it (pre-confirmed by the caller)', () => {
    expect(decideAcceptAction(null)).toEqual({ action: 'create' })
    expect(decideAcceptAction(undefined)).toEqual({ action: 'create' })
  })

  it('an UNCONFIRMED account is repaired — this is the stranded case', () => {
    expect(decideAcceptAction({ id: 'u1', email_confirmed_at: null, confirmed_at: null }))
      .toEqual({ action: 'repair', userId: 'u1' })
  })

  it('a CONFIRMED account is only linked — an invite is never a password reset', () => {
    expect(decideAcceptAction({ id: 'u2', email_confirmed_at: '2026-08-26T00:00:00Z' }))
      .toEqual({ action: 'link', userId: 'u2' })
    // Some GoTrue versions populate confirmed_at only.
    expect(decideAcceptAction({ id: 'u3', confirmed_at: '2026-08-26T00:00:00Z' }))
      .toEqual({ action: 'link', userId: 'u3' })
  })
})

describe('checkInvitationState', () => {
  const now = new Date('2026-08-28T12:00:00Z')

  it('accepts a live invitation', () => {
    expect(checkInvitationState({ accepted_at: null, expires_at: '2026-09-04T00:00:00Z' }, now))
      .toEqual({ usable: true })
  })

  it('refuses missing, already-used and expired tokens with their own status', () => {
    expect(checkInvitationState(null, now)).toMatchObject({ usable: false, status: 404 })
    expect(checkInvitationState({ accepted_at: '2026-08-27T02:20:16Z', expires_at: '2026-09-04T00:00:00Z' }, now))
      .toMatchObject({ usable: false, status: 400, error: 'This invitation has already been used' })
    expect(checkInvitationState({ accepted_at: null, expires_at: '2026-08-27T00:00:00Z' }, now))
      .toMatchObject({ usable: false, status: 400, error: 'This invitation has expired' })
  })
})

describe('input guards', () => {
  it('enforces the password floor server-side, not just in the form', () => {
    expect(checkPassword('x'.repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true)
    expect(checkPassword('x'.repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false)
    expect(checkPassword(undefined).ok).toBe(false)
    expect(checkPassword({ length: 99 }).ok).toBe(false)
  })

  it('matches emails regardless of case and padding', () => {
    expect(emailsMatch(' Egypt@ATS-HJ.com ', 'egypt@ats-hj.com')).toBe(true)
    expect(emailsMatch('other@ats-hj.com', 'egypt@ats-hj.com')).toBe(false)
    expect(emailsMatch(null, undefined)).toBe(true) // both empty; callers guard first
  })
})

import { inviteDelivery, inviteDeliveryMessage } from '@/lib/invitation-accept'

// The second half of the same incident: invitations reported as SENT while
// the app's Gmail connection had lapsed, so nothing ever left. Creating the
// invitation is still a success — the link works — but the operator must be
// told the email did not go, and handed the link.

describe('inviteDelivery', () => {
  it('a real send is reported as sent', () => {
    expect(inviteDelivery({ success: true })).toEqual({ sent: true })
    expect(inviteDeliveryMessage({ sent: true })).toBeNull()
  })

  it('no connected account is its own reason, not a generic failure', () => {
    const d = inviteDelivery({ success: false, noAccount: true, error: 'Gmail not connected. Please connect your Gmail account in Settings.' })
    expect(d).toMatchObject({ sent: false, reason: 'not_connected' })
    expect(inviteDeliveryMessage(d)).toContain('no email account is connected')
    expect(inviteDeliveryMessage(d)).toContain('Share the link')
  })

  it('a thrown "not connected" error is classified the same way', () => {
    const d = inviteDelivery(null, new Error('Gmail not connected. Please connect your Gmail account in Settings.'))
    expect(d).toMatchObject({ sent: false, reason: 'not_connected' })
  })

  it('any other failure is reported with its detail, never as success', () => {
    const d = inviteDelivery({ success: false, error: 'rate limited' })
    expect(d).toEqual({ sent: false, reason: 'failed', detail: 'rate limited' })
    expect(inviteDeliveryMessage(d)).toContain('rate limited')

    const thrown = inviteDelivery(null, new Error('socket hang up'))
    expect(thrown).toMatchObject({ sent: false, reason: 'failed' })
  })

  it('an absent result is a failure, not an assumed send', () => {
    expect(inviteDelivery(null).sent).toBe(false)
    expect(inviteDelivery(undefined).sent).toBe(false)
  })
})
