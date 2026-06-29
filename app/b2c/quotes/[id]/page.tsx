'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Send, CheckCircle2, XCircle, Eye, Save, MessageCircle, Mail } from 'lucide-react'
import QuoteRevisions from '@/components/QuoteRevisions'

interface B2CQuote {
  id: string
  quote_number: string | null
  itinerary_id: string
  num_travelers: number
  tier: string | null
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  currency: string
  status: string
  valid_until: string | null
  sent_via: string | null
  sent_at: string | null
  internal_notes: string | null
  client_notes: string | null
  itineraries?: { id: string; trip_name: string | null; itinerary_code: string | null; client_name: string | null; client_email: string | null } | null
}

const STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
}

export default function B2CQuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [quote, setQuote] = useState<B2CQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [margin, setMargin] = useState(0)
  const [travelers, setTravelers] = useState(2)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/b2c/quotes/${id}`)
      const data = await res.json()
      if (data.success) {
        setQuote(data.data)
        setMargin(Number(data.data.margin_percent) || 0)
        setTravelers(Number(data.data.num_travelers) || 1)
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [id])

  const patch = async (body: any, reason: string) => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/b2c/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, change_reason: reason }),
      })
      const data = await res.json()
      if (data.success) await load()
      else setMsg(data.error || 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const send = async (channel: 'email' | 'whatsapp') => {
    setBusy(true)
    setMsg(null)
    try {
      const payload: any = { send_via: channel }
      if (channel === 'whatsapp') {
        const to = prompt('WhatsApp number (with country code):')
        if (!to) { setBusy(false); return }
        payload.to = to
      }
      const res = await fetch(`/api/b2c/quotes/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setMsg(data.success ? `Sent via ${channel}` : (data.error || 'Send failed'))
      if (data.success) await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#647C47]" /></div>
  if (!quote) return <div className="p-6 text-gray-500">Offer not found.</div>

  const money = (v: number) => `${quote.currency} ${Number(v).toFixed(2)}`

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/b2c/quotes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" /> B2C Quotes</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
            {quote.quote_number}
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS[quote.status] || STATUS.draft}`}>{quote.status}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {quote.itineraries?.trip_name || quote.itineraries?.itinerary_code}
            {quote.itineraries?.client_name ? ` · ${quote.itineraries.client_name}` : ''}
          </p>
        </div>
        <Link href={`/itineraries/${quote.itinerary_id}`} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"><Eye className="w-4 h-4" /> View itinerary</Link>
      </div>

      {msg && <p className="mb-4 text-sm text-[#647C47]">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Pricing */}
          <div className="bg-white rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Offer pricing</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-400">Total cost</span><p className="font-medium">{money(quote.total_cost)}</p></div>
              <div><span className="text-gray-400">Margin</span><p className="font-medium">{quote.margin_percent}% ({money(quote.margin_amount)})</p></div>
              <div><span className="text-gray-400">Selling price</span><p className="font-bold text-[#647C47]">{money(quote.selling_price)}</p></div>
              <div><span className="text-gray-400">Per person</span><p className="font-medium">{money(quote.price_per_person)} × {quote.num_travelers}</p></div>
            </div>

            {/* Re-price */}
            <div className="mt-5 border-t pt-4 flex flex-wrap items-end gap-3">
              <div><label className="block text-xs text-gray-500 mb-1">Travellers</label><input type="number" min={1} value={travelers} onChange={(e) => setTravelers(Number(e.target.value))} className="w-24 border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Margin %</label><input type="number" min={0} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="w-24 border rounded-lg px-3 py-2 text-sm" /></div>
              <button onClick={() => patch({ margin_percent: margin, num_travelers: travelers }, 'Re-priced')} disabled={busy} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50"><Save className="w-4 h-4" /> Re-price</button>
            </div>
          </div>

          {/* Client notes */}
          <div className="bg-white rounded-lg border p-5">
            <h3 className="font-semibold mb-2">Client notes</h3>
            <textarea defaultValue={quote.client_notes || ''} onBlur={(e) => { if (e.target.value !== (quote.client_notes || '')) patch({ client_notes: e.target.value }, 'Edited client notes') }} className="w-full border rounded-lg px-3 py-2 text-sm min-h-20" placeholder="Shown to the customer…" />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-5">
            <h3 className="font-semibold mb-3">Actions</h3>
            <div className="space-y-2">
              <button onClick={() => send('email')} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50"><Mail className="w-4 h-4" /> Send by email</button>
              <button onClick={() => send('whatsapp')} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-[#647C47] text-[#647C47] rounded-lg hover:bg-[#647C47]/10 disabled:opacity-50"><MessageCircle className="w-4 h-4" /> Send by WhatsApp</button>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => patch({ status: 'accepted' }, 'Marked accepted')} disabled={busy} className="inline-flex items-center justify-center gap-1 px-3 py-2 text-sm border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"><CheckCircle2 className="w-4 h-4" /> Accept</button>
                <button onClick={() => patch({ status: 'rejected' }, 'Marked rejected')} disabled={busy} className="inline-flex items-center justify-center gap-1 px-3 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"><XCircle className="w-4 h-4" /> Reject</button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg border p-4 text-sm">
            <p className="text-xs text-gray-500">Valid until</p>
            <p className="font-medium">{quote.valid_until || '—'}</p>
            {quote.sent_at && <p className="text-xs text-gray-400 mt-2">Sent via {quote.sent_via} on {new Date(quote.sent_at).toLocaleDateString()}</p>}
          </div>

          <QuoteRevisions quoteId={quote.id} basePath="/api/b2c/quotes" />
        </div>
      </div>
    </div>
  )
}
