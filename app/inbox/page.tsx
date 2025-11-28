'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import Link from 'next/link'
import { 
  Mail, 
  Inbox, 
  Send, 
  Search, 
  RefreshCw, 
  Loader2,
  ArrowLeft,
  Star,
  Paperclip,
  ChevronRight,
  X,
  AlertCircle
} from 'lucide-react'
import { createClient } from '@/app/supabase'

interface Email {
  id: string
  threadId: string
  snippet: string
  from: string
  to: string
  subject: string
  date: string
  body: string
  isUnread: boolean
}

export default function InboxPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      checkConnectionAndFetchEmails()
    }
  }, [user])

  const checkConnectionAndFetchEmails = async () => {
    try {
      // Check if Gmail is connected
      const { data } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', user?.id)
        .single()

      if (!data) {
        setIsConnected(false)
        setLoading(false)
        return
      }

      setIsConnected(true)
      await fetchEmails()
    } catch (err) {
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  const fetchEmails = async (query?: string) => {
    if (!user) return
    
    setRefreshing(true)
    try {
      const params = new URLSearchParams({
        userId: user.id,
        maxResults: '30',
      })
      if (query) params.append('query', query)

      const response = await fetch(`/api/gmail/emails?${params}`)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setEmails(data.messages || [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchEmails(searchQuery)
  }

  const handleRefresh = () => {
    fetchEmails(searchQuery)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const extractName = (from: string) => {
    const match = from.match(/^([^<]+)/)
    return match ? match[1].trim().replace(/"/g, '') : from
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Gmail Not Connected</h2>
          <p className="text-sm text-gray-600 mb-4">
            Connect your Gmail account to view and send emails from Autoura.
          </p>
          <Link
            href="/settings/email"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Connect Gmail
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Inbox className="w-5 h-5 text-primary-600" />
                Inbox
              </h1>
              
              {/* Search */}
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="w-64 h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </form>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowCompose(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Compose
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Email List & Detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email List */}
        <div className={`${selectedEmail ? 'w-2/5 border-r border-gray-200' : 'w-full'} bg-white overflow-y-auto`}>
          {emails.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                <Inbox className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No emails found</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`px-4 py-3 cursor-pointer transition-colors ${
                    selectedEmail?.id === email.id
                      ? 'bg-primary-50 border-l-2 border-l-primary-600'
                      : 'hover:bg-gray-50'
                  } ${email.isUnread ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm truncate ${email.isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {extractName(email.from)}
                        </span>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          {formatDate(email.date)}
                        </span>
                      </div>
                      <p className={`text-sm truncate ${email.isUnread ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                        {email.subject || '(No subject)'}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {email.snippet}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Detail */}
        {selectedEmail && (
          <div className="flex-1 bg-white overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {selectedEmail.subject || '(No subject)'}
                  </h2>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-primary-700 font-medium">
                        {extractName(selectedEmail.from).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{extractName(selectedEmail.from)}</p>
                      <p className="text-xs text-gray-500">To: {selectedEmail.to}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{formatDate(selectedEmail.date)}</span>
                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div 
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
              />

              {/* Reply Button */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowCompose(true)
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                >
                  <Send className="w-4 h-4" />
                  Reply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <ComposeModal
          onClose={() => setShowCompose(false)}
          userId={user?.id || ''}
          replyTo={selectedEmail}
          onSent={() => {
            setShowCompose(false)
            fetchEmails()
          }}
        />
      )}
    </div>
  )
}

// Compose Modal Component
function ComposeModal({ 
  onClose, 
  userId, 
  replyTo,
  onSent 
}: { 
  onClose: () => void
  userId: string
  replyTo?: Email | null
  onSent: () => void
}) {
  const [to, setTo] = useState(replyTo ? replyTo.from.match(/<(.+)>/)?.[1] || replyTo.from : '')
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError('Please fill in all fields')
      return
    }

    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to,
          subject,
          body: body.replace(/\n/g, '<br>'),
          threadId: replyTo?.threadId,
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      onSent()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            {replyTo ? 'Reply' : 'New Message'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="recipient@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="Email subject"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
              placeholder="Write your message..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}