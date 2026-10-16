// ============================================
// Settings › WhatsApp (/settings/whatsapp) — reading the two routes right
// ============================================
// The page sent { phoneNumber } to /api/whatsapp/test, which reads `phone`,
// so every test came back 400 "Phone number is required"; it rendered
// `message`, which neither answer has, so the user saw a red "Error" and no
// words; and its status list read `config`, which /api/whatsapp/status never
// returns, so the list was always empty. These are the shapes the routes
// actually speak, kept here so a test can hold the page to them.

/** What POST /api/whatsapp/test reads. */
export function whatsappTestBody(phone: string): { phone: string } {
  return { phone: phone.trim() }
}

/** POST /api/whatsapp/test answers { success, messageId, warning } or { success: false, error }. */
export function whatsappTestOutcome(json: unknown): { success: boolean; message: string } {
  const j = (json ?? {}) as { success?: boolean; error?: string; warning?: string }
  if (j.success) {
    return { success: true, message: j.warning || 'Test message sent. Check WhatsApp on that phone.' }
  }
  return { success: false, message: j.error || 'The test message could not be sent.' }
}

/** GET /api/whatsapp/status. */
export interface WhatsAppStatus {
  configured: boolean
  has_credentials: boolean
  has_number: boolean
  whatsapp_number: string
  features?: { auto_send: boolean; status_updates: boolean }
}

export interface StatusRow {
  label: string
  ok: boolean
  value: string
}

export function whatsappStatusRows(status: WhatsAppStatus | null): StatusRow[] {
  if (!status) return []
  return [
    {
      label: 'Twilio account (this installation)',
      ok: status.has_credentials,
      value: status.has_credentials ? 'Connected' : 'Not set up',
    },
    {
      label: "This company's WhatsApp number",
      ok: status.has_number,
      value: status.has_number ? status.whatsapp_number : 'Not assigned yet',
    },
    // features.auto_send is not listed: nothing reads ENABLE_WHATSAPP_AUTO_SEND.
    {
      // ENABLE_WHATSAPP_STATUS_UPDATES, read by sendStatusUpdate (lib/twilio-whatsapp).
      label: 'Booking status messages',
      ok: !!status.features?.status_updates,
      value: status.features?.status_updates ? 'On' : 'Off',
    },
  ]
}
