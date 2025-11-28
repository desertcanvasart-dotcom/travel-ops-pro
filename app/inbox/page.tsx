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
  Star,
  Paperclip,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  File,
  Trash2,
  Archive,
  MoreHorizontal,
  Check,
  Circle,
  Clock,
  Filter
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
  labelIds?: string[]
}

type FilterType = 'all' | 'unread' | 'starred'
type FolderType = 'inbox' | 'sent' | 'drafts'

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
  const [filter, setFilter] = useState<FilterType>('all')
  const [folder, setFolder] = useState<FolderType>('inbox')
  const [starredEmails, setStarredEmails] = useState<Set<string>>(new Set())
  const [isFolderCollapsed, setIsFolderCollapsed] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      checkConnectionAndFetchEmails()
    }
  }, [user])

  const checkConnectionAndFetchEmails = async () => {
    try {
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
        maxResults: '50',
      })
      
      let folderQuery = query || ''
      if (folder === 'sent') {
        folderQuery = 'in:sent ' + folderQuery
      } else if (folder === 'drafts') {
        folderQuery = 'in:drafts ' + folderQuery
      }
      
      if (folderQuery) params.append('query', folderQuery.trim())

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

  useEffect(() => {
    if (isConnected) {
      fetchEmails(searchQuery)
    }
  }, [folder])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchEmails(searchQuery)
  }

  const handleRefresh = () => {
    fetchEmails(searchQuery)
  }

  const toggleStar = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setStarredEmails(prev => {
      const next = new Set(prev)
      if (next.has(emailId)) {
        next.delete(emailId)
      } else {
        next.add(emailId)
      }
      return next
    })
  }

  const decodeHtmlEntities = (text: string) => {
    return text
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const getDateGroup = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return 'This Week'
    if (diffDays < 30) return 'This Month'
    return 'Earlier'
  }

  const extractName = (from: string) => {
    const match = from.match(/^([^<]+)/)
    return match ? match[1].trim().replace(/"/g, '') : from
  }

  const extractEmail = (from: string) => {
    const match = from.match(/<(.+)>/)
    return match ? match[1] : from
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
      'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500'
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  const filteredEmails = emails.filter(email => {
    if (filter === 'unread') return email.isUnread
    if (filter === 'starred') return starredEmails.has(email.id)
    return true
  })

  const groupedEmails = filteredEmails.reduce((groups, email) => {
    const group = getDateGroup(email.date)
    if (!groups[group]) groups[group] = []
    groups[group].push(email)
    return groups
  }, {} as Record<string, Email[]>)

  const unreadCount = emails.filter(e => e.isUnread).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading your inbox...</p>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Connect Your Email</h2>
          <p className="text-sm text-gray-600 mb-6">
            Connect your Gmail account to view and send emails directly from Autoura.
          </p>
          <Link
            href="/settings/email"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Connect Gmail
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50/50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-10">
        <div className="px-4 py-3 pr-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Inbox className="w-5 h-5 text-primary-600" />
                Inbox
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h1>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="w-full h-9 pl-10 pr-4 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white outline-none transition-colors"
                />
              </div>
            </form>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowCompose(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
                Compose
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mr-6 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden pr-4">
        {/* Folders Sidebar - Collapsible */}
        <div className={`bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-300 ${isFolderCollapsed ? 'w-12' : 'w-40'}`}>
          <div className="p-2 flex flex-col h-full">
            {/* Collapse Toggle */}
            <button
              onClick={() => setIsFolderCollapsed(!isFolderCollapsed)}
              className="mb-2 p-1.5 hover:bg-gray-100 rounded-md transition-colors self-end"
            >
              {isFolderCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              )}
            </button>

            <nav className="space-y-1">
              {[
                { id: 'inbox' as FolderType, label: 'Inbox', icon: Inbox, count: unreadCount },
                { id: 'sent' as FolderType, label: 'Sent', icon: Send, count: 0 },
                { id: 'drafts' as FolderType, label: 'Drafts', icon: File, count: 0 },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFolder(item.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                    folder === item.id
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  } ${isFolderCollapsed ? 'justify-center' : ''}`}
                  title={isFolderCollapsed ? item.label : ''}
                >
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${folder === item.id ? 'text-primary-600' : 'text-gray-400'}`} />
                  {!isFolderCollapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          folder === item.id ? 'bg-primary-200 text-primary-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {item.count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </nav>

            {!isFolderCollapsed && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Filters</p>
                <nav className="space-y-0.5">
                  {[
                    { id: 'all' as FilterType, label: 'All Mail' },
                    { id: 'unread' as FilterType, label: 'Unread' },
                    { id: 'starred' as FilterType, label: 'Starred' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setFilter(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${
                        filter === item.id
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            )}
          </div>
        </div>

        {/* Email List */}
        <div className={`${selectedEmail ? 'w-2/5' : 'flex-1'} bg-white border-r border-gray-200 overflow-y-auto`}>
          {filteredEmails.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">No emails found</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
              </div>
            </div>
          ) : (
            <div>
              {Object.entries(groupedEmails).map(([group, groupEmails]) => (
                <div key={group}>
                  <div className="sticky top-0 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{group}</span>
                  </div>
                  {groupEmails.map((email) => {
                    const name = extractName(email.from)
                    const isStarred = starredEmails.has(email.id)
                    
                    return (
                      <div
                        key={email.id}
                        onClick={() => setSelectedEmail(email)}
                        className={`group px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${
                          selectedEmail?.id === email.id
                            ? 'bg-primary-50'
                            : email.isUnread
                            ? 'bg-blue-50/50 hover:bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Avatar - Smaller */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-medium ${getAvatarColor(name)}`}>
                            {getInitials(name)}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className={`text-sm truncate ${email.isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                {name}
                              </span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={(e) => toggleStar(email.id, e)}
                                  className={`p-0.5 rounded transition-colors ${
                                    isStarred ? 'text-yellow-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'
                                  }`}
                                >
                                  <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-yellow-500' : ''}`} />
                                </button>
                                <span className="text-[11px] text-gray-500">
                                  {formatDate(email.date)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {email.isUnread && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                              )}
                              <p className={`text-xs truncate ${email.isUnread ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                                {decodeHtmlEntities(email.subject || '(No subject)')}
                              </p>
                            </div>
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">
                              {decodeHtmlEntities(email.snippet)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Detail Panel */}
        {selectedEmail && (
          <div className="flex-1 bg-white overflow-y-auto">
            <div className="p-6">
              {/* Actions Bar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Archive">
                    <Archive className="w-4 h-4 text-gray-500" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="More">
                    <MoreHorizontal className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Subject */}
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {decodeHtmlEntities(selectedEmail.subject || '(No subject)')}
              </h2>
              
              {/* Sender Info */}
              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(extractName(selectedEmail.from))}`}>
                  {getInitials(extractName(selectedEmail.from))}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{extractName(selectedEmail.from)}</p>
                  <p className="text-xs text-gray-500">{extractEmail(selectedEmail.from)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{new Date(selectedEmail.date).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">To: {selectedEmail.to}</p>
                </div>
              </div>

              {/* Body */}
              <div 
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
              />

              {/* Reply Section */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowCompose(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
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
  const extractEmail = (from: string) => {
    const match = from.match(/<(.+)>/)
    return match ? match[1] : from
  }

  const [to, setTo] = useState(replyTo ? extractEmail(replyTo.from) : '')
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
          <h3 className="text-sm font-semibold text-gray-900">
            {replyTo ? 'Reply' : 'New Message'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="p-4 space-y-1">
            <div className="flex items-center border-b border-gray-100 py-2">
              <label className="w-16 text-xs font-medium text-gray-500">To</label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 text-sm outline-none"
                placeholder="recipient@example.com"
              />
            </div>

            <div className="flex items-center border-b border-gray-100 py-2">
              <label className="w-16 text-xs font-medium text-gray-500">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 text-sm outline-none"
                placeholder="Email subject"
              />
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full text-sm outline-none resize-none py-3"
              placeholder="Write your message..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Attach file">
              <Paperclip className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
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
    </div>
  )
}