import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, provider } = await request.json()

    if (!userId || !provider) {
      return NextResponse.json(
        { error: 'userId and provider are required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('accounting_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider)

    if (error) {
      console.error('Error disconnecting accounting:', error)
      return NextResponse.json(
        { error: 'Failed to disconnect' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Accounting disconnect error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
