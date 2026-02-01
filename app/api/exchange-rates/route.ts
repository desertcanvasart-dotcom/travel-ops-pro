// ============================================
// EXCHANGE RATES API
// ============================================
// GET: Fetch current exchange rates
// POST: Convert amount between currencies
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchExchangeRates,
  convertCurrency,
  SUPPORTED_CURRENCIES
} from '@/lib/currency-service'

// GET - Fetch current exchange rates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const base = searchParams.get('base') || 'USD'

    // Validate base currency
    if (!SUPPORTED_CURRENCIES.includes(base as any)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported base currency: ${base}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`
        },
        { status: 400 }
      )
    }

    const rates = await fetchExchangeRates(base)

    return NextResponse.json({
      success: true,
      data: rates
    })
  } catch (error: any) {
    console.error('Exchange rates GET error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Convert amount between currencies
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, from, to } = body

    // Validate inputs
    if (typeof amount !== 'number' || isNaN(amount)) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400 }
      )
    }

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: 'Both "from" and "to" currencies are required' },
        { status: 400 }
      )
    }

    // Fetch rates with USD as base (most commonly used)
    const rates = await fetchExchangeRates('USD')

    // Perform conversion
    const convertedAmount = convertCurrency(amount, from, to, rates)

    return NextResponse.json({
      success: true,
      data: {
        originalAmount: amount,
        originalCurrency: from,
        convertedAmount: Math.round(convertedAmount * 100) / 100,
        targetCurrency: to,
        rate: convertedAmount / amount,
        rateDate: rates.date
      }
    })
  } catch (error: any) {
    console.error('Exchange rates POST error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
