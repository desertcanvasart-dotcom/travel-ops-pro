// ============================================
// API: /api/licence — what this install is licensed as
// ============================================
// The boot-time verification of LICENSE_KEY (lib/licence), for the Settings
// card. Authenticated like every /api/* route (middleware) — but carries no
// secret either way: the payload is public by design, the signature is not
// returned, and the key itself never leaves the server. Contrast /api/version,
// which is PUBLIC and must never carry the licensee.

import { NextResponse } from 'next/server'
import { getLicence } from '@/lib/licence'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { status, reason, daysLeft, licence } = getLicence()
  return NextResponse.json({
    success: true,
    data: {
      status,
      reason,
      daysLeft,
      licence,
      configured: Boolean(process.env.LICENSE_KEY?.trim()),
    },
  })
}
