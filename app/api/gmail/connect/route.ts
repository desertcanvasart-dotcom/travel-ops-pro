import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import { signState } from '@/lib/oauth-state'

export async function POST() {
  try {
    // Derive the user from the session — not the request body — and sign the
    // state so the callback can't be tricked into writing tokens to another user.
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authUrl = getAuthUrl(signState(user.id))

    return NextResponse.json({ authUrl })
  } catch (err: any) {
    console.error('Gmail connect error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
