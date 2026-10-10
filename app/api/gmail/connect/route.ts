import { NextResponse } from 'next/server'
import { newNonce, setNonceCookie } from '@/lib/oauth/csrf-nonce'
import { clientMessage } from '@/lib/api-errors'
import { getAuthUrl } from '@/lib/gmail'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import { signState } from '@/lib/oauth-state'
import { wrongAddressFor } from '@/lib/oauth/redirect-address'

export async function POST(request: Request) {
  try {
    // Derive the user from the session — not the request body — and sign the
    // state so the callback can't be tricked into writing tokens to another user.
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // CSRF: bind this flow to the browser that started it. The nonce goes into
    // the signed state AND an httpOnly cookie; the callback requires both to
    // match, so a flow the victim did not initiate cannot complete.
    const useAddress = wrongAddressFor(request.headers.get('origin'), process.env.GOOGLE_REDIRECT_URI)
    if (useAddress) {
      return NextResponse.json(
        { error: `To connect Gmail, open Autoura at ${useAddress} and click Connect Gmail there — this page is on a different address, and Google can only finish the sign-in at ${useAddress}.` },
        { status: 409 }
      )
    }

    const nonce = newNonce()
    const authUrl = getAuthUrl(signState(`${user.id}:${nonce}`))

    const res = NextResponse.json({ authUrl })
    setNonceCookie(res, nonce)
    return res
  } catch (err: any) {
    console.error('Gmail connect error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
