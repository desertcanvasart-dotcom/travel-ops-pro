'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle, AlertCircle, Users, Calendar, MapPin,
  DollarSign, Languages, Loader2, MessageSquare, Sparkles,
  User, Mail, Phone, Globe, ChevronRight, UserPlus, ArrowLeft,
  Crown, Star, Settings
} from 'lucide-react'
import Link from 'next/link'

// ============================================
// TYPES
// ============================================

interface UserPreferences {
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
}

interface ExtractedData {
  client_name: string
  client_email: string
  client_phone: string
  tour_name: string
  start_date: string
  end_date: string | null
  duration_days: number
  num_adults: number
  num_children: number
  cities: string[]
  interests: string[]
  special_requests: string[]
  budget_level: string
  hotel_name: string
  hotel_location: string
  conversation_language: string
  confidence_score: number
  nationality?: string
  tier?: string
}

interface ExistingClient {
  id: string
  client_code: string
  full_name: string
  email: string
  phone: string
}

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700 border-gray-300', description: 'Cost-effective, good value' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700 border-blue-300', description: 'Comfortable mid-range' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700 border-purple-300', description: 'Superior quality' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700 border-amber-300', description: 'Top-tier VIP experience' }
]

const DEFAULT_PREFERENCES: UserPreferences = {
  default_cost_mode: 'auto',
  default_tier: 'standard',
  default_margin_percent: 25,
  default_currency: 'EUR'
}

const SAMPLE_CONVERSATION = `Cliente: Hola, queremos hacer un tour a Memphis, Sakkara
Agente: ¡Perfecto! ¿Cuántas personas?
Cliente: 4 adultos
Agente: ¿Para qué fecha?
Cliente: 12 de noviembre
Cliente: Y queremos añadir Dahshur también
Cliente: Mi nombre es Inmaculada Yurba Minguez
Cliente: Mi email es inmayurba@yahoo.es
Agente: Perfecto, ¿en qué hotel se alojan?
Cliente: Gran Plaza
Cliente: Queremos algo de lujo, es nuestro aniversario`

// ============================================
// HELPER FUNCTIONS
// ============================================

const mapBudgetToTier = (budgetLevel: string): string => {
  const mapping: Record<string, string> = {
    'budget': 'budget',
    'economy': 'budget',
    'standard': 'standard',
    'mid-range': 'standard',
    'deluxe': 'deluxe',
    'superior': 'deluxe',
    'luxury': 'luxury',
    'premium': 'luxury',
    'vip': 'luxury',
    'high-end': 'luxury'
  }
  return mapping[budgetLevel?.toLowerCase()] || 'standard'
}

const getTierColors = (tier: string) => {
  switch (tier) {
    case 'luxury': return { border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-600' }
    case 'deluxe': return { border: 'border-purple-500', bg: 'bg-purple-50', text: 'text-purple-600' }
    case 'standard': return { border: 'border-blue-500', bg: 'bg-blue-50', text: 'text-blue-600' }
    default: return { border: 'border-gray-500', bg: 'bg-gray-50', text: 'text-gray-600' }
  }
}

// ============================================
// MAIN EXPORT WITH SUSPENSE
// ============================================

export default function WhatsappParserPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading WhatsApp Parser...</p>
        </div>
      </div>
    }>
      <WhatsAppParserContent />
    </Suspense>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

function WhatsAppParserContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL params
  const preSelectedClientId = searchParams?.get('clientId')
  const conversationParam = searchParams?.get('conversation')
  const phoneParam = searchParams?.get('phone')

  // ============================================
  // STATE
  // ============================================

  // User preferences (loaded from database)
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  // Conversation & Analysis
  const [conversation, setConversation] = useState('')
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Itinerary Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedItinerary, setGeneratedItinerary] = useState<any>(null)
  const [selectedTier, setSelectedTier] = useState<string>('standard')

  // Client Management
  const [existingClients, setExistingClients] = useState<ExistingClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientSaved, setClientSaved] = useState(false)
  const [isSavingClient, setIsSavingClient] = useState(false)

  // UI State
  const [fromInbox, setFromInbox] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)

  // Refs
  const itinerarySuccessRef = useRef<HTMLDivElement>(null)

  // ============================================
  // EFFECTS
  // ============================================

  // 1. Load user preferences on mount
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setPreferencesLoaded(true)
          return
        }

        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (data && !error) {
          const prefs: UserPreferences = {
            default_cost_mode: data.default_cost_mode || 'auto',
            default_tier: data.default_tier || 'standard',
            default_margin_percent: data.default_margin_percent || 25,
            default_currency: data.default_currency || 'EUR'
          }
          setUserPreferences(prefs)
          setSelectedTier(prefs.default_tier)
          console.log('✅ Loaded user preferences:', prefs)
        } else {
          console.log('ℹ️ No user preferences found, using defaults')
        }
      } catch (error) {
        console.error('Error loading preferences:', error)
      } finally {
        setPreferencesLoaded(true)
      }
    }

    loadUserPreferences()
  }, [])

  // 2. Load conversation from URL params (from WhatsApp Inbox)
  useEffect(() => {
    if (conversationParam) {
      const isBase64 = new URLSearchParams(window.location.search).get("encoded") === "base64"
      const decoded = isBase64
        ? decodeURIComponent(escape(atob(conversationParam)))
        : decodeURIComponent(conversationParam)
      setConversation(decoded)
      setFromInbox(true)
    }
    if (phoneParam) {
      setPhoneNumber(phoneParam)
    }
  }, [conversationParam, phoneParam])

  // 3. Handle pre-selected client from URL
  useEffect(() => {
    if (preSelectedClientId && !selectedClientId) {
      setSelectedClientId(preSelectedClientId)
      setClientSaved(true)
      loadClientInfo(preSelectedClientId)
    }
  }, [preSelectedClientId])

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  const loadClientInfo = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('first_name, last_name, client_code')
        .eq('id', clientId)
        .single()

      if (error) throw error
      console.log('Pre-selected client:', data)
    } catch (error) {
      console.error('Error loading client:', error)
    }
  }

  const loadSample = () => {
    setConversation(SAMPLE_CONVERSATION)
    setExtractedData(null)
    setGeneratedItinerary(null)
    setError(null)
    setClientSaved(false)
    setSelectedTier(userPreferences.default_tier)
  }

  const viewClientProfile = () => {
    if (selectedClientId) {
      router.push(`/clients/${selectedClientId}`)
    }
  }

  // ============================================
  // ANALYZE CONVERSATION
  // ============================================

  const analyzeConversation = async () => {
    if (!conversation.trim()) {
      setError('Please paste a WhatsApp conversation')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setExtractedData(null)
    setExistingClients([])
    setSelectedClientId(preSelectedClientId || null)
    setClientSaved(!!preSelectedClientId)

    try {
      const response = await fetch('/api/ai/parse-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to analyze conversation')
      }

      // If we have phone from inbox, add it to extracted data
      if (phoneNumber && !result.data.client_phone) {
        result.data.client_phone = phoneNumber
      }

      // Map budget_level to tier if AI extracted it
      // But prefer user's default tier if AI didn't detect anything specific
      const aiDetectedTier = mapBudgetToTier(result.data.budget_level || '')
      const finalTier = result.data.budget_level
        ? aiDetectedTier
        : userPreferences.default_tier

      result.data.tier = finalTier
      setSelectedTier(finalTier)

      setExtractedData(result.data)

      // Search for existing clients by email or phone
      if (result.data.client_email || result.data.client_phone) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, client_code, first_name, last_name, email, phone')
          .or(`email.eq.${result.data.client_email},phone.eq.${result.data.client_phone}`)
          .limit(5)

        if (clients && clients.length > 0) {
          setExistingClients(clients.map(c => ({
            ...c,
            full_name: `${c.first_name || ''} ${c.last_name || ''}`.trim()
          })))
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ============================================
  // SAVE AS NEW CLIENT
  // ============================================

  const saveAsNewClient = async () => {
    if (!extractedData) return

    setIsSavingClient(true)
    setError(null)

    try {
      const nameParts = extractedData.client_name.trim().split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || nameParts[0]

      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: extractedData.client_email || null,
          phone: extractedData.client_phone || phoneNumber || null,
          nationality: extractedData.nationality || 'Unknown',
          status: 'prospect',
          client_type: extractedData.num_adults > 2 ? 'family' : 'individual',
          passport_type: 'other',
          preferred_language: extractedData.conversation_language || 'English',
          client_source: 'whatsapp',
          vip_status: selectedTier === 'luxury'
        })
        .select()
        .single()

      if (clientError) throw clientError

      if (newClient) {
        await supabase
          .from('client_preferences')
          .insert({
            client_id: newClient.id,
            preferred_accommodation_type: selectedTier === 'luxury' ? '5-star' : selectedTier === 'deluxe' ? '4-star' : '3-star',
            tour_pace_preference: 'moderate',
            interests: extractedData.interests.join(', '),
            dietary_restrictions: null,
            special_needs: extractedData.special_requests.join(', ') || null,
            preferred_tier: selectedTier
          })

        await supabase
          .from('client_notes')
          .insert({
            client_id: newClient.id,
            note_text: `Client inquiry via WhatsApp. Interested in: ${extractedData.tour_name}. ${extractedData.cities.join(', ')}. ${extractedData.num_adults} adults${extractedData.num_children > 0 ? `, ${extractedData.num_children} children` : ''}. Preferred tier: ${selectedTier.toUpperCase()}.`,
            note_type: 'general',
            is_internal: true
          })

        if (phoneNumber) {
          await supabase
            .from('whatsapp_conversations')
            .update({
              client_id: newClient.id,
              client_name: `${firstName} ${lastName}`.trim()
            })
            .eq('phone_number', phoneNumber)
        }

        setSelectedClientId(newClient.id)
        setClientSaved(true)
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client')
    } finally {
      setIsSavingClient(false)
    }
  }

  // ============================================
  // GENERATE ITINERARY
  // ============================================

  const generateItinerary = async () => {
    if (!extractedData) return

    if (!selectedClientId) {
      const shouldCreate = confirm('Create a new client profile before generating itinerary?')
      if (shouldCreate) {
        await saveAsNewClient()
      }
    }

    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extractedData,
          client_id: selectedClientId,
          tier: selectedTier,
          budget_level: selectedTier,
          // Pass user preferences
          cost_mode: userPreferences.default_cost_mode,
          margin_percent: userPreferences.default_margin_percent,
          currency: userPreferences.default_currency
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate itinerary')
      }

      setGeneratedItinerary(result.data)

      setTimeout(() => {
        itinerarySuccessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)

      if (selectedClientId) {
        await supabase
          .from('communication_history')
          .insert({
            client_id: selectedClientId,
            communication_type: 'whatsapp',
            direction: 'inbound',
            subject: `Inquiry: ${extractedData.tour_name}`,
            content: conversation.substring(0, 500),
            communication_date: new Date().toISOString()
          })
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  // ============================================
  // RENDER
  // ============================================

  if (!preferencesLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading preferences...</p>
        </div>
      </div>
    )
  }

  const tierColors = getTierColors(selectedTier)

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            {fromInbox && (
              <Link
                href="/whatsapp-inbox"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
            )}
            <div className="p-2 bg-primary-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">AI WhatsApp Parser</h1>
              <p className="text-xs text-gray-600">
                {fromInbox
                  ? 'Conversation loaded from WhatsApp Inbox → Analyze → Select Tier → Generate itinerary'
                  : 'Paste conversation → AI extracts info → Select Tier → Generate itinerary → Save client'
                }
              </p>
            </div>

            {/* Preferences Indicator */}
            <Link
             href="/settings?tab=preferences"
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Edit default preferences"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">
                Default: <strong className={tierColors.text}>{userPreferences.default_tier}</strong> • {userPreferences.default_currency} • {userPreferences.default_margin_percent}%
              </span>
            </Link>
          </div>

          {/* From Inbox Banner */}
          {fromInbox && (
            <div className="bg-[#25D366]/10 border border-[#25D366]/30 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-[#25D366]">
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Conversation loaded from WhatsApp Inbox
                  {phoneNumber && <span className="text-gray-600 ml-2">({phoneNumber})</span>}
                </span>
              </div>
            </div>
          )}

          {/* Steps */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 text-lg">1️⃣</span>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              </div>
              <div className="text-xs text-gray-600">Step 1</div>
              <div className="text-sm font-bold text-gray-900">Analyze</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 text-lg">2️⃣</span>
                <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
              </div>
              <div className="text-xs text-gray-600">Step 2</div>
              <div className="text-sm font-bold text-gray-900">Select Tier</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 text-lg">3️⃣</span>
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
              </div>
              <div className="text-xs text-gray-600">Step 3</div>
              <div className="text-sm font-bold text-gray-900">Save Client</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 text-lg">4️⃣</span>
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
              </div>
              <div className="text-xs text-gray-600">Step 4</div>
              <div className="text-sm font-bold text-gray-900">Generate</div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT - TWO COLUMNS */}
        <div className="grid grid-cols-2 gap-4">

          {/* LEFT COLUMN: Input */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-900">WhatsApp Conversation</h2>
                {!fromInbox && (
                  <button
                    onClick={loadSample}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Load Sample
                  </button>
                )}
              </div>

              {preSelectedClientId && clientSaved && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs font-medium">
                      Client linked! Any itinerary you generate will be automatically saved to this client.
                    </span>
                  </div>
                </div>
              )}

              <textarea
                value={conversation}
                onChange={(e) => setConversation(e.target.value)}
                placeholder="Paste WhatsApp conversation here...

Example:
Client: Hi, we want to visit Egypt
Agent: Great! When are you thinking?
Client: Maybe next month, around 10 days
..."
                className="w-full h-96 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none font-mono shadow-sm"
              />

              <button
                onClick={analyzeConversation}
                disabled={isAnalyzing || !conversation.trim()}
                className="w-full mt-3 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyze with AI
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: Extracted Data & Actions */}
          <div className="space-y-4">

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-800">{error}</p>
              </div>
            )}

            {extractedData && (
              <>
                {/* Extracted Data Card */}
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <h2 className="text-base font-bold text-gray-900 mb-3">Extracted Information</h2>

                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Client Name</div>
                        <input
                          type="text"
                          value={extractedData.client_name}
                          onChange={(e) => setExtractedData({ ...extractedData, client_name: e.target.value })}
                          className="text-sm font-medium text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none w-full"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Email</div>
                        <input
                          type="email"
                          value={extractedData.client_email}
                          onChange={(e) => setExtractedData({ ...extractedData, client_email: e.target.value })}
                          className="text-sm font-medium text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none w-full"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Phone</div>
                        <input
                          type="tel"
                          value={extractedData.client_phone || phoneNumber || ''}
                          onChange={(e) => setExtractedData({ ...extractedData, client_phone: e.target.value })}
                          className="text-sm font-medium text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none w-full"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Tour</div>
                        <div className="text-sm font-medium text-gray-900">{extractedData.tour_name}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Date</div>
                        <input
                          type="date"
                          value={extractedData.start_date}
                          onChange={(e) => setExtractedData({ ...extractedData, start_date: e.target.value })}
                          className="text-sm font-medium text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none w-full"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Travelers</div>
                        <div className="text-sm font-medium text-gray-900">
                          {extractedData.num_adults} adults
                          {extractedData.num_children > 0 && `, ${extractedData.num_children} children`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Globe className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Language</div>
                        <div className="text-sm font-medium text-gray-900">{extractedData.conversation_language}</div>
                      </div>
                    </div>

                    {extractedData.special_requests.length > 0 && (
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-xs text-gray-600">Special Requests</div>
                          <div className="text-sm font-medium text-gray-900">
                            {extractedData.special_requests.join(', ')}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Service Tier Selection */}
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-gray-900">Service Tier</h3>
                    {extractedData.budget_level && extractedData.budget_level !== 'standard' && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        AI detected: {extractedData.budget_level}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-3">
                    Select the service tier for this itinerary. AI will use matching suppliers.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    {TIER_OPTIONS.map((tier) => (
                      <button
                        key={tier.value}
                        onClick={() => setSelectedTier(tier.value)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedTier === tier.value
                            ? tier.value === 'luxury'
                              ? 'border-amber-500 bg-amber-50'
                              : tier.value === 'deluxe'
                              ? 'border-purple-500 bg-purple-50'
                              : tier.value === 'standard'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-500 bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {tier.value === 'luxury' && <Crown className="w-4 h-4 text-amber-600" />}
                          {tier.value === 'deluxe' && <Star className="w-4 h-4 text-purple-600" />}
                          <span className={`text-sm font-semibold ${
                            selectedTier === tier.value ? 'text-gray-900' : 'text-gray-700'
                          }`}>
                            {tier.label}
                          </span>
                          {tier.value === userPreferences.default_tier && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                              default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{tier.description}</p>
                      </button>
                    ))}
                  </div>

                  {/* Preferred Suppliers Info */}
                  <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span>Preferred suppliers will be prioritized within the selected tier</span>
                    </div>
                  </div>
                </div>

                {/* Existing Clients Warning */}
                {existingClients.length > 0 && !clientSaved && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">⚠️ Existing Clients Found</h3>
                    <p className="text-xs text-gray-600 mb-3">
                      We found {existingClients.length} client(s) with matching email/phone:
                    </p>

                    <div className="space-y-2 mb-3">
                      {existingClients.map((client) => (
                        <div
                          key={client.id}
                          onClick={() => setSelectedClientId(client.id)}
                          className={`p-2 border-2 rounded-lg cursor-pointer transition-all ${
                            selectedClientId === client.id
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-sm font-medium">{client.full_name}</div>
                          <div className="text-xs text-gray-600">
                            {client.client_code} • {client.email}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedClientId && (
                      <button
                        onClick={viewClientProfile}
                        className="w-full px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
                      >
                        View Client Profile
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* Save as New Client */}
                {!clientSaved && (
                  <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-purple-600" />
                      Save as New Client
                    </h3>
                    <p className="text-xs text-gray-600 mb-3">
                      Create a new client profile in your CRM with this information
                    </p>

                    <button
                      onClick={saveAsNewClient}
                      disabled={isSavingClient}
                      className="w-full px-4 py-2 text-sm bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSavingClient ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          Save as New Client
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Client Saved Success */}
                {clientSaved && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Client Saved Successfully!</h3>
                        <p className="text-xs text-gray-600">New client added to your CRM</p>
                      </div>
                    </div>

                    <button
                      onClick={viewClientProfile}
                      className="w-full px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                    >
                      View Client Profile
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Generate Itinerary */}
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Generate Itinerary</h3>
                  <p className="text-xs text-gray-600 mb-3">
                    AI will create a complete day-by-day itinerary using{' '}
                    <span className={`font-semibold ${tierColors.text}`}>
                      {selectedTier.toUpperCase()}
                    </span>
                    {' '}tier suppliers
                  </p>

                  {/* Settings Preview */}
                  <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                    <Settings className="w-3 h-3" />
                    <span>
                      {userPreferences.default_cost_mode === 'auto' ? 'Auto-calculate' : 'Manual'} costs
                      • {userPreferences.default_margin_percent}% margin
                      • {userPreferences.default_currency}
                    </span>
                  </div>

                  {/* Selected Tier Badge */}
                  <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
                    {selectedTier === 'luxury' && <Crown className="w-4 h-4 text-amber-600" />}
                    {selectedTier === 'deluxe' && <Star className="w-4 h-4 text-purple-600" />}
                    <span className="text-xs text-gray-600">
                      Using <strong>{selectedTier}</strong> tier hotels, vehicles, guides, and restaurants
                    </span>
                  </div>

                  <button
                    onClick={generateItinerary}
                    disabled={isGenerating}
                    className="w-full px-4 py-2 text-sm bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Generating {selectedTier} itinerary...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)} Itinerary
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Itinerary Success */}
                {generatedItinerary && (
                  <div ref={itinerarySuccessRef} className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Itinerary Generated!</h3>
                        <p className="text-xs text-gray-600">
                          {generatedItinerary.itinerary_code} • {userPreferences.default_currency} {generatedItinerary.total_cost?.toFixed(2) || '0.00'}
                          {generatedItinerary.tier && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                              generatedItinerary.tier === 'luxury' ? 'bg-amber-100 text-amber-700' :
                              generatedItinerary.tier === 'deluxe' ? 'bg-purple-100 text-purple-700' :
                              generatedItinerary.tier === 'standard' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {generatedItinerary.tier.toUpperCase()}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Show selected suppliers if available */}
                    {generatedItinerary.selected_suppliers && (
                      <div className="mb-3 p-2 bg-white rounded-lg border border-green-200">
                        <div className="text-xs text-gray-600 mb-1 font-medium">Selected Suppliers:</div>
                        <div className="space-y-1">
                          {generatedItinerary.selected_suppliers.hotel && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-gray-500">🏨</span>
                              <span>{generatedItinerary.selected_suppliers.hotel.name}</span>
                              {generatedItinerary.selected_suppliers.hotel.is_preferred && (
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              )}
                            </div>
                          )}
                          {generatedItinerary.selected_suppliers.vehicle && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-gray-500">🚗</span>
                              <span>{generatedItinerary.selected_suppliers.vehicle.name}</span>
                              {generatedItinerary.selected_suppliers.vehicle.is_preferred && (
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              )}
                            </div>
                          )}
                          {generatedItinerary.selected_suppliers.guide && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-gray-500">🎯</span>
                              <span>{generatedItinerary.selected_suppliers.guide.name}</span>
                              {generatedItinerary.selected_suppliers.guide.is_preferred && (
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/itineraries/${generatedItinerary.id}`)}
                        className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
                      >
                        View Itinerary
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      {fromInbox && (
                        <Link
                          href="/whatsapp-inbox"
                          className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Back to Inbox
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}