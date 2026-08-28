'use client'

import { todayLocal } from '@/lib/today'
import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, FileText, MapPin, DollarSign } from 'lucide-react'
import { usePreferences } from '@/app/contexts/PreferencesContext'
import { formatMoney } from '@/lib/currency-totals'

interface Invoice {
  id: string
  invoice_number: string
  client_name: string
  client_email: string
  total_amount: number
  amount_paid: number
  balance_due: number
  currency: string
  status: string
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  currency?: string | null
  total_cost: number
  total_paid: number
  payment_status: string
}

type PaymentTarget = 'invoice' | 'itinerary' | null

export default function RecordPaymentPage() {
  const router = useRouter()
  const t = useTranslations('payments')
  const tCommon = useTranslations('common')
  const [loading, setLoading] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget>(null)
  
  // Data sources
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  
  // Selected items
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedItinerary, setSelectedItinerary] = useState<Itinerary | null>(null)
  
  const [error, setError] = useState<string | null>(null)
  // This form is long enough that the error banner sits well above the submit
  // button. Setting an error the user cannot see is indistinguishable from the
  // form doing nothing at all — which is exactly how a rejected payment read
  // as "nothing happened" (AUT-W01). Bring the message to them.
  const errorRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  const [formData, setFormData] = useState({
    target_id: '',
    payment_type: 'deposit_30',
    amount: '',
    currency: '',
    payment_method: 'bank_transfer',
    payment_status: 'completed',
    transaction_reference: '',
    payment_date: todayLocal(),
    due_date: '',
    notes: ''
  })

  // The billing currency is the operator's, not this form's. Left hardcoded to
  // EUR, an A.T.S user recording a yen payment against a yen invoice filed it
  // in euro. Applied once, when preferences arrive, and never over a choice the
  // user has already made.
  const { preferences, loading: prefsLoading } = usePreferences()
  useEffect(() => {
    // WAIT for the real preference. The context seeds itself with a 'USD'
    // placeholder while it fetches, so firing on that would pin every form to
    // USD and then decline to correct itself, the field no longer being empty.
    if (!prefsLoading && preferences?.default_currency) {
      setFormData(f => (f.currency ? f : { ...f, currency: preferences.default_currency }))
    }
  }, [prefsLoading, preferences?.default_currency])

  useEffect(() => {
    fetchInvoices()
    fetchItineraries()
  }, [])

  // Auto-calculate amount when target changes
  useEffect(() => {
    if (paymentTarget === 'invoice' && selectedInvoice) {
      setFormData(prev => ({
        ...prev,
        target_id: selectedInvoice.id,
        amount: selectedInvoice.balance_due.toString(),
        currency: selectedInvoice.currency
      }))
    } else if (paymentTarget === 'itinerary' && selectedItinerary) {
      // Calculate based on payment type
      if (formData.payment_type.startsWith('deposit_')) {
        const percentage = parseInt(formData.payment_type.split('_')[1])
        const depositAmount = Math.round(selectedItinerary.total_cost * (percentage / 100))
        setFormData(prev => ({
          ...prev,
          target_id: selectedItinerary.id,
          amount: depositAmount.toString()
        }))
      } else if (formData.payment_type === 'full') {
        setFormData(prev => ({
          ...prev,
          target_id: selectedItinerary.id,
          amount: selectedItinerary.total_cost.toString()
        }))
      } else {
        const balance = selectedItinerary.total_cost - (selectedItinerary.total_paid || 0)
        setFormData(prev => ({
          ...prev,
          target_id: selectedItinerary.id,
          amount: balance.toString()
        }))
      }
    }
  }, [selectedInvoice, selectedItinerary, paymentTarget, formData.payment_type])

  const fetchInvoices = async () => {
    try {
      // Unpaid-invoice picker: request the API's max page (1000; default is 100)
      const response = await fetch('/api/invoices?limit=1000')
      if (response.ok) {
        const data = await response.json()
        // Filter to show only invoices with balance due
        const unpaidInvoices = data.filter((inv: Invoice) => Number(inv.balance_due) > 0)
        setInvoices(unpaidInvoices)
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    }
  }

  const fetchItineraries = async () => {
    try {
      // Dropdown picker: request the API's max page (1000; default is 100)
      const response = await fetch('/api/itineraries?limit=1000')
      const data = await response.json()
      
      if (data.success) {
        setItineraries(data.data)
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
    }
  }

  const handleTargetChange = (target: PaymentTarget) => {
    setPaymentTarget(target)
    setSelectedInvoice(null)
    setSelectedItinerary(null)
    setFormData(prev => ({
      ...prev,
      target_id: '',
      amount: ''
    }))
  }

  const handleInvoiceSelect = (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId)
    setSelectedInvoice(invoice || null)
  }

  const handleItinerarySelect = (itineraryId: string) => {
    const itinerary = itineraries.find(it => it.id === itineraryId)
    setSelectedItinerary(itinerary || null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.target_id || !formData.amount) {
      setError(t('errorRequired'))
      setLoading(false)
      return
    }

    try {
      let response

      if (paymentTarget === 'invoice') {
        // Record payment against invoice
        response = await fetch(`/api/invoices/${formData.target_id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parseFloat(formData.amount),
            currency: formData.currency,
            payment_method: formData.payment_method,
            payment_date: formData.payment_date,
            transaction_reference: formData.transaction_reference,
            notes: formData.notes
          })
        })
      } else {
        // Record payment against itinerary
        response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itinerary_id: formData.target_id,
            payment_type: formData.payment_type.startsWith('deposit_') 
              ? 'deposit' 
              : formData.payment_type,
            amount: parseFloat(formData.amount),
            currency: formData.currency,
            payment_method: formData.payment_method,
            payment_status: formData.payment_status,
            transaction_reference: formData.transaction_reference,
            payment_date: formData.payment_date,
            due_date: formData.due_date || null,
            notes: formData.notes
          })
        })
      }

      const data = await response.json()

      if (response.ok || data.success) {
        router.push('/payments')
      } else {
        setError(data.error || t('errorFailed'))
      }
    } catch (err) {
      setError(t('errorRecording'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getBalanceDue = () => {
    if (paymentTarget === 'invoice' && selectedInvoice) {
      return selectedInvoice.balance_due
    }
    if (paymentTarget === 'itinerary' && selectedItinerary) {
      return selectedItinerary.total_cost - (selectedItinerary.total_paid || 0)
    }
    return 0
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£', JPY: '¥' }
    return symbols[currency] || currency
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('recordPayment')}</h1>
            <p className="text-sm text-gray-600 mt-1">{t('addPaymentTransaction')}</p>
          </div>
          <Link
            href="/payments"
            className="bg-gray-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToPayments')}
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {error && (
            <div ref={errorRef} className="mb-4 p-3 bg-danger/10 border-l-4 border-danger rounded">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Step 1: Choose Payment Target */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              {t('recordPaymentAgainst')} <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTargetChange('invoice')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  paymentTarget === 'invoice'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${paymentTarget === 'invoice' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                    <FileText className={`w-5 h-5 ${paymentTarget === 'invoice' ? 'text-primary-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`font-medium ${paymentTarget === 'invoice' ? 'text-primary-900' : 'text-gray-900'}`}>
                      {t('invoice')}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {invoices.length} {t('withBalanceDue')}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTargetChange('itinerary')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  paymentTarget === 'itinerary'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${paymentTarget === 'itinerary' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                    <MapPin className={`w-5 h-5 ${paymentTarget === 'itinerary' ? 'text-primary-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`font-medium ${paymentTarget === 'itinerary' ? 'text-primary-900' : 'text-gray-900'}`}>
                      {t('itinerary')}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {itineraries.length} {t('available')}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Select specific invoice or itinerary */}
          {paymentTarget && (
            <>
              {paymentTarget === 'invoice' ? (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {t('selectInvoice')} <span className="text-danger">*</span>
                  </label>
                  <select
                    value={selectedInvoice?.id || ''}
                    onChange={(e) => handleInvoiceSelect(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('chooseInvoice')}</option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} - {invoice.client_name} ({t('balanceDue')}: {getCurrencySymbol(invoice.currency)}{Number(invoice.balance_due).toFixed(2)})
                      </option>
                    ))}
                  </select>
                  {invoices.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">{t('noInvoicesWithBalance')}</p>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {t('selectItinerary')} <span className="text-danger">*</span>
                  </label>
                  <select
                    value={selectedItinerary?.id || ''}
                    onChange={(e) => handleItinerarySelect(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('chooseItinerary')}</option>
                    {itineraries.map((itinerary) => (
                      <option key={itinerary.id} value={itinerary.id}>
                        {itinerary.itinerary_code} - {itinerary.client_name} ({formatMoney(itinerary.total_cost, itinerary.currency || formData.currency || 'EUR')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selected Item Info */}
              {(selectedInvoice || selectedItinerary) && (
                <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-900">{t('paymentDetails')}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {paymentTarget === 'invoice' && selectedInvoice && (
                      <>
                        <div>
                          <span className="text-gray-600">{t('invoiceTotal')}:</span>
                          <p className="font-bold text-gray-900">
                            {getCurrencySymbol(selectedInvoice.currency)}{Number(selectedInvoice.total_amount).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('alreadyPaid')}:</span>
                          <p className="font-bold text-success">
                            {getCurrencySymbol(selectedInvoice.currency)}{Number(selectedInvoice.amount_paid).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('balanceDue')}:</span>
                          <p className="font-bold text-orange-600">
                            {getCurrencySymbol(selectedInvoice.currency)}{Number(selectedInvoice.balance_due).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('status')}:</span>
                          <p className="font-medium text-gray-900 capitalize">{selectedInvoice.status}</p>
                        </div>
                      </>
                    )}
                    {paymentTarget === 'itinerary' && selectedItinerary && (
                      <>
                        <div>
                          <span className="text-gray-600">{t('totalCost')}:</span>
                          <p className="font-bold text-gray-900">{formatMoney(selectedItinerary.total_cost, selectedItinerary.currency || formData.currency || 'EUR')}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('alreadyPaid')}:</span>
                          <p className="font-bold text-success">{formatMoney(selectedItinerary.total_paid || 0, selectedItinerary.currency || formData.currency || 'EUR')}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('balanceDue')}:</span>
                          <p className="font-bold text-orange-600">
                            {formatMoney(selectedItinerary.total_cost - (selectedItinerary.total_paid || 0), selectedItinerary.currency || formData.currency || 'EUR')}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">{t('paymentStatus')}:</span>
                          <p className="font-medium text-gray-900 capitalize">
                            {selectedItinerary.payment_status?.replace('_', ' ') || t('notPaid')}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payment Type - Only for Itinerary */}
                {paymentTarget === 'itinerary' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {t('paymentType')} <span className="text-danger">*</span>
                    </label>
                    <select
                      name="payment_type"
                      value={formData.payment_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="deposit_10">{t('deposit')} (10%)</option>
                      <option value="deposit_15">{t('deposit')} (15%)</option>
                      <option value="deposit_20">{t('deposit')} (20%)</option>
                      <option value="deposit_25">{t('deposit')} (25%)</option>
                      <option value="deposit_30">{t('deposit')} (30%)</option>
                      <option value="deposit_50">{t('deposit')} (50%)</option>
                      <option value="installment">{t('installment')}</option>
                      <option value="final">{t('finalPayment')}</option>
                      <option value="full">{t('fullPayment')}</option>
                    </select>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {t('amount')} ({getCurrencySymbol(formData.currency)}) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    required
                    step="0.01"
                    min="0"
                    max={getBalanceDue()}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {t('currency')}
                  </label>
                  <select
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="JPY">JPY (¥)</option>
                  </select>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {t('paymentMethod')}
                  </label>
                  <select
                    name="payment_method"
                    value={formData.payment_method}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="bank_transfer">{t('bankTransfer')}</option>
                    <option value="airwallex">{t('airwallex')}</option>
                    <option value="tab">{t('tab')}</option>
                    <option value="credit_card">{t('creditCard')}</option>
                    <option value="cash">{t('cash')}</option>
                    <option value="paypal">{t('paypal')}</option>
                    <option value="stripe">{t('stripe')}</option>
                    <option value="wise">{t('wise')}</option>
                  </select>
                </div>

                {/* Payment Status - Only for Itinerary */}
                {paymentTarget === 'itinerary' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {t('paymentStatus')}
                    </label>
                    <select
                      name="payment_status"
                      value={formData.payment_status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="completed">{t('statusCompleted')}</option>
                      <option value="pending">{t('statusPending')}</option>
                      <option value="deposit_received">{t('statusDepositReceived')}</option>
                      <option value="partially_paid">{t('statusPartiallyPaid')}</option>
                      <option value="partially_refunded">{t('statusPartiallyRefunded')}</option>
                      <option value="failed">{t('statusFailed')}</option>
                      <option value="refunded">{t('statusRefunded')}</option>
                    </select>
                  </div>
                )}

                {/* Transaction Reference */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {t('transactionReference')}
                  </label>
                  <input
                    type="text"
                    name="transaction_reference"
                    value={formData.transaction_reference}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="TXN-12345"
                  />
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {t('paymentDate')}
                  </label>
                  <input
                    type="date"
                    name="payment_date"
                    value={formData.payment_date}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                {/* Due Date - Only for Itinerary */}
                {paymentTarget === 'itinerary' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {t('dueDateOptional')}
                    </label>
                    <input
                      type="date"
                      name="due_date"
                      value={formData.due_date}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {t('notes')}
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('notesPlaceholder')}
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <Link
                  href="/payments"
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  {tCommon('cancel')}
                </Link>
                <button
                  type="submit"
                  disabled={loading || !formData.target_id || !formData.amount}
                  className={`px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center gap-2 ${
                    (loading || !formData.target_id || !formData.amount) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {t('recording')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t('recordPayment')}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Show prompt if no target selected */}
          {!paymentTarget && (
            <div className="text-center py-8 text-gray-500">
              <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm">{t('selectTarget')}</p>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}