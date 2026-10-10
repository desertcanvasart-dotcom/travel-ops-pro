import { NextRequest, NextResponse } from 'next/server'
import { nonceMatches, clearNonceCookie } from '@/lib/oauth/csrf-nonce'
import { encryptToken } from '@/lib/crypto/token-cipher'
import { createClient } from '@supabase/supabase-js'
import { getTokensFromCode, getUserEmail, GMAIL_SCOPES } from '@/lib/gmail'
import { verifyState } from '@/lib/oauth-state'

// Create admin client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Use the public app URL for redirects (request.url on Railway resolves to internal localhost:8080)
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || ''

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // Contains user_id
  const error = searchParams.get('error')

  // Determine the correct base URL for redirects (M10 fix).
  // The previous expression `BASE_URL || header ? https://header : request.url`
  // parsed as `(BASE_URL || header) ? https://header : request.url`, so even
  // when BASE_URL was configured the ternary still used the (attacker-set)
  // x-forwarded-host header. Parenthesize so BASE_URL really wins when set.
  const fwdHost = request.headers.get('x-forwarded-host')
  const baseUrl = BASE_URL || (fwdHost ? `https://${fwdHost}` : request.url)

  if (error) {
    // L5: encode + validate. Without these, `?error=` from Google was
    // concatenated raw into the URL — a crafted `error=foo&id=1` would
    // smuggle an extra query parameter past the redirect. The reflected
    // value is also constrained to Google's documented OAuth error code
    // set; anything else falls back to a generic 'oauth_error'.
    const KNOWN_OAUTH_ERRORS = new Set([
      'access_denied', 'admin_policy_enforced', 'disallowed_useragent',
      'invalid_client', 'invalid_grant', 'invalid_request', 'invalid_scope',
      'org_internal', 'redirect_uri_mismatch', 'unauthorized_client',
      'unsupported_response_type', 'server_error', 'temporarily_unavailable',
    ])
    const safeError = KNOWN_OAUTH_ERRORS.has(error) ? error : 'oauth_error'
    return NextResponse.redirect(
      new URL(`/settings/email?error=${encodeURIComponent(safeError)}`, baseUrl)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/email?error=missing_params', baseUrl)
    )
  }

  // Verify the signed state and recover the user id — never trust a raw user id
  // from the URL (an attacker could otherwise write tokens to any account).
  // The signed payload is `${userId}:${nonce}` since P4b-2.
  const [userId, stateNonce] = (verifyState(state) || '').split(':')
  if (!userId) {
    // The signature did not verify: a different OAUTH_STATE_SECRET (or service
    // key) signed it — another instance or a deploy mid-flow.
    console.warn('[gmail callback] invalid_state: state signature did not verify')
    return NextResponse.redirect(
      new URL('/settings/email?error=invalid_state', baseUrl)
    )
  }

  // CSRF: the nonce in the state must match the httpOnly cookie set when THIS
  // browser started the flow. Without this, a signed state the attacker minted
  // could complete against a victim's Google consent.
  if (!nonceMatches(request, stateNonce)) {
    console.warn('[gmail callback] connect_expired:', {
      cookiePresent: Boolean(request.cookies.get('oauth_state_nonce')?.value),
      host: request.headers.get('x-forwarded-host') || request.headers.get('host'),
    })
    // Told apart from a bad signature: this is the browser coming back without
    // the connect cookie — over 10 minutes, a second Connect click since, or a
    // flow started on another address than GOOGLE_REDIRECT_URI's.
    const res = NextResponse.redirect(new URL('/settings/email?error=connect_expired', baseUrl))
    clearNonceCookie(res)
    return res
  }

  try {
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('No tokens received')
    }

    // Google's consent screen lets each permission be unticked. A mailbox
    // connected without read/modify/send was saved as "connected" and then
    // failed every sync with a bare 403 — refuse it here and say why.
    const granted = new Set((tokens.scope || '').split(/\s+/).filter(Boolean))
    if (granted.size > 0 && GMAIL_SCOPES.filter(s => s.includes('/auth/gmail.')).some(s => !granted.has(s))) {
      const res = NextResponse.redirect(
        new URL('/settings/email?error=missing_permissions', baseUrl)
      )
      clearNonceCookie(res)
      return res
    }

    // Get user's email
    const email = await getUserEmail(tokens.access_token)

    // Calculate token expiry
    // tokens.expiry_date from Google OAuth is an absolute UNIX timestamp in ms
    // If missing, default to 1 hour from now
    const expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000)

    // Upsert token record
    const { error: dbError } = await supabase
      .from('gmail_tokens')
      .upsert({
        user_id: userId,
        email,
        access_token: encryptToken(tokens.access_token),
        refresh_token: encryptToken(tokens.refresh_token),
        token_expiry: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save tokens')
    }

    return NextResponse.redirect(
      new URL('/communications?gmail=connected', baseUrl)
    )
  } catch (err: any) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(
      new URL(`/settings/email?error=${encodeURIComponent(err.message)}`, baseUrl)
    )
  }
}