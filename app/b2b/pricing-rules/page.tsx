'use client'

import { useEffect, useState } from 'react'
import CityOptions from '@/app/components/CityOptions'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Settings2, Plus, Edit, Trash2, X, Save, Loader2,
  Car, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'

// ============================================
// B2B PRICING RULES MANAGEMENT
// File: app/b2b/pricing-rules/page.tsx
// Manage tiered pricing, boat sizes, transport packages
// ============================================

interface TransportPackage {
  id: string
  package_code: string
  package_name: string
  package_type: string
  origin_city: string
  destination_city: string
  duration_days: number
  rate_currency?: string | null
  sedan_rate: number | null
  sedan_capacity: number
  minivan_rate: number | null
  minivan_capacity: number
  van_rate: number | null
  van_capacity: number
  minibus_rate: number | null
  minibus_capacity: number
  bus_rate: number | null
  bus_capacity: number
  description: string | null
  includes: string | null
  is_active: boolean
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

interface PackageFormData {
  package_code: string
  package_name: string
  package_type: string
  origin_city: string
  destination_city: string
  duration_days: number
  rate_currency: string
  sedan_rate: number
  sedan_capacity: number
  minivan_rate: number
  minivan_capacity: number
  van_rate: number
  van_capacity: number
  minibus_rate: number
  minibus_capacity: number
  bus_rate: number
  bus_capacity: number
  description: string
  includes: string
  is_active: boolean
}

const DEFAULT_PACKAGE_FORM: PackageFormData = {
  package_code: '',
  package_name: '',
  package_type: 'cruise_sightseeing',
  origin_city: 'Luxor',
  destination_city: 'Aswan',
  duration_days: 5,
  rate_currency: '',
  sedan_rate: 180,
  sedan_capacity: 3,
  minivan_rate: 250,
  minivan_capacity: 7,
  van_rate: 320,
  van_capacity: 12,
  minibus_rate: 400,
  minibus_capacity: 20,
  bus_rate: 500,
  bus_capacity: 50,
  description: '',
  includes: '',
  is_active: true
}

export default function B2BPricingRulesPage() {
  const { rateCurrency, rateSymbol } = useCurrency()
  const t = useTranslations('b2bPricingRules')
  const [transportPackages, setTransportPackages] = useState<TransportPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [editingPackage, setEditingPackage] = useState<TransportPackage | null>(null)
  const [saving, setSaving] = useState(false)

  const [expandedPackages, setExpandedPackages] = useState(true)

  const [packageForm, setPackageForm] = useState<PackageFormData>(DEFAULT_PACKAGE_FORM)
  const { confirmDelete } = useConfirmDialog()

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const packagesRes = await fetch('/api/b2b/transport-packages')
      const packagesData = await packagesRes.json()
      if (packagesData.success) {
        setTransportPackages(packagesData.data || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      showToast('error', t('failedToLoadRules'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ============================================
  // TRANSPORT PACKAGES HANDLERS
  // ============================================

  // Mirror of the engine's vehicle selection (selectVehicleFromPackage): a
  // vehicle with NO rate is skipped, so the next priced vehicle takes the group
  // from the previous PRICED vehicle's capacity. The band starts shown here
  // follow the same rule — what the operator sees is what the engine does.
  // (Same model as the Transportation Rates screen: blank rate = vehicle not run.)
  const pkgBandStart = (vehicle: 'minivan' | 'van' | 'minibus' | 'bus'): number => {
    const chain = [
      ['sedan', packageForm.sedan_rate, packageForm.sedan_capacity],
      ['minivan', packageForm.minivan_rate, packageForm.minivan_capacity],
      ['van', packageForm.van_rate, packageForm.van_capacity],
      ['minibus', packageForm.minibus_rate, packageForm.minibus_capacity],
    ] as const
    const upto = { minivan: 1, van: 2, minibus: 3, bus: 4 }[vehicle]
    let start = 1
    for (const [, rate, capacity] of chain.slice(0, upto)) {
      if (rate) start = capacity + 1
    }
    return start
  }

  const handleAddPackage = () => {
    setEditingPackage(null)
    setPackageForm(DEFAULT_PACKAGE_FORM)
    setShowPackageModal(true)
  }

  const handleEditPackage = (pkg: TransportPackage) => {
    setEditingPackage(pkg)
    setPackageForm({
      package_code: pkg.package_code || '',
      package_name: pkg.package_name || '',
      package_type: pkg.package_type || 'cruise_sightseeing',
      origin_city: pkg.origin_city || 'Luxor',
      destination_city: pkg.destination_city || 'Aswan',
      duration_days: pkg.duration_days || 5,
      rate_currency: pkg.rate_currency || '',
      sedan_rate: pkg.sedan_rate || 0,
      sedan_capacity: pkg.sedan_capacity || 3,
      minivan_rate: pkg.minivan_rate || 0,
      minivan_capacity: pkg.minivan_capacity || 7,
      van_rate: pkg.van_rate || 0,
      van_capacity: pkg.van_capacity || 12,
      minibus_rate: pkg.minibus_rate || 0,
      minibus_capacity: pkg.minibus_capacity || 20,
      bus_rate: pkg.bus_rate || 0,
      bus_capacity: pkg.bus_capacity || 50,
      description: pkg.description || '',
      includes: pkg.includes || '',
      is_active: pkg.is_active
    })
    setShowPackageModal(true)
  }

  const handleSavePackage = async () => {
    if (!packageForm.package_name) {
      showToast('error', t('packageNameRequired'))
      return
    }

    setSaving(true)
    try {
      const url = editingPackage 
        ? `/api/b2b/transport-packages/${editingPackage.id}`
        : '/api/b2b/transport-packages'
      
      const res = await fetch(url, {
        method: editingPackage ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((() => {
          const { rate_currency: pickedCurrency, ...rest } = packageForm
          return {
            ...rest,
            package_code: packageForm.package_code || `PKG-${Date.now()}`,
            ...rateCurrencyPatch(pickedCurrency, editingPackage?.rate_currency),
          }
        })())
      })

      const data = await res.json()
      if (data.success) {
        showToast('success', editingPackage ? t('packageUpdated') : t('packageCreated'))
        setShowPackageModal(false)
        fetchData()
      } else {
        showToast('error', data.error || t('failedToSavePackage'))
      }
    } catch (error) {
      showToast('error', t('failedToSavePackage'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePackage = async (pkg: TransportPackage) => {
    if (!(await confirmDelete(pkg.package_name))) return

    try {
      const res = await fetch(`/api/b2b/transport-packages/${pkg.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showToast('success', t('packageDeleted'))
        fetchData()
      } else {
        showToast('error', data.error || t('failedToDeletePackage'))
      }
    } catch (error) {
      showToast('error', t('failedToDeletePackage'))
    }
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">{t('loadingPricingRules')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
                <p className="text-sm text-gray-500">{t('subtitle')}</p>
              </div>
            </div>
            <Link href="/b2b/quotes" className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              ← {t('backToB2B')}
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6 space-y-6">
        
        {/* TRANSPORT PACKAGES SECTION */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div 
            className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b cursor-pointer"
            onClick={() => setExpandedPackages(!expandedPackages)}
          >
            <div className="flex items-center gap-3">
              <Car className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">{t('transportPackages')}</h2>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                {t('packagesCount', { count: transportPackages.length })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleAddPackage() }}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <Plus className="w-4 h-4" />
                {t('addPackage')}
              </button>
              {expandedPackages ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </div>
          </div>

          {expandedPackages && (
            <div className="p-6">
              {transportPackages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Car className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>{t('noTransportPackagesYet')}</p>
                  <button onClick={handleAddPackage} className="mt-2 text-blue-600 hover:underline text-sm">
                    {t('addYourFirstPackage')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {transportPackages.map(pkg => (
                    <div key={pkg.id} className={`border rounded-lg p-4 ${pkg.is_active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium text-gray-900">{pkg.package_name}</h3>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {pkg.package_type.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-gray-500">
                              {pkg.origin_city} → {pkg.destination_city}
                            </span>
                            {!pkg.is_active && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">{t('inactive')}</span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-5 gap-2 text-sm mt-3">
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">{t('sedan')}</p>
                              <p className="font-semibold text-gray-900">{rateSymbol}{pkg.sedan_rate}</p>
                              <p className="text-xs text-gray-400">1-{pkg.sedan_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">{t('minivan')}</p>
                              <p className="font-semibold text-gray-900">{rateSymbol}{pkg.minivan_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.sedan_capacity + 1}-{pkg.minivan_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">{t('van')}</p>
                              <p className="font-semibold text-gray-900">{rateSymbol}{pkg.van_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.minivan_capacity + 1}-{pkg.van_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">{t('minibus')}</p>
                              <p className="font-semibold text-gray-900">{rateSymbol}{pkg.minibus_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.van_capacity + 1}-{pkg.minibus_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">{t('bus')}</p>
                              <p className="font-semibold text-gray-900">{rateSymbol}{pkg.bus_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.minibus_capacity + 1}+ pax</p>
                            </div>
                          </div>

                          {pkg.includes && (
                            <p className="text-xs text-gray-500 mt-2">
                              <strong>{t('includes')}</strong> {pkg.includes}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 ml-4">
                          <button onClick={() => handleEditPackage(pkg)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeletePackage(pkg)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TRANSPORT PACKAGE MODAL */}
      {showPackageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingPackage ? t('editTransportPackage') : t('addTransportPackage')}
              </h2>
              <button onClick={() => setShowPackageModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('packageName')} *</label>
                  <input
                    type="text"
                    value={packageForm.package_name}
                    onChange={(e) => setPackageForm({ ...packageForm, package_name: e.target.value })}
                    placeholder="e.g., Cruise Sightseeing Transport"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('packageType')}</label>
                  <select
                    value={packageForm.package_type}
                    onChange={(e) => setPackageForm({ ...packageForm, package_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="cruise_sightseeing">{t('typeCruiseSightseeing')}</option>
                    <option value="cruise_transfer">{t('typeCruiseTransfer')}</option>
                    <option value="multi_day">{t('typeMultiDay')}</option>
                    <option value="day_tour">{t('typeDayTour')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('originCity')}</label>
                  <select
                    value={packageForm.origin_city}
                    onChange={(e) => setPackageForm({ ...packageForm, origin_city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <CityOptions />
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('destinationCity')}</label>
                  <select
                    value={packageForm.destination_city}
                    onChange={(e) => setPackageForm({ ...packageForm, destination_city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <CityOptions />
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('durationDays')}</label>
                  <input
                    type="number"
                    value={packageForm.duration_days}
                    onChange={(e) => setPackageForm({ ...packageForm, duration_days: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <RateCurrencyField
                  value={packageForm.rate_currency}
                  onChange={v => setPackageForm(prev => ({ ...prev, rate_currency: v }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-1">{t('vehicleRates', { currency: rateCurrency })}</h4>
                <p className="text-xs text-gray-500 mb-3">{t('vehicleRatesHint')}</p>
                <div className="grid grid-cols-5 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">{t('sedan')}</label>
                    <input
                      type="number"
                      value={packageForm.sedan_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, sedan_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder={rateSymbol}
                    />
                    {packageForm.sedan_rate ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>1-</span>
                      <input
                        type="number"
                        value={packageForm.sedan_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, sedan_capacity: parseInt(e.target.value) || 3 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                    ) : (
                    <div className="text-xs text-gray-400 italic">{t('vehicleNotUsed')}</div>
                    )}
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">{t('minivan')}</label>
                    <input
                      type="number"
                      value={packageForm.minivan_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, minivan_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder={rateSymbol}
                    />
                    {packageForm.minivan_rate ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{pkgBandStart('minivan')}-</span>
                      <input
                        type="number"
                        value={packageForm.minivan_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, minivan_capacity: parseInt(e.target.value) || 7 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                    ) : (
                    <div className="text-xs text-gray-400 italic">{t('vehicleNotUsed')}</div>
                    )}
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">{t('van')}</label>
                    <input
                      type="number"
                      value={packageForm.van_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, van_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder={rateSymbol}
                    />
                    {packageForm.van_rate ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{pkgBandStart('van')}-</span>
                      <input
                        type="number"
                        value={packageForm.van_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, van_capacity: parseInt(e.target.value) || 12 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                    ) : (
                    <div className="text-xs text-gray-400 italic">{t('vehicleNotUsed')}</div>
                    )}
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">{t('minibus')}</label>
                    <input
                      type="number"
                      value={packageForm.minibus_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, minibus_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder={rateSymbol}
                    />
                    {packageForm.minibus_rate ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{pkgBandStart('minibus')}-</span>
                      <input
                        type="number"
                        value={packageForm.minibus_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, minibus_capacity: parseInt(e.target.value) || 20 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                    ) : (
                    <div className="text-xs text-gray-400 italic">{t('vehicleNotUsed')}</div>
                    )}
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">{t('bus')}</label>
                    <input
                      type="number"
                      value={packageForm.bus_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, bus_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder={rateSymbol}
                    />
                    {packageForm.bus_rate ? (
                    <div className="text-xs text-gray-500">
                      {pkgBandStart('bus')}+ pax
                    </div>
                    ) : (
                    <div className="text-xs text-gray-400 italic">{t('vehicleNotUsed')}</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('whatsIncluded')}</label>
                <textarea
                  value={packageForm.includes}
                  onChange={(e) => setPackageForm({ ...packageForm, includes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., Luxor East Bank, Luxor West Bank, Edfu Temple..."
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={packageForm.is_active}
                  onChange={(e) => setPackageForm({ ...packageForm, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">{t('active')}</span>
              </label>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-3">
              <button
                onClick={() => setShowPackageModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSavePackage}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingPackage ? t('updatePackage') : t('createPackage')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}