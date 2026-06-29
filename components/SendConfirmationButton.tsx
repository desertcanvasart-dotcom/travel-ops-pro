'use client'

import { useState } from 'react'
import { Send, Mail, MessageCircle, Loader2, Check } from 'lucide-react'

export default function SendConfirmationButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState<'email' | 'whatsapp' | null>(null)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const send = async (channel: 'email' | 'whatsapp') => {
    setSending(channel)
    setResult(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/send-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_via: channel }),
      })
      const json = await res.json()
      setResult(json.success
        ? { ok: true, msg: `Sent via ${channel} to ${json.to}` }
        : { ok: false, msg: json.error || 'Send failed' })
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || 'Send failed' })
    } finally {
      setSending(null)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); setResult(null) }}
        disabled={sending !== null}
        className="px-4 py-2 text-sm font-medium border border-[#647C47] text-[#647C47] rounded-lg hover:bg-[#e8ede3] transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Send confirmation
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <button onClick={() => send('email')} className="w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400" /> Via email
          </button>
          <button onClick={() => send('whatsapp')} className="w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-gray-400" /> Via WhatsApp
          </button>
        </div>
      )}

      {result && (
        <p className={`absolute left-0 top-full mt-1 text-xs whitespace-nowrap flex items-center gap-1 ${result.ok ? 'text-[#647C47]' : 'text-red-600'}`}>
          {result.ok && <Check className="w-3 h-3" />}{result.msg}
        </p>
      )}
    </div>
  )
}
