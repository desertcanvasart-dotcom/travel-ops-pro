'use client'

// ============================================
// The traveller's messages, on the booking page
// ============================================
// A booking can hold more than one conversation: the shared one reached by a
// family link, and one private conversation per traveller in friends mode.
// They are shown separately and never merged — merging them would put a
// friend's private question in front of the whole party, which is the one
// thing the per-traveller links exist to prevent.
//
// Replying emails the traveller, because they are not sitting on the page
// waiting for it. The panel says whether that email actually went, rather than
// letting the operator assume.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare, Send, Mail, MailX } from 'lucide-react'

type Msg = {
  id: string
  sender: 'customer' | 'staff' | 'system'
  senderName: string | null
  body: string
  createdAt: string
}

type Thread = {
  id: string
  scope: 'booking' | 'traveller'
  travellerName: string | null
  unread: boolean
  messages: Msg[]
}

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

export default function PortalMessagesPanel({ bookingId }: { bookingId: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/portal-messages`)
      if (res.status === 403) { setForbidden(true); return }
      if (!res.ok) return
      setThreads((await res.json()).threads ?? [])
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => { load() }, [load])

  // The customer may write while the page is open.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') load() }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [load])

  const post = async (threadId: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/bookings/${bookingId}/portal-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, ...payload }),
    })
    return { ok: res.ok, json: await res.json().catch(() => ({})) }
  }

  const reply = async (thread: Thread) => {
    const body = (drafts[thread.id] || '').trim()
    if (!body) return
    setSending(thread.id)
    setNotice(null)
    try {
      const { ok, json } = await post(thread.id, { body })
      if (!ok) { setNotice(json.error || 'Could not send'); return }
      setDrafts(d => ({ ...d, [thread.id]: '' }))
      // Say plainly whether the traveller was told. A reply nobody knows about
      // is a reply that did not happen.
      setNotice(json.emailed
        ? 'Sent — the traveller has been emailed a link to read it.'
        : 'Sent, but no email went out (no address on file, or mail is not connected). They will only see it if they reopen their link.')
      await load()
    } finally {
      setSending(null)
    }
  }

  const markRead = async (thread: Thread) => {
    await post(thread.id, { markRead: true })
    await load()
  }

  if (forbidden) return null
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading messages…
      </div>
    )
  }
  // Nothing said yet: stay out of the way rather than showing an empty box on
  // every booking.
  if (!threads?.length) return null

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-[#647C47]" />
        Messages from travellers
        {threads.some(t => t.unread) && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">NEW</span>
        )}
      </h3>

      {notice && (
        <p className="text-xs mb-3 flex items-start gap-1.5 text-gray-600">
          {notice.startsWith('Sent —')
            ? <Mail className="w-3.5 h-3.5 mt-px shrink-0 text-[#647C47]" />
            : <MailX className="w-3.5 h-3.5 mt-px shrink-0 text-amber-600" />}
          {notice}
        </p>
      )}

      <div className="space-y-4">
        {threads.map(thread => (
          <div key={thread.id} className="border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
              <span className="text-xs font-medium text-gray-700">
                {thread.scope === 'booking'
                  ? 'Whole party'
                  : (thread.travellerName || 'Traveller') + ' — private'}
              </span>
              {thread.unread && (
                <button
                  type="button"
                  onClick={() => markRead(thread)}
                  className="ml-auto text-[11px] text-[#647C47] hover:underline"
                >
                  Mark read
                </button>
              )}
            </div>

            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {thread.messages.map(m => (
                <div
                  key={m.id}
                  className={`text-sm rounded-lg px-3 py-2 ${
                    m.sender === 'customer'
                      ? 'bg-gray-100 text-gray-900'
                      : m.sender === 'staff'
                        ? 'bg-[#647C47]/10 text-gray-900 ml-6'
                        : 'text-gray-500 italic text-xs border border-dashed border-gray-200'
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold text-gray-500">
                      {m.sender === 'customer' ? 'Traveller' : m.sender === 'staff' ? (m.senderName || 'You') : 'Automatic'}
                    </span>
                    <span className="text-[11px] text-gray-400">{when(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-gray-100">
              <textarea
                rows={2}
                value={drafts[thread.id] || ''}
                maxLength={4000}
                onChange={e => setDrafts(d => ({ ...d, [thread.id]: e.target.value }))}
                placeholder="Write a reply…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => reply(thread)}
                disabled={sending === thread.id || !(drafts[thread.id] || '').trim()}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6339] disabled:opacity-50"
              >
                {sending === thread.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
                Reply
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
