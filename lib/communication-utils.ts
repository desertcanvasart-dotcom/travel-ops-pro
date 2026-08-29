// Email and WhatsApp integration utilities

import { lookupServerMessage } from '@/lib/i18n/server-messages'
import type { RecipientLocale } from '@/lib/i18n/recipient-locale'
import { businessIdentity } from '@/lib/org-identity'

// The sender block on every customer email and WhatsApp message.
//
// This was a literal — including a named employee, their phone number and
// their company — so a second agency's emails were signed by somebody who does
// not work there. It now comes from the operator's own configuration, and
// every field is blank rather than borrowed when unset: an email signed with
// nothing is unfinished, an email signed with the wrong company is wrong.
//
// A function, not a constant: a constant is evaluated once at import and would
// freeze whatever the environment looked like at module load.
export function companyInfo(): {
  name: string
  title: string
  company: string
  email: string
  phone: string
  website: string
} {
  const identity = businessIdentity()
  return {
    // The individual signing. Optional — most operators sign as the company.
    name: (process.env.BUSINESS_CONTACT_NAME ?? '').trim(),
    title: (process.env.BUSINESS_CONTACT_TITLE ?? '').trim(),
    company: identity.name,
    email: identity.email,
    phone: identity.phone,
    website: identity.website,
  }
}

export function generateEmailTemplate(
  clientName: string,
  itineraryCode: string,
  tripName: string,
  totalCost: string,
  currency: string,
  locale: RecipientLocale = 'en'
): string {
  // Client-facing copy is localized to the recipient's language (email.itinerary.*).
  // Brand constants (COMPANY_INFO), colors and layout stay as-is.
  const t = (k: string, p: Record<string, string | number> = {}) =>
    lookupServerMessage(locale, `email.itinerary.${k}`, p)
  const info = companyInfo()
  return `
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .content {
      padding: 30px;
      background: #ffffff;
    }
    .highlight {
      background: #eff6ff;
      padding: 20px;
      border-left: 4px solid #2563eb;
      margin: 20px 0;
      border-radius: 4px;
    }
    .signature {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
    }
    .footer {
      background: #f9fafb;
      padding: 25px;
      text-align: center;
      border-radius: 0 0 8px 8px;
      border-top: 2px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">${t('heroTitle')}</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">${t('heroSubtitle')}</p>
  </div>

  <div class="content">
    <p>${t('greeting', { clientName: `<strong>${clientName}</strong>` })}</p>

    <p>${t('intro')}</p>

    <div class="highlight">
      <h3 style="margin-top: 0; color: #2563eb;">${t('detailsTitle')}</h3>
      <p><strong>${t('quoteRef')}</strong> ${itineraryCode}</p>
      <p><strong>${t('tour')}</strong> ${tripName}</p>
      <p><strong>${t('totalInvestment')}</strong> ${currency} ${totalCost}</p>
    </div>

    <p>${t('pdfIntro')}</p>

    <ul>
      <li>${t('bullet1')}</li>
      <li>${t('bullet2')}</li>
      <li>${t('bullet3')}</li>
      <li>${t('bullet4')}</li>
      <li>${t('bullet5')}</li>
    </ul>

    <p><strong>${t('ctaTitle')}</strong> ${t('cta')}</p>

    <p>${t('ctaDeposit')}</p>
    
    <div class="signature">
      <p style="margin: 5px 0;"><strong>${info.name}</strong></p>
      <p style="margin: 5px 0; color: #6b7280;">${info.title} | ${info.company}</p>
      <p style="margin: 5px 0;">✉️ ${info.email}</p>
      <p style="margin: 5px 0;">📞 ${info.phone}</p>
      <p style="margin: 5px 0;">🌍 ${info.website}</p>
    </div>
  </div>
  
  <div class="footer">
    <p style="color: #6b7280; font-size: 14px; margin: 0;">
      ${t('footerTagline')}
    </p>
    <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
      ${t('copyright', { year: new Date().getFullYear() })}
    </p>
  </div>
</body>
</html>
  `.trim()
}

export function generateWhatsAppMessage(
  clientName: string,
  tripName: string,
  totalCost: string,
  currency: string
): string {
  const info = companyInfo()
  return `Hi ${clientName}! 👋

Thank you for your interest in ${tripName}! 

I've prepared a complete itinerary for you with all the details, pricing, and inclusions.

💰 Total Investment: ${currency} ${totalCost}

✅ Everything is included:
- Professional guide
- Transportation
- Entrance fees
- Meals as mentioned
- All taxes and fees

The complete itinerary PDF has been sent to your email with day-by-day breakdown!

Ready to confirm? Just reply here or call me at ${info.phone} 📞

Looking forward to making your Egypt adventure unforgettable! 🇪🇬✨

Best regards,
${info.name}
${info.title}
${info.company}`
}

export function generateWhatsAppLink(phoneNumber: string, message: string): string {
  const cleanPhone = phoneNumber.replace(/\D/g, '')
  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`
}

export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '')
  
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('01')) {
      cleaned = '+20' + cleaned.substring(1)
    } else if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = '+20' + cleaned
    }
  }
  
  return cleaned.replace(/^\+/, '')
}
