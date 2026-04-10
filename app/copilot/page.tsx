'use client'

import { useState, useCallback } from 'react'
import { CopilotThreadList, CopilotReviewPanel } from '@/components/copilot'
import { useCopilotPoller } from '@/lib/hooks/use-copilot-poller'
import { useAuth } from '@/app/contexts/AuthContext'
import type { CopilotThreadWithLatest } from '@/types/copilot'

export default function CopilotPage() {
  const { user } = useAuth()
  const [selectedThread, setSelectedThread] = useState<CopilotThreadWithLatest | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Poll for draft_pending messages and trigger generation
  useCopilotPoller({ userId: user?.id || null, enabled: !!user })

  const handleSelectThread = useCallback((thread: CopilotThreadWithLatest) => {
    setSelectedThread(thread)
  }, [])

  const handleThreadUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100">
      {/* Thread List */}
      <div className="w-96 flex-shrink-0" key={refreshKey}>
        <CopilotThreadList
          onSelectThread={handleSelectThread}
          selectedThreadId={selectedThread?.id}
        />
      </div>

      {/* Review Panel */}
      <div className="flex-1 flex flex-col">
        <CopilotReviewPanel
          thread={selectedThread}
          onThreadUpdate={handleThreadUpdate}
        />
      </div>
    </div>
  )
}
