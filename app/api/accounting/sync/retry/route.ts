import { NextRequest, NextResponse } from 'next/server'
import { retrySyncErrors } from '@/lib/accounting'

export async function POST(request: NextRequest) {
  try {
    const result = await retrySyncErrors()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Retry sync error:', error)
    return NextResponse.json(
      { error: 'Retry failed' },
      { status: 500 }
    )
  }
}
