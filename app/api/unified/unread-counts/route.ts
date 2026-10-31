import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { unreadWhatsAppRows, unreadEmailRows, sumUnread } from '@/lib/inbox/unread-counts'

// ============================================
// GET /api/unified/unread-counts — the sidebar's Email and WhatsApp badges
// ============================================
// Two sums, the same ones the dashboard shows (lib/inbox/unread-counts).
// Agents and above, like the inboxes they count (also behind the staff-only
// /api/unified prefix in the middleware).
export async function GET() {
  try {
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const [wa, email] = await Promise.all([unreadWhatsAppRows(supabase, orgId), unreadEmailRows(supabase, orgId)])
    if (wa.error || email.error) throw wa.error || email.error

    return NextResponse.json({ success: true, data: { whatsapp: sumUnread(wa.data), email: sumUnread(email.data) } })
  } catch (error) {
    console.error('Error counting unread messages:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to count unread messages') }, { status: 500 })
  }
}
