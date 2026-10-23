'use client'

import { newRequestKey, sendGuardedEmail } from '@/lib/email/send-with-guard'
import { useSendConflictConfirm } from '@/lib/email/use-send-conflict-confirm'
import { looksLikeTourUpOrder } from '@/lib/intake/tour-up-order'
import { emailOrderText } from '@/lib/intake/tup-mail'
import { stashHandoffText, encodeTextParam } from '@/lib/text-handoff'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'
import { replyAllRecipients } from '@/lib/email/reply-all'
import { printEmail } from '@/lib/email/print-email'
import { parseListUnsubscribe } from '@/lib/email/list-unsubscribe'
import { LABEL_COLORS } from '@/lib/email/label-colors'
import { useAuth } from '@/app/contexts/AuthContext'
import Link from 'next/link'
import RichTextEditor from '@/components/email/RichTextEditor'
import RecipientField from '@/components/email/RecipientField'
import SchedulePicker, { type ScheduleChoice } from '@/components/email/SchedulePicker'
import ScheduledPanel from '@/components/email/ScheduledPanel'
import RulesPanel, { type RulePrefill } from '@/components/email/RulesPanel'
import { useRole } from '@/hooks/useRole'
import { parseRecipients } from '@/lib/email/compose-mime'
// NEW IMPORTS FOR GMAIL ENHANCEMENTS
import AttachmentList, { AttachmentIndicator } from '@/components/AttachmentList'
import ClientLinkButton from '@/components/ClientLinkButton'
import { useEmailPolling, useEmailCache } from '@/lib/use-email-polling'
import { addCachedEmails, removeCachedEmails, type CachedEmail } from '@/lib/email-cache'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { replacePlaceholders, buildPlaceholderData, getPlaceholders } from '@/lib/template-placeholders'
import { TRASH_PURGE_MESSAGE } from '@/lib/email/trash-purge'
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
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  MoreHorizontal,
  Minus,
  Image,
  FileText,
  FileImage,
  FileArchive,
  Signature,
  FolderPlus,
  Tag,
  MailOpen,
  FolderInput,
  Printer,
  Filter,
  Pencil,
  Clock,
  Reply,
  ReplyAll,
  Forward,
  CheckSquare,
  Square,
  Bell,
  Users, 
  Building2, 
  Expand, 
  Maximize2,
  Sparkles,
  ChevronDown,
} from 'lucide-react'
import { useLocale } from 'next-intl'

// Email body formatter - converts ■ bullets to styled lists
function formatEmailBody(html: string): string {
  if (!html) return ''

  const lines = html.split(/<br\s*\/?>/gi)
  const processedLines: string[] = []
  let inList = false
  let listItems: string[] = []

  lines.forEach((line) => {
    const trimmed = line.trim()
    const bulletMatch = trimmed.match(/^[■●•◦▪▸►‣⁃\-–—\*]\s*(.+)/)
    
    if (bulletMatch) {
      if (!inList) {
        inList = true
        listItems = []
      }
      const content = bulletMatch[1].trim()
      // Check for Key: Value pattern
      const kvMatch = content.match(/^([^:]+):\s*(.+)$/)
      if (kvMatch) {
        listItems.push(`<strong>${kvMatch[1]}:</strong> ${kvMatch[2]}`)
      } else {
        listItems.push(content)
      }
    } else {
      if (inList) {
        processedLines.push(`<ul class="email-list">${listItems.map(i => `<li>${i}</li>`).join('')}</ul>`)
        inList = false
        listItems = []
      }
      
      if (trimmed) {
        const headerMatch = trimmed.match(/^\[([^\]]+)\]$/)
        if (headerMatch) {
          processedLines.push(`<h3 class="email-section">${headerMatch[1]}</h3>`)
        } else {
          processedLines.push(`<p>${trimmed}</p>`)
        }
      }
    }
  })

  if (inList && listItems.length > 0) {
    processedLines.push(`<ul class="email-list">${listItems.map(i => `<li>${i}</li>`).join('')}</ul>`)
  }

  return processedLines.join('')
}

// UPDATED: Email interface with attachments
interface Email {
  id: string
  threadId: string
  snippet: string
  from: string
  to: string
  cc?: string
  bcc?: string
  listUnsubscribe?: string
  subject: string
  date: string
  body: string
  isUnread: boolean
  labelIds?: string[]
  // NEW: Attachments support
  attachments?: Array<{
    id: string
    filename: string
    mimeType: string
    size: number
  }>
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
  channel?: string 
  /** 'en' | 'ja' — message_templates carry both; the picker shows one language at a time. */
  language?: string
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

// NEW: Client interface for template placeholders
interface Client {
  id: string
  name: string
  email: string
  phone?: string
}

type FilterType = 'all' | 'unread' | 'starred'
type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward' | 'draft'
interface DraftDoc {
  id: string
  threadId?: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  attachments?: Array<{ filename: string; mimeType: string; data: string; size: number }>
}

// A send waiting out its Undo window (the message is already a saved draft).
interface PendingSend {
  payload: Record<string, unknown>
  requestKey: string
  seenUpTo?: string | null
  restore: DraftDoc
}
const UNDO_SECONDS = 10
type SystemFolder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash'
// A folder the operator made is its Gmail label: `label:<label id>`.
type FolderType = SystemFolder | `label:${string}`

/** A folder is its Gmail label, listed from the mailbox itself — not the
 *  search index, which lags behind changes: a trashed email came back on the
 *  next `in:inbox` search, and a just-received one could be missing
 *  (operator, 2026-10-10). The inbox is Gmail's own inbox: its old
 *  `-from:me` also hid mail from the account's "send as" addresses. A
 *  search typed by the operator stays a search, within the folder. */
// Spam and Trash are listed too: a deleted email had nowhere to be seen or
// restored from, and one Gmail filed as spam never showed in the system at
// all (operator, 2026-10-11).
const FOLDER_LABEL: Record<SystemFolder, string> = { inbox: 'INBOX', sent: 'SENT', drafts: 'DRAFT', spam: 'SPAM', trash: 'TRASH' }
/** The folder's own label, null for a system folder. */
const customLabelOf = (folder: FolderType): string | null => (folder.startsWith('label:') ? folder.slice(6) : null)
// A made folder is listed by its label like the others. It was a search,
// `label:<name>`, inside the INBOX — so an email moved into it (which leaves
// the inbox) never showed there, and names with spaces matched nothing.
function folderListParams(folder: FolderType, query: string | undefined, params: URLSearchParams) {
  params.append('labelIds', customLabelOf(folder) ?? FOLDER_LABEL[folder as SystemFolder])
  if (query && query.trim()) params.append('query', query.trim())
}

export default function InboxPage() {
  const { user, isAgent } = useAuth()
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [showExpandedEmail, setShowExpandedEmail] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string>('')
  // A colleague's connection: the company's mailbox, not the user's own.
  const [mailboxShared, setMailboxShared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  // What the compose window is for, and the draft it was opened from.
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeDraft, setComposeDraft] = useState<DraftDoc | null>(null)
  // Undo send: the message waiting out its window, and the seconds left.
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null)
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0)
  const [sendNotice, setSendNotice] = useState<{ text: string; draft?: DraftDoc } | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingRef = useRef<PendingSend | null>(null)
  const pageConfirmSendConflict = useSendConflictConfirm()
  const [showScheduled, setShowScheduled] = useState(false)
  // The folder being edited (name, colour); null with the modal = a new one.
  const [editingLabel, setEditingLabel] = useState<GmailLabel | null>(null)
  // Rules: the panel, and what a "Filter emails like this" filled in.
  const [rulesPrefill, setRulesPrefill] = useState<RulePrefill | null | undefined>(undefined)
  const { canAccess } = useRole()
  // The open email's whole conversation (its Gmail thread), oldest first.
  const [thread, setThread] = useState<Email[] | null>(null)
  const [expandedInThread, setExpandedInThread] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [folder, setFolder] = useState<FolderType>('inbox')
  const currentLabelId = customLabelOf(folder)
  const [starredEmails, setStarredEmails] = useState<Set<string>>(new Set())
  const [isFolderCollapsed, setIsFolderCollapsed] = useState(false)
  
  const [customLabels, setCustomLabels] = useState<GmailLabel[]>([])
  const [showLabelModal, setShowLabelModal] = useState(false)
  const [showMoveMenu, setShowMoveMenu] = useState<string | null>(null)
  // The sidebar folder an email is being dragged over.
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const moveMenuRef = useRef<HTMLDivElement>(null)
  // No backdrop: the old fixed-inset-0 layer swallowed the press that closed
  // it — see lib/use-dismiss-on-outside.ts (AUT-W02). One menu, two triggers
  // (bulk bar and detail view), so the ref rides on whichever is open.
  useDismissOnOutside(showMoveMenu !== null, moveMenuRef, () => setShowMoveMenu(null))
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  // "Select all N": the action applies to every email in the folder/search,
  // not just the loaded page (the server resolves them).
  const [selectAllMatching, setSelectAllMatching] = useState(false)
  const [totalEstimate, setTotalEstimate] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // NEW: State for polling notifications
  const [showNewEmailBanner, setShowNewEmailBanner] = useState(false)
  const [newEmailCount, setNewEmailCount] = useState(0)

  // NEW: State for clients (for template placeholders)
  const [clients, setClients] = useState<Client[]>([])

  // PAGINATION STATE
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)


  // NEW: Email polling hook for real-time updates
  const {
    isPolling,
    unreadCount,
    newEmailCount: polledNewCount,
    refresh: pollRefresh,
    clearNewEmailCount,
    historyId
  } = useEmailPolling({
    userId: user?.id || null,
    enabled: isConnected && !!user,
    interval: 120000, // Poll every 2 minutes
    onNewEmails: (newEmails) => {
      console.log('New emails received:', newEmails.length)
      setNewEmailCount(prev => prev + newEmails.length)
      setShowNewEmailBanner(true)
      
      // Add new emails to the list if we're in inbox — those Gmail put IN
      // the inbox; a message just sent, or filed straight to spam, is not.
      const arrived = newEmails.filter(e => e.labelIds?.includes('INBOX'))
      if (folder === 'inbox' && arrived.length > 0) {
        // Kept in the cache too: a Refresh shows the cache first.
        if (user?.id) void addCachedEmails(user.id, 'inbox', arrived as unknown as CachedEmail[]).catch(() => {})
        setEmails(prev => {
          const newIds = new Set(arrived.map(e => e.id))
          const filtered = prev.filter(e => !newIds.has(e.id))
          return [...arrived.map(e => ({
            ...e,
            body: '',
            attachments: []
          } as Email)), ...filtered]
        })
      }
    },
    onDeletedEmails: (deletedIds) => {
      void removeCachedEmails(deletedIds).catch(() => {})
      setEmails(prev => prev.filter(e => !deletedIds.includes(e.id)))
      if (selectedEmail && deletedIds.includes(selectedEmail.id)) {
        setSelectedEmail(null)
      }
    },
    // A message moved out of the inbox (trashed, archived, spam — here or in
    // Gmail) leaves the list; one moved in (out of spam, a filter) brings a
    // refresh. These come as label changes, never as new or deleted mail.
    onLabelChanges: (changes) => {
      if (folder !== 'inbox') return
      const gone = changes
        .filter(c => c.labelsRemoved?.includes('INBOX') || c.labelsAdded?.some(l => l === 'TRASH' || l === 'SPAM'))
        .map(c => c.messageId)
      if (gone.length > 0) {
        void removeCachedEmails(gone).catch(() => {})
        setEmails(prev => prev.filter(e => !gone.includes(e.id)))
        if (selectedEmail && gone.includes(selectedEmail.id)) setSelectedEmail(null)
      }
      if (changes.some(c => c.labelsAdded?.includes('INBOX'))) fetchEmails()
    },
    onNeedRefresh: () => {
      fetchEmails()
    }
  })

  // NEW: Email caching hook
  const { getCached, cache, updateCached, removeCached, isCacheReady } = useEmailCache(user?.id || null)

  useEffect(() => {
    if (user) {
      checkConnectionAndFetchEmails()
      fetchLabels()
      fetchClients() // NEW: Fetch clients for template placeholders
    }
  }, [user])

  const checkConnectionAndFetchEmails = async () => {
    try {
      // The mailbox this user works in: their own connection, else the
      // organisation's shared one (lib/gmail-mailbox). Reading only their own
      // token showed an owner "Connect Your Gmail" while the team's mailbox
      // was connected (operator, 2026-10-10).
      const res = await fetch('/api/settings/email')
      const data = res.ok ? await res.json() : null

      if (!data?.gmail_connected) {
        setIsConnected(false)
        setLoading(false)
        return
      }

      setIsConnected(true)
      setConnectedEmail(data.gmail_email || '')
      setMailboxShared(!!data.gmail_shared)
      await fetchEmails()
    } catch (err) {
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  const fetchLabels = async () => {
    if (!user) return
    try {
      const response = await fetch(`/api/gmail/labels?userId=${user.id}`)
      const data = await response.json()
      if (data.labels) {
        setCustomLabels(data.labels.filter((l: GmailLabel) => l.type === 'user'))
      }
    } catch (err) {
      console.error('Error fetching labels:', err)
    }
  }

  // NEW: Fetch clients for template placeholder replacement
  const fetchClients = async () => {
    if (!user) return
    try {
      const response = await fetch(`/api/clients?userId=${user.id}&limit=100`)
      const data = await response.json()
      if (data.clients) {
        setClients(data.clients)
      }
    } catch (err) {
      console.error('Error fetching clients:', err)
    }
  }

  // Identifies the latest email-list request (folder switch, search, refresh,
  // background revalidate). Every response re-checks it before touching list
  // state, so a slow or stale response — e.g. the background refresh fired
  // for the PREVIOUS folder from the cache path — can't clobber the list the
  // user is currently looking at.
  const latestRequestRef = useRef(0)

  // UPDATED: fetchEmails with caching and attachment parsing - RESET pagination
  const fetchEmails = async (query?: string, targetFolder?: FolderType) => {
    if (!user) return

    const requestSeq = ++latestRequestRef.current
    setRefreshing(true)
    // Reset pagination when fetching fresh
    setNextPageToken(null)
    setHasMore(true)
    const currentFolder = targetFolder || folder

    try {
      // TRY CACHE FIRST (if no search query)
      if (!query && isCacheReady) {
        const cached = await getCached(currentFolder, { limit: 25 })
        if (requestSeq !== latestRequestRef.current) return // superseded while reading cache
        if (cached.fromCache && !cached.isStale) {
          console.log('Using cached emails for', currentFolder)
          setEmails(cached.emails as Email[])
          setRefreshing(false)
          // Still fetch fresh in background (same requestSeq: a later folder
          // switch/search bumps the ref and this background result is dropped)
          fetchFreshEmails(query, currentFolder, true, undefined, requestSeq)
          return
        }
      }

      await fetchFreshEmails(query, currentFolder, false, undefined, requestSeq)
    } catch (err: any) {
      if (requestSeq !== latestRequestRef.current) return
      setError(err.message)
      setRefreshing(false)
    }
  }

  // UPDATED: Helper function to fetch fresh emails from API with pagination support
  const fetchFreshEmails = async (query?: string, currentFolder?: FolderType, isBackground = false, pageToken?: string, seq?: number) => {
    if (!user) return

    const requestSeq = seq ?? ++latestRequestRef.current

    try {
      const params = new URLSearchParams({
        userId: user.id,
        maxResults: '25', // Reduced from 50 for faster initial load
      })
      
      // Add page token for pagination
      if (pageToken) {
        params.append('pageToken', pageToken)
      }
      
      const folderToUse = currentFolder || folder
      folderListParams(folderToUse, query, params)

      const response = await fetch(`/api/gmail/emails?${params}`)
      const data = await response.json()

      // A newer request (folder switch, search, refresh) started while this
      // one was in flight — drop this response, foreground or background.
      if (requestSeq !== latestRequestRef.current) return

      if (data.error) {
        throw new Error(data.error)
      }

      // Store next page token for pagination
      setNextPageToken(data.nextPageToken || null)
      setTotalEstimate(typeof data.resultSizeEstimate === 'number' ? data.resultSizeEstimate : null)
      setSelectAllMatching(false)
      setHasMore(!!data.nextPageToken)

      // PARSE ATTACHMENTS from each email
      setEmails(data.messages || [])

      // Update starred set
      const starred = new Set<string>()
      const messagesForStarred: Email[] = data.messages || []
      messagesForStarred.forEach((email: Email) => {
        if (email.labelIds?.includes('STARRED')) {
          starred.add(email.id)
        }
      })
      setStarredEmails(starred)

      // CACHE THE RESULTS
      if (isCacheReady && !query && !pageToken) {
        await cache(folderToUse, data.messages, historyId || undefined)
      }

      setError(null)
    } catch (err: any) {
      if (requestSeq !== latestRequestRef.current) return
      if (!isBackground) {
        setError(err.message)
      }
    } finally {
      if (!isBackground && requestSeq === latestRequestRef.current) {
        setRefreshing(false)
      }
    }
  }

  // NEW: Load more emails function for pagination
  const loadMoreEmails = async () => {
    if (!user || !nextPageToken || loadingMore) return

    // Snapshot the current request id — if a folder switch/search happens
    // while this page loads, drop the append instead of mixing folders.
    const requestSeq = latestRequestRef.current
    setLoadingMore(true)

    try {
      const params = new URLSearchParams({
        userId: user.id,
        maxResults: '25',
        pageToken: nextPageToken,
      })
      
      folderListParams(folder, searchQuery, params)

      const response = await fetch(`/api/gmail/emails?${params}`)
      const data = await response.json()

      // A newer list request replaced this page's context — drop the append
      if (requestSeq !== latestRequestRef.current) return

      if (data.error) {
        throw new Error(data.error)
      }

      // Store next page token
      setNextPageToken(data.nextPageToken || null)
      setHasMore(!!data.nextPageToken)

      // APPEND new emails instead of replacing
      setEmails(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        const newEmails = (data.messages || []).filter((e: Email) => !existingIds.has(e.id))
        return [...prev, ...newEmails]
      })
      
      // Update starred set
      const messagesForStarred: Email[] = data.messages || []
      messagesForStarred.forEach((email: Email) => {
        if (email.labelIds?.includes('STARRED')) {
          setStarredEmails(prev => new Set([...prev, email.id]))
        }
      })

      setError(null)
    } catch (err: any) {
      if (requestSeq === latestRequestRef.current) {
        setError(err.message)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  // NEW: Helper to parse attachments from Gmail API response
  const parseAttachments = (email: any): Email['attachments'] => {
    const attachments: Email['attachments'] = []
    
    const processPart = (part: any) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0
        })
      }
      if (part.parts) {
        part.parts.forEach(processPart)
      }
    }
    
    // Check different possible locations for parts
    if (email.payload?.parts) {
      email.payload.parts.forEach(processPart)
    } else if (email.parts) {
      email.parts.forEach(processPart)
    }
    
    return attachments
  }

  // NEW: Helper to extract email address from "Name <email>" format
  const extractEmailAddress = (fromString: string): string => {
    const match = fromString.match(/<(.+)>/)
    return match ? match[1] : fromString
  }
  const handleParseEmail = async () => {
    if (!selectedEmail) return
    
    const senderName = extractName(selectedEmail.from)
    const bodyText = selectedEmail.body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    
    const conversationText = `From: ${senderName}
Subject: ${selectedEmail.subject}
Date: ${new Date(selectedEmail.date).toLocaleString()}

${bodyText}`
    
    const senderEmail = extractEmailAddress(selectedEmail.from)
    const matchedClient = clients.find(c => c.email?.toLowerCase() === senderEmail.toLowerCase())

    // An order from the website's form is a document, not a conversation:
    // it goes to the order intake, which reads it label by label and builds
    // the quote from the ready-made programme it names. Line breaks are the
    // form's structure (the T-UP notification is "●label：value" per line),
    // so it is recognised and handed over with them kept.
    const bodyLines = emailOrderText(null, selectedEmail.body).trim()
    if (looksLikeTourUpOrder(bodyLines)) {
      // Taken in already by the scheduled intake: open what it became.
      try {
        const r = await fetch(`/api/intake/web-orders?messageId=${encodeURIComponent(selectedEmail.id)}`)
        const j = await r.json()
        if (j.success && j.intake) {
          window.location.href = j.intake.quote ? `/b2b/quotes/${j.intake.quote.id}` : `/intake/order?intake=${j.intake.id}`
          return
        }
      } catch { /* not taken in yet: read it here */ }
      const orderKey = stashHandoffText(bodyLines)
      window.location.href = orderKey
        ? `/intake/order?textKey=${orderKey}`
        : `/intake/order?text=${encodeURIComponent(encodeTextParam(bodyLines))}`
      return
    }
    
    // The email travels in sessionStorage, not the URL. Base64 of a long
    // Japanese email overflowed the request line and the browser showed
    // "HTTP ERROR 431" before anything reached the app — see lib/text-handoff.
    const conversationKey = stashHandoffText(conversationText)
    const params = new URLSearchParams(
      conversationKey
        ? { conversationKey, source: 'email' }
        : { conversation: encodeTextParam(conversationText), source: 'email', encoded: 'base64' }
    )
    
    if (matchedClient) {
      params.set('clientId', matchedClient.id)
      if (matchedClient.name) params.set('clientName', matchedClient.name)
      if (matchedClient.phone) params.set('phone', matchedClient.phone)
    }
    if (senderEmail) params.set('email', senderEmail)

    // Straight into the pricing module. An email that is a travel request is
    // on its way to a quote, and the grid parses the conversation itself — so
    // the separate parser step in between was a page the operator passed
    // through on the way to where they were going. (This is the same
    // destination the unified inbox's own Parse button uses.)
    window.location.href = `/pricing-grid?${params.toString()}`
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

  // The open email's conversation. Loaded when another thread is opened; a
  // failure leaves just the email itself, as before.
  useEffect(() => {
    setThread(null)
    setExpandedInThread(new Set())
    const threadId = selectedEmail?.threadId
    if (!threadId || folder === 'drafts') return
    let cancelled = false
    fetch(`/api/gmail/threads?id=${encodeURIComponent(threadId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data && Array.isArray(data.messages)) setThread(data.messages as Email[])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedEmail?.threadId, folder])

  // The rest of the conversation, around the open email.
  const threadIndex = thread && selectedEmail ? thread.findIndex(m => m.id === selectedEmail.id) : -1
  const earlierInThread = thread && threadIndex > 0 ? thread.slice(0, threadIndex) : []
  const laterInThread = thread && threadIndex >= 0 ? thread.slice(threadIndex + 1) : []

  // One other message of the conversation: a line until opened, as in Gmail.
  const renderThreadMessage = (message: Email) => {
    const open = expandedInThread.has(message.id)
    const toggle = () => setExpandedInThread(prev => {
      const next = new Set(prev)
      if (next.has(message.id)) next.delete(message.id)
      else next.add(message.id)
      return next
    })
    return (
      <div key={message.id} className="border border-gray-200 rounded-lg">
        <button onClick={toggle} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 rounded-lg">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0 ${getAvatarColor(message.from)}`}>
            {getInitials(extractName(message.from))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{extractName(message.from)}</p>
            {!open && <p className="text-xs text-gray-500 truncate">{decodeHtmlEntities(message.snippet || '')}</p>}
          </div>
          <span className="text-[11px] text-gray-400 flex-shrink-0">{new Date(message.date).toLocaleString()}</span>
        </button>
        {open && (
          <div className="px-3 pb-3">
            <p className="text-[11px] text-gray-500 mb-2 break-words">
              To: {message.to}{message.cc ? ` · Cc: ${message.cc}` : ''}
            </p>
            <div
              className="email-body-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatEmailBody(message.body)) }}
            />
            {message.attachments && message.attachments.length > 0 && (
              <AttachmentList attachments={message.attachments} messageId={message.id} userId={user!.id} />
            )}
          </div>
        )}
      </div>
    )
  }

  // ---- Undo send ----
  const stopPendingTimer = () => {
    if (pendingTimerRef.current) clearInterval(pendingTimerRef.current)
    pendingTimerRef.current = null
  }

  const fireSend = async (job: PendingSend) => {
    if (pendingRef.current === job) {
      stopPendingTimer()
      pendingRef.current = null
      setPendingSend(null)
    }
    setSendNotice({ text: 'Sending…' })
    const sent = await sendGuardedEmail(job.payload, {
      requestKey: job.requestKey,
      seenUpTo: job.seenUpTo,
      confirmConflict: pageConfirmSendConflict,
    })
    if (sent.ok) {
      setSendNotice({ text: 'Message sent' })
      setTimeout(() => setSendNotice(n => (n?.text === 'Message sent' ? null : n)), 4000)
      fetchEmails()
      return
    }
    // Not sent (refused, cancelled at the duplicate question, or an error):
    // it is still the saved draft.
    setSendNotice({
      text: sent.cancelled ? 'Not sent — kept in Drafts' : `Not sent: ${sent.error || 'error'} — kept in Drafts`,
      draft: job.restore,
    })
  }

  const queueSend = (job: PendingSend) => {
    // A message still waiting goes now: one Undo bar at a time, and the
    // earlier message is never left unsent.
    if (pendingRef.current) fireSend(pendingRef.current)
    stopPendingTimer()
    setSendNotice(null)
    pendingRef.current = job
    setPendingSend(job)
    setUndoSecondsLeft(UNDO_SECONDS)
    let left = UNDO_SECONDS
    pendingTimerRef.current = setInterval(() => {
      left -= 1
      setUndoSecondsLeft(left)
      if (left <= 0) fireSend(job)
    }, 1000)
  }

  // Undo: back to the compose, as it was (it is a saved draft).
  const undoSend = () => {
    const job = pendingRef.current
    if (!job) return
    stopPendingTimer()
    pendingRef.current = null
    setPendingSend(null)
    reopenDraft(job.restore)
  }

  const openDraftById = async (draftId: string) => {
    try {
      const res = await fetch(`/api/gmail/drafts?id=${encodeURIComponent(draftId)}`)
      const data = await res.json()
      if (!res.ok || !data.draft) throw new Error(data.error || 'Draft not found')
      setShowScheduled(false)
      reopenDraft(data.draft as DraftDoc)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const reopenDraft = (draft: DraftDoc) => {
    setSendNotice(null)
    setComposeDraft(draft)
    setComposeMode('draft')
    setShowCompose(true)
  }

  // Leaving the page during the Undo window: warn — the message would stay
  // in Drafts unsent.
  useEffect(() => {
    if (!pendingSend) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pendingSend])

  useEffect(() => () => stopPendingTimer(), [])

  const openCompose = (mode: ComposeMode) => {
    setComposeDraft(null)
    setComposeMode(mode)
    setShowExpandedEmail(false)
    setShowCompose(true)
  }

  // A draft in the Drafts folder opens in compose, to finish and send.
  const openDraft = async (email: Email) => {
    try {
      const res = await fetch(`/api/gmail/drafts?messageId=${encodeURIComponent(email.id)}`)
      const data = await res.json()
      if (!res.ok || !data.draft) throw new Error(data.error || 'Draft not found')
      setComposeDraft(data.draft as DraftDoc)
      setComposeMode('draft')
      setShowCompose(true)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Reply all only when there is someone besides the sender to answer.
  const canReplyAll = (email: Email) =>
    replyAllRecipients(email, connectedEmail ? [connectedEmail] : []).cc.length > 0

  const renderReplyButtons = (email: Email) => {
    const button = 'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors'
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => openCompose('reply')} className={`${button} text-white bg-primary-600 hover:bg-primary-700 shadow-sm`}>
          <Reply className="w-4 h-4" />
          Reply
        </button>
        {canReplyAll(email) && (
          <button onClick={() => openCompose('replyAll')} className={`${button} text-gray-700 bg-white border border-gray-300 hover:bg-gray-50`}>
            <ReplyAll className="w-4 h-4" />
            Reply all
          </button>
        )}
        <button onClick={() => openCompose('forward')} className={`${button} text-gray-700 bg-white border border-gray-300 hover:bg-gray-50`}>
          <Forward className="w-4 h-4" />
          Forward
        </button>
      </div>
    )
  }

  const handleRefresh = () => {
    setShowNewEmailBanner(false)
    setNewEmailCount(0)
    clearNewEmailCount()
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

  // The search behind "Select all N": the typed search plus the Unread /
  // Starred filter, as Gmail search terms.
  const matchQuery = () => [
    searchQuery.trim(),
    filter === 'unread' ? 'is:unread' : filter === 'starred' ? 'is:starred' : '',
  ].filter(Boolean).join(' ')

  const handleEmailAction = async (
    action: string, 
    messageIds?: string[], 
    labelId?: string
  ) => {
    if (!user) return
    
    const ids = messageIds || (selectedEmail ? [selectedEmail.id] : Array.from(selectedEmails))
    if (ids.length === 0) return

    // "Select all N": the whole folder/search, resolved on the server. Asked
    // first — it reaches emails nobody has on screen.
    const allMatching = selectAllMatching && !selectedEmail
    if (allMatching) {
      const verb: Record<string, string> = {
        delete: 'Move to Trash', archive: 'Archive', move: 'Move', markRead: 'Mark as read', markUnread: 'Mark as unread',
        spam: 'Report as spam', notSpam: 'Mark as not spam', restore: 'Restore', star: 'Star', unstar: 'Unstar',
      }
      const about = totalEstimate ? `about ${totalEstimate.toLocaleString()}` : 'all'
      if (!window.confirm(`${verb[action] ?? action}: ${about} emails in this ${searchQuery ? 'search' : 'folder'}?`)) return
    }
  
    setActionLoading(true)
    try {
      const response = await fetch('/api/gmail/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // A move from a made folder takes the email out of it (not the inbox).
        body: JSON.stringify({
          userId: user.id, action, labelId,
          ...(allMatching
            ? { match: { labelIds: [currentLabelId ?? FOLDER_LABEL[folder as SystemFolder]], query: matchQuery() } }
            : { messageIds: ids }),
          ...(action === 'move' && currentLabelId ? { fromLabelId: currentLabelId } : {}),
        }),
      })
  
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || `The action failed (${response.status})`)
      if (allMatching) {
        setSelectAllMatching(false)
        setSendNotice({ text: `Done: ${Number(data.count || 0).toLocaleString()} emails${data.capped ? ' (the first 5,000 — run it again for the rest)' : ''}` })
      }

      // Out of this folder now: off the list at once, not on the next fetch.
      const leavesFolder = ['delete', 'archive', 'move', 'restore', 'notSpam', 'spam'].includes(action)
      if (leavesFolder) {
        setEmails(prev => prev.filter(e => !ids.includes(e.id)))
      }

      // UPDATE CACHE after action
      if (isCacheReady) {
        if (leavesFolder) {
          await removeCached(ids)
        } else if (action === 'markRead') {
          for (const id of ids) {
            await updateCached(id, { isUnread: false })
          }
        } else if (action === 'markUnread') {
          for (const id of ids) {
            await updateCached(id, { isUnread: true })
          }
        }
      }
  
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
  
  // In Trash, Delete says how emails leave it — Gmail empties Trash itself after
  // 30 days; the app's Gmail access cannot delete for good — and the archive
  // button restores; in Spam, it is "Not spam".
  const handleDelete = () => {
    if (folder === 'trash') {
      setSendNotice({ text: TRASH_PURGE_MESSAGE })
      return
    }
    return handleEmailAction('delete')
  }
  // In a made folder the archive button puts the email back in the inbox.
  const handleArchive = () =>
    currentLabelId
      ? handleMoveToLabel('INBOX')
      : handleEmailAction(folder === 'trash' ? 'restore' : folder === 'spam' ? 'notSpam' : 'archive')
  const archiveLabel = currentLabelId ? 'Move to Inbox' : folder === 'trash' ? 'Restore' : folder === 'spam' ? 'Not spam' : 'Archive'
  const ArchiveIcon = currentLabelId ? Inbox : folder === 'trash' ? RotateCcw : folder === 'spam' ? ShieldCheck : Archive
  const deleteLabel = folder === 'trash' ? 'Deleted automatically after 30 days' : 'Delete'
  // Print the open email — the whole conversation when it has one.
  const handlePrint = () => {
    if (!selectedEmail) return
    const messages = thread && thread.length > 0 ? thread : [selectedEmail]
    const ok = printEmail(selectedEmail.subject, messages.map(m => ({
      from: m.from, to: m.to, cc: m.cc, date: new Date(m.date).toLocaleString(),
      bodyHtml: sanitizeHtml(formatEmailBody(m.body)),
    })))
    if (!ok) setError('The print window was blocked — allow pop-ups for this site and try again.')
  }
  // Unsubscribe from a newsletter: its link opens in this browser; a mailto
  // is sent from the mailbox after asking.
  const handleUnsubscribe = async (email: Email) => {
    const how = parseListUnsubscribe(email.listUnsubscribe)
    if (!how) return
    if (how.url) {
      window.open(how.url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!how.mailto) return
    if (!window.confirm(`Unsubscribe by sending an email to ${how.mailto.to}?`)) return
    const sent = await sendGuardedEmail(
      { userId: user?.id, to: how.mailto.to, subject: how.mailto.subject, body: escapeHtml(how.mailto.body) },
      { requestKey: newRequestKey(), confirmConflict: pageConfirmSendConflict },
    )
    setSendNotice({ text: sent.ok ? `Unsubscribe request sent to ${how.mailto.to}` : `Could not unsubscribe: ${sent.ok ? '' : sent.error}` })
  }
  const handleMarkRead = () => handleEmailAction('markRead')
  // Report spam: from the inbox and made folders (Spam has "Not spam").
  const canReportSpam = folder === 'inbox' || currentLabelId !== null
  const handleReportSpam = (ids?: string[]) => handleEmailAction('spam', ids)
  const handleMarkUnread = () => handleEmailAction('markUnread')
  const handleStarEmail = () => handleEmailAction('star')
  const handleUnstarEmail = () => handleEmailAction('unstar')
  // `ids`: the ticked emails from the list toolbar. Without it an open email
  // took precedence, so a bulk move moved only the email being read.
  const handleMoveToLabel = (labelId: string, ids?: string[]) => {
    handleEmailAction('move', ids, labelId)
  }

  // Moving is from the inbox or a made folder; Sent, Drafts, Spam and Trash
  // have their own actions.
  const canMove = folder === 'inbox' || currentLabelId !== null
  const moveTargets: Array<{ id: string; name: string }> = [
    ...(currentLabelId ? [{ id: 'INBOX', name: 'Inbox' }] : []),
    ...customLabels.filter(l => l.id !== currentLabelId).map(l => ({ id: l.id, name: l.name })),
  ]
  const renderMoveMenu = (where: 'bulk' | 'detail', ids?: string[]) => (
    <div className="relative" ref={showMoveMenu === where ? moveMenuRef : undefined}>
      <button
        onClick={() => setShowMoveMenu(showMoveMenu === where ? null : where)}
        disabled={actionLoading}
        className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 text-xs text-gray-600"
        title="Move to folder"
      >
        <FolderInput className="w-4 h-4 text-gray-500" />
        <span>Move to</span>
      </button>
      {showMoveMenu === where && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
          {moveTargets.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-400">No folders yet</p>
          )}
          {moveTargets.map((target) => (
            <button
              key={target.id}
              onClick={() => handleMoveToLabel(target.id, ids)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
            >
              {target.id === 'INBOX' ? <Inbox className="w-3.5 h-3.5 text-gray-400" /> : <Tag className="w-3.5 h-3.5 text-gray-400" />}
              <span className="truncate">{target.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => { setShowMoveMenu(null); setEditingLabel(null); setShowLabelModal(true) }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-600"
          >
            <FolderPlus className="w-3.5 h-3.5 text-gray-400" />
            New folder…
          </button>
        </div>
      )}
    </div>
  )

  // Rename / recolour: the folder window, filled in.
  const renameFolder = (label: GmailLabel) => {
    setEditingLabel(label)
    setShowLabelModal(true)
  }

  // Its emails go back to the Inbox (the server does it before deleting).
  const deleteFolder = async (label: GmailLabel) => {
    if (!window.confirm(`Delete the folder "${label.name}"? Its emails go back to the Inbox.`)) return
    try {
      const res = await fetch('/api/gmail/labels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId: label.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error || 'The folder could not be deleted')
      if (currentLabelId === label.id) setFolder('inbox')
      await fetchLabels()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Drag emails from the list onto a folder (or the inbox) in the sidebar.
  const DRAG_TYPE = 'application/x-autoura-emails'
  const dragHandlers = (targetId: string) => {
    const isHere = targetId === (currentLabelId ?? (folder === 'inbox' ? 'INBOX' : null))
    return {
      onDragOver: (e: React.DragEvent) => {
        if (isHere || !e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (dropTarget !== targetId) setDropTarget(targetId)
      },
      onDragLeave: () => setDropTarget(prev => (prev === targetId ? null : prev)),
      onDrop: (e: React.DragEvent) => {
        setDropTarget(null)
        if (isHere) return
        e.preventDefault()
        let ids: string[] = []
        try { ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '[]') } catch { ids = [] }
        if (ids.length > 0) handleMoveToLabel(targetId, ids)
      },
    }
  }
  
  const toggleEmailSelection = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectAllMatching(false)
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
    setSelectAllMatching(false)
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

  // Filtering and Grouping Logic
  const filteredEmails = emails.filter(email => {
    if (filter === 'unread') return email.isUnread
    if (filter === 'starred') return starredEmails.has(email.id)
    return true
  })

  const groupEmailsByDate = (emails: Email[]) => {
    const groups: Record<string, Email[]> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    emails.forEach(email => {
      const emailDate = new Date(email.date)
      emailDate.setHours(0, 0, 0, 0)
      
      let group: string
      if (emailDate.getTime() === today.getTime()) {
        group = 'Today'
      } else if (emailDate.getTime() === yesterday.getTime()) {
        group = 'Yesterday'
      } else if (emailDate > weekAgo) {
        group = 'This Week'
      } else {
        group = 'Earlier'
      }

      if (!groups[group]) groups[group] = []
      groups[group].push(email)
    })

    return groups
  }

  const groupedEmails = groupEmailsByDate(filteredEmails)

  // Helper functions
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const extractName = (emailString: string) => {
    const match = emailString.match(/^"?([^"<]+)"?\s*</)
    return match ? match[1].trim() : emailString.split('@')[0]
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (email: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
      'bg-pink-500', 'bg-indigo-500', 'bg-red-500', 'bg-teal-500'
    ]
    const hash = email.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  const isFromMe = (email: Email) => {
    return connectedEmail && email.from.toLowerCase().includes(connectedEmail.toLowerCase())
  }

  const getDisplayName = (email: Email) => {
    if (folder === 'sent' || isFromMe(email)) {
      return extractName(email.to)
    }
    return extractName(email.from)
  }

  const getDisplayEmail = (email: Email) => {
    if (folder === 'sent' || isFromMe(email)) {
      return email.to
    }
    return email.from
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <Mail className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Gmail</h2>
          <p className="text-gray-500 mb-6">
            Connect your Gmail account to send and receive emails directly from Autoura.
          </p>
          {/* Settings is admin / manager only: the button sent an agent to a
              page that bounced them to the dashboard. */}
          {isAgent ? (
            <p className="text-sm text-gray-600" data-testid="inbox-connect-ask">
              Ask an admin or manager to connect Gmail in Settings › Email.
            </p>
          ) : (
            <Link
              href="/settings/email"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Connect Gmail
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50/50">
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary-600" />
                Inbox
                {/* NEW: Unread count badge */}
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h1>
              {/* Which mailbox this is — in a company with several connections,
                  or for a person in two companies, it is not always your own. */}
              {connectedEmail && (
                <span className="hidden sm:inline text-xs text-gray-500 truncate max-w-[16rem]" title={connectedEmail}>
                  Mailbox: {connectedEmail}{mailboxShared ? ' (shared)' : ''}
                </span>
              )}
            </div>

            <form onSubmit={handleSearch} className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="w-full h-9 pl-3 pr-4 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white outline-none transition-colors"
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
                onClick={() => openCompose('new')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
                Compose
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* NEW: New Email Notification Banner */}
      {showNewEmailBanner && newEmailCount > 0 && (
        <div className="bg-primary-50 border-b border-primary-100 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary-600" />
            <span className="text-sm text-primary-700">
              {newEmailCount} new email{newEmailCount > 1 ? 's' : ''} received
            </span>
          </div>
          <button
            onClick={handleRefresh}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Refresh to view
          </button>
        </div>
      )}

      {error && (
        <div className="mx-4 mr-6 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex-shrink-0">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden pr-4">
        {/* Folders Sidebar */}
        <div className={`bg-white border-r border-gray-200 flex-shrink-0 transition-all duration-300 ${isFolderCollapsed ? 'w-12' : 'w-48'}`}>
          <div className="p-2 flex flex-col h-full">
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
                { id: 'spam' as FolderType, label: 'Spam', icon: ShieldAlert, count: 0 },
                { id: 'trash' as FolderType, label: 'Trash', icon: Trash2, count: 0 },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFolder(item.id)}
                  // From a made folder, an email dragged onto Inbox goes back.
                  {...(item.id === 'inbox' ? dragHandlers('INBOX') : {})}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                    item.id === 'inbox' && dropTarget === 'INBOX'
                      ? 'bg-primary-100 ring-1 ring-primary-300 text-primary-800'
                      : folder === item.id
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

            {/* Emails waiting to be sent later — kept by the app, not a Gmail folder. */}
            <button
              onClick={() => setShowScheduled(true)}
              className={`mt-1 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-colors ${isFolderCollapsed ? 'justify-center' : ''}`}
              title={isFolderCollapsed ? 'Scheduled' : ''}
            >
              <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />
              {!isFolderCollapsed && <span className="flex-1 text-left">Scheduled</span>}
            </button>
            <button
              onClick={() => setRulesPrefill(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-colors ${isFolderCollapsed ? 'justify-center' : ''}`}
              title={isFolderCollapsed ? 'Rules' : ''}
            >
              <Filter className="w-4 h-4 flex-shrink-0 text-gray-400" />
              {!isFolderCollapsed && <span className="flex-1 text-left">Rules</span>}
            </button>

            {!isFolderCollapsed && customLabels.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Folders
                </p>
                <nav className="space-y-0.5">
                  {customLabels.map((label) => (
                    <div key={label.id} className="group/folder relative">
                      <button
                        onClick={() => setFolder(`label:${label.id}`)}
                        {...dragHandlers(label.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1 pr-12 rounded-md text-xs transition-colors ${
                          dropTarget === label.id
                            ? 'bg-primary-100 ring-1 ring-primary-300 text-primary-800'
                            : currentLabelId === label.id
                              ? 'bg-primary-50 text-primary-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Tag
                          className={`w-3.5 h-3.5 ${label.color ? '' : currentLabelId === label.id ? 'text-primary-600' : 'text-gray-400'}`}
                          style={label.color ? { color: label.color.backgroundColor } : undefined}
                        />
                        <span className="flex-1 text-left truncate">{label.name}</span>
                      </button>
                      {/* Rename / delete, on hover (and always for the open folder). */}
                      <div className={`absolute right-1 top-1/2 -translate-y-1/2 items-center gap-0.5 ${currentLabelId === label.id ? 'flex' : 'hidden group-hover/folder:flex'}`}>
                        <button onClick={() => renameFolder(label)} className="p-0.5 rounded hover:bg-gray-200" title="Rename or recolour folder">
                          <Pencil className="w-3 h-3 text-gray-500" />
                        </button>
                        <button onClick={() => deleteFolder(label)} className="p-0.5 rounded hover:bg-gray-200" title="Delete folder">
                          <Trash2 className="w-3 h-3 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </nav>
              </div>
            )}

            {!isFolderCollapsed && (
              <button
                onClick={() => { setEditingLabel(null); setShowLabelModal(true) }}
                className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                <span>New Folder</span>
              </button>
            )}

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
                    {selectAllMatching ? `All${totalEstimate ? ` ~${totalEstimate.toLocaleString()}` : ''}` : selectedEmails.size} selected
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={handleArchive}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title={archiveLabel}
                    >
                      <ArchiveIcon className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title={deleteLabel}
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
                    {canReportSpam && (
                      <button
                        onClick={() => handleReportSpam(Array.from(selectedEmails))}
                        disabled={actionLoading}
                        className="p-1.5 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        title="Report spam"
                      >
                        <ShieldAlert className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                    
                    {canMove && renderMoveMenu('bulk', Array.from(selectedEmails))}
                  </div>
                </>
              )}
              
              {/* Email count indicator */}
              {selectedEmails.size === 0 && (
                <span className="text-xs text-gray-400 ml-auto">
                  {filteredEmails.length} emails
                </span>
              )}
            </div>
          )}

          {/* "Select all N": the page is all selected and there is more. */}
          {selectedEmails.size > 0 && selectedEmails.size === filteredEmails.length && !!nextPageToken && (
            <div className="px-3 py-1.5 text-xs text-center bg-primary-50 border-b border-primary-100 text-gray-700">
              {selectAllMatching ? (
                <>
                  All {totalEstimate ? `about ${totalEstimate.toLocaleString()} ` : ''}emails in this {searchQuery ? 'search' : 'folder'} are selected.{' '}
                  <button onClick={() => { setSelectAllMatching(false); setSelectedEmails(new Set()) }} className="font-medium text-primary-700 hover:underline">Clear selection</button>
                </>
              ) : (
                <>
                  All {selectedEmails.size} on this page are selected.{' '}
                  <button onClick={() => { setSelectAllMatching(true); setSelectedEmail(null) }} className="font-medium text-primary-700 hover:underline">
                    Select all {totalEstimate ? `about ${totalEstimate.toLocaleString()} ` : ''}emails in this {searchQuery ? 'search' : 'folder'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Email List Content */}
          {filteredEmails.length === 0 && !refreshing ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                {folder === 'sent' ? (
                  <Send className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                ) : (
                  <Inbox className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                )}
                <p className="text-sm font-medium text-gray-600">
                  {folder === 'sent' ? 'No sent emails' : folder === 'trash' ? 'Trash is empty' : folder === 'spam' ? 'No spam' : 'No emails found'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {folder === 'sent'
                    ? 'Emails you send will appear here'
                    : folder === 'trash'
                      ? 'Deleted emails stay here for 30 days and can be restored'
                      : folder === 'spam'
                        ? 'Emails Gmail marks as spam appear here'
                        : 'Try adjusting your search or filters'}
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
                        // A draft opens in compose, to finish and send.
                        onClick={() => (folder === 'drafts' ? openDraft(email) : setSelectedEmail(email))}
                        // Drag onto a folder in the sidebar: the ticked emails
                        // when this one is ticked, else just this one.
                        draggable={canMove}
                        onDragStart={(e) => {
                          const ids = isSelected ? Array.from(selectedEmails) : [email.id]
                          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => setDropTarget(null)}
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

                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-medium ${getAvatarColor(displayEmail)}`}>
                            {getInitials(displayName)}
                          </div>
                          
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
                                {/* NEW: Attachment indicator in email list */}
                                {email.attachments && email.attachments.length > 0 && (
                                  <AttachmentIndicator count={email.attachments.length} />
                                )}
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
                              {/* Its folders, as Gmail shows labels — not the one being viewed. */}
                              {customLabels
                                .filter(l => l.id !== currentLabelId && email.labelIds?.includes(l.id))
                                .slice(0, 2)
                                .map(l => (
                                  <span
                                    key={l.id}
                                    className="px-1.5 py-px rounded text-[10px] leading-4 flex-shrink-0 max-w-[90px] truncate"
                                    style={l.color
                                      ? { backgroundColor: l.color.backgroundColor, color: l.color.textColor }
                                      : { backgroundColor: '#f3f4f6', color: '#4b5563' }}
                                  >
                                    {l.name}
                                  </span>
                                ))}
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
              
              {/* LOAD MORE BUTTON */}
              {hasMore && (
                <div className="p-4 border-t border-gray-100">
                  <button
                    onClick={loadMoreEmails}
                    disabled={loadingMore}
                    className="w-full py-3 px-4 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading more emails...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Load More Emails
                      </>
                    )}
                  </button>
                </div>
              )}
              
              {/* End of list indicator */}
              {!hasMore && filteredEmails.length > 0 && (
                <div className="p-4 text-center text-xs text-gray-400">
                  You've reached the end • {filteredEmails.length} emails loaded
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email Detail Panel */}
        {selectedEmail && (
          <div className="flex-1 bg-white overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-1">
                  <button 
                    onClick={handleArchive}
                    disabled={actionLoading}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                    title={archiveLabel}
                  >
                    <ArchiveIcon className="w-4 h-4 text-gray-500" />
                  </button>
                  <button 
                    onClick={handleDelete}
                    disabled={actionLoading}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" 
                    title={deleteLabel}
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
                  
                  <button
                    onClick={handlePrint}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Print"
                  >
                    <Printer className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => setRulesPrefill({ from: extractEmailAddress(selectedEmail.from) })}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Filter emails like this"
                  >
                    <Filter className="w-4 h-4 text-gray-500" />
                  </button>
                  {canReportSpam && (
                    <button
                      onClick={() => handleReportSpam()}
                      disabled={actionLoading}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Report spam"
                    >
                      <ShieldAlert className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                  {canMove && renderMoveMenu('detail')}
                  
                  {/* Parse Email Button */}
                  <button
                    onClick={handleParseEmail}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Parse to Itinerary"
                  >
                    <Sparkles className="w-4 h-4 text-purple-500" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="More">
                    <MoreHorizontal className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                   {/* Expand Button */}
                 <button
                  onClick={() => setShowExpandedEmail(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Expand email"
                   >
                 <Maximize2 className="w-4 h-4 text-gray-500" />
                 </button>
                     <button
                   onClick={() => setSelectedEmail(null)}
                   className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                     <X className="w-4 h-4 text-gray-500" />
                      </button>
                   </div>
              </div>

              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {decodeHtmlEntities(selectedEmail.subject || '(No subject)')}
              </h2>

              {earlierInThread.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Earlier in this conversation ({earlierInThread.length})
                  </p>
                  {earlierInThread.map(renderThreadMessage)}
                </div>
              )}
              
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{extractName(selectedEmail.from)}</p>
                        {/* NEW: Client Link Button */}
                        <ClientLinkButton
                          userId={user!.id}
                          messageId={selectedEmail.id}
                          threadId={selectedEmail.threadId}
                          fromEmail={extractEmailAddress(selectedEmail.from)}
                          fromName={extractName(selectedEmail.from)}
                        />
                        {parseListUnsubscribe(selectedEmail.listUnsubscribe) && (
                          <button
                            onClick={() => handleUnsubscribe(selectedEmail)}
                            className="text-xs text-gray-500 underline hover:text-gray-800"
                            title="Stop receiving these emails"
                          >
                            Unsubscribe
                          </button>
                        )}
                      </div>
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
              {!!selectedEmail.cc && (
                <p className="-mt-4 mb-6 text-xs text-gray-500 break-words">
                  <span className="font-medium text-gray-400">Cc:</span> {selectedEmail.cc}
                </p>
              )}

              <div 
              className="email-body-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatEmailBody(selectedEmail.body)) }}
            />

              {/* NEW: Attachment List */}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <AttachmentList
                  attachments={selectedEmail.attachments}
                  messageId={selectedEmail.id}
                  userId={user!.id}
                />
              )}

              {laterInThread.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Later in this conversation</p>
                  {laterInThread.map(renderThreadMessage)}
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-gray-200">
                {renderReplyButtons(selectedEmail)}
              </div>
            </div>
          </div>
        )}
      </div>
{/* Expanded Email Modal */}
{showExpandedEmail && selectedEmail && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${
            folder === 'sent' || isFromMe(selectedEmail) 
              ? getAvatarColor(selectedEmail.to) 
              : getAvatarColor(selectedEmail.from)
          }`}>
            {folder === 'sent' || isFromMe(selectedEmail) 
              ? getInitials(extractName(selectedEmail.to))
              : getInitials(extractName(selectedEmail.from))
            }
          </div>
          <div>
            <div className="flex items-center gap-2">
              {(folder === 'sent' || isFromMe(selectedEmail)) && (
                <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded font-medium">Sent</span>
              )}
              <p className="font-medium text-gray-900">
                {folder === 'sent' || isFromMe(selectedEmail) 
                  ? `To: ${extractName(selectedEmail.to)}`
                  : extractName(selectedEmail.from)
                }
              </p>
              {!(folder === 'sent' || isFromMe(selectedEmail)) && (
                <ClientLinkButton
                  userId={user!.id}
                  messageId={selectedEmail.id}
                  threadId={selectedEmail.threadId}
                  fromEmail={extractEmailAddress(selectedEmail.from)}
                  fromName={extractName(selectedEmail.from)}
                />
              )}
            </div>
            <p className="text-xs text-gray-500">
              {folder === 'sent' || isFromMe(selectedEmail)
                ? extractEmailAddress(selectedEmail.to)
                : extractEmailAddress(selectedEmail.from)
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {new Date(selectedEmail.date).toLocaleString()}
          </span>
          <button
            onClick={handleParseEmail}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Parse to Itinerary"
          >
            <Sparkles className="w-5 h-5 text-purple-500" />
          </button>
          <button
            onClick={() => setShowExpandedEmail(false)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Modal Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {decodeHtmlEntities(selectedEmail.subject || '(No subject)')}
          </h2>
          
          <div 
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmail.body) }}
          />

          {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <AttachmentList
                attachments={selectedEmail.attachments}
                messageId={selectedEmail.id}
                userId={user!.id}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0 rounded-b-2xl">
        <div className="flex items-center gap-2">
          <button 
            onClick={handleArchive}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" 
            title={archiveLabel}
          >
            <ArchiveIcon className="w-4 h-4 text-gray-500" />
          </button>
          <button 
            onClick={handleDelete}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" 
            title={deleteLabel}
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
          <button 
            onClick={() => selectedEmail.isUnread ? handleMarkRead() : handleMarkUnread()}
            disabled={actionLoading}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" 
            title={selectedEmail.isUnread ? 'Mark as read' : 'Mark as unread'}
          >
            {selectedEmail.isUnread ? (
              <MailOpen className="w-4 h-4 text-gray-500" />
            ) : (
              <Mail className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
        
        {renderReplyButtons(selectedEmail)}
      </div>
    </div>
  </div>
)}

{/* Compose Modal */}
{showCompose && (
        <ComposeModal
          onClose={() => {
            setShowCompose(false)
            // A draft saved or discarded shows in (or leaves) the Drafts list.
            if (folder === 'drafts') fetchEmails()
          }}
          userId={user?.id || ''}
          mode={composeMode}
          source={composeMode === 'new' || composeMode === 'draft' ? null : selectedEmail}
          draft={composeMode === 'draft' ? composeDraft : null}
          ownAddresses={connectedEmail ? [connectedEmail] : []}
          onQueueSend={queueSend}
          onScheduled={(label) => {
            setSendNotice({ text: `Scheduled for ${label}` })
            setTimeout(() => setSendNotice(n => (n?.text.startsWith('Scheduled for') ? null : n)), 6000)
          }}
          onSent={() => {
            setShowCompose(false)
            fetchEmails()
          }}
          clients={clients}
        />
      )}

      {rulesPrefill !== undefined && (
        <RulesPanel
          folders={customLabels.map(l => ({ id: l.id, name: l.name }))}
          prefill={rulesPrefill}
          canEdit={canAccess(['admin', 'manager'])}
          onClose={() => setRulesPrefill(undefined)}
          onApplied={() => fetchEmails()}
        />
      )}

      {showScheduled && (
        <ScheduledPanel onClose={() => setShowScheduled(false)} onOpenDraft={openDraftById} />
      )}

      {/* Undo send / send result */}
      {(pendingSend || sendNotice) && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-4 px-4 py-3 rounded-lg bg-gray-900 text-white text-sm shadow-xl" role="status">
          {pendingSend ? (
            <>
              <span>Sending in {undoSecondsLeft}s…</span>
              <button onClick={undoSend} className="font-semibold text-primary-200 hover:text-white">Undo</button>
              <button onClick={() => fireSend(pendingSend)} className="text-gray-300 hover:text-white">Send now</button>
            </>
          ) : sendNotice && (
            <>
              <span>{sendNotice.text}</span>
              {sendNotice.draft && (
                <button onClick={() => reopenDraft(sendNotice.draft!)} className="font-semibold text-primary-200 hover:text-white">Open draft</button>
              )}
              <button onClick={() => setSendNotice(null)} className="text-gray-400 hover:text-white" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Create Label Modal */}
      {showLabelModal && (
        <CreateLabelModal
          key={editingLabel?.id ?? 'new'}
          label={editingLabel}
          onClose={() => { setShowLabelModal(false); setEditingLabel(null) }}
          userId={user?.id || ''}
          onCreated={() => {
            setShowLabelModal(false)
            setEditingLabel(null)
            fetchLabels()
          }}
        />
      )}

    </div>
  )
}

// Helper functions
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

const reSubject = (subject: string) => (/^re:/i.test(subject || '') ? subject : `Re: ${subject || ''}`)
const escapeHtml = (text: string) =>
  String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// UPDATED: Compose Modal Component with CLIENT + PARTNER template integration
// Replace your existing ComposeModal in app/inbox/page.tsx with this version

function ComposeModal({ 
  onClose, 
  userId, 
  mode = 'new',
  source = null,
  draft = null,
  ownAddresses = [],
  onSent,
  onQueueSend,
  onScheduled,
  clients = []
}: { 
  onClose: () => void
  userId: string
  /** new, reply, reply all, forward — or a saved draft reopened. */
  mode?: ComposeMode
  /** The email being answered or forwarded. */
  source?: Email | null
  draft?: DraftDoc | null
  /** The mailbox's own address(es): never on a Reply all. */
  ownAddresses?: string[]
  onSent: () => void
  /** Send after the Undo window; the compose closes at once. */
  onQueueSend?: (job: PendingSend) => void
  /** Scheduled to send later; `label` says when. */
  onScheduled?: (label: string) => void
  clients?: Client[]
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // A reply (or reply all) stays in the source's thread; a forward and a new
  // message start their own; a draft keeps the thread it was saved in.
  const replyTo = (mode === 'reply' || mode === 'replyAll') ? source : null
  const replyThreadId = draft?.threadId || replyTo?.threadId

  const initial = (() => {
    if (draft) return { to: draft.to, cc: draft.cc, bcc: draft.bcc, subject: draft.subject, body: draft.body }
    if (source && mode === 'replyAll') {
      const r = replyAllRecipients(source, ownAddresses)
      return { to: r.to.join(', '), cc: r.cc.join(', '), bcc: '', subject: reSubject(source.subject), body: '' }
    }
    if (source && mode === 'reply') {
      // To the sender — or, for a message the office sent, to whom it went
      // (as Gmail does); never back to the office's own address.
      const r = replyAllRecipients(source, ownAddresses)
      return { to: r.to[0] ?? source.from, cc: '', bcc: '', subject: reSubject(source.subject), body: '' }
    }
    if (source && mode === 'forward') {
      const quoted = [
        '<p></p><p>---------- Forwarded message ---------</p>',
        `<p>From: ${escapeHtml(source.from)}<br>Date: ${escapeHtml(source.date)}<br>Subject: ${escapeHtml(source.subject)}<br>To: ${escapeHtml(source.to)}${source.cc ? `<br>Cc: ${escapeHtml(source.cc)}` : ''}</p>`,
        sanitizeHtml(source.body || ''),
      ].join('')
      return { to: '', cc: '', bcc: '', subject: /^fwd?:/i.test(source.subject) ? source.subject : `Fwd: ${source.subject}`, body: quoted }
    }
    return { to: '', cc: '', bcc: '', subject: '', body: '' }
  })()

  const [to, setTo] = useState(initial.to)
  const [cc, setCc] = useState(initial.cc)
  const [bcc, setBcc] = useState(initial.bcc)
  const [showCc, setShowCc] = useState(!!initial.cc)
  const [showBcc, setShowBcc] = useState(!!initial.bcc)
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)
  // The saved draft this compose writes to (Gmail's draft id), once saved.
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftNote, setDraftNote] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  // "Draft saved" stands until the next edit.
  useEffect(() => { setDraftNote(null) }, [to, cc, bcc, subject, body])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One key for this reply (lib/email/send-with-guard): a double click or a
  // retry is the same attempt, never a second email.
  const requestKeyRef = useRef<string>(newRequestKey())
  const confirmSendConflict = useSendConflictConfirm()
  const [isExpanded, setIsExpanded] = useState(false)
  // A reopened draft keeps what it carried.
  const [attachments, setAttachments] = useState<Attachment[]>(draft?.attachments ?? [])
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showSignatureDropdown, setShowSignatureDropdown] = useState(false)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const signatureDropdownRef = useRef<HTMLDivElement>(null)
  const templateDropdownRef = useRef<HTMLDivElement>(null)
  // No backdrop — see lib/use-dismiss-on-outside.ts (AUT-W02). The old layer
  // was z-0, UNDER most of the modal, so it half-worked at best.
  useDismissOnOutside(showSignatureDropdown, signatureDropdownRef, () => setShowSignatureDropdown(false))
  useDismissOnOutside(showTemplateDropdown, templateDropdownRef, () => setShowTemplateDropdown(false))
  
  // State for template placeholder modal
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})
  
  // CLIENT state
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [loadingCRMData, setLoadingCRMData] = useState(false)
  const [clientItineraries, setClientItineraries] = useState<any[]>([])
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>('')
  const [crmPlaceholderData, setCrmPlaceholderData] = useState<Record<string, string>>({})
  // Templates are shown in the language the client is written to in (clients.preferred_language),
  // falling back to the operator's UI locale; the dropdown can switch.
  const uiLocale = useLocale()
  const [templateLanguage, setTemplateLanguage] = useState<'en' | 'ja'>(uiLocale === 'ja' ? 'ja' : 'en')
  
  // PARTNER state
  const [activeTab, setActiveTab] = useState<'client' | 'partner'>('client')
  const [partners, setPartners] = useState<any[]>([])
  const [selectedPartnerType, setSelectedPartnerType] = useState<string>('')
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('')
  const [loadingPartnerData, setLoadingPartnerData] = useState(false)
  const [partnerPlaceholderData, setPartnerPlaceholderData] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sigRes, tempRes, msgTempRes] = await Promise.all([
          fetch(`/api/email/signatures?userId=${userId}`),
          fetch(`/api/email/templates?userId=${userId}`),
          fetch('/api/templates')
        ])

        const sigData = await sigRes.json()
        const tempData = await tempRes.json()
        const msgTempData = await msgTempRes.json()

        if (sigData.signatures) setSignatures(sigData.signatures)

        // Merge email_templates + message_templates (email/both only)
        const emailTemplates: EmailTemplate[] = (tempData.templates || [])
        const msgTemplates: EmailTemplate[] = (Array.isArray(msgTempData) ? msgTempData : (msgTempData.data || []))
          .filter((t: any) => t.channel === 'email' || t.channel === 'both')
          .map((t: any) => ({
            id: t.id,
            name: t.name,
            subject: t.subject || '',
            content: t.body || '',
            category: t.category || 'customer',
            channel: t.channel,
            language: t.language || 'en',
          }))

        // Deduplicate by name + language: the Japanese twin of a template has
        // the same name, and must not be dropped as a duplicate of the English.
        const existingKeys = new Set(emailTemplates.map(t => `${t.name}|${t.language || 'en'}`))
        const merged = [
          ...emailTemplates,
          ...msgTemplates.filter(t => !existingKeys.has(`${t.name}|${t.language || 'en'}`))
        ]
        setTemplates(merged)

        const defaultSig = sigData.signatures?.find((s: EmailSignature) => s.is_default)
        if (defaultSig) {
          setBody(`<p></p><br/>${defaultSig.content}`)
        }
      } catch (err) {
        console.error('Error fetching signatures/templates:', err)
      }
    }
    
    if (userId) fetchData()
  }, [userId])

  // Fetch partners when type changes
  const fetchPartners = async (type: string) => {
    if (!type) {
      setPartners([])
      return
    }

    setLoadingPartnerData(true)
    try {
      const response = await fetch(`/api/partners?type=${type}`)
      const data = await response.json()
      setPartners(data.partners || [])
    } catch (err) {
      console.error('Error fetching partners:', err)
    } finally {
      setLoadingPartnerData(false)
    }
  }

  // Fetch partner template data
  const fetchPartnerTemplateData = async (partnerId: string, type: string) => {
    if (!partnerId || !type) return

    setLoadingPartnerData(true)
    try {
      const response = await fetch(`/api/partners/${partnerId}/template-data?type=${type}`)
      const data = await response.json()
      
      if (data.placeholderData) {
        setPartnerPlaceholderData(data.placeholderData)
        
        // Auto-fill "To" field with partner email
        if (data.placeholderData.partner_email) {
          setTo(data.placeholderData.partner_email)
        }
      }
    } catch (err) {
      console.error('Error fetching partner template data:', err)
    } finally {
      setLoadingPartnerData(false)
    }
  }

  // Handle partner type change
  const handlePartnerTypeChange = (type: string) => {
    setSelectedPartnerType(type)
    setSelectedPartnerId('')
    setPartnerPlaceholderData({})
    fetchPartners(type)
  }

  // Handle partner selection
  const handlePartnerChange = (partnerId: string) => {
    setSelectedPartnerId(partnerId)
    if (partnerId && selectedPartnerType) {
      fetchPartnerTemplateData(partnerId, selectedPartnerType)
    }
  }

  // CLIENT functions (existing)
  const fetchClientCRMData = async (clientId: string) => {
    if (!clientId) {
      setClientItineraries([])
      setSelectedItineraryId('')
      setCrmPlaceholderData({})
      return
    }

    setLoadingCRMData(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/template-data?userId=${userId}`)
      const data = await response.json()
      
      if (data.error) {
        console.error('Error fetching CRM data:', data.error)
        return
      }

      setClientItineraries(data.allItineraries || [])
      
      if (data.latestItinerary) {
        setSelectedItineraryId(data.latestItinerary.id)
      }
      
      setCrmPlaceholderData(data.placeholderData || {})
      
      if (data.clientLanguage === 'ja' || data.clientLanguage === 'en') setTemplateLanguage(data.clientLanguage)
      
      const client = clients.find(c => c.id === clientId)
      if (client?.email) {
        setTo(client.email)
      }

    } catch (err) {
      console.error('Error fetching client CRM data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const fetchItineraryData = async (clientId: string, itineraryId: string) => {
    if (!clientId || !itineraryId) return

    setLoadingCRMData(true)
    try {
      const response = await fetch(
        `/api/clients/${clientId}/template-data?userId=${userId}&itineraryId=${itineraryId}`
      )
      const data = await response.json()
      
      if (data.placeholderData) {
        setCrmPlaceholderData(data.placeholderData)
        if (data.clientLanguage === 'ja' || data.clientLanguage === 'en') setTemplateLanguage(data.clientLanguage)
      }
    } catch (err) {
      console.error('Error fetching itinerary data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId)
    setSelectedItineraryId('')
    fetchClientCRMData(clientId)
  }

  const handleItineraryChange = (itineraryId: string) => {
    setSelectedItineraryId(itineraryId)
    if (selectedClientId && itineraryId) {
      fetchItineraryData(selectedClientId, itineraryId)
    }
  }

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
    setBody(prev => `${prev}<br/>${signature.content}`)
    setShowSignatureDropdown(false)
  }

  const applyTemplate = (template: EmailTemplate) => {
    const placeholders = getPlaceholders(template.content + ' ' + template.subject)
    
    if (placeholders.length > 0) {
      setSelectedTemplate(template)
      setPlaceholderValues({})
      if (!selectedClientId) {
        setCrmPlaceholderData({})
      }
      if (!selectedPartnerId) {
        setPartnerPlaceholderData({})
      }
      setShowPlaceholderModal(true)
    } else {
      setSubject(template.subject)
      setBody(template.content)
    }
    setShowTemplateDropdown(false)
  }

  const applyTemplateWithPlaceholders = () => {
    if (!selectedTemplate) return

    // Merge data: CRM client data + Partner data + manual overrides
    const finalData = { 
      ...crmPlaceholderData, 
      ...partnerPlaceholderData,
      ...placeholderValues 
    }

    const processedSubject = replacePlaceholders(selectedTemplate.subject, finalData)
    const processedContent = replacePlaceholders(selectedTemplate.content, finalData, { html: true })

    setSubject(processedSubject)
    setBody(processedContent)
    setShowPlaceholderModal(false)
    setSelectedTemplate(null)
  }

  // Save to Gmail's Drafts (created the first time, updated after). Quiet:
  // `announce` only for the Save draft button.
  const saveDraft = async (announce: boolean): Promise<string | null> => {
    if (savingDraft) return null
    setSavingDraft(true)
    try {
      const res = await fetch('/api/gmail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId || undefined, to, cc, bcc, subject, body,
          threadId: replyThreadId,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.id) throw new Error(data.error || 'The draft could not be saved')
      setDraftId(data.id)
      if (announce) setDraftNote('Draft saved')
      return data.id as string
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setSavingDraft(false)
    }
  }

  // Anything written that is not in the draft yet.
  const initialBody = initial.body
  const isDirty = [to !== initial.to, cc !== initial.cc, bcc !== initial.bcc, subject !== initial.subject, body !== initialBody, attachments.length !== (draft?.attachments?.length ?? 0)].some(Boolean)

  // Closing keeps what was written, as Gmail does: it is saved as a draft.
  const handleClose = async () => {
    const hasContent = !!(to.trim() || cc.trim() || bcc.trim() || body.replace(/<[^>]*>/g, '').trim())
    if (isDirty && hasContent) {
      const saved = await saveDraft(false)
      if (!saved && !window.confirm('The draft could not be saved. Close and lose it?')) return
    }
    onClose()
  }

  // Throw the draft away: off Gmail's Drafts too, when it was saved.
  const handleDiscard = async () => {
    if (isDirty && !window.confirm('Discard this message?')) return
    if (draftId) {
      try {
        await fetch(`/api/gmail/drafts?id=${encodeURIComponent(draftId)}`, { method: 'DELETE' })
      } catch {
        // It stays in Drafts; nothing is sent.
      }
    }
    onClose()
  }

  // Send later: saved as a draft, and the draft is sent at the chosen time
  // (app/api/gmail/scheduled, sent by the scheduler).
  const handleSchedule = async (choice: ScheduleChoice) => {
    if (!to || !subject || !body) {
      setError('Please fill in all fields')
      return
    }
    // Nobody is there to fix a bad address at 9:00 — refuse it now.
    const invalid = [...parseRecipients(to).invalid, ...parseRecipients(cc).invalid, ...parseRecipients(bcc).invalid]
    if (invalid.length > 0) {
      setError(`Not an email address: ${invalid.join(', ')}`)
      return
    }
    setScheduling(true)
    setError(null)
    try {
      const savedId = await saveDraft(false)
      if (!savedId) return
      const res = await fetch('/api/gmail/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: savedId,
          sendAt: choice.sendAt.toISOString(),
          timeZone: choice.timeZone,
          toSummary: to,
          subject,
          threadId: replyThreadId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not schedule it')
      setShowSchedule(false)
      onScheduled?.(choice.label)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setScheduling(false)
    }
  }

  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError('Please fill in all fields')
      return
    }

    // Check for unfilled template placeholders
    const placeholderPattern = /\{\{[A-Za-z_]+\}\}/g
    const subjectPlaceholders = subject.match(placeholderPattern) || []
    const bodyPlaceholders = body.match(placeholderPattern) || []
    const allPlaceholders = [...new Set([...subjectPlaceholders, ...bodyPlaceholders])]

    if (allPlaceholders.length > 0) {
      const proceed = window.confirm(
        `This email contains ${allPlaceholders.length} unfilled placeholder(s):\n\n${allPlaceholders.join(', ')}\n\nThese will appear as raw text to the recipient. Link an itinerary to auto-fill them, or edit manually.\n\nSend anyway?`
      )
      if (!proceed) return
    }

    if (sending) return
    setSending(true)
    setError(null)

    try {
      // Replying: the message being answered is the newest one on screen — a
      // reply sent after it (by a colleague, or from Gmail) is reported first.
      const answered = replyTo?.date ? new Date(replyTo.date) : null
      const seenUpTo = replyTo ? (answered && !isNaN(answered.getTime()) ? answered.toISOString() : null) : undefined
      const payload: Record<string, unknown> = {
        userId,
        to,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body,
        threadId: replyThreadId,
        // Sent from a saved draft: the server removes the draft.
        draftId: draftId || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      }

      // Undo send: saved as a draft now — so a closed tab or a lost
      // connection leaves it in Drafts, never lost — and sent when the Undo
      // window ends (the page holds it). If the draft cannot be saved, it is
      // sent at once, as before.
      if (onQueueSend) {
        const savedId = await saveDraft(false)
        if (savedId) {
          onQueueSend({
            payload: { ...payload, draftId: savedId },
            requestKey: requestKeyRef.current,
            seenUpTo,
            restore: { id: savedId, threadId: replyThreadId, to, cc, bcc, subject, body, attachments },
          })
          onClose()
          return
        }
        setError(null)
      }

      const sent = await sendGuardedEmail(payload, {
        requestKey: requestKeyRef.current,
        seenUpTo,
        confirmConflict: confirmSendConflict,
      })
      if (!sent.ok) {
        if (sent.cancelled) return
        throw new Error(sent.error)
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
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            {mode === 'reply' ? 'Reply' : mode === 'replyAll' ? 'Reply all' : mode === 'forward' ? 'Forward' : mode === 'draft' ? 'Draft' : 'New Message'}
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
              onClick={handleClose} 
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close (saves a draft)"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">To</label>
            <RecipientField
              value={to}
              onChange={setTo}
              placeholder="Name or email — suggestions as you type"
            />
            {/* Cc / Bcc as Gmail shows them: links until wanted. */}
            <div className="flex items-center gap-2 ml-2 text-xs text-gray-500">
              {!showCc && <button type="button" onClick={() => setShowCc(true)} className="hover:text-gray-800">Cc</button>}
              {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="hover:text-gray-800">Bcc</button>}
            </div>
          </div>

          {showCc && (
            <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
              <label className="w-16 text-xs font-medium text-gray-400">Cc</label>
              <RecipientField value={cc} onChange={setCc} placeholder="Copy to" autoFocus={!initial.cc} />
            </div>
          )}

          {showBcc && (
            <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
              <label className="w-16 text-xs font-medium text-gray-400">Bcc</label>
              <RecipientField value={bcc} onChange={setBcc} placeholder="Hidden copy to" autoFocus={!initial.bcc} />
            </div>
          )}

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

               {/* Templates & Signatures */}
<div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
{templates.length > 0 && (
  <div className="relative" ref={templateDropdownRef}>
    <button 
      onClick={() => setShowTemplateDropdown(!showTemplateDropdown)} 
      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
    >
      <FileText className="w-3.5 h-3.5" />
      Templates
    </button>
    {showTemplateDropdown && (
      <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 max-h-96 overflow-y-auto">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100">
          {(['en', 'ja'] as const).map(lang => (
            <button
              key={lang}
              type="button"
              onClick={() => setTemplateLanguage(lang)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${templateLanguage === lang ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {lang === 'en' ? 'English' : '日本語'}
            </button>
          ))}
        </div>
        {['customer', 'supplier', 'partner', 'internal'].map(category => {
          const categoryTemplates = templates.filter(t =>
            t.category === (category === 'partner' ? 'b2b' : category) || t.category === category
          ).filter(t => t.channel !== 'whatsapp')
            // Only the picker's language; a template with no Japanese twin still shows in English.
            .filter(t => (t.language || 'en') === templateLanguage || (templateLanguage === 'ja' && (t.language || 'en') === 'en' && !templates.some(o => o.name === t.name && o.language === 'ja')))
          if (categoryTemplates.length === 0) return null

          return (
            <div key={category}>
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {category === 'customer' && '👤 Customer'}
                  {category === 'supplier' && '🏢 Supplier'}
                  {category === 'partner' && '🤝 Partner / B2B'}
                  {category === 'internal' && '📋 Internal'}
                </span>
              </div>
              {categoryTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{template.name}</span>
                  </div>
                  {template.subject && (
                    <span className="block text-gray-500 truncate mt-0.5">
                      {template.subject}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    )}
  </div>
)}
     
        {signatures.length > 0 && (
              <div className="relative" ref={signatureDropdownRef}>
                <button 
                  onClick={() => setShowSignatureDropdown(!showSignatureDropdown)} 
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <Signature className="w-3.5 h-3.5" />
                  Signatures
                </button>
                {showSignatureDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    {signatures.map((sig) => (
                      <button 
                        key={sig.id} 
                        onClick={() => insertSignature(sig)} 
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900">{sig.name}</span>
                        {sig.is_default && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">
                            Default
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rich Text Editor */}
          <div className="flex-1 p-4">
            <RichTextEditor
              content={body}
              onChange={setBody}
              placeholder="Write your message..."
              minHeight={isExpanded ? '350px' : '200px'}
              maxHeight={isExpanded ? '500px' : '300px'}
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-600 mb-2">
                Attachments ({attachments.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => {
                  const FileIcon = getFileIcon(file.mimeType)
                  return (
                    <div 
                      key={index} 
                      className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200"
                    >
                      <FileIcon className="w-4 h-4 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate max-w-[150px]">
                          {file.filename}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button 
                        onClick={() => removeAttachment(index)} 
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-1">
            <input 
              ref={fileInputRef} 
              type="file" 
              multiple 
              onChange={handleFileSelect} 
              className="hidden" 
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar" 
            />
            <input 
              ref={imageInputRef} 
              type="file" 
              multiple 
              onChange={handleFileSelect} 
              className="hidden" 
              accept="image/*" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors" 
              title="Attach file"
            >
              <Paperclip className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              onClick={() => imageInputRef.current?.click()} 
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors" 
              title="Insert image"
            >
              <Image className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {draftNote && <span className="text-xs text-gray-500">{draftNote}</span>}
            <button 
              onClick={handleDiscard} 
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Discard
            </button>
            <button 
              onClick={() => saveDraft(true)} 
              disabled={savingDraft || sending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {savingDraft ? 'Saving…' : 'Save draft'}
            </button>
            {onScheduled && (
              <div className="relative">
                <button
                  onClick={() => setShowSchedule(v => !v)}
                  disabled={sending || scheduling}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Send later"
                >
                  <Clock className="w-4 h-4" />
                  {scheduling ? 'Scheduling…' : 'Schedule'}
                </button>
                {showSchedule && (
                  <div className="absolute right-0 bottom-full mb-2 z-30">
                    <SchedulePicker onPick={handleSchedule} onCancel={() => setShowSchedule(false)} busy={scheduling} />
                  </div>
                )}
              </div>
            )}
            <button 
              onClick={handleSend} 
              disabled={sending} 
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
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


      {/* Placeholder Modal with CLIENT + PARTNER tabs */}
      {showPlaceholderModal && selectedTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowPlaceholderModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Fill Template: {selectedTemplate.name}</h3>
              <button onClick={() => setShowPlaceholderModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Tab selector */}
              <div className="flex border border-gray-200 rounded-lg p-1 bg-gray-50">
                <button
                  onClick={() => setActiveTab('client')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'client' 
                      ? 'bg-white text-primary-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Client
                </button>
                <button
                  onClick={() => setActiveTab('partner')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'partner' 
                      ? 'bg-white text-primary-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Partner
                </button>
              </div>

              {/* CLIENT TAB */}
              {activeTab === 'client' && (
                <div className="p-4 bg-primary-50 rounded-lg border border-primary-100">
                  <p className="text-xs font-semibold text-primary-800 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Load Client from CRM
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Select Client
                      </label>
                      <select
                        value={selectedClientId}
                       onChange={(e) => handleClientChange(e.target.value)}
                       className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                       >
                        <option value="">-- Select a client --</option>
                        {clients.map(client => (
                          <option key={client.id} value={client.id}>
                            {client.name} ({client.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedClientId && clientItineraries.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Select Trip/Itinerary
                        </label>
                        <select
                          value={selectedItineraryId}
                          onChange={(e) => handleItineraryChange(e.target.value)}
                          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                        >
                          <option value="">-- Select an itinerary --</option>
                          {clientItineraries.map((itin: any) => (
                            <option key={itin.id} value={itin.id}>
                              {itin.itinerary_code} - {itin.trip_name} ({itin.start_date})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedClientId && clientItineraries.length === 0 && !loadingCRMData && (
                      <p className="text-xs text-gray-500 italic">No itineraries found for this client</p>
                    )}

                    {loadingCRMData && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading CRM data...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Show loaded CLIENT values */}
              {activeTab === 'client' && selectedClientId && Object.keys(crmPlaceholderData).length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-2">✓ Client data loaded:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {crmPlaceholderData.client_name && (
                      <div><span className="text-gray-500">Client:</span> {crmPlaceholderData.client_name}</div>
                    )}
                    {crmPlaceholderData.trip_name && (
                      <div><span className="text-gray-500">Trip:</span> {crmPlaceholderData.trip_name}</div>
                    )}
                    {crmPlaceholderData.total && (
                      <div><span className="text-gray-500">Total:</span> {crmPlaceholderData.total}</div>
                    )}
                    {crmPlaceholderData.deposit && (
                      <div><span className="text-gray-500">Deposit:</span> {crmPlaceholderData.deposit}</div>
                    )}
                    {crmPlaceholderData.trip_dates && (
                      <div className="col-span-2"><span className="text-gray-500">Dates:</span> {crmPlaceholderData.trip_dates}</div>
                    )}
                  </div>
                </div>
              )}

              {/* PARTNER TAB */}
              {activeTab === 'partner' && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-xs font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Load Partner from Resources
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Partner Type
                      </label>
                      <select
                         value={selectedPartnerType}
                         onChange={(e) => handlePartnerTypeChange(e.target.value)}
                         className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                           >
                        <option value="">-- Select type --</option>
                        <option value="hotel">🏨 Hotels</option>
                        <option value="guide">🧭 Tour Guides</option>
                        <option value="restaurant">🍽️ Restaurants</option>
                        <option value="airport_staff">✈️ Airport Assistant</option>
                      </select>
                    </div>

                    {selectedPartnerType && partners.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Select Partner
                        </label>
                        <select
                          value={selectedPartnerId}
                          onChange={(e) => handlePartnerChange(e.target.value)}
                          className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                        >
                          <option value="">-- Select partner --</option>
                          {partners.map((partner: any) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.name} {partner.city ? `(${partner.city})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedPartnerType && partners.length === 0 && !loadingPartnerData && (
                      <p className="text-xs text-gray-500 italic">No {selectedPartnerType}s found</p>
                    )}

                    {loadingPartnerData && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading partner data...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Show loaded PARTNER values */}
              {activeTab === 'partner' && selectedPartnerId && Object.keys(partnerPlaceholderData).length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-2">✓ Partner data loaded:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {partnerPlaceholderData.partner_name && (
                      <div><span className="text-gray-500">Name:</span> {partnerPlaceholderData.partner_name}</div>
                    )}
                    {partnerPlaceholderData.partner_type && (
                      <div><span className="text-gray-500">Type:</span> {partnerPlaceholderData.partner_type}</div>
                    )}
                    {partnerPlaceholderData.contact_person && (
                      <div><span className="text-gray-500">Contact:</span> {partnerPlaceholderData.contact_person}</div>
                    )}
                    {partnerPlaceholderData.partner_email && (
                      <div><span className="text-gray-500">Email:</span> {partnerPlaceholderData.partner_email}</div>
                    )}
                    {partnerPlaceholderData.partner_phone && (
                      <div><span className="text-gray-500">Phone:</span> {partnerPlaceholderData.partner_phone}</div>
                    )}
                    {partnerPlaceholderData.partner_city && (
                      <div><span className="text-gray-500">City:</span> {partnerPlaceholderData.partner_city}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Manual override fields */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 mb-3">
                  Override values (optional):
                </p>
                {getPlaceholders(selectedTemplate.content + ' ' + selectedTemplate.subject).map(placeholder => (
                  <div key={placeholder} className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                      {placeholder.replace(/_/g, ' ')}
                    </label>
                    <input
                      type="text"
                      value={placeholderValues[placeholder] || ''}
                      onChange={(e) => setPlaceholderValues(prev => ({
                        ...prev,
                        [placeholder]: e.target.value
                      }))}
                      placeholder={
                        crmPlaceholderData[placeholder] || 
                        partnerPlaceholderData[placeholder] || 
                        `Enter ${placeholder.replace(/_/g, ' ')}`
                      }
                      className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                    {(crmPlaceholderData[placeholder] || partnerPlaceholderData[placeholder]) && !placeholderValues[placeholder] && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Will use: {crmPlaceholderData[placeholder] || partnerPlaceholderData[placeholder]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowPlaceholderModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={applyTemplateWithPlaceholders}
                disabled={loadingCRMData || loadingPartnerData}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// Create or edit a folder: its name and colour (Gmail's palette).
function CreateLabelModal({ 
  onClose, 
  userId, 
  onCreated,
  label = null,
}: { 
  onClose: () => void
  userId: string
  onCreated: () => void
  /** Editing this folder; creating a new one when null. */
  label?: GmailLabel | null
}) {
  const [name, setName] = useState(label?.name ?? '')
  const [color, setColor] = useState<string | null>(label?.color?.backgroundColor ?? null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) return
    
    setCreating(true)
    setError(null)
    
    try {
      const picked = LABEL_COLORS.find(c => c.backgroundColor === color)
      const response = await fetch('/api/gmail/labels', {
        method: label ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(label
          ? {
              labelId: label.id,
              ...(name.trim() !== label.name ? { name: name.trim() } : {}),
              ...(picked && picked.backgroundColor !== label.color?.backgroundColor
                ? { backgroundColor: picked.backgroundColor, textColor: picked.textColor } : {}),
            }
          : {
              userId, name: name.trim(),
              ...(picked ? { backgroundColor: picked.backgroundColor, textColor: picked.textColor } : {}),
            }),
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
          <h3 className="text-sm font-semibold text-gray-900">{label ? 'Edit Folder' : 'Create New Folder'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              {error}
            </div>
          )}
          
          <div>
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

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Colour</p>
            <div className="flex flex-wrap gap-2">
              {!label && (
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className={`w-7 h-7 rounded-full border border-gray-300 bg-white text-[10px] text-gray-400 ${color === null ? 'ring-2 ring-offset-1 ring-primary-500' : ''}`}
                  title="No colour"
                >
                  —
                </button>
              )}
              {LABEL_COLORS.map(c => (
                <button
                  key={c.backgroundColor}
                  type="button"
                  onClick={() => setColor(c.backgroundColor)}
                  style={{ backgroundColor: c.backgroundColor }}
                  className={`w-7 h-7 rounded-full ${color === c.backgroundColor ? 'ring-2 ring-offset-1 ring-primary-500' : ''}`}
                  title={c.name}
                  aria-label={c.name}
                />
              ))}
            </div>
          </div>
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
            {creating ? 'Saving...' : label ? 'Save' : 'Create Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
