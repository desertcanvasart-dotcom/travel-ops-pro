'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, Loader2, Plus, Eye, Trash2, X, Users, Clock, Send, CheckCircle2, XCircle } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'

interface B2CQuote {
  id: string
  quote_number: string | null
  num_travelers: number
  selling_price: number
  price_per_person: number
  currency: string
  status: string
  valid_until: string | null
  created_at: string
  itineraries?: { id: string; trip_name: string | null; itinerary_code: string | null; client_name: string | null } | null
}

interface ItineraryLite { id: string; trip_name: string | null; itinerary_code: string | null; total_cost: number | null }

const STATUS: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, label: 'Draft' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send, label: 'Sent' },
  accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: 'Accepted' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Rejected' },
  expired: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock, label: 'Expired' },
}

export default function B2CQuotesPage() {
  const confirmDialog = useConfirm()
  const [quotes, setQuotes] = useState<B2CQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchQuotes = async () => {
    setLoading(true)
    try {
      let url = '/api/b2c/quotes?limit=100'
      if (statusFilter !== 'all') url += `&status=${statusFilter}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) setQuotes(data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchQuotes() }, [statusFilter])

  const remove = async (id: string) => {
    if (!(await confirmDialog('Delete this offer? This cannot be undone.'))) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/b2c/quotes/${id}`, { method: 'DELETE' })
      if ((await res.json()).success) setQuotes((qs) => qs.filter((q) => q.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const badge = (status: string) => {
    const s = STATUS[status] || STATUS.draft
    const Icon = s.icon
    return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}><Icon className="w-3 h-3" />{s.label}</span>
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center"><FileText className="h-5 w-5 text-[#647C47]" /></div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">B2C Quotes</h1>
            <p className="text-sm text-gray-500">Priced offers issued to direct customers from an itinerary</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238]">
          <Plus className="w-4 h-4" /> New offer
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border rounded-lg bg-white">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#647C47]" /></div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No B2C offers yet.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Offer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Itinerary</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Pax</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Price</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Valid</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotes.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-mono text-sm font-medium text-[#647C47]">{q.quote_number}</p>
                    <p className="text-xs text-gray-500">{new Date(q.created_at).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900 truncate max-w-[220px]">{q.itineraries?.trip_name || q.itineraries?.itinerary_code || '—'}</p>
                    {q.itineraries?.client_name && <p className="text-xs text-gray-500">{q.itineraries.client_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-center text-sm"><span className="inline-flex items-center gap-1"><Users className="w-3 h-3 text-gray-400" />{q.num_travelers}</span></td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-bold text-[#647C47]">{q.currency} {Number(q.selling_price).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{q.currency} {Number(q.price_per_person).toFixed(2)} pp</p>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">{q.valid_until || '—'}</td>
                  <td className="px-4 py-3 text-center">{badge(q.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/b2c/quotes/${q.id}`} className="p-1.5 hover:bg-gray-100 rounded" title="View"><Eye className="w-4 h-4 text-gray-500" /></Link>
                      <button onClick={() => remove(q.id)} disabled={deleting === q.id} className="p-1.5 hover:bg-red-50 rounded disabled:opacity-50" title="Delete">
                        {deleting === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchQuotes() }} />}
    </div>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [itineraries, setItineraries] = useState<ItineraryLite[]>([])
  const [itineraryId, setItineraryId] = useState('')
  const [numTravelers, setNumTravelers] = useState(2)
  const [marginPercent, setMarginPercent] = useState(25)
  const [validDays, setValidDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/itineraries?limit=100')
      .then((r) => r.json())
      .then((d) => { if (d.success || d.data) setItineraries(d.data || d.itineraries || []) })
      .catch(() => {})
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itineraryId) { setError('Pick an itinerary'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/b2c/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary_id: itineraryId, num_travelers: numTravelers, margin_percent: marginPercent, valid_days: validDays }),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Failed to create offer'); return }
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#647C47]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">New B2C offer</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Itinerary</label>
            <select className={input} value={itineraryId} onChange={(e) => setItineraryId(e.target.value)}>
              <option value="">Select an itinerary…</option>
              {itineraries.map((it) => (
                <option key={it.id} value={it.id}>{it.trip_name || it.itinerary_code || it.id}{it.total_cost != null ? ` — cost ${it.total_cost}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">Travellers</label><input type="number" min={1} className={input} value={numTravelers} onChange={(e) => setNumTravelers(Number(e.target.value))} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Margin %</label><input type="number" min={0} className={input} value={marginPercent} onChange={(e) => setMarginPercent(Number(e.target.value))} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Valid (days)</label><input type="number" min={1} className={input} value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} /></div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50 inline-flex items-center gap-1">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create offer
          </button>
        </div>
      </form>
    </div>
  )
}
