import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTokensFromCode, getUserEmail } from '@/lib/gmail'
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
  const userId = verifyState(state)
  if (!userId) {
    return NextResponse.redirect(
      new URL('/settings/email?error=invalid_state', baseUrl)
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('No tokens received')
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
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
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