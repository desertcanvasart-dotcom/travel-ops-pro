'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  FileText, Search, Download, Trash2, Eye,
  Building2, Loader2, Plus, RefreshCw,
  CheckCircle2, Clock, XCircle, Send
} from 'lucide-react'
import { LanguageIndicator } from '@/components/multilingual'
import type { Language } from '@/types/multilingual'
import { useConfirm } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'

// ============================================
// B2B QUOTES LIST PAGE
// File: app/b2b/quotes/page.tsx
// ============================================

interface Quote {
  id: string
  quote_number: string
  client_name: string | null
  travel_date: string | null
  num_adults: number
  tour_leader_included: boolean
  selling_price: number
  price_per_person: number
  status: string
  created_at: string
  trip_name: string | null
  source: string | null
  tour_variations: {
    variation_name: string
    tour_templates: {
      template_name: string
    }
  } | null
  b2b_partners: {
    company_name: string
    partner_code: string
  } | null
  itineraries: {
    trip_name: string
    itinerary_code: string
    total_days: number
    tier: string
  } | null
  available_languages: Language[]
}

export default function QuotesListPage() {
  const { rateSymbol } = useCurrency()
  const t = useTranslations('b2bQuotes')
  const confirmDialog = useConfirm()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('')

  useEffect(() => {
    fetchQuotes()
  }, [statusFilter])

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const bulkDelete = async () => {
    const ids = [...selected]
    if (ids.length === 0 || !(await confirmDialog(`Delete ${ids.length} selected quote(s)? This cannot be undone.`))) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/b2b/quotes/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_ids: ids }),
      })
      const data = await res.json()
      if (data.success) {
        setSelected(new Set())
        await fetchQuotes()
      } else {
        alert(data.error || 'Bulk delete failed')
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkUpdateStatus = async () => {
    const ids = [...selected]
    if (ids.length === 0 || !bulkStatus) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/b2b/quotes/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_ids: ids, status: bulkStatus }),
      })
      const data = await res.json()
      if (data.success) {
        setSelected(new Set())
        setBulkStatus('')
        await fetchQuotes()
      } else {
        alert(data.error || 'Bulk update failed')
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const fetchQuotes = async () => {
    setLoading(true)
    try {
      let url = '/api/b2b/quotes?limit=100'
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`
      }
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setQuotes(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch quotes:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, quoteNumber: string) => {
    if (!(await confirmDialog(t('deleteConfirm', { quoteNumber })))) return
    
    setDeleting(id)
    try {
      const res = await fetch(`/api/b2b/quotes/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setQuotes(quotes.filter(q => q.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete quote:', err)
    } finally {
      setDeleting(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, label: t('statusDraft') },
      sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send, label: t('statusSent') },
      accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: t('statusAccepted') },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: t('statusRejected') },
      expired: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock, label: t('statusExpired') },
    }
    const style = styles[status] || styles.draft
    const Icon = style.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="w-3 h-3" />
        {style.label}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filteredQuotes = quotes.filter(quote => {
    const search = searchTerm.toLowerCase()
    return (
      quote.quote_number.toLowerCase().includes(search) ||
      quote.client_name?.toLowerCase().includes(search) ||
      quote.tour_variations?.tour_templates?.template_name.toLowerCase().includes(search) ||
      quote.trip_name?.toLowerCase().includes(search) ||
      quote.itineraries?.trip_name?.toLowerCase().includes(search) ||
      quote.b2b_partners?.company_name.toLowerCase().includes(search)
    )
  })

  const stats = {
    total: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => q.status === 'sent').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchQuotes} className="p-2 border rounded-lg hover:bg-gray-50" title={t('refresh')}>
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
          {/* A B2B quote starts from a tour variation (manage → calculator →
              save), so this deliberately opens the tour manager. The label
              says so — a button reading just "New Quote" that lands on the
              template manager reads as a wrong link (audit AUT-M04). */}
          <Link href="/tours/manage" title={t('newQuoteHint')} className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium text-sm">
            <Plus className="w-4 h-4" />{t('newQuote')}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">{t('statsTotal')}</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">{t('statsDraft')}</p>
          <p className="text-2xl font-bold text-gray-600">{stats.draft}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">{t('statsSent')}</p>
          <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500 mb-1">{t('statsAccepted')}</p>
          <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6 flex gap-4">
        <div className="flex-1 relative">
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('searchPlaceholder')} className="w-full pl-3 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 text-sm border rounded-lg bg-white">
          <option value="all">{t('allStatus')}</option>
          <option value="draft">{t('statusDraft')}</option>
          <option value="sent">{t('statusSent')}</option>
          <option value="accepted">{t('statusAccepted')}</option>
          <option value="rejected">{t('statusRejected')}</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-[#647C47]">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
          <div className="flex-1" />
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="px-3 py-1.5 text-sm border rounded-lg bg-white" disabled={bulkBusy}>
            <option value="">Set status…</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
          <button onClick={bulkUpdateStatus} disabled={bulkBusy || !bulkStatus} className="px-3 py-1.5 text-sm font-medium border border-[#647C47] text-[#647C47] rounded-lg hover:bg-[#647C47]/10 disabled:opacity-50">Apply</button>
          <button onClick={bulkDelete} disabled={bulkBusy} className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
            {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#647C47]" />
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{t('noQuotesFound')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={filteredQuotes.length > 0 && filteredQuotes.every((q) => selected.has(q.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(filteredQuotes.map((q) => q.id)) : new Set())}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">{t('tableQuote')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">{t('tableTour')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">{t('tableClientPartner')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">{t('tablePax')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">{t('tableTravelDate')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">{t('tablePrice')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">{t('tableLang')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">{t('tableStatus')}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">{t('tableActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredQuotes.map((quote) => (
                <tr key={quote.id} className={`hover:bg-gray-50 ${selected.has(quote.id) ? 'bg-[#647C47]/5' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Select ${quote.quote_number}`} checked={selected.has(quote.id)} onChange={() => toggleSelect(quote.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-sm font-medium text-[#647C47]">{quote.quote_number}</p>
                    <p className="text-xs text-gray-500">{formatDate(quote.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                      {quote.tour_variations?.tour_templates?.template_name
                        || quote.trip_name
                        || quote.itineraries?.trip_name
                        || t('unknown')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {quote.tour_variations?.variation_name
                        || (quote.source === 'whatsapp_b2b' ? '📱 WhatsApp Parsed' : '')}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {quote.client_name ? <p className="text-sm">{quote.client_name}</p> : <p className="text-sm text-gray-400 italic">{t('noClient')}</p>}
                    {quote.b2b_partners && <p className="text-xs text-blue-600 flex items-center gap-1"><Building2 className="w-3 h-3" />{quote.b2b_partners.company_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">{quote.num_adults}{quote.tour_leader_included && <span className="text-xs text-blue-500 ml-1">(+1)</span>}</td>
                  <td className="px-4 py-3 text-center text-sm">{quote.travel_date ? formatDate(quote.travel_date) : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-bold text-[#647C47]">{rateSymbol}{quote.selling_price?.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{rateSymbol}{quote.price_per_person?.toFixed(2)}{t('perPerson')}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <LanguageIndicator availableLanguages={quote.available_languages || []} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(quote.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/b2b/quotes/${quote.id}`} className="p-1.5 hover:bg-gray-100 rounded" title={t('view')}><Eye className="w-4 h-4 text-gray-500" /></Link>
                      <a href={`/api/b2b/quotes/${quote.id}/pdf`} target="_blank" className="p-1.5 hover:bg-red-50 rounded" title={t('pdf')}><Download className="w-4 h-4 text-red-500" /></a>
                      <button onClick={() => handleDelete(quote.id, quote.quote_number)} disabled={deleting === quote.id} className="p-1.5 hover:bg-red-50 rounded disabled:opacity-50" title={t('delete')}>
                        {deleting === quote.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}