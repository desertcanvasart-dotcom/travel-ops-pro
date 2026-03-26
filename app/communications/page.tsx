'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PenSquare, FileText } from 'lucide-react'
import { UnifiedConversationList, UnifiedMessageThread, ComposeEmailModal } from '@/components/unified'
import { UnifiedConversation } from '@/types/unified'
import { useAuth } from '@/app/contexts/AuthContext'

export default function UnifiedCommunicationsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [selectedConversation, setSelectedConversation] = useState<UnifiedConversation | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleSelectConversation = useCallback((conversation: UnifiedConversation) => {
    setSelectedConversation(conversation)
  }, [])

  const handleConversationUpdate = useCallback((updatedConversation: UnifiedConversation) => {
    setSelectedConversation(prev =>
      prev?.id === updatedConversation.id ? updatedConversation : prev
    )
  }, [])

  // Generate Itinerary: fetch conversation messages and redirect to pricing grid
  const handleGenerateItinerary = async () => {
    if (!selectedConversation) return
    setIsGenerating(true)

    try {
      // Fetch all messages for this conversation
      const endpoint = selectedConversation.channel === 'whatsapp'
        ? `/api/whatsapp/messages?phone=${encodeURIComponent(selectedConversation.identifier)}`
        : `/api/email/messages?thread_id=${encodeURIComponent(selectedConversation.identifier)}`

      const res = await fetch(endpoint)
      const data = await res.json()

      // Build conversation text from messages
      let conversationText = ''
      const messages = data.data || data.messages || data || []
      if (Array.isArray(messages)) {
        conversationText = messages.map((msg: any) => {
          const sender = msg.direction === 'inbound' ? 'Client' : 'Agent'
          const content = msg.message_body || msg.body_text || msg.snippet || msg.content || ''
          return `${sender}: ${content}`
        }).join('\n\n')
      }

      if (!conversationText.trim()) {
        alert('No conversation text found to parse.')
        return
      }

      // Encode as URL-safe base64
      const encoder = new TextEncoder()
      const bytes = encoder.encode(conversationText)
      const base64 = btoa(String.fromCharCode(...bytes))
      const encoded = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

      // Build URL params
      const params = new URLSearchParams({
        conversation: encoded,
        encoded: 'base64',
        source: selectedConversation.channel,
      })
      if (selectedConversation.client_id) params.set('clientId', selectedConversation.client_id)
      if (selectedConversation.client_email) params.set('email', selectedConversation.client_email)
      if (selectedConversation.channel === 'whatsapp' && selectedConversation.contact_info) {
        params.set('phone', selectedConversation.contact_info)
      }

      // Redirect to pricing grid
      router.push(`/pricing-grid?${params.toString()}`)
    } catch (err) {
      console.error('Failed to fetch conversation for generation:', err)
      alert('Failed to load conversation. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100">
      {/* Conversation List */}
      <div className="w-96 flex-shrink-0 relative">
        <UnifiedConversationList
          onSelectConversation={handleSelectConversation}
          selectedConversationId={selectedConversation?.id}
          userId={user?.id}
        />
        {/* Compose Email FAB */}
        <button
          onClick={() => setShowCompose(true)}
          className="absolute bottom-5 right-5 w-12 h-12 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 hover:shadow-xl transition-all flex items-center justify-center z-10"
          title="Compose Email"
        >
          <PenSquare className="w-5 h-5" />
        </button>
      </div>

      {/* Message Thread */}
      <div className="flex-1 flex flex-col">
        {/* Generate Itinerary Action Bar — shows when a conversation is selected */}
        {selectedConversation && (
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{selectedConversation.client_name || selectedConversation.contact_info}</span>
              {selectedConversation.subject && (
                <span className="text-gray-400 ml-2">{'\u2014'} {selectedConversation.subject}</span>
              )}
            </div>
            <button
              onClick={handleGenerateItinerary}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              {isGenerating ? 'Loading...' : 'Generate Itinerary'}
            </button>
          </div>
        )}
        <UnifiedMessageThread
          conversation={selectedConversation}
          onConversationUpdate={handleConversationUpdate}
        />
      </div>

      {/* Compose Email Modal */}
      {showCompose && user?.id && (
        <ComposeEmailModal
          onClose={() => setShowCompose(false)}
          userId={user.id}
          onSent={() => {
            setShowCompose(false)
          }}
        />
      )}
    </div>
  )
}
