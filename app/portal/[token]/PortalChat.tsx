'use client'

// ============================================
// The traveller's conversation with the office
// ============================================
// Questions used to go to email or LINE, where the answer detached from the
// booking it was about. This puts them on the booking.
//
// The office hours line is always visible, not just in the automatic reply.
// Egypt and Japan are six or seven hours apart, so a traveller writing in the
// evening needs to know BEFORE they send that the answer comes tomorrow —
// otherwise silence reads as being ignored, at exactly the moment somebody is
// anxious about a passport or a payment.
//
// It polls rather than holding a live connection. Nothing else in this app uses
// realtime, and a booking conversation is not an instant-messaging product: a
// reply arriving within half a minute is indistinguishable from instant when
// the other party is in another timezone.

import { useCallback, useEffect, useRef, useState } from 'react'

interface ChatMessage {
  id: string
  sender: 'customer' | 'staff' | 'system'
  senderName: string | null
  body: string
  createdAt: string
}

const POLL_MS = 30_000

const stamp = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameDay ? time : `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
}

export default function PortalChat({ token }: { token: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hours, setHours] = useState<string | null>(null)
  const [officeOpen, setOfficeOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const url = `/api/portal/${token}/messages`

  const load = useCallback(async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const json = await res.json()
      setMessages(json.messages ?? [])
      setHours(json.hours ?? null)
      setOfficeOpen(Boolean(json.officeOpen))
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // Only while the tab is visible: a phone in a pocket should not poll.
    const tick = () => { if (document.visibilityState === 'visible') load() }
    const id = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [load])

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || '送信に失敗しました。')
        return
      }
      // The reply carries the sent message AND any automatic acknowledgement,
      // so the traveller sees the confirmation immediately rather than at the
      // next poll.
      setMessages(prev => [...prev, ...(json.messages ?? [])])
      setDraft('')
    } catch {
      setError('送信に失敗しました。通信状況をご確認ください。')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <p className="hint">読み込んでいます…</p>

  return (
    <div className="chat">
      <p className="hint">
        ご不明な点はこちらからお気軽にお尋ねください。
        {hours && (
          <>
            {' '}受付時間は <b>{hours}</b>（エジプト時間）です。
            {!officeOpen && ' ただいま営業時間外のため、次の営業時間内にご返信いたします。'}
          </>
        )}
      </p>

      {messages.length === 0 ? (
        <p className="chat-empty">まだメッセージはありません。</p>
      ) : (
        <ol className="chat-log">
          {messages.map(m => (
            <li key={m.id} className={`chat-msg ${m.sender}`}>
              {m.sender !== 'customer' && (
                <span className="chat-who">
                  {m.sender === 'staff' ? (m.senderName || '担当者') : 'システム'}
                </span>
              )}
              <span className="chat-body">{m.body}</span>
              <span className="chat-time">{stamp(m.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />

      {error && <p className="chat-error" role="alert">{error}</p>}

      <form className="chat-form" onSubmit={send}>
        <label className="f">
          <span>メッセージ</span>
          <textarea
            rows={3}
            value={draft}
            maxLength={4000}
            disabled={sending}
            placeholder="ご質問をご記入ください"
            onChange={e => setDraft(e.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={sending || !draft.trim()}>
          {sending ? '送信中…' : '送信する'}
        </button>
      </form>
    </div>
  )
}
