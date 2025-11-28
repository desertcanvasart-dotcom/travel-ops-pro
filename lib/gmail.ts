import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

// Scopes for Gmail access
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
]

// Generate OAuth URL for user consent
export function getAuthUrl(state?: string) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state: state || '',
  })
}

// Exchange authorization code for tokens
export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string) {
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

// Get Gmail client with tokens
export function getGmailClient(accessToken: string, refreshToken: string) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// Get user's email address
export async function getUserEmail(accessToken: string) {
  oauth2Client.setCredentials({ access_token: accessToken })
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data } = await oauth2.userinfo.get()
  return data.email
}

// Fetch emails from inbox
export async function fetchEmails(
  accessToken: string,
  refreshToken: string,
  options: { maxResults?: number; query?: string; pageToken?: string } = {}
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const { maxResults = 20, query = '', pageToken } = options

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query,
    pageToken,
  })

  const messages = response.data.messages || []
  const nextPageToken = response.data.nextPageToken

  // Fetch full message details
  const fullMessages = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      })
      return parseEmailMessage(detail.data)
    })
  )

  return { messages: fullMessages, nextPageToken }
}

// Fetch single email by ID
export async function fetchEmail(
  accessToken: string,
  refreshToken: string,
  messageId: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })
  return parseEmailMessage(response.data)
}

// Send email
export async function sendEmail(
  accessToken: string,
  refreshToken: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)

  // Create email in RFC 2822 format
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ]
  const email = emailLines.join('\r\n')

  // Encode to base64url
  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail,
      threadId,
    },
  })

  return response.data
}

// Mark email as read
export async function markAsRead(
  accessToken: string,
  refreshToken: string,
  messageId: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'],
    },
  })
}

// Parse email message from Gmail API response
function parseEmailMessage(message: any) {
  const headers = message.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  // Get email body
  let body = ''
  if (message.payload?.body?.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
  } else if (message.payload?.parts) {
    const textPart = message.payload.parts.find(
      (p: any) => p.mimeType === 'text/html' || p.mimeType === 'text/plain'
    )
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
    }
  }

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body,
    labelIds: message.labelIds || [],
    isUnread: message.labelIds?.includes('UNREAD') || false,
  }
}