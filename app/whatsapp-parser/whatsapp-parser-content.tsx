'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle, AlertCircle, Users, Calendar, MapPin,
  DollarSign, Languages, Loader2, MessageSquare, Sparkles,
  User, Mail, Phone, Globe, ChevronRight, UserPlus
} from 'lucide-react'

const supabase = createClient()

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
}

interface ExistingClient {
  id: string
  client_code: string
  full_name: string
  email: string
  phone: string
}

// Main export with Suspense wrapper
export default function WhatsappParserContent() {
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

// Actual component with useSearchParams
function WhatsAppParserContent() {
  const [conversation, setConversation] = useState('')
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSavingClient, setIsSavingClient] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedItinerary, setGeneratedItinerary] = useState<any>(null)
  const [existingClients, setExistingClients] = useState<ExistingClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientSaved, setClientSaved] = useState(false)
  
  const router = useRouter() 
  const searchParams = useSearchParams()
  const preSelectedClientId = searchParams?.get('clientId')
  
  const supabase = createClient()

  // Sample conversation for testing
  const sampleConversation = `Cliente: Hola, queremos hacer un tour a Memphis, Sakkara
Agente: ¡Perfecto! ¿Cuántas personas?
Cliente: 4 adultos
Agente: ¿Para qué fecha?
Cliente: 12 de noviembre
Cliente: Y queremos añadir Dahshur también
Cliente: Mi nombre es Inmaculada Yurba Minguez
Cliente: Mi email es inmayurba@yahoo.es
Agente: Perfecto, ¿en qué hotel se alojan?
Cliente: Gran Plaza`

  // Load client info when pre-selected from URL
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

  // Check for pre-selected client from URL
  useEffect(() => {
    if (preSelectedClientId && !selectedClientId) {
      setSelectedClientId(preSelectedClientId)
      setClientSaved(true)
      loadClientInfo(preSelectedClientId)
    }
  }, [preSelectedClientId])

  const loadSample = () => {
    setConversation(sampleConversation)
    setExtractedData(null)
    setGeneratedItinerary(null)
    setError(null)
    setClientSaved(false)
  }

  const analyzeConversation = async () => {
    if (!conversation.trim()) {
      setError('Please paste a WhatsApp conversation')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setExtractedData(null)
    setExistingClients([])
    setSelectedClientId(null)
    setClientSaved(false)

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

      setExtractedData(result.data)

      // Search for existing clients by email or phone
      if (result.data.client_email || result.data.client_phone) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, client_code, full_name, email, phone')
          .or(`email.eq.${result.data.client_email},phone.eq.${result.data.client_phone}`)
          .limit(5)

        if (clients && clients.length > 0) {
          setExistingClients(clients)
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const saveAsNewClient = async () => {
    if (!extractedData) return

    setIsSavingClient(true)
    setError(null)

    try {
      // Create new client
      const nameParts = extractedData.client_name.trim().split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || nameParts[0]

      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: extractedData.client_email || null,
          phone: extractedData.client_phone || null,
          nationality: extractedData.nationality || 'Unknown',
          status: 'prospect',
          client_type: extractedData.num_adults > 2 ? 'family' : 'individual',
          passport_type: 'other',
          preferred_language: extractedData.conversation_language || 'English',
          client_source: 'whatsapp',
          vip_status: false
        })
        .select()
        .single()

      if (clientError) throw clientError

      // Create client preferences
      if (newClient) {
        await supabase
          .from('client_preferences')
          .insert({
            client_id: newClient.id,
            preferred_accommodation_type: extractedData.budget_level === 'luxury' ? '5-star' : '4-star',
            tour_pace_preference: 'moderate',
            interests: extractedData.interests.join(', '),
            dietary_restrictions: null,
            special_needs: extractedData.special_requests.join(', ') || null
          })

        // Create initial note
        await supabase
          .from('client_notes')
          .insert({
            client_id: newClient.id,
            note_text: `Client inquiry via WhatsApp. Interested in: ${extractedData.tour_name}. ${extractedData.cities.join(', ')}. ${extractedData.num_adults} adults${extractedData.num_children > 0 ? `, ${extractedData.num_children} children` : ''}.`,
            note_type: 'general',
            is_internal: true
          })

        setSelectedClientId(newClient.id)
        setClientSaved(true)
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client')
    } finally {
      setIsSavingClient(false)
    }
  }

  const generateItinerary = async () => {
    if (!extractedData) return

    // If no client selected, prompt to create one
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
          client_id: selectedClientId
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate itinerary')
      }

      setGeneratedItinerary(result.data)

      // If client was saved, log this as a communication
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

  const viewClientProfile = () => {
    if (selectedClientId) {
      router.push(`/clients/${selectedClientId}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI WhatsApp Parser</h1>
              <p className="text-xs text-gray-600">Paste conversation → AI extracts info → Generate itinerary → Save client</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
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
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
              </div>
              <div className="text-xs text-gray-600">Step 2</div>
              <div className="text-sm font-bold text-gray-900">Save Client</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 text-lg">3️⃣</span>
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
              </div>
              <div className="text-xs text-gray-600">Step 3</div>
              <div className="text-sm font-bold text-gray-900">Generate</div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Input */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-900">WhatsApp Conversation</h2>
                <button
                  onClick={loadSample}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Load Sample
                </button>
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

          {/* Right: Extracted Data & Client Creation */}
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-800">{error}</p>
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
                          value={extractedData.client_phone}
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
                        <div className="text-sm font-medium text-gray-900">{extractedData.start_date}</div>
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

                {/* Existing Clients */}
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
                    AI will create a complete day-by-day itinerary with services and pricing
                  </p>
                  
                  <button
                    onClick={generateItinerary}
                    disabled={isGenerating}
                    className="w-full px-4 py-2 text-sm bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Itinerary with AI
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Itinerary Success */}
                {generatedItinerary && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Itinerary Generated!</h3>
                        <p className="text-xs text-gray-600">
                          {generatedItinerary.itinerary_code} • €{generatedItinerary.total_cost}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => router.push(`/itineraries/${generatedItinerary.id}`)}
                      className="w-full px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
                    >
                      View Itinerary
                      <ChevronRight className="w-3 h-3" />
                    </button>
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