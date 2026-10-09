import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { visibleToOrg } from '@/lib/templates/template-scope'

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    // Only a template this org can see (its own or a shared default).
    const { data: visible } = await supabase
      .from('message_templates')
      .select('id')
      .eq('id', id)
      .or(visibleToOrg(orgId))
      .maybeSingle()
    if (!visible) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })

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