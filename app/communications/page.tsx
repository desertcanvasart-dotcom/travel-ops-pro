'use client'

import { useState, useCallback } from 'react'
import { PenSquare } from 'lucide-react'
import { UnifiedConversationList, UnifiedMessageThread, ComposeEmailModal } from '@/components/unified'
import { UnifiedConversation } from '@/types/unified'
import { useAuth } from '@/app/contexts/AuthContext'
import { useEmailPolling } from '@/lib/use-email-polling'

export default function UnifiedCommunicationsPage() {
  const { user } = useAuth()
  const [selectedConversation, setSelectedConversation] = useState<UnifiedConversation | null>(null)
  const [showCompose, setShowCompose] = useState(false)

  // Auto-poll Gmail every 2 minutes to keep email_conversations table fresh
  // (same mechanism the Email Inbox uses — without this, the unified inbox shows stale data)
  useEmailPolling({ userId: user?.id || null })

  const handleSelectConversation = useCallback((conversation: UnifiedConversation) => {
    setSelectedConversation(conversation)
  }, [])

  const handleConversationUpdate = useCallback((updatedConversation: UnifiedConversation) => {
    setSelectedConversation(prev =>
      prev?.id === updatedConversation.id ? updatedConversation : prev
    )
  }, [])

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

      {/* Message Thread — "Generate Itinerary" button is inside UnifiedMessageThread */}
      <div className="flex-1 flex flex-col">
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
