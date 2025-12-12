import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Track template usage
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Increment usage count
    const { error } = await supabase.rpc('increment_template_usage', { template_id: id })

    // Fallback if RPC doesn't exist
    if (error) {
      await supabase
        .from('message_templates')
        .update({ 
          usage_count: supabase.rpc('increment', { x: 1 }),
          last_used_at: new Date().toISOString()
        })
        .eq('id', id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Template use tracking error:', error)
    return NextResponse.json({ success: true }) // Don't fail on tracking error
  }
}