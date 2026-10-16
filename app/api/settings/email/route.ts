import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import { resolveMailbox } from '@/lib/gmail-mailbox'

// GET - the mailbox this user works in.
//
// There is no PUT any more. It saved a "signature" and an "auto-reply" into
// user_settings.email_settings that nothing ever read: outgoing mail signs
// with email_signatures (Settings › Email › Signatures), and no auto-reply
// was ever sent. Settings › Email now links to the real signatures instead.
export async function GET() {
  try {
    const { user } = await getAuthenticatedUser()

    // The mailbox this user actually works in (lib/gmail-mailbox): their own
    // connection, else the organisation's shared one. This used to fall back
    // to ANY stored token, so it said "Connected" to a user whose inbox and
    // Email Settings had no mailbox at all (operator, 2026-10-10).
    const mailbox = user ? await resolveMailbox(user.id) : null

    return NextResponse.json({
      gmail_connected: !!mailbox,
      gmail_email: mailbox?.email || '',
      // A colleague's connection: the company mailbox, not this user's to disconnect.
      gmail_shared: mailbox?.shared ?? false,
    })
  } catch (error) {
    console.error('Error fetching email settings:', error)
    return NextResponse.json({
      gmail_connected: false,
      gmail_email: '',
      gmail_shared: false,
    })
  }
}
