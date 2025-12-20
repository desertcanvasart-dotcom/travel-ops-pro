'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle, AlertCircle, Users, Calendar, MapPin,
  Loader2, MessageSquare, Sparkles,
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
    'moderate': 'standard',
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
// MAIN EXPORT WITH SUSPENSE WRAPPER
// ============================================

export default function WhatsAppParserPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto mb-3" />
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

  const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [conversation, setConversation] = useState('')
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedItinerary, setGeneratedItinerary] = useState<any>(null)
  const [selectedTier, setSelectedTier] = useState<string>('standard')
  const [existingClients, setExistingClients] = useState<ExistingClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientSaved, setClientSaved] = useState(false)
  const [isSavingClient, setIsSavingClient] = useState(false)
  const [fromInbox, setFromInbox] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)

  const itinerarySuccessRef = useRef<HTMLDivElement>(null)

  // ============================================
  // EFFECTS
  // ============================================

  // Load user preferences - with better error handling
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        console.log('📋 Loading user preferences...')
        
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError) {
          console.warn('⚠️ Auth error (continuing with defaults):', authError)
          setPreferencesLoaded(true)
          return
        }
        
        if (!user) {
          console.log('ℹ️ No user logged in, using defaults')
          setPreferencesLoaded(true)
          return
        }

        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (error) {
          // Not found is OK - just use defaults
          if (error.code === 'PGRST116') {
            console.log('ℹ️ No preferences found, using defaults')
          } else {
            console.warn('⚠️ Preferences error (using defaults):', error)
          }
        } else if (data) {
          const prefs: UserPreferences = {
            default_cost_mode: data.default_cost_mode || 'auto',
            default_tier: data.default_tier || 'standard',
            default_margin_percent: data.default_margin_percent || 25,
            default_currency: data.default_currency || 'EUR'
          }
          setUserPreferences(prefs)
          setSelectedTier(prefs.default_tier)
          console.log('✅ Loaded user preferences:', prefs)
        }
      } catch (err) {
        console.error('❌ Exception loading preferences:', err)
      } finally {
        // ALWAYS set loaded to true
        setPreferencesLoaded(true)
      }
    }

    loadUserPreferences()
  }, [])

  // Load conversation from URL
  useEffect(() => {
    if (conversationParam) {
      try {
        const isBase64 = new URLSearchParams(window.location.search).get("encoded") === "base64"
        const decoded = isBase64
          ? decodeURIComponent(escape(atob(conversationParam)))
          : decodeURIComponent(conversationParam)
        setConversation(decoded)
        setFromInbox(true)
      } catch (e) {
        console.error('Error decoding conversation:', e)
        setConversation(conversationParam)
        setFromInbox(true)
      }
    }
    if (phoneParam) {
      setPhoneNumber(phoneParam)
    }
  }, [conversationParam, phoneParam])

  // Handle pre-selected client
  useEffect(() => {
    if (preSelectedClientId && !selectedClientId) {
      setSelectedClientId(preSelectedClientId)
      setClientSaved(true)
    }
  }, [preSelectedClientId])

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

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

      if (phoneNumber && !result.data.client_phone) {
        result.data.client_phone = phoneNumber
      }

      const aiDetectedTier = mapBudgetToTier(result.data.budget_level || '')
      const finalTier = result.data.budget_level ? aiDetectedTier : userPreferences.default_tier

      result.data.tier = finalTier
      setSelectedTier(finalTier)
      setExtractedData(result.data)

      // Search for existing clients
      if (result.data.client_email || result.data.client_phone) {
        try {
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
        } catch (e) {
          console.warn('Could not search for existing clients:', e)
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ============================================
  // SAVE AS NEW CLIENT - USES API ROUTE
  // ============================================

  const saveAsNewClient = async (): Promise<string | null> => {
    if (!extractedData) {
      setError('No extracted data available')
      return null
    }

    const clientName = extractedData.client_name?.trim()
    if (!clientName) {
      setError('Client name is required. Please enter a name.')
      return null
    }

    setIsSavingClient(true)
    setError(null)

    try {
      const nameParts = clientName.split(' ')
      const firstName = nameParts[0] || 'Unknown'
      const lastName = nameParts.slice(1).join(' ') || firstName

      console.log('💾 Saving new client via API:', { firstName, lastName })

      // Use API route instead of direct Supabase (bypasses RLS)
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          vip_status: selectedTier === 'luxury',
          // Additional data for API to handle
          preferences: {
            accommodation_type: selectedTier === 'luxury' ? '5-star' : selectedTier === 'deluxe' ? '4-star' : '3-star',
            tour_pace: 'moderate',
            interests: extractedData.interests?.join(', ') || '',
            special_needs: extractedData.special_requests?.join(', ') || null,
            tier: selectedTier
          },
          note: `Client inquiry via WhatsApp. Interested in: ${extractedData.tour_name}. ${extractedData.cities?.join(', ') || 'Egypt'}. ${extractedData.num_adults} adults. Tier: ${selectedTier.toUpperCase()}.`,
          link_whatsapp_phone: phoneNumber
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        console.error('❌ API error:', result)
        setError(result.error || 'Failed to create client')
        return null
      }

      const newClient = result.data
      console.log('✅ Client created:', newClient.id)

      setSelectedClientId(newClient.id)
      setClientSaved(true)
      
      return newClient.id

    } catch (err: any) {
      console.error('❌ saveAsNewClient exception:', err)
      setError(err.message || 'Failed to save client')
      return null
    } finally {
      setIsSavingClient(false)
    }
  }

  // ============================================
  // GENERATE ITINERARY - FIXED
  // ============================================

  const generateItinerary = async () => {
    if (!extractedData) return

    setIsGenerating(true)
    setError(null)

    let clientIdToUse = selectedClientId

    if (!clientIdToUse) {
      const shouldCreate = window.confirm('No client selected. Create a new client profile before generating itinerary?')
      
      if (shouldCreate) {
        console.log('📝 User confirmed - creating client...')
        const newClientId = await saveAsNewClient()
        
        if (!newClientId) {
          console.error('❌ Client creation failed')
          setIsGenerating(false)
          return
        }
        
        clientIdToUse = newClientId
        console.log('✅ Client created, ID:', clientIdToUse)
      } else {
        console.log('ℹ️ User declined - generating without client')
      }
    }

    try {
      console.log('🚀 Generating itinerary...', { clientId: clientIdToUse, tier: selectedTier })

      const response = await fetch('/api/ai/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extractedData,
          client_id: clientIdToUse,
          tier: selectedTier,
          budget_level: selectedTier,
          cost_mode: userPreferences.default_cost_mode,
          margin_percent: userPreferences.default_margin_percent,
          currency: userPreferences.default_currency
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate itinerary')
      }

      console.log('✅ Itinerary generated:', result.data?.id)
      setGeneratedItinerary(result.data)

      setTimeout(() => {
        itinerarySuccessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)

    } catch (err: any) {
      console.error('❌ generateItinerary error:', err)
      setError(err.message || 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  // ============================================
  // RENDER
  // ============================================

  // Show loading only briefly, then continue with defaults
  if (!preferencesLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading...</p>
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
              <Link href="/whatsapp-inbox" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
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
                  : 'Paste conversation → AI extracts info → Select Tier → Generate itinerary'}
              </p>
            </div>

            <Link
              href="/settings?tab=preferences"
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">
                <strong className={tierColors.text}>{userPreferences.default_tier}</strong> • {userPreferences.default_currency}
              </span>
            </Link>
          </div>

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
            <div className={`bg-white border rounded-lg p-3 shadow-sm ${extractedData ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">1️⃣</span>
                {extractedData && <CheckCircle className="w-4 h-4 text-green-600" />}
              </div>
              <div className="text-xs text-gray-600">Step 1</div>
              <div className="text-sm font-bold text-gray-900">Analyze</div>
            </div>
            <div className={`bg-white border rounded-lg p-3 shadow-sm ${extractedData ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">2️⃣</span>
              </div>
              <div className="text-xs text-gray-600">Step 2</div>
              <div className="text-sm font-bold text-gray-900">Select Tier</div>
            </div>
            <div className={`bg-white border rounded-lg p-3 shadow-sm ${clientSaved ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">3️⃣</span>
                {clientSaved && <CheckCircle className="w-4 h-4 text-green-600" />}
              </div>
              <div className="text-xs text-gray-600">Step 3</div>
              <div className="text-sm font-bold text-gray-900">Save Client</div>
            </div>
            <div className={`bg-white border rounded-lg p-3 shadow-sm ${generatedItinerary ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">4️⃣</span>
                {generatedItinerary && <CheckCircle className="w-4 h-4 text-green-600" />}
              </div>
              <div className="text-xs text-gray-600">Step 4</div>
              <div className="text-sm font-bold text-gray-900">Generate</div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="grid grid-cols-2 gap-4">

          {/* LEFT: Input */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-900">WhatsApp Conversation</h2>
                {!fromInbox && (
                  <button onClick={loadSample} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Load Sample
                  </button>
                )}
              </div>

              <textarea
                value={conversation}
                onChange={(e) => setConversation(e.target.value)}
                placeholder="Paste WhatsApp conversation here..."
                className="w-full h-96 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none font-mono shadow-sm"
              />

              <button
                onClick={analyzeConversation}
                disabled={isAnalyzing || !conversation.trim()}
                className="w-full mt-3 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
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

          {/* RIGHT: Results */}
          <div className="space-y-4">

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Error</p>
                    <p className="text-xs text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {extractedData && (
              <>
                {/* Extracted Data */}
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <h2 className="text-base font-bold text-gray-900 mb-3">Extracted Information</h2>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-600">Client Name <span className="text-red-500">*</span></div>
                        <input
                          type="text"
                          value={extractedData.client_name}
                          onChange={(e) => setExtractedData({ ...extractedData, client_name: e.target.value })}
                          className="text-sm font-medium text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none w-full"
                          placeholder="Enter client name"
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
                  </div>
                </div>

                {/* Tier Selection */}
                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-gray-900">Service Tier</h3>
                    {extractedData.budget_level && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        AI detected: {extractedData.budget_level}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {TIER_OPTIONS.map((tier) => (
                      <button
                        key={tier.value}
                        onClick={() => setSelectedTier(tier.value)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedTier === tier.value
                            ? tier.value === 'luxury' ? 'border-amber-500 bg-amber-50'
                            : tier.value === 'deluxe' ? 'border-purple-500 bg-purple-50'
                            : tier.value === 'standard' ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-500 bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {tier.value === 'luxury' && <Crown className="w-4 h-4 text-amber-600" />}
                          {tier.value === 'deluxe' && <Star className="w-4 h-4 text-purple-600" />}
                          <span className="text-sm font-semibold">{tier.label}</span>
                          {tier.value === userPreferences.default_tier && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">default</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{tier.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Existing Clients */}
                {existingClients.length > 0 && !clientSaved && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">⚠️ Existing Clients Found</h3>
                    <div className="space-y-2 mb-3">
                      {existingClients.map((client) => (
                        <div
                          key={client.id}
                          onClick={() => { setSelectedClientId(client.id); setClientSaved(true); }}
                          className={`p-2 border-2 rounded-lg cursor-pointer transition-all ${
                            selectedClientId === client.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-sm font-medium">{client.full_name}</div>
                          <div className="text-xs text-gray-600">{client.client_code} • {client.email}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save New Client */}
                {!clientSaved && (
                  <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-purple-600" />
                      Save as New Client
                    </h3>
                    <p className="text-xs text-gray-600 mb-3">Create a new client profile in your CRM</p>

                    <button
                      onClick={async () => {
                        const id = await saveAsNewClient()
                        if (id) console.log('✅ Saved:', id)
                      }}
                      disabled={isSavingClient || !extractedData.client_name?.trim()}
                      className="w-full px-4 py-2 text-sm bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSavingClient ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          Save as New Client
                        </>
                      )}
                    </button>

                    {!extractedData.client_name?.trim() && (
                      <p className="text-xs text-amber-600 mt-2">⚠️ Please enter a client name first</p>
                    )}
                  </div>
                )}

                {/* Client Saved Success */}
                {clientSaved && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Client Saved!</h3>
                        <p className="text-xs text-gray-600">Added to CRM</p>
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
                    AI will create a day-by-day itinerary using <span className={`font-semibold ${tierColors.text}`}>{selectedTier.toUpperCase()}</span> tier suppliers
                  </p>

                  <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                    <Settings className="w-3 h-3" />
                    <span>{userPreferences.default_cost_mode === 'auto' ? 'Auto-calculate' : 'Manual'} • {userPreferences.default_margin_percent}% margin • {userPreferences.default_currency}</span>
                  </div>

                  {!clientSaved && (
                    <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-700">⚠️ No client selected. You'll be prompted to create one.</p>
                    </div>
                  )}

                  <button
                    onClick={generateItinerary}
                    disabled={isGenerating}
                    className="w-full px-4 py-2 text-sm bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)} Itinerary
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Success */}
                {generatedItinerary && (
                  <div ref={itinerarySuccessRef} className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Itinerary Generated!</h3>
                        <p className="text-xs text-gray-600">
                          {generatedItinerary.itinerary_code} • {userPreferences.default_currency} {generatedItinerary.total_cost?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/itineraries/${generatedItinerary.id}`)}
                        className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
                      >
                        View Itinerary <ChevronRight className="w-3 h-3" />
                      </button>
                      {fromInbox && (
                        <Link href="/whatsapp-inbox" className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" /> Back
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