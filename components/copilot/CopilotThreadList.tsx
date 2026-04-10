'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, MessageSquare, Mail, Filter, RefreshCw } from 'lucide-react'
import type { CopilotThreadWithLatest, CopilotChannel, ThreadStatus } from '@/types/copilot'

interface CopilotThreadListProps {
  onSelectThread: (thread: CopilotThreadWithLatest) => void
  selectedThreadId?: string
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-700' },
  draft_pending: { label: 'Generating...', className: 'bg-yellow-100 text-yellow-700 animate-pulse' },
  draft_ready: { label: 'Draft Ready', className: 'bg-green-100 text-green-700' },
  responded: { label: 'Sent', className: 'bg-gray-100 text-gray-600' },
  skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-400' },
}

const URGENCY_COLORS: Record<string, string> = {
  low: 'bg-gray-300',
  normal: 'bg-blue-400',
  high: 'bg-orange-400',
  urgent: 'bg-red-500',
}

export default function CopilotThreadList({ onSelectThread, selectedThreadId }: CopilotThreadListProps) {
  const [threads, setThreads] = useState<CopilotThreadWithLatest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<CopilotChannel | ''>('')
  const [statusFilter, setStatusFilter] = useState<ThreadStatus | ''>('')

  const fetchThreads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (channelFilter) params.set('channel', channelFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/copilot/threads?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setThreads(data.threads)
      }
    } catch (err) {
      console.error('Failed to fetch copilot threads:', err)
    } finally {
      setLoading(false)
    }
  }, [channelFilter, statusFilter, search])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchThreads, 10000)
    return () => clearInterval(interval)
  }, [fetchThreads])

  const getInboxStatus = (thread: CopilotThreadWithLatest): string => {
    return thread.latest_inbox?.status || 'new'
  }

  const getTimeAgo = (dateStr: string | null): string => {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    return `${days}d`
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">AI Copilot</h2>
          <button
            onClick={fetchThreads}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as CopilotChannel | '')}
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#647C47]"
          >
            <option value="">All channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ThreadStatus | '')}
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#647C47]"
          >
            <option value="">All status</option>
            <option value="open">Open</option>
            <option value="waiting">Waiting</option>
            <option value="resolved">Resolved</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Filter className="w-6 h-6 mb-2" />
            <span className="text-xs">No conversations yet</span>
          </div>
        ) : (
          threads.map((thread) => {
            const inboxStatus = getInboxStatus(thread)
            const badge = STATUS_BADGES[inboxStatus] || STATUS_BADGES.new
            const isSelected = thread.id === selectedThreadId

            return (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread)}
                className={`w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  isSelected ? 'bg-[#647C47]/5 border-l-2 border-l-[#647C47]' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar + urgency dot */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      thread.channel === 'whatsapp' ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      {thread.channel === 'whatsapp'
                        ? <MessageSquare className="w-4 h-4 text-green-600" />
                        : <Mail className="w-4 h-4 text-blue-600" />
                      }
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${URGENCY_COLORS[thread.urgency]}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {thread.client_name || thread.contact_info}
                      </span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                        {getTimeAgo(thread.last_message_at)}
                      </span>
                    </div>

                    {thread.subject && (
                      <div className="text-xs text-gray-600 truncate mt-0.5">{thread.subject}</div>
                    )}

                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {thread.latest_inbox?.message_snippet || 'No messages'}
                    </div>

                    {/* Status badge + confidence */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      {thread.latest_draft?.ai_confidence && (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          thread.latest_draft.ai_confidence === 'high' ? 'bg-green-50 text-green-600' :
                          thread.latest_draft.ai_confidence === 'medium' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-600'
                        }`}>
                          {thread.latest_draft.ai_confidence}
                        </span>
                      )}
                      {thread.latest_draft?.ai_flags?.escalate && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                          Escalate
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
