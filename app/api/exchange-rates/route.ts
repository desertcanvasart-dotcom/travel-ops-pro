// ============================================
// EXCHANGE RATES API
// ============================================
// GET: Fetch current exchange rates
// POST: Convert amount between currencies
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
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
      { success: false, error: clientMessage(error, 'Internal server error') },
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

    // M1: validate the requested currencies exist in the rate table — without
    // this an unknown code (e.g. "EURO" instead of "EUR") silently propagates
    // NaN through every downstream caller.
    if (from !== 'USD' && rates.rates[from] === undefined) {
      return NextResponse.json(
        { success: false, error: `Unsupported source currency: ${from}` },
        { status: 400 }
      )
    }
    if (to !== 'USD' && rates.rates[to] === undefined) {
      return NextResponse.json(
        { success: false, error: `Unsupported target currency: ${to}` },
        { status: 400 }
      )
    }

    // Perform conversion
    const convertedAmount = convertCurrency(amount, from, to, rates)

    // L1: compute the rate independently of `amount` so amount=0 doesn't
    // produce NaN. The reported rate is always 1 unit of `from` in `to`.
    const rate = convertCurrency(1, from, to, rates)

    // convertCurrency returns null when the pair cannot be resolved. Both codes
    // were validated above, so this needs an exhausted rate table to happen —
    // but 422 with no number beats returning a fabricated one.
    if (convertedAmount === null || rate === null) {
      return NextResponse.json(
        { success: false, error: `No exchange rate available for ${from} to ${to}` },
        { status: 422 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        originalAmount: amount,
        originalCurrency: from,
        convertedAmount: Math.round(convertedAmount * 100) / 100,
        targetCurrency: to,
        rate,
        rateDate: rates.date
      }
    })
  } catch (error: any) {
    console.error('Exchange rates POST error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
