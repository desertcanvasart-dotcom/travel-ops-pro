// ============================================
// IN-APP NOTIFICATIONS — in-process creation
// ============================================
// Server code must NOT reach its own notification endpoint over HTTP. The
// /api/* auth gate in middleware.ts requires a session, and a server-to-server
// fetch has none, so the call comes back 401 and the notification is never
// created. app/api/itineraries/[id]/generate-tasks did exactly that, inside a
// try/catch that only console.error'd — so every "you have new tasks" alert has
// been silently dropped. Same failure mode as the internal-email bug fixed in
// PR #33; the fix is the same shape: one in-process helper both the route and
// server callers use.
//
// The HTTP route (app/api/notifications) is now a thin wrapper over this.

import { createClient } from '@supabase/supabase-js'
import { sendEmailInternal } from '@/lib/email-send'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type NotificationType =
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_completed'
  | 'trip_assigned'
  | 'whatsapp_assigned'
  | 'whatsapp_new_message'

export interface CreateNotificationInput {
  /** The login to notify — the normal address. */
  user_id?: string | null
  /** Legacy roster address; still honoured. One of the two is required. */
  team_member_id?: string | null
  type: NotificationType | string
  title: string
  message: string
  link?: string | null
  related_task_id?: string | null
  related_itinerary_id?: string | null
  /** Email is a courtesy on top of the in-app row; it never gates it. */
  send_email?: boolean
}

export interface CreateNotificationResult {
  success: boolean
  notification?: Record<string, unknown>
  /** True when an email went out. A false here is NOT a failed notification. */
  emailed: boolean
  error?: string
}

/**
 * Create one in-app notification, optionally emailing it too.
 *
 * The in-app row is the notification. Email is best-effort: a bounced or
 * unconfigured mailbox must not lose the alert the user sees in the app.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<CreateNotificationResult> {
  const {
    user_id = null,
    team_member_id = null,
    type,
    title,
    message,
    link = null,
    related_task_id = null,
    related_itinerary_id = null,
    send_email = true,
  } = input

  if (!user_id && !team_member_id) {
    return { success: false, emailed: false, error: 'user_id or team_member_id is required' }
  }

  const { data: notification, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id,
      team_member_id,
      type,
      title,
      message,
      link,
      related_task_id,
      related_itinerary_id,
      is_read: false,
      email_sent: false,
    })
    .select('*, team_member:team_members(id, name, email)')
    .single()

  if (error || !notification) {
    console.error('Failed to create notification:', error)
    return { success: false, emailed: false, error: error?.message || 'Insert failed' }
  }

  let recipient: { name?: string | null; email?: string | null } | undefined =
    (notification as { team_member?: { name?: string; email?: string } }).team_member ?? undefined
  if (send_email && !recipient?.email && user_id) {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('email, full_name')
      .eq('id', user_id)
      .maybeSingle()
    if (profile?.email) recipient = { email: profile.email, name: profile.full_name }
  }
  if (!send_email || !recipient?.email) {
    return { success: true, notification, emailed: false }
  }

  try {
    await sendNotificationEmail(
      recipient.email,
      recipient.name || 'there',
      title,
      message,
      link,
      String(type)
    )
    await supabaseAdmin.from('notifications').update({ email_sent: true }).eq('id', notification.id)
    return { success: true, notification, emailed: true }
  } catch (emailError) {
    // The in-app notification already exists and is what the user acts on.
    console.error('Notification email failed (in-app notification stands):', emailError)
    return { success: true, notification, emailed: false }
  }
}

/**
 * Notify several people about the same thing.
 *
 * One failing recipient must not stop the others — a mistyped address on one
 * team member should not silently cost a colleague their alert.
 */
export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<{ created: number; failed: number }> {
  const results = await Promise.allSettled(inputs.map(createNotification))
  let created = 0
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.success) created++
    else failed++
  }
  return { created, failed }
}

interface TypeStyle {
  color: string
  icon: string
  label: string
  buttonText: string
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  task_assigned: { color: '#647C47', icon: '📋', label: 'New Task Assigned', buttonText: 'View Task' },
  task_due_soon: { color: '#F59E0B', icon: '⏰', label: 'Task Due Soon', buttonText: 'View Task' },
  task_overdue: { color: '#EF4444', icon: '🚨', label: 'Task Overdue', buttonText: 'View Task' },
  task_completed: { color: '#10B981', icon: '✅', label: 'Task Completed', buttonText: 'View Task' },
  trip_assigned: { color: '#647C47', icon: '🗺️', label: 'Trip Assigned To You', buttonText: 'Open Trip' },
  whatsapp_assigned: { color: '#25D366', icon: '💬', label: 'WhatsApp Chat Assigned', buttonText: 'Open Chat' },
  whatsapp_new_message: { color: '#25D366', icon: '📱', label: 'New WhatsApp Message', buttonText: 'View Message' },
}

/** Escape user/DB-sourced text before it goes into the email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only allow same-app relative links through into the email button. */
function safeLink(link: string | null): string | null {
  if (!link) return null
  return link.startsWith('/') && !link.startsWith('//') ? link : null
}

export async function sendNotificationEmail(
  toEmail: string,
  toName: string,
  subject: string,
  message: string,
  link: string | null,
  type: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
  const config = TYPE_STYLES[type] || {
    color: '#647C47',
    icon: '🔔',
    label: 'Notification',
    buttonText: 'View',
  }
  const href = safeLink(link)

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="background-color: ${config.color}; padding: 24px; text-align: center;">
            <span style="font-size: 32px;">${config.icon}</span>
            <h1 style="color: white; margin: 12px 0 0 0; font-size: 20px; font-weight: 600;">${config.label}</h1>
          </div>

          <div style="padding: 24px;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 8px 0;">Hi ${escapeHtml(toName)},</p>
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px 0; white-space: pre-line;">${escapeHtml(message)}</p>

            ${href ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${baseUrl}${href}" style="display: inline-block; background-color: ${config.color}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
                  ${config.buttonText}
                </a>
              </div>
            ` : ''}

            ${type === 'whatsapp_assigned' ? `
              <div style="margin-top: 16px; padding: 12px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #25D366;">
                <p style="color: #166534; font-size: 13px; margin: 0;">
                  <strong>💡 Tip:</strong> Respond quickly to maintain good customer engagement!
                </p>
              </div>
            ` : ''}
          </div>

          <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
              This notification was sent from Autoura Operations System
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0 0; text-align: center;">
              <a href="${baseUrl}/notifications" style="color: #6b7280;">View all notifications</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  const result = await sendEmailInternal({
    to: toEmail,
    // Not escaped: this is a mail header, not HTML. Escaping here would put
    // literal &amp; into the subject line.
    subject: `[Autoura] ${subject}`,
    html: htmlContent,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to send email')
  }

  return result
}
