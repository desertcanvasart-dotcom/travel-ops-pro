import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'
import { getAuthenticatedUser } from '@/lib/supabase-secure'

export async function POST() {
  try {
    // Derive the user from the session — the userId is embedded into the OAuth
    // state, so trusting a client-supplied value would let a caller connect their
    // mailbox to another user's account.
    const { user, error: authError } = await getAuthenticatedUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Generate OAuth URL with user ID as state
    const authUrl = getAuthUrl(user.id)

    return NextResponse.json({ authUrl })
  } catch (err: any) {
    console.error('Gmail connect error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}