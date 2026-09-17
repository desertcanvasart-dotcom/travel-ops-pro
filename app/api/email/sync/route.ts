import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { GmailAuthError } from '@/lib/gmail'
import type { EmailSyncOptions } from '@/types/unified'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { MailboxNotFoundError, syncMailbox } from '@/lib/email/sync-mailbox'

// Use service role for API routes to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/email/sync - Get sync status for the SIGNED-IN user.
//
// `user_id` used to come from the query string and was never checked against
// the session, so any authenticated account could read anyone's mailbox sync
// state. GET is not a mutating method, so the middleware role gate never
// applied either — a viewer could ask about anybody.
export async function GET() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in', success: false }, { status: 401 })
    }

    const { data: syncState, error } = await supabase
      .from('email_sync_state')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    return NextResponse.json({
      sync_state: syncState || {
        user_id: userId,
        sync_status: 'idle',
        last_history_id: null,
        last_full_sync_at: null,
        emails_synced: 0
      },
      success: true
    })
  } catch (error: any) {
    console.error('Error fetching sync state:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}

// POST /api/email/sync - Trigger email sync
export async function POST(request: NextRequest) {
  try {
    // WHOSE mailbox this syncs comes from the SESSION, never from the body.
    //
    // `user_id` used to be taken straight off the request. It reaches
    // getAuthenticatedGmail(user_id), which loads THAT user's stored OAuth
    // token — so any authenticated account could name a colleague and pull
    // their Gmail into the shared inbox. Same failure as the avatar route
    // (#171), same fix. See lib/auth/current-org.ts.
    const sessionUserId = await getCurrentUserId()
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not signed in', success: false }, { status: 401 })
    }

    const body: EmailSyncOptions = await request.json()
    // The sync itself is lib/email/sync-mailbox — shared with the scheduled
    // sync (app/api/cron/gmail-sync).
    const result = await syncMailbox(sessionUserId, body)
    return NextResponse.json(result)
  } catch (error: any) {
    if (error instanceof GmailAuthError) {
      return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 401 })
    }
    if (error instanceof MailboxNotFoundError) {
      return NextResponse.json({ error: error.message, success: false }, { status: 400 })
    }
    console.error('[Email Sync] Error syncing emails:', error.message, error.stack)
    return NextResponse.json({
      error: clientMessage(error, 'Internal server error'),
      success: false
    }, { status: 500 })
  }
}
