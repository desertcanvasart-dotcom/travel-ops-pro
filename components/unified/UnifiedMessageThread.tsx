'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Send, User, Clock, Loader2, CheckCheck, Check,
  AlertCircle, Plus, History, Paperclip, Download,
  MessageSquare, Mail, UserPlus, UserX, ChevronDown,
  ExternalLink
} from 'lucide-react'
import { ChannelBadge } from './ChannelBadge'
import { UnifiedConversation, UnifiedMessage, ConversationChannel, EmailAttachment } from '@/types/unified'

interface UnifiedMessageThreadProps {
  conversation: UnifiedConversation | null
  onConversationUpdate?: (conversation: UnifiedConversation) => void
}

interface Agent {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  is_available: boolean
  current_conversations: number
  max_conversations: number
}

// Agent avatar component
function AgentAvatar({ agent, size = 'sm' }: { agent: Agent | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base'
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

// Attachment component for email
function AttachmentBadge({ attachment }: { attachment: EmailAttachment }) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 hover:bg-gray-200 cursor-pointer">
      <Paperclip className="w-3 h-3" />
      <span className="truncate max-w-[120px]">{attachment.filename}</span>
      <span className="text-gray-400">({formatSize(attachment.size)})</span>
    </div>
  )
}

export function UnifiedMessageThread({
  conversation,
  onConversationUpdate,
}: UnifiedMessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<UnifiedMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [assigningAgent, setAssigningAgent] = useState(false)

  // Fetch messages based on channel
  const fetchMessages = useCallback(async (showLoader = true) => {
    if (!conversation) return
    if (showLoader) setLoading(true)
    try {
      let url: string
      if (conversation.channel === 'whatsapp') {
        url = `/api/whatsapp/messages?conversation_id=${conversation.id}`
      } else {
        url = `/api/email/messages?conversation_id=${conversation.id}`
      }

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        // Transform to unified format
        const msgs = (data.messages || data.data || []).map((msg: any) => ({
          id: msg.id,
          channel: conversation.channel,
          conversation_id: conversation.id,
          direction: msg.direction,
          content: msg.message_body || msg.body_text || msg.body_html || msg.snippet || '',
          snippet: msg.snippet || null,
          subject: msg.subject,
          from_address: msg.from_address,
          to_addresses: msg.to_addresses,
          media_url: msg.media_url,
          media_type: msg.media_type,
          attachments: msg.attachments,
          status: msg.status || (msg.is_read ? 'read' : 'delivered'),
          is_read: msg.is_read,
          sent_at: msg.sent_at,
          created_at: msg.created_at,
        }))
        setMessages(msgs)
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [conversation])

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

  // Load messages when conversation changes
  useEffect(() => {
    if (conversation) {
      fetchMessages(true)
      fetchAgents()
    } else {
      setMessages([])
    }
  }, [conversation?.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-refresh messages
  useEffect(() => {
    if (!conversation) return
    const interval = setInterval(() => {
      fetchMessages(false)
    }, 15000)
    return () => clearInterval(interval)
  }, [conversation?.id, fetchMessages])

  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !conversation || sending) return
    setSending(true)
    try {
      let url: string
      let body: any

      if (conversation.channel === 'whatsapp') {
        url = '/api/whatsapp/messages'
        body = { conversation_id: conversation.id, message: newMessage.trim() }
      } else {
        // For email, we need the thread_id and recipient
        url = '/api/gmail/send'
        body = {
          to: conversation.contact_info,
          subject: conversation.subject ? `Re: ${conversation.subject}` : 'New message',
          body: newMessage.trim(),
          threadId: conversation.identifier, // thread_id for email
          userId: 'current', // Will be handled by the API
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setNewMessage('')
        fetchMessages(false)
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }

  // Assign conversation
  const assignConversation = async (agentId: string | null) => {
    if (!conversation) return
    setAssigningAgent(true)
    try {
      let url: string
      if (conversation.channel === 'whatsapp') {
        url = '/api/whatsapp/conversations/assign'
      } else {
        url = '/api/email/conversations'
      }

      const res = await fetch(url, {
        method: conversation.channel === 'whatsapp' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          conversation.channel === 'whatsapp'
            ? { conversation_id: conversation.id, agent_id: agentId, action: agentId ? 'assign' : 'unassign' }
            : { id: conversation.id, assigned_team_member_id: agentId }
        ),
      })

      if (res.ok) {
        const data = await res.json()
        if (onConversationUpdate && data.conversation) {
          onConversationUpdate(data.conversation)
        }
      }
    } catch (error) {
      console.error('Error assigning conversation:', error)
    } finally {
      setAssigningAgent(false)
      setShowAgentSelector(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />
      case 'sent': return <Check className="w-3.5 h-3.5 text-gray-400" />
      case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
      default: return <Clock className="w-3.5 h-3.5 text-gray-300" />
    }
  }

  const getChannelColors = (channel: ConversationChannel) => {
    return channel === 'whatsapp'
      ? { bg: 'bg-[#e5ddd5]', outbound: 'bg-[#dcf8c6]', inbound: 'bg-white', accent: '#25D366' }
      : { bg: 'bg-gray-100', outbound: 'bg-blue-100', inbound: 'bg-white', accent: '#3B82F6' }
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups: Record<string, UnifiedMessage[]>, msg) => {
    const date = formatDate(msg.sent_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-1">Unified Communications</h2>
          <p className="text-sm text-gray-500">Select a conversation to view messages</p>
        </div>
      </div>
    )
  }

  const colors = getChannelColors(conversation.channel)

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-gray-500" />
              </div>
              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
                conversation.channel === 'whatsapp' ? 'bg-[#25D366]' : 'bg-blue-500'
              }`}>
                {conversation.channel === 'whatsapp' ? (
                  <MessageSquare className="w-3 h-3 text-white" />
                ) : (
                  <Mail className="w-3 h-3 text-white" />
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">
                  {conversation.client_name || conversation.contact_info}
                </p>
                <ChannelBadge channel={conversation.channel} size="sm" />
              </div>
              <p className="text-xs text-gray-500">{conversation.contact_info}</p>
              {conversation.channel === 'email' && conversation.subject && (
                <p className="text-xs text-gray-600 font-medium mt-0.5">{conversation.subject}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Agent Selector */}
            <div className="relative">
              <button
                onClick={() => setShowAgentSelector(!showAgentSelector)}
                disabled={assigningAgent}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {assigningAgent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : conversation.assigned_agent ? (
                  <>
                    <AgentAvatar agent={conversation.assigned_agent as Agent} size="sm" />
                    <span className="font-medium truncate max-w-[100px]">
                      {conversation.assigned_agent.name}
                    </span>
                  </>
                ) : (
                  <>
                    <UserX className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500">Unassigned</span>
                  </>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showAgentSelector && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAgentSelector(false)} />
                  <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                    <button
                      onClick={() => assignConversation(null)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100"
                    >
                      <UserX className="w-4 h-4 text-gray-400" />
                      <span>Unassign</span>
                    </button>
                    <div className="py-1">
                      <p className="px-3 py-1 text-xs font-medium text-gray-400 uppercase">Assign to</p>
                      {agents.filter(a => a.is_available).map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => assignConversation(agent.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                            conversation.assigned_agent?.id === agent.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <AgentAvatar agent={agent} size="sm" />
                          <div className="flex-1 text-left">
                            <p className="font-medium">{agent.name}</p>
                            <p className="text-xs text-gray-500">
                              {agent.current_conversations}/{agent.max_conversations} chats
                            </p>
                          </div>
                          {conversation.assigned_agent?.id === agent.id && (
                            <Check className="w-4 h-4 text-blue-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Client Link */}
            {conversation.client_id ? (
              <Link
                href={`/clients/${conversation.client_id}`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <User className="w-4 h-4" />
                View Client
              </Link>
            ) : (
              <Link
                href={`/clients/new?${conversation.channel === 'whatsapp' ? 'phone' : 'email'}=${conversation.contact_info}`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
                Create Client
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-4 ${colors.bg}`}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.accent }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 bg-white/80 px-4 py-2 rounded-lg">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date}>
                {/* Date separator */}
                <div className="flex items-center justify-center mb-4">
                  <span className="px-3 py-1 text-xs font-medium text-gray-500 bg-white rounded-full shadow-sm">
                    {date}
                  </span>
                </div>

                {/* Messages for this date */}
                <div className="space-y-2">
                  {msgs.map((msg) => {
                    const isOutbound = msg.direction === 'outbound'
                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
                            isOutbound
                              ? `${colors.outbound} rounded-tr-none`
                              : `${colors.inbound} rounded-tl-none`
                          }`}
                        >
                          {/* Email header info */}
                          {conversation.channel === 'email' && msg.from_address && (
                            <div className="text-xs text-gray-500 mb-1 pb-1 border-b border-gray-200">
                              <span className="font-medium">
                                {isOutbound ? 'To: ' : 'From: '}
                              </span>
                              {isOutbound ? msg.to_addresses?.join(', ') : msg.from_address}
                            </div>
                          )}

                          {/* Message content */}
                          <p className="text-sm text-gray-900 whitespace-pre-wrap">
                            {msg.content}
                          </p>

                          {/* Attachments for email */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {msg.attachments.map((att, idx) => (
                                <AttachmentBadge key={idx} attachment={att} />
                              ))}
                            </div>
                          )}

                          {/* Timestamp and status */}
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-xs text-gray-500">{formatTime(msg.sent_at)}</span>
                            {isOutbound && getStatusIcon(msg.status)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={sendMessage} className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Type a message via ${conversation.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}...`}
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': colors.accent } as any}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-2.5 text-white rounded-full hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: colors.accent }}
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default UnifiedMessageThread
