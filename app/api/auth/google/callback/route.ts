import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTokensFromCode, getUserEmail } from '@/lib/gmail'

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

  // Determine the correct base URL for redirects
  const baseUrl = BASE_URL || request.headers.get('x-forwarded-host')
    ? `https://${request.headers.get('x-forwarded-host')}`
    : request.url

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/email?error=${error}`, baseUrl)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/email?error=missing_params', baseUrl)
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
        user_id: state,
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