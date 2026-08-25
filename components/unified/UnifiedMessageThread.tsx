'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Send, User, Clock, Loader2, CheckCheck, Check,
  AlertCircle, Plus, History, Paperclip, Download,
  MessageSquare, Mail, UserPlus, UserX, ChevronDown,
  ExternalLink, Languages, Sparkles, Trash2, Archive, MailOpen, X
} from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { ChannelBadge } from './ChannelBadge'
import { UnifiedConversation, UnifiedMessage, ConversationChannel, EmailAttachment } from '@/types/unified'

// Helper to extract and separate quoted content from emails
function parseEmailContent(content: string): { main: string; quoted: string | null } {
  if (!content) return { main: '', quoted: null }

  // Common patterns for quoted content
  const patterns = [
    /\n\s*On .+wrote:\s*\n/i,           // "On [date], [person] wrote:"
    /\n\s*-{3,}\s*Original Message\s*-{3,}/i,  // "--- Original Message ---"
    /\n\s*>{2,}/,                        // Multiple > characters
    /\n\s*From:.+\nSent:.+\nTo:/i,      // Outlook style
    /\n\s*_{10,}/,                       // Long underscore lines
  ]

  let splitIndex = content.length
  for (const pattern of patterns) {
    const match = content.search(pattern)
    if (match !== -1 && match < splitIndex) {
      splitIndex = match
    }
  }

  if (splitIndex < content.length) {
    return {
      main: content.substring(0, splitIndex).trim(),
      quoted: content.substring(splitIndex).trim()
    }
  }

  return { main: content, quoted: null }
}

// Supported languages
const QUICK_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
]

interface UnifiedMessageThreadProps {
  conversation: UnifiedConversation | null
  onConversationUpdate?: (conversation: UnifiedConversation) => void
  onConversationDeleted?: (conversationId: string) => void
}

// Delete Confirmation Modal
function DeleteConfirmationModal({
  conversation,
  onConfirm,
  onCancel,
  isDeleting,
  t,
  tCommon
}: {
  conversation: UnifiedConversation
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
  t: (key: string, values?: Record<string, any>) => string
  tCommon: (key: string) => string
}) {
  const displayName = conversation.client_name || conversation.contact_info?.split('@')[0] || t('unknown')
  const isEmail = conversation.channel === 'email'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('deleteConversationTitle')}</h3>
              <p className="text-sm text-gray-600">
                {isEmail ? t('moveToTrash') : t('hideFromInbox')}
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-700 mb-4">{t('deleteConfirmMessage')}</p>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isEmail ? 'bg-blue-100' : 'bg-emerald-100'
              }`}>
                {isEmail ? (
                  <Mail className="w-5 h-5 text-blue-600" />
                ) : (
                  <MessageSquare className="w-5 h-5 text-emerald-600" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">{displayName}</p>
                <p className="text-sm text-gray-500">{conversation.contact_info}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>{t('note')}</strong> {isEmail
                ? t('deleteNoteEmail')
                : t('deleteNoteWhatsApp')}
            </p>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-red-300 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('deleting')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {tCommon('delete')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
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
  onConversationDeleted,
}: UnifiedMessageThreadProps) {
  const router = useRouter()
  const { user } = useAuth()
  const t = useTranslations('communications')
  const tCommon = useTranslations('common')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<UnifiedMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [assigningAgent, setAssigningAgent] = useState(false)

  // Action state (delete, archive, mark as read)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Translation state
  const [translationEnabled, setTranslationEnabled] = useState(false)
  const [translatedMessage, setTranslatedMessage] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [customerLanguage, setCustomerLanguage] = useState('es')
  const [showLanguageSelector, setShowLanguageSelector] = useState(false)
  const [incomingTranslations, setIncomingTranslations] = useState<Record<string, string>>({})
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Set<string>>(new Set())
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({})
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set())

  const getLanguageInfo = (code: string) => QUICK_LANGUAGES.find(l => l.code === code) || { code, name: code, flag: '🌐' }

  // In-flight messages request, so switching conversations (or unmounting) can
  // cancel a slow response that would otherwise overwrite the current thread.
  const messagesAbortRef = useRef<AbortController | null>(null)

  // Fetch messages based on channel
  const fetchMessages = useCallback(async (showLoader = true) => {
    if (!conversation) return
    // Cancel any previous in-flight fetch — a stale response for a
    // previously-selected conversation must not clobber the current one.
    messagesAbortRef.current?.abort()
    const controller = new AbortController()
    messagesAbortRef.current = controller
    if (showLoader) setLoading(true)
    try {
      let url: string
      if (conversation.channel === 'whatsapp') {
        url = `/api/whatsapp/messages?conversation_id=${conversation.id}`
      } else {
        url = `/api/email/messages?conversation_id=${conversation.id}`
      }

      const res = await fetch(url, { signal: controller.signal })
      if (res.ok) {
        const data = await res.json()
        // A newer request superseded this one mid-flight — discard its result.
        if (controller.signal.aborted) return
        // Transform to unified format
        const msgs = (data.messages || data.data || []).map((msg: any) => ({
          id: msg.id,
          channel: conversation.channel,
          conversation_id: conversation.id,
          direction: msg.direction,
          content: msg.message_body || msg.body_html || msg.body_text || msg.snippet || '',
          isHtml: !!(msg.body_html && !msg.message_body),
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
    } catch (error: any) {
      // Expected when a newer fetch (switch/unmount) aborted this one — not an error.
      if (error?.name === 'AbortError') return
      console.error('Error fetching messages:', error)
    } finally {
      // Only the request that's still current should clear the loading flag, so an
      // aborted older fetch doesn't turn off the spinner the newer fetch turned on.
      if (showLoader && !controller.signal.aborted) setLoading(false)
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

  // Abort any in-flight messages fetch on unmount.
  useEffect(() => () => messagesAbortRef.current?.abort(), [])

  // Load messages when conversation changes
  useEffect(() => {
    if (conversation) {
      fetchMessages(true)
      fetchAgents()
      // Reset translation state
      setIncomingTranslations({})
      setShowOriginalMap({})
      setNewMessage('')
      setTranslatedMessage('')
    } else {
      setMessages([])
    }
  }, [conversation?.id])

  // Scroll to bottom when messages change (container-based to avoid page scroll)
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      const container = messagesContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  // Auto-refresh messages
  useEffect(() => {
    if (!conversation) return
    const interval = setInterval(() => {
      fetchMessages(false)
    }, 15000)
    return () => clearInterval(interval)
  }, [conversation?.id, fetchMessages])

  // Translation functions
  const translateOutgoing = async (text: string, targetLang: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage: targetLang, action: 'fromEnglish' })
      })
      const data = await res.json()
      return data.success && data.data?.translatedText ? data.data.translatedText : null
    } catch { return null }
  }

  const translateIncoming = async (text: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, action: 'toEnglish' })
      })
      const data = await res.json()
      return data.success && data.data?.translatedText ? data.data.translatedText : null
    } catch { return null }
  }

  const handleTranslateMessage = async (messageId: string, messageBody: string) => {
    if (incomingTranslations[messageId] || translatingMessageIds.has(messageId)) return
    setTranslatingMessageIds(prev => new Set(prev).add(messageId))
    const translation = await translateIncoming(messageBody)
    if (translation) setIncomingTranslations(prev => ({ ...prev, [messageId]: translation }))
    setTranslatingMessageIds(prev => { const s = new Set(prev); s.delete(messageId); return s })
  }

  // Auto-translate outgoing message
  useEffect(() => {
    if (!translationEnabled || !newMessage.trim()) {
      setTranslatedMessage('')
      setIsTranslating(false)
      return
    }
    setIsTranslating(true)
    const timer = setTimeout(async () => {
      const result = await translateOutgoing(newMessage.trim(), customerLanguage)
      setTranslatedMessage(result || '')
      setIsTranslating(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [newMessage, customerLanguage, translationEnabled])

  // Auto-translate incoming messages when translation is enabled
  useEffect(() => {
    if (translationEnabled && messages.length > 0) {
      messages.forEach(msg => {
        if (msg.direction === 'inbound' && !incomingTranslations[msg.id]) {
          handleTranslateMessage(msg.id, msg.content)
        }
      })
    }
  }, [translationEnabled, messages])

  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !conversation || sending) return
    setSending(true)
    try {
      let url: string
      let body: any
      let messageToSend = newMessage.trim()

      // Use translated message if translation is enabled
      if (translationEnabled && translatedMessage) {
        messageToSend = translatedMessage
      }

      if (conversation.channel === 'whatsapp') {
        url = '/api/whatsapp/messages'
        body = { conversation_id: conversation.id, message: messageToSend }
      } else {
        // For email, we need the thread_id and recipient
        url = '/api/gmail/send'
        body = {
          to: conversation.contact_info,
          subject: conversation.subject ? `Re: ${conversation.subject}` : 'New message',
          body: messageToSend,
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
        setTranslatedMessage('')
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

  // Delete conversation (WhatsApp: hide, Email: trash)
  const handleDeleteConversation = async () => {
    if (!conversation) return
    setActionLoading(true)
    try {
      if (conversation.channel === 'whatsapp') {
        // WhatsApp: DELETE to hide conversation
        const res = await fetch(`/api/whatsapp/conversations?id=${conversation.id}`, { method: 'DELETE' })
        if (res.ok && onConversationDeleted) {
          onConversationDeleted(conversation.id)
        }
      } else {
        // Email: soft-hide from the unified inbox (mirrors the WhatsApp path).
        // This removes it from the box without touching the actual Gmail mailbox.
        // The previous Gmail-trash call never removed the row from our DB (so the
        // conversation kept reappearing) and passed a thread_id to a messages API.
        const res = await fetch(`/api/email/conversations?id=${conversation.id}`, { method: 'DELETE' })
        if (res.ok && onConversationDeleted) {
          onConversationDeleted(conversation.id)
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
    } finally {
      setActionLoading(false)
      setShowDeleteModal(false)
    }
  }

  // Archive conversation (Email only)
  const handleArchiveConversation = async () => {
    if (!conversation || conversation.channel !== 'email' || !user) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/gmail/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          messageIds: [conversation.identifier],
          action: 'archive'
        }),
      })
      if (res.ok && onConversationDeleted) {
        onConversationDeleted(conversation.id)
      }
    } catch (error) {
      console.error('Error archiving conversation:', error)
    } finally {
      setActionLoading(false)
    }
  }

  // Mark conversation as read
  const handleMarkAsRead = async () => {
    if (!conversation) return
    setActionLoading(true)
    try {
      if (conversation.channel === 'whatsapp') {
        await fetch('/api/whatsapp/conversations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversation.id, action: 'mark_read' })
        })
      } else if (user) {
        await fetch('/api/gmail/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            messageIds: [conversation.identifier],
            action: 'markRead'
          }),
        })
      }
      // Update local state
      if (onConversationUpdate) {
        onConversationUpdate({ ...conversation, unread_count: 0 })
      }
    } catch (error) {
      console.error('Error marking as read:', error)
    } finally {
      setActionLoading(false)
    }
  }

  // Mark conversation as unread (Email only)
  const handleMarkAsUnread = async () => {
    if (!conversation || conversation.channel !== 'email' || !user) return
    setActionLoading(true)
    try {
      await fetch('/api/gmail/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          messageIds: [conversation.identifier],
          action: 'markUnread'
        }),
      })
      if (onConversationUpdate) {
        onConversationUpdate({ ...conversation, unread_count: 1 })
      }
    } catch (error) {
      console.error('Error marking as unread:', error)
    } finally {
      setActionLoading(false)
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
    if (diffDays === 0) return t('today')
    if (diffDays === 1) return t('yesterday')
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

  // Navigate to WhatsApp parser with conversation data
  const handleParseConversation = () => {
    if (!conversation || messages.length === 0) return

    // Format messages into a conversation string
    const formattedConversation = messages.map(msg => {
      const sender = msg.direction === 'inbound' ? 'Cliente' : 'Agente'
      let content = msg.content

      // For emails, include subject in first message
      if (conversation.channel === 'email' && msg.subject) {
        content = `[Subject: ${msg.subject}]\n${content}`
      }

      // Clean up the content - remove excessive whitespace
      content = content.replace(/\n{3,}/g, '\n\n').trim()

      return `${sender}: ${content}`
    }).join('\n')

    // Encode conversation as URL-safe base64
    const encoder = new TextEncoder()
    const bytes = encoder.encode(formattedConversation)
    const base64 = btoa(String.fromCharCode(...bytes))
    const encoded = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    // Build query params
    const params = new URLSearchParams()
    params.set('conversation', encoded)
    params.set('encoded', 'base64')
    params.set('source', conversation.channel)

    // Pass client ID if linked
    if (conversation.client_id) {
      params.set('clientId', conversation.client_id)
    }

    // Pass contact info based on channel
    if (conversation.channel === 'whatsapp' && conversation.contact_info) {
      params.set('phone', conversation.contact_info)
    }
    if (conversation.client_email) {
      params.set('email', conversation.client_email)
    }

    // Pass client name if available
    const clientName = conversation.client_name
      || (conversation.client ? `${conversation.client.first_name || ''} ${conversation.client.last_name || ''}`.trim() : '')
    if (clientName) {
      params.set('clientName', clientName)
    }

    // Navigate to pricing grid
    router.push(`/pricing-grid?${params.toString()}`)
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
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <MessageSquare className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">{t('unifiedCommunications')}</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            {t('selectToView')}
          </p>
        </div>
      </div>
    )
  }

  const colors = getChannelColors(conversation.channel)
  const displayName = conversation.client_name || conversation.contact_info?.split('@')[0] || 'Unknown'
  const initials = displayName.split(/[\s@.]/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
                conversation.channel === 'whatsapp' ? 'bg-emerald-600' : 'bg-blue-600'
              }`}>
                {initials}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                conversation.channel === 'whatsapp' ? 'bg-[#25D366]' : 'bg-blue-500'
              }`}>
                {conversation.channel === 'whatsapp' ? (
                  <MessageSquare className="w-2 h-2 text-white" />
                ) : (
                  <Mail className="w-2 h-2 text-white" />
                )}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {displayName}
                </p>
                {conversation.client_id && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded">
                    {t('client')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">{conversation.contact_info}</p>
              {conversation.channel === 'email' && conversation.subject && (
                <p className="text-xs text-gray-700 font-medium truncate mt-0.5 max-w-[300px]" title={conversation.subject}>
                  {conversation.subject}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Agent Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAgentSelector(!showAgentSelector)}
                disabled={assigningAgent}
                className="flex items-center gap-1.5 px-2 py-1 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                {assigningAgent ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : conversation.assigned_agent ? (
                  <>
                    <AgentAvatar agent={conversation.assigned_agent as Agent} size="sm" />
                    <span className="font-medium truncate max-w-[80px]">
                      {conversation.assigned_agent.name}
                    </span>
                  </>
                ) : (
                  <>
                    <UserX className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500">{t('unassigned')}</span>
                  </>
                )}
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {showAgentSelector && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAgentSelector(false)} />
                  <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => assignConversation(null)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100"
                    >
                      <UserX className="w-4 h-4 text-gray-400" />
                      <span>{t('unassign')}</span>
                    </button>
                    <div className="py-1">
                      <p className="px-3 py-1 text-xs font-medium text-gray-400 uppercase">{t('assignTo')}</p>
                      {agents.filter(a => a.is_available).map(agent => (
                        <button
                          type="button"
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
                              {agent.current_conversations}/{agent.max_conversations} {t('chats')}
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
                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <User className="w-3.5 h-3.5" />
                {t('viewClient')}
              </Link>
            ) : (
              <Link
                href={`/clients/new?${conversation.channel === 'whatsapp' ? 'phone' : 'email'}=${conversation.contact_info}`}
                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('createClient')}
              </Link>
            )}

            {/* Parse & Generate Itinerary */}
            <button
              type="button"
              onClick={handleParseConversation}
              disabled={messages.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('generateItinerary')}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t('generateItinerary')}
            </button>

            {/* Separator */}
            <div className="w-px h-5 bg-gray-200" />

            {/* Action Buttons */}
            {/* Mark as Read/Unread */}
            {conversation.unread_count > 0 ? (
              <button
                type="button"
                onClick={handleMarkAsRead}
                disabled={actionLoading}
                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
                title={t('markAsRead')}
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MailOpen className="w-3.5 h-3.5" />}
              </button>
            ) : conversation.channel === 'email' && (
              <button
                type="button"
                onClick={handleMarkAsUnread}
                disabled={actionLoading}
                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
                title={t('markAsUnread')}
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Archive (Email only) */}
            {conversation.channel === 'email' && (
              <button
                type="button"
                onClick={handleArchiveConversation}
                disabled={actionLoading}
                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
                title={t('archive')}
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Delete */}
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={actionLoading}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
              title={tCommon('delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className={`flex-1 overflow-y-auto p-4 ${colors.bg}`}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.accent }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 bg-white/80 px-4 py-2 rounded-lg">{t('noMessages')}</p>
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
                <div className="space-y-3">
                  {msgs.map((msg) => {
                    const isOutbound = msg.direction === 'outbound'
                    const isInbound = msg.direction === 'inbound'
                    const hasTranslation = isInbound && incomingTranslations[msg.id]
                    const isTranslatingThis = translatingMessageIds.has(msg.id)
                    const showOriginal = showOriginalMap[msg.id]

                    // Parse email content to separate main content from quoted
                    const isEmail = conversation.channel === 'email'
                    const contentToParse = isInbound && hasTranslation && !showOriginal
                      ? incomingTranslations[msg.id]
                      : msg.content
                    const { main: mainContent, quoted: quotedContent } = isEmail
                      ? parseEmailContent(contentToParse)
                      : { main: contentToParse, quoted: null }
                    const isQuoteExpanded = expandedQuotes.has(msg.id)

                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isOutbound
                              ? `${colors.outbound} rounded-br-md`
                              : `${colors.inbound} rounded-bl-md border border-gray-100`
                          }`}
                        >
                          {/* Translation controls for inbound messages */}
                          {isInbound && translationEnabled && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200/60">
                              {isTranslatingThis ? (
                                <span className="flex items-center gap-1 text-xs text-blue-500">
                                  <Loader2 className="w-3 h-3 animate-spin" />{t('translating')}
                                </span>
                              ) : hasTranslation ? (
                                <button
                                  type="button"
                                  onClick={() => setShowOriginalMap(p => ({ ...p, [msg.id]: !p[msg.id] }))}
                                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  {showOriginal ? `🇬🇧 ${t('showEnglish')}` : `🌐 ${t('showOriginal')}`}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleTranslateMessage(msg.id, msg.content)}
                                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  🌐 {t('translate')}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Email header info */}
                          {isEmail && msg.from_address && (
                            <div className="text-[11px] text-gray-500 mb-2 pb-2 border-b border-gray-200/60">
                              <span className="font-semibold text-gray-600">
                                {isOutbound ? 'To: ' : 'From: '}
                              </span>
                              <span className="text-gray-500">
                                {isOutbound ? msg.to_addresses?.join(', ') : msg.from_address}
                              </span>
                            </div>
                          )}

                          {/* Message content */}
                          {msg.isHtml ? (
                            <div
                              className="text-[13px] text-gray-800 leading-relaxed break-words overflow-hidden [overflow-wrap:anywhere] [word-break:break-word] [&_a]:text-blue-600 [&_a]:underline [&_img]:max-w-full [&_img]:h-auto [&_table]:w-full [&_td]:p-1"
                              dangerouslySetInnerHTML={{ __html: sanitizeHtml(mainContent) }}
                            />
                          ) : (
                            <div className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed break-words overflow-hidden [overflow-wrap:anywhere] [word-break:break-word]">
                              {mainContent}
                            </div>
                          )}

                          {/* Quoted content (collapsible) */}
                          {quotedContent && (
                            <div className="mt-3 pt-2 border-t border-gray-200/60">
                              <button
                                type="button"
                                onClick={() => setExpandedQuotes(prev => {
                                  const newSet = new Set(prev)
                                  if (newSet.has(msg.id)) {
                                    newSet.delete(msg.id)
                                  } else {
                                    newSet.add(msg.id)
                                  }
                                  return newSet
                                })}
                                className="text-[11px] text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1"
                              >
                                <ChevronDown className={`w-3 h-3 transition-transform ${isQuoteExpanded ? 'rotate-180' : ''}`} />
                                {isQuoteExpanded ? t('hideQuoted') : t('showQuoted')} ({quotedContent.split('\n').length} {t('lines')})
                              </button>
                              {isQuoteExpanded && (
                                <div className="mt-2 pl-3 border-l-2 border-gray-200 text-[12px] text-gray-400 whitespace-pre-wrap max-h-48 overflow-y-auto break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                  {quotedContent}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Show original if translated */}
                          {isInbound && hasTranslation && !showOriginal && (
                            <p className="text-[11px] text-gray-400 mt-2 italic border-t border-gray-200/60 pt-2">
                              Original: {msg.content.substring(0, 100)}...
                            </p>
                          )}

                          {/* Attachments for email */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-gray-200/60 flex flex-wrap gap-1.5">
                              {msg.attachments.map((att, idx) => (
                                <AttachmentBadge key={idx} attachment={att} />
                              ))}
                            </div>
                          )}

                          {/* Timestamp and status */}
                          <div className="flex items-center justify-end gap-1.5 mt-2">
                            <span className="text-[11px] text-gray-400">{formatTime(msg.sent_at)}</span>
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

      {/* Translation Controls */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setTranslationEnabled(!translationEnabled); setTranslatedMessage('') }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                translationEnabled
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              <Languages className="w-4 h-4" />
              {translationEnabled ? t('translationOn') : t('translate')}
            </button>
            {translationEnabled && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLanguageSelector(!showLanguageSelector)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  <span>{getLanguageInfo(customerLanguage).flag}</span>
                  <span>{getLanguageInfo(customerLanguage).name}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showLanguageSelector && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLanguageSelector(false)} />
                    <div className="absolute bottom-full left-0 mb-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {QUICK_LANGUAGES.filter(l => l.code !== 'en').map(lang => (
                        <button
                          type="button"
                          key={lang.code}
                          onClick={() => { setCustomerLanguage(lang.code); setShowLanguageSelector(false); setTranslatedMessage('') }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                            customerLanguage === lang.code ? 'bg-blue-50 text-blue-700' : ''
                          }`}
                        >
                          <span>{lang.flag}</span>
                          <span>{lang.name}</span>
                          {customerLanguage === lang.code && <Check className="w-4 h-4 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {translationEnabled && newMessage && (
            <div className="text-xs">
              {isTranslating ? (
                <span className="flex items-center gap-1 text-blue-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />{t('translating')}
                </span>
              ) : translatedMessage ? (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="w-3.5 h-3.5" />{t('readyIn', { language: getLanguageInfo(customerLanguage).name })}
                </span>
              ) : (
                <span className="text-gray-400">{t('typeToTranslate')}</span>
              )}
            </div>
          )}
        </div>
        {translationEnabled && translatedMessage && !isTranslating && (
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-600 font-medium mb-1">{getLanguageInfo(customerLanguage).flag} {t('willSend')}</p>
            <p className="text-sm text-gray-700">{translatedMessage}</p>
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
            placeholder={
              translationEnabled
                ? t('typeInEnglish', { language: getLanguageInfo(customerLanguage).name })
                : conversation.channel === 'whatsapp' ? t('typeMessageViaWhatsApp') : t('typeMessageViaEmail')
            }
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': colors.accent } as any}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending || (translationEnabled && isTranslating)}
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && conversation && (
        <DeleteConfirmationModal
          conversation={conversation}
          onConfirm={handleDeleteConversation}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={actionLoading}
          t={t}
          tCommon={tCommon}
        />
      )}
    </div>
  )
}

export default UnifiedMessageThread
