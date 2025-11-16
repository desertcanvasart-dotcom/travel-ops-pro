// Email and WhatsApp integration utilities

export const COMPANY_INFO = {
  name: 'Islam Mohamed',
  title: 'Travel Consultant',
  company: 'Travel2Egypt.org',
  email: 'info@travel2egypt.org',
  phone: '+20 115 801 1600',
  website: 'www.travel2egypt.org'
}

export function generateEmailTemplate(
  clientName: string,
  itineraryCode: string,
  tripName: string,
  totalCost: string,
  currency: string
): string {
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
    <h1 style="margin: 0;">🌟 Your Egypt Adventure Awaits!</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">Professional Itinerary & Quote</p>
  </div>
  
  <div class="content">
    <p>Dear <strong>${clientName}</strong>,</p>
    
    <p>Thank you for your interest in exploring the wonders of Egypt! We're excited to present your personalized itinerary.</p>
    
    <div class="highlight">
      <h3 style="margin-top: 0; color: #2563eb;">📋 Your Trip Details</h3>
      <p><strong>Quote Reference:</strong> ${itineraryCode}</p>
      <p><strong>Tour:</strong> ${tripName}</p>
      <p><strong>Total Investment:</strong> ${currency} ${totalCost}</p>
    </div>
    
    <p>Please find your complete itinerary attached as a PDF. This includes:</p>
    
    <ul>
      <li>✅ Detailed day-by-day schedule</li>
      <li>✅ All services and inclusions</li>
      <li>✅ Complete pricing breakdown</li>
      <li>✅ Payment and cancellation terms</li>
      <li>✅ Contact information</li>
    </ul>
    
    <p><strong>Ready to confirm your booking?</strong> We're here to make your Egypt dreams come true! Our team is available to answer any questions and assist with your reservation.</p>
    
    <p>To confirm your booking, simply reply to this email or contact us directly via WhatsApp or phone. A 30% deposit secures your adventure!</p>
    
    <div class="signature">
      <p style="margin: 5px 0;"><strong>${COMPANY_INFO.name}</strong></p>
      <p style="margin: 5px 0; color: #6b7280;">${COMPANY_INFO.title} | ${COMPANY_INFO.company}</p>
      <p style="margin: 5px 0;">✉️ ${COMPANY_INFO.email}</p>
      <p style="margin: 5px 0;">📞 ${COMPANY_INFO.phone}</p>
      <p style="margin: 5px 0;">🌍 ${COMPANY_INFO.website}</p>
    </div>
  </div>
  
  <div class="footer">
    <p style="color: #6b7280; font-size: 14px; margin: 0;">
      We look forward to showing you the wonders of Egypt! 🇪🇬✨
    </p>
    <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
      © ${new Date().getFullYear()} Travel2Egypt.org - Creating Unforgettable Memories
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

Ready to confirm? Just reply here or call me at ${COMPANY_INFO.phone} 📞

Looking forward to making your Egypt adventure unforgettable! 🇪🇬✨

Best regards,
${COMPANY_INFO.name}
${COMPANY_INFO.title}
${COMPANY_INFO.company}`
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
