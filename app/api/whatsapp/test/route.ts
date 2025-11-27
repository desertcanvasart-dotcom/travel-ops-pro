// ============================================
// API: TEST WHATSAPP CONNECTION
// ============================================
// POST /api/whatsapp/test
// Tests Twilio WhatsApp integration
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { testWhatsAppConnection, formatWhatsAppNumber } from '@/lib/twilio-whatsapp'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phoneNumber } = body

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      )
    }

    console.log('🧪 Testing WhatsApp connection to:', phoneNumber)

    // Test the connection
    const result = await testWhatsAppConnection(phoneNumber)

    if (result.success) {
      console.log('✅ WhatsApp test successful!')
      return NextResponse.json({
        success: true,
        message: result.message
      })
    } else {
      console.error('❌ WhatsApp test failed:', result.message)
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('❌ Error testing WhatsApp connection:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// GET endpoint to check configuration
export async function GET() {
  try {
    // Check if all required environment variables are set
    const config = {
      accountSid: !!process.env.TWILIO_ACCOUNT_SID,
      apiKey: !!process.env.TWILIO_API_KEY,
      apiSecret: !!process.env.TWILIO_API_SECRET,
      whatsappFrom: !!process.env.TWILIO_WHATSAPP_FROM,
      businessName: !!process.env.BUSINESS_NAME,
      autoSendEnabled: process.env.ENABLE_WHATSAPP_AUTO_SEND === 'true',
      statusUpdatesEnabled: process.env.ENABLE_WHATSAPP_STATUS_UPDATES === 'true'
    }

    const allConfigured = Object.entries(config)
      .filter(([key]) => !key.includes('Enabled'))
      .every(([_, value]) => value === true)

    return NextResponse.json({
      success: true,
      configured: allConfigured,
      config: {
        ...config,
        // Don't expose actual values, just whether they're set
        accountSid: config.accountSid ? '✅ Set' : '❌ Missing',
        apiKey: config.apiKey ? '✅ Set' : '❌ Missing',
        apiSecret: config.apiSecret ? '✅ Set' : '❌ Missing',
        whatsappFrom: config.whatsappFrom ? process.env.TWILIO_WHATSAPP_FROM : '❌ Missing',
        businessName: config.businessName ? process.env.BUSINESS_NAME : '❌ Missing',
        autoSendEnabled: config.autoSendEnabled ? '✅ Enabled' : '⚠️ Disabled',
        statusUpdatesEnabled: config.statusUpdatesEnabled ? '✅ Enabled' : '⚠️ Disabled'
      },
      message: allConfigured 
        ? 'WhatsApp integration is fully configured!' 
        : 'Some configuration is missing. Check the config object above.'
    })

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// ============================================
// USAGE EXAMPLES
// ============================================
// 
// Test connection (send test message):
// 
// const response = await fetch('/api/whatsapp/test', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({
//     phoneNumber: '+201234567890' // Your phone number
//   })
// })
// 
// Check configuration:
// 
// const response = await fetch('/api/whatsapp/test')
// const data = await response.json()
// console.log(data.config) // Shows which env vars are set
// 
// ============================================