import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
]
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export async function middleware(request: NextRequest) {
  // ============================================
  // MACHINE-TO-MACHINE WEBHOOK ALLOWLIST
  // ============================================
  // Inbound webhooks (e.g. the AI Concierge brief webhook) carry no user
  // session and authenticate themselves via HMAC signature. Skip the
  // Supabase session lookup entirely so we don't waste a round-trip or
  // touch auth cookies on every delivery.
  if (request.nextUrl.pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
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
              headers: request.headers,
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
              headers: request.headers,
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
  const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/invite/accept', '/terms', '/privacy', '/contact', '/docs', '/about', '/integrations']
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

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}