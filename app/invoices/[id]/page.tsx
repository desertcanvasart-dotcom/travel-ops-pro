'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  FileText, 
  Send, 
  Download, 
  Plus,
  X,
  Trash2,
  Building,
  Mail,
  Calendar,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react'

interface Invoice {
  id: string
  invoice_number: string
  client_id: string
  itinerary_id: string | null
  client_name: string
  client_email: string
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  currency: string
  amount_paid: number
  balance_due: number
  status: string
  issue_date: string
  due_date: string
  notes: string | null
  payment_terms: string | null
  payment_instructions: string | null
  created_at: string
  sent_at: string | null
  paid_at: string | null
}

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

interface Payment {
  id: string
  invoice_id: string
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string | null
  notes: string | null
  created_at: string
}

interface PaymentFormData {
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string
  notes: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100', icon: FileText },
  sent: { label: 'Sent', color: 'text-blue-700', bg: 'bg-blue-100', icon: Send },
  viewed: { label: 'Viewed', color: 'text-purple-700', bg: 'bg-purple-100', icon: FileText },
  partial: { label: 'Partial', color: 'text-orange-700', bg: 'bg-orange-100', icon: Clock },
  paid: { label: 'Paid', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  overdue: { label: 'Overdue', color: 'text-red-700', bg: 'bg-red-100', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'text-gray-500', bg: 'bg-gray-100', icon: X }
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'wise', label: 'Wise' },
  { value: 'airwallex', label: 'Airwallex' },
  { value: 'stripe', label: 'Stripe' },
]

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    amount: 0,
    currency: 'EUR',
    payment_method: 'bank_transfer',
    payment_date: new Date().toISOString().split('T')[0],
    transaction_reference: '',
    notes: ''
  })

  useEffect(() => {
    fetchInvoice()
    fetchPayments()
  }, [resolvedParams.id])

  const fetchInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}`)
      if (response.ok) {
        const data = await response.json()
        setInvoice(data)
        setPaymentForm(prev => ({
          ...prev,
          amount: Number(data.balance_due),
          currency: data.currency
        }))
      }
    } catch (error) {
      console.error('Error fetching invoice:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async () => {
    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}/payments`)
      if (response.ok) {
        const data = await response.json()
        setPayments(data)
      }
    } catch (error) {
      console.error('Error fetching payments:', error)
    }
  }

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPayment(true)

    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      })

      if (response.ok) {
        setShowPaymentModal(false)
        fetchInvoice()
        fetchPayments()
        setPaymentForm({
          amount: 0,
          currency: invoice?.currency || 'EUR',
          payment_method: 'bank_transfer',
          payment_date: new Date().toISOString().split('T')[0],
          transaction_reference: '',
          notes: ''
        })
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to record payment')
      }
    } catch (error) {
      console.error('Error recording payment:', error)
      alert('Failed to record payment')
    } finally {
      setSavingPayment(false)
    }
  }

  const handleMarkAsSent = async () => {
    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() })
      })
      if (response.ok) {
        fetchInvoice()
      }
    } catch (error) {
      console.error('Error updating invoice:', error)
    }
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment?')) return

    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}/payments/${paymentId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchInvoice()
        fetchPayments()
      }
    } catch (error) {
      console.error('Error deleting payment:', error)
    }
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
    return symbols[currency] || currency
  }

  // Check if overdue
  const getDisplayStatus = () => {
    if (!invoice) return 'draft'
    if (invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date) {
      const dueDate = new Date(invoice.due_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (dueDate < today && Number(invoice.balance_due) > 0) {
        return 'overdue'
      }
    }
    return invoice.status
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Invoice not found</p>
        <Link href="/invoices" className="text-[#647C47] hover:underline mt-2 inline-block">
          Back to Invoices
        </Link>
      </div>
    )
  }

  const displayStatus = getDisplayStatus()
  const statusConfig = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.draft
  const StatusIcon = statusConfig.icon

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </span>
            </div>
            <p className="text-sm text-gray-500">{invoice.client_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invoice.status === 'draft' && (
            <button
              onClick={handleMarkAsSent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              Mark as Sent
            </button>
          )}
          {Number(invoice.balance_due) > 0 && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Record Payment
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Invoice Details */}
        <div className="col-span-2 space-y-4">
          {/* Client & Dates Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Bill To</h3>
                <div className="flex items-start gap-2">
                  <Building className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{invoice.client_name}</p>
                    <p className="text-sm text-gray-500">{invoice.client_email}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">Issue Date:</span>
                  <span className="font-medium">{new Date(invoice.issue_date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">Due Date:</span>
                  <span className={`font-medium ${displayStatus === 'overdue' ? 'text-red-600' : ''}`}>
                    {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Description</th>
                  <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-2 w-20">Qty</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2 w-28">Unit Price</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2 w-28">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(invoice.line_items || []).map((item, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {getCurrencySymbol(invoice.currency)}{Number(item.unit_price).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      {getCurrencySymbol(invoice.currency)}{Number(item.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-sm text-gray-500 text-right">Subtotal</td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">
                    {getCurrencySymbol(invoice.currency)}{Number(invoice.subtotal).toFixed(2)}
                  </td>
                </tr>
                {Number(invoice.tax_amount) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-sm text-gray-500 text-right">
                      Tax ({invoice.tax_rate}%)
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900 text-right">
                      {getCurrencySymbol(invoice.currency)}{Number(invoice.tax_amount).toFixed(2)}
                    </td>
                  </tr>
                )}
                {Number(invoice.discount_amount) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-sm text-gray-500 text-right">Discount</td>
                    <td className="px-4 py-2 text-sm text-green-600 text-right">
                      -{getCurrencySymbol(invoice.currency)}{Number(invoice.discount_amount).toFixed(2)}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-gray-200">
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total</td>
                  <td className="px-4 py-3 text-base font-bold text-gray-900 text-right">
                    {getCurrencySymbol(invoice.currency)}{Number(invoice.total_amount).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {(invoice.notes || invoice.payment_terms) && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              {invoice.payment_terms && (
                <div className="mb-3">
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Payment Terms</h3>
                  <p className="text-sm text-gray-700">{invoice.payment_terms}</p>
                </div>
              )}
              {invoice.notes && (
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Notes</h3>
                  <p className="text-sm text-gray-700">{invoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column - Payment Summary & History */}
        <div className="space-y-4">
          {/* Payment Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Amount</span>
                <span className="font-medium">{getCurrencySymbol(invoice.currency)}{Number(invoice.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount Paid</span>
                <span className="font-medium text-green-600">{getCurrencySymbol(invoice.currency)}{Number(invoice.amount_paid).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-900">Balance Due</span>
                <span className={`font-bold text-lg ${Number(invoice.balance_due) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {getCurrencySymbol(invoice.currency)}{Number(invoice.balance_due).toFixed(2)}
                </span>
              </div>
            </div>

            {Number(invoice.balance_due) > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="w-full mt-4 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
              >
                <Plus className="h-4 w-4" />
                Record Payment
              </button>
            )}
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment History</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No payments recorded</p>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-start justify-between p-2 bg-gray-50 rounded-md">
                    <div className="flex items-start gap-2">
                      <CreditCard className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {getCurrencySymbol(payment.currency)}{Number(payment.amount).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(payment.payment_date).toLocaleDateString()} • {payment.payment_method?.replace('_', ' ')}
                        </p>
                        {payment.transaction_reference && (
                          <p className="text-xs text-gray-400 font-mono">{payment.transaction_reference}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeletePayment(payment.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Record Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-4 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  Balance Due: <span className="font-bold">{getCurrencySymbol(invoice.currency)}{Number(invoice.balance_due).toFixed(2)}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                    step="0.01"
                    min="0"
                    max={Number(invoice.balance_due)}
                    required
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                  >
                    {PAYMENT_METHODS.map(method => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Transaction Reference</label>
                <input
                  type="text"
                  value={paymentForm.transaction_reference}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, transaction_reference: e.target.value }))}
                  placeholder="e.g., TXN-12345"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="px-4 py-1.5 text-sm bg-[#647C47] text-white rounded-md hover:bg-[#4f6238] disabled:opacity-50"
                >
                  {savingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}