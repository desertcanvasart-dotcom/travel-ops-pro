// ============================================
// API: /api/gmail/threads?id= — a whole conversation
// ============================================
// The inbox lists messages; opening one shows its whole Gmail thread, oldest
// first, as Gmail does. Same mailbox as the list (lib/gmail-mailbox).

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { fetchThread, GmailAuthError } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'
import { getCurrentUserId } from '@/lib/auth/current-org'

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid thread id' }, { status: 400 })
  }

  try {
    const { gmail } = await getMailboxGmail(userId)
    const messages = await fetchThread(gmail, id)
    return NextResponse.json({ messages })
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return NextResponse.json({ error: clientMessage(err, 'Gmail not connected') }, { status: 401 })
    }
    console.error('Fetch thread error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
