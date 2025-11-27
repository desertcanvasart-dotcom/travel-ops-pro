// ============================================
// API: SEND STATUS UPDATE VIA WHATSAPP
// ============================================
// POST /api/whatsapp/send-status
// Sends booking status updates to clients
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { sendStatusUpdate } from '@/lib/twilio-whatsapp'
import { createClient } from '@/app/supabase'

type BookingStatus = 'confirmed' | 'cancelled' | 'pending_payment' | 'paid' | 'completed'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      itineraryId,
      status,
      notes
    } = body

    // Validate required fields
    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'Status is required' },
        { status: 400 }
      )
    }

    // Validate status value
    const validStatuses: BookingStatus[] = ['confirmed', 'cancelled', 'pending_payment', 'paid', 'completed']
    if (!validStatuses.includes(status as BookingStatus)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Get itinerary details from database
    const supabase = createClient()
    const { data: itinerary, error: dbError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (dbError || !itinerary) {
      console.error('❌ Database error:', dbError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Check if client phone is available
    if (!itinerary.client_phone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found in itinerary' },
        { status: 400 }
      )
    }

    // Prepare status update data
    const updateData = {
      clientName: itinerary.client_name || 'Valued Client',
      clientPhone: itinerary.client_phone,
      itineraryId: itinerary.id,
      tourName: itinerary.tour_name || 'Egypt Tour',
      status: status as BookingStatus,
      notes: notes
    }

    console.log('📤 Sending status update via WhatsApp:', {
      to: itinerary.client_phone,
      itineraryId,
      status
    })

    // Send status update via WhatsApp
    const result = await sendStatusUpdate(updateData)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Update itinerary status in database
    await supabase
      .from('itineraries')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)

    // Log the status change
    await supabase
      .from('activity_logs')
      .insert({
        itinerary_id: itineraryId,
        action: 'status_update',
        description: `Status changed to: ${status}${notes ? `. Note: ${notes}` : ''}`,
        created_at: new Date().toISOString()
      })
      .select()
      .single()
      .catch(err => console.error('Failed to log activity:', err))

    console.log('✅ Status update sent successfully via WhatsApp:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Status update sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error sending status update:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// ============================================
// USAGE EXAMPLE
// ============================================
// 
// Frontend call:
// 
// const response = await fetch('/api/whatsapp/send-status', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({
//     itineraryId: '123e4567-e89b-12d3-a456-426614174000',
//     status: 'confirmed',
//     notes: 'Looking forward to your tour!' // Optional
//   })
// })
// 
// const data = await response.json()
// if (data.success) {
//   console.log('Status update sent!', data.messageId)
// }
// 
// ============================================
// AVAILABLE STATUSES:
// ============================================
// - 'confirmed'        → Booking confirmed
// - 'cancelled'        → Booking cancelled  
// - 'pending_payment'  → Awaiting payment
// - 'paid'             → Payment received
// - 'completed'        → Tour completed
// ============================================