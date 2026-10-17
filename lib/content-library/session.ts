// ============================================
// The content library routes' session: who is calling, in which company
// ============================================
// /api/content-library/** runs on the signed-in session (anon key), so RLS
// decides what a caller can touch — since 20261208 their own companies'
// content, categories, writing rules and prompts. RLS alone is not enough:
// a person in BOTH companies passes user_is_in_org for either, and would see
// and edit both companies' rows. Every route therefore also filters by, and
// stamps, the ACTIVE company (getCurrentOrgId — the workspace switcher's
// choice among the caller's memberships).
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getCurrentOrgId } from '@/lib/auth/current-org'

async function sessionClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

export type ContentClient = Awaited<ReturnType<typeof sessionClient>>

export interface ContentSession {
  supabase: ContentClient
  orgId: string
  userId: string
}

/** The caller's session client, user and active company — or the response
 *  to return (401 without a session, 403 without a company). */
export async function contentSession(): Promise<ContentSession | NextResponse> {
  const supabase = await sessionClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const orgId = await getCurrentOrgId()
  if (!orgId) {
    return NextResponse.json({ error: 'No organization membership for current user' }, { status: 403 })
  }
  return { supabase, orgId, userId: user.id }
}

/** Columns a body may never set: the company (stamped / fixed) and the
 *  bookkeeping the routes own. */
export function withoutOwnedColumns<T extends Record<string, unknown>>(body: T): T {
  const copy = { ...body }
  for (const k of ['id', 'org_id', 'created_at', 'created_by']) delete copy[k]
  return copy
}

/** Whether a category is the company's own. A content item may only be
 *  filed under its own company's category (the foreign key does not know
 *  about companies). */
export async function categoryInOrg(supabase: ContentClient, orgId: string, categoryId: string): Promise<boolean> {
  const { data } = await supabase
    .from('content_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

/** Whether a content item is the company's own (the parent check every
 *  variation route makes first). */
export async function contentInOrg(supabase: ContentClient, orgId: string, contentId: string): Promise<boolean> {
  const { data } = await supabase
    .from('content_library')
    .select('id')
    .eq('id', contentId)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

/** Whether a destination is the company's own (writing_rules and content
 *  items may name one). */
export async function destinationInOrg(supabase: ContentClient, orgId: string, destinationId: string): Promise<boolean> {
  const { data } = await supabase
    .from('destinations')
    .select('id')
    .eq('id', destinationId)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}
