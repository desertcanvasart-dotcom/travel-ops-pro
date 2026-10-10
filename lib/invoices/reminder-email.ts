// ============================================
// The payment reminder email, in the client's language
// ============================================
// One builder for "Send selected / Send all" and the single "Send" on an
// invoice: the single send had its own English-only copy, so the same
// Japanese client got English or Japanese depending on the button pressed.

import { escapeHtml } from '@/lib/html-escape'
import { businessIdentity, htmlIdentity, type OrgIdentity } from '@/lib/org-identity'
import { lookupServerMessage } from '@/lib/i18n/server-messages'
import type { RecipientLocale } from '@/lib/i18n/recipient-locale'
import { formatMoney } from '@/lib/currency-totals'
import { businessToday } from '@/lib/today'
import { daysUntilDue } from '@/lib/invoices/reminder-schedule'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateReminderEmail(invoice: any, reminderType: string, locale: RecipientLocale = 'en', identity: OrgIdentity = businessIdentity()): { subject: string; html: string } {
  // The operator's own name, never a literal — this goes to their customer.
  const brand = htmlIdentity(identity)
  // Client-facing copy localized to the recipient's language (email.reminder.*).
  // Colors / layout stay in code; dates format per the recipient's locale.
  const t = (k: string, p: Record<string, string | number> = {}) =>
    lookupServerMessage(locale, `email.reminder.${k}`, p)
  const dateLocale = locale === 'ja' ? 'ja-JP' : 'en-GB'
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale, {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  // formatMoney knows each currency's symbol and decimals (¥110,000, not
  // "JPY110000.00").
  const balanceDue = formatMoney(Number(invoice.balance_due), invoice.currency)
  const totalAmount = formatMoney(Number(invoice.total_amount), invoice.currency)
  const dueDate = fmtDate(invoice.due_date)

  // Whole calendar days past due in the business's timezone (0 = due today).
  const daysOverdue = -daysUntilDue(invoice.due_date, businessToday())

  // Validate the stage key against the known set (else fall back to 'default'),
  // then pull localized subject + urgency copy. Color stays in code.
  const stage = ['before_due_7', 'before_due_3', 'on_due', 'overdue_7', 'overdue_14', 'overdue_30'].includes(reminderType)
    ? reminderType
    : 'default'
  const urgencyColors: Record<string, string> = {
    before_due_7: '#3b82f6', // blue
    before_due_3: '#f59e0b', // amber
    on_due: '#f59e0b', // amber
    overdue_7: '#ef4444', // red
    overdue_14: '#ef4444', // red
    overdue_30: '#dc2626', // dark red
    default: '#6b7280', // gray
  }
  const subject = t(`subject.${stage}`, { invoiceNumber: invoice.invoice_number })
  const urgencyMessage = t(`urgency.${stage}`, { days: daysOverdue })
  const urgencyColor = urgencyColors[stage]

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #647C47; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${brand.name}</h1>
            </td>
          </tr>
          
          <!-- Urgency Banner -->
          <tr>
            <td style="background-color: ${urgencyColor}; padding: 15px 40px;">
              <p style="margin: 0; color: #ffffff; font-size: 14px; text-align: center; font-weight: 500;">
                ${urgencyMessage}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${t('greeting', { clientName: escapeHtml(invoice.client_name) })}
              </p>

              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${t('intro')}
              </p>
              
              <!-- Invoice Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 25px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">${t('invoiceNumber')}</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #111827; font-size: 14px; font-weight: 600;">${escapeHtml(invoice.invoice_number)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">${t('invoiceDate')}</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #111827; font-size: 14px;">${fmtDate(invoice.issue_date)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">${t('dueDate')}</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: ${daysOverdue > 0 ? '#ef4444' : '#111827'}; font-size: 14px; font-weight: ${daysOverdue > 0 ? '600' : '400'};">${dueDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">${t('totalAmount')}</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #111827; font-size: 14px;">${totalAmount}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 15px; border-top: 1px solid #e5e7eb; margin-top: 10px;">
                          <table width="100%">
                            <tr>
                              <td style="padding-top: 10px;">
                                <span style="color: #111827; font-size: 16px; font-weight: 600;">${t('balanceDue')}</span>
                              </td>
                              <td style="padding-top: 10px; text-align: right;">
                                <span style="color: #ef4444; font-size: 20px; font-weight: 700;">${balanceDue}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${t('arrange')}
              </p>

              <!-- Payment Instructions -->
              ${invoice.payment_instructions ? `
              <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px 20px; margin-bottom: 30px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 5px; color: #166534; font-size: 14px; font-weight: 600;">${t('paymentInstructions')}</p>
                <p style="margin: 0; color: #15803d; font-size: 14px; line-height: 1.5; white-space: pre-line;">${escapeHtml(invoice.payment_instructions)}</p>
              </div>
              ` : ''}

              <p style="margin: 0 0 10px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${t('questions')}
              </p>

              <p style="margin: 30px 0 0; color: #374151; font-size: 16px; line-height: 1.6;">
                ${t('regards')}${brand.name ? `<br>
                <strong>${t('team', { company: brand.name })}</strong>` : ''}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 25px 40px; border-top: 1px solid #e5e7eb;">
              ${(() => {
                // Was "Travel2Egypt | Cairo, Egypt" in both catalogues — the
                // first operator's name and city on every agency's reminder.
                // Composed from their own identity now, and omitted entirely
                // when they have set none.
                const line = [brand.name, brand.address].filter(Boolean).join(' | ')
                return line ? `<p style="margin: 0 0 10px; color: #6b7280; font-size: 13px; text-align: center;">
                ${line}
              </p>` : ''
              })()}
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                ${t('footerAutomated')}
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  return { subject, html }
}

// GET: Fetch invoices due for reminders (preview)
