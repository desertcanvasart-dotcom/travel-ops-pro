'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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
}

export default function EditItineraryPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))

  useEffect(() => {
    if (params.id) {
      fetchItinerary()
    }
  }, [params.id])

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
              // Recalculate total if quantity or rate changed
              if (field === 'quantity' || field === 'rate_eur') {
                updated.total_cost = updated.quantity * updated.rate_eur * 1.25 // 25% markup
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
      // Update itinerary
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

      // Update days and services
      for (const day of days) {
        // Update day
        await fetch(`/api/itineraries/${params.id}/days/${day.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(day)
        })

        // Update services
        for (const service of day.services) {
          await fetch(`/api/itineraries/${params.id}/days/${day.id}/services/${service.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(service)
          })
        }
      }

      // Redirect to view page
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
      transportation: '🚗',
      guide: '👨‍🏫',
      entrance: '🎫',
      meal: '🍽️',
      activity: '🎭',
      service_fee: '💼'
    }
    return icons[type] || '📋'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading itinerary...</p>
        </div>
      </div>
    )
  }

  if (error || !itinerary) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/itineraries" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            ← Back to List
          </Link>
        </div>
      </div>
    )
  }

  const totalCost = calculateTotal()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-8 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg">
                <span className="text-blue-600 text-xl font-bold">T2E</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold">Edit Itinerary</h1>
                <p className="text-blue-100 text-sm">{itinerary.itinerary_code}</p>
              </div>
            </div>
            <Link 
              href={`/itineraries/${itinerary.id}`}
              className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium shadow-md"
            >
              ← Cancel
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Client Information */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span>👤</span>
            Client Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Client Name</label>
              <input
                type="text"
                value={itinerary.client_name}
                onChange={(e) => handleItineraryChange('client_name', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={itinerary.client_email}
                onChange={(e) => handleItineraryChange('client_email', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input
                type="tel"
                value={itinerary.client_phone || ''}
                onChange={(e) => handleItineraryChange('client_phone', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Trip Details */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span>✈️</span>
            Trip Details
          </h2>
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trip Name</label>
              <input
                type="text"
                value={itinerary.trip_name}
                onChange={(e) => handleItineraryChange('trip_name', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  value={itinerary.start_date}
                  onChange={(e) => handleItineraryChange('start_date', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  value={itinerary.end_date}
                  onChange={(e) => handleItineraryChange('end_date', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={itinerary.status}
                  onChange={(e) => handleItineraryChange('status', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Adults</label>
                <input
                  type="number"
                  min="1"
                  value={itinerary.num_adults}
                  onChange={(e) => handleItineraryChange('num_adults', parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Children</label>
                <input
                  type="number"
                  min="0"
                  value={itinerary.num_children}
                  onChange={(e) => handleItineraryChange('num_children', parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={itinerary.notes || ''}
                onChange={(e) => handleItineraryChange('notes', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Days and Services */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span>📋</span>
            Daily Itinerary & Services
          </h2>

          <div className="space-y-4">
            {days.map((day) => (
              <div key={day.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Day Header */}
                <button
                  onClick={() => toggleDay(day.day_number)}
                  className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                      {day.day_number}
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-gray-900">{day.title}</h3>
                      <p className="text-sm text-gray-500">{day.city}</p>
                    </div>
                  </div>
                  <span className="text-xl text-gray-400">
                    {expandedDays.has(day.day_number) ? '▼' : '▶'}
                  </span>
                </button>

                {/* Day Content */}
                {expandedDays.has(day.day_number) && (
                  <div className="p-6 space-y-6">
                    {/* Day Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Day Title</label>
                        <input
                          type="text"
                          value={day.title}
                          onChange={(e) => handleDayChange(day.id, 'title', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                        <input
                          type="text"
                          value={day.city}
                          onChange={(e) => handleDayChange(day.id, 'city', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                      <textarea
                        value={day.description}
                        onChange={(e) => handleDayChange(day.id, 'description', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    {/* Services */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Services</h4>
                      <div className="space-y-3">
                        {day.services.map((service) => (
                          <div key={service.id} className="p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{getServiceIcon(service.service_type)}</span>
                                <div>
                                  <p className="font-medium text-gray-900">{service.service_name}</p>
                                  <p className="text-sm text-gray-500 capitalize">{service.service_type.replace('_', ' ')}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemoveService(day.id, service.id)}
                                className="text-red-600 hover:text-red-700 px-3 py-1 rounded hover:bg-red-50 transition-colors"
                              >
                                🗑️ Remove
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={service.quantity}
                                  onChange={(e) => handleServiceChange(day.id, service.id, 'quantity', parseInt(e.target.value))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-600 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Rate (EUR)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={service.rate_eur}
                                  onChange={(e) => handleServiceChange(day.id, service.id, 'rate_eur', parseFloat(e.target.value))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-600 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Total (with markup)</label>
                                <input
                                  type="text"
                                  value={`€${service.total_cost.toFixed(2)}`}
                                  disabled
                                  className="w-full px-3 py-2 border border-gray-300 rounded bg-green-50 text-green-700 font-bold text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Total Cost Summary */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-8 text-white mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Total Cost (with 25% markup)</p>
              <p className="text-4xl font-bold">{itinerary.currency} {totalCost.toFixed(2)}</p>
              <p className="text-blue-100 text-sm mt-2">
                Per person: {itinerary.currency} {(totalCost / (itinerary.num_adults + itinerary.num_children)).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-sm">Total Services</p>
              <p className="text-3xl font-bold">{days.reduce((sum, day) => sum + day.services.length, 0)}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4">
          <Link
            href={`/itineraries/${itinerary.id}`}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center gap-2 ${
              saving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <span>💾</span>
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}