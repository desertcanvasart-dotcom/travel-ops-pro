'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Download, Send, Edit2, ChevronDown, ChevronUp, Receipt, Calculator, Settings, Check, X, Handshake, Briefcase } from 'lucide-react'
import { generateItineraryPDF } from '@/lib/pdf-generator'
import ResourceAssignmentV2 from '@/app/components/ResourceAssignmentV2'
import ResourceSummaryCard from '@/app/components/ResourceSummaryCard'
import WhatsAppButton from '@/app/components/whatsapp/whatsapp-button'
import { generateWhatsAppMessage, generateWhatsAppLink, formatPhoneForWhatsApp } from '@/lib/communication-utils'
import AddExpenseFromItinerary from '@/components/AddExpenseFromItinerary'
import ItineraryPL from '@/app/components/ItineraryPL'
import { createClient } from '@/lib/supabase'
import GenerateDocumentsButton from '@/app/components/GenerateDocumentsButton'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { LanguageTabs, CreateVersionPrompt } from '@/components/multilingual'
import type { Language, ItineraryVersion } from '@/types/multilingual'

interface Itinerary {
  id: string
  itinerary_code: string
  client_id?: string
  client_name: string
  client_email: string
  client_phone: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number   // Ages 4-12: 50% discount
  num_infants: number    // Ages 0-3: FREE except flights
  currency: string
  total_cost: number
  status: string
  notes: string
  assigned_guide_id: string
  assigned_vehicle_id: string
  guide_notes: string
  vehicle_notes: string
  pickup_location: string
  pickup_time: string
  cost_mode?: 'auto' | 'manual'
  tier?: string
  available_languages?: Language[]
  versions?: Record<string, ItineraryVersion>
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

interface ExistingInvoice {
  id: string
  invoice_number: string
  status: string
}

export default function ViewItineraryPage() {
  const t = useTranslations('itineraries.detail')
  const tEdit = useTranslations('itineraries.edit')
  const tCommon = useTranslations('common')
  const dialog = useConfirmDialog()
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const currentLocale = useLocale() as Language

  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<DayWithServices[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))

  // Multilingual state
  const [activeLanguage, setActiveLanguage] = useState<Language>(currentLocale)
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [existingInvoice, setExistingInvoice] = useState<ExistingInvoice | null>(null)
  const [generatingCommissions, setGeneratingCommissions] = useState(false)
  const [commissionResult, setCommissionResult] = useState<string | null>(null)
  const [existingBooking, setExistingBooking] = useState<{ id: string; booking_code: string } | null>(null)
  const [creatingBooking, setCreatingBooking] = useState(false)

  // Cost Mode State
  const [costMode, setCostMode] = useState<'auto' | 'manual'>('auto')
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [editedCost, setEditedCost] = useState<string>('')
  const [savingCostMode, setSavingCostMode] = useState(false)
  const [savingServiceCost, setSavingServiceCost] = useState(false)
  const [costModeChanged, setCostModeChanged] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchItinerary()
      checkExistingInvoice()
      checkExistingBooking()
    }
  }, [params.id])

  // Fetch days when language changes
  useEffect(() => {
    if (params.id) {
      fetchDays(activeLanguage)
    }
  }, [params.id, activeLanguage])

  const fetchDays = async (language: Language) => {
    try {
      const daysResponse = await fetch(`/api/itineraries/${params.id}/days?language=${language}`)
      const daysData = await daysResponse.json()
      if (daysData.success) {
        setDays(daysData.data)
      }
    } catch (err) {
      console.error('Error fetching days:', err)
    }
  }

  const fetchItinerary = async () => {
    try {
      const itinResponse = await fetch(`/api/itineraries/${params.id}`)
      const itinData = await itinResponse.json()

      if (!itinData.success) {
        setError(t('itineraryNotFound'))
        setLoading(false)
        return
      }

      setItinerary(itinData.data)
      setCostMode(itinData.data.cost_mode || 'auto')

      // Fetch days will be done separately when activeLanguage changes
      setLoading(false)
    } catch (err) {
      setError(t('errorLoadingItinerary'))
      setLoading(false)
    }
  }

  const checkExistingInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices?itineraryId=${params.id}`)
      if (response.ok) {
        const invoices = await response.json()
        if (invoices && invoices.length > 0) {
          setExistingInvoice(invoices[0])
        }
      }
    } catch (error) {
      console.error('Error checking existing invoice:', error)
    }
  }

  const checkExistingBooking = async () => {
    try {
      const response = await fetch(`/api/bookings?search=${params.id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data && data.data.length > 0) {
          // Find booking that matches this itinerary
          const booking = data.data.find((b: any) => b.itinerary_id === params.id)
          if (booking) {
            setExistingBooking({ id: booking.id, booking_code: booking.booking_code })
          }
        }
      }
    } catch (error) {
      console.error('Error checking existing booking:', error)
    }
  }

  const handleCreateBooking = async () => {
    setCreatingBooking(true)
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary_id: params.id })
      })
      const data = await response.json()

      if (data.success) {
        setExistingBooking({ id: data.data.id, booking_code: data.data.booking_code })
        setSendSuccess(t('bookingCreatedSuccessfully'))
        setTimeout(() => setSendSuccess(null), 5000)
      } else {
        if (data.existing_booking) {
          setExistingBooking({ id: data.existing_booking.id, booking_code: data.existing_booking.booking_code })
        } else {
          await dialog.alert(tCommon('error'), data.error || t('failedToCreateBooking'), 'warning')
        }
      }
    } catch (error) {
      console.error('Error creating booking:', error)
      await dialog.alert(tCommon('error'), t('failedToCreateBooking'), 'warning')
    } finally {
      setCreatingBooking(false)
    }
  }

  const handleToggleCostMode = async () => {
    const newMode = costMode === 'auto' ? 'manual' : 'auto'
    setSavingCostMode(true)
    
    try {
      const { error } = await supabase
        .from('itineraries')
        .update({ cost_mode: newMode })
        .eq('id', params.id)

      if (error) throw error

      setCostMode(newMode)
      setCostModeChanged(true)
      setTimeout(() => setCostModeChanged(false), 2000)
      
      if (itinerary) {
        setItinerary({ ...itinerary, cost_mode: newMode })
      }
    } catch (error) {
      console.error('Error updating cost mode:', error)
      await dialog.alert(tCommon('error'), t('failedToUpdateCostMode'), 'warning')
    } finally {
      setSavingCostMode(false)
    }
  }

  const handleStartEditCost = (service: Service) => {
    if (costMode !== 'manual') return
    setEditingServiceId(service.id)
    setEditedCost(service.total_cost.toString())
  }

  const handleCancelEditCost = () => {
    setEditingServiceId(null)
    setEditedCost('')
  }

  const handleSaveServiceCost = async (serviceId: string, dayId: string) => {
    const newCost = parseFloat(editedCost)
    if (isNaN(newCost) || newCost < 0) {
      await dialog.alert(tCommon('error'), t('pleaseEnterValidCost'), 'warning')
      return
    }

    setSavingServiceCost(true)
    
    try {
      const { error } = await supabase
        .from('itinerary_services')
        .update({ total_cost: newCost })
        .eq('id', serviceId)

      if (error) throw error

      setDays(prevDays => prevDays.map(day => {
        if (day.id === dayId) {
          return {
            ...day,
            services: day.services.map(s => 
              s.id === serviceId ? { ...s, total_cost: newCost } : s
            )
          }
        }
        return day
      }))

      let newTotalCost = 0
      days.forEach(day => {
        day.services.forEach(s => {
          if (s.id === serviceId) {
            newTotalCost += newCost
          } else {
            newTotalCost += s.total_cost
          }
        })
      })

      await supabase
        .from('itineraries')
        .update({ total_cost: newTotalCost })
        .eq('id', params.id)

      if (itinerary) {
        setItinerary({ ...itinerary, total_cost: newTotalCost })
      }

      setEditingServiceId(null)
      setEditedCost('')
    } catch (error) {
      console.error('Error updating service cost:', error)
      await dialog.alert(tCommon('error'), t('failedToUpdateCost'), 'warning')
    } finally {
      setSavingServiceCost(false)
    }
  }
  const handleGenerateCommissions = async () => {
    if (!itinerary) return

    setGeneratingCommissions(true)
    try {
      const response = await fetch(`/api/itineraries/${itinerary.id}/generate-commissions`, {
        method: 'POST'
      })

      const result = await response.json()

      if (result.success) {
        setCommissionResult(`✅ ${result.message}`)
        setTimeout(() => setCommissionResult(null), 5000)
      } else {
        await dialog.alert(tCommon('error'), result.error || t('failedToGenerateCommissions'), 'warning')
      }
    } catch (error) {
      console.error('Error generating commissions:', error)
      await dialog.alert(tCommon('error'), t('failedToGenerateCommissions'), 'warning')
    } finally {
      setGeneratingCommissions(false)
    }
  }

  const handleGenerateInvoice = async () => {
    if (!itinerary) return

    if (existingInvoice) {
      router.push(`/invoices/${existingInvoice.id}`)
      return
    }

    setGeneratingInvoice(true)
    try {
      let clientId = itinerary.client_id || null
      
      if (!clientId) {
        const clientsResponse = await fetch('/api/clients')
        if (clientsResponse.ok) {
          const clientsData = await clientsResponse.json()
          const clients = clientsData.success ? clientsData.data : (Array.isArray(clientsData) ? clientsData : [])
          
          const matchingClient = clients.find((c: any) => {
            const clientEmail = c.email?.toLowerCase()
            const clientName = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()
            
            if (itinerary.client_email && clientEmail === itinerary.client_email.toLowerCase()) {
              return true
            }
            if (clientName.toLowerCase() === itinerary.client_name?.toLowerCase()) {
              return true
            }
            if (itinerary.client_phone && c.phone && c.phone.replace(/\D/g, '') === itinerary.client_phone.replace(/\D/g, '')) {
              return true
            }
            return false
          })
          
          if (matchingClient) {
            clientId = matchingClient.id
          }
        }
      }
  
      if (!clientId && itinerary.client_name) {
        const nameParts = itinerary.client_name.trim().split(' ')
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''
        
        const createClientResponse = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: itinerary.client_email || '',
            phone: itinerary.client_phone || '',
            status: 'active',
            source: 'itinerary'
          })
        })
        
        if (createClientResponse.ok) {
          const newClientData = await createClientResponse.json()
          clientId = newClientData.data?.id || newClientData.id
        }
      }
  
      const lineItems = [{
        description: `${itinerary.trip_name} - ${itinerary.itinerary_code}`,
        quantity: 1,
        unit_price: itinerary.total_cost,
        amount: itinerary.total_cost
      }]
  
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          itinerary_id: itinerary.id,
          client_name: itinerary.client_name,
          client_email: itinerary.client_email,
          line_items: lineItems,
          subtotal: itinerary.total_cost,
          tax_rate: 0,
          tax_amount: 0,
          discount_amount: 0,
          total_amount: itinerary.total_cost,
          currency: itinerary.currency || 'EUR',
          issue_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          payment_terms: t('paymentDueWithin14Days'),
          notes: t('tripDatesNote', {
            startDate: new Date(itinerary.start_date).toLocaleDateString(),
            endDate: new Date(itinerary.end_date).toLocaleDateString()
          })
        })
      })

      if (response.ok) {
        const invoice = await response.json()
        router.push(`/invoices/${invoice.id}`)
      } else {
        const error = await response.json()
        await dialog.alert(tCommon('error'), error.error || t('failedToCreateInvoice'), 'warning')
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      await dialog.alert(tCommon('error'), t('failedToCreateInvoice'), 'warning')
    } finally {
      setGeneratingInvoice(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!itinerary || days.length === 0) return

    setGeneratingPDF(true)
    try {
      const pdf = await generateItineraryPDF(itinerary, days)
      const filename = `${itinerary.itinerary_code}_${itinerary.client_name.replace(/\s+/g, '_')}.pdf`
      pdf.save(filename)
    } catch (error) {
      console.error('Error generating PDF:', error)
      await dialog.alert(tCommon('error'), t('failedToGeneratePDF'), 'warning')
    } finally {
      setGeneratingPDF(false)
    }
  }

  const handleSendWhatsApp = async () => {
    if (!itinerary) return

    if (!itinerary.client_phone) {
      await dialog.alert(tCommon('error'), t('clientPhoneRequired'), 'warning')
      return
    }
  
    setShowSendModal(false)
    setSendingEmail(true) // Reuse loading state for UI feedback
  
    try {
      const response = await fetch('/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: itinerary.id,
          clientPhone: itinerary.client_phone,
          clientName: itinerary.client_name
        })
      })
  
      const data = await response.json()
  
      if (!response.ok || !data.success) {
        throw new Error(data.error || t('failedToSendWhatsApp'))
      }
  
      markAsSent('WhatsApp')
      setSendSuccess(t('quoteSentWhatsApp'))
      setTimeout(() => setSendSuccess(null), 5000)
    } catch (error: any) {
      console.error('WhatsApp send error:', error)
      await dialog.alert(tCommon('error'), t('failedToSendWhatsAppError', { error: error.message }), 'warning')
    } finally {
      setSendingEmail(false)
    }
  }

  const handleSendEmail = async () => {
    if (!itinerary || days.length === 0) return

    if (!itinerary.client_email) {
      await dialog.alert(tCommon('error'), t('clientEmailRequired'), 'warning')
      return
    }

    setSendingEmail(true)
    setShowSendModal(false)
    
    try {
      const pdf = generateItineraryPDF(itinerary, days)
      const pdfBlob = pdf.output('blob')
      const pdfBase64 = await blobToBase64(pdfBlob)

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: itinerary.id,
          clientName: itinerary.client_name,
          clientEmail: itinerary.client_email,
          itineraryCode: itinerary.itinerary_code,
          tripName: itinerary.trip_name,
          totalCost: itinerary.total_cost.toFixed(2),
          currency: itinerary.currency,
          pdfBase64: pdfBase64.split(',')[1]
        })
      })

      const data = await response.json()

      if (data.success) {
        setSendSuccess(t('emailSentSuccessfully'))
        markAsSent('Email')
        setTimeout(() => setSendSuccess(null), 5000)
      } else {
        throw new Error(data.error || t('failedToSendEmail'))
      }
    } catch (error) {
      console.error('Error sending email:', error)
      await dialog.alert(tCommon('error'), t('failedToSendEmailError', { error: error instanceof Error ? error.message : tCommon('unknownError') }), 'warning')
    } finally {
      setSendingEmail(false)
    }
  }

  const markAsSent = async (method: string) => {
    try {
      await fetch(`/api/itineraries/${params.id}/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentVia: method,
          recipientEmail: itinerary?.client_email
        })
      })
      
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
      draft: 'bg-gray-50 text-gray-600 border-gray-200',
      sent: 'bg-primary-50 text-primary-600 border-primary-200',
      confirmed: 'bg-green-50 text-green-600 border-green-200',
      completed: 'bg-purple-50 text-purple-600 border-purple-200',
      cancelled: 'bg-red-50 text-red-600 border-red-200'
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
      service_fee: '💼',
      tips: '💰',
      supplies: '💧'
    }
    return icons[type] || '📋'
  }

  // Get content for active language version
  const getVersionedContent = () => {
    if (!itinerary?.versions) {
      return {
        trip_name: itinerary?.trip_name || '',
        notes: itinerary?.notes || '',
        pickup_location: itinerary?.pickup_location || '',
        guide_notes: itinerary?.guide_notes || '',
        vehicle_notes: itinerary?.vehicle_notes || ''
      }
    }
    const version = itinerary.versions[activeLanguage] || itinerary.versions['en']
    if (version) {
      return {
        trip_name: version.trip_name || itinerary.trip_name,
        notes: version.notes || itinerary.notes,
        pickup_location: version.pickup_location || itinerary.pickup_location,
        guide_notes: version.guide_notes || itinerary.guide_notes,
        vehicle_notes: version.vehicle_notes || itinerary.vehicle_notes
      }
    }
    return {
      trip_name: itinerary.trip_name,
      notes: itinerary.notes,
      pickup_location: itinerary.pickup_location,
      guide_notes: itinerary.guide_notes,
      vehicle_notes: itinerary.vehicle_notes
    }
  }

  const handleCreateVersion = async (language: Language) => {
    setCreatingVersion(true)
    try {
      const response = await fetch(`/api/itineraries/${params.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          trip_name: itinerary?.trip_name,
          notes: itinerary?.notes,
          pickup_location: itinerary?.pickup_location,
          guide_notes: itinerary?.guide_notes,
          vehicle_notes: itinerary?.vehicle_notes
        })
      })
      const data = await response.json()
      if (data.success) {
        // Refresh itinerary to get updated versions
        await fetchItinerary()
        setActiveLanguage(language)
      } else {
        await dialog.alert(tCommon('error'), data.error || t('failedToCreateVersion'), 'warning')
      }
    } catch (error) {
      console.error('Error creating version:', error)
      await dialog.alert(tCommon('error'), t('failedToCreateVersion'), 'warning')
    } finally {
      setCreatingVersion(false)
    }
  }

  const handleCopyAndTranslate = async (language: Language) => {
    setCreatingVersion(true)
    try {
      const response = await fetch(`/api/itineraries/${params.id}/versions/copy-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: language })
      })
      const data = await response.json()
      if (data.success) {
        // Refresh itinerary to get updated versions
        await fetchItinerary()
        setActiveLanguage(language)
      } else {
        await dialog.alert(tCommon('error'), data.error || t('failedToCreateVersion'), 'warning')
      }
    } catch (error) {
      console.error('Error copying and translating:', error)
      await dialog.alert(tCommon('error'), t('failedToCreateVersion'), 'warning')
    } finally {
      setCreatingVersion(false)
    }
  }

  const versionedContent = getVersionedContent()
  const availableLanguages = itinerary?.available_languages || []
  const hasActiveVersion = availableLanguages.includes(activeLanguage)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">{t('loadingItinerary')}</p>
        </div>
      </div>
    )
  }

  if (error || !itinerary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-500 text-xl">⚠️</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('errorLoadingTitle')}</h2>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Link href="/itineraries" className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {tCommon('backToList')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link 
                href="/itineraries"
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                title={tCommon('backToList')}
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{versionedContent.trip_name}</h1>
                <p className="text-sm text-gray-500">
                  <span className="font-mono text-primary-600">{itinerary.itinerary_code}</span>
                  <span className="mx-2">•</span>
                  {itinerary.client_name}
                  {itinerary.tier && (
                    <>
                      <span className="mx-2">•</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        itinerary.tier === 'luxury' ? 'bg-amber-100 text-amber-700' :
                        itinerary.tier === 'deluxe' ? 'bg-purple-100 text-purple-700' :
                        itinerary.tier === 'standard' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {itinerary.tier.toUpperCase()}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

{/* Edit Button Only */}
            <Link
              href={`/itineraries/${itinerary.id}/edit`}
              className="p-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              title={tCommon('edit')}
            >
              <Edit2 className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Language Tabs */}
      <div className="container mx-auto px-4 pt-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <LanguageTabs
            availableLanguages={availableLanguages}
            activeLanguage={activeLanguage}
            onLanguageChange={setActiveLanguage}
            onCreateVersion={handleCreateVersion}
            disabled={creatingVersion}
          />
          {!hasActiveVersion && (
            <div className="p-6">
              <CreateVersionPrompt
                entityType="itinerary"
                language={activeLanguage}
                onCreateFromScratch={() => handleCreateVersion(activeLanguage)}
                onCopyAndTranslate={() => handleCopyAndTranslate(activeLanguage)}
                isLoading={creatingVersion}
              />
            </div>
          )}
        </div>
      </div>

      {/* Success Messages */}
      {sendSuccess && (
        <div className="container mx-auto px-4 pt-3">
          <div className="bg-green-50 border border-green-200 p-3 rounded-md">
            <p className="text-sm text-green-700 font-medium">{sendSuccess}</p>
          </div>
        </div>
      )}

      {commissionResult && (
        <div className="container mx-auto px-4 pt-3">
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-md">
            <p className="text-sm text-emerald-700 font-medium">{commissionResult}</p>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('sendQuoteToClient')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('chooseHowToSend', { clientName: itinerary.client_name })}
            </p>

            <div className="space-y-2">
              <button
                onClick={handleSendWhatsApp}
                disabled={!itinerary.client_phone}
                className={`w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-all text-sm ${
                  itinerary.client_phone
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span className="text-lg">📱</span>
                <div className="text-left">
                  <div>{t('sendViaWhatsApp')}</div>
                  {itinerary.client_phone && (
                    <div className="text-xs opacity-80">{itinerary.client_phone}</div>
                  )}
                </div>
              </button>

              <button
                onClick={handleSendEmail}
                disabled={!itinerary.client_email || sendingEmail}
                className={`w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-all text-sm ${
                  itinerary.client_email && !sendingEmail
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {sendingEmail ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('sendingEmail')}</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">📧</span>
                    <div className="text-left">
                      <div>{t('sendViaEmail')}</div>
                      {itinerary.client_email && (
                        <div className="text-xs opacity-80">{itinerary.client_email}</div>
                      )}
                    </div>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => setShowSendModal(false)}
              className="w-full mt-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-4 space-y-4">
        {/* INFO CARD */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">{t('client')}</p>
              <p className="text-sm font-semibold text-gray-900">{itinerary.client_name}</p>
              {itinerary.client_email && (
                <p className="text-xs text-gray-600 truncate">{itinerary.client_email}</p>
              )}
              {itinerary.client_phone && (
                <p className="text-xs text-gray-600">{itinerary.client_phone}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{t('dates')}</p>
              <p className="text-sm font-semibold text-gray-900">
                {new Date(itinerary.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p className="text-xs text-gray-600">
                {t('to')} {new Date(itinerary.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p className="text-xs text-primary-600 font-medium mt-0.5">{t('daysCount', { count: itinerary.total_days })}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{t('passengers')}</p>
              <p className="text-sm font-semibold text-gray-900">
                {t('adultsCount', { count: itinerary.num_adults })}
              </p>
              {itinerary.num_children > 0 && (
                <p className="text-xs text-gray-600">{t('childrenCount', { count: itinerary.num_children })} (4-12)</p>
              )}
              {itinerary.num_infants > 0 && (
                <p className="text-xs text-gray-600">{t('infantsCount', { count: itinerary.num_infants })} (0-3)</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{t('totalCost')}</p>
              <p className="text-xl font-bold text-gray-900">{itinerary.currency} {itinerary.total_cost.toFixed(2)}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${getStatusBadge(itinerary.status)}`}>
                  {itinerary.status.charAt(0).toUpperCase() + itinerary.status.slice(1)}
                </span>
                {existingInvoice && (
                  <Link href={`/invoices/${existingInvoice.id}`} className="inline-block px-2 py-0.5 rounded border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100">
                    {existingInvoice.invoice_number}
                  </Link>
                )}
              </div>
            </div>
          </div>
          {versionedContent.notes && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-1">{t('notes')}</p>
              <p className="text-sm text-gray-700">{versionedContent.notes}</p>
            </div>
          )}
        </div>

        {/* COST MODE TOGGLE */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${costMode === 'auto' ? 'bg-blue-100' : 'bg-amber-100'}`}>
                {costMode === 'auto' ? <Calculator className="w-5 h-5 text-blue-600" /> : <Settings className="w-5 h-5 text-amber-600" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t('costCalculation')}: {costMode === 'auto' ? t('automatic') : t('manual')}</h3>
                <p className="text-xs text-gray-600">{costMode === 'auto' ? t('costsCalculatedFromDatabase') : t('clickToEditManually')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {costModeChanged && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Check className="w-3 h-3" />{tCommon('saved')}</span>}
              <button onClick={handleToggleCostMode} disabled={savingCostMode} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${costMode === 'manual' ? 'bg-amber-600' : 'bg-gray-300'} ${savingCostMode ? 'opacity-50' : ''}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${costMode === 'manual' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-xs font-medium text-gray-700">{costMode === 'manual' ? t('manual') : t('auto')}</span>
            </div>
          </div>
          {costMode === 'manual' && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">{t('manualModeDescription')}</p>
            </div>
          )}
        </div>

        {/* PROFIT & LOSS */}
        {days.length > 0 && <ItineraryPL itineraryId={itinerary.id} totalCost={itinerary.total_cost} currency={itinerary.currency} marginPercent={25} days={days} />}

        {/* WHATSAPP ACTIONS */}
        <div className="bg-white rounded-lg border border-green-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center"><span className="text-white text-lg">📱</span></div>
            <div><h3 className="text-sm font-semibold text-gray-900">{t('whatsappActions')}</h3><p className="text-xs text-gray-600">{t('sendUpdatesTo', { clientName: itinerary.client_name })}</p></div>
          </div>
          {!itinerary.client_phone && <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md"><p className="text-yellow-800 text-xs">{t('clientPhoneRequiredWarning')}</p></div>}
          {itinerary.client_phone && (
            <div className="flex flex-wrap items-center gap-2">
            {itinerary.status === 'draft' && <WhatsAppButton itineraryId={itinerary.id} type="status" status="confirmed" onSuccess={() => { setSendSuccess(t('bookingConfirmationSent')); setTimeout(() => setSendSuccess(null), 5000); fetchItinerary() }} className="bg-blue-600 hover:bg-blue-700" />}
            {itinerary.status !== 'completed' && <WhatsAppButton itineraryId={itinerary.id} type="status" status="pending_payment" onSuccess={() => { setSendSuccess(t('paymentReminderSent')); setTimeout(() => setSendSuccess(null), 5000) }} className="bg-yellow-600 hover:bg-yellow-700" />}
            <WhatsAppButton itineraryId={itinerary.id} type="status" status="paid" onSuccess={() => { setSendSuccess(t('paymentConfirmationSent')); setTimeout(() => setSendSuccess(null), 5000); fetchItinerary() }} className="bg-emerald-600 hover:bg-emerald-700" />
            <button
              type="button"
              onClick={() => setShowSendModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md hover:bg-primary-700"
            >
              <Send className="w-4 h-4" />
              {t('sendQuote')}
            </button>
          </div>
          )}
          {itinerary.client_phone && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-full"><span>📱</span><span>{itinerary.client_phone}</span></div>
                {itinerary.status === 'sent' && <div className="flex items-center gap-1.5 px-2 py-1 bg-primary-50 text-primary-700 rounded-full"><span>✅</span><span>{t('quoteSent')}</span></div>}
              </div>
            </div>
          )}
        </div>

{/* Action Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleGenerateInvoice}
              disabled={generatingInvoice}
              className={`h-10 px-4 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
                existingInvoice
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              } ${generatingInvoice ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={existingInvoice ? t('viewInvoiceNumber', { number: existingInvoice.invoice_number }) : t('generateInvoice')}
            >
              {generatingInvoice ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('creating')}</span>
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4" />
                  {existingInvoice ? existingInvoice.invoice_number : t('invoice')}
                </>
              )}
            </button>
            <button
              onClick={handleGenerateCommissions}
              disabled={generatingCommissions}
              className="h-10 px-4 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              title={t('generateCommissionRecords')}
            >
              {generatingCommissions ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('generating')}</span>
                </>
              ) : (
                <>
                  <Handshake className="w-4 h-4" />
                  <span>{t('commissions')}</span>
                </>
              )}
            </button>
            <GenerateDocumentsButton
              itineraryId={itinerary.id}
              itineraryCode={itinerary.itinerary_code}
            />
            <Link
              href={`/documents/contract/${itinerary.id}`}
              className="h-10 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {t('contract')}
            </Link>
            <button
              onClick={handleDownloadPDF}
              disabled={generatingPDF}
              className={`h-10 px-4 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2 ${
                generatingPDF ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {generatingPDF ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('generating')}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  {t('pdf')}
                </>
              )}
            </button>
            <AddExpenseFromItinerary
              itineraryId={itinerary.id}
              itineraryCode={itinerary.itinerary_code}
              clientName={itinerary.client_name}
            />
            {existingBooking ? (
              <Link
                href={`/bookings/${existingBooking.id}`}
                className="h-10 px-4 bg-[#647C47] text-white rounded-md hover:bg-[#4a5c35] text-sm font-medium flex items-center gap-2"
                title={t('viewBooking')}
              >
                <Briefcase className="w-4 h-4" />
                {existingBooking.booking_code}
              </Link>
            ) : itinerary.status === 'confirmed' && (
              <button
                onClick={handleCreateBooking}
                disabled={creatingBooking}
                className={`h-10 px-4 bg-[#647C47] text-white rounded-md hover:bg-[#4a5c35] text-sm font-medium flex items-center gap-2 ${creatingBooking ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={t('createBooking')}
              >
                {creatingBooking ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('creating')}</span>
                  </>
                ) : (
                  <>
                    <Briefcase className="w-4 h-4" />
                    {t('createBooking')}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Resource Cards */}
        <ResourceSummaryCard guideId={itinerary.assigned_guide_id} vehicleId={itinerary.assigned_vehicle_id} guideNotes={itinerary.guide_notes} vehicleNotes={itinerary.vehicle_notes} pickupLocation={itinerary.pickup_location} pickupTime={itinerary.pickup_time} onEdit={() => document.getElementById('resource-assignment')?.scrollIntoView({ behavior: 'smooth' })} />
        <div id="resource-assignment">
          <ResourceAssignmentV2 itineraryId={itinerary.id} startDate={itinerary.start_date} endDate={itinerary.end_date} numTravelers={itinerary.num_adults + itinerary.num_children + (itinerary.num_infants || 0)} clientName={itinerary.client_name} tripName={itinerary.trip_name} onUpdate={fetchItinerary} />
        </div>

        {/* DAY CONTROLS */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">{t('dailyItinerary')}</h2>
          <div className="flex gap-2">
            <button onClick={expandAll} className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">{t('expandAll')}</button>
            <button onClick={collapseAll} className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors">{t('collapseAll')}</button>
          </div>
        </div>

        {/* DAYS LIST */}
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <button onClick={() => toggleDay(day.day_number)} className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-600 text-white rounded-md flex items-center justify-center font-semibold text-sm">{day.day_number}</div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900">{day.title || t('dayNumber', { number: day.day_number })}</h3>
                    <p className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{day.city && ` • ${day.city}`}</p>
                  </div>
                </div>
                {expandedDays.has(day.day_number) ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>
              {expandedDays.has(day.day_number) && (
                <div className="p-4">
                  {day.description && <div className="mb-4"><p className="text-sm text-gray-700">{day.description}</p></div>}
                  {day.services && day.services.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('servicesIncluded')}</h4>
                      <div className="space-y-2">
                        {day.services.map((service) => (
                          <div key={service.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-lg">{getServiceIcon(service.service_type)}</span>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                                <p className="text-xs text-gray-500">{tEdit.has(`serviceTypes.${service.service_type}`) ? tEdit(`serviceTypes.${service.service_type}`) : service.service_type.replace('_', ' ')}{service.quantity > 1 && ` • ${t('qty')}: ${service.quantity}`}</p>
                                {service.notes && <p className="text-xs text-gray-600 mt-0.5">{service.notes}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              {costMode === 'manual' && editingServiceId === service.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-gray-500">{itinerary.currency}</span>
                                  <input type="number" value={editedCost} onChange={(e) => setEditedCost(e.target.value)} className="w-20 px-2 py-1 text-sm font-semibold text-right border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveServiceCost(service.id, day.id); if (e.key === 'Escape') handleCancelEditCost() }} />
                                  <button onClick={() => handleSaveServiceCost(service.id, day.id)} disabled={savingServiceCost} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                                  <button onClick={handleCancelEditCost} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                                </div>
                              ) : (
                                <button onClick={() => handleStartEditCost(service)} disabled={costMode !== 'manual'} className={`text-sm font-semibold ${costMode === 'manual' ? 'text-amber-700 hover:text-amber-800 cursor-pointer underline decoration-dashed underline-offset-2' : 'text-gray-900 cursor-default'}`} title={costMode === 'manual' ? t('clickToEdit') : t('switchToManualMode')}>
                                  {itinerary.currency} {service.total_cost.toFixed(2)}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500"><p className="text-sm">{t('noServicesAdded')}</p></div>
                  )}
                  {day.overnight_city && <div className="mt-3 pt-3 border-t border-gray-200"><p className="text-xs text-gray-600">🌙 {t('overnightIn', { city: day.overnight_city })}</p></div>}
                </div>
              )}
            </div>
          ))}
        </div>

        {days.length === 0 && <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center"><p className="text-sm text-gray-500">No days planned yet</p></div>}
      </div>
    </div>
  )
}