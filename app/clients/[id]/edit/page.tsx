'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, User, Mail, Phone, Globe, Building, Star, Tag } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLocalizedValidation, validationRules } from '@/hooks/useLocalizedValidation'

interface ClientFormData {
  first_name: string
  last_name: string
  email: string
  phone: string
  nationality: string
  passport_type: string
  preferred_language: string
  preferred_contact_method: string
  client_type: string
  vip_status: boolean
  status: string
  lead_source: string
  company_name: string
  internal_notes: string
  special_interests: string[]
  tags: string[]
}

export default function EditClientPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params?.id as string
  const supabase = createClient()

  // i18n hooks
  const t = useTranslations('clients')
  const tCommon = useTranslations('common')
  const tValidation = useTranslations('validation')
  const { validate, validateForm, getFieldName } = useLocalizedValidation()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  
  const [formData, setFormData] = useState<ClientFormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    nationality: '',
    passport_type: '',
    preferred_language: '',
    preferred_contact_method: '',
    client_type: 'individual',
    vip_status: false,
    status: 'prospect',
    lead_source: '',
    company_name: '',
    internal_notes: '',
    special_interests: [],
    tags: []
  })

  const [newInterest, setNewInterest] = useState('')
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    if (clientId) {
      fetchClient()
    }
  }, [clientId])

  const fetchClient = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

      if (error) throw error

      if (data) {
        setFormData({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          email: data.email || '',
          phone: data.phone || '',
          nationality: data.nationality || '',
          passport_type: data.passport_type || '',
          preferred_language: data.preferred_language || '',
          preferred_contact_method: data.preferred_contact_method || '',
          client_type: data.client_type || 'individual',
          vip_status: data.vip_status || false,
          status: data.status || 'prospect',
          lead_source: data.lead_source || '',
          company_name: data.company_name || '',
          internal_notes: data.internal_notes || '',
          special_interests: data.special_interests || [],
          tags: data.tags || []
        })
      }
    } catch (err) {
      console.error('Error fetching client:', err)
      setError(t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const addInterest = () => {
    if (newInterest.trim() && !formData.special_interests.includes(newInterest.trim())) {
      setFormData(prev => ({
        ...prev,
        special_interests: [...prev.special_interests, newInterest.trim()]
      }))
      setNewInterest('')
    }
  }

  const removeInterest = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      special_interests: prev.special_interests.filter(i => i !== interest)
    }))
  }

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }))
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }))
  }

  // Validate a single field on blur
  const validateField = (fieldName: string, value: any) => {
    let error: string | null = null

    switch (fieldName) {
      case 'first_name':
        error = validate(value, [validationRules.required()], 'firstName')
        break
      case 'last_name':
        error = validate(value, [validationRules.required()], 'lastName')
        break
      case 'email':
        error = validate(value, [validationRules.required(), validationRules.email()], 'email')
        break
      case 'phone':
        if (value) {
          error = validate(value, [validationRules.phone()], 'phone')
        }
        break
    }

    setFieldErrors(prev => {
      if (error) {
        return { ...prev, [fieldName]: error }
      }
      const { [fieldName]: _, ...rest } = prev
      return rest
    })

    return error === null
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    validateField(name, value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Run validation
    const validations = validateForm(formData, [
      { field: 'first_name', fieldKey: 'firstName', rules: [validationRules.required()] },
      { field: 'last_name', fieldKey: 'lastName', rules: [validationRules.required()] },
      { field: 'email', fieldKey: 'email', rules: [validationRules.required(), validationRules.email()] },
      { field: 'phone', fieldKey: 'phone', rules: formData.phone ? [validationRules.phone()] : [] },
    ])

    if (!validations.isValid) {
      setFieldErrors(validations.errors)
      setError(tValidation('required', { field: tCommon('required') }))
      return
    }

    try {
      setSaving(true)
      setError(null)
      setFieldErrors({})

      const { error: updateError } = await supabase
        .from('clients')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone || null,
          nationality: formData.nationality || null,
          passport_type: formData.passport_type || null,
          preferred_language: formData.preferred_language || null,
          preferred_contact_method: formData.preferred_contact_method || null,
          client_type: formData.client_type,
          vip_status: formData.vip_status,
          status: formData.status,
          lead_source: formData.lead_source || null,
          company_name: formData.company_name || null,
          internal_notes: formData.internal_notes || null,
          special_interests: formData.special_interests,
          tags: formData.tags,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId)

      if (updateError) throw updateError

      router.push(`/clients/${clientId}`)
    } catch (err) {
      console.error('Error updating client:', err)
      setError(t('failedToUpdate'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">{t('loadingClient')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={`/clients/${clientId}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{t('editClient')}</h1>
                <p className="text-sm text-gray-500">{t('clientDetails')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Basic Information */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              {t('basicInformation')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getFieldName('firstName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm ${
                    fieldErrors.first_name ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.first_name && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.first_name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getFieldName('lastName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm ${
                    fieldErrors.last_name ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.last_name && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.last_name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-3 h-3 inline mr-1" />
                  {getFieldName('email')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm ${
                    fieldErrors.email ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-3 h-3 inline mr-1" />
                  {getFieldName('phone')}
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm ${
                    fieldErrors.phone ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.phone && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe className="w-3 h-3 inline mr-1" />
                  {t('nationality')}
                </label>
                <input
                  type="text"
                  name="nationality"
                  value={formData.nationality}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building className="w-3 h-3 inline mr-1" />
                  {t('companyName')}
                </label>
                <input
                  type="text"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{t('classification')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('clientType')}
                </label>
                <select
                  name="client_type"
                  value={formData.client_type}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm bg-white"
                >
                  <option value="individual">{t('clientTypeIndividual')}</option>
                  <option value="family">{t('clientTypeFamily')}</option>
                  <option value="group">{t('clientTypeGroup')}</option>
                  <option value="corporate">{t('clientTypeCorporate')}</option>
                  <option value="agent">{t('clientTypeAgent')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('statusLabel')}
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm bg-white"
                >
                  <option value="prospect">{t('statusProspect')}</option>
                  <option value="active">{t('statusActive')}</option>
                  <option value="inactive">{t('statusInactive')}</option>
                  <option value="blacklisted">{t('statusBlacklisted')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('leadSource')}
                </label>
                <select
                  name="lead_source"
                  value={formData.lead_source}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm bg-white"
                >
                  <option value="">{t('selectSource')}</option>
                  <option value="whatsapp">💬 {t('leadSourceWhatsApp')}</option>
                  <option value="email">✉️ {t('leadSourceEmail')}</option>
                  <option value="website">🌐 {t('leadSourceWebsite')}</option>
                  <option value="referral">👥 {t('leadSourceReferral')}</option>
                  <option value="phone">📞 {t('leadSourcePhone')}</option>
                  <option value="social_media">📱 {t('leadSourceSocialMedia')}</option>
                  <option value="trade_show">🎪 {t('leadSourceTradeShow')}</option>
                  <option value="other">➕ {t('leadSourceOther')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Star className="w-3 h-3 inline mr-1" />
                  {t('vipStatus')}
                </label>
                <label className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 shadow-sm">
                  <input
                    type="checkbox"
                    name="vip_status"
                    checked={formData.vip_status}
                    onChange={handleChange}
                    className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-2 focus:ring-yellow-500"
                  />
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-gray-700">{t('vipClient')}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{t('preferences')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('passportType')}
                </label>
                <select
                  name="passport_type"
                  value={formData.passport_type}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm bg-white"
                >
                  <option value="">{t('selectOption')}</option>
                  <option value="euro_passport">{t('euroPassport')}</option>
                  <option value="other_passport">{t('otherPassport')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('preferredLanguage')}
                </label>
                <select
                  name="preferred_language"
                  value={formData.preferred_language}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm bg-white"
                >
                  <option value="">{t('selectOption')}</option>
                  <option value="English">{t('langEnglish')}</option>
                  <option value="Arabic">{t('langArabic')}</option>
                  <option value="French">{t('langFrench')}</option>
                  <option value="German">{t('langGerman')}</option>
                  <option value="Spanish">{t('langSpanish')}</option>
                  <option value="Italian">{t('langItalian')}</option>
                  <option value="Russian">{t('langRussian')}</option>
                  <option value="Chinese">{t('langChinese')}</option>
                  <option value="Japanese">{t('langJapanese')}</option>
                  <option value="Korean">{t('langKorean')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('preferredContactMethod')}
                </label>
                <select
                  name="preferred_contact_method"
                  value={formData.preferred_contact_method}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm bg-white"
                >
                  <option value="">{t('selectOption')}</option>
                  <option value="email">{t('email')}</option>
                  <option value="phone">{t('phone')}</option>
                  <option value="whatsapp">{t('contactWhatsApp')}</option>
                  <option value="sms">{t('contactSMS')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Special Interests */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{t('specialInterests')}</h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
                placeholder={t('addInterestPlaceholder')}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm"
              />
              <button
                type="button"
                onClick={addInterest}
                className="px-4 py-2.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
              >
                {tCommon('add')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.special_interests.map((interest, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                >
                  {interest}
                  <button
                    type="button"
                    onClick={() => removeInterest(interest)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-400" />
              {t('tags')}
            </h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder={t('addTagPlaceholder')}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-4 py-2.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors shadow-sm"
              >
                {tCommon('add')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Internal Notes */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{t('internalNotes')}</h2>
            <textarea
              name="internal_notes"
              value={formData.internal_notes}
              onChange={handleChange}
              rows={4}
              placeholder={t('internalNotesPlaceholder')}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link
              href={`/clients/${clientId}`}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              {tCommon('cancel')}
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tCommon('loading')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {tCommon('save')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}