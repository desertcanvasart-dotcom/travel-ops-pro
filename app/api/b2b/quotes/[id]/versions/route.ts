import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all language versions for a quote
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('quote_versions')
      .select('*')
      .eq('quote_id', id)
      .order('language', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error) {
    console.error('Error fetching quote versions:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch versions',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST - Create a new language version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { language, ...content } = body

    if (!language || !['en', 'ja'].includes(language)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Check if version already exists
    const { data: existing } = await supabaseAdmin
      .from('quote_versions')
      .select('id')
      .eq('quote_id', id)
      .eq('language', language)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: `${language.toUpperCase()} version already exists` },
        { status: 409 }
      )
    }

    // If no title provided, try to copy from existing version or generate from quote
    let title = content.title
    if (!title) {
      // Try to get from another version
      const { data: otherVersion } = await supabaseAdmin
        .from('quote_versions')
        .select('title')
        .eq('quote_id', id)
        .neq('language', language)
        .limit(1)
        .single()

      if (otherVersion?.title) {
        title = otherVersion.title
      } else {
        // Fall back to quote number
        const { data: quote } = await supabaseAdmin
          .from('tour_quotes')
          .select('quote_number')
          .eq('id', id)
          .single()
        title = quote?.quote_number ? `Quote ${quote.quote_number}` : 'Untitled Quote'
      }
    }

    const { data, error } = await supabaseAdmin
      .from('quote_versions')
      .insert({
        quote_id: id,
        language,
        title,
        notes: content.notes || null,
        terms_conditions: content.terms_conditions || null,
        special_requests: content.special_requests || null,
        created_by: content.created_by || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error creating quote version:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create version',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
