'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, User, Plane, Users, FileText, Map } from 'lucide-react'
import { usePreferences } from '@/app/contexts/PreferencesContext'
import {
  applyTemplate,
  deriveEndDate,
  templateLabel,
  type TripTemplate,
} from '@/lib/itineraries/from-template'

export default function NewItineraryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Arriving from a client's page: the trip belongs to them, and saying so is
  // what makes it appear in their booking history afterwards.
  const clientId = searchParams.get('clientId')
  const t = useTranslations('itineraries')
  const tCommon = useTranslations('common')
  const { preferences, loading: prefsLoading } = usePreferences()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    trip_name: '',
    start_date: '',
    end_date: '',
    num_adults: 2,
    num_children: 0,  // Ages 4-12: 50% discount
    num_infants: 0,   // Ages 0-3: FREE except flights
    currency: 'USD',
    notes: '',
    client_id: null as string | null,
    // The programme this trip is built from, when it is built from one. It is
    // what lets the extras catalogue offer THIS programme's options later.
    template_id: null as string | null,
  })

  // The programmes the operator sells. `slim=1` because this is a dropdown
  // showing a code and a length, not the day-by-day payload.
  const [templates, setTemplates] = useState<TripTemplate[]>([])

  // Pre-fill from the client this booking is being made for, so their name and
  // contact details are not retyped — and so the trip carries their id.
  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}`)
        const json = await res.json()
        const c = json?.data ?? json?.client ?? json
        if (cancelled || !c?.id) return
        setFormData(prev => ({
          ...prev,
          client_id: c.id,
          client_name: prev.client_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.name || '',
          client_email: prev.client_email || c.email || '',
          client_phone: prev.client_phone || c.phone || '',
        }))
      } catch {
        // A client we cannot read just means an unprefilled form, not a blocked one.
      }
    })()
    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/tours/templates?slim=1')
        const json = await res.json()
        if (cancelled || !json?.success) return
        setTemplates((json.data ?? []).filter((tpl: TripTemplate & { is_active?: boolean }) => tpl.is_active !== false))
      } catch {
        // No programmes listed just means the blank form, not a broken page.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const chooseTemplate = (templateId: string) => {
    const template = templates.find(tpl => tpl.id === templateId) ?? null
    setFormData(prev => ({ ...prev, ...applyTemplate(template, prev) }))
  }

  // Update currency from preferences once loaded
  useEffect(() => {
    if (!prefsLoading && preferences.default_currency) {
      setFormData(prev => ({
        ...prev,
        currency: preferences.default_currency
      }))
    }
  }, [prefsLoading, preferences.default_currency])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => {
      const next = {
        ...prev,
        [name]: name === 'num_adults' || name === 'num_children' || name === 'num_infants' ? parseInt(value) || 0 : value
      }
      // Moving the start date of a programme moves its end date with it — the
      // length belongs to the programme, not to whatever was typed before.
      if (name === 'start_date' && prev.template_id) {
        const template = templates.find(tpl => tpl.id === prev.template_id)
        const end = deriveEndDate(value, template?.duration_days)
        if (end) next.end_date = end
      }
      return next
    })
  }

  const calculateDays = () => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date)
      const end = new Date(formData.end_date)
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      return days > 0 ? days : 0
    }
    return 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.client_name || !formData.trip_name || !formData.start_date || !formData.end_date) {
      setError(t('errorRequired'))
      setLoading(false)
      return
    }

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      setError(t('errorDateRange'))
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/itineraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/itineraries/${data.data.id}`)
      } else {
        setError(data.error || t('errorFailed'))
      }
    } catch (err) {
      setError(t('errorCreating'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const totalDays = calculateDays()

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('createNewItinerary')}</h1>
            <p className="text-gray-600 mt-1">{t('fillDetails')}</p>
          </div>
          <Link
            href="/itineraries"
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToList')}
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-autoura border border-gray-200 p-8">
          
          {error && (
            <div className="mb-6 p-4 bg-danger/10 border-l-4 border-danger rounded">
              <p className="text-danger">{error}</p>
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary-600" />
              {t('clientInformation')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tCommon('clientName')} <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="client_name"
                  value={formData.client_name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('clientNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tCommon('email')}
                </label>
                <input
                  type="email"
                  name="client_email"
                  value={formData.client_email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('emailPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tCommon('phone')}
                </label>
                <input
                  type="tel"
                  name="client_phone"
                  value={formData.client_phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('phonePlaceholder')}
                />
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plane className="w-5 h-5 text-primary-600" />
              {t('tripDetails')}
            </h2>
            <div className="grid grid-cols-1 gap-6">
              {templates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Map className="w-4 h-4 text-primary-600" />
                    {t('fromProgramme')}
                  </label>
                  <select
                    value={formData.template_id ?? ''}
                    onChange={e => chooseTemplate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('fromScratch')}</option>
                    {templates.map(tpl => (
                      <option key={tpl.id} value={tpl.id}>{templateLabel(tpl)}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">{t('fromProgrammeHint')}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('tripName')} <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  name="trip_name"
                  value={formData.trip_name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('tripNamePlaceholder')}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {tCommon('startDate')} <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {tCommon('endDate')} <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleChange}
                    required
                    min={formData.start_date}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              {totalDays > 0 && (
                <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
                  <p className="text-primary-900 font-medium">
                    📅 {t('tripDuration')}: <span className="text-2xl font-bold">{totalDays}</span> {totalDays === 1 ? t('day') : t('days')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-600" />
              {t('passengers')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('numberOfAdults')}
                </label>
                <input
                  type="number"
                  name="num_adults"
                  value={formData.num_adults}
                  onChange={handleChange}
                  min="1"
                  max="50"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('numberOfChildren')}
                  <span className="text-xs text-gray-500 ml-1">(4-12)</span>
                </label>
                <input
                  type="number"
                  name="num_children"
                  value={formData.num_children}
                  onChange={handleChange}
                  min="0"
                  max="50"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('numberOfInfants')}
                  <span className="text-xs text-gray-500 ml-1">(0-3)</span>
                </label>
                <input
                  type="number"
                  name="num_infants"
                  value={formData.num_infants}
                  onChange={handleChange}
                  min="0"
                  max="20"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tCommon('currency')}
                </label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="EGP">EGP (E£)</option>
                  <option value="JPY">JPY (¥)</option>
                </select>
              </div>
            </div>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700">
                <span className="font-medium">{t('totalPassengers')}:</span>{' '}
                {formData.num_adults + formData.num_children + formData.num_infants}
                {' '}({formData.num_adults} {formData.num_adults === 1 ? t('adult') : t('adults')}
                {formData.num_children > 0 && `, ${formData.num_children} ${formData.num_children === 1 ? t('child') : t('children')}`}
                {formData.num_infants > 0 && `, ${formData.num_infants} ${formData.num_infants === 1 ? t('infant') : t('infants')}`})
              </p>
              {(formData.num_children > 0 || formData.num_infants > 0) && (
                <p className="text-sm text-gray-500 mt-2">
                  {t('childDiscountNote')}
                </p>
              )}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              {t('additionalNotes')}
            </h2>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('additionalNotesPlaceholder')}
            />
          </div>

          <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
            <Link
              href="/itineraries"
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              {tCommon('cancel')}
            </Link>
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center gap-2 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {t('creating')}
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  {t('createItinerary')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}