'use client'

import { useState, useCallback } from 'react'
import { UnifiedConversationList, UnifiedMessageThread } from '@/components/unified'
import { UnifiedConversation } from '@/types/unified'
import { useAuth } from '@/app/contexts/AuthContext'

export default function UnifiedCommunicationsPage() {
  const { user } = useAuth()
  const [selectedConversation, setSelectedConversation] = useState<UnifiedConversation | null>(null)

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
      <div className="w-96 flex-shrink-0">
        <UnifiedConversationList
          onSelectConversation={handleSelectConversation}
          selectedConversationId={selectedConversation?.id}
          userId={user?.id}
        />
      </div>

      {/* Message Thread */}
      <div className="flex-1 flex flex-col">
        <UnifiedMessageThread
          conversation={selectedConversation}
          onConversationUpdate={handleConversationUpdate}
        />
      </div>
    </div>
  )
}
