'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import Link from 'next/link'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TiptapLink from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
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
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
  Minus,
  Image,
  FileText,
  FileImage,
  FileArchive,
  Signature,
  FolderPlus,
  Tag,
  MailOpen,
  Move,
  CheckSquare,
  Square
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

interface Attachment {
  filename: string
  mimeType: string
  data: string
  size: number
}

interface EmailSignature {
  id: string
  name: string
  content: string
  is_default: boolean
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
}

interface GmailLabel {
  id: string
  name: string
  type: 'system' | 'user'
  color?: {
    backgroundColor: string
    textColor: string
  }
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
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
  const [connectedEmail, setConnectedEmail] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [folder, setFolder] = useState<FolderType>('inbox')
  const [starredEmails, setStarredEmails] = useState<Set<string>>(new Set())
  const [isFolderCollapsed, setIsFolderCollapsed] = useState(false)
  
  const [customLabels, setCustomLabels] = useState<GmailLabel[]>([])
  const [showLabelModal, setShowLabelModal] = useState(false)
  const [showMoveMenu, setShowMoveMenu] = useState<string | null>(null)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      checkConnectionAndFetchEmails()
      fetchLabels()
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
      setConnectedEmail(data.email || '')
      await fetchEmails()
    } catch (err) {
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  const fetchEmails = async (query?: string, targetFolder?: FolderType) => {
    if (!user) return
    
    setRefreshing(true)
    try {
      const params = new URLSearchParams({
        userId: user.id,
        maxResults: '50',
      })
      
      const currentFolder = targetFolder || folder
      let folderQuery = query || ''

      const fetchLabels = async () => {
        if (!user) return
        try {
          const response = await fetch(`/api/gmail/labels?userId=${user.id}`)
          const data = await response.json()
          if (data.labels) {
            setCustomLabels(data.labels.filter((l: any) => l.type === 'user'))
          }
        } catch (err) {
          console.error('Error fetching labels:', err)
        }
      }
      
      // Use proper Gmail search queries
      if (currentFolder === 'sent') {
        // "from:me" gets all emails sent by the user
        folderQuery = 'from:me ' + folderQuery
      } else if (currentFolder === 'drafts') {
        folderQuery = 'in:drafts ' + folderQuery
      } else {
        // Inbox: exclude sent emails by using "in:inbox -from:me" for received only
        // Or just "in:inbox" to show all inbox items
        folderQuery = 'in:inbox -from:me ' + folderQuery
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
      fetchEmails(searchQuery, folder)
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

  const handleEmailAction = async (
    action: string, 
    messageIds?: string[], 
    labelId?: string
  ) => {
    if (!user) return
    
    const ids = messageIds || (selectedEmail ? [selectedEmail.id] : Array.from(selectedEmails))
    if (ids.length === 0) return
  
    setActionLoading(true)
    try {
      const response = await fetch('/api/gmail/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, messageIds: ids, action, labelId }),
      })
  
      const data = await response.json()
      if (data.error) throw new Error(data.error)
  
      // Refresh emails after action
      await fetchEmails()
      setSelectedEmail(null)
      setSelectedEmails(new Set())
      setShowMoveMenu(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }
  
  const handleDelete = () => handleEmailAction('delete')
  const handleArchive = () => handleEmailAction('archive')
  const handleMarkRead = () => handleEmailAction('markRead')
  const handleMarkUnread = () => handleEmailAction('markUnread')
  const handleStarEmail = () => handleEmailAction('star')
  const handleUnstarEmail = () => handleEmailAction('unstar')
  const handleMoveToLabel = (labelId: string) => {
    handleEmailAction('move', undefined, labelId)
  }
  
  const toggleEmailSelection = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEmails(prev => {
      const next = new Set(prev)
      if (next.has(emailId)) {
        next.delete(emailId)
      } else {
        next.add(emailId)
      }
      return next
    })
  }
  
  const selectAllEmails = () => {
    if (selectedEmails.size === filteredEmails.length) {
      setSelectedEmails(new Set())
    } else {
      setSelectedEmails(new Set(filteredEmails.map(e => e.id)))
    }
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

  const extractEmailAddress = (from: string) => {
    const match = from.match(/<(.+)>/)
    return match ? match[1].toLowerCase() : from.toLowerCase()
  }

  const isFromMe = (email: Email) => {
    const fromEmail = extractEmailAddress(email.from)
    return fromEmail === connectedEmail.toLowerCase()
  }

  const getDisplayName = (email: Email) => {
    if (folder === 'sent' || isFromMe(email)) {
      const toName = extractName(email.to)
      return toName || email.to
    }
    return extractName(email.from)
  }

  const getDisplayEmail = (email: Email) => {
    if (folder === 'sent' || isFromMe(email)) {
      return email.to
    }
    return email.from
  }

  const getInitials = (name: string) => {
    const cleanName = name.replace(/<[^>]+>/g, '').trim()
    const parts = cleanName.split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return cleanName.substring(0, 2).toUpperCase()
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
      'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500'
    ]
    const cleanName = name.replace(/<[^>]+>/g, '').trim()
    const index = cleanName.charCodeAt(0) % colors.length
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
                {folder === 'inbox' && <Inbox className="w-5 h-5 text-primary-600" />}
                {folder === 'sent' && <Send className="w-5 h-5 text-primary-600" />}
                {folder === 'drafts' && <File className="w-5 h-5 text-primary-600" />}
                {folder === 'inbox' ? 'Inbox' : folder === 'sent' ? 'Sent' : 'Drafts'}
                {folder === 'inbox' && unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h1>
            </div>

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

      {error && (
        <div className="mx-4 mr-6 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden pr-4">
        {/* Folders Sidebar - Collapsible */}
<div className={`bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-300 ${isFolderCollapsed ? 'w-12' : 'w-48'}`}>
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

    {/* System Folders */}
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
              {item.id === 'inbox' && item.count > 0 && (
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

    {/* Custom Labels/Folders */}
    {!isFolderCollapsed && customLabels.length > 0 && (
      <div className="mt-4 pt-3 border-t border-gray-200">
        <p className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Folders
        </p>
        <nav className="space-y-0.5">
          {customLabels.map((label) => (
            <button
              key={label.id}
              onClick={() => {
                // You can extend FolderType or handle custom label selection
                fetchEmails(`label:${label.name}`)
              }}
              className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <span className="flex-1 text-left truncate">{label.name}</span>
            </button>
          ))}
        </nav>
      </div>
    )}

    {/* Create New Folder Button */}
    {!isFolderCollapsed && (
      <button
        onClick={() => setShowLabelModal(true)}
        className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
      >
        <FolderPlus className="w-4 h-4" />
        <span>New Folder</span>
      </button>
    )}

    {/* Filters */}
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
        
  
  {/* ADD: Bulk Actions Bar */}
  {filteredEmails.length > 0 && (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
      <button
        onClick={selectAllEmails}
        className="p-1 hover:bg-gray-100 rounded transition-colors"
        title={selectedEmails.size === filteredEmails.length ? 'Deselect all' : 'Select all'}
      >
        {selectedEmails.size === filteredEmails.length && selectedEmails.size > 0 ? (
          <CheckSquare className="w-4 h-4 text-primary-600" />
        ) : (
          <Square className="w-4 h-4 text-gray-400" />
        )}
      </button>
      
      {selectedEmails.size > 0 && (
        <>
          <span className="text-xs text-gray-500">
            {selectedEmails.size} selected
          </span>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={handleArchive}
              disabled={actionLoading}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              title="Archive"
            >
              <Archive className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={handleMarkRead}
              disabled={actionLoading}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              title="Mark as read"
            >
              <MailOpen className="w-4 h-4 text-gray-500" />
            </button>
            
            {/* Move to Folder Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowMoveMenu(showMoveMenu ? null : 'bulk')}
                disabled={actionLoading || customLabels.length === 0}
                className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                title="Move to folder"
              >
                <Move className="w-4 h-4 text-gray-500" />
              </button>
              {showMoveMenu === 'bulk' && (
                <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  {customLabels.map((label) => (
                    <button
                      key={label.id}
                      onClick={() => handleMoveToLabel(label.id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Tag className="w-3.5 h-3.5 text-gray-400" />
                      {label.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )}


       {/* Email List */}
       <div className={`${selectedEmail ? 'w-2/5' : 'flex-1'} bg-white border-r border-gray-200 overflow-y-auto`}>
          
          {/* Bulk Actions Bar */}
          {filteredEmails.length > 0 && (
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
              <button
                onClick={selectAllEmails}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title={selectedEmails.size === filteredEmails.length ? 'Deselect all' : 'Select all'}
              >
                {selectedEmails.size === filteredEmails.length && selectedEmails.size > 0 ? (
                  <CheckSquare className="w-4 h-4 text-primary-600" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
              </button>
              
              {selectedEmails.size > 0 && (
                <>
                  <span className="text-xs text-gray-500">
                    {selectedEmails.size} selected
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={handleArchive}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={handleMarkRead}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title="Mark as read"
                    >
                      <MailOpen className="w-4 h-4 text-gray-500" />
                    </button>
                    
                    {/* Move to Folder Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setShowMoveMenu(showMoveMenu ? null : 'bulk')}
                        disabled={actionLoading || customLabels.length === 0}
                        className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        title="Move to folder"
                      >
                        <Move className="w-4 h-4 text-gray-500" />
                      </button>
                      {showMoveMenu === 'bulk' && (
                        <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                          {customLabels.map((label) => (
                            <button
                              key={label.id}
                              onClick={() => handleMoveToLabel(label.id)}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Tag className="w-3.5 h-3.5 text-gray-400" />
                              {label.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Email List Content */}
          {filteredEmails.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                {folder === 'sent' ? (
                  <Send className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                ) : (
                  <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                )}
                <p className="text-sm font-medium text-gray-600">
                  {folder === 'sent' ? 'No sent emails' : 'No emails found'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {folder === 'sent' ? 'Emails you send will appear here' : 'Try adjusting your search or filters'}
                </p>
              </div>
            </div>
          ) : (
            <div>
              {Object.entries(groupedEmails).map(([group, groupEmails]) => (
                <div key={group}>
                  <div className="sticky top-[41px] px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{group}</span>
                  </div>
                  {groupEmails.map((email) => {
                    const displayName = getDisplayName(email)
                    const displayEmail = getDisplayEmail(email)
                    const isSentByMe = folder === 'sent' || isFromMe(email)
                    const isStarred = starredEmails.has(email.id)
                    const isSelected = selectedEmails.has(email.id)
                    
                    return (
                      <div
                        key={email.id}
                        onClick={() => setSelectedEmail(email)}
                        className={`group px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${
                          selectedEmail?.id === email.id
                            ? 'bg-primary-50'
                            : isSelected
                            ? 'bg-blue-50'
                            : email.isUnread && !isSentByMe
                            ? 'bg-blue-50/50 hover:bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Checkbox */}
                          <button
                            onClick={(e) => toggleEmailSelection(email.id, e)}
                            className="mt-0.5 p-0.5 hover:bg-gray-200 rounded transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                            )}
                          </button>

                          {/* Avatar */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-medium ${getAvatarColor(displayEmail)}`}>
                            {getInitials(displayName)}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isSentByMe && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium flex-shrink-0">
                                    To
                                  </span>
                                )}
                                <span className={`text-sm truncate ${email.isUnread && !isSentByMe ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                  {displayName}
                                </span>
                              </div>
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
                              {email.isUnread && !isSentByMe && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                              )}
                              <p className={`text-xs truncate ${email.isUnread && !isSentByMe ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
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
        <div className="flex items-center gap-1">
          <button 
            onClick={handleArchive}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
            title="Archive"
          >
            <Archive className="w-4 h-4 text-gray-500" />
          </button>
          <button 
            onClick={handleDelete}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
          <button 
            onClick={() => selectedEmail.isUnread ? handleMarkRead() : handleMarkUnread()}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
            title={selectedEmail.isUnread ? 'Mark as read' : 'Mark as unread'}
          >
            {selectedEmail.isUnread ? (
              <MailOpen className="w-4 h-4 text-gray-500" />
            ) : (
              <Mail className="w-4 h-4 text-gray-500" />
            )}
          </button>
          
          {/* Move to Folder */}
          {customLabels.length > 0 && (
            <div className="relative">
              <button 
                onClick={() => setShowMoveMenu(showMoveMenu === 'detail' ? null : 'detail')}
                disabled={actionLoading}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                title="Move to folder"
              >
                <Move className="w-4 h-4 text-gray-500" />
              </button>
              {showMoveMenu === 'detail' && (
                <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  {customLabels.map((label) => (
                    <button
                      key={label.id}
                      onClick={() => handleMoveToLabel(label.id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Tag className="w-3.5 h-3.5 text-gray-400" />
                      {label.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
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

              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {decodeHtmlEntities(selectedEmail.subject || '(No subject)')}
              </h2>
              
              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-200">
                {folder === 'sent' || isFromMe(selectedEmail) ? (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(selectedEmail.to)}`}>
                      {getInitials(extractName(selectedEmail.to))}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded font-medium">Sent</span>
                        <p className="font-medium text-gray-900">To: {extractName(selectedEmail.to)}</p>
                      </div>
                      <p className="text-xs text-gray-500">{extractEmailAddress(selectedEmail.to)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(selectedEmail.from)}`}>
                      {getInitials(extractName(selectedEmail.from))}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{extractName(selectedEmail.from)}</p>
                      <p className="text-xs text-gray-500">{extractEmailAddress(selectedEmail.from)}</p>
                    </div>
                  </>
                )}
                <div className="text-right">
                  <p className="text-xs text-gray-500">{new Date(selectedEmail.date).toLocaleString()}</p>
                  {folder !== 'sent' && !isFromMe(selectedEmail) && (
                    <p className="text-xs text-gray-400">To: me</p>
                  )}
                </div>
              </div>

              <div 
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
              />

              <div className="mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowCompose(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  {folder === 'sent' || isFromMe(selectedEmail) ? 'Forward' : 'Reply'}
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
          replyTo={selectedEmail && folder !== 'sent' && !isFromMe(selectedEmail) ? selectedEmail : null}
          onSent={() => {
            setShowCompose(false)
            fetchEmails()
          }}
        />
      )}

       {/* 1. Create Label Modal */}
       {showLabelModal && (
        <CreateLabelModal
          onClose={() => setShowLabelModal(false)}
          userId={user?.id || ''}
          onCreated={() => {
            setShowLabelModal(false)
            fetchLabels()
          }}
        />
      )}

      {/* 2. Click outside to close move menu */}
      {showMoveMenu && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowMoveMenu(null)}
        />
      )}

    </div>
  )
}

// Toolbar Button Component
function ToolbarButton({ 
  onClick, 
  isActive = false, 
  disabled = false,
  children,
  title
}: { 
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive 
          ? 'bg-primary-100 text-primary-700' 
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.includes('pdf')) return FileText
  if (mimeType.includes('zip') || mimeType.includes('rar')) return FileArchive
  return File
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Compose Modal
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  
  const extractEmailAddr = (from: string) => {
    const match = from.match(/<(.+)>/)
    return match ? match[1] : from
  }

  const [to, setTo] = useState(replyTo ? extractEmailAddr(replyTo.from) : '')
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showSignatureDropdown, setShowSignatureDropdown] = useState(false)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary-600 underline' },
      }),
      Placeholder.configure({ placeholder: 'Write your message...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sigRes, tempRes] = await Promise.all([
          fetch(`/api/email/signatures?userId=${userId}`),
          fetch(`/api/email/templates?userId=${userId}`)
        ])
        
        const sigData = await sigRes.json()
        const tempData = await tempRes.json()
        
        if (sigData.signatures) setSignatures(sigData.signatures)
        if (tempData.templates) setTemplates(tempData.templates)
        
        const defaultSig = sigData.signatures?.find((s: EmailSignature) => s.is_default)
        if (defaultSig && editor) {
          setTimeout(() => {
            editor.commands.setContent(`<p></p><br/>${defaultSig.content}`)
          }, 100)
        }
      } catch (err) {
        console.error('Error fetching signatures/templates:', err)
      }
    }
    
    if (userId) fetchData()
  }, [userId, editor])

  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const maxSize = 25 * 1024 * 1024

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      if (file.size > maxSize) {
        setError(`File "${file.name}" is too large. Maximum size is 25MB.`)
        continue
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachments(prev => [...prev, {
          filename: file.name,
          mimeType: file.type,
          data: base64,
          size: file.size
        }])
      }
      reader.readAsDataURL(file)
    }

    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const insertSignature = (signature: EmailSignature) => {
    if (!editor) return
    const currentContent = editor.getHTML()
    editor.commands.setContent(`${currentContent}<br/>${signature.content}`)
    setShowSignatureDropdown(false)
  }

  const useTemplate = (template: EmailTemplate) => {
    setSubject(template.subject)
    if (editor) {
      editor.commands.setContent(template.content)
    }
    setShowTemplateDropdown(false)
  }

  const handleSend = async () => {
    if (!to || !subject || !editor?.getHTML()) {
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
          body: editor.getHTML(),
          threadId: replyTo?.threadId,
          attachments: attachments.length > 0 ? attachments : undefined,
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
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full transition-all duration-300 ${
        isExpanded ? 'sm:max-w-4xl sm:h-[85vh]' : 'sm:max-w-2xl'
      } max-h-[95vh] flex flex-col`}>
        
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            {replyTo ? 'Reply' : 'New Message'}
          </h3>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors hidden sm:block"
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              <Minus className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              onClick={onClose} 
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="recipient@example.com"
            />
          </div>

          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="Email subject"
            />
          </div>

          <div className="flex items-center gap-0.5 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} isActive={editor?.isActive('bold') || false} title="Bold"><Bold className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} isActive={editor?.isActive('italic') || false} title="Italic"><Italic className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleUnderline().run()} isActive={editor?.isActive('underline') || false} title="Underline"><UnderlineIcon className="w-4 h-4" /></ToolbarButton>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} isActive={editor?.isActive('bulletList') || false} title="Bullet List"><List className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} isActive={editor?.isActive('orderedList') || false} title="Numbered List"><ListOrdered className="w-4 h-4" /></ToolbarButton>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton onClick={setLink} isActive={editor?.isActive('link') || false} title="Add Link"><LinkIcon className="w-4 h-4" /></ToolbarButton>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Undo"><Undo className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Redo"><Redo className="w-4 h-4" /></ToolbarButton>

            <div className="ml-auto flex items-center gap-1">
              {templates.length > 0 && (
                <div className="relative">
                  <button onClick={() => setShowTemplateDropdown(!showTemplateDropdown)} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors">
                    <FileText className="w-3.5 h-3.5" />Templates
                  </button>
                  {showTemplateDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      {templates.map((template) => (
                        <button key={template.id} onClick={() => useTemplate(template)} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">
                          <span className="font-medium text-gray-900">{template.name}</span>
                          <span className="block text-gray-500 truncate">{template.subject}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {signatures.length > 0 && (
                <div className="relative">
                  <button onClick={() => setShowSignatureDropdown(!showSignatureDropdown)} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors">
                    <Signature className="w-3.5 h-3.5" />Signatures
                  </button>
                  {showSignatureDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      {signatures.map((sig) => (
                        <button key={sig.id} onClick={() => insertSignature(sig)} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between">
                          <span className="font-medium text-gray-900">{sig.name}</span>
                          {sig.is_default && <span className="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">Default</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <EditorContent editor={editor} className="h-full" />
          </div>

          {attachments.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-600 mb-2">Attachments ({attachments.length})</p>
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => {
                  const FileIcon = getFileIcon(file.mimeType)
                  return (
                    <div key={index} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
                      <FileIcon className="w-4 h-4 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate max-w-[150px]">{file.filename}</p>
                        <p className="text-[10px] text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                      <button onClick={() => removeAttachment(index)} className="p-1 hover:bg-gray-100 rounded">
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-1">
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar" />
            <input ref={imageInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept="image/*" />
            <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Attach file">
              <Paperclip className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Insert image">
              <Image className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Discard</button>
            <button onClick={handleSend} disabled={sending} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm">
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : <><Send className="w-4 h-4" />Send</>}
            </button>
          </div>
        </div>
      </div>

      {(showSignatureDropdown || showTemplateDropdown) && (
        <div className="fixed inset-0 z-0" onClick={() => { setShowSignatureDropdown(false); setShowTemplateDropdown(false) }} />
      )}

      <style jsx global>{`
        .ProseMirror p.is-editor-empty:first-child::before { color: #9ca3af; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
        .ProseMirror { min-height: 200px; }
        .ProseMirror:focus { outline: none; }
        .ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; }
        .ProseMirror li { margin: 0.25rem 0; }
        .ProseMirror a { color: #4a5d4a; text-decoration: underline; }
      `}</style>
    </div>
  )
}
// Create Label Modal Component
function CreateLabelModal({ 
  onClose, 
  userId, 
  onCreated 
}: { 
  onClose: () => void
  userId: string
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) return
    
    setCreating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/gmail/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: name.trim() }),
      })
      
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      
      onCreated()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Create New Folder</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              {error}
            </div>
          )}
          
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Folder Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Important Clients"
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>
        
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleCreate} 
            disabled={creating || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}