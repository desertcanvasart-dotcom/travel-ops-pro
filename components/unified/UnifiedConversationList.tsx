'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, RefreshCw, User, Filter, Loader2,
  MessageSquare, Mail, UserX, Users, Plus, X, Trash2, Check,
  CloudDownload
} from 'lucide-react'
import { ChannelBadge, ChannelBadgeLight } from './ChannelBadge'
import { UnifiedConversation, ConversationChannel, ConversationStatus } from '@/types/unified'

interface UnifiedConversationListProps {
  onSelectConversation: (conversation: UnifiedConversation) => void
  selectedConversationId?: string
  clientId?: string // Optional: filter by client
  userId?: string // Current user ID for sync
}

interface FilterState {
  channel: ConversationChannel | 'all'
  status: ConversationStatus | 'all'
  search: string
  hasUnread: boolean
  unassignedOnly: boolean
}

interface SalesAgent {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  is_available: boolean
  current_conversations: number
  max_conversations: number
}

// Contact avatar component with initials
function ContactAvatar({ name, channel, size = 'md' }: {
  name: string | null
  channel: ConversationChannel
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
  }

  const displayName = name || 'Unknown'
  const initials = displayName
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || '?'

  // Different color schemes for WhatsApp vs Email
  const colors = channel === 'whatsapp'
    ? ['bg-emerald-500', 'bg-teal-500', 'bg-green-500', 'bg-lime-600']
    : ['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-sky-500']
  const colorIndex = displayName.charCodeAt(0) % colors.length

  return (
    <div className={`${sizeClasses[size]} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-semibold shadow-sm`}>
      {initials}
    </div>
  )
}

// Agent avatar component
function AgentAvatar({ agent, size = 'sm' }: {
  agent: { name: string; avatar_url: string | null } | null
  size?: 'sm' | 'md'
}) {
  const sizeClasses = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-7 h-7 text-xs',
  }

  if (!agent) {
    return (
      <div className={`${sizeClasses[size]} bg-gray-200 rounded-full flex items-center justify-center ring-2 ring-white`}>
        <User className="w-2.5 h-2.5 text-gray-400" />
      </div>
    )
  }

  if (agent.avatar_url) {
    return (
      <img
        src={agent.avatar_url}
        alt={agent.name}
        className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-white`}
      />
    )
  }

  const initials = agent.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const colors = ['bg-orange-500', 'bg-pink-500', 'bg-purple-500', 'bg-amber-500']
  const colorIndex = agent.name.charCodeAt(0) % colors.length

  return (
    <div className={`${sizeClasses[size]} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-medium ring-2 ring-white`}>
      {initials}
    </div>
  )
}

// Agents Management Modal
function AgentsManagementModal({
  agents,
  onClose,
  onRefresh
}: {
  agents: SalesAgent[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentEmail, setNewAgentEmail] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const addAgent = async () => {
    if (!newAgentName.trim()) return
    setIsAdding(true)
    try {
      const res = await fetch('/api/whatsapp/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAgentName.trim(), email: newAgentEmail.trim() || null })
      })
      if (res.ok) {
        setNewAgentName('')
        setNewAgentEmail('')
        onRefresh()
      }
    } catch (error) {
      console.error('Error adding agent:', error)
    } finally {
      setIsAdding(false)
    }
  }

  const toggleAgentAvailability = async (agent: SalesAgent) => {
    try {
      await fetch('/api/whatsapp/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, is_available: !agent.is_available })
      })
      onRefresh()
    } catch (error) {
      console.error('Error updating agent:', error)
    }
  }

  const deleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to deactivate this agent?')) return
    try {
      await fetch(`/api/whatsapp/agents?id=${agentId}`, { method: 'DELETE' })
      onRefresh()
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-bold text-gray-900">Sales Agents</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded" title="Close"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-6">
          {/* Add New Agent */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Add New Agent</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Agent name"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <input
                type="email"
                value={newAgentEmail}
                onChange={(e) => setNewAgentEmail(e.target.value)}
                placeholder="Email (optional)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={addAgent}
                disabled={!newAgentName.trim() || isAdding}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Agent List */}
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {agents.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No agents yet. Add one above.</p>
            ) : (
              agents.map(agent => (
                <div key={agent.id} className={`flex items-center gap-3 p-3 rounded-lg border ${agent.is_active ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
                  <AgentAvatar agent={agent} size="md" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-500">
                      {agent.email || 'No email'} • {agent.current_conversations} active chats
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleAgentAvailability(agent)}
                      className={`px-2 py-1 text-xs rounded-full ${
                        agent.is_available
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {agent.is_available ? 'Available' : 'Away'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAgent(agent.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                      title="Delete agent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function UnifiedConversationList({
  onSelectConversation,
  selectedConversationId,
  clientId,
  userId,
}: UnifiedConversationListProps) {
  const [conversations, setConversations] = useState<UnifiedConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    status: 'all',
    search: '',
    hasUnread: false,
    unassignedOnly: false,
  })
  const [showFilters, setShowFilters] = useState(false)
  const [agents, setAgents] = useState<SalesAgent[]>([])
  const [showAgentsModal, setShowAgentsModal] = useState(false)

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/agents')
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch (error) {
      console.error('Error fetching agents:', error)
    }
  }, [])

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
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [filters, clientId])

  // Sync emails
  const syncEmails = async () => {
    if (!userId || syncing) return
    setSyncing(true)
    setSyncMessage('Syncing emails...')
    try {
      const res = await fetch('/api/email/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          full_sync: false,
          max_results: 100,
          days_back: 30
        })
      })
      const data = await res.json()
      if (data.success) {
        setSyncMessage(`Synced ${data.messages_created || 0} new messages`)
        fetchConversations(false)
      } else {
        setSyncMessage(data.error || 'Sync failed')
      }
    } catch (error: any) {
      setSyncMessage(error.message || 'Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMessage(null), 3000)
    }
  }

  // Initial fetch and filter change
  useEffect(() => {
    fetchConversations(true)
    fetchAgents()
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

  // Count summaries
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)
  const whatsappCount = conversations.filter(c => c.channel === 'whatsapp').length
  const emailCount = conversations.filter(c => c.channel === 'email').length

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Agents Modal */}
      {showAgentsModal && (
        <AgentsManagementModal
          agents={agents}
          onClose={() => setShowAgentsModal(false)}
          onRefresh={fetchAgents}
        />
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {clientId ? 'Communications' : 'Unified Inbox'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
              {totalUnread > 0 && ` • ${totalUnread} unread`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowAgentsModal(true)}
              className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-colors"
              title="Manage Agents"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
              title="Filters"
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={syncEmails}
              disabled={syncing || !userId}
              className={`p-2 rounded-lg transition-colors ${syncing ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} disabled:opacity-50`}
              title="Sync Emails"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudDownload className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => fetchConversations(false)}
              className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sync Message */}
        {syncMessage && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${
            syncMessage.includes('failed') || syncMessage.includes('error')
              ? 'bg-red-50 text-red-700'
              : 'bg-blue-50 text-blue-700'
          }`}>
            {syncMessage}
          </div>
        )}

        {/* Channel Filter Tabs */}
        <div className="flex gap-1 mb-3 p-1 bg-gray-100/80 rounded-xl">
          {[
            { key: 'all', label: 'All', count: conversations.length, icon: null, color: 'gray' },
            { key: 'whatsapp', label: 'WhatsApp', count: whatsappCount, icon: MessageSquare, color: 'emerald' },
            { key: 'email', label: 'Email', count: emailCount, icon: Mail, color: 'blue' },
          ].map(tab => {
            const isActive = filters.channel === tab.key
            const IconComp = tab.icon
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => setFilters(f => ({ ...f, channel: tab.key as any }))}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                }`}
              >
                {IconComp && (
                  <IconComp className={`w-3.5 h-3.5 ${
                    isActive
                      ? tab.color === 'emerald' ? 'text-emerald-500' : 'text-blue-500'
                      : ''
                  }`} />
                )}
                <span>{tab.label}</span>
                <span className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full ${
                  isActive
                    ? 'bg-gray-100 text-gray-600'
                    : 'text-gray-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search by name, email, or subject..."
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors placeholder:text-gray-400"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, search: '' }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mt-3 p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasUnread}
                  onChange={(e) => setFilters(f => ({ ...f, hasUnread: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="font-medium text-gray-700">Unread only</span>
                {totalUnread > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                    {totalUnread}
                  </span>
                )}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.unassignedOnly}
                  onChange={(e) => setFilters(f => ({ ...f, unassignedOnly: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="font-medium text-gray-700">Unassigned</span>
              </label>
            </div>
            <div>
              <label htmlFor="status-filter" className="sr-only">Filter by status</label>
              <select
                id="status-filter"
                value={filters.status}
                onChange={(e) => setFilters(f => ({ ...f, status: e.target.value as any }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                title="Filter by status"
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
            <p className="text-xs text-gray-400 mt-1">
              Click the sync button to import emails
            </p>
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
            const displayName = conv.client_name || conv.contact_info?.split('@')[0] || 'Unknown'

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`group px-3 py-3 cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'bg-primary-50 border-l-3 border-l-primary-500'
                    : 'hover:bg-gray-50 border-l-3 border-l-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar with channel indicator */}
                  <div className="relative flex-shrink-0">
                    <ContactAvatar
                      name={displayName}
                      channel={conv.channel}
                      size="md"
                    />
                    {/* Channel badge */}
                    <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center shadow-sm ${
                      conv.channel === 'whatsapp' ? 'bg-[#25D366]' : 'bg-blue-500'
                    }`}>
                      <ChannelIconComponent className="w-2.5 h-2.5 text-white" />
                    </div>
                    {/* Agent badge */}
                    {conv.assigned_agent && (
                      <div className="absolute -top-0.5 -right-0.5">
                        <AgentAvatar agent={conv.assigned_agent} size="sm" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-semibold truncate ${
                        conv.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'
                      }`}>
                        {displayName}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {conv.unread_count > 0 && (
                          <span className={`min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white rounded-full flex items-center justify-center ${
                            conv.channel === 'whatsapp' ? 'bg-[#25D366]' : 'bg-blue-500'
                          }`}>
                            {conv.unread_count}
                          </span>
                        )}
                        {conv.last_message_at && (
                          <span className={`text-[11px] ${
                            conv.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'
                          }`}>
                            {formatTime(conv.last_message_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Subject for email */}
                    {conv.channel === 'email' && conv.subject && (
                      <p className={`text-[13px] truncate mt-0.5 ${
                        conv.unread_count > 0 ? 'font-semibold text-gray-800' : 'font-medium text-gray-600'
                      }`}>
                        {conv.subject}
                      </p>
                    )}

                    {/* Snippet */}
                    <p className={`text-[12px] truncate mt-0.5 ${
                      conv.unread_count > 0 ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {conv.last_message_snippet || 'No messages yet'}
                    </p>

                    {/* Footer row */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] text-gray-400 truncate">
                        {conv.contact_info}
                      </span>
                      {!conv.assigned_agent && (
                        <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium">
                          Unassigned
                        </span>
                      )}
                      {conv.client_id && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                          Linked
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
