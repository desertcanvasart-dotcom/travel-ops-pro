'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Mail, Phone, MapPin, Globe, Building, CreditCard, Tag,
  Star, Bell, Heart, ArrowLeft, Save, X, ChevronRight
} from 'lucide-react'

const LEAD_SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'website', label: 'Website', icon: '🌐' },
  { value: 'referral', label: 'Referral', icon: '👥' },
  { value: 'phone', label: 'Phone', icon: '📞' },
  { value: 'social_media', label: 'Social Media', icon: '📱' },
  { value: 'trade_show', label: 'Trade Show', icon: '🎪' },
  { value: 'other', label: 'Other', icon: '➕' }
]

export default function NewClientPage() {
  const router = useRouter()
  const t = useTranslations('clients')
  const tCommon = useTranslations('common')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(1)

  // Form data
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    alternative_phone: '',
    nationality: '',
    passport_type: 'euro_passport' as 'euro_passport' | 'other_passport',
    date_of_birth: '',
    preferred_language: 'English',
    country: '',
    city: '',
    address_line1: '',
    address_line2: '',
    postal_code: '',
    preferred_contact_method: 'whatsapp' as 'email' | 'whatsapp' | 'phone' | 'sms',
    best_time_to_contact: 'morning',
    timezone: 'Africa/Cairo',
    preferred_accommodation_level: 'moderate' as 'budget' | 'moderate' | 'luxury' | 'ultra_luxury',
    dietary_restrictions: [] as string[],
    accessibility_needs: [] as string[],
    special_interests: [] as string[],
    company_name: '',
    job_title: '',
    is_travel_agent: false,
    agent_commission_rate: 0,
    client_type: 'individual' as 'individual' | 'family' | 'group' | 'corporate' | 'agent',
    vip_status: false,
    lead_source: '',
    marketing_consent: false,
    newsletter_subscribed: false,
    sms_consent: false,
    tags: [] as string[],
    internal_notes: '',
    currency_preference: 'EUR' as 'EUR' | 'USD' | 'GBP' | 'JPY'
  })

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Convert empty strings to null for date fields
      const cleanedData = {
        ...formData,
        date_of_birth: formData.date_of_birth || null,
      }

      const { data, error: insertError } = await supabase
        .from('clients')
        .insert([cleanedData])
        .select()
        .single()

      if (insertError) throw insertError
      router.push(`/clients/${data.id}`)
    } catch (err: any) {
      console.error('Error creating client:', err)
      setError(err.message || t('failedToCreateClient'))
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayToggle = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field as keyof typeof prev] as string[]).includes(value)
      ? (prev[field as keyof typeof prev] as string[]).filter((item: string) => item !== value)
        : [...(prev[field as keyof typeof prev] as string[]), value]
    }))
  }

  const totalSteps = 5
  const steps = [
    { num: 1, label: t('stepBasicInfo'), icon: User },
    { num: 2, label: t('stepContact'), icon: MapPin },
    { num: 3, label: t('stepPreferences'), icon: Heart },
    { num: 4, label: t('stepBusiness'), icon: Building },
    { num: 5, label: t('stepClassification'), icon: Tag }
  ]

  // Reusable input class
  const inputClass = "w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
  const selectClass = "w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
  const labelClass = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/clients"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('backToClients')}
              </Link>
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <User className="w-5 h-5 text-primary-600" />
                {t('addNewClient')}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">{t('createClientProfile')}</p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="mt-6">
            <div className="flex items-center">
              {steps.map((step, index) => (
                <div key={step.num} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(step.num)}
                    className="flex flex-col items-center flex-1 group"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all shadow-sm ${
                        currentStep >= step.num
                          ? 'bg-primary-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-400 group-hover:border-gray-300'
                      }`}
                    >
                      {step.num}
                    </div>
                    <span className={`text-[10px] mt-1.5 ${currentStep >= step.num ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </button>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${currentStep > step.num ? 'bg-primary-600' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 bg-white border border-red-200 rounded-lg p-3 shadow-sm border-l-4 border-l-red-500">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Step 1: Basic Information */}
        {currentStep === 1 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary-600" />
              {t('basicInformation')}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t('firstName')} *</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  className={inputClass}
                  placeholder={t('placeholderFirstName')}
                />
              </div>

              <div>
                <label className={labelClass}>{t('lastName')} *</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  className={inputClass}
                  placeholder={t('placeholderLastName')}
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                  <Mail className="w-3.5 h-3.5" />
                  {t('emailAddress')} *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={inputClass}
                  placeholder={t('placeholderEmail')}
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                  <Phone className="w-3.5 h-3.5" />
                  {t('phoneNumber')}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className={inputClass}
                  placeholder={t('placeholderPhone')}
                />
              </div>

              <div>
                <label className={labelClass}>{t('alternativePhone')}</label>
                <input
                  type="tel"
                  value={formData.alternative_phone}
                  onChange={(e) => handleInputChange('alternative_phone', e.target.value)}
                  className={inputClass}
                  placeholder={t('placeholderPhone')}
                />
              </div>

              <div>
                <label className={labelClass}>{t('dateOfBirth')}</label>
                <input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>{t('nationality')}</label>
                <input
                  type="text"
                  value={formData.nationality}
                  onChange={(e) => handleInputChange('nationality', e.target.value)}
                  className={inputClass}
                  placeholder={t('placeholderNationality')}
                />
              </div>

              <div>
                <label className={labelClass}>{t('passportType')}</label>
                <select
                  value={formData.passport_type}
                  onChange={(e) => handleInputChange('passport_type', e.target.value)}
                  className={selectClass}
                >
                  <option value="euro_passport">{t('euroPassport')}</option>
                  <option value="other_passport">{t('otherPassport')}</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className={labelClass}>{t('preferredLanguage')}</label>
                <select
                  value={formData.preferred_language}
                  onChange={(e) => handleInputChange('preferred_language', e.target.value)}
                  className={selectClass}
                >
                  <option value="English">{t('langEnglish')}</option>
                  <option value="Spanish">{t('langSpanish')}</option>
                  <option value="French">{t('langFrench')}</option>
                  <option value="German">{t('langGerman')}</option>
                  <option value="Italian">{t('langItalian')}</option>
                  <option value="Russian">{t('langRussian')}</option>
                  <option value="Chinese">{t('langChinese')}</option>
                  <option value="Japanese">{t('langJapanese')}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact & Address */}
        {currentStep === 2 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-600" />
              {t('contactAndAddress')}
            </h2>

            <div className="space-y-5">
              {/* Contact Preferences */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 mb-3">{t('contactPreferences')}</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>{t('preferredMethod')}</label>
                    <select
                      value={formData.preferred_contact_method}
                      onChange={(e) => handleInputChange('preferred_contact_method', e.target.value)}
                      className={selectClass}
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">{t('email')}</option>
                      <option value="phone">{t('phoneCall')}</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>{t('bestTime')}</label>
                    <select
                      value={formData.best_time_to_contact}
                      onChange={(e) => handleInputChange('best_time_to_contact', e.target.value)}
                      className={selectClass}
                    >
                      <option value="morning">{t('timeMorning')}</option>
                      <option value="afternoon">{t('timeAfternoon')}</option>
                      <option value="evening">{t('timeEvening')}</option>
                      <option value="anytime">{t('timeAnytime')}</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>{t('timezone')}</label>
                    <input
                      type="text"
                      value={formData.timezone}
                      onChange={(e) => handleInputChange('timezone', e.target.value)}
                      className={inputClass}
                      placeholder={t('placeholderTimezone')}
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">{t('address')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>{t('country')}</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t('city')}</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className={labelClass}>{t('addressLine1')}</label>
                    <input
                      type="text"
                      value={formData.address_line1}
                      onChange={(e) => handleInputChange('address_line1', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className={labelClass}>{t('addressLine2')}</label>
                    <input
                      type="text"
                      value={formData.address_line2}
                      onChange={(e) => handleInputChange('address_line2', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t('postalCode')}</label>
                    <input
                      type="text"
                      value={formData.postal_code}
                      onChange={(e) => handleInputChange('postal_code', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Travel Preferences */}
        {currentStep === 3 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Heart className="w-4 h-4 text-primary-600" />
              {t('travelPreferences')}
            </h2>

            <div className="space-y-5">
              <div>
                <label className={labelClass}>{t('accommodationLevel')}</label>
                <select
                  value={formData.preferred_accommodation_level}
                  onChange={(e) => handleInputChange('preferred_accommodation_level', e.target.value)}
                  className={selectClass}
                >
                  <option value="budget">{t('accommodationBudget')}</option>
                  <option value="moderate">{t('accommodationModerate')}</option>
                  <option value="luxury">{t('accommodationLuxury')}</option>
                  <option value="ultra_luxury">{t('accommodationUltraLuxury')}</option>
                </select>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 mb-3 block">{t('specialInterests')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: 'History', label: t('interestHistory') },
                    { key: 'Photography', label: t('interestPhotography') },
                    { key: 'Adventure', label: t('interestAdventure') },
                    { key: 'Food', label: t('interestFood') },
                    { key: 'Culture', label: t('interestCulture') },
                    { key: 'Shopping', label: t('interestShopping') },
                    { key: 'Nature', label: t('interestNature') },
                    { key: 'Architecture', label: t('interestArchitecture') }
                  ].map((interest) => (
                    <label key={interest.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.special_interests.includes(interest.key)}
                        onChange={() => handleArrayToggle('special_interests', interest.key)}
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">{interest.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 mb-3 block">{t('dietaryRestrictions')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: 'Vegetarian', label: t('dietVegetarian') },
                    { key: 'Vegan', label: t('dietVegan') },
                    { key: 'Halal', label: t('dietHalal') },
                    { key: 'Kosher', label: t('dietKosher') },
                    { key: 'Gluten-Free', label: t('dietGlutenFree') },
                    { key: 'Lactose-Free', label: t('dietLactoseFree') },
                    { key: 'Nut Allergy', label: t('dietNutAllergy') },
                    { key: 'None', label: t('dietNone') }
                  ].map((restriction) => (
                    <label key={restriction.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.dietary_restrictions.includes(restriction.key)}
                        onChange={() => handleArrayToggle('dietary_restrictions', restriction.key)}
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">{restriction.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-700 mb-3 block">{t('accessibilityNeeds')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'Wheelchair Access', label: t('accessWheelchair') },
                    { key: 'Elevator Required', label: t('accessElevator') },
                    { key: 'Ground Floor', label: t('accessGroundFloor') },
                    { key: 'Hearing Assistance', label: t('accessHearing') },
                    { key: 'Visual Assistance', label: t('accessVisual') },
                    { key: 'None', label: t('accessNone') }
                  ].map((need) => (
                    <label key={need.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.accessibility_needs.includes(need.key)}
                        onChange={() => handleArrayToggle('accessibility_needs', need.key)}
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                      />
                      <span className="text-xs text-gray-700">{need.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Business Information */}
        {currentStep === 4 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Building className="w-4 h-4 text-primary-600" />
              {t('businessInformation')}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t('companyName')}</label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>{t('jobTitle')}</label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => handleInputChange('job_title', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="col-span-2 pt-3 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.is_travel_agent}
                    onChange={(e) => handleInputChange('is_travel_agent', e.target.checked)}
                    className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                  />
                  <span className="text-xs font-medium text-gray-700">{t('isTravelAgent')}</span>
                </label>
              </div>

              {formData.is_travel_agent && (
                <div>
                  <label className={labelClass}>{t('commissionRate')}</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.agent_commission_rate}
                    onChange={(e) => handleInputChange('agent_commission_rate', parseFloat(e.target.value))}
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className={labelClass}>{t('currencyPreference')}</label>
                <select
                  value={formData.currency_preference}
                  onChange={(e) => handleInputChange('currency_preference', e.target.value)}
                  className={selectClass}
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="JPY">JPY (¥)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Classification & Marketing */}
        {currentStep === 5 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary-600" />
              {t('classificationAndMarketing')}
            </h2>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t('clientType')}</label>
                  <select
                    value={formData.client_type}
                    onChange={(e) => handleInputChange('client_type', e.target.value)}
                    className={selectClass}
                  >
                    <option value="individual">{t('clientTypeIndividual')}</option>
                    <option value="family">{t('clientTypeFamily')}</option>
                    <option value="group">{t('clientTypeGroup')}</option>
                    <option value="corporate">{t('clientTypeCorporate')}</option>
                    <option value="agent">{t('clientTypeAgent')}</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>{t('leadSource')} *</label>
                  <select
                    value={formData.lead_source}
                    onChange={(e) => handleInputChange('lead_source', e.target.value)}
                    className={selectClass}
                    required
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
              </div>

              <div className="pt-3 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-yellow-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.vip_status}
                    onChange={(e) => handleInputChange('vip_status', e.target.checked)}
                    className="w-3.5 h-3.5 text-yellow-500 rounded border-gray-300"
                  />
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs font-medium text-gray-700">{t('markAsVip')}</span>
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">{t('marketingPreferences')}</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.marketing_consent}
                      onChange={(e) => handleInputChange('marketing_consent', e.target.checked)}
                      className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">{t('marketingConsent')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.newsletter_subscribed}
                      onChange={(e) => handleInputChange('newsletter_subscribed', e.target.checked)}
                      className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">{t('newsletterSubscribed')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.sms_consent}
                      onChange={(e) => handleInputChange('sms_consent', e.target.checked)}
                      className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">{t('smsConsent')}</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <label className={labelClass}>{t('internalNotes')}</label>
                <textarea
                  rows={3}
                  value={formData.internal_notes}
                  onChange={(e) => handleInputChange('internal_notes', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder={t('placeholderNotes')}
                />
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-5">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {tCommon('previous')}
            </button>
          ) : (
            <Link
              href="/clients"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
            >
              <X className="w-3.5 h-3.5" />
              {tCommon('cancel')}
            </Link>
          )}

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm"
            >
              {tCommon('next')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  {t('creating')}
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  {t('createClient')}
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}