'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Plus,
  Search,
  FileText,
  Filter,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  CircleDollarSign,
  XCircle,
  Loader2,
  ArrowLeft,
  Upload,
  Sparkles,
  FileImage,
} from 'lucide-react'

interface SupplierInvoice {
  id: string
  supplier_invoice_number: string
  internal_reference: string
  supplier_name: string
  invoice_date: string
  due_date?: string
  amount: number
  currency: string
  status: string
  match_status: string
  matched_amount: number
  discrepancy_amount: number
  description?: string
  document_url?: string
}

interface Summary {
  total: number
  total_amount: number
  received: number
  unmatched: number
  matched_pending: number
  approved: number
  paid: number
  disputed: number
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  received: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
  matched: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle },
  approved: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: CheckCircle },
  paid: { bg: 'bg-green-100', text: 'text-green-700', icon: CircleDollarSign },
  disputed: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-400', icon: XCircle },
}

const MATCH_STYLES: Record<string, { bg: string; text: string }> = {
  unmatched: { bg: 'bg-gray-100', text: 'text-gray-600' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  matched: { bg: 'bg-green-100', text: 'text-green-700' },
  discrepancy: { bg: 'bg-red-100', text: 'text-red-700' },
}

const CURRENCIES: Record<string, string> = { EUR: '\u20AC', USD: '$', GBP: '\u00A3', EGP: 'E\u00A3' }

export default function SupplierInvoicesPage() {
  const router = useRouter()
  const t = useTranslations('common')
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [matchFilter, setMatchFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Create form state
  const [formData, setFormData] = useState({
    supplier_invoice_number: '',
    supplier_name: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: '',
    currency: 'EUR',
    tax_amount: '',
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedConfidence, setParsedConfidence] = useState<Record<string, string> | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setParsing(true)
    setParseError(null)
    setParsedConfidence(null)

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/ai/parse-supplier-invoice', {
        method: 'POST',
        body: fd,
      })

      const result = await res.json()

      if (!result.success) {
        setParseError(result.error || 'Failed to parse document')
        return
      }

      const d = result.data
      setFormData({
        supplier_invoice_number: d.supplier_invoice_number || '',
        supplier_name: d.supplier_name || '',
        invoice_date: d.invoice_date || new Date().toISOString().split('T')[0],
        due_date: d.due_date || '',
        amount: d.total_amount ? String(d.total_amount) : '',
        currency: d.currency || 'EUR',
        tax_amount: d.tax_amount ? String(d.tax_amount) : '',
        description: d.description || '',
      })
      setParsedConfidence(d.confidence || null)
    } catch (err) {
      console.error('Parse error:', err)
      setParseError('Failed to process document. Please try again.')
    } finally {
      setParsing(false)
      // Reset file input
      e.target.value = ''
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [statusFilter, matchFilter])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (matchFilter) params.set('matchStatus', matchFilter)

      const res = await fetch(`/api/supplier-invoices?${params}`)
      const data = await res.json()
      setInvoices(data.data || [])
      setSummary(data.summary || null)
    } catch (error) {
      console.error('Error fetching supplier invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.supplier_invoice_number || !formData.supplier_name || !formData.amount) return
    setCreating(true)
    try {
      const res = await fetch('/api/supplier-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          tax_amount: formData.tax_amount ? parseFloat(formData.tax_amount) : 0,
        }),
      })
      if (res.ok) {
        setShowCreateModal(false)
        setFormData({
          supplier_invoice_number: '',
          supplier_name: '',
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: '',
          amount: '',
          currency: 'EUR',
          tax_amount: '',
          description: '',
        })
        fetchInvoices()
      }
    } catch (error) {
      console.error('Error creating supplier invoice:', error)
    } finally {
      setCreating(false)
    }
  }

  const filtered = invoices.filter(inv =>
    !searchTerm ||
    inv.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.supplier_invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.internal_reference?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplier Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Three-way matching: supplier invoice → expense → payment</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Supplier Invoice
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Unmatched</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{summary.unmatched}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Awaiting Approval</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{summary.matched_pending}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Paid</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{summary.paid}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by supplier or invoice number..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
        >
          <option value="">All Statuses</option>
          <option value="received">Received</option>
          <option value="matched">Matched</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="disputed">Disputed</option>
        </select>
        <select
          value={matchFilter}
          onChange={e => setMatchFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
        >
          <option value="">All Match Statuses</option>
          <option value="unmatched">Unmatched</option>
          <option value="partial">Partial</option>
          <option value="matched">Matched</option>
          <option value="discrepancy">Discrepancy</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No supplier invoices found</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Match</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(inv => {
                const statusStyle = STATUS_STYLES[inv.status] || STATUS_STYLES.received
                const matchStyle = MATCH_STYLES[inv.match_status] || MATCH_STYLES.unmatched
                const StatusIcon = statusStyle.icon

                return (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/supplier-invoices/${inv.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{inv.internal_reference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{inv.supplier_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">{inv.supplier_invoice_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">
                        {new Date(inv.invoice_date).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {CURRENCIES[inv.currency] || inv.currency}{Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                        <StatusIcon className="w-3 h-3" />
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${matchStyle.bg} ${matchStyle.text}`}>
                        {inv.match_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowCreateModal(false); setParseError(null); setParsedConfidence(null) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">New Supplier Invoice</h3>

            {/* Upload & Parse Zone */}
            <div className="mb-5">
              <label className={`flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                parsing
                  ? 'border-[#647C47] bg-[#647C47]/5'
                  : 'border-gray-200 hover:border-[#647C47] hover:bg-gray-50'
              }`}>
                {parsing ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 text-[#647C47] animate-spin" />
                      <Sparkles className="w-5 h-5 text-[#647C47]" />
                    </div>
                    <span className="text-sm font-medium text-[#647C47]">Reading invoice with AI...</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-gray-400">
                      <Upload className="w-5 h-5" />
                      <FileImage className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-gray-600">Upload PDF or photo to auto-fill</span>
                    <span className="text-xs text-gray-400">AI reads the invoice and fills the form below</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={handleFileUpload}
                  disabled={parsing}
                  className="hidden"
                />
              </label>

              {parseError && (
                <div className="mt-2 flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-600">{parseError}</span>
                </div>
              )}

              {parsedConfidence && (
                <div className="mt-2 flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <Sparkles className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700">
                    AI extracted data (confidence: {parsedConfidence.overall || 'medium'}). Review and edit below before saving.
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Invoice #</label>
                  <input
                    type="text"
                    value={formData.supplier_invoice_number}
                    onChange={e => setFormData(prev => ({ ...prev, supplier_invoice_number: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="e.g. INV-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Name</label>
                  <input
                    type="text"
                    value={formData.supplier_name}
                    onChange={e => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="Supplier name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={formData.invoice_date}
                    onChange={e => setFormData(prev => ({ ...prev, invoice_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={e => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={e => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="EGP">EGP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tax</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tax_amount}
                    onChange={e => setFormData(prev => ({ ...prev, tax_amount: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !formData.supplier_invoice_number || !formData.supplier_name || !formData.amount}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
