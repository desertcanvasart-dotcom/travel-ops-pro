import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { GmailAuthError } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'

// GET /api/gmail/attachments?messageId=xxx&attachmentId=xxx&filename=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Derive the user from the session, never a client-supplied userId (IDOR).
    const userId = await getCurrentUserId()
    const messageId = searchParams.get('messageId')
    const attachmentId = searchParams.get('attachmentId')
    const filename = searchParams.get('filename') || 'attachment'

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!messageId || !attachmentId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Your own mailbox, else the organisation's shared one (lib/gmail-mailbox);
    // getAuthenticatedGmail underneath refreshes and stores the token.
    let gmail
    try {
      gmail = (await getMailboxGmail(userId)).gmail
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
      }
      throw err
    }

    // Get the attachment
    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId,
    })

    if (!attachment.data.data) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      )
    }

    // Decode base64url to base64, then to buffer
    const base64Data = attachment.data.data
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    
    const buffer = Buffer.from(base64Data, 'base64')

    // Determine content type from filename
    const contentType = getContentType(filename)

    // Return the file as a download
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.length.toString(),
      },
    })

  } catch (error: any) {
    console.error('Error downloading attachment:', error)
    return NextResponse.json(
      { error: clientMessage(error, 'Failed to download attachment') },
      { status: 500 }
    )
  }
}

function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || ''
  
  const mimeTypes: Record<string, string> = {
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'rtf': 'application/rtf',
    
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    
    // Audio/Video
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    
    // Code/Data
    'json': 'application/json',
    'xml': 'application/xml',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    
    // Other
    'eml': 'message/rfc822',
    'ics': 'text/calendar',
  }

  return mimeTypes[ext] || 'application/octet-stream'
}
