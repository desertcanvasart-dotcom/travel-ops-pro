'use client'

// What a WhatsApp message carries besides text: a photo or video shows, a
// voice note or audio plays, anything else is a link with its own name, and
// each has a Download link that saves it under its own name. Every file loads
// through /api/whatsapp/media/[id], which checks the viewer's company before
// handing it over. Ported from autoura-saas #819.

import { Download, FileText, Mic } from 'lucide-react'
import { labelFor } from '@/lib/whatsapp/attachments'

export interface MediaMessage {
  id: string
  direction?: string
  media_type?: string | null
  media_url?: string | null
  media_storage_path?: string | null
  /** The file's own name (migration 20270121), when it has one. */
  media_filename?: string | null
}

/** Files the media route can serve: ours in storage, or Twilio-hosted media. */
function viaMediaRoute(m: MediaMessage): boolean {
  return Boolean(m.media_storage_path) || Boolean(m.media_url?.startsWith('https://api.twilio.com/'))
}

export function hasMedia(m: MediaMessage): boolean {
  return Boolean(m.media_storage_path || m.media_url)
}

/** A short label for lists and previews: "Voice message", "Photo", … */
export function mediaLabel(mediaType: string | null | undefined): string {
  const t = mediaType || ''
  if (t.startsWith('audio/ogg')) return 'Voice message'
  if (t.startsWith('image/')) return 'Photo'
  if (t.startsWith('video/')) return 'Video'
  return labelFor(t)
}

function DownloadLink({ message }: { message: MediaMessage }) {
  if (!viaMediaRoute(message)) return null
  return (
    <a href={`/api/whatsapp/media/${message.id}?download=1`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-700 hover:underline">
      <Download className="w-3.5 h-3.5" aria-hidden /> Download
    </a>
  )
}

export default function MessageMedia({ message }: { message: MediaMessage }) {
  if (!hasMedia(message)) return null
  const type = message.media_type || ''
  // Another host's link (an app PDF sent from a document page) opens as it is.
  const src = viaMediaRoute(message) ? `/api/whatsapp/media/${message.id}` : message.media_url!

  if (type.startsWith('audio/')) {
    return (
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Mic className="w-4 h-4 shrink-0 text-gray-500" aria-hidden />
        <audio controls preload="metadata" src={src} className="h-10 w-64 max-w-full" aria-label={mediaLabel(type)} />
        <DownloadLink message={message} />
      </div>
    )
  }
  if (type.startsWith('image/')) {
    return (
      <div className="mb-1">
        <a href={src} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, per-view file, not a static asset */}
          <img src={src} alt={message.media_filename || 'Photo'} loading="lazy" className="max-h-64 max-w-full rounded-md" />
        </a>
        <DownloadLink message={message} />
      </div>
    )
  }
  if (type.startsWith('video/')) {
    return (
      <div className="mb-1">
        <video controls preload="metadata" src={src} className="max-h-64 max-w-full rounded-md" />
        <DownloadLink message={message} />
      </div>
    )
  }
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
        <FileText className="w-4 h-4 shrink-0" aria-hidden />
        <span className="break-all">{message.media_filename || `Open ${mediaLabel(type).toLowerCase()}`}</span>
      </a>
      <DownloadLink message={message} />
    </div>
  )
}
