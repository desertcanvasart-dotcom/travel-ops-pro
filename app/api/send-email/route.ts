import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { lookupServerMessage } from '@/lib/i18n/server-messages'
import { resolveClientLocaleByEmail, type RecipientLocale } from '@/lib/i18n/recipient-locale'
import { sendEmailInternal } from '@/lib/email-send'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      // Itinerary email fields
      itineraryId,
      clientName,
      clientEmail,
      itineraryCode,
      tripName,
      totalCost,
      currency,
      pdfBase64,
      // Generic email fields (used by cron/reminders)
      to,
      subject: customSubject,
      html: customHtml,
      // Optional explicit recipient locale (caller may pass it; otherwise we
      // resolve it from the client record below).
      locale: bodyLocale,
    } = body

    const recipientEmail = clientEmail || to
    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, error: 'Recipient email is required' },
        { status: 400 }
      )
    }

    // Tier 2: the email is written in the CLIENT's language, not the operator's.
    // Prefer an explicit locale from the caller; else resolve from
    // clients.preferred_language by email; else default 'en'. (The generic
    // reminder/cron path arrives pre-localized, so this only affects the
    // itinerary email composed below.)
    const recipientLocale: RecipientLocale =
      bodyLocale === 'ja' || bodyLocale === 'en'
        ? bodyLocale
        : await resolveClientLocaleByEmail(supabase, recipientEmail)

    // Determine subject and body
    let emailSubject: string
    let emailBody: string

    if (customSubject && customHtml) {
      // Generic email (reminders, cron, etc.)
      emailSubject = customSubject
      emailBody = customHtml
    } else if (clientName && itineraryCode && tripName) {
      // Itinerary email with PDF — output gate (harness Layer 2): never email a
      // non-deliverable price. (Generic reminder/cron emails carry no price.)
      const priceCheck = checkAmountDeliverable(totalCost, { currency })
      if (!priceCheck.ok) {
        return NextResponse.json(
          { success: false, error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
          { status: 422 }
        )
      }
      emailSubject = lookupServerMessage(recipientLocale, 'email.itinerary.subject', { tripName, itineraryCode })
      emailBody = generateEmailTemplate(clientName, itineraryCode, tripName, totalCost, currency, recipientLocale)
    } else {
      return NextResponse.json(
        { success: false, error: 'Missing email content parameters' },
        { status: 400 }
      )
    }

    // Delegate the actual send to the shared in-process helper (single Gmail
    // send path; also used directly by internal server-to-server callers that
    // can't fetch this gated route).
    const attachment = pdfBase64
      ? {
          filename:
            itineraryCode && clientName
              ? `${itineraryCode}_${clientName.replace(/\s+/g, '_')}.pdf`
              : 'itinerary.pdf',
          contentBase64: pdfBase64,
        }
      : undefined

    const result = await sendEmailInternal({
      to: recipientEmail,
      subject: emailSubject,
      html: emailBody,
      attachment,
    })

    if (!result.success) {
      // Gmail not connected / OAuth token invalid → 401 (a config problem the
      // caller should surface); anything else is a genuine 500.
      const status = result.noAccount || result.authError ? 401 : 500
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send email' },
        { status }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Email sent successfully'
    })

  } catch (error) {
    console.error('Error sending email:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
