import { NextResponse } from 'next/server'
import { supabase } from '@/app/supabase'

export async function GET() {
  try {
    // Fetch transportation rates
    const { data: transportRates, error: transportError } = await supabase
      .from('transportation_rates')
      .select('*')
      .eq('is_active', true)
      .order('city', { ascending: true })

    if (transportError) throw transportError

    // Fetch guide rates
    const { data: guideRates, error: guideError } = await supabase
      .from('guide_rates')
      .select('*')
      .eq('is_active', true)
      .order('city', { ascending: true })

    if (guideError) throw guideError

    // Fetch entrance fees
    const { data: entranceFees, error: entranceError } = await supabase
      .from('entrance_fees')
      .select('*')
      .eq('is_active', true)
      .order('city', { ascending: true })

    if (entranceError) throw entranceError

    return NextResponse.json({
      success: true,
      data: {
        transportation: transportRates,
        guides: guideRates,
        entrances: entranceFees
      }
    })
  } catch (error) {
    console.error('Error fetching rates:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rates' },
      { status: 500 }
    )
  }
}