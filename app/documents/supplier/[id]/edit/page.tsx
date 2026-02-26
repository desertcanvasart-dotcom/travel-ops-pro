'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Plus, X, MapPin, Ticket, Calculator, Building2, Route } from 'lucide-react'

interface ItineraryTransportService {
  id: string
  day_number: number
  date: string
  city: string
  service_name: string
  service_type: string
  pickup_location?: string
  dropoff_location?: string
  pickup_time?: string
  vehicle_type?: string
  notes?: string
  rate_eur: number
  total_cost: number
}

interface SelectedRoute {
  itinerary_service_id: string
  day_number: number
  date: string
  city: string
  service_name: string
  pickup_location?: string
  dropoff_location?: string
  pickup_time?: string
  vehicle_type?: string
  notes?: string
  rate_eur: number
  total_cost: number
}

interface EntranceFee {
  id: string
  attraction_name: string
  city: string
  eur_rate: number
  non_eur_rate: number
  is_addon: boolean
  addon_note?: string
}

interface SelectedAttraction {
  id: string
  attraction_name: string
  city: string
  eur_rate: number
  non_eur_rate: number
  quantity: number
}

interface Supplier {
  id: string
  name: string
  type: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  whatsapp?: string
  address?: string
  city?: string
  country?: string
}

export default function EditSupplierDocumentPage() {
  const t = useTranslations('supplierDocumentEdit')
  const params = useParams()
  const router = useRouter()
  const [document, setDocument] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)

  // Entrance fees state
  const [entranceFees, setEntranceFees] = useState<EntranceFee[]>([])
  const [selectedAttractions, setSelectedAttractions] = useState<SelectedAttraction[]>([])
  const [loadingFees, setLoadingFees] = useState(false)
  const [showAttractionPicker, setShowAttractionPicker] = useState(false)
  const [attractionSearch, setAttractionSearch] = useState('')
  const [selectedCity, setSelectedCity] = useState('')

  // Transport routes state
  const [itineraryTransportServices, setItineraryTransportServices] = useState<ItineraryTransportService[]>([])
  const [selectedRoutes, setSelectedRoutes] = useState<SelectedRoute[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(false)

  useEffect(() => {
    fetchDocument()
    fetchEntranceFees()
    fetchSuppliers()
  }, [params.id])

  const fetchDocument = async () => {
    try {
      const response = await fetch(`/api/supplier-documents/${params.id}`)
      const result = await response.json()
      if (result.success) {
        setDocument(result.data)
        // Load existing selected attractions if present
        if (result.data.selected_attractions) {
          setSelectedAttractions(result.data.selected_attractions)
        }
        // Load existing selected routes if present
        if (result.data.selected_routes) {
          setSelectedRoutes(result.data.selected_routes)
        }
        // Fetch itinerary transport services if this is a transport voucher with linked itinerary
        if (result.data.document_type === 'transport_voucher' && result.data.itinerary?.id) {
          fetchItineraryRoutes(result.data.itinerary.id)
        }
      } else {
        setError(t('documentNotFound'))
      }
    } catch (err) {
      setError(t('errorLoadingDocument'))
    } finally {
      setLoading(false)
    }
  }

  const fetchItineraryRoutes = async (itineraryId: string) => {
    setLoadingRoutes(true)
    try {
      const response = await fetch(`/api/itineraries/${itineraryId}/days`)
      const result = await response.json()
      if (result.success && result.data) {
        const transportServices: ItineraryTransportService[] = []
        for (const day of result.data) {
          for (const service of day.services || []) {
            if (['transportation', 'transport', 'transfer'].includes(service.service_type)) {
              transportServices.push({
                id: service.id,
                day_number: day.day_number,
                date: day.date,
                city: day.city || service.city || '',
                service_name: service.service_name,
                service_type: service.service_type,
                pickup_location: service.pickup_location,
                dropoff_location: service.dropoff_location,
                pickup_time: service.pickup_time,
                vehicle_type: service.vehicle_type,
                notes: service.notes,
                rate_eur: parseFloat(service.rate_eur) || 0,
                total_cost: parseFloat(service.total_cost) || 0
              })
            }
          }
        }
        setItineraryTransportServices(transportServices)
      }
    } catch (err) {
      console.error('Error fetching itinerary routes:', err)
    } finally {
      setLoadingRoutes(false)
    }
  }

  const fetchEntranceFees = async () => {
    setLoadingFees(true)
    try {
      const response = await fetch('/api/rates/attractions?active_only=true')
      const result = await response.json()
      if (result.success) {
        setEntranceFees(result.data || [])
      }
    } catch (err) {
      console.error('Error fetching entrance fees:', err)
    } finally {
      setLoadingFees(false)
    }
  }

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true)
    try {
      const response = await fetch('/api/suppliers')
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setSuppliers(result.data)
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err)
    } finally {
      setLoadingSuppliers(false)
    }
  }

  // Get relevant suppliers based on document type
  const getRelevantSuppliers = () => {
    if (!document) return suppliers

    const typeMapping: Record<string, string[]> = {
      transport_voucher: ['transport', 'transport_company', 'driver', 'dmc', 'ground_handler'],
      hotel_voucher: ['hotel', 'hotel_chain'],
      cruise_voucher: ['cruise', 'cruise_line'],
      guide_assignment: ['guide', 'dmc', 'ground_handler'],
      service_order: ['restaurant', 'activity_provider', 'attraction', 'dmc', 'ground_handler', 'tour_operator'],
      activity_voucher: ['activity_provider', 'attraction', 'dmc']
    }

    const relevantTypes = typeMapping[document.document_type] || []
    if (relevantTypes.length === 0) return suppliers

    return suppliers.filter(s => relevantTypes.includes(s.type))
  }

  // Handle supplier selection and auto-populate fields
  const handleSupplierSelect = (supplierId: string) => {
    if (!supplierId) {
      // Clear supplier fields if "No supplier" is selected
      setDocument({
        ...document,
        supplier_id: null,
        supplier_name: '',
        supplier_contact_name: '',
        supplier_contact_email: '',
        supplier_contact_phone: '',
        supplier_whatsapp: '',
        supplier_address: ''
      })
      return
    }

    const supplier = suppliers.find(s => s.id === supplierId)
    if (supplier) {
      const address = [supplier.address, supplier.city, supplier.country]
        .filter(Boolean)
        .join(', ')

      setDocument({
        ...document,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_contact_name: supplier.contact_name || '',
        supplier_contact_email: supplier.contact_email || '',
        supplier_contact_phone: supplier.contact_phone || '',
        supplier_whatsapp: supplier.whatsapp || '',
        supplier_address: address
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // Only send editable fields — exclude joined relations and read-only fields
      const {
        id: _id,
        itinerary: _itinerary,
        supplier: _supplier,
        created_at: _created,
        ...editableFields
      } = document

      const dataToSave: Record<string, any> = {
        ...editableFields,
        selected_attractions: selectedAttractions,
      }

      // Build services array based on document type
      if (document.document_type === 'transport_voucher' && selectedRoutes.length > 0) {
        dataToSave.selected_routes = selectedRoutes
        dataToSave.services = selectedRoutes.map(r => ({
          service_type: 'transportation',
          service_name: r.service_name,
          date: r.date,
          day_number: r.day_number,
          city: r.city,
          pickup_location: r.pickup_location,
          dropoff_location: r.dropoff_location,
          pickup_time: r.pickup_time,
          vehicle_type: r.vehicle_type,
          notes: r.notes,
          quantity: 1,
          total_cost: r.total_cost
        }))
      } else {
        // Default: entrance fee services for service_order/activity_voucher
        dataToSave.services = selectedAttractions.map(a => ({
          service_name: a.attraction_name,
          service_type: 'entrance_fee',
          quantity: a.quantity,
          unit_price: a.eur_rate,
          total_price: a.eur_rate * a.quantity
        }))
      }

      const response = await fetch(`/api/supplier-documents/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      })

      if (response.ok) {
        router.push(`/documents/supplier/${params.id}`)
      } else {
        const errorData = await response.json().catch(() => null)
        console.error('Save error:', errorData)
        setError(errorData?.error || t('failedToSave'))
      }
    } catch (err) {
      console.error('Save exception:', err)
      setError(t('errorSavingDocument'))
    } finally {
      setSaving(false)
    }
  }

  // Add attraction to selected list
  const addAttraction = (fee: EntranceFee) => {
    // Check if already selected
    if (selectedAttractions.find(a => a.id === fee.id)) {
      return
    }
    
    const newAttraction: SelectedAttraction = {
      id: fee.id,
      attraction_name: fee.attraction_name,
      city: fee.city,
      eur_rate: fee.eur_rate,
      non_eur_rate: fee.non_eur_rate,
      quantity: document?.num_adults + (document?.num_children || 0) || 1
    }
    
    setSelectedAttractions(prev => [...prev, newAttraction])
    setShowAttractionPicker(false)
    setAttractionSearch('')
  }

  // Remove attraction from selected list
  const removeAttraction = (id: string) => {
    setSelectedAttractions(prev => prev.filter(a => a.id !== id))
  }

  // Update quantity for an attraction
  const updateAttractionQuantity = (id: string, quantity: number) => {
    setSelectedAttractions(prev => prev.map(a => 
      a.id === id ? { ...a, quantity: Math.max(1, quantity) } : a
    ))
  }

  // Calculate total for selected attractions
  const calculateAttractionsTotal = () => {
    return selectedAttractions.reduce((sum, a) => sum + (a.eur_rate * a.quantity), 0)
  }

  // Auto-update document total when attractions change
  useEffect(() => {
    if (document && (document.document_type === 'service_order' || document.document_type === 'activity_voucher')) {
      const attractionsTotal = calculateAttractionsTotal()
      if (attractionsTotal > 0) {
        setDocument((prev: any) => ({ ...prev, total_cost: attractionsTotal }))
      }
    }
  }, [selectedAttractions])

  // Toggle a transport route selection
  const toggleRoute = (service: ItineraryTransportService) => {
    setSelectedRoutes(prev => {
      const exists = prev.find(r => r.itinerary_service_id === service.id)
      if (exists) {
        return prev.filter(r => r.itinerary_service_id !== service.id)
      } else {
        return [...prev, {
          itinerary_service_id: service.id,
          day_number: service.day_number,
          date: service.date,
          city: service.city,
          service_name: service.service_name,
          pickup_location: service.pickup_location,
          dropoff_location: service.dropoff_location,
          pickup_time: service.pickup_time,
          vehicle_type: service.vehicle_type,
          notes: service.notes,
          rate_eur: service.rate_eur,
          total_cost: service.total_cost
        }]
      }
    })
  }

  const isRouteSelected = (serviceId: string) => {
    return selectedRoutes.some(r => r.itinerary_service_id === serviceId)
  }

  const calculateRoutesTotal = () => {
    return selectedRoutes.reduce((sum, r) => sum + r.total_cost, 0)
  }

  const selectAllRoutes = () => {
    setSelectedRoutes(itineraryTransportServices.map(s => ({
      itinerary_service_id: s.id,
      day_number: s.day_number,
      date: s.date,
      city: s.city,
      service_name: s.service_name,
      pickup_location: s.pickup_location,
      dropoff_location: s.dropoff_location,
      pickup_time: s.pickup_time,
      vehicle_type: s.vehicle_type,
      notes: s.notes,
      rate_eur: s.rate_eur,
      total_cost: s.total_cost
    })))
  }

  const deselectAllRoutes = () => {
    setSelectedRoutes([])
  }

  // Auto-update document total when selected routes change
  useEffect(() => {
    if (document && document.document_type === 'transport_voucher' && selectedRoutes.length > 0) {
      const routesTotal = calculateRoutesTotal()
      setDocument((prev: any) => ({ ...prev, total_cost: routesTotal }))
    }
  }, [selectedRoutes])

  // Get unique cities from entrance fees
  const cities = Array.from(new Set(entranceFees.map(f => f.city))).sort()

  // Filter attractions for picker
  const filteredAttractions = entranceFees.filter(fee => {
    const matchesSearch = !attractionSearch || 
      fee.attraction_name.toLowerCase().includes(attractionSearch.toLowerCase())
    const matchesCity = !selectedCity || fee.city === selectedCity
    const notSelected = !selectedAttractions.find(a => a.id === fee.id)
    return matchesSearch && matchesCity && notSelected
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/documents/supplier" className="text-primary-600">← {t('back')}</Link>
        </div>
      </div>
    )
  }

  const isEntranceFeeDocument = document.document_type === 'service_order' || document.document_type === 'activity_voucher'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href={`/documents/supplier/${params.id}`} className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{t('edit')} {document.document_number}</h1>
                <p className="text-xs text-gray-500">{document.document_type?.replace('_', ' ').toUpperCase()}</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? t('saving') : t('saveChanges')}
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Main Form */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            
            {/* Status - IMPORTANT */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentStatus')}</label>
                <select
                  value={document.status || 'draft'}
                  onChange={(e) => setDocument({ ...document, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="draft">{t('status.draft')}</option>
                  <option value="sent">{t('status.sent')}</option>
                  <option value="confirmed">{t('status.confirmed')}</option>
                  <option value="completed">{t('status.completed')}</option>
                  <option value="cancelled">{t('status.cancelled')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentType')}</label>
                <input
                  type="text"
                  value={document.document_type?.replace('_', ' ').toUpperCase() || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
            </div>

            {/* Supplier Selection */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5 text-blue-600" />
                <label className="text-sm font-semibold text-blue-900">{t('selectSupplier')}</label>
              </div>
              <select
                value={document.supplier_id || ''}
                onChange={(e) => handleSupplierSelect(e.target.value)}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loadingSuppliers}
                title={t('selectSupplier')}
              >
                <option value="">{t('selectSupplierPlaceholder')}</option>
                {getRelevantSuppliers().length > 0 && (
                  <optgroup label={t('recommendedSuppliers')}>
                    {getRelevantSuppliers().map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `(${s.city})` : ''} — {s.type.replace('_', ' ')}
                      </option>
                    ))}
                  </optgroup>
                )}
                {suppliers.filter(s => !getRelevantSuppliers().find(r => r.id === s.id)).length > 0 && (
                  <optgroup label={t('otherSuppliers')}>
                    {suppliers.filter(s => !getRelevantSuppliers().find(r => r.id === s.id)).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `(${s.city})` : ''} — {s.type.replace('_', ' ')}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="text-xs text-blue-600 mt-2">{t('selectSupplierHint')}</p>
            </div>

            {/* Supplier Info (editable) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('supplierName')}</label>
                <input
                  type="text"
                  value={document.supplier_name || ''}
                  onChange={(e) => setDocument({ ...document, supplier_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('supplierNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactName')}</label>
                <input
                  type="text"
                  value={document.supplier_contact_name || ''}
                  onChange={(e) => setDocument({ ...document, supplier_contact_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('contactNamePlaceholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactEmail')}</label>
                <input
                  type="email"
                  value={document.supplier_contact_email || ''}
                  onChange={(e) => setDocument({ ...document, supplier_contact_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('contactEmailPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactPhone')}</label>
                <input
                  type="text"
                  value={document.supplier_contact_phone || ''}
                  onChange={(e) => setDocument({ ...document, supplier_contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('contactPhonePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('whatsapp')}</label>
                <input
                  type="text"
                  value={document.supplier_whatsapp || ''}
                  onChange={(e) => setDocument({ ...document, supplier_whatsapp: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('whatsappPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('address')}</label>
              <input
                type="text"
                value={document.supplier_address || ''}
                onChange={(e) => setDocument({ ...document, supplier_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={t('addressPlaceholder')}
              />
            </div>

            <hr className="border-gray-200" />

            {/* Guest Info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('guestName')}</label>
                <input
                  type="text"
                  value={document.client_name || ''}
                  onChange={(e) => setDocument({ ...document, client_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('adults')}</label>
                <input
                  type="number"
                  value={document.num_adults || 1}
                  onChange={(e) => setDocument({ ...document, num_adults: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('children')}</label>
                <input
                  type="number"
                  value={document.num_children || 0}
                  onChange={(e) => setDocument({ ...document, num_children: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('nationality')}</label>
                <input
                  type="text"
                  value={document.client_nationality || ''}
                  onChange={(e) => setDocument({ ...document, client_nationality: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('city')}</label>
                <input
                  type="text"
                  value={document.city || ''}
                  onChange={(e) => setDocument({ ...document, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              {document.document_type === 'hotel_voucher' || document.document_type === 'cruise_voucher' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('checkIn')}</label>
                    <input
                      type="date"
                      value={document.check_in?.split('T')[0] || ''}
                      onChange={(e) => setDocument({ ...document, check_in: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('checkOut')}</label>
                    <input
                      type="date"
                      value={document.check_out?.split('T')[0] || ''}
                      onChange={(e) => setDocument({ ...document, check_out: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('serviceDate')}</label>
                    <input
                      type="date"
                      value={document.service_date?.split('T')[0] || ''}
                      onChange={(e) => setDocument({ ...document, service_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('pickupTime')}</label>
                    <input
                      type="time"
                      value={document.pickup_time || ''}
                      onChange={(e) => setDocument({ ...document, pickup_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </>
              )}
            </div>

            {document.document_type === 'transport_voucher' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicleType')}</label>
                    <select
                      value={document.vehicle_type || ''}
                      onChange={(e) => setDocument({ ...document, vehicle_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      title={t('vehicleType')}
                    >
                      <option value="">{t('vehicleTypes.select')}</option>
                      <option value="sedan">{t('vehicleTypes.sedan')}</option>
                      <option value="minivan">{t('vehicleTypes.minivan')}</option>
                      <option value="van">{t('vehicleTypes.van')}</option>
                      <option value="minibus">{t('vehicleTypes.minibus')}</option>
                      <option value="bus">{t('vehicleTypes.bus')}</option>
                      <option value="luxury_sedan">{t('vehicleTypes.luxurySedan')}</option>
                      <option value="luxury_van">{t('vehicleTypes.luxuryVan')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('driverName')}</label>
                    <input
                      type="text"
                      value={document.driver_name || ''}
                      onChange={(e) => setDocument({ ...document, driver_name: e.target.value })}
                      placeholder={t('driverNamePlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Transport Routes from Itinerary */}
                {itineraryTransportServices.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Route className="w-5 h-5 text-primary-600" />
                        <h3 className="text-sm font-semibold text-gray-900">{t('transportRoutes')}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllRoutes}
                          className="px-2 py-1 text-xs text-primary-600 hover:bg-primary-100 rounded"
                        >
                          {t('selectAll')}
                        </button>
                        <button
                          type="button"
                          onClick={deselectAllRoutes}
                          className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                        >
                          {t('deselectAll')}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mb-3">{t('routePickerHint')}</p>

                    {loadingRoutes ? (
                      <div className="text-center py-6">
                        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(
                          itineraryTransportServices.reduce((acc, svc) => {
                            const key = `day-${svc.day_number}`
                            if (!acc[key]) acc[key] = { day_number: svc.day_number, date: svc.date, city: svc.city, services: [] }
                            acc[key].services.push(svc)
                            return acc
                          }, {} as Record<string, { day_number: number; date: string; city: string; services: ItineraryTransportService[] }>)
                        )
                          .sort(([, a], [, b]) => a.day_number - b.day_number)
                          .map(([key, group]) => (
                            <div key={key} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                              <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                                <span className="text-xs font-semibold text-gray-700">
                                  {t('day')} {group.day_number}
                                </span>
                                {group.date && (
                                  <span className="text-xs text-gray-500 ml-2">
                                    {new Date(group.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                                {group.city && (
                                  <span className="text-xs text-gray-500 ml-1">— {group.city}</span>
                                )}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {group.services.map(service => (
                                  <label
                                    key={service.id}
                                    className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-primary-50 transition-colors ${
                                      isRouteSelected(service.id) ? 'bg-primary-50' : ''
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isRouteSelected(service.id)}
                                      onChange={() => toggleRoute(service)}
                                      className="mt-0.5 h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                                      {(service.pickup_location || service.dropoff_location) && (
                                        <p className="text-xs text-gray-500 mt-0.5">
                                          {service.pickup_location || '?'} → {service.dropoff_location || '?'}
                                        </p>
                                      )}
                                      {service.notes && (
                                        <p className="text-xs text-gray-400 mt-0.5">{service.notes}</p>
                                      )}
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-sm font-semibold text-primary-600">
                                        {service.total_cost > 0 ? `€${service.total_cost.toFixed(2)}` : '—'}
                                      </p>
                                    </div>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )}

                    {selectedRoutes.length > 0 && (
                      <div className="mt-3 bg-primary-100 border border-primary-200 rounded-lg px-4 py-2.5 flex justify-between items-center">
                        <span className="text-sm text-gray-700 flex items-center gap-2">
                          <Calculator className="w-4 h-4" />
                          {t('selectedRoutesCount', { count: selectedRoutes.length })}
                        </span>
                        <span className="text-lg font-bold text-primary-600">
                          €{calculateRoutesTotal().toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual pickup/dropoff fallback - only show when no itinerary routes available */}
                {itineraryTransportServices.length === 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('pickupLocation')}</label>
                      <input
                        type="text"
                        value={document.pickup_location || ''}
                        onChange={(e) => setDocument({ ...document, pickup_location: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('dropoffLocation')}</label>
                      <input
                        type="text"
                        value={document.dropoff_location || ''}
                        onChange={(e) => setDocument({ ...document, dropoff_location: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <hr className="border-gray-200" />

            {/* Special Requests */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('specialRequests')}</label>
              <textarea
                value={document.special_requests || ''}
                onChange={(e) => setDocument({ ...document, special_requests: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={t('specialRequestsPlaceholder')}
              />
            </div>

            {/* Internal Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('internalNotes')}</label>
              <textarea
                value={document.internal_notes || ''}
                onChange={(e) => setDocument({ ...document, internal_notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={t('internalNotesPlaceholder')}
              />
            </div>

            <hr className="border-gray-200" />

            {/* Payment */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('currency')}</label>
                <select
                  value={document.currency || 'EUR'}
                  onChange={(e) => setDocument({ ...document, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="EGP">EGP</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('totalCost')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={document.total_cost || 0}
                  onChange={(e) => setDocument({ ...document, total_cost: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('paymentTerms')}</label>
                <select
                  value={document.payment_terms || ''}
                  onChange={(e) => setDocument({ ...document, payment_terms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">{t('paymentTermsOptions.select')}</option>
                  <option value="prepaid">{t('paymentTermsOptions.prepaid')}</option>
                  <option value="credit">{t('paymentTermsOptions.credit')}</option>
                  <option value="on_service">{t('paymentTermsOptions.onService')}</option>
                  <option value="commission">{t('paymentTermsOptions.commission')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* ENTRANCE FEES SECTION - Only show for service orders / activity vouchers */}
          {isEntranceFeeDocument && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('entranceFees')}</h2>
                </div>
                <button
                  onClick={() => setShowAttractionPicker(true)}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {t('addAttraction')}
                </button>
              </div>

              {/* Selected Attractions Table */}
              {selectedAttractions.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('attraction')}</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('city')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('rate')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('qty')}</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('total')}</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedAttractions.map((attraction) => (
                        <tr key={attraction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{attraction.attraction_name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {attraction.city}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-gray-700">€{attraction.eur_rate.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={attraction.quantity}
                              onChange={(e) => updateAttractionQuantity(attraction.id, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-primary-600">
                              €{(attraction.eur_rate * attraction.quantity).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeAttraction(attraction.id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-primary-50 border-t border-primary-200">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-700 flex items-center justify-end gap-2">
                            <Calculator className="w-4 h-4" />
                            {t('totalEntranceFees')}:
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-lg font-bold text-primary-600">
                            €{calculateAttractionsTotal().toFixed(2)}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                  <Ticket className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">{t('noAttractionsSelected')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('noAttractionsHint')}</p>
                </div>
              )}

              {/* Attraction Picker Modal */}
              {showAttractionPicker && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">{t('selectAttractions')}</h3>
                        <button
                          onClick={() => {
                            setShowAttractionPicker(false)
                            setAttractionSearch('')
                            setSelectedCity('')
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={t('searchAttractionsPlaceholder')}
                          value={attractionSearch}
                          onChange={(e) => setAttractionSearch(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          autoFocus
                        />
                        <select
                          value={selectedCity}
                          onChange={(e) => setSelectedCity(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">{t('allCities')}</option>
                          {cities.map(city => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="overflow-y-auto max-h-[50vh]">
                      {loadingFees ? (
                        <div className="p-8 text-center">
                          <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </div>
                      ) : filteredAttractions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <p className="text-sm">{t('noAttractionsFound')}</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {filteredAttractions.map(fee => (
                            <button
                              key={fee.id}
                              onClick={() => addAttraction(fee)}
                              className="w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors flex items-center justify-between"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">{fee.attraction_name}</p>
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3" />
                                  {fee.city}
                                  {fee.is_addon && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                                      {t('addon')}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-primary-600">€{fee.eur_rate.toFixed(2)}</p>
                                {fee.non_eur_rate > 0 && fee.non_eur_rate !== fee.eur_rate && (
                                  <p className="text-xs text-gray-400">{t('nonEU')}: €{fee.non_eur_rate.toFixed(2)}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                      <p className="text-xs text-gray-500 text-center">
                        {t('attractionsAvailable', { count: entranceFees.length })} • {t('attractionsSelected', { count: selectedAttractions.length })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}