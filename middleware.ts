import { createServerClient } from '@supabase/ssr'
import { clientIp } from '@/lib/client-ip'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { roleAllows } from '@/lib/auth/roles'
import { VERIFIED_USER_HEADER, signVerifiedUserHeader } from '@/lib/auth/verified-user-header'
import { ACTIVE_ORG_COOKIE, pickActiveMembership } from '@/lib/auth/active-org'
import type { NextFetchEvent } from 'next/server'
import { recordActivity } from '@/lib/activity-log'

// Define route permissions - which roles can access which routes
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  // Admin and Manager — a manager sees everything, Settings included. What
  // stays admin-only is ADMINISTERING the organisation, and that is gated on
  // the mutations (below) and in-route, not on the pages: a manager opens
  // Settings and User Management, reads the Activity Log, and cannot invite,
  // change a role, edit the vocabulary or the company identity.
  '/settings': ['admin', 'manager'],
  '/activity': ['admin', 'manager'],
  '/users': ['admin', 'manager'],

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
  // The older /resources API writes the same rate tables (transportation,
  // accommodation, activity, meal) plus hotel/airport/restaurant contacts. It
  // was missing here, so a viewer could POST/PUT/DELETE rates through it.
  // Reads stay open: the itinerary resource picker (agents) GETs these.
  { prefix: '/api/resources', roles: ['admin', 'manager'] },

  // ---- Org / staff administration ----
  // team_members is the operating roster (who guides a trip, who meets a
  // flight). Editing it is a manager act; it was open to any session.
  { prefix: '/api/team-members', roles: ['admin', 'manager'] },
  { prefix: '/api/departments', roles: ['admin', 'manager'] },
  // Listing and switching the workspaces you belong to is not an
  // administrative act — it is how anyone in more than one agency chooses
  // which they are working in. It must come BEFORE the '/api/organization'
  // entry below, because .find() takes the first match and that prefix would
  // otherwise gate this to admins, leaving a manager unable to reach their
  // own second workspace. The route is still membership-checked in itself.
  { prefix: '/api/organizations/mine', roles: ['owner', 'admin', 'manager', 'agent', 'viewer'] },
  { prefix: '/api/organization', roles: ['admin'] },
  { prefix: '/api/invitations', roles: ['admin'] },
  // Email, notification and WhatsApp-AI settings are operating configuration,
  // not organisation administration: manager and above, like the rate
  // tables. Payment terms keep their own owner-only check in-route.
  { prefix: '/api/settings', roles: ['admin', 'manager'] },
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

// Staff-only, READS INCLUDED (agent and above). Customer conversations are
// PII — WhatsApp threads, the unified inbox, the copilot's drafts — and the AI
// and translate routes spend the operator's Anthropic/OpenAI keys. Email reads
// were already locked in-route; these were open to a viewer, who has no screen
// that uses any of them (a viewer's pages are dashboard, calendar and
// notifications). Webhooks and OAuth callbacks under these prefixes are
// self-authenticating and exempt, like every gate below.
const STAFF_ONLY_API_PREFIXES = [
  '/api/whatsapp',
  '/api/unified',
  '/api/copilot',
  '/api/email',
  '/api/gmail',
  '/api/ai',
  '/api/translate',
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
          .select('org_id, role, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .order('org_id', { ascending: true })
        // The role IN THE ACTIVE WORKSPACE — the same rule getCurrentOrgId()
        // applies to scope the route's data (lib/auth/active-org.ts). This
        // used to take the oldest membership's role regardless of the
        // active-org cookie, so an admin in one agency who was a viewer in
        // another could switch to the second and clear every admin-only gate
        // there: the data was scoped to the workspace they chose, the role
        // was read from the one they did not.
        return pickActiveMembership(
          (data ?? []) as { org_id: string; role: string; created_at: string | null }[],
          request.cookies.get(ACTIVE_ORG_COOKIE)?.value,
        )?.role ?? null
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
  // '/order' is the hosted order form — the tour-up.jp inquiry form served by
  // us. The visitor is a customer with no account; the page only renders a
  // form, and its submit endpoint (/api/public/order-form) defends itself.
  // '/survey/' (trailing slash) is the guest questionnaire link: public by
  // token, like /share and /portal. The trailing slash matters — a bare
  // '/survey' prefix would also un-gate the staff '/surveys' results page.
  const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/invite/accept', '/terms', '/privacy', '/contact', '/docs', '/about', '/integrations', '/share', '/portal', '/order', '/guide', '/staff', '/survey/']
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
    // Staff tap-links: the driver/guide has no login. The route validates the
    // token against an active staff_link on a live (non-cancelled) assignment,
    // derives org/itinerary/actor server-side, and rate-limits per assignment.
    '/api/staff/',
    // Invitation verify/accept: the invitee has NO session yet by definition
    // (they clicked the emailed link; accept runs right after signUp). Both
    // routes authenticate by the unguessable invitation token and check
    // expiry/reuse themselves. EXACT routes — the sibling /api/invitations
    // list/create/delete handlers rely on this session gate and stay behind it.
    '/api/invitations/verify',
    '/api/invitations/accept',
    // The hosted order form's submit. The visitor is a customer, not a user,
    // and never will be. EXACT route; it rate-limits per IP, carries a
    // honeypot, validates every field with hard caps, and answers the
    // customer with received-or-not only — never the operator's numbers.
    '/api/public/order-form',
    // The guest survey load/submit. The visitor is a customer with no session;
    // the route is token-gated, rate-limited, and sanitizes every field.
    '/api/public/survey/',
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
  if (isApiRoute && user) {
    // Start the membership lookup alongside the is_active one: nearly every
    // API request needs both (the gates below), and they are independent —
    // awaited one after the other they cost two sequential round trips on every
    // call. Both are memoised, so the gates below reuse these results.
    const [active] = await Promise.all([
      isAccountActive(user.id),
      isSelfAuthApi ? Promise.resolve(null) : membershipRole(user.id),
    ])
    if (!active) {
      return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
    }
  }

  // A session proves who you are, not that you belong to an agency. Supabase
  // signup is open by default, so any stranger can mint a confirmed session,
  // and many read routes use the service-role client and scope nothing
  // themselves (e.g. /api/whatsapp/conversations returned every thread with
  // client names and emails). Without this gate a membership-less account
  // could GET customer PII, rate tables and staff profiles. Routes that
  // legitimately run before a membership exists (invitation verify/accept,
  // OAuth callbacks) authenticate themselves and are in apiSelfAuthPrefixes,
  // so they are exempt; the first user on a fresh install gets a membership
  // from the signup bootstrap trigger.
  if (isApiRoute && user && !isSelfAuthApi && !(await membershipRole(user.id))) {
    return NextResponse.json({ error: 'No workspace access' }, { status: 403 })
  }

  if (
    isApiRoute &&
    user &&
    !isSelfAuthApi &&
    STAFF_ONLY_API_PREFIXES.some(p => request.nextUrl.pathname.startsWith(p))
  ) {
    if (!roleAllows(await membershipRole(user.id), ['admin', 'manager', 'agent'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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
        ip: clientIp(request.headers),
        user_agent: request.headers.get('user-agent'),
      })
    )

    const matched = API_MUTATION_PERMISSIONS.find(p =>
      request.nextUrl.pathname.startsWith(p.prefix)
    )
    if (matched) {
      // (is_active was re-queried here; the check above already refused a
      // deactivated account for every API request, reads included.)
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
      // is_active is ACCOUNT-level (a deactivated person is deactivated in
      // every organisation) and the ROLE comes from organization membership —
      // both through the memoised service-role lookups above, in parallel.
      // The role is the one IN THE ACTIVE WORKSPACE: this gate used to read an
      // arbitrary first membership (.limit(1), no order), so someone who is an
      // admin in one agency and a viewer in another was gated by whichever row
      // came back — the API gate had been fixed, the page gate had not.
      const [active, role] = await Promise.all([isAccountActive(user.id), membershipRole(user.id)])

      if (!active) {
        return NextResponse.redirect(new URL('/login?error=account_inactive', request.url))
      }

      const userRole = role ?? 'viewer'
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