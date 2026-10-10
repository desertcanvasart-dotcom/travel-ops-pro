import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export async function POST(request: NextRequest) {
  try {
    // Sent from the caller's org number — the test proves THAT number works.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      )
    }

    const result = await sendWhatsAppMessage({
      orgId,
      to: phone,
      body: `✅ Test message from Autoura\n\nYour WhatsApp integration is working correctly.\n\nSent at: ${new Date().toLocaleString()}`,
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        warning: result.warning,
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send test message' },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('WhatsApp test error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
