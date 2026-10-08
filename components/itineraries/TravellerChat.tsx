'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, MessageCircle } from 'lucide-react'

// ============================================
// TRAVELLER CHAT — the office side of the trip thread
// ============================================
// The same thread the traveller sees on the share page. Replies go out under
// the team member's own name. The traveller's messages are marked read when
// the thread is actually in view (or on reply), not when the page loads.
// Refreshes while the page is open, like the live log. A traveller message
// whose office notification reached nobody is marked, so a silent channel is
// noticed here. Ported from autoura-saas (app/components/TravellerChat.tsx).

interface TripMessage {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  sender_name: string | null
  is_read: boolean
  created_at: string
  notify_outcome?: string | null
}

/** Outcomes that mean nobody was told. */
const NOT_NOTIFIED = new Set(['failed', 'not_configured', 'no_recipients'])
const POLL_MS = 30000

export default function TravellerChat({ itineraryId }: { itineraryId: string }) {
  const t = useTranslations('itineraries.detail.chat')
  const [messages, setMessages] = useState<TripMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the last reply reached the traveller by email, and if not, why.
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/messages`)
      const data = await res.json()
      if (res.ok && data.success) setMessages(data.messages)
    } catch {
      // Polling — a failed cycle just waits for the next one.
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => {
    fetchMessages()
    const id = setInterval(fetchMessages, POLL_MS)
    return () => clearInterval(id)
  }, [fetchMessages])

  // Read when a person sees the thread: once it is half in view.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const markedRef = useRef(false)
  const markRead = useCallback(() => {
    if (markedRef.current) return
    markedRef.current = true
    fetch(`/api/itineraries/${itineraryId}/messages`, { method: 'PATCH' }).catch(() => { markedRef.current = false })
  }, [itineraryId])
  const unread = messages.some(m => m.direction === 'inbound' && !m.is_read)
  useEffect(() => {
    // A new traveller message after the last mark is read again on the next view.
    if (unread) markedRef.current = false
  }, [unread])
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined' || !unread) return
    const obs = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) markRead() }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [markRead, unread])

  const send = async () => {
    if (sending || !draft.trim()) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || t('sendFailed'))
      setMessages(prev => [...prev, data.message])
      setDraft('')
      if (data.notified) {
        setNotice(data.emailed
          ? { ok: true, text: t('emailed') }
          : data.notified === 'grouped'
            // Replies close together share one email (lib/trip-chat/notify-traveller).
            ? { ok: true, text: t('emailedGrouped', { time: data.emailedAt ? fmtTime(data.emailedAt) : '' }) }
            : { ok: false, text: t(`notEmailed_${String(data.notified).replace('-', '_')}`) })
      }
      markRead() // replying is reading
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sendFailed'))
    } finally {
      setSending(false)
    }
  }

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div ref={rootRef} className="bg-white rounded-lg border border-gray-200 shadow-sm" data-testid="traveller-chat">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <MessageCircle className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
        <span className="text-xs text-gray-400">{t('subtitle')}</span>
      </div>

      <div className="px-4 py-3 max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}</div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">{t('empty')}</p>
        ) : (
          <ol className="space-y-2">
            {messages.map(m => (
              <li key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.direction === 'outbound' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  <p className="whitespace-pre-line break-words">{m.content}</p>
                  <p className={`mt-1 text-[10px] ${m.direction === 'outbound' ? 'text-white/70' : 'text-gray-500'}`}>
                    {m.sender_name ? `${m.sender_name} · ` : ''}{fmtTime(m.created_at)}
                    {m.direction === 'inbound' && m.notify_outcome && NOT_NOTIFIED.has(m.notify_outcome) && (
                      <span className="ml-1 text-amber-600" title={t(`notify_${m.notify_outcome}`)}>⚠ {t('notNotified')}</span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
            maxLength={2000}
            placeholder={t('placeholder')}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button onClick={send} disabled={sending || !draft.trim()} className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40">
            {sending ? t('sending') : t('send')}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {notice && (
          <p className={`mt-2 text-xs ${notice.ok ? 'text-green-700' : 'text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1'}`} data-testid="chat-email-notice">
            {notice.ok ? '✓ ' : '⚠ '}{notice.text}
          </p>
        )}
      </div>
    </div>
  )
}
