'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MessageSquare, Send, Search, Phone, User, Clock,
  MoreVertical, Archive, Sparkles, RefreshCw, Plus,
  CheckCheck, Check, AlertCircle, ArrowLeft, X
} from 'lucide-react'

interface Conversation {
  id: string
  phone_number: string
  client_id: string | null
  client_name: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  status: string
  clients?: {
    id: string
    full_name: string
    email: string
    client_code: string
  } | null
}

interface Message {
  id: string
  conversation_id: string
  message_sid: string
  direction: 'inbound' | 'outbound'
  message_body: string
  media_url: string | null
  status: string
  sent_at: string
}

export default function WhatsAppInboxPage() {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newPhoneNumber, setNewPhoneNumber] = useState('')

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/conversations?search=${searchQuery}`)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/messages?conversation_id=${conversationId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  // Mark conversation as read
  const markAsRead = async (conversationId: string) => {
    try {
      await fetch('/api/whatsapp/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, action: 'mark_read' })
      })
      setConversations(prev => prev.map(c => 
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      ))
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConversation) return

    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          message: newMessage.trim()
        })
      })

      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, data.message])
        setNewMessage('')
        
        // Update conversation list
        setConversations(prev => prev.map(c => 
          c.id === selectedConversation.id 
            ? { ...c, last_message: newMessage.trim(), last_message_at: new Date().toISOString() }
            : c
        ))
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Start new conversation
  const startNewConversation = async () => {
    if (!newPhoneNumber.trim()) return

    try {
      const res = await fetch('/api/whatsapp/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: newPhoneNumber.trim() })
      })

      if (res.ok) {
        const data = await res.json()
        setShowNewChat(false)
        setNewPhoneNumber('')
        fetchConversations()
        setSelectedConversation(data.conversation)
        fetchMessages(data.conversation.id)
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
    }
  }

  // Parse conversation - send to WhatsApp parser
  const parseConversation = () => {
    if (!selectedConversation || messages.length === 0) return

    // Build conversation text
    const conversationText = messages.map(m => {
      const sender = m.direction === 'inbound' ? 'Client' : 'Agent'
      return `${sender}: ${m.message_body}`
    }).join('\n')

    // Encode and navigate to parser
    const encoded = encodeURIComponent(conversationText)
    const clientId = selectedConversation.client_id || ''
    router.push(`/whatsapp-parser?conversation=${encoded}&clientId=${clientId}&phone=${selectedConversation.phone_number}`)
  }

  // Select conversation
  const selectConversation = (conv: Conversation) => {
    setSelectedConversation(conv)
    fetchMessages(conv.id)
    if (conv.unread_count > 0) {
      markAsRead(conv.id)
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initial load
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Polling for new messages
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations()
      if (selectedConversation) {
        fetchMessages(selectedConversation.id)
      }
    }, 10000) // Every 10 seconds

    return () => clearInterval(interval)
  }, [selectedConversation, fetchConversations, fetchMessages])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-GB', { weekday: 'short' })
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100">
      {/* Conversations List */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold text-gray-900">WhatsApp Inbox</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchConversations()}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowNewChat(true)}
                className="p-2 text-white bg-[#25D366] hover:bg-[#20bd5a] rounded-lg"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#25D366]"></div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedConversation?.id === conv.id ? 'bg-[#25D366]/10' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conv.client_name || conv.clients?.full_name || conv.phone_number}
                      </p>
                      {conv.last_message_at && (
                        <span className="text-xs text-gray-500">{formatTime(conv.last_message_at)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate pr-2">
                        {conv.last_message || 'No messages yet'}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-[#25D366] text-white rounded-full">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{conv.phone_number}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedConversation.client_name || selectedConversation.clients?.full_name || selectedConversation.phone_number}
                  </p>
                  <p className="text-xs text-gray-500">{selectedConversation.phone_number}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={parseConversation}
                  disabled={messages.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  Parse Conversation
                </button>
                
                {selectedConversation.client_id ? (
                  <Link
                    href={`/clients/${selectedConversation.client_id}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <User className="w-4 h-4" />
                    View Client
                  </Link>
                ) : (
                  <Link
                    href={`/clients/new?phone=${selectedConversation.phone_number}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <Plus className="w-4 h-4" />
                    Create Client
                  </Link>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5]" style={{ backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAABKUlEQVR4nO2YQQ6CMBBF/924cKNXcOFGt3oKvYgLXegFPIArY7yJC1mY6E4MxKhgS0vRQL9k0oQ0M/nJn06BKIqiKIqiqH/BAIANAD+ICsADwArACYAJgH0AVwBaECUAngG4A7AEcATgGIBd+N4WwCWASwBXAB4h2gPwAMAnhN0BuAFwBeAGwCWEXQC4AXAB4QjAJYArAE8QzgGcQzgDcALh8gfuIdwDOIFwdgT3Ee4hHB3BHYRtCPsj2IawPYKvIdz8wE2E6yO4DWHV/0J9hJsjuIqwagT3EJaNYNUIHiPsNII7CMtEcP0/uQ9hZwRXIywTwXWEZSK4irD0H7mOsNQfuYGw1B+5hbDEH7mNsMgfuYuw8B+5j7DAH3mAsNMfuYuwwB95hLCg79EH3ANr+B8AAAAASUVORK5CYII=")' }}>
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#25D366]"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500 bg-white/80 px-4 py-2 rounded-lg">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
                          msg.direction === 'outbound'
                            ? 'bg-[#dcf8c6] rounded-tr-none'
                            : 'bg-white rounded-tl-none'
                        }`}
                      >
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{msg.message_body}</p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-xs text-gray-500">
                            {new Date(msg.sent_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                        </div>
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
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  className="p-2.5 bg-[#25D366] text-white rounded-full hover:bg-[#20bd5a] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-lg font-medium text-gray-900 mb-1">WhatsApp Business</h2>
              <p className="text-sm text-gray-500">Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">New Conversation</h2>
              <button onClick={() => setShowNewChat(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Include country code (e.g., +20 for Egypt)</p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewChat(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={startNewConversation}
                disabled={!newPhoneNumber.trim()}
                className="px-4 py-2 text-sm bg-[#25D366] text-white rounded-lg hover:bg-[#20bd5a] disabled:opacity-50"
              >
                Start Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
