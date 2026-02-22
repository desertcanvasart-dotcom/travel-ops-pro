import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Admin client that bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET single client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update client
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Remove id from body to prevent update conflicts
    const { id: _, ...updateData } = body

    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PUT /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Partial update client
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Remove id from body to prevent update conflicts
    const { id: _, ...updateData } = body

    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper: safely delete or unlink records from a table by client_id
async function cleanupTable(
  table: string,
  clientId: string,
  mode: 'delete' | 'unlink' = 'delete'
): Promise<void> {
  try {
    if (mode === 'unlink') {
      const { error } = await supabaseAdmin
        .from(table)
        .update({ client_id: null })
        .eq('client_id', clientId)
      if (error) {
        console.warn(`Could not unlink ${table}, trying delete:`, error.message)
        // Fallback to delete
        const { error: delErr } = await supabaseAdmin
          .from(table)
          .delete()
          .eq('client_id', clientId)
        if (delErr) console.warn(`Could not delete ${table}:`, delErr.message)
      }
    } else {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('client_id', clientId)
      if (error) console.warn(`Could not delete from ${table}:`, error.message)
    }
  } catch (e) {
    // Table may not exist — ignore
    console.warn(`Cleanup ${table} skipped:`, e)
  }
}

// DELETE - Delete client
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Hard-block: check for itineraries (important business data)
    const { data: itineraries } = await supabaseAdmin
      .from('itineraries')
      .select('id')
      .eq('client_id', id)
      .limit(1)

    if (itineraries && itineraries.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete client with existing itineraries. Please delete or reassign itineraries first.' },
        { status: 400 }
      )
    }

    // Hard-block: check for invoices (financial data)
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('client_id', id)
      .limit(1)

    if (invoices && invoices.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete client with existing invoices. Please delete or reassign invoices first.' },
        { status: 400 }
      )
    }

    // Clean up WhatsApp: delete messages first, then conversations
    const { data: waConvs } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('client_id', id)

    if (waConvs && waConvs.length > 0) {
      await supabaseAdmin
        .from('whatsapp_messages')
        .delete()
        .in('conversation_id', waConvs.map(c => c.id))
    }

    // Clean up all related tables (delete or unlink as appropriate)
    // These run in parallel for speed — each is independent
    await Promise.allSettled([
      cleanupTable('follow_ups', id),
      cleanupTable('whatsapp_conversations', id),
      cleanupTable('client_preferences', id),
      cleanupTable('client_notes', id),
      cleanupTable('commissions', id, 'unlink'),
      cleanupTable('template_send_log', id, 'unlink'),
      cleanupTable('email_conversations', id, 'unlink'),
    ])

    // Now delete the client
    const { error } = await supabaseAdmin
      .from('clients')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting client:', error)

      // If there's STILL a FK constraint, log the detail for debugging
      if (error.code === '23503') {
        const detail = error.details || error.message
        console.error('FK constraint detail:', detail)
        return NextResponse.json(
          { error: `Cannot delete client: a related record still exists. Detail: ${detail}` },
          { status: 400 }
        )
      }

      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Client deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}