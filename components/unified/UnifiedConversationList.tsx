'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, RefreshCw, User, Clock, Filter, Loader2,
  MessageSquare, Mail, UserX, Trash2
} from 'lucide-react'
import { ChannelBadge, ChannelBadgeLight } from './ChannelBadge'
import { UnifiedConversation, ConversationChannel, ConversationStatus } from '@/types/unified'

interface UnifiedConversationListProps {
  onSelectConversation: (conversation: UnifiedConversation) => void
  selectedConversationId?: string
  clientId?: string // Optional: filter by client
}

interface FilterState {
  channel: ConversationChannel | 'all'
  status: ConversationStatus | 'all'
  search: string
  hasUnread: boolean
  unassignedOnly: boolean
}

// Agent avatar component
function AgentAvatar({ agent, size = 'sm' }: {
  agent: { name: string; avatar_url: string | null } | null
  size?: 'sm' | 'md'
}) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
  }

  if (!agent) {
    return (
      <div className={`${sizeClasses[size]} bg-gray-200 rounded-full flex items-center justify-center`}>
        <User className="w-3 h-3 text-gray-400" />
      </div>
    )
  }

  if (agent.avatar_url) {
    return (
      <img
        src={agent.avatar_url}
        alt={agent.name}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    )
  }

  const initials = agent.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500']
  const colorIndex = agent.name.charCodeAt(0) % colors.length

  return (
    <div className={`${sizeClasses[size]} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-medium`}>
      {initials}
    </div>
  )
}

export function UnifiedConversationList({
  onSelectConversation,
  selectedConversationId,
  clientId,
}: UnifiedConversationListProps) {
  const [conversations, setConversations] = useState<UnifiedConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    status: 'all',
    search: '',
    hasUnread: false,
    unassignedOnly: false,
  })
  const [showFilters, setShowFilters] = useState(false)

  // Fetch conversations
  const fetchConversations = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.channel !== 'all') params.set('channel', filters.channel)
      if (filters.status !== 'all') params.set('status', filters.status)
      if (filters.search) params.set('search', filters.search)
      if (filters.hasUnread) params.set('has_unread', 'true')
      if (filters.unassignedOnly) params.set('unassigned_only', 'true')
      if (clientId) params.set('client_id', clientId)

      const url = `/api/unified/conversations?${params.toString()}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [filters, clientId])

  // Initial fetch and filter change
  useEffect(() => {
    fetchConversations(true)
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchConversations(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [filters])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations(false)
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  const formatTime = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' })
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const getChannelIcon = (channel: ConversationChannel) => {
    return channel === 'whatsapp' ? MessageSquare : Mail
  }

  const getChannelColor = (channel: ConversationChannel) => {
    return channel === 'whatsapp' ? 'text-[#25D366]' : 'text-blue-500'
  }

  // Count summaries
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)
  const whatsappCount = conversations.filter(c => c.channel === 'whatsapp').length
  const emailCount = conversations.filter(c => c.channel === 'email').length

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900">
            {clientId ? 'Client Communications' : 'Unified Inbox'}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg ${showFilters ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchConversations(false)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Channel Filter Tabs */}
        <div className="flex gap-1 mb-3 p-1 bg-gray-100 rounded-lg">
          {[
            { key: 'all', label: 'All', count: conversations.length },
            { key: 'whatsapp', label: 'WhatsApp', count: whatsappCount },
            { key: 'email', label: 'Email', count: emailCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilters(f => ({ ...f, channel: tab.key as any }))}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                filters.channel === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.key === 'whatsapp' && <MessageSquare className="w-3 h-3" />}
              {tab.key === 'email' && <Mail className="w-3 h-3" />}
              <span>{tab.label}</span>
              <span className="text-gray-400">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasUnread}
                  onChange={(e) => setFilters(f => ({ ...f, hasUnread: e.target.checked }))}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>Unread only</span>
                {totalUnread > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                    {totalUnread}
                  </span>
                )}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.unassignedOnly}
                  onChange={(e) => setFilters(f => ({ ...f, unassignedOnly: e.target.checked }))}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>Unassigned only</span>
              </label>
            </div>
            <div>
              <select
                value={filters.status}
                onChange={(e) => setFilters(f => ({ ...f, status: e.target.value as any }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="spam">Spam</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No conversations found</p>
            {(filters.search || filters.channel !== 'all' || filters.hasUnread || filters.unassignedOnly) && (
              <button
                onClick={() => setFilters({ channel: 'all', status: 'all', search: '', hasUnread: false, unassignedOnly: false })}
                className="mt-2 text-xs text-primary-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          conversations.map((conv) => {
            const ChannelIconComponent = getChannelIcon(conv.channel)
            const isSelected = selectedConversationId === conv.id

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`group p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  isSelected ? 'bg-primary-50 border-l-2 border-l-primary-500' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar with channel indicator */}
                  <div className="relative">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-gray-500" />
                    </div>
                    {/* Channel badge */}
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
                      conv.channel === 'whatsapp' ? 'bg-[#25D366]' : 'bg-blue-500'
                    }`}>
                      <ChannelIconComponent className="w-3 h-3 text-white" />
                    </div>
                    {/* Agent badge */}
                    {conv.assigned_agent && (
                      <div className="absolute -top-1 -right-1">
                        <AgentAvatar agent={conv.assigned_agent} size="sm" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conv.client_name || conv.contact_info}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {conv.last_message_at && (
                          <span className="text-xs text-gray-500">
                            {formatTime(conv.last_message_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Subject for email */}
                    {conv.channel === 'email' && conv.subject && (
                      <p className="text-xs font-medium text-gray-700 truncate mt-0.5">
                        {conv.subject}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate pr-2">
                        {conv.last_message_snippet || 'No messages yet'}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className={`px-1.5 py-0.5 text-xs font-medium text-white rounded-full ${
                          conv.channel === 'whatsapp' ? 'bg-[#25D366]' : 'bg-blue-500'
                        }`}>
                          {conv.unread_count}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">{conv.contact_info}</p>
                      {!conv.assigned_agent && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default UnifiedConversationList
