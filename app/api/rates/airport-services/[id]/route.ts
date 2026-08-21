// app/api/rates/airport-services/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { sanitizeRateUpdate } from '@/lib/rates/update-payload'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()
    const body = await request.json()

    // The form posts its whole state; '' on a uuid column is a 500, and the
    // client must not rewrite id/created_at. See lib/rates/update-payload.ts.
    const clean = sanitizeRateUpdate(body)
    if (!clean.ok) {
      return NextResponse.json(
        { success: false, error: clean.error, violations: clean.violations },
        { status: clean.status }
      )
    }

    const { data, error } = await supabase
      .from('airport_staff_rates')
      .update(clean.payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()

    const { error } = await supabase
      .from('airport_staff_rates')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}