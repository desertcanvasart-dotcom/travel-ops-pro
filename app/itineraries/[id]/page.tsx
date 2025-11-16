'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { generateItineraryPDF } from '@/lib/pdf-generator'
import { generateWhatsAppMessage, generateWhatsAppLink, formatPhoneForWhatsApp } from '@/lib/communication-utils'

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

interface ItineraryDay {
  id: string
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
}

interface Service {
  id: string
  service_type: string
  service_name: string
  quantity: number
  rate_eur: number
  rate_non_eur: number
  total_cost: number
  notes: string
}

interface DayWithServices extends ItineraryDay {
  services: Service[]
}

export default function ViewItineraryPage() {
  const params = useParams()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<DayWithServices[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)

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

  const handleDownloadPDF = async () => {
    if (!itinerary || days.length === 0) return

    setGeneratingPDF(true)
    try {
      const pdf = generateItineraryPDF(itinerary, days)
      const filename = `${itinerary.itinerary_code}_${itinerary.client_name.replace(/\s+/g, '_')}.pdf`
      pdf.save(filename)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setGeneratingPDF(false)
    }
  }

  const handleSendWhatsApp = () => {
    if (!itinerary) return

    // Check if client has phone number
    if (!itinerary.client_phone) {
      alert('Client phone number is required for WhatsApp. Please add it in edit mode.')
      return
    }

    // Generate WhatsApp message
    const message = generateWhatsAppMessage(
      itinerary.client_name,
      itinerary.trip_name,
      itinerary.total_cost.toFixed(2),
      itinerary.currency
    )

    // Format phone number for WhatsApp
    const formattedPhone = formatPhoneForWhatsApp(itinerary.client_phone)

    // Generate WhatsApp link
    const whatsappUrl = generateWhatsAppLink(formattedPhone, message)

    // Mark as sent
    markAsSent('WhatsApp')

    // Open WhatsApp
    window.open(whatsappUrl, '_blank')
  }

  const handleSendEmail = async () => {
    if (!itinerary || days.length === 0) return

    // Check if client has email
    if (!itinerary.client_email) {
      alert('Client email is required. Please add it in edit mode.')
      return
    }

    setSendingEmail(true)
    setShowSendModal(false)
    
    try {
      // Generate PDF as base64
      const pdf = generateItineraryPDF(itinerary, days)
      const pdfBlob = pdf.output('blob')
      const pdfBase64 = await blobToBase64(pdfBlob)

      // Send email
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itineraryId: itinerary.id,
          clientName: itinerary.client_name,
          clientEmail: itinerary.client_email,
          itineraryCode: itinerary.itinerary_code,
          tripName: itinerary.trip_name,
          totalCost: itinerary.total_cost.toFixed(2),
          currency: itinerary.currency,
          pdfBase64: pdfBase64.split(',')[1] // Remove data:application/pdf;base64, prefix
        })
      })

      const data = await response.json()

      if (data.success) {
        setSendSuccess('Email sent successfully! ✅')
        markAsSent('Email')
        setTimeout(() => setSendSuccess(null), 5000)
      } else {
        throw new Error(data.error || 'Failed to send email')
      }
    } catch (error) {
      console.error('Error sending email:', error)
      alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSendingEmail(false)
    }
  }

  const markAsSent = async (method: string) => {
    try {
      await fetch(`/api/itineraries/${params.id}/mark-sent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sentVia: method,
          recipientEmail: itinerary?.client_email
        })
      })
      
      // Update local state
      if (itinerary) {
        setItinerary({ ...itinerary, status: 'sent' })
      }
    } catch (error) {
      console.error('Error marking as sent:', error)
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
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

  const expandAll = () => {
    setExpandedDays(new Set(days.map(d => d.day_number)))
  }

  const collapseAll = () => {
    setExpandedDays(new Set())
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-green-100 text-green-800',
      completed: 'bg-purple-100 text-purple-800'
    }
    return styles[status as keyof typeof styles] || styles.draft
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Itinerary</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/itineraries" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            ← Back to List
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-8 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg">
                <span className="text-blue-600 text-xl font-bold">T2E</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold">{itinerary.trip_name}</h1>
                <p className="text-blue-100 text-sm">
                  {itinerary.itinerary_code} • {itinerary.client_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowSendModal(true)}
                className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium shadow-md flex items-center gap-2"
              >
                <span>📤</span>
                Send Quote
              </button>
              <button
                onClick={handleDownloadPDF}
                disabled={generatingPDF}
                className={`bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium shadow-md flex items-center gap-2 ${
                  generatingPDF ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {generatingPDF ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <span>📄</span>
                    Download PDF
                  </>
                )}
              </button>
              <Link 
                href={`/itineraries/${itinerary.id}/edit`}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium shadow-md flex items-center gap-2"
              >
                <span>✏️</span>
                Edit
              </Link>
              <Link 
                href="/itineraries"
                className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium shadow-md"
              >
                ← Back
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Success Message */}
      {sendSuccess && (
        <div className="container mx-auto px-4 pt-4">
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
            <p className="text-green-700 font-medium">{sendSuccess}</p>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Send Quote to Client</h3>
            <p className="text-gray-600 mb-6">
              Choose how you'd like to send the itinerary to <strong>{itinerary.client_name}</strong>
            </p>

            <div className="space-y-3">
              <button
                onClick={handleSendWhatsApp}
                disabled={!itinerary.client_phone}
                className={`w-full py-4 rounded-lg font-semibold flex items-center justify-center gap-3 transition-all ${
                  itinerary.client_phone
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                <span className="text-2xl">📱</span>
                <div className="text-left">
                  <div>Send via WhatsApp</div>
                  {itinerary.client_phone ? (
                    <div className="text-sm opacity-80">{itinerary.client_phone}</div>
                  ) : (
                    <div className="text-sm opacity-80">No phone number</div>
                  )}
                </div>
              </button>

              <button
                onClick={handleSendEmail}
                disabled={!itinerary.client_email || sendingEmail}
                className={`w-full py-4 rounded-lg font-semibold flex items-center justify-center gap-3 transition-all ${
                  itinerary.client_email && !sendingEmail
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {sendingEmail ? (
                  <>
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Sending Email...</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">📧</span>
                    <div className="text-left">
                      <div>Send via Email</div>
                      {itinerary.client_email ? (
                        <div className="text-sm opacity-80">{itinerary.client_email}</div>
                      ) : (
                        <div className="text-sm opacity-80">No email address</div>
                      )}
                    </div>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => setShowSendModal(false)}
              className="w-full mt-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        {/* Rest of the itinerary view (same as before) */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Client</p>
              <p className="text-lg font-semibold text-gray-900">{itinerary.client_name}</p>
              {itinerary.client_email && (
                <p className="text-sm text-gray-600">{itinerary.client_email}</p>
              )}
              {itinerary.client_phone && (
                <p className="text-sm text-gray-600">{itinerary.client_phone}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Dates</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(itinerary.start_date).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">
                to {new Date(itinerary.end_date).toLocaleDateString()}
              </p>
              <p className="text-sm text-blue-600 font-medium mt-1">
                {itinerary.total_days} days
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Passengers</p>
              <p className="text-lg font-semibold text-gray-900">
                {itinerary.num_adults} {itinerary.num_adults === 1 ? 'adult' : 'adults'}
              </p>
              {itinerary.num_children > 0 && (
                <p className="text-sm text-gray-600">
                  {itinerary.num_children} {itinerary.num_children === 1 ? 'child' : 'children'}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Cost</p>
              <p className="text-2xl font-bold text-green-600">
                {itinerary.currency} {itinerary.total_cost.toFixed(2)}
              </p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(itinerary.status)}`}>
                {itinerary.status.charAt(0).toUpperCase() + itinerary.status.slice(1)}
              </span>
            </div>
          </div>
          {itinerary.notes && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">Notes</p>
              <p className="text-gray-700">{itinerary.notes}</p>
            </div>
          )}
        </div>

        {/* Day Controls */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Daily Itinerary</h2>
          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Days List */}
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
              <button
                onClick={() => toggleDay(day.day_number)}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white flex items-center justify-between hover:from-blue-600 hover:to-blue-700 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center font-bold text-xl">
                    {day.day_number}
                  </div>
                  <div className="text-left">
                    <h3 className="text-xl font-bold">{day.title || `Day ${day.day_number}`}</h3>
                    <p className="text-blue-100 text-sm">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      {day.city && ` • ${day.city}`}
                    </p>
                  </div>
                </div>
                <span className="text-2xl">
                  {expandedDays.has(day.day_number) ? '▼' : '▶'}
                </span>
              </button>

              {expandedDays.has(day.day_number) && (
                <div className="p-6">
                  {day.description && (
                    <div className="mb-6">
                      <p className="text-gray-700">{day.description}</p>
                    </div>
                  )}

                  {day.services && day.services.length > 0 ? (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Services Included</h4>
                      <div className="space-y-3">
                        {day.services.map((service) => (
                          <div key={service.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-3 flex-1">
                              <span className="text-2xl">{getServiceIcon(service.service_type)}</span>
                              <div>
                                <p className="font-medium text-gray-900">{service.service_name}</p>
                                <p className="text-sm text-gray-500 capitalize">
                                  {service.service_type.replace('_', ' ')} 
                                  {service.quantity > 1 && ` • Qty: ${service.quantity}`}
                                </p>
                                {service.notes && (
                                  <p className="text-sm text-gray-600 mt-1">{service.notes}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-green-600">
                                {itinerary.currency} {service.total_cost.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No services added yet</p>
                    </div>
                  )}

                  {day.overnight_city && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600">
                        🌙 Overnight in <span className="font-medium">{day.overnight_city}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {days.length === 0 && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <p className="text-gray-500 text-lg">No days planned yet</p>
          </div>
        )}
      </div>
    </div>
  )
}