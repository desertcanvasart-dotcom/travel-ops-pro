'use client'

import { useState } from 'react'
import { X, Receipt } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface AddExpenseFromItineraryProps {
  itineraryId: string
  itineraryCode: string
  clientName: string
  onExpenseAdded?: () => void
}

interface FormData {
  category: string
  description: string
  amount: number
  currency: string
  expense_date: string
  supplier_name: string
  supplier_type: string
  receipt_url: string
  status: string
  payment_method: string
  notes: string
}

const CATEGORY_KEYS = [
  { value: 'guide', icon: '👨‍🏫' },
  { value: 'driver', icon: '🚗' },
  { value: 'hotel', icon: '🏨' },
  { value: 'transportation', icon: '🚐' },
  { value: 'entrance', icon: '🎫' },
  { value: 'meal', icon: '🍽️' },
  { value: 'airport_staff', icon: '✈️' },
  { value: 'hotel_staff', icon: '🛎️' },
  { value: 'ground_handler', icon: '🧳' },
  { value: 'tipping', icon: '💵' },
  { value: 'permits', icon: '📋' },
  { value: 'toll', icon: '🛣️' },
  { value: 'parking', icon: '🅿️' },
  { value: 'fuel', icon: '⛽' },
  { value: 'other', icon: '📦' }
] as const

const SUPPLIER_TYPE_KEYS = [
  'guide', 'driver', 'hotel', 'restaurant', 'transport_company',
  'airport_staff', 'hotel_staff', 'ground_handler', 'government', 'other'
] as const

const PAYMENT_METHOD_KEYS = [
  'cash', 'bank_transfer', 'credit_card', 'wise', 'company_card'
] as const

export default function AddExpenseFromItinerary({
  itineraryId,
  itineraryCode,
  clientName,
  onExpenseAdded
}: AddExpenseFromItineraryProps) {
  const t = useTranslations('expenseModal')
  const tCommon = useTranslations('common')
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    category: '',
    description: '',
    amount: 0,
    currency: 'EUR',
    expense_date: new Date().toISOString().split('T')[0],
    supplier_name: '',
    supplier_type: '',
    receipt_url: '',
    status: 'pending',
    payment_method: '',
    notes: ''
  })

  const resetForm = () => {
    setFormData({
      category: '',
      description: '',
      amount: 0,
      currency: 'EUR',
      expense_date: new Date().toISOString().split('T')[0],
      supplier_name: '',
      supplier_type: '',
      receipt_url: '',
      status: 'pending',
      payment_method: '',
      notes: ''
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          itinerary_id: itineraryId
        })
      })

      if (response.ok) {
        setIsOpen(false)
        resetForm()
        onExpenseAdded?.()
      } else {
        const error = await response.json()
        alert(error.error || t('failedToSave'))
      }
    } catch (error) {
      console.error('Error saving expense:', error)
      alert(t('failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-[#647C47] hover:text-[#647C47] transition-colors"
      >
        <Receipt className="h-4 w-4" />
        {t('addExpense')}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('addExpense')}</h2>
                <p className="text-xs text-gray-500">{itineraryCode} • {clientName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title={tCommon('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Category & Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    {t('category')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
                    title={t('category')}
                  >
                    <option value="">{t('selectCategory')}</option>
                    {CATEGORY_KEYS.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.icon} {t(`categories.${cat.value}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    {t('amount')} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                      className="w-20 px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                      title={tCommon('currency')}
                    >
                      <option value="EUR">€</option>
                      <option value="USD">$</option>
                      <option value="EGP">E£</option>
                    </select>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                      step="0.01"
                      min="0"
                      required
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                      title={t('amount')}
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('description')}</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('descriptionPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {t('expenseDate')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expense_date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  title={t('expenseDate')}
                />
              </div>

              {/* Supplier */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('supplierName')}</label>
                  <input
                    type="text"
                    value={formData.supplier_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                    placeholder={t('supplierNamePlaceholder')}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('supplierType')}</label>
                  <select
                    value={formData.supplier_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                    title={t('supplierType')}
                  >
                    <option value="">{t('selectType')}</option>
                    {SUPPLIER_TYPE_KEYS.map(type => (
                      <option key={type} value={type}>{t(`supplierTypes.${type}`)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('paymentMethod')}</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  title={t('paymentMethod')}
                >
                  <option value="">{t('selectMethod')}</option>
                  {PAYMENT_METHOD_KEYS.map(method => (
                    <option key={method} value={method}>{t(`paymentMethods.${method}`)}</option>
                  ))}
                </select>
              </div>

              {/* Receipt URL */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('receiptUrl')}</label>
                <input
                  type="url"
                  value={formData.receipt_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, receipt_url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder={t('notesPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50 transition-colors"
                >
                  {saving ? t('saving') : t('addExpense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}