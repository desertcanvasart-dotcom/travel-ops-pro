// ============================================
// API: COMMIT CONCIERGE BRIEF TO ITINERARY
// ============================================
// GET  /api/copilot/threads/:id/commit-itinerary
//      → returns the itinerary already spawned from this thread (or null)
// POST /api/copilot/threads/:id/commit-itinerary
//      → idempotently creates the itinerary
//
// Auth: gated by the standard /api/* middleware (logged-in operator session,
// agent and above).
//
// THE THREAD IS THE AUTHORITY (DEFERRED_GATES.md G1). The itinerary lands in
// the thread's company (communication_threads.org_id), whoever clicks. The
// session is only an access check: the caller must be a MEMBER of the
// thread's company — a person in both companies may commit a thread of
// either, whichever workspace is active; anyone else gets 404 ("Thread not
// found" — another company's thread ids are not confirmed to exist). GET
// returns the company's name for the button ("Create itinerary in <name>").
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { commitBriefToItinerary } from '@/lib/concierge/commit-brief-to-itinerary'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { isOrgMember } from '@/lib/auth/org-members'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RouteContext {
  params: Promise<{ id: string }>
}

/** The thread's company (id and name) when the caller is one of its members;
 *  null when the thread does not exist or the caller is not. */
async function threadOrgForCaller(threadId: string): Promise<{ id: string; name: string } | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null
  const { data: thread } = await supabase
    .from('communication_threads')
    .select('id, org_id')
    .eq('id', threadId)
    .maybeSingle()
  const orgId = (thread as { org_id?: string | null } | null)?.org_id
  if (!orgId) return null
  if (!(await isOrgMember(supabase, orgId, userId))) return null
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()
  return { id: orgId, name: ((org as { name?: string } | null)?.name) || 'this company' }
}

// GET — surface the existing spawned itinerary (if any) so the UI can render
// either the "Create itinerary" button or the "View itinerary →" link.
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id: threadId } = await ctx.params
    if (!(await getCurrentOrgId())) return noOrgResponse()

    const org = await threadOrgForCaller(threadId)
    if (!org) return NextResponse.json({ success: true, itinerary: null, org: null })

    const { data: itin, error } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name')
      .eq('thread_id', threadId)
      // The thread's company's itinerary only.
      .eq('org_id', org.id)
      .maybeSingle()

    if (error) {
      console.error('[commit-itinerary GET] lookup failed:', error.message)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      org,
      itinerary: itin
        ? {
            id: itin.id,
            itinerary_code: itin.itinerary_code,
            trip_name: itin.trip_name,
          }
        : null,
    })
  } catch (e: any) {
    console.error('[commit-itinerary GET] unexpected:', e)
    return NextResponse.json(
      { success: false, error: e?.message || 'Unexpected error' },
      { status: 500 }
    )
  }
}

// POST — create the itinerary (idempotent at DB + code layer) in the
// thread's company.
export async function POST(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id: threadId } = await ctx.params

    if (!(await getCurrentOrgId())) {
      return NextResponse.json(
        { success: false, error: 'No organization context — re-login or contact admin.' },
        { status: 403 }
      )
    }

    // Only a member of the thread's company: any thread id used to copy
    // another company's concierge brief — the visitor's name, email and
    // phone — into a new itinerary.
    const org = await threadOrgForCaller(threadId)
    if (!org) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 })
    }

    const result = await commitBriefToItinerary(threadId, supabase)
    return NextResponse.json(
      {
        success: true,
        itinerary_id: result.itineraryId,
        itinerary_code: result.itineraryCode,
        trip_name: result.tripName,
        brief_id: result.briefId,
        org_id: result.orgId,
        org_name: org.name,
        was_new: result.wasNewItinerary,
      },
      { status: result.wasNewItinerary ? 201 : 200 }
    )
  } catch (e: any) {
    console.error('[commit-itinerary POST] failed:', e?.message)
    const msg: string = e?.message || 'Unexpected error'
    // Distinguish operator-actionable errors (404-class) from server errors.
    const isClientError =
      msg.startsWith('[commit-brief] thread not found') ||
      msg.includes("has origin='") ||
      msg.includes('has no brief_id')
    return NextResponse.json(
      { success: false, error: msg },
      { status: isClientError ? 404 : 500 }
    )
  }
}
