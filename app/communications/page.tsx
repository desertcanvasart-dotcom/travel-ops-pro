'use client'

import { useState, useCallback, useEffect } from 'react'
import { PenSquare } from 'lucide-react'
import { UnifiedConversationList, UnifiedMessageThread, ComposeEmailModal } from '@/components/unified'
import { UnifiedConversation } from '@/types/unified'
import { useAuth } from '@/app/contexts/AuthContext'
import { useEmailPolling } from '@/lib/use-email-polling'
import { createClient } from '@/lib/supabase'

export default function UnifiedCommunicationsPage() {
  const { user } = useAuth()
  const [selectedConversation, setSelectedConversation] = useState<UnifiedConversation | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [isGmailConnected, setIsGmailConnected] = useState(false)
  // Bumped after a conversation is deleted so the list refetches immediately
  // instead of waiting for its 30s auto-refresh.
  const [listRefreshKey, setListRefreshKey] = useState(0)

  // Check Gmail connection before enabling polling (matches Email Inbox pattern)
  useEffect(() => {
    if (!user?.id) return
    const checkConnection = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('gmail_tokens')
          .select('id')
          .eq('user_id', user.id)
          .single()
        setIsGmailConnected(!!data)
      } catch {
        setIsGmailConnected(false)
      }
    }
    checkConnection()
  }, [user?.id])

  // Auto-poll Gmail every 2 minutes ONLY if connected
  // (same mechanism the Email Inbox uses, gated by connection check)
  useEmailPolling({ userId: user?.id || null, enabled: isGmailConnected && !!user })

  const handleSelectConversation = useCallback((conversation: UnifiedConversation) => {
    setSelectedConversation(conversation)
  }, [])

  const handleConversationUpdate = useCallback((updatedConversation: UnifiedConversation) => {
    setSelectedConversation(prev =>
      prev?.id === updatedConversation.id ? updatedConversation : prev
    )
  }, [])

  // A delete succeeded server-side (WhatsApp: hidden; Email: trashed). Clear the
  // open thread if it was the deleted one and force the list to drop the row now.
  const handleConversationDeleted = useCallback((deletedId: string) => {
    setSelectedConversation(prev => (prev?.id === deletedId ? null : prev))
    setListRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100">
      {/* Conversation List */}
      <div className="w-96 flex-shrink-0 relative">
        <UnifiedConversationList
          onSelectConversation={handleSelectConversation}
          selectedConversationId={selectedConversation?.id}
          userId={user?.id}
          refreshKey={listRefreshKey}
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
          onConversationDeleted={handleConversationDeleted}
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
