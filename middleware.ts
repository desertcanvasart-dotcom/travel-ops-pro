import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { roleAllows } from '@/lib/auth/roles'
import { VERIFIED_USER_HEADER, signVerifiedUserHeader } from '@/lib/auth/verified-user-header'
import type { NextFetchEvent } from 'next/server'
import { recordActivity } from '@/lib/activity-log'

// Define route permissions - which roles can access which routes
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Admin only
  '/settings': ['admin'],
  '/activity': ['admin'],
  '/users': ['admin'],
  
  // Admin and Manager
  '/team-members': ['admin', 'manager'],
  '/departments': ['admin', 'manager'],
  '/financial-reports': ['admin', 'manager'],
  '/receipts': ['admin', 'manager'],
  '/supplier-invoices': ['admin', 'manager'],
  '/commissions': ['admin', 'manager'],
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
  '/expenses': ['admin', 'manager'],
  '/reminders': ['admin', 'manager', 'agent'],
  
  // All authenticated users (including viewer)
  '/dashboard': ['admin', 'manager', 'agent', 'viewer'],
  '/analytics': ['admin', 'manager'],
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
  // ---- Money (unchanged) ----
  { prefix: '/api/invoices', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/payments', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/commissions', roles: ['admin', 'manager'] },
  { prefix: '/api/supplier-invoices', roles: ['admin', 'manager'] },
  { prefix: '/api/expenses', roles: ['admin', 'manager', 'agent'] },
  // The season calendar sets what customers are charged on the operator's own
  // high dates — a pricing decision, same audience as the rate tables.
  { prefix: '/api/pricing', roles: ['admin', 'manager'] },

  // ---- Cost base (manager and above) ----
  // These mirror the /rates, /hotels, /guides, /transportation and /attractions
  // PAGE gates above. They were missing, and the page gate alone is theatre:
  // every one of these routes runs on the RLS-bypassing service-role client, so
  // a viewer who never sees the screen could still POST/PUT/DELETE the rate
  // tables the whole pricing engine reads from.
  { prefix: '/api/rates', roles: ['admin', 'manager'] },
  { prefix: '/api/supplier-rates', roles: ['admin', 'manager'] },
  { prefix: '/api/pricing-grid', roles: ['admin', 'manager'] },
  { prefix: '/api/suppliers', roles: ['admin', 'manager'] },
  { prefix: '/api/vehicles', roles: ['admin', 'manager'] },
  { prefix: '/api/guides', roles: ['admin', 'manager'] },
  { prefix: '/api/cruises', roles: ['admin', 'manager'] },
  { prefix: '/api/exchange-rates', roles: ['admin', 'manager'] },

  // ---- Org / staff administration ----
  // team_members is the operating roster (who guides a trip, who meets a
  // flight). Editing it is a manager act; it was open to any session.
  { prefix: '/api/team-members', roles: ['admin', 'manager'] },
  { prefix: '/api/departments', roles: ['admin', 'manager'] },
  { prefix: '/api/organization', roles: ['admin'] },
  { prefix: '/api/invitations', roles: ['admin'] },
  { prefix: '/api/settings', roles: ['admin'] },
  { prefix: '/api/integrations', roles: ['admin'] },
  { prefix: '/api/partners', roles: ['admin', 'manager'] },

  // ---- Customer-facing operations (agent and above) ----
  // Mirrors the /clients, /itineraries, /tours, /tasks, /followups and
  // /reminders page gates. A viewer is a read-only role and must not be able
  // to create or delete a customer, a trip or a booking by calling the API.
  { prefix: '/api/clients', roles: ['admin', 'manager', 'agent'] },
  // B2B quotes are customer-facing pricing. This prefix was MISSING from the
  // sweep that built this list, so every b2b route stayed open to any session:
  // a viewer could PUT a quote, and bulk-delete a page of them.
  // Pricing config is manager-and-above (like the rate tables). MUST precede
  // the general '/api/b2b' entry below — .find() takes the first match.
  { prefix: '/api/b2b/pricing-rules', roles: ['admin', 'manager'] },
  { prefix: '/api/b2b/transport-packages', roles: ['admin', 'manager'] },
  { prefix: '/api/b2b', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/b2c', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/itineraries', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/bookings', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/tours', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/templates', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/tasks', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/reminders', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/content-library', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/itinerary-resources', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/capacity', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/departures', roles: ['admin', 'manager', 'agent'] },

  // ---- Outbound messaging (agent and above) ----
  // Anything that puts a message in front of a real customer, supplier or
  // partner. Not viewer-safe: a send cannot be taken back.
  { prefix: '/api/whatsapp', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/send-email', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/send-supplier-document', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/email', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/gmail', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/copilot', roles: ['admin', 'manager', 'agent'] },
  { prefix: '/api/supplier-documents', roles: ['admin', 'manager', 'agent'] },
]
// Deliberately NOT listed, and therefore session-only for every role: the
// self-service routes (/api/profile, /api/user, /api/user-preferences,
// /api/avatar, /api/notifications) — a viewer must still be able to edit their
// own profile and dismiss their own notifications.
// NOTE: this gate matches by path PREFIX, so financial mutations on NESTED
// action routes (e.g. /api/itineraries/[id]/generate-commissions, which creates
// commission rows) are NOT covered here — those guard themselves in-route via
// requireRole() from lib/auth/current-org.ts. Keep both in sync.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Financial data is manager-and-above, READS INCLUDED — a blocked page over an
// open API is theater. /api/invoices and /api/payments stay agent-accessible
// on purpose: reservation staff issue invoices and record customer payments.
const FINANCIAL_API_PREFIXES = [
  '/api/dashboard/money',
  '/api/profit-loss',
  '/api/financial-reports',
  '/api/expenses',
  '/api/commissions',
  '/api/supplier-invoices',
  '/api/accounts-receivable',
  '/api/accounts-payable',
  '/api/analytics',
  // The accounting integration's chart of accounts and sync status are
  // financial data — manager and above, reads included.
  '/api/accounting',
]

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // The caller's role in their organisation — organization_members is the one
  // authority (see lib/auth/roles.ts). Resolved at most once per request and
  // shared by every gate below, since a request crosses two of them at most.
  // Resolved at most once per request, shared by every gate below.
  let isActivePromise: Promise<boolean> | null = null
  const isAccountActive = async (userId: string): Promise<boolean> => {
    if (!isActivePromise) {
      isActivePromise = (async () => {
        const { data } = await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } }
        )
          .from('user_profiles')
          .select('is_active')
          .eq('id', userId)
          .single()
        // Absent profile → treat as active (do not lock out a brand-new account
        // whose profile row has not been created yet); only an explicit false
        // deactivates.
        return (data as { is_active?: boolean } | null)?.is_active !== false
      })()
    }
    return isActivePromise
  }

  let membershipRolePromise: Promise<string | null> | null = null
  const membershipRole = async (userId: string): Promise<string | null> => {
    if (!membershipRolePromise) {
      membershipRolePromise = (async () => {
        const { data } = await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } }
        )
          .from('organization_members')
          .select('role')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        return (data as { role?: string } | null)?.role ?? null
      })()
    }
    return membershipRolePromise
  }

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
  // '/portal' is the same idea for a BOOKING, and unlike /share it accepts
  // input — the traveller fills in their own passport and contact details there
  // instead of returning a form by fax. Same shape: the page resolves the token
  // with the service role and 404s on anything else.
  const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/invite/accept', '/terms', '/privacy', '/contact', '/docs', '/about', '/integrations', '/share', '/portal']
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
    // EXACT route, not the '/api/whatsapp/status' prefix it used to be. That
    // prefix also matched '/api/whatsapp/status-callback', which is how an
    // unauthenticated, unsigned endpoint ended up writing to whatsapp_messages
    // with the service role. Both Twilio routes now verify the X-Twilio-
    // Signature themselves (lib/twilio-signature.ts); '/api/whatsapp/status'
    // — which reports whether Twilio credentials are configured — is NOT a
    // Twilio endpoint and goes back behind the session gate.
    '/api/whatsapp/status-callback',
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
    // The traveller's own page. Authenticates by unguessable token rather than
    // by session — the visitor is a customer, not a user, and never will be.
    // The route validates the token, checks revocation and expiry, rate-limits
    // by IP, and writes only allowlisted fields.
    '/api/portal/',
  ]
  const isSelfAuthApi = apiSelfAuthPrefixes.some(p => request.nextUrl.pathname.startsWith(p))

  // Gate every other /api/* route behind an authenticated session. Until now ALL
  // /api/* was allowed through while the routes use the service-role key (which
  // bypasses RLS), leaving them callable by anonymous internet clients.
  if (isApiRoute && !isSelfAuthApi && !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // DEACTIVATED ACCOUNTS get nothing from the API — reads included. The
  // is_active check used to live only inside the mutation block below, so a
  // deactivated user could still GET analytics, accounts-receivable, the
  // accounting chart and so on. is_active is account-level: deactivated here is
  // deactivated everywhere.
  if (isApiRoute && user && !(await isAccountActive(user.id))) {
    return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
  }

  // Role-gate financial API MUTATIONS (the routes use the RLS-bypassing
  // service-role key, so this is the authorization layer for them).
  if (
    isApiRoute &&
    user &&
    FINANCIAL_API_PREFIXES.some(p => request.nextUrl.pathname.startsWith(p))
  ) {
    if (!roleAllows(await membershipRole(user.id), ['admin', 'manager'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (isApiRoute && user && MUTATING_METHODS.has(request.method)) {
    // AUDIT TRAIL: every authenticated mutating API call is recorded here —
    // the one chokepoint no screen or code path can route around. Deferred
    // via waitUntil so the request never waits on the log write.
    event.waitUntil(
      recordActivity({
        user_id: user.id,
        user_email: user.email ?? null,
        method: request.method,
        path: request.nextUrl.pathname,
        ip:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent'),
      })
    )

    const matched = API_MUTATION_PERMISSIONS.find(p =>
      request.nextUrl.pathname.startsWith(p.prefix)
    )
    if (matched) {
      // is_active is account-level and stays on the profile: a deactivated
      // person is deactivated in every organisation.
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_active')
        .eq('id', user.id)
        .single()
      if (profile && profile.is_active === false) {
        return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
      }
      // The ROLE comes from membership, via roleAllows — same authority as the
      // financial read gate above. This block used to read user_profiles.role
      // and compare it with a plain includes(), which is both of the failures
      // lib/auth/roles.ts warns about: it gated on the display mirror, and an
      // OWNER — named in no allowed-list — was refused every mutation here.
      if (!roleAllows(await membershipRole(user.id), matched.roles)) {
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
      // is_active is ACCOUNT-level and stays on the profile: a deactivated
      // person is deactivated in every organisation.
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_active')
        .eq('id', user.id)
        .single()

      if (profile && !profile.is_active) {
        return NextResponse.redirect(new URL('/login?error=account_inactive', request.url))
      }

      // The ROLE comes from organization membership — the one role system.
      // Read with the service client, deliberately: this is the gate itself,
      // and an RLS surprise here would fail everyone closed into a redirect
      // loop rather than a 403 anyone can read.
      const { data: membership } = await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      )
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      const userRole = (membership as { role?: string } | null)?.role ?? 'viewer'
      const allowedRoles = ROUTE_PERMISSIONS[matchedRoute]

      if (!roleAllows(userRole, allowedRoles)) {
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