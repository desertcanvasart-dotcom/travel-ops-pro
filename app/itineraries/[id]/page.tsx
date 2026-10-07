'use client'

import { overnightLabel, overnightProperty } from '@/lib/itineraries/overnight-property'
import { todayLocal } from '@/lib/today'
import { useEffect, useState, useMemo } from 'react'
import { formatMoney } from '@/lib/currency-totals'
import { useTranslations, useLocale, createTranslator } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, FileText, Download, Send, Edit2, ChevronDown, ChevronUp, Receipt, Calculator, Settings, Check, X, Handshake, Loader2, Languages, ClipboardList, AlertTriangle, BookOpen, MessageCircle, Share2, MoreHorizontal, RotateCcw, XCircle, Info, Copy } from 'lucide-react'
// The itinerary PDF generator (and jsPDF behind it) loads on first use, not
// with the page.
const generateItineraryPDF = async (...args: Parameters<typeof import('@/lib/pdf-generator').generateItineraryPDF>) =>
  (await import('@/lib/pdf-generator')).generateItineraryPDF(...args)
import { useCompanyInfo } from '@/lib/use-company-info'
import PDFPreviewModal from '@/app/components/PDFPreviewModal'
import GenerateNitteiButton from '@/components/GenerateNitteiButton'
import GenerateOpsSheetButton from '@/components/GenerateOpsSheetButton'
import ResourceAssignmentV2 from '@/app/components/ResourceAssignmentV2'
import ResourceSummaryCard from '@/app/components/ResourceSummaryCard'
import WhatsAppButton from '@/app/components/whatsapp/whatsapp-button'
import ShareLinkCard from '@/app/components/ShareLinkCard'
import AddExpenseFromItinerary from '@/components/AddExpenseFromItinerary'
import TripAssignee from '@/components/TripAssignee'
import ItineraryPL from '@/app/components/ItineraryPL'
import ItineraryExpenses from '@/app/components/ItineraryExpenses'
import { createClient } from '@/lib/supabase'
import GenerateDocumentsButton from '@/app/components/GenerateDocumentsButton'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { itineraryCompleteness } from '@/lib/pricing/itinerary-completeness'
import { describeGaps } from '@/lib/pricing/quote-completeness'
import { LanguageStatusRow, DayLanguageChip, BilingualDayEditor, HighlightPlaceholders, type ContentView } from '@/components/multilingual'
import CoverageGrid from '@/components/itineraries/CoverageGrid'
import type { Language, ItineraryVersion } from '@/types/multilingual'
import { LANGUAGE_NAMES } from '@/types/multilingual'
import {
  normalizeClientLanguage,
  splitTourCode,
  summarizeLanguage,
  type DayText,
  type DayTranslationStatus,
} from '@/lib/itineraries/content-language'
import { itineraryAttention, type AttentionAction, type AttentionItem } from '@/lib/itineraries/itinerary-attention'
import { defaultTab, nextAction, tripSteps, type PrimaryKind, type TripFacts } from '@/lib/itineraries/trip-stage'
import { coverageGrid, type CoverageAssignment } from '@/lib/itineraries/coverage'
import type { TripPnL } from '@/lib/trip-pnl'
import HeaderMenu from '@/components/HeaderMenu'
import TripTasksCard from '@/components/itineraries/TripTasksCard'
import TripTimeline from '@/components/itineraries/TripTimeline'
import CancelTripDialog from '@/components/itineraries/CancelTripDialog'
import ComposeEmailModal from '@/components/unified/ComposeEmailModal'
import { useAuth } from '@/app/contexts/AuthContext'
import { formatPhoneForWhatsApp, generateWhatsAppLink } from '@/lib/whatsapp-link'

const ItineraryMap = dynamic(() => import('@/components/ItineraryMap'), {
  ssr: false,
  loading: () => <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />,
})

/** The dry-run answer from /api/itineraries/[id]/generate-tasks. */
interface TaskPreview {
  tasks: Array<{
    action: 'create' | 'update' | 'reopen' | 'unchanged'
    new_rows: number
    to_cancel: number
    unpriced_rows: number
    service_type: string
    label: string
    service_count: number
    department: { id: string; name: string }
    due_date: string | null
  }>
  skipped: Array<{ service_type: string; label: string; service_count: number }>
  orphaned: Array<{ service_type: string; label: string; reason: 'excluded' | 'removed' }>
  other_tasks: number
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_id?: string
  client_name: string
  client_email: string
  client_phone: string
  trip_name: string
  /** The programme this trip follows, when it follows one. */
  template_id?: string | null
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number   // Ages 4-12: 50% discount
  num_infants: number    // Ages 0-3: FREE except flights
  currency: string
  total_cost: number
  /** What the trip costs us, when the pricing engine has stored it. */
  supplier_cost?: number | null
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
  inclusions?: string[]
  exclusions?: string[]
  generation_warnings?: string[]
  /** clients.preferred_language, free text (normalised on this page). */
  client_preferred_language?: string | null
}

/** GET /api/itineraries/[id]/day-translations */
interface DayTranslations {
  source_language: Language
  target_languages: Language[]
  days: Array<{
    id: string
    day_number: number
    date: string
    source: DayText
    translations: Partial<Record<Language, { text: DayText | null; status: DayTranslationStatus; translated_at: string | null }>>
  }>
}

const DETAIL_TABS = ['itinerary', 'operations', 'finance', 'messages'] as const
type DetailTab = typeof DETAIL_TABS[number]

interface ItineraryDay {
  id: string
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
  hotel_included?: boolean | null
  overnight?: boolean | null
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
  service_code?: string | null
  supplier_name?: string | null
  /** Whether the night's hotel or ship is still in Rates (days API). */
  property_rate_status?: 'on_file' | 'switched_off' | 'not_on_file' | null
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
  const tPdf = useTranslations('pdf')
  const tLang = useTranslations('itineraries.detail.languages')
  const tStage = useTranslations('itineraries.detail.stage')
  const tAtt = useTranslations('itineraries.detail.attention')
  const tOwn = useTranslations('itineraries.detail.ownWhatsApp')
  const tLayout = useTranslations('itineraries.detail.layout')
  // The letterhead on the generated PDF. It used to come from the message
  // catalogue — where the first operator's name sat as if it were a
  // translation — so every agency's quote carried it. Undefined until the
  // fetch resolves, and the generator draws nothing for a blank brand.
  const company = useCompanyInfo()
  const dialog = useConfirmDialog()

  // Services with no cost (a zero rate and total). The email, WhatsApp and
  // share link all refuse to send them without the operator's go-ahead, and
  // ask first here (lib/pricing/itinerary-completeness).
  const confirmIncompleteSend = async (days: Array<{ day_number: number; services: Array<{ service_name: string; rate_eur: number; total_cost: number; notes: string }> }>): Promise<'complete' | 'go' | 'stop'> => {
    const { complete, gaps } = itineraryCompleteness(days)
    if (complete) return 'complete'
    const ok = await dialog.confirm({
      title: t('incompleteTitle'),
      message: t('sendIncompleteConfirm', { count: gaps.length, services: describeGaps(gaps) }),
      confirmText: t('continueAnyway'),
      variant: 'warning',
    })
    return ok ? 'go' : 'stop'
  }

  /** The server is the authority. If it finds services with no cost this
   *  page did not know about — added by someone else after the page loaded —
   *  ask with the SERVER's list, so the send can still go ahead knowingly
   *  instead of dead-ending on an error (review of #449). */
  const confirmServerIncomplete = async (data: { gaps?: unknown }): Promise<boolean> => {
    const gaps = Array.isArray(data?.gaps) ? (data.gaps as Array<{ name: string; day: number | null; issue: string }>) : []
    return dialog.confirm({
      title: t('incompleteTitle'),
      message: t('sendIncompleteConfirm', { count: gaps.length, services: describeGaps(gaps) }),
      confirmText: t('continueAnyway'),
      variant: 'warning',
    })
  }
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const intlLocale = useLocale() as Language

  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<DayWithServices[]>([])
  const [loading, setLoading] = useState(true)

  // The stored itinerary.total_cost is a denormalized cache that can be 0/stale
  // (an itinerary priced via its services without the header being re-synced —
  // which is why the header read EUR 0.00 while Profit & Loss showed a price).
  // The services are the source of truth, so derive the client total from them,
  // mirroring the Profit & Loss card, and use that whenever services exist.
  const computedClientTotal = useMemo(() => {
    const margin = 25 // matches the Profit & Loss card below
    let total = 0
    for (const day of days) {
      for (const s of (day.services || [])) {
        const supplier = Number(s.total_cost) || 0
        const clientPrice = (s as any).client_price != null
          ? Number((s as any).client_price)
          : supplier * (1 + margin / 100)
        total += clientPrice
      }
    }
    return Math.round(total * 100) / 100
  }, [days])

  const effectiveTotalCost = computedClientTotal > 0
    ? computedClientTotal
    : (Number(itinerary?.total_cost) || 0)
  const [error, setError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))

  // Multilingual state. activeLanguage is the language the day cards, PDF
  // and email are in; contentView is what the Daily Itinerary shows — one
  // language, or source and target side by side (which reads the source).
  const [activeLanguage, setActiveLanguage] = useState<Language>('en')
  const [contentView, setContentView] = useState<ContentView | null>(null)
  const [dayTranslations, setDayTranslations] = useState<DayTranslations | null>(null)
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [pdfShowBreakdown, setPdfShowBreakdown] = useState(true)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [existingInvoice, setExistingInvoice] = useState<ExistingInvoice | null>(null)
  const [generatingCommissions, setGeneratingCommissions] = useState(false)
  const [commissionResult, setCommissionResult] = useState<string | null>(null)
  const [existingBooking, setExistingBooking] = useState<{ id: string; booking_code: string } | null>(null)
  const [creatingBooking, setCreatingBooking] = useState(false)

  // Task generation state
  const [generatingTasks, setGeneratingTasks] = useState(false)
  const [taskResult, setTaskResult] = useState<string | null>(null)
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [taskTeamMembers, setTaskTeamMembers] = useState<{ id: string; name: string; department_id: string | null }[]>([])
  const [taskAssignments, setTaskAssignments] = useState<Record<string, string>>({})
  // What generating would do, from a dry run — shown before anything is written.
  const [taskPreview, setTaskPreview] = useState<TaskPreview | null>(null)

  // Cost Mode State
  const [costMode, setCostMode] = useState<'auto' | 'manual'>('auto')
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [editedCost, setEditedCost] = useState<string>('')
  const [savingCostMode, setSavingCostMode] = useState(false)
  const [savingServiceCost, setSavingServiceCost] = useState(false)
  const [costModeChanged, setCostModeChanged] = useState(false)

  // Expenses state
  const [itineraryExpenses, setItineraryExpenses] = useState<any[]>([])
  const [expenseRefreshTrigger, setExpenseRefreshTrigger] = useState(0)

  // The content language no longer follows the staff UI language (the
  // sidebar switch): a Japanese-speaking operator still needs to see that the
  // English source is the source. The view opens on the source, or side by
  // side when a translation needs work — decided once the statuses load.
  useEffect(() => {
    if (params.id) {
      fetchItinerary()
      fetchDayTranslations()
      checkExistingInvoice()
      checkExistingBooking()
    }
  }, [params.id])

  const fetchDayTranslations = async () => {
    try {
      const res = await fetch(`/api/itineraries/${params.id}/day-translations`)
      const data = await res.json()
      if (data.success) setDayTranslations(data.data)
    } catch (err) {
      console.error('Error fetching day translations:', err)
    }
  }

  // Fetch days when language changes
  useEffect(() => {
    if (params.id) {
      console.log(`🔁 activeLanguage changed to: ${activeLanguage}, fetching days...`)
      fetchDays(activeLanguage)
    }
  }, [params.id, activeLanguage])

  const fetchDays = async (language: Language) => {
    try {
      console.log(`📥 fetchDays called with language=${language}`)
      const daysResponse = await fetch(`/api/itineraries/${params.id}/days?language=${language}`)
      const daysData = await daysResponse.json()
      if (daysData.success) {
        // Log debug info from server
        if (daysData.debug) {
          console.log('📊 Days API debug:', JSON.stringify(daysData.debug))
        }
        // Log first day title to verify translation
        if (daysData.data && daysData.data.length > 0) {
          console.log(`📋 First day title (lang=${language}): "${daysData.data[0].title}"`)
          if (daysData.data[0].services?.length > 0) {
            console.log(`📋 First service name (lang=${language}): "${daysData.data[0].services[0].service_name}"`)
          }
        }
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

  // Task generation handlers
  //
  // One task per service category, built from the services (no AI). The
  // dialog opens on a dry run, so the operator sees which tasks will be
  // created, updated or reopened — and which categories are skipped because
  // no active department handles them — before anything is written.
  const handleOpenTaskDialog = async () => {
    if (!itinerary) return
    setGeneratingTasks(true)
    try {
      const [previewRes, memberRes] = await Promise.all([
        fetch(`/api/itineraries/${itinerary.id}/generate-tasks?today=${todayLocal()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dry_run: true }),
        }),
        fetch('/api/team-members?active=true'),
      ])
      const preview = await previewRes.json()
      if (!preview.success) {
        await dialog.alert(tCommon('error'), preview.error || t('failedToGenerateTasks'), 'warning')
        return
      }
      const memberData = await memberRes.json().catch(() => null)
      const members = (memberData?.data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        department_id: m.department_id,
      }))

      // Pre-select the first member of each department that receives a task.
      const defaults: Record<string, string> = {}
      for (const task of preview.tasks as TaskPreview['tasks']) {
        const first = members.find((m: any) => m.department_id === task.department.id)
        if (first && !defaults[task.department.id]) defaults[task.department.id] = first.id
      }

      setTaskTeamMembers(members)
      setTaskAssignments(defaults)
      setTaskPreview(preview)
      setShowTaskDialog(true)
    } catch (error) {
      console.error('Error previewing tasks:', error)
      await dialog.alert(tCommon('error'), t('failedToGenerateTasks'), 'warning')
    } finally {
      setGeneratingTasks(false)
    }
  }

  const handleGenerateTasks = async () => {
    if (!itinerary) return
    setShowTaskDialog(false)
    setGeneratingTasks(true)

    try {
      const response = await fetch(`/api/itineraries/${itinerary.id}/generate-tasks?today=${todayLocal()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: taskAssignments }),
      })
      const result = await response.json()

      if (result.success) {
        setTaskResult(t('tasksSynced', result.counts))
        setTasksRefresh(n => n + 1)
        setTimeout(() => setTaskResult(null), 8000)
      } else {
        await dialog.alert(tCommon('error'), result.error || t('failedToGenerateTasks'), 'warning')
      }
    } catch (error) {
      console.error('Error generating tasks:', error)
      await dialog.alert(tCommon('error'), t('failedToGenerateTasks'), 'warning')
    } finally {
      setGeneratingTasks(false)
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

      // Sum the (supplier) service costs, then store the CLIENT/selling total in
      // total_cost — consistent with the grid save and how the header/invoice/PDF
      // consume the field (previously this persisted the raw supplier sum).
      let supplierSum = 0
      days.forEach(day => {
        day.services.forEach(s => {
          supplierSum += s.id === serviceId ? newCost : s.total_cost
        })
      })
      const margin = Number((itinerary as any)?.margin_percent) || 25
      const newTotalCost = Math.round(supplierSum * (1 + margin / 100) * 100) / 100

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
        unit_price: effectiveTotalCost,
        amount: effectiveTotalCost
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
          subtotal: effectiveTotalCost,
          tax_rate: 0,
          tax_amount: 0,
          discount_amount: 0,
          total_amount: effectiveTotalCost,
          currency: itinerary.currency || 'EUR',
          issue_date: todayLocal(),
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

  // The localized labels bundle for the PDF generator, in the DOCUMENT's
  // language — not the staff UI's. A Japanese quote built by an operator
  // using the English UI used to come out with English headings. The other
  // locale's messages load on first use. The PdfLabels shape is defined in
  // lib/pdf-generator.ts.
  type PdfTr = (key: string, values?: Record<string, string | number>) => string
  const pdfTranslator = async (lang: Language): Promise<PdfTr> => {
    if (lang === intlLocale) return tPdf as unknown as PdfTr
    const messages = (await import(`@/messages/${lang}.json`)).default
    return createTranslator({ locale: lang, messages, namespace: 'pdf' }) as unknown as PdfTr
  }
  const buildPdfLabels = (tr: PdfTr) => ({
    brand: company?.name ?? '',
    quote: tr('quote'),
    date: tr('date'),
    client: tr('client'),
    travelDates: tr('travelDates'),
    duration: tr('duration'),
    durationDays: (count: number) => tr('durationDays', { count }),
    travelers: tr('travelers'),
    travelerCountAdultsOnly: (adults: number) => tr('travelerCountAdultsOnly', { adults }),
    travelerCountWithChildren: (adults: number, children: number) => tr('travelerCountWithChildren', { adults, children }),
    package: tr('package'),
    packageTier: (tier: string) => tr('packageTier', { tier }),
    egyptTourPackage: tr('egyptTourPackage'),
    day: tr('day'),
    dayN: (n: number) => tr('dayN', { n }),
    dayNumberTitle: (n: number, title: string) => tr('dayNumberTitle', { n, title }),
    activities: tr('activities'),
    overnight: tr('overnight'),
    pricingSummary: tr('pricingSummary'),
    subtotal: tr('subtotal'),
    total: tr('total'),
    totalPerPerson: tr('totalPerPerson'),
    service: tr('service'),
    quantity: tr('quantity'),
    rate: tr('rate'),
    amount: tr('amount'),
    inclusions: tr('inclusions'),
    exclusions: tr('exclusions'),
    notes: tr('notes'),
  })

  /** The days in one language — the loaded ones when that is on screen. */
  const daysIn = async (lang: Language): Promise<DayWithServices[]> => {
    if (lang === activeLanguage) return days
    const res = await fetch(`/api/itineraries/${params.id}/days?language=${lang}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || t('failedToGeneratePDF'))
    return data.data
  }

  /**
   * The quote PDF in one language: that language's days, its trip title (it
   * was the source's before, whatever the language), and headings in that
   * language.
   */
  const buildQuotePdf = async (lang: Language, pdfDays: DayWithServices[], showBreakdown?: boolean) => {
    if (!itinerary) throw new Error('No itinerary')
    const content = getVersionedContent(lang)
    return generateItineraryPDF(
      { ...itinerary, trip_name: content.trip_name },
      pdfDays,
      {
        ...(showBreakdown === undefined ? {} : { showPricingBreakdown: showBreakdown, showServiceDetails: showBreakdown }),
        locale: lang,
        labels: buildPdfLabels(await pdfTranslator(lang)),
      }
    )
  }

  // The language of the PDF in the preview, so the breakdown toggle rebuilds
  // the same one.
  const [pdfLanguage, setPdfLanguage] = useState<Language | null>(null)

  const handlePreviewPDF = async (showBreakdown = true, lang: Language = activeLanguage) => {
    if (!itinerary) return
    // A quote PDF is built from the itinerary's days. With none there is
    // nothing to put in it — and a button that returns in silence reads as
    // broken (the operator's report on the DEMO-EXT fixture, which has no
    // days). Say so, once, and stop.
    if (days.length === 0) {
      await dialog.alert(t('pdf'), t('pdfNeedsDays'), 'info')
      return
    }

    setGeneratingPDF(true)
    try {
      const pdf = await buildQuotePdf(lang, await daysIn(lang), showBreakdown)
      const blob = pdf.output('blob')
      setPdfPreviewBlob(blob)
      setPdfShowBreakdown(showBreakdown)
      setPdfLanguage(lang)
      setShowPdfPreview(true)
    } catch (error) {
      console.error('Error generating PDF:', error)
      await dialog.alert(tCommon('error'), t('failedToGeneratePDF'), 'warning')
    } finally {
      setGeneratingPDF(false)
    }
  }

  const handleToggleBreakdown = async (showBreakdown: boolean) => {
    if (!itinerary || days.length === 0) return
    try {
      const lang = pdfLanguage ?? activeLanguage
      const pdf = await buildQuotePdf(lang, await daysIn(lang), showBreakdown)
      const blob = pdf.output('blob')
      setPdfPreviewBlob(blob)
      setPdfShowBreakdown(showBreakdown)
    } catch (error) {
      console.error('Error regenerating PDF:', error)
    }
  }

  const handleSendWhatsApp = async () => {
    if (!itinerary) return

    if (!itinerary.client_phone) {
      await dialog.alert(tCommon('error'), t('clientPhoneRequired'), 'warning')
      return
    }
  
    setShowSendModal(false)
    const decision = await confirmIncompleteSend(days)
    if (decision === 'stop') return
    setSendingEmail(true) // Reuse loading state for UI feedback
  
    try {
      const send = (allowIncomplete: boolean) => fetch('/api/whatsapp/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: itinerary.id,
          clientPhone: itinerary.client_phone,
          clientName: itinerary.client_name,
          ...(allowIncomplete ? { allow_incomplete: true } : {}),
        })
      })
      let response = await send(decision === 'go')
      let data = await response.json()
      if (response.status === 422 && data.incomplete && decision !== 'go') {
        if (!(await confirmServerIncomplete(data))) return
        response = await send(true)
        data = await response.json()
      }
  
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

    setShowSendModal(false)
    const decision = await confirmIncompleteSend(days)
    if (decision === 'stop') return
    // The PDF goes in the language on screen. When that is not the one the
    // client reads, say so before it leaves.
    if (clientLanguage && clientLanguage !== activeLanguage) {
      const ok = await dialog.confirm({
        title: tLang('sendLanguageTitle'),
        message: tLang('sendLanguageMessage', {
          client: itinerary.client_name,
          clientLanguage: LANGUAGE_NAMES[clientLanguage],
          language: LANGUAGE_NAMES[activeLanguage],
        }),
        confirmText: tLang('sendAnyway'),
        variant: 'warning',
      })
      if (!ok) return
    }
    setSendingEmail(true)
    
    try {
      const pdf = await buildQuotePdf(activeLanguage, days)
      const pdfBlob = pdf.output('blob')
      const pdfBase64 = await blobToBase64(pdfBlob)

      const send = (allowIncomplete: boolean) => fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: itinerary.id,
          clientName: itinerary.client_name,
          clientEmail: itinerary.client_email,
          itineraryCode: itinerary.itinerary_code,
          tripName: itinerary.trip_name,
          totalCost: effectiveTotalCost.toFixed(2),
          currency: itinerary.currency,
          pdfBase64: pdfBase64.split(',')[1],
          ...(allowIncomplete ? { allow_incomplete: true } : {}),
        })
      })
      let response = await send(decision === 'go')
      let data = await response.json()
      if (response.status === 422 && data.incomplete && decision !== 'go') {
        if (!(await confirmServerIncomplete(data))) return
        response = await send(true)
        data = await response.json()
      }

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
  const getVersionedContent = (lang: Language = activeLanguage) => {
    if (!itinerary?.versions) {
      return {
        trip_name: itinerary?.trip_name || '',
        notes: itinerary?.notes || '',
        pickup_location: itinerary?.pickup_location || '',
        guide_notes: itinerary?.guide_notes || '',
        vehicle_notes: itinerary?.vehicle_notes || '',
        inclusions: itinerary?.inclusions || [],
        exclusions: itinerary?.exclusions || []
      }
    }
    // The source language IS the base row; a version is only a translation.
    // (Read off dayTranslations here: this runs before sourceLanguage is set.)
    const source = dayTranslations?.source_language ?? 'en'
    const version = lang === source ? null : itinerary.versions[lang]
    if (version) {
      return {
        trip_name: version.trip_name || itinerary.trip_name,
        notes: version.notes || itinerary.notes,
        pickup_location: version.pickup_location || itinerary.pickup_location,
        guide_notes: version.guide_notes || itinerary.guide_notes,
        vehicle_notes: version.vehicle_notes || itinerary.vehicle_notes,
        inclusions: version.inclusions || itinerary.inclusions || [],
        exclusions: version.exclusions || itinerary.exclusions || []
      }
    }
    return {
      trip_name: itinerary.trip_name,
      notes: itinerary.notes,
      pickup_location: itinerary.pickup_location,
      guide_notes: itinerary.guide_notes,
      vehicle_notes: itinerary.vehicle_notes,
      inclusions: itinerary.inclusions || [],
      exclusions: itinerary.exclusions || []
    }
  }

  const handleCreateVersion = async (language: Language): Promise<boolean> => {
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
        // Refresh itinerary to get updated versions. The view stays where it
        // is: the caller decides what to show.
        await fetchItinerary()
        return true
      }
      await dialog.alert(tCommon('error'), data.error || t('failedToCreateVersion'), 'warning')
      return false
    } catch (error) {
      console.error('Error creating version:', error)
      await dialog.alert(tCommon('error'), t('failedToCreateVersion'), 'warning')
      return false
    } finally {
      setCreatingVersion(false)
    }
  }

  const handleCopyAndTranslate = async (language: Language, forceRetranslate = false) => {
    setCreatingVersion(true)
    try {
      console.log(`🔄 Copy & Translate: language=${language}, force=${forceRetranslate}`)
      const response = await fetch(`/api/itineraries/${params.id}/versions/copy-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: language, forceRetranslate })
      })
      const data = await response.json()
      console.log('🔄 Copy & Translate response:', JSON.stringify({
        success: data.success,
        error: data.error,
        translated: data.translated,
        versionTripName: data.data?.trip_name,
        translatedDaysCount: data.translatedDays?.length,
        translatedServicesCount: data.translatedServices?.length
      }))
      if (data.success) {
        // Refresh itinerary to get updated versions, and the days in the
        // language on screen (their translated service names may be new).
        await fetchItinerary()
        await fetchDays(activeLanguage)
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
  const tourTitle = splitTourCode(versionedContent.trip_name)
  const availableLanguages = itinerary?.available_languages || []

  // ── The language layer ────────────────────────────────────────────────
  const sourceLanguage: Language = dayTranslations?.source_language ?? 'en'
  const clientLanguage = normalizeClientLanguage(itinerary?.client_preferred_language)
  const languageSummaries = useMemo(
    () => (dayTranslations?.target_languages ?? []).map(lang =>
      summarizeLanguage(lang, dayTranslations!.days.map(d => d.translations[lang]?.status ?? 'missing'))
    ),
    [dayTranslations]
  )
  // The target the side-by-side view edits: the client's language when it is
  // one, else the first target.
  const sideTarget: Language | null =
    (clientLanguage && clientLanguage !== sourceLanguage ? clientLanguage : null)
    ?? dayTranslations?.target_languages[0] ?? null
  const translationByDay = useMemo(
    () => new Map((dayTranslations?.days ?? []).map(d => [d.id, d])),
    [dayTranslations]
  )

  // First load: side by side when a translation needs work, else the source.
  useEffect(() => {
    if (!dayTranslations || contentView !== null) return
    const needsWork = languageSummaries.some(l => l.status !== 'reviewed' && l.status !== 'machine')
    setContentView(needsWork && dayTranslations.days.length > 0 ? 'side' : dayTranslations.source_language)
  }, [dayTranslations, languageSummaries, contentView])

  // The day cards (and the PDF and email) follow the view; side by side
  // reads the source, with the target beside it.
  useEffect(() => {
    if (contentView === null) return
    setActiveLanguage(contentView === 'side' ? sourceLanguage : contentView)
  }, [contentView, sourceLanguage])

  // ── Where the trip stands (ported from autoura-saas) ───────────────────
  // The trip's money from the Profit & Loss report's own figures
  // (lib/trip-pnl), and its resource assignments, for the status line, the
  // one next action, the day cards' resource tags and Needs attention.
  const { user } = useAuth()
  const [actualPnl, setActualPnl] = useState<TripPnL | null>(null)
  const [assignments, setAssignments] = useState<CoverageAssignment[] | null>(null)
  const [resourceRefresh, setResourceRefresh] = useState(0)
  useEffect(() => {
    if (!params.id) return
    let live = true
    fetch(`/api/profit-loss?itineraryId=${params.id}`)
      .then(r => r.json())
      .then(json => { if (live && json?.success && Array.isArray(json.data)) setActualPnl((json.data[0] as TripPnL) ?? null) })
      // Without it the page shows the quoted figures only.
      .catch(() => undefined)
    return () => { live = false }
  }, [params.id, expenseRefreshTrigger])
  useEffect(() => {
    if (!params.id) return
    let live = true
    fetch(`/api/itinerary-resources?itinerary_id=${params.id}`)
      .then(r => r.json())
      .then(json => { if (live && json?.success && Array.isArray(json.data)) setAssignments(json.data) })
      // Until they load (or if they can't), nothing is called missing.
      .catch(() => undefined)
    return () => { live = false }
  }, [params.id, resourceRefresh])

  const coverage = useMemo(() => coverageGrid(days, assignments ?? []), [days, assignments])
  const today = todayLocal()
  const tripFacts: TripFacts | null = itinerary ? {
    status: itinerary.status,
    hasBooking: !!existingBooking,
    hasInvoice: !!existingInvoice,
    invoiced: actualPnl && actualPnl.invoice_count > 0 ? actualPnl.total_revenue : null,
    paid: actualPnl && actualPnl.invoice_count > 0 ? actualPnl.total_paid : null,
    startDate: itinerary.start_date,
    endDate: itinerary.end_date,
    today,
  } : null

  const attentionItems = useMemo(() => {
    if (!itinerary || !dayTranslations) return []
    const servicesByDay = new Map(days.map(d => [d.id, d]))
    // A guide, a vehicle or airport staff some day needs and nobody covers —
    // the kinds autoura-saas calls missing; a hotel is booked through the
    // booking's suppliers, so it is never "missing" here.
    const missingResources = assignments === null ? [] : coverage.rows
      .filter(r => r.type === 'guide' || r.type === 'vehicle' || r.type === 'airport_staff')
      .map(r => ({ type: r.type, days: r.cells.map((c, i) => (c.state === 'missing' ? days[i]?.day_number : null)).filter((n): n is number => n != null) }))
      .filter(m => m.days.length > 0)
    const staleNights = days.flatMap(day => {
      const property = overnightProperty(day.services)
      const status = day.services.find(sv => sv.property_rate_status)?.property_rate_status
      return property && (status === 'not_on_file' || status === 'switched_off')
        ? [{ day: day.day_number, property: property.name, switchedOff: status === 'switched_off' }]
        : []
    })
    return itineraryAttention({
      status: itinerary.status,
      sourceLanguage,
      clientLanguage,
      languages: languageSummaries,
      days: dayTranslations.days.map(d => {
        const loaded = servicesByDay.get(d.id)
        return {
          day_number: d.day_number,
          source: d.source,
          targets: Object.fromEntries(Object.entries(d.translations).map(([lang, tr]) => [lang, tr?.text ?? null])),
          services: loaded?.services ?? [],
          hotel_included: loaded?.hotel_included,
          overnight: loaded?.overnight,
        }
      }),
      // The inclusion lists are no longer shown or edited on this page, so a
      // conflict in them is not reported here.
      inclusions: {},
      hasInvoice: !!existingInvoice,
      hasBooking: !!existingBooking,
      trip: {
        today,
        startDate: itinerary.start_date,
        endDate: itinerary.end_date,
        currency: itinerary.currency || 'EUR',
        invoiced: actualPnl && actualPnl.invoice_count > 0 ? actualPnl.total_revenue : null,
        paid: actualPnl && actualPnl.invoice_count > 0 ? actualPnl.total_paid : null,
        profit: actualPnl && actualPnl.invoice_count > 0 ? actualPnl.gross_profit : null,
        staleNights,
        missingResources,
      },
    })
  }, [itinerary, dayTranslations, days, sourceLanguage, clientLanguage, languageSummaries, existingInvoice, existingBooking, actualPnl, assignments, coverage, today])

  // ── Tabs ──────────────────────────────────────────────────────────────
  // Four areas of one trip. The tab is kept in the URL hash so a reload, or a
  // link sent to a colleague, opens the same one.
  // Without one in the address, the tab that fits where the trip is: its
  // days before it, its operations while it runs, its money after.
  const [tabChoice, setTabState] = useState<DetailTab | null>(null)
  useEffect(() => {
    const fromHash = window.location.hash.slice(1)
    if ((DETAIL_TABS as readonly string[]).includes(fromHash)) setTabState(fromHash as DetailTab)
  }, [])
  const tab: DetailTab = tabChoice ?? (tripFacts ? defaultTab(tripFacts) : 'itinerary')
  const setTab = (next: DetailTab) => {
    setTabState(next)
    window.history.replaceState(null, '', `#${next}`)
  }

  // The coverage grid's "Assign" opens the assignment panel on that type.
  const [requestedResourceTab, setRequestedResourceTab] = useState<{ type: string; nonce: number } | null>(null)

  const openDailyItinerary = (view: ContentView) => {
    setTab('itinerary')
    setContentView(view)
    // After the Itinerary tab has rendered.
    setTimeout(() => document.getElementById('daily-itinerary')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  /** A document in a target language with no text yet opens the translate
   *  flow instead of producing a document in the wrong language. */
  const documentLanguageReady = (lang: Language) =>
    lang === sourceLanguage || (languageSummaries.find(l => l.language === lang)?.status ?? 'missing') !== 'missing'

  // "Translate missing and outdated days". A language with no version row yet
  // goes through copy-translate, which also makes the trip title, the
  // inclusions and the service names; after that, day by day.
  const [translatingAll, setTranslatingAll] = useState(false)
  const handleTranslateAll = async (language: Language) => {
    setTranslatingAll(true)
    try {
      if (!availableLanguages.includes(language)) {
        await handleCopyAndTranslate(language)
      } else {
        const res = await fetch(`/api/itineraries/${params.id}/day-translations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.success) throw new Error(data?.error || t('failedToCreateVersion'))
        await fetchDays(activeLanguage)
      }
      await fetchDayTranslations()
    } catch (error) {
      await dialog.alert(tCommon('error'), error instanceof Error ? error.message : t('failedToCreateVersion'), 'warning')
    } finally {
      setTranslatingAll(false)
    }
  }

  // ── The header's menus and the one next action ───────────────────────
  // Signals open dialogs owned by their components (the ⋯ and Documents menus).
  const [expenseSignal, setExpenseSignal] = useState(0)
  const [nitteiSignal, setNitteiSignal] = useState(0)
  const [opsSheetSignal, setOpsSheetSignal] = useState(0)
  const [tasksRefresh, setTasksRefresh] = useState(0)
  const [showCancel, setShowCancel] = useState(false)
  const [closingOut, setClosingOut] = useState(false)
  const [converting, setConverting] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [sendingOwnWhatsApp, setSendingOwnWhatsApp] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  const scrollToId = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)

  const setStatus = async (status: string) => {
    const res = await fetch(`/api/itineraries/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.error || tStage('statusFailed'))
    setItinerary(prev => (prev ? { ...prev, status } : prev))
  }

  const closeOut = async () => {
    const ok = await dialog.confirm({ title: tStage('closeOutTitle'), message: tStage('closeOutMessage'), confirmText: tStage('closeOut'), variant: 'info' })
    if (!ok) return
    setClosingOut(true)
    try {
      await setStatus('completed')
    } catch (err) {
      await dialog.alert(tCommon('error'), err instanceof Error ? err.message : tStage('statusFailed'), 'warning')
    } finally {
      setClosingOut(false)
    }
  }

  // A cancelled trip back in play: confirmed if it has a booking, else a draft.
  const reopenTrip = async () => {
    const status = existingBooking ? 'confirmed' : 'draft'
    const ok = await dialog.confirm({ title: tStage('reopenTitle'), message: tStage('reopenMessage', { status }), confirmText: tStage('reopen'), variant: 'info' })
    if (!ok) return
    try {
      await setStatus(status)
    } catch (err) {
      await dialog.alert(tCommon('error'), err instanceof Error ? err.message : tStage('statusFailed'), 'warning')
    }
  }

  // "Convert to booking": confirming the trip makes its booking (the
  // itinerary route creates it when the status becomes confirmed).
  const convertToBooking = async () => {
    setConverting(true)
    try {
      await setStatus('confirmed')
      await checkExistingBooking()
    } catch (err) {
      await dialog.alert(tCommon('error'), err instanceof Error ? err.message : tStage('statusFailed'), 'warning')
    } finally {
      setConverting(false)
    }
  }

  // Payments are recorded on the invoice.
  const recordPayment = () => {
    if (existingInvoice) router.push(`/invoices/${existingInvoice.id}`)
    else handleGenerateInvoice()
  }

  const runAction = (kind: PrimaryKind | AttentionAction, dayNumber?: number) => {
    if (kind === 'send_quote') setShowSendModal(true)
    else if (kind === 'convert') convertToBooking()
    else if (kind === 'create_booking') handleCreateBooking()
    else if (kind === 'create_invoice') handleGenerateInvoice()
    else if (kind === 'record_payment') recordPayment()
    else if (kind === 'assign_resources') { setTab('operations'); scrollToId('resource-assignment') }
    else if (kind === 'open_trip_log') { setTab('operations'); scrollToId('trip-timeline') }
    else if (kind === 'close_out') closeOut()
    else if (kind === 'open_finance') { setTab('finance'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    else if (kind === 'go_to_day' && dayNumber != null) {
      setTab('itinerary')
      setExpandedDays(prev => new Set([...prev, dayNumber]))
      scrollToId(`day-${dayNumber}`)
    }
  }

  // A new draft of the same trip, in every language (lib/itineraries/duplicate:
  // days and services come along; booking, payments, assignments and frozen
  // rates do not).
  const duplicateTrip = async () => {
    const ok = await dialog.confirm({ title: tStage('duplicateTitle'), message: tStage('duplicateMessage'), confirmText: tStage('duplicate'), variant: 'info' })
    if (!ok) return
    setDuplicating(true)
    try {
      const res = await fetch(`/api/itineraries/${params.id}/duplicate`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || tStage('duplicateFailed'))
      router.push(`/itineraries/${data.data.id}`)
    } catch (err) {
      await dialog.alert(tCommon('error'), err instanceof Error ? err.message : tStage('duplicateFailed'), 'warning')
    } finally {
      setDuplicating(false)
    }
  }

  // ── Send from my WhatsApp ─────────────────────────────────────────────
  // The quote from the operator's OWN WhatsApp (wa.me), not the business
  // number: the trip's share link in a message in the client's language,
  // opened in WhatsApp to send as it is or edit. There is no way to know it
  // was sent, so the operator says so afterwards and the quote is marked sent.
  const sendFromMyWhatsApp = async () => {
    if (!itinerary?.client_phone) {
      await dialog.alert(tCommon('error'), t('clientPhoneRequired'), 'warning')
      return
    }
    setShowSendModal(false)
    // Opened now, inside the click, so the browser does not block it; pointed
    // at WhatsApp once the link is ready.
    const win = window.open('', '_blank')
    setSendingOwnWhatsApp(true)
    try {
      const share = (allowIncomplete: boolean) => fetch(`/api/itineraries/${params.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allowIncomplete ? { allow_incomplete: true } : {}),
      })
      let res = await share(false)
      let data = await res.json().catch(() => ({}))
      if (res.status === 422 && data.incomplete) {
        if (!(await confirmServerIncomplete(data))) { win?.close(); return }
        res = await share(true)
        data = await res.json().catch(() => ({}))
      }
      if (!res.ok || !data.url) throw new Error(data.error || t('failedToSendWhatsApp'))

      const lang: Language = clientLanguage ?? activeLanguage
      const messages = lang === intlLocale ? null : (await import(`@/messages/${lang}.json`)).default
      const tMsg = messages
        ? (createTranslator({ locale: lang, messages, namespace: 'itineraries.detail.ownWhatsApp' }) as unknown as (key: string, values?: Record<string, string>) => string)
        : (tOwn as unknown as (key: string, values?: Record<string, string>) => string)
      const content = getVersionedContent(lang)
      const dates = `${new Date(itinerary.start_date).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric' })} – ${new Date(itinerary.end_date).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      const text = tMsg('quoteMessage', {
        name: itinerary.client_name || '',
        trip: splitTourCode(content.trip_name).title,
        dates,
        price: formatMoney(effectiveTotalCost, itinerary.currency),
        link: data.url,
        company: company?.name ?? '',
      })
      const href = generateWhatsAppLink(formatPhoneForWhatsApp(itinerary.client_phone), text)
      if (win) win.location.href = href
      else window.open(href, '_blank')

      const sent = await dialog.confirm({ title: tOwn('sentTitle'), message: tOwn('sentMessage'), confirmText: tOwn('markSent'), variant: 'info' })
      if (sent) {
        await markAsSent('WhatsApp')
        setSendSuccess(tOwn('marked'))
        setTimeout(() => setSendSuccess(null), 5000)
      }
    } catch (error) {
      win?.close()
      await dialog.alert(tCommon('error'), error instanceof Error ? error.message : t('failedToSendWhatsApp'), 'warning')
    } finally {
      setSendingOwnWhatsApp(false)
    }
  }

  // ── What the header, the attention list and the day cards show ─────────
  const steps = tripFacts ? tripSteps(tripFacts) : []
  const primary = tripFacts ? nextAction(tripFacts) : null
  const resourceLabel = (type: string) => (tStage.has(`resource.${type}`) ? tStage(`resource.${type}`) : type.replace(/_/g, ' '))

  /** The day's guide, vehicle, hotel… — who is on it, or that one is needed. */
  const dayChips = (dayIndex: number): Array<{ type: string; label: string; state: 'covered' | 'missing'; names: string[] }> => {
    if (assignments === null) return []
    return coverage.rows.flatMap((row): Array<{ type: string; label: string; state: 'covered' | 'missing'; names: string[] }> => {
      const cell = row.cells[dayIndex]
      if (!cell) return []
      if (cell.state === 'covered') return [{ type: row.type, label: resourceLabel(row.type), state: 'covered' as const, names: cell.assigned }]
      if (cell.state === 'missing') return [{ type: row.type, label: resourceLabel(row.type), state: 'missing' as const, names: [] }]
      return []
    })
  }

  const dayTotal = (day: DayWithServices) => day.services.reduce((sum, s) => sum + (Number(s.total_cost) || 0), 0)

  const attentionMessage = (item: AttentionItem) => {
    const language = item.language ? LANGUAGE_NAMES[item.language] : ''
    const p = { ...item.params, language }
    switch (item.code) {
      case 'missingResource': return tAtt('missingResource', { ...p, type: resourceLabel(String(item.params.type)) })
      default: return tAtt(item.code, p)
    }
  }

  const attentionAction = (item: AttentionItem): { label: string; run: () => void } | null => {
    if (item.action) {
      const { kind, day } = item.action
      return { label: tAtt(`action_${kind}`, { day: day ?? '' }), run: () => runAction(kind, day) }
    }
    // The language items open that language (or side by side) in the days.
    if (item.language || item.days) {
      return {
        label: tAtt('open'),
        run: () => openDailyItinerary(item.language && item.language !== sourceLanguage ? 'side' : (contentView ?? sourceLanguage)),
      }
    }
    return null
  }

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
      {/* HEADER — one main action, chosen by where the trip stands
          (lib/itineraries/trip-stage); everything else in a few menus.
          The layout is autoura-saas's, where the page was redesigned first. */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 space-y-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/itineraries" className="p-2 hover:bg-gray-100 rounded-md transition-colors shrink-0" title={tCommon('backToList')}>
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div className="min-w-0">
                {/* The programme code is the office's reference, not part of
                    the client's title — shown beside it, not in it. */}
                <h1 className="text-xl font-semibold text-gray-900 flex flex-wrap items-center gap-2" title={versionedContent.trip_name}>
                  <span className="truncate">{tourTitle.title}</span>
                  {tourTitle.code && (
                    <span className="px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 font-mono text-xs font-medium text-gray-600" title={t('tourCode')}>
                      {tourTitle.code}
                    </span>
                  )}
                </h1>
                <p className="text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-primary-600">{itinerary.itinerary_code}</span>
                  <span>•</span>
                  <span>{itinerary.client_name || tStage('noClient')}</span>
                  {itinerary.start_date && (
                    <>
                      <span>•</span>
                      <span>
                        {new Date(itinerary.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {itinerary.end_date && ` – ${new Date(itinerary.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span>
                    {t('adultsCount', { count: itinerary.num_adults })}
                    {itinerary.num_children > 0 ? `, ${t('childrenCount', { count: itinerary.num_children })}` : ''}
                    {itinerary.num_infants > 0 ? `, ${t('infantsCount', { count: itinerary.num_infants })}` : ''}
                  </span>
                  {itinerary.tier && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      itinerary.tier === 'luxury' ? 'bg-amber-100 text-amber-700' :
                      itinerary.tier === 'deluxe' ? 'bg-purple-100 text-purple-700' :
                      itinerary.tier === 'standard' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {itinerary.tier.toUpperCase()}
                    </span>
                  )}
                  {/* Linked records are links, not actions. */}
                  {existingBooking && (
                    <Link href={`/bookings/${existingBooking.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-gray-700 hover:bg-gray-50">
                      <BookOpen className="w-3 h-3" /> {existingBooking.booking_code}
                    </Link>
                  )}
                  {existingInvoice && (
                    <Link href={`/invoices/${existingInvoice.id}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-gray-700 hover:bg-gray-50">
                      <Receipt className="w-3 h-3" /> {existingInvoice.invoice_number}
                    </Link>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <HeaderMenu
                label={tStage('menuSend')}
                icon={<Send className="w-4 h-4" />}
                items={[
                  { label: t('sendQuote'), icon: <Send className="w-4 h-4" />, onSelect: () => setShowSendModal(true) },
                  {
                    label: sendingOwnWhatsApp ? tOwn('preparing') : tOwn('menuItem'),
                    icon: <MessageCircle className="w-4 h-4" />,
                    onSelect: sendFromMyWhatsApp,
                    disabled: sendingOwnWhatsApp || !itinerary.client_phone,
                    title: itinerary.client_phone ? tOwn('menuHint') : t('clientPhoneRequired'),
                  },
                  { label: tStage('shareLink'), icon: <Share2 className="w-4 h-4" />, onSelect: () => { setTab('messages'); scrollToId('share-link') }, title: tStage('shareLinkHint') },
                ]}
              />
              <HeaderMenu
                label={tStage('menuDocuments')}
                icon={<FileText className="w-4 h-4" />}
                items={[
                  // The quote PDF, one entry per language. A language with no
                  // text yet opens the translation instead of a PDF in the
                  // wrong language.
                  ...[sourceLanguage, ...(dayTranslations?.target_languages ?? [])].map(lang => ({
                    label: documentLanguageReady(lang)
                      ? (generatingPDF && pdfLanguage === lang ? t('generating') : tStage('quotePdf', { language: lang.toUpperCase() }))
                      : tStage('quotePdfMissing', { language: lang.toUpperCase() }),
                    icon: <Download className="w-4 h-4" />,
                    onSelect: () => (documentLanguageReady(lang) ? handlePreviewPDF(true, lang) : openDailyItinerary('side')),
                    disabled: generatingPDF || days.length === 0,
                    title: days.length === 0 ? t('pdfNeedsDays') : documentLanguageReady(lang) ? t('pdfTooltip') : tLayout('translateFirst', { language: LANGUAGE_NAMES[lang] }),
                  })),
                  { label: tLayout('docNittei'), icon: <FileText className="w-4 h-4" />, onSelect: () => setNitteiSignal(n => n + 1) },
                  { label: t('contract'), icon: <FileText className="w-4 h-4" />, href: `/documents/contract/${itinerary.id}` },
                  { label: tLayout('docSurvey'), icon: <ClipboardList className="w-4 h-4" />, onSelect: () => window.open(`/api/itineraries/${itinerary.id}/survey-pdf`, '_blank', 'noopener') },
                  { label: tLayout('docOpsSheet'), icon: <FileText className="w-4 h-4" />, onSelect: () => setOpsSheetSignal(n => n + 1), title: tLayout('staffLanguage') },
                  {
                    label: existingInvoice ? tStage('invoiceNumber', { number: existingInvoice.invoice_number }) : generatingInvoice ? t('creating') : tStage('createInvoice'),
                    icon: <Receipt className="w-4 h-4" />,
                    onSelect: handleGenerateInvoice,
                    disabled: generatingInvoice,
                  },
                ]}
              />
              <GenerateDocumentsButton
                itineraryId={itinerary.id}
                itineraryCode={itinerary.itinerary_code}
                triggerClassName="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5"
                triggerContent={<><FileText className="w-4 h-4" />{tStage('menuSupplierDocs')}<ChevronDown className="w-3.5 h-3.5" /></>}
              />
              <HeaderMenu
                ariaLabel={tStage('menuMore')}
                icon={<MoreHorizontal className="w-4 h-4" />}
                items={[
                  { label: tStage('editItinerary'), icon: <Edit2 className="w-4 h-4" />, href: `/itineraries/${itinerary.id}/edit` },
                  { label: tStage('addExpense'), icon: <Receipt className="w-4 h-4" />, onSelect: () => setExpenseSignal(n => n + 1) },
                  { label: generatingTasks ? t('generating') : t('operationsTasks'), icon: <ClipboardList className="w-4 h-4" />, onSelect: handleOpenTaskDialog, disabled: generatingTasks, title: t('generateOperationsTasks') },
                  { label: generatingCommissions ? t('generating') : tStage('generateCommissions'), icon: <Handshake className="w-4 h-4" />, onSelect: handleGenerateCommissions, disabled: generatingCommissions },
                  { label: duplicating ? tStage('duplicating') : tStage('duplicate'), icon: <Copy className="w-4 h-4" />, onSelect: duplicateTrip, disabled: duplicating, title: tStage('duplicateHint') },
                  itinerary.status === 'cancelled'
                    ? { label: tStage('reopen'), icon: <RotateCcw className="w-4 h-4" />, onSelect: reopenTrip }
                    : { label: tStage('cancelTrip'), icon: <XCircle className="w-4 h-4" />, onSelect: () => setShowCancel(true), danger: true },
                ]}
              />
              {/* The one thing to do next. */}
              {primary && (
                <button
                  type="button"
                  onClick={() => runAction(primary.kind)}
                  disabled={closingOut || converting || creatingBooking || (primary.kind === 'create_invoice' && generatingInvoice)}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-semibold disabled:opacity-50"
                  data-testid="primary-action"
                >
                  {tStage(`primary_${primary.kind}`)}
                </button>
              )}
            </div>
          </div>

          {dayTranslations && (
            <LanguageStatusRow
              sourceLanguage={sourceLanguage}
              targets={languageSummaries}
              clientLanguage={clientLanguage}
              view={contentView ?? sourceLanguage}
              onSelect={openDailyItinerary}
            />
          )}

          {/* Where the trip stands. */}
          {itinerary.status !== 'cancelled' ? (
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label={tStage('stageLabel')} data-testid="status-pipeline">
              {steps.map((st, i) => (
                <li key={st.key} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300 mx-0.5">→</span>}
                  <span className={`px-2 py-0.5 rounded-full border ${
                    st.current ? 'border-amber-300 bg-amber-50 text-amber-800 font-medium'
                    : st.done ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-gray-200 text-gray-400'
                  }`}>
                    {st.done ? '✓ ' : ''}{tStage(`step_${st.key}`)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs font-medium text-red-700">{tStage('cancelled')}</p>
          )}
        </div>
      </header>

      {/* The dialogs the menus open; each component keeps its own form. */}
      <AddExpenseFromItinerary
        itineraryId={itinerary.id}
        itineraryCode={itinerary.itinerary_code}
        clientName={itinerary.client_name}
        onExpenseAdded={() => setExpenseRefreshTrigger(prev => prev + 1)}
        openSignal={expenseSignal}
        hideTrigger
      />
      <GenerateNitteiButton
        itineraryId={itinerary.id}
        clientName={itinerary.client_name}
        startDate={itinerary.start_date}
        templateId={itinerary.template_id}
        onLinked={tid => setItinerary(prev => (prev ? { ...prev, template_id: tid } : prev))}
        openSignal={nitteiSignal}
        hideTrigger
      />
      <GenerateOpsSheetButton itineraryId={itinerary.id} itineraryCode={itinerary.itinerary_code} openSignal={opsSheetSignal} hideTrigger />
      {showCancel && (
        <CancelTripDialog
          itineraryId={itinerary.id}
          tripName={itinerary.trip_name}
          booking={existingBooking}
          paid={actualPnl && actualPnl.invoice_count > 0 ? actualPnl.total_paid : null}
          currency={itinerary.currency || 'EUR'}
          onClose={() => setShowCancel(false)}
          onCancelled={() => {
            setShowCancel(false)
            setItinerary(prev => (prev ? { ...prev, status: 'cancelled' } : prev))
          }}
        />
      )}
      {showEmail && user?.id && itinerary.client_email && (
        <ComposeEmailModal
          userId={user.id}
          defaultTo={itinerary.client_email}
          defaultSubject={`${versionedContent.trip_name} (${itinerary.itinerary_code})`}
          onClose={() => setShowEmail(false)}
          onSent={() => { setShowEmail(false); setSendSuccess(tStage('emailSent', { to: itinerary.client_email })); setTimeout(() => setSendSuccess(null), 5000) }}
        />
      )}

      {/* What needs attention — only when something does. */}
      {attentionItems.length > 0 && (
        <div className="container mx-auto px-4 pt-3">
          <div className="bg-white border border-amber-200 rounded-md divide-y divide-amber-100" data-testid="needs-attention">
            {attentionItems.map(item => {
              const action = attentionAction(item)
              return (
                <div key={item.key} className={`flex items-start justify-between gap-3 px-3 py-2 text-sm ${item.severity === 'low' ? 'text-gray-700' : 'text-amber-900'}`} data-testid={`attention-${item.code}`}>
                  <span className="flex items-start gap-2">
                    {item.severity === 'low' ? <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />}
                    {attentionMessage(item)}
                  </span>
                  {action && (
                    <button type="button" onClick={action.run} className="shrink-0 text-xs font-medium underline hover:no-underline">
                      {action.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Success Messages */}
      {(() => {
        const { complete, gaps } = itineraryCompleteness(days)
        if (complete) return null
        return (
          <div className="container mx-auto px-4 pt-3">
            <div className="rounded-lg border border-red-300 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">{t('incompleteTitle')}</p>
              <p className="text-sm text-red-800 mt-1">{t('incompleteBody', { count: gaps.length })}</p>
              <ul className="mt-2 space-y-0.5 text-sm text-red-900 list-disc pl-5">
                {gaps.map((g, i) => (
                  <li key={i}>{g.day ? t('gapOnDay', { day: g.day, name: g.name }) : g.name}</li>
                ))}
              </ul>
            </div>
          </div>
        )
      })()}

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

              {/* The same quote from the operator's own WhatsApp (wa.me), as a
                  message with the trip's share link. */}
              <button
                onClick={sendFromMyWhatsApp}
                disabled={!itinerary.client_phone || sendingOwnWhatsApp}
                className={`w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-all text-sm border ${
                  itinerary.client_phone && !sendingOwnWhatsApp
                    ? 'border-green-500 text-green-700 bg-white hover:bg-green-50'
                    : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
                data-testid="send-own-whatsapp"
              >
                {sendingOwnWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                <div className="text-left">
                  <div>{tOwn('menuItem')}</div>
                  <div className="text-xs opacity-80">{tOwn('modalHint')}</div>
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

      <div className="container mx-auto px-4 py-4">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4">
          {/* RIGHT PANEL — who, how much, whose. Above the tabs on a narrow screen. */}
          <aside className="lg:order-2 space-y-3 mb-4 lg:mb-0 lg:sticky lg:top-44 lg:self-start" data-testid="detail-rail">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4" data-testid="client-card">
              <p className="text-xs text-gray-500 mb-1">{t('client')}</p>
              <p className="text-sm font-semibold text-gray-900">{itinerary.client_name || tStage('noClient')}</p>
              {itinerary.client_email && (
                <a href={`mailto:${itinerary.client_email}`} className="block text-xs text-primary-600 hover:underline truncate">{itinerary.client_email}</a>
              )}
              {itinerary.client_phone && <p className="text-xs text-gray-600">{itinerary.client_phone}</p>}
              {(itinerary.client_phone || itinerary.client_email) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* Sent from the connected mailbox, so it lands in the inbox and the client's history. */}
                  {itinerary.client_email && user?.id && (
                    <button type="button" onClick={() => setShowEmail(true)} className="px-2 py-1 text-xs font-medium rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50">
                      {tStage('email')}
                    </button>
                  )}
                  {/* A chat from the operator's own WhatsApp. */}
                  {itinerary.client_phone && (
                    <a
                      href={`https://wa.me/${formatPhoneForWhatsApp(itinerary.client_phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 text-xs font-medium rounded-md border border-green-300 text-green-700 hover:bg-green-50"
                    >
                      WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={() => setTab('messages')} className="px-2 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
                    {tStage('messages')}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-1.5" data-testid="price-card">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{tStage('price')}</p>
                <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${getStatusBadge(itinerary.status)}`}>
                  {itinerary.status.charAt(0).toUpperCase() + itinerary.status.slice(1)}
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatMoney(effectiveTotalCost, itinerary.currency)}</p>
              <p className="text-xs text-gray-500">{tStage('daysTravellers', { days: itinerary.total_days, travellers: itinerary.num_adults + (itinerary.num_children || 0) + (itinerary.num_infants || 0) })}</p>
              {actualPnl && (
                <dl className="pt-2 mt-2 border-t border-gray-100 text-xs grid grid-cols-2 gap-y-1">
                  {actualPnl.invoice_count === 0 ? (
                    <><dt className="text-gray-500">{tStage('invoice')}</dt><dd className="text-right text-gray-700">{tStage('noneYet')}</dd></>
                  ) : (
                    <>
                      <dt className="text-gray-500">{tStage('paid')}</dt>
                      <dd className="text-right text-gray-900">{formatMoney(actualPnl.total_paid, itinerary.currency)}</dd>
                      <dt className="text-gray-500">{tStage('balanceDue')}</dt>
                      <dd className={`text-right font-medium ${actualPnl.total_revenue - actualPnl.total_paid > 0.005 ? 'text-amber-700' : 'text-green-700'}`}>
                        {formatMoney(Math.max(0, actualPnl.total_revenue - actualPnl.total_paid), itinerary.currency)}
                      </dd>
                    </>
                  )}
                  <dt className="text-gray-500">{tStage('costsRecorded')}</dt>
                  <dd className="text-right text-gray-900">{formatMoney(actualPnl.total_expenses, itinerary.currency)}</dd>
                  {actualPnl.invoice_count > 0 && (
                    <>
                      <dt className="text-gray-500">{tStage('profitSoFar')}</dt>
                      <dd className="text-right font-medium text-gray-900">{formatMoney(actualPnl.gross_profit, itinerary.currency)}</dd>
                    </>
                  )}
                </dl>
              )}
              <button type="button" onClick={() => setTab('finance')} className="text-xs text-primary-600 hover:underline">{tStage('openFinance')}</button>
            </div>

            {/* Trip owner — who inside the company is responsible for this trip.
                Distinct from the guide/vehicle/hotel assignments, which are
                resources booked FOR the client. */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <TripAssignee itineraryId={itinerary.id} />
              {versionedContent.notes && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">{t('notes')}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{versionedContent.notes}</p>
                </div>
              )}
            </div>

            {/* The trip's operations tasks, with the tasks themselves. */}
            <TripTasksCard itineraryId={itinerary.id} today={today} onSync={handleOpenTaskDialog} refreshSignal={tasksRefresh} />
          </aside>

          <div className="lg:order-1 min-w-0 space-y-4">
            {/* TABS — the itinerary, running it, the money, the messages. */}
            <nav className="flex gap-1 border-b border-gray-200 overflow-x-auto" aria-label={tStage('sections')} data-testid="detail-tabs">
              {DETAIL_TABS.map(id => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? 'page' : undefined}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                    tab === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {{ itinerary: tLayout('tabItinerary'), operations: tLayout('tabOperations'), finance: tLayout('tabFinance'), messages: tLayout('tabMessages') }[id]}
                </button>
              ))}
            </nav>

            {/* Task generation result banner */}
            {taskResult && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-indigo-700">{taskResult}</span>
                <Link href="/tasks" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 underline">{t('viewTasks')}</Link>
              </div>
            )}

            {tab === 'itinerary' && (
              <div className="space-y-4">
                {/* DAY CONTROLS */}
                <div id="daily-itinerary" className="flex flex-wrap justify-between items-center gap-2 scroll-mt-40">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-semibold text-gray-900">{t('dailyItinerary')}</h2>
                      {/* Which language the days are shown in. Content only — the
                          staff UI language is the sidebar's. */}
                      {dayTranslations && dayTranslations.target_languages.length > 0 && (
                        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium" role="tablist" data-testid="content-view-switcher">
                          {([sourceLanguage, ...dayTranslations.target_languages] as ContentView[]).concat('side').map(view => (
                            <button
                              key={view}
                              type="button"
                              role="tab"
                              aria-selected={contentView === view}
                              onClick={() => setContentView(view)}
                              className={`px-3 py-1 ${contentView === view ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              {view === 'side' ? tLang('sideBySide') : LANGUAGE_NAMES[view]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* How costs are kept: a setting, not a card. Manual lets a
                        cost below be typed over. */}
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5" data-testid="cost-mode">
                      {costMode === 'auto' ? <Calculator className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5 text-amber-600" />}
                      {costMode === 'auto' ? tStage('costsAuto') : tStage('costsManual')}
                      {' · '}
                      <button type="button" onClick={handleToggleCostMode} disabled={savingCostMode} className="text-primary-600 hover:underline disabled:opacity-50">
                        {costMode === 'auto' ? tStage('switchToManual') : tStage('switchToAuto')}
                      </button>
                      {costModeChanged && <span className="text-green-600 flex items-center gap-0.5"><Check className="w-3 h-3" />{tCommon('saved')}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={expandAll} className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">{t('expandAll')}</button>
                    <button onClick={collapseAll} className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors">{t('collapseAll')}</button>
                  </div>
                </div>

                {/* The viewed translation's gaps, here and only here — the language a
                    banner is about is the language of the text under it. */}
                {(() => {
                  const lang: Language | null = contentView === 'side' ? sideTarget : (contentView && contentView !== sourceLanguage ? contentView : null)
                  const summary = lang ? languageSummaries.find(l => l.language === lang) : null
                  if (!lang || !summary || summary.status === 'reviewed' || summary.status === 'machine') return null
                  const text = summary.status === 'missing'
                    ? tLang('missingBanner', { language: LANGUAGE_NAMES[lang] })
                    : summary.status === 'partial'
                      ? tLang('partialBanner', { language: LANGUAGE_NAMES[lang], missing: summary.counts.missing, total: summary.total })
                      : tLang('outdatedBanner', { language: LANGUAGE_NAMES[lang], count: summary.counts.outdated })
                  return (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5" data-testid="language-banner">
                      <Languages className="w-4 h-4 text-amber-700 shrink-0" />
                      <p className="flex-1 text-sm text-amber-900">{text}</p>
                      <button
                        type="button"
                        onClick={() => handleTranslateAll(lang)}
                        disabled={translatingAll || creatingVersion}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {translatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                        {tLang('translateAll')}
                      </button>
                      {contentView !== 'side' && (
                        <button
                          type="button"
                          onClick={() => setContentView('side')}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          {tLang('writeSideBySide')}
                        </button>
                      )}
                    </div>
                  )
                })()}

                {/* ROUTE MAP */}
                {days.length > 0 && (
                  <ItineraryMap
                    days={days.map((d) => ({
                      day_number: d.day_number,
                      title: d.title,
                      city: d.city,
                      overnight_city: d.overnight_city,
                      date: d.date,
                    }))}
                  />
                )}

                {/* DAYS LIST */}
                <div className="space-y-3">
                  {days.map((day, dayIndex) => {
                    const chips = dayChips(dayIndex)
                    const missing = chips.filter(c => c.state === 'missing')
                    return (
                    <div key={day.id} id={`day-${day.day_number}`} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden scroll-mt-40">
                      <button onClick={() => toggleDay(day.day_number)} className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between gap-3 hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-primary-600 text-white rounded-md flex items-center justify-center font-semibold text-sm shrink-0">{day.day_number}</div>
                          <div className="text-left min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900">{day.title || t('dayNumber', { number: day.day_number })}</h3>
                            <p className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{day.city && ` • ${day.city}`}</p>
                            {/* The day's guide, vehicle, hotel… as tags: who is
                                assigned, or dashed amber when still needed. */}
                            {chips.length > 0 && (
                              <span className="mt-1 flex flex-wrap gap-1" data-testid="day-resources">
                                {chips.map(c => c.state === 'covered' ? (
                                  <span key={c.type} className="inline-flex max-w-[14rem] items-center rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] text-green-800" title={`${c.label}: ${c.names.join(', ')}`}>
                                    <span className="truncate">{c.label}: {c.names.join(', ')}</span>
                                  </span>
                                ) : (
                                  <span key={c.type} className="inline-flex items-center rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                                    {tStage('resourceNeeded', { type: c.label })}
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Each target language's state for this day. */}
                          <span className="hidden sm:flex items-center gap-1">
                            {dayTranslations?.target_languages.map(lang => {
                              const status = translationByDay.get(day.id)?.translations[lang]?.status
                              return status ? <DayLanguageChip key={lang} language={lang} status={status} /> : null
                            })}
                          </span>
                          {day.services.length > 0 && <span className="text-xs text-gray-500 whitespace-nowrap">{formatMoney(dayTotal(day), itinerary.currency)}</span>}
                          {expandedDays.has(day.day_number) ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                        </div>
                      </button>
                      {expandedDays.has(day.day_number) && (
                        <div className="p-4">
                          {(() => {
                            const tr = translationByDay.get(day.id)
                            if (contentView === 'side' && sideTarget && tr) {
                              const target = tr.translations[sideTarget]
                              return (
                                <div className="mb-4">
                                  <BilingualDayEditor
                                    itineraryId={itinerary.id}
                                    dayId={day.id}
                                    sourceLanguage={sourceLanguage}
                                    targetLanguage={sideTarget}
                                    source={tr.source}
                                    target={target?.text ?? null}
                                    status={target?.status ?? 'missing'}
                                    onChanged={async () => { await fetchDayTranslations() }}
                                  />
                                </div>
                              )
                            }
                            return day.description
                              ? <div className="mb-4"><p className="text-sm text-gray-700 whitespace-pre-line"><HighlightPlaceholders text={day.description} /></p></div>
                              : null
                          })()}
                          {missing.length > 0 && (
                            <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-dashed border-amber-300 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                              <span>{tStage('stillToAssign', { types: missing.map(c => c.label).join(', ') })}</span>
                              <button type="button" onClick={() => runAction('assign_resources')} className="shrink-0 font-medium underline hover:no-underline">{tStage('assign')}</button>
                            </p>
                          )}
                          {/* The day's services as a table — Service · Type · Qty · Cost,
                              with the day's total. Shared by every language. */}
                          {day.services && day.services.length > 0 ? (
                            <div className="overflow-x-auto">
                              {dayTranslations && dayTranslations.target_languages.length > 0 && (
                                <p className="text-[11px] text-gray-500 mb-1">{tLang('sharedServices')}</p>
                              )}
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                                    <th className="text-left font-medium py-1.5 pr-2">{tStage('colService')}</th>
                                    <th className="text-left font-medium py-1.5 px-2 hidden sm:table-cell">{tStage('colType')}</th>
                                    <th className="text-right font-medium py-1.5 px-2">{tStage('colQty')}</th>
                                    <th className="text-right font-medium py-1.5 pl-2">{tStage('colCost')}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {day.services.map((service) => {
                                    const noCost = (Number(service.rate_eur) || 0) === 0 && (Number(service.total_cost) || 0) === 0
                                    const typeLabel = tEdit.has(`serviceTypes.${service.service_type}`) ? tEdit(`serviceTypes.${service.service_type}`) : service.service_type.replace('_', ' ')
                                    return (
                                      <tr key={service.id} className={noCost ? 'bg-red-50' : ''}>
                                        <td className="py-2 pr-2 align-top">
                                          <div className="flex items-start gap-1.5">
                                            <span className="text-base leading-5">{getServiceIcon(service.service_type)}</span>
                                            <div className="min-w-0">
                                              <p className={`font-medium ${noCost ? 'text-red-800' : 'text-gray-900'}`}>
                                                {service.service_name}
                                                {noCost && <span className="ml-2 px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-600 text-white align-middle">{t('noCost')}</span>}
                                              </p>
                                              <p className="text-xs text-gray-500 sm:hidden">{typeLabel}</p>
                                              {service.notes && !service.notes.startsWith('__grid:') && <p className="text-xs text-gray-600 mt-0.5">{service.notes}</p>}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-2 px-2 align-top text-xs text-gray-600 hidden sm:table-cell">{typeLabel}</td>
                                        <td className="py-2 px-2 align-top text-right text-gray-700">{service.quantity}</td>
                                        <td className="py-2 pl-2 align-top text-right whitespace-nowrap">
                                          {costMode === 'manual' && editingServiceId === service.id ? (
                                            <div className="flex items-center justify-end gap-1">
                                              <input type="number" value={editedCost} onChange={(e) => setEditedCost(e.target.value)} className="w-20 px-2 py-1 text-sm font-semibold text-right border border-primary-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveServiceCost(service.id, day.id); if (e.key === 'Escape') handleCancelEditCost() }} />
                                              <button onClick={() => handleSaveServiceCost(service.id, day.id)} disabled={savingServiceCost} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                                              <button onClick={handleCancelEditCost} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                                            </div>
                                          ) : (
                                            <button onClick={() => handleStartEditCost(service)} disabled={costMode !== 'manual'} className={`font-semibold ${costMode === 'manual' ? 'text-amber-700 hover:text-amber-800 cursor-pointer underline decoration-dashed underline-offset-2' : 'text-gray-900 cursor-default'}`} title={costMode === 'manual' ? t('clickToEdit') : t('switchToManualMode')}>
                                              {formatMoney(Number(service.total_cost) || 0, itinerary.currency)}
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                              <div className="mt-1 pt-2 border-t border-gray-200 flex items-center justify-between gap-2 text-sm">
                                <Link href={`/itineraries/${itinerary.id}/edit`} className="text-xs text-primary-600 hover:underline">{tStage('addService')}</Link>
                                <span className="text-gray-500 text-xs">{tStage('dayTotal')} <span className="ml-1 text-sm font-semibold text-gray-900">{formatMoney(dayTotal(day), itinerary.currency)}</span></span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-6 text-gray-500">
                              <p className="text-sm">{t('noServicesAdded')}</p>
                              <Link href={`/itineraries/${itinerary.id}/edit`} className="mt-1 inline-block text-xs text-primary-600 hover:underline">{tStage('addService')}</Link>
                            </div>
                          )}
                          {(() => {
                            // The hotel or ship the night is at, read off the day's own
                            // accommodation line (lib/itineraries/overnight-property).
                            const property = overnightProperty(day.services)
                            if (!property && !day.overnight_city) return null
                            // The night line that named it says whether it is still in Rates.
                            const status = day.services.find(s => s.property_rate_status)?.property_rate_status
                            const stale = property && (status === 'not_on_file' || status === 'switched_off')
                            return (
                              <div className="mt-3 pt-3 border-t border-gray-200" data-testid="day-overnight">
                                <p className="text-xs text-gray-600">
                                  {property?.kind === 'cruise'
                                    ? `🚢 ${t('aboardShip', { name: property.name })}`
                                    : property
                                      ? `🏨 ${t('overnightAt', { place: overnightLabel(property, day.overnight_city) })}`
                                      : `🌙 ${t('overnightIn', { city: day.overnight_city })}`}
                                </p>
                                {stale && (
                                  <p className="mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1" data-testid="overnight-stale">
                                    ⚠ {status === 'switched_off'
                                      ? t('propertySwitchedOff', { name: property!.name })
                                      : t('propertyNotInRates', { name: property!.name })}
                                  </p>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>

                {days.length === 0 && <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center"><p className="text-sm text-gray-500">{tStage('noDays')}</p></div>}
              </div>
            )}

            {tab === 'operations' && (
              <div className="space-y-4">
                {/* Resources: what each day needs against what is assigned. */}
                <CoverageGrid
                  itineraryId={itinerary.id}
                  days={days}
                  assignments={assignments}
                  onAssign={type => {
                    setRequestedResourceTab({ type, nonce: Date.now() })
                    scrollToId('resource-assignment')
                  }}
                />
                {(itinerary.assigned_guide_id || itinerary.assigned_vehicle_id || itinerary.pickup_location || itinerary.pickup_time) && <ResourceSummaryCard guideId={itinerary.assigned_guide_id} vehicleId={itinerary.assigned_vehicle_id} guideNotes={itinerary.guide_notes} vehicleNotes={itinerary.vehicle_notes} pickupLocation={itinerary.pickup_location} pickupTime={itinerary.pickup_time} onEdit={() => scrollToId('resource-assignment')} />}
                <div id="resource-assignment" className="scroll-mt-40">
                  <ResourceAssignmentV2 itineraryId={itinerary.id} startDate={itinerary.start_date} endDate={itinerary.end_date} numTravelers={itinerary.num_adults + itinerary.num_children + (itinerary.num_infants || 0)} clientName={itinerary.client_name} tripName={itinerary.trip_name} onUpdate={() => { fetchItinerary(); setResourceRefresh(n => n + 1) }} requestedTab={requestedResourceTab} />
                </div>
                {/* The live log: checkpoints from the road, and the office's notes. */}
                <div id="trip-timeline" className="scroll-mt-40">
                  <TripTimeline
                    itineraryId={itinerary.id}
                    tripName={tourTitle.title}
                    startDate={itinerary.start_date}
                    endDate={itinerary.end_date}
                    today={today}
                    people={(assignments ?? [])
                      .filter(a => a.id && String(a.status ?? '').toLowerCase() !== 'cancelled')
                      .map(a => ({ id: a.id!, label: `${resourceLabel(a.resource_type)}: ${a.resource_name ?? ''}`.trim() }))}
                  />
                </div>
              </div>
            )}

            {tab === 'finance' && (
              <div className="space-y-4">
                {/* GENERATION WARNINGS */}
                {itinerary.generation_warnings && itinerary.generation_warnings.length > 0 && (
                  <div className="bg-amber-50 rounded-lg border border-amber-300 shadow-sm p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-amber-900 mb-2">
                          Pricing Warnings ({itinerary.generation_warnings.length})
                        </h3>
                        <p className="text-xs text-amber-700 mb-3">
                          The following issues were detected during itinerary generation. Some services may have missing or zero prices.
                        </p>
                        <ul className="space-y-1">
                          {itinerary.generation_warnings.map((warning: string, idx: number) => (
                            <li key={idx} className="text-xs text-amber-800 flex items-start gap-2">
                              <span className="text-amber-500 mt-0.5">•</span>
                              <span>{warning}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {/* The invoice and its payments are kept on the invoice. */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{tStage('invoicesPayments')}</h3>
                    <p className="text-xs text-gray-500">
                      {actualPnl && actualPnl.invoice_count > 0
                        ? tStage('invoicedPaid', { invoiced: formatMoney(actualPnl.total_revenue, itinerary.currency), paid: formatMoney(actualPnl.total_paid, itinerary.currency) })
                        : tStage('noInvoiceYet')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {existingInvoice && (
                      <Link href={`/invoices/${existingInvoice.id}`} className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
                        {tStage('recordPayment')}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleGenerateInvoice}
                      disabled={generatingInvoice}
                      className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Receipt className="w-4 h-4" />
                      {generatingInvoice ? t('creating') : existingInvoice ? existingInvoice.invoice_number : tStage('createInvoice')}
                    </button>
                  </div>
                </div>

                {/* PROFIT & LOSS */}
                {days.length > 0 && <ItineraryPL
                  itineraryId={itinerary.id}
                  totalCost={effectiveTotalCost}
                  supplierCost={itinerary.supplier_cost}
                  currency={itinerary.currency}
                  marginPercent={25}
                  days={days}
                  extraExpenses={itineraryExpenses.map(exp => ({
                    amount: exp.amount,
                    currency: exp.currency,
                    category: exp.category,
                    booking_supplier_status_id: exp.booking_supplier_status_id
                  }))}
                />}

                {/* EXTRA EXPENSES */}
                <ItineraryExpenses
                  itineraryId={itinerary.id}
                  currency={itinerary.currency}
                  refreshTrigger={expenseRefreshTrigger}
                  onExpensesChanged={(expenses) => setItineraryExpenses(expenses)}
                />
              </div>
            )}

            {tab === 'messages' && (
              <div className="space-y-4">
                {/* WHATSAPP — where the payment stands, then the messages. */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{tStage('whatsappTo', { name: itinerary.client_name || tStage('theClient') })}</h3>
                      <p className="text-xs text-gray-500">{itinerary.client_phone || tStage('noPhone')}{itinerary.status === 'sent' && ` · ${t('quoteSent')}`}</p>
                    </div>
                    {actualPnl && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {actualPnl.invoice_count === 0 ? (
                          <span className="text-gray-600">{tStage('noInvoiceYet')}</span>
                        ) : (
                          <>
                            <span className="text-gray-600">{tStage('invoiced')} <span className="font-semibold text-gray-900">{formatMoney(actualPnl.total_revenue, itinerary.currency)}</span></span>
                            <span className="text-gray-600">{tStage('paid')} <span className="font-semibold text-gray-900">{formatMoney(actualPnl.total_paid, itinerary.currency)}</span></span>
                            {actualPnl.total_revenue - actualPnl.total_paid > 0.005 ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">{tStage('balanceDueAmount', { amount: formatMoney(actualPnl.total_revenue - actualPnl.total_paid, itinerary.currency) })}</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">{tStage('paidInFull')}</span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {!itinerary.client_phone ? (
                    <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">{t('clientPhoneRequiredWarning')}</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <button type="button" onClick={sendFromMyWhatsApp} disabled={sendingOwnWhatsApp} className="px-3 py-1.5 border border-green-300 bg-white text-green-700 rounded-md hover:bg-green-50 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                        {sendingOwnWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} {tOwn('menuItem')}
                      </button>
                      {itinerary.status === 'draft' && <WhatsAppButton itineraryId={itinerary.id} type="status" status="confirmed" onSuccess={() => { setSendSuccess(t('bookingConfirmationSent')); setTimeout(() => setSendSuccess(null), 5000); fetchItinerary() }} className="bg-blue-600 hover:bg-blue-700" />}
                      {itinerary.status !== 'completed' && <WhatsAppButton itineraryId={itinerary.id} type="status" status="pending_payment" onSuccess={() => { setSendSuccess(t('paymentReminderSent')); setTimeout(() => setSendSuccess(null), 5000) }} className="bg-yellow-600 hover:bg-yellow-700" />}
                      <WhatsAppButton itineraryId={itinerary.id} type="status" status="paid" onSuccess={() => { setSendSuccess(t('paymentConfirmationSent')); setTimeout(() => setSendSuccess(null), 5000); fetchItinerary() }} className="bg-emerald-600 hover:bg-emerald-700" />
                    </div>
                  )}
                </div>

                {/* SHARE LINK — the client-facing live itinerary page */}
                <div id="share-link" className="scroll-mt-40">
                  <ShareLinkCard itineraryId={itinerary.id} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Assignment Dialog */}
        {showTaskDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{t('assignTasks')}</h2>
                <button
                  onClick={() => setShowTaskDialog(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                {taskPreview && (() => {
                  const actionStyle: Record<string, string> = {
                    create: 'bg-green-50 text-green-700 border-green-200',
                    update: 'bg-blue-50 text-blue-700 border-blue-200',
                    reopen: 'bg-amber-50 text-amber-800 border-amber-200',
                    unchanged: 'bg-gray-50 text-gray-500 border-gray-200',
                  }
                  // Departments receiving a task, each listed once for assignment.
                  const receiving = [...new Map(taskPreview.tasks.map(tk => [tk.department.id, tk.department])).values()]
                  return (
                    <>
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-2">{t('taskPreviewTitle')}</p>
                        {taskPreview.tasks.length === 0 ? (
                          <p className="text-sm text-gray-500">{t('taskPreviewEmpty')}</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {taskPreview.tasks.map(tk => (
                              <li key={tk.service_type} className="flex items-center gap-2 text-sm">
                                <span className={`px-2 py-0.5 rounded border text-[11px] font-medium shrink-0 ${actionStyle[tk.action]}`}>
                                  {t(`taskAction_${tk.action}`)}
                                </span>
                                <span className="font-medium text-gray-900">{tk.label}</span>
                                <span className="text-gray-400 text-xs">{t('taskServiceCount', { count: tk.service_count })}</span>
                                {tk.action !== 'create' && tk.new_rows > 0 && (
                                  <span className="text-xs text-blue-700">{t('taskNewRows', { count: tk.new_rows })}</span>
                                )}
                                {tk.unpriced_rows > 0 && (
                                  <span className="text-xs text-amber-700">{t('taskUnpricedRows', { count: tk.unpriced_rows })}</span>
                                )}
                                {tk.to_cancel > 0 && (
                                  <span className="text-xs text-red-700">{t('taskToCancel', { count: tk.to_cancel })}</span>
                                )}
                                <span className="ml-auto text-xs text-gray-500 shrink-0">{tk.department.name}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {taskPreview.skipped.length > 0 && (
                        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                          {t('taskSkipped', {
                            list: taskPreview.skipped.map(sk => `${sk.label} (${sk.service_count})`).join(', '),
                          })}
                        </p>
                      )}
                      {taskPreview.orphaned.length > 0 && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                          {t('taskOrphaned', { list: taskPreview.orphaned.map(o => o.label).join(', ') })}
                        </p>
                      )}
                      {taskPreview.other_tasks > 0 && (
                        <p className="text-xs text-gray-500">{t('taskOtherTasks', { count: taskPreview.other_tasks })}</p>
                      )}

                      {receiving.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                          <p className="text-sm text-gray-500">{t('assignTasksDescription')}</p>
                          {receiving.map(dept => {
                            const deptMembers = taskTeamMembers.filter(m => m.department_id === dept.id)
                            return (
                              <div key={dept.id} className="flex items-center gap-3">
                                <label className="text-sm font-medium text-gray-700 w-28 shrink-0">
                                  {dept.name}
                                </label>
                                <select
                                  value={taskAssignments[dept.id] || ''}
                                  onChange={(e) => setTaskAssignments(prev => ({ ...prev, [dept.id]: e.target.value }))}
                                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                  <option value="">{t('unassigned')}</option>
                                  {deptMembers.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                  ))}
                                  {deptMembers.length === 0 && (
                                    <option disabled>{t('noMembersInDept')}</option>
                                  )}
                                </select>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              <div className="flex gap-3 p-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowTaskDialog(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateTasks}
                  disabled={!taskPreview?.tasks.some(tk => tk.action !== 'unchanged')}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ClipboardList className="w-4 h-4" />
                  {t('generate')}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        pdfBlob={pdfPreviewBlob}
        filename={itinerary ? `${itinerary.itinerary_code}_${itinerary.client_name.replace(/\s+/g, '_')}.pdf` : 'itinerary.pdf'}
        isOpen={showPdfPreview}
        onClose={() => {
          setShowPdfPreview(false)
          setPdfPreviewBlob(null)
        }}
        onSendEmail={() => {
          setShowPdfPreview(false)
          setShowSendModal(true)
        }}
        title="Itinerary PDF Preview"
        showBreakdown={pdfShowBreakdown}
        onToggleBreakdown={handleToggleBreakdown}
      />
    </div>
  )
}