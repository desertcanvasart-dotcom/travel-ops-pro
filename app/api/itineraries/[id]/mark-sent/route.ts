import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// Service-role key — anon key + RLS on itineraries silently filters out the
// row before the app-layer org check below can run. Same fix as the days
// route. The .eq('org_id', orgId) check below is the tenant boundary.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const { sentVia, recipientEmail } = await request.json()

    // Update itinerary status to 'sent'
    const { data, error } = await supabase
      .from('itineraries')
      .update({
        status: 'sent',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) throw error

    // Log the send action (optional - you could create a sends table)
    // For now, we'll just update the main record

    return NextResponse.json({
      success: true,
      data,
      message: `Quote sent via ${sentVia}`
    })

  } catch (error) {
    console.error('Error updating itinerary status:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}