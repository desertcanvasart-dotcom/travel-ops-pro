import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// API routes that legitimately receive requests WITHOUT a Supabase session and
// perform their own verification (Twilio signatures, OAuth `state`, cron bearer
// secret, or a pre-signup invite token). These bypass the session requirement.
const PUBLIC_API_ROUTES = [
  '/api/whatsapp/webhook',          // Twilio inbound — verifies X-Twilio-Signature
  '/api/whatsapp/status-callback',  // Twilio status — verifies X-Twilio-Signature
  '/api/auth/google/callback',      // Google OAuth redirect — verifies state
  '/api/auth/accounting/callback',  // QuickBooks OAuth redirect — verifies state
  '/api/cron/send-reminders',       // Scheduler — verifies CRON_SECRET bearer
  '/api/cron/task-reminders',       // Scheduler — verifies CRON_SECRET bearer
  '/api/invitations/verify',        // Pre-signup invite check (no account yet)
]

// Internal server-to-server routes called by other route handlers without a
// user cookie (e.g. cron -> send-email, notifications -> gmail/send). When
// INTERNAL_API_SECRET is set they require a matching `x-internal-secret` header;
// until it is set they stay reachable for backward compatibility.
const INTERNAL_API_ROUTES = [
  '/api/send-email',
  '/api/gmail/send',
  '/api/notifications',
]

function matchesPrefix(pathname: string, routes: string[]): boolean {
  return routes.some(route => pathname === route || pathname.startsWith(route + '/'))
}

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

export async function middleware(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname

  // ============================================
  // API AUTHENTICATION GATE
  // API routes are NOT covered by the page redirect below, so they must be
  // gated here. Everything under /api requires an authenticated user unless it
  // is an explicitly public (self-verifying) endpoint or a trusted internal call.
  // ============================================
  if (pathname.startsWith('/api')) {
    // Self-verifying public endpoints (webhooks, OAuth callbacks, cron, invite verify)
    if (matchesPrefix(pathname, PUBLIC_API_ROUTES)) {
      return response
    }

    // Invitation acceptance (PUT marks an invite accepted by its token) runs
    // immediately after signup, before the session cookie is reliably readable.
    if (pathname === '/api/invitations' && request.method === 'PUT') {
      return response
    }

    // Normal case: an authenticated browser/session request
    if (user) {
      return response
    }

    // Trusted internal server-to-server calls
    const internalSecret = process.env.INTERNAL_API_SECRET
    if (internalSecret) {
      if (request.headers.get('x-internal-secret') === internalSecret) {
        return response
      }
    } else if (matchesPrefix(pathname, INTERNAL_API_ROUTES)) {
      // Secret not configured yet -> keep internal routes working (back-compat)
      return response
    }

    // Unauthenticated access to a protected API route
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/invite/accept', '/terms', '/privacy', '/contact', '/docs', '/about', '/integrations']
  const isPublicRoute = publicRoutes.some(route =>
    pathname === route ||
    (route !== '/' && pathname.startsWith(route))
  )

  // If user is not logged in and trying to access protected route
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If user is logged in and trying to access login/signup (but not homepage)
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ============================================
  // ROLE-BASED ACCESS CONTROL
  // ============================================

  if (user && !isPublicRoute) {

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