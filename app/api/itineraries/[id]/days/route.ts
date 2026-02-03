import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get language from query params (default to 'en')
    const { searchParams } = new URL(request.url)
    const language = searchParams.get('language') || 'en'

    // Fetch all days for this itinerary
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', id)
      .order('day_number', { ascending: true })

    if (daysError) throw daysError

    // Fetch services and language versions for each day
    const daysWithServices = await Promise.all(
      (days || []).map(async (day) => {
        // Fetch services
        const { data: services, error: servicesError } = await supabase
          .from('itinerary_services')
          .select('*')
          .eq('itinerary_day_id', day.id)
          .order('created_at', { ascending: true })

        if (servicesError) {
          console.error('Error fetching services for day:', servicesError)
        }

        // Fetch language version for this day
        const { data: dayVersion } = await supabase
          .from('itinerary_day_versions')
          .select('title, description, city, overnight_city')
          .eq('itinerary_day_id', day.id)
          .eq('language', language)
          .single()

        // Merge version content with main day (version takes precedence)
        return {
          ...day,
          title: dayVersion?.title || day.title,
          description: dayVersion?.description || day.description,
          city: dayVersion?.city || day.city,
          overnight_city: dayVersion?.overnight_city || day.overnight_city,
          services: services || []
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: daysWithServices,
      language
    })
  } catch (error) {
    console.error('Error fetching itinerary days:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch itinerary days',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}