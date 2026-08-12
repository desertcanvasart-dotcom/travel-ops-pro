import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { VERIFIED_USER_HEADER, signVerifiedUserHeader } from '@/lib/auth/verified-user-header'

// Define route permissions - which roles can access which routes
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Admin only
  '/settings': ['admin'],
  '/users': ['admin'],
  
  // Admin and Manager
  '/team-members': ['admin', 'manager'],
  '/financial-reports': ['admin', 'manager'],
  '/profit-loss': ['admin', 'manager'],
  '/accounts-receivable': ['admin', 'manager'],
  '/accounts-payable': ['admin', 'manager'],
  '/rates': ['admin', 'manager'],
  '/hotels': ['admin', 'manager'],
  '/restaurants': ['admin', 'manager'],
  '/guides': ['admin', 'manager'],
  '/transportation': ['admin', 'manager'],
  '/attractions': ['admin', 'manager'],
  
  // Admin, Manager, Agent
  '/clients': ['admin', 'manager', 'agent'],
  '/itineraries': ['admin', 'manager', 'agent'],
  '/invoices': ['admin', 'manager', 'agent'],
  '/payments': ['admin', 'manager', 'agent'],
  '/tasks': ['admin', 'manager', 'agent'],
  '/inbox': ['admin', 'manager', 'agent'],
  '/whatsapp-inbox': ['admin', 'manager', 'agent'],
  '/whatsapp-parser': ['admin', 'manager', 'agent'],
  '/contacts': ['admin', 'manager', 'agent'],
  '/followups': ['admin', 'manager', 'agent'],
  '/tours': ['admin', 'manager', 'agent'],
  '/expenses': ['admin', 'manager', 'agent'],
  '/reminders': ['admin', 'manager', 'agent'],
  
  // All authenticated users (including viewer)
  '/dashboard': ['admin', 'manager', 'agent', 'viewer'],
  '/analytics': ['admin', 'manager', 'agent', 'viewer'],
  '/calendar': ['admin', 'manager', 'agent', 'viewer'],
  '/notifications': ['admin', 'manager', 'agent', 'viewer'],
}

// Financial / privileged API routes — MUTATIONS (POST/PUT/PATCH/DELETE) require a
// role even though the request carries a valid session. These routes use the
// service-role client (which bypasses RLS), so without this an authenticated
// low-privilege user (e.g. viewer) could edit or delete financial records the UI
// restricts to admin/manager. GET stays session-only so lower roles can still
// read. Matched by path prefix; mirrors the page-level permissions above.
const API_MUTATION_PERMISSIONS: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/api/invoices', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/payments', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/commissions', roles: ['admin', 'manager'] },
  { prefix: '/api/supplier-invoices', roles: ['admin', 'manager'] },
  { prefix: '/api/expenses', roles: ['admin', 'manager', 'agent'] },
]
// NOTE: this gate matches by path PREFIX, so financial mutations on NESTED
// action routes (e.g. /api/itineraries/[id]/generate-commissions, which creates
// commission rows) are NOT covered here — those guard themselves in-route via
// requireRole() from lib/auth/current-org.ts. Keep both in sync.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function middleware(request: NextRequest) {
  // NEVER trust a client-supplied copy of the internal verified-user header —
  // strip it from every forwarded request. Middleware re-adds it (HMAC-signed)
  // below only after the session is actually verified.
  const strippedHeaders = new Headers(request.headers)
  strippedHeaders.delete(VERIFIED_USER_HEADER)

  // ============================================
  // MACHINE-TO-MACHINE WEBHOOK ALLOWLIST
  // ============================================
  // Inbound webhooks (e.g. the AI Concierge brief webhook) carry no user
  // session and authenticate themselves via HMAC signature. Skip the
  // Supabase session lookup entirely so we don't waste a round-trip or
  // touch auth cookies on every delivery.
  if (request.nextUrl.pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next({ request: { headers: strippedHeaders } })
  }

  let response = NextResponse.next({
    request: {
      headers: strippedHeaders,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: strippedHeaders,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: strippedHeaders,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Public routes that don't require authentication
  // '/share' is the traveller's itinerary link: public by design, but only for
  // a token that resolves to an unrevoked share. The page itself does that
  // check with the service role (and 404s otherwise) — see app/share/[token].
  const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/invite/accept', '/terms', '/privacy', '/contact', '/docs', '/about', '/integrations', '/share']
  const isPublicRoute = publicRoutes.some(route => 
    request.nextUrl.pathname === route || 
    (route !== '/' && request.nextUrl.pathname.startsWith(route))
  )

  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  // API routes that authenticate themselves (machine-to-machine, no user session):
  //  - /api/cron/* and /api/tours/recalculate-prices verify CRON_SECRET
  //  - Twilio posts WhatsApp inbound/status webhooks with no session cookie
  //  - OAuth providers redirect the browser back to *callback routes
  //  - /api/webhooks/* is HMAC-verified and already returned at the top of this fn
  const apiSelfAuthPrefixes = [
    '/api/cron/',
    '/api/tours/recalculate-prices',
    '/api/whatsapp/webhook',
    '/api/whatsapp/status',
    '/api/auth/google/callback',
    '/api/auth/accounting/callback',
    // Deploy-verification probe: public by design, returns only the build
    // SHA + uptime (no data, no secrets). scripts/verify-deploy.mjs hits it
    // unauthenticated to confirm WHICH commit a deployment is serving.
    '/api/version',
    // Partner-facing read API. Authenticates itself with an issued API key
    // matched against a stored hash (lib/integrations/credentials.ts) — a
    // partner platform has no user session and never will.
    '/api/public/v1/',
  ]
  const isSelfAuthApi = apiSelfAuthPrefixes.some(p => request.nextUrl.pathname.startsWith(p))

  // Gate every other /api/* route behind an authenticated session. Until now ALL
  // /api/* was allowed through while the routes use the service-role key (which
  // bypasses RLS), leaving them callable by anonymous internet clients.
  if (isApiRoute && !isSelfAuthApi && !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Role-gate financial API MUTATIONS (the routes use the RLS-bypassing
  // service-role key, so this is the authorization layer for them).
  if (isApiRoute && user && MUTATING_METHODS.has(request.method)) {
    const matched = API_MUTATION_PERMISSIONS.find(p =>
      request.nextUrl.pathname.startsWith(p.prefix)
    )
    if (matched) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()
      if (profile && profile.is_active === false) {
        return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
      }
      const userRole = profile?.role || 'viewer'
      if (!matched.roles.includes(userRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  // If user is not logged in and trying to access a protected page
  if (!user && !isPublicRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If user is logged in and trying to access login/signup (but not homepage)
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ============================================
  // ROLE-BASED ACCESS CONTROL
  // ============================================
  
  if (user && !isPublicRoute && !isApiRoute) {
    const pathname = request.nextUrl.pathname
    
    // Check if this route has permission restrictions
    const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find(route => {
      return pathname === route || pathname.startsWith(route + '/')
    })

    if (matchedRoute) {
      // Get user's role from profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()

      // Check if user is active
      if (profile && !profile.is_active) {
        // User is deactivated - sign them out and redirect
        return NextResponse.redirect(new URL('/login?error=account_inactive', request.url))
      }

      const userRole = profile?.role || 'viewer'
      const allowedRoles = ROUTE_PERMISSIONS[matchedRoute]

      // Check if user's role is allowed
      if (!allowedRoles.includes(userRole)) {
        // User doesn't have permission - redirect to dashboard with error
        return NextResponse.redirect(new URL('/dashboard?error=unauthorized', request.url))
      }
    }
  }

  // Session verified — forward the user id to route handlers via the signed
  // internal header so getCurrentOrgId()/getCurrentUserId() can skip their own
  // auth.getUser() network round-trip (they verify the HMAC and fall back to
  // getUser() if the header is absent/invalid). Rebuild the forwarded request
  // with the header and carry over any cookies the Supabase client set during
  // token refresh — those live on `response` and must not be dropped.
  if (user) {
    const signed = await signVerifiedUserHeader(user.id)
    if (signed) {
      const forwardedHeaders = new Headers(strippedHeaders)
      forwardedHeaders.set(VERIFIED_USER_HEADER, signed)
      const finalResponse = NextResponse.next({ request: { headers: forwardedHeaders } })
      response.cookies.getAll().forEach(cookie => finalResponse.cookies.set(cookie))
      return finalResponse
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}