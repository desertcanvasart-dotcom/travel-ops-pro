'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import {
  ArrowLeft,
  FileText,
  Upload,
  Link2,
  CheckCircle,
  AlertTriangle,
  CircleDollarSign,
  Clock,
  XCircle,
  Loader2,
  Trash2,
  Download,
  Search,
  X,
} from 'lucide-react'

const CURRENCIES: Record<string, string> = { EUR: '\u20AC', USD: '$', GBP: '\u00A3', EGP: 'E\u00A3', JPY: '\u00A5' }

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  received: { bg: 'bg-gray-100', text: 'text-gray-700' },
  matched: { bg: 'bg-blue-100', text: 'text-blue-700' },
  approved: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  paid: { bg: 'bg-green-100', text: 'text-green-700' },
  disputed: { bg: 'bg-red-100', text: 'text-red-700' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-400' },
}

const MATCH_STYLES: Record<string, { bg: string; text: string }> = {
  unmatched: { bg: 'bg-gray-100', text: 'text-gray-600' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  matched: { bg: 'bg-green-100', text: 'text-green-700' },
  discrepancy: { bg: 'bg-red-100', text: 'text-red-700' },
}

interface MatchedExpense {
  id: string
  expense_id: string
  matched_amount: number
  expense: {
    id: string
    expense_number: string
    category: string
    supplier_name: string
    amount: number
    currency: string
    expense_date: string
    status: string
  }
}

export default function SupplierInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const [invoice, setInvoice] = useState<Record<string, unknown> | null>(null)
  const [matchedExpenses, setMatchedExpenses] = useState<MatchedExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Match modal state
  const [availableExpenses, setAvailableExpenses] = useState<Array<Record<string, unknown>>>([])
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set())
  const [expenseSearch, setExpenseSearch] = useState('')
  const [loadingExpenses, setLoadingExpenses] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [id])

  const fetchInvoice = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/supplier-invoices/${id}`)
      const data = await res.json()
      setInvoice(data)
      setMatchedExpenses(data.matched_expenses || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setActionLoading('approve')
    try {
      const res = await fetch(`/api/supplier-invoices/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      })
      if (res.ok) fetchInvoice()
    } finally {
      setActionLoading(null)
    }
  }

  const handlePay = async () => {
    const method = prompt('Payment method (e.g. bank_transfer, cash):')
    if (!method) return
    const ref = prompt('Payment reference (optional):') || ''

    setActionLoading('pay')
    try {
      const res = await fetch(`/api/supplier-invoices/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method, payment_reference: ref }),
      })
      if (res.ok) fetchInvoice()
    } finally {
      setActionLoading(null)
    }
  }

  const handleDispute = async () => {
    const reason = prompt('Dispute reason:')
    if (!reason) return

    setActionLoading('dispute')
    try {
      await fetch(`/api/supplier-invoices/${id}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      fetchInvoice()
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this supplier invoice?')) return
    await fetch(`/api/supplier-invoices/${id}`, { method: 'DELETE' })
    router.push('/supplier-invoices')
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/supplier-invoices/${id}/upload`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) fetchInvoice()
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveExpense = async (expenseId: string) => {
    await fetch(`/api/supplier-invoices/${id}/match`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenseId }),
    })
    fetchInvoice()
  }

  // Match modal functions
  const openMatchModal = async () => {
    setShowMatchModal(true)
    setLoadingExpenses(true)
    try {
      const res = await fetch('/api/expenses?status=pending')
      const data = await res.json()
      // Filter by supplier name if possible
      const supplierName = invoice?.supplier_name as string
      const filtered = Array.isArray(data) ? data : []
      setAvailableExpenses(
        supplierName
          ? filtered.filter((e: Record<string, unknown>) =>
              String(e.supplier_name || '').toLowerCase().includes(supplierName.toLowerCase())
            ).concat(
              filtered.filter((e: Record<string, unknown>) =>
                !String(e.supplier_name || '').toLowerCase().includes(supplierName.toLowerCase())
              )
            )
          : filtered
      )
    } finally {
      setLoadingExpenses(false)
    }
  }

  const handleConfirmMatch = async () => {
    if (selectedExpenses.size === 0) return
    setActionLoading('match')
    try {
      await fetch(`/api/supplier-invoices/${id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseIds: Array.from(selectedExpenses) }),
      })
      setShowMatchModal(false)
      setSelectedExpenses(new Set())
      fetchInvoice()
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-6 text-center text-gray-500">Supplier invoice not found</div>
    )
  }

  const curr = CURRENCIES[invoice.currency as string] || (invoice.currency as string) || ''
  const statusStyle = STATUS_STYLES[invoice.status as string] || STATUS_STYLES.received
  const matchStyle = MATCH_STYLES[invoice.match_status as string] || MATCH_STYLES.unmatched

  const selectedTotal = Array.from(selectedExpenses).reduce((sum, eid) => {
    const exp = availableExpenses.find(e => e.id === eid)
    return sum + Number(exp?.amount || 0)
  }, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/supplier-invoices')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{invoice.internal_reference as string}</h1>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
              {invoice.status as string}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${matchStyle.bg} ${matchStyle.text}`}>
              {invoice.match_status as string}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Supplier: {invoice.supplier_name as string} | Invoice #{invoice.supplier_invoice_number as string}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === 'matched' && (
            <button
              onClick={handleApprove}
              disabled={actionLoading === 'approve'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
            >
              {actionLoading === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approve
            </button>
          )}
          {invoice.status === 'approved' && (
            <button
              onClick={handlePay}
              disabled={actionLoading === 'pay'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === 'pay' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleDollarSign className="w-4 h-4" />}
              Mark Paid
            </button>
          )}
          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <button
              onClick={handleDispute}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
            >
              <AlertTriangle className="w-4 h-4" />
              Dispute
            </button>
          )}
          <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Discrepancy Banner */}
      {invoice.match_status === 'discrepancy' && (
        <div className="flex items-center gap-2 p-3 mb-6 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-red-700">Amount discrepancy: </span>
            <span className="text-red-600">
              Invoice {curr}{Number(invoice.amount).toFixed(2)} vs Matched {curr}{Number(invoice.matched_amount).toFixed(2)}
              {' '}(difference: {curr}{Math.abs(Number(invoice.discrepancy_amount)).toFixed(2)})
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Supplier</p>
                <p className="font-medium">{invoice.supplier_name as string}</p>
              </div>
              <div>
                <p className="text-gray-500">Invoice Number</p>
                <p className="font-medium">{invoice.supplier_invoice_number as string}</p>
              </div>
              <div>
                <p className="text-gray-500">Invoice Date</p>
                <p className="font-medium">{new Date(invoice.invoice_date as string).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-gray-500">Due Date</p>
                <p className="font-medium">{invoice.due_date ? new Date(invoice.due_date as string).toLocaleDateString() : '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Amount</p>
                <p className="text-lg font-bold text-gray-900">{curr}{Number(invoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-gray-500">Tax</p>
                <p className="font-medium">{curr}{Number(invoice.tax_amount || 0).toFixed(2)}</p>
              </div>
            </div>
            {!!invoice.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-gray-500 text-sm">Description</p>
                <p className="text-sm mt-1">{invoice.description as string}</p>
              </div>
            )}
          </div>

          {/* Matched Expenses */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Matched Expenses ({matchedExpenses.length})
              </h3>
              {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                <button
                  onClick={openMatchModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#647C47] bg-[#647C47]/10 rounded-lg hover:bg-[#647C47]/20"
                >
                  <Link2 className="w-3 h-3" />
                  Match Expense
                </button>
              )}
            </div>

            {matchedExpenses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No expenses matched yet</p>
            ) : (
              <div className="space-y-2">
                {matchedExpenses.map(match => (
                  <div key={match.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{match.expense.expense_number}</p>
                      <p className="text-xs text-gray-500">
                        {match.expense.category} | {match.expense.supplier_name} | {new Date(match.expense.expense_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {CURRENCIES[match.expense.currency] || match.expense.currency}{Number(match.matched_amount).toFixed(2)}
                      </span>
                      {invoice.status !== 'paid' && (
                        <button
                          onClick={() => handleRemoveExpense(match.expense_id)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-3 border-t border-gray-200 text-sm">
                  <span className="text-gray-500">Total matched:</span>
                  <span className="font-semibold">{curr}{Number(invoice.matched_amount).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Document */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Document</h3>
            {invoice.document_url ? (
              <div className="space-y-2">
                <a
                  href={invoice.document_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-[#647C47] bg-[#647C47]/10 rounded-lg hover:bg-[#647C47]/20"
                >
                  <Download className="w-4 h-4" />
                  {(invoice.document_filename as string) || 'View Document'}
                </a>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-[#647C47] hover:bg-gray-50 transition-colors">
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                ) : (
                  <Upload className="w-6 h-6 text-gray-400" />
                )}
                <span className="text-xs text-gray-500">Upload PDF, JPG, or PNG</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Payment Info */}
          {invoice.status === 'paid' && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Paid At</span>
                  <span>{invoice.paid_at ? new Date(invoice.paid_at as string).toLocaleDateString() : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Method</span>
                  <span>{(invoice.payment_method as string) || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reference</span>
                  <span>{(invoice.payment_reference as string) || '-'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {!!invoice.notes && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{invoice.notes as string}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-gray-400 space-y-1">
            <p>Created: {new Date(invoice.created_at as string).toLocaleString()}</p>
            <p>Updated: {new Date(invoice.updated_at as string).toLocaleString()}</p>
            <p className="truncate">ID: {invoice.id as string}</p>
          </div>
        </div>
      </div>

      {/* Match Expense Modal */}
      {showMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMatchModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Match Expenses</h3>
              <p className="text-sm text-gray-500 mt-1">
                Invoice amount: {curr}{Number(invoice.amount).toFixed(2)}
              </p>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={expenseSearch}
                  onChange={e => setExpenseSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4">
              {loadingExpenses ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-1">
                  {availableExpenses
                    .filter(e =>
                      !expenseSearch ||
                      String(e.supplier_name || '').toLowerCase().includes(expenseSearch.toLowerCase()) ||
                      String(e.expense_number || '').toLowerCase().includes(expenseSearch.toLowerCase()) ||
                      String(e.category || '').toLowerCase().includes(expenseSearch.toLowerCase())
                    )
                    .map(exp => {
                      const isSelected = selectedExpenses.has(exp.id as string)
                      return (
                        <label
                          key={exp.id as string}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#647C47]/10 border border-[#647C47]/30' : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const next = new Set(selectedExpenses)
                              if (isSelected) next.delete(exp.id as string)
                              else next.add(exp.id as string)
                              setSelectedExpenses(next)
                            }}
                            className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{exp.expense_number as string}</span>
                              <span className="text-xs text-gray-500">{exp.category as string}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {exp.supplier_name as string} | {new Date(exp.expense_date as string).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-sm font-medium whitespace-nowrap">
                            {CURRENCIES[exp.currency as string] || (exp.currency as string)}{Number(exp.amount).toFixed(2)}
                          </span>
                        </label>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Footer with running total */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  Selected: {selectedExpenses.size} expense(s)
                </span>
                <span className={`text-sm font-semibold ${
                  Math.abs(selectedTotal - Number(invoice.amount)) < 0.01
                    ? 'text-green-600'
                    : selectedTotal < Number(invoice.amount)
                      ? 'text-yellow-600'
                      : 'text-red-600'
                }`}>
                  {curr}{selectedTotal.toFixed(2)} / {curr}{Number(invoice.amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowMatchModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmMatch}
                  disabled={selectedExpenses.size === 0 || actionLoading === 'match'}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
                >
                  {actionLoading === 'match' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Match
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
