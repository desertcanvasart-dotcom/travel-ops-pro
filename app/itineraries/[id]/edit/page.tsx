'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, ChevronDown, ChevronRight, Trash2, User, Plane, Calendar, Users, FileText, Building, Percent } from 'lucide-react'

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email: string
  client_phone: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  currency: string
  total_cost: number
  status: string
  notes: string
}

interface Day {
  id: string
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
  services: Service[]
}

interface Service {
  id: string
  service_type: string
  service_code: string
  service_name: string
  quantity: number
  rate_eur: number
  total_cost: number
  notes: string
  supplier_id?: string
  supplier_name?: string
  commission_rate?: number
  commission_amount?: number
  commission_status?: string
}

interface Supplier {
  id: string
  name: string
  type: string
  default_commission_rate: number | null
  commission_type: string | null
}

export default function EditItineraryPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletedServices, setDeletedServices] = useState<{dayId: string, serviceId: string}[]>([])
  
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))

  useEffect(() => {
    if (params.id) {
      fetchItinerary()
      fetchSuppliers()
    }
  }, [params.id])

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?status=active')
      if (response.ok) {
        const result = await response.json()
        setSuppliers(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  const fetchItinerary = async () => {
    try {
      const itinResponse = await fetch(`/api/itineraries/${params.id}`)
      const itinData = await itinResponse.json()

      if (!itinData.success) {
        setError('Itinerary not found')
        setLoading(false)
        return
      }

      setItinerary(itinData.data)

      const daysResponse = await fetch(`/api/itineraries/${params.id}/days`)
      const daysData = await daysResponse.json()

      if (daysData.success) {
        setDays(daysData.data)
      }

      setLoading(false)
    } catch (err) {
      setError('Error loading itinerary')
      setLoading(false)
    }
  }

  const handleItineraryChange = (field: keyof Itinerary, value: any) => {
    if (itinerary) {
      setItinerary({
        ...itinerary,
        [field]: value
      })
    }
  }

  const handleDayChange = (dayId: string, field: keyof Day, value: any) => {
    setDays(days.map(day => 
      day.id === dayId ? { ...day, [field]: value } : day
    ))
  }

  const handleServiceChange = (dayId: string, serviceId: string, field: keyof Service, value: any) => {
    setDays(days.map(day => {
      if (day.id === dayId) {
        return {
          ...day,
          services: day.services.map(service => {
            if (service.id === serviceId) {
              const updated = { ...service, [field]: value }
              
              // If supplier changed, update supplier name and commission rate
              if (field === 'supplier_id' && value) {
                const selectedSupplier = suppliers.find(s => s.id === value)
                if (selectedSupplier) {
                  updated.supplier_name = selectedSupplier.name
                  updated.commission_rate = selectedSupplier.default_commission_rate || 0
                  // Recalculate commission amount
                  if (updated.total_cost && updated.commission_rate) {
                    updated.commission_amount = (updated.total_cost * updated.commission_rate) / 100
                  }
                }
              }
              
              // Recalculate total if quantity or rate changed
              if (field === 'quantity' || field === 'rate_eur') {
                updated.total_cost = updated.quantity * updated.rate_eur * 1.25 // 25% markup
                // Also recalculate commission
                if (updated.commission_rate) {
                  updated.commission_amount = (updated.total_cost * updated.commission_rate) / 100
                }
              }
              
              // Recalculate commission if rate changed
              if (field === 'commission_rate') {
                updated.commission_amount = (updated.total_cost * (value || 0)) / 100
              }
              
              return updated
            }
            return service
          })
        }
      }
      return day
    }))
  }

  const handleRemoveService = (dayId: string, serviceId: string) => {
    if (confirm('Are you sure you want to remove this service?')) {
      setDeletedServices(prev => [...prev, { dayId, serviceId }])
      setDays(days.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            services: day.services.filter(service => service.id !== serviceId)
          }
        }
        return day
      }))
    }
  }

  const calculateTotal = () => {
    let total = 0
    days.forEach(day => {
      day.services.forEach(service => {
        total += service.total_cost
      })
    })
    return total
  }

  const handleSave = async () => {
    if (!itinerary) return
  
    setSaving(true)
    setError(null)
  
    try {
      // 1. Delete removed services FIRST
      for (const { dayId, serviceId } of deletedServices) {
        const response = await fetch(
          `/api/itineraries/${params.id}/days/${dayId}/services/${serviceId}`,
          { method: 'DELETE' }
        )
        if (!response.ok) {
          console.error(`Failed to delete service ${serviceId}`)
        }
      }
  
      // 2. Update itinerary
      const updatedItinerary = {
        ...itinerary,
        total_cost: calculateTotal()
      }
  
      const itinResponse = await fetch(`/api/itineraries/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItinerary)
      })
  
      if (!itinResponse.ok) {
        throw new Error('Failed to update itinerary')
      }
  
      // 3. Update days and services
      for (const day of days) {
        await fetch(`/api/itineraries/${params.id}/days/${day.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(day)
        })
  
        for (const service of day.services) {
          await fetch(`/api/itineraries/${params.id}/days/${day.id}/services/${service.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(service)
          })
        }
      }
  
      setDeletedServices([])
      router.push(`/itineraries/${params.id}`)
    } catch (err) {
      setError('Failed to save changes')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (dayNumber: number) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dayNumber)) {
        newSet.delete(dayNumber)
      } else {
        newSet.add(dayNumber)
      }
      return newSet
    })
  }

  const getServiceIcon = (type: string) => {
    const icons: Record<string, string> = {
      accommodation: '🏨',
      hotel: '🏨',
      transportation: '🚗',
      transport: '🚗',
      guide: '👨‍🏫',
      entrance: '🎫',
      meal: '🍽️',
      restaurant: '🍽️',
      activity: '🎭',
      service_fee: '💼',
      tips: '💰',
      supplies: '📦',
      cruise: '🚢',
      shopping: '🛍️'
    }
    return icons[type] || '📋'
  }

  // Filter suppliers by service type
  const getSuppliersByType = (serviceType: string) => {
    const typeMap: Record<string, string[]> = {
      accommodation: ['hotel'],
      hotel: ['hotel'],
      transportation: ['transport', 'driver'],
      transport: ['transport', 'driver'],
      guide: ['guide'],
      entrance: ['attraction'],
      meal: ['restaurant'],
      restaurant: ['restaurant'],
      activity: ['activity_provider', 'tour_operator'],
      cruise: ['cruise'],
      shopping: ['shop']
    }
    
    const supplierTypes = typeMap[serviceType] || []
    if (supplierTypes.length === 0) return suppliers
    
    return suppliers.filter(s => supplierTypes.includes(s.type))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading itinerary...</p>
        </div>
      </div>
    )
  }

  if (error || !itinerary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-500">⚠️</span>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Error</h2>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Link href="/itineraries" className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </Link>
        </div>
      </div>
    )
  }

  const totalCost = calculateTotal()
  const totalServices = days.reduce((sum, day) => sum + day.services.length, 0)
  const totalCommission = days.reduce((sum, day) => 
    sum + day.services.reduce((sSum, s) => sSum + (s.commission_amount || 0), 0), 0
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Compact Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link 
                href={`/itineraries/${itinerary.id}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Cancel"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Edit Itinerary</h1>
                <p className="text-xs text-gray-500">
                  <span className="font-mono text-primary-600">{itinerary.itinerary_code}</span>
                </p>
              </div>
            </div>
            <Link 
              href={`/itineraries/${itinerary.id}`}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Client Information */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-primary-50 rounded flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-primary-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Client Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Name</label>
              <input
                type="text"
                value={itinerary.client_name}
                onChange={(e) => handleItineraryChange('client_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={itinerary.client_email}
                onChange={(e) => handleItineraryChange('client_email', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                value={itinerary.client_phone || ''}
                onChange={(e) => handleItineraryChange('client_phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Trip Details */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-blue-50 rounded flex items-center justify-center">
              <Plane className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Trip Details</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Trip Name</label>
              <input
                type="text"
                value={itinerary.trip_name}
                onChange={(e) => handleItineraryChange('trip_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={itinerary.start_date}
                  onChange={(e) => handleItineraryChange('start_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={itinerary.end_date}
                  onChange={(e) => handleItineraryChange('end_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={itinerary.status}
                  onChange={(e) => handleItineraryChange('status', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Adults</label>
                <input
                  type="number"
                  min="1"
                  value={itinerary.num_adults}
                  onChange={(e) => handleItineraryChange('num_adults', parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Children</label>
                <input
                  type="number"
                  min="0"
                  value={itinerary.num_children}
                  onChange={(e) => handleItineraryChange('num_children', parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={itinerary.notes || ''}
                onChange={(e) => handleItineraryChange('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        {/* Days and Services */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-purple-50 rounded flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Daily Itinerary & Services</h2>
          </div>

          <div className="space-y-3">
            {days.map((day) => (
              <div key={day.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Day Header */}
                <button
                  onClick={() => toggleDay(day.day_number)}
                  className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-600 text-white rounded-lg flex items-center justify-center font-semibold text-sm">
                      {day.day_number}
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold text-gray-900">{day.title}</h3>
                      <p className="text-xs text-gray-500">{day.city}</p>
                    </div>
                  </div>
                  {expandedDays.has(day.day_number) ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {/* Day Content */}
                {expandedDays.has(day.day_number) && (
                  <div className="p-4 space-y-4">
                    {/* Day Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Day Title</label>
                        <input
                          type="text"
                          value={day.title}
                          onChange={(e) => handleDayChange(day.id, 'title', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                        <input
                          type="text"
                          value={day.city}
                          onChange={(e) => handleDayChange(day.id, 'city', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <textarea
                        value={day.description}
                        onChange={(e) => handleDayChange(day.id, 'description', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"
                      />
                    </div>

                    {/* Services */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-700 mb-2">Services</h4>
                      <div className="space-y-3">
                        {day.services.map((service) => (
                          <div key={service.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getServiceIcon(service.service_type)}</span>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                                  <p className="text-xs text-gray-500 capitalize">{service.service_type.replace('_', ' ')}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemoveService(day.id, service.id)}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </button>
                            </div>

                            {/* Supplier Selection */}
                            <div className="mb-3 p-2 bg-white rounded border border-gray-200">
                              <div className="flex items-center gap-2 mb-2">
                                <Building className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-xs font-medium text-gray-700">Supplier & Commission</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Supplier</label>
                                  <select
                                    value={service.supplier_id || ''}
                                    onChange={(e) => handleServiceChange(day.id, service.id, 'supplier_id', e.target.value || null)}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                                  >
                                    <option value="">Select Supplier</option>
                                    {getSuppliersByType(service.service_type).map(s => (
                                      <option key={s.id} value={s.id}>
                                        {s.name} {s.default_commission_rate ? `(${s.default_commission_rate}%)` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Commission %</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="100"
                                      value={service.commission_rate || ''}
                                      onChange={(e) => handleServiceChange(day.id, service.id, 'commission_rate', parseFloat(e.target.value) || 0)}
                                      placeholder="0"
                                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Commission €</label>
                                  <input
                                    type="text"
                                    value={`€${(service.commission_amount || 0).toFixed(2)}`}
                                    disabled
                                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-green-50 text-green-700 font-medium"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Pricing */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={service.quantity}
                                  onChange={(e) => handleServiceChange(day.id, service.id, 'quantity', parseInt(e.target.value))}
                                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Rate (EUR)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={service.rate_eur}
                                  onChange={(e) => handleServiceChange(day.id, service.id, 'rate_eur', parseFloat(e.target.value))}
                                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Total (with markup)</label>
                                <input
                                  type="text"
                                  value={`€${service.total_cost.toFixed(2)}`}
                                  disabled
                                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-primary-50 text-primary-700 font-semibold"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        {day.services.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-4">No services added for this day</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Total Cost Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-primary-600">💰</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
            </div>
            <p className="text-xl font-bold text-gray-900">{itinerary.currency} {totalCost.toFixed(2)}</p>
            <p className="text-xs text-gray-500">Total Cost</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-green-600">💵</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            </div>
            <p className="text-xl font-bold text-green-600">€{totalCommission.toFixed(2)}</p>
            <p className="text-xs text-gray-500">Est. Commission</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-blue-600">👤</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            </div>
            <p className="text-xl font-bold text-gray-900">{itinerary.currency} {(totalCost / (itinerary.num_adults + itinerary.num_children)).toFixed(2)}</p>
            <p className="text-xs text-gray-500">Per Person</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-purple-600">📋</span>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            </div>
            <p className="text-xl font-bold text-gray-900">{totalServices}</p>
            <p className="text-xs text-gray-500">Total Services</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-orange-600">📅</span>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            </div>
            <p className="text-xl font-bold text-gray-900">{days.length}</p>
            <p className="text-xs text-gray-500">Days</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 pb-4">
          <Link
            href={`/itineraries/${itinerary.id}`}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2 ${
              saving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}