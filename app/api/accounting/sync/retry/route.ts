import { NextRequest, NextResponse } from 'next/server'
import { retrySyncErrors } from '@/lib/accounting'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const result = await retrySyncErrors(orgId)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Retry sync error:', error)
    return NextResponse.json(
      { error: 'Retry failed' },
      { status: 500 }
    )
  }
}
