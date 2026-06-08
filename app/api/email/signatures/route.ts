import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('email_signatures')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching signatures:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to load signatures') }, { status: 500 })
  }

  return NextResponse.json({ signatures: data })
}

export async function POST(request: NextRequest) {
  const { userId, name, content, isDefault } = await request.json()

  if (!userId || !name || !content) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await supabase
      .from('email_signatures')
      .update({ is_default: false })
      .eq('user_id', userId)
  }

  const { data, error } = await supabase
    .from('email_signatures')
    .insert({
      user_id: userId,
      name,
      content,
      is_default: isDefault || false,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating signature:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to create signature') }, { status: 500 })
  }

  return NextResponse.json({ signature: data })
}

export async function PUT(request: NextRequest) {
  const { id, userId, name, content, isDefault } = await request.json()

  if (!id || !userId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await supabase
      .from('email_signatures')
      .update({ is_default: false })
      .eq('user_id', userId)
  }

  const { data, error } = await supabase
    .from('email_signatures')
    .update({
      name,
      content,
      is_default: isDefault,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error updating signature:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to update signature') }, { status: 500 })
  }

  return NextResponse.json({ signature: data })
}

export async function DELETE(request: NextRequest) {
  const { id, userId } = await request.json()

  if (!id || !userId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('email_signatures')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('Error deleting signature:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to delete signature') }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}