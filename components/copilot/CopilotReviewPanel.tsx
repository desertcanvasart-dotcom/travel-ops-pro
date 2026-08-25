'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  MessageSquare, Mail, User, AlertTriangle, RefreshCw,
  Check, X, Send, ChevronDown, ChevronUp, Clock, Sparkles, ExternalLink
} from 'lucide-react'
import CopilotContextCard from './CopilotContextCard'
import type { CopilotThreadWithLatest, CopilotDraft, CopilotInboxMessage, CopilotContext } from '@/types/copilot'
import { useAuth } from '@/app/contexts/AuthContext'

interface CopilotReviewPanelProps {
  thread: CopilotThreadWithLatest | null
  onThreadUpdate?: () => void
}

const WHATSAPP_WINDOW_MS = 23 * 60 * 60 * 1000 // 23 hours

export default function CopilotReviewPanel({ thread, onThreadUpdate }: CopilotReviewPanelProps) {
  const tConcierge = useTranslations('copilot.concierge')
  const tDraft = useTranslations('copilot.draft')
  const { user } = useAuth()
  const [draft, setDraft] = useState<CopilotDraft | null>(null)
  const [inboxMessage, setInboxMessage] = useState<CopilotInboxMessage | null>(null)
  const [editableBody, setEditableBody] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [showRegenInput, setShowRegenInput] = useState(false)
  const [whatsappTimeLeft, setWhatsappTimeLeft] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Phase 1 — Concierge brief → itinerary commit (operator-triggered).
  // `spawnedItinerary` is null until we know whether one exists for this thread.
  const [spawnedItinerary, setSpawnedItinerary] = useState<
    { id: string; itinerary_code: string; trip_name: string } | null
  >(null)
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  // Fetch draft details when thread changes
  useEffect(() => {
    if (!thread?.latest_draft?.id) {
      setDraft(null)
      setInboxMessage(thread?.latest_inbox || null)
      return
    }

    const fetchDraft = async () => {
      try {
        const res = await fetch(`/api/copilot/drafts/${thread.latest_draft!.id}`)
        const data = await res.json()
        if (data.success) {
          setDraft(data.draft)
          setInboxMessage(data.inbox_message)
          setEditableBody(data.draft.edited_body || data.draft.draft_body)
          setIsEditing(false)
        }
      } catch (err) {
        console.error('Failed to fetch draft:', err)
      }
    }

    fetchDraft()
  }, [thread?.latest_draft?.id, thread?.latest_inbox])

  // WhatsApp countdown timer
  useEffect(() => {
    if (!inboxMessage || thread?.channel !== 'whatsapp') {
      setWhatsappTimeLeft(null)
      return
    }

    const updateTimer = () => {
      const received = new Date(inboxMessage.received_at).getTime()
      const windowEnd = received + WHATSAPP_WINDOW_MS
      const remaining = windowEnd - Date.now()
      setWhatsappTimeLeft(remaining > 0 ? remaining : 0)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [inboxMessage, thread?.channel])

  const formatTimeLeft = (ms: number): string => {
    if (ms <= 0) return 'Expired'
    const hours = Math.floor(ms / 3600000)
    const mins = Math.floor((ms % 3600000) / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    if (hours > 0) return `${hours}h ${mins}m`
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }

  const isWhatsappExpired = whatsappTimeLeft !== null && whatsappTimeLeft <= 0

  // Approve draft
  const handleApprove = async () => {
    if (!draft) return
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { action: 'approve' }
      if (isEditing && editableBody !== draft.draft_body) {
        body.edited_body = editableBody
      }
      const res = await fetch(`/api/copilot/drafts/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setDraft(data.draft)
        setIsEditing(false)
        onThreadUpdate?.()
      } else {
        setError(data.error)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Reject draft
  const handleReject = async () => {
    if (!draft) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/copilot/drafts/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      const data = await res.json()
      if (data.success) {
        setDraft(data.draft)
        onThreadUpdate?.()
      } else {
        setError(data.error)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Send approved draft
  const handleSend = async () => {
    if (!draft || draft.status !== 'approved') return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/copilot/drafts/${draft.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No user_id: the route sends as the signed-in user. Passing it was
        // how a caller could send mail from someone else's Gmail account.
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setDraft((prev) => prev ? { ...prev, status: 'sent', sent_at: new Date().toISOString() } : null)
        onThreadUpdate?.()
      } else {
        setError(data.error === 'whatsapp_window_expired' ? data.message : data.error)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  // Regenerate draft
  const handleRegenerate = async () => {
    if (!draft) return
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/copilot/drafts/${draft.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additional_instructions: additionalInstructions || undefined,
          user_id: user?.id,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setDraft(data.draft)
        setEditableBody(data.draft.draft_body)
        setIsEditing(false)
        setShowRegenInput(false)
        setAdditionalInstructions('')
        onThreadUpdate?.()
      } else {
        setError(data.error)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRegenerating(false)
    }
  }

  // Phase 1: look up the spawned itinerary (if any) when a Concierge thread
  // is selected. Either renders the "Create itinerary" button or the
  // "View itinerary →" link.
  useEffect(() => {
    if (!thread || thread.origin !== 'concierge') {
      setSpawnedItinerary(null)
      setCommitError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/copilot/threads/${thread.id}/commit-itinerary`)
        const data = await res.json()
        if (cancelled) return
        if (data.success && data.itinerary) {
          setSpawnedItinerary(data.itinerary)
        } else {
          setSpawnedItinerary(null)
        }
      } catch {
        if (!cancelled) setSpawnedItinerary(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [thread?.id, thread?.origin])

  // Phase 1: commit the Concierge brief to a new itinerary. Idempotent at the
  // server (one itinerary per thread, enforced by partial UNIQUE INDEX) — a
  // second press just re-surfaces the existing one.
  const handleCommitItinerary = async () => {
    if (!thread) return
    setCommitting(true)
    setCommitError(null)
    try {
      const res = await fetch(`/api/copilot/threads/${thread.id}/commit-itinerary`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!data.success) {
        setCommitError(data.error || 'Failed to create itinerary.')
        return
      }
      setSpawnedItinerary({
        id: data.itinerary_id,
        itinerary_code: data.itinerary_code,
        trip_name: data.trip_name,
      })
    } catch (err: any) {
      setCommitError(err?.message || 'Failed to create itinerary.')
    } finally {
      setCommitting(false)
    }
  }

  // Generate draft on demand (Concierge-origin threads only — auto-poller is
  // gated off for those because briefs require deliberate operator review).
  // Reuses the same /api/copilot/drafts endpoint as the auto-path.
  const handleGenerateDraftOnDemand = async () => {
    if (!thread || !inboxMessage) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/copilot/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inbox_message_id: inboxMessage.id,
          thread_id: thread.id,
          user_id: user?.id,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || tDraft('failedToGenerate'))
        return
      }
      onThreadUpdate?.()
    } catch (err: any) {
      setError(err?.message || tDraft('failedToGenerate'))
    } finally {
      setLoading(false)
    }
  }

  // Empty state
  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Select a conversation to review</p>
          <p className="text-xs mt-1">AI-generated drafts will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
      {/* Escalation Banner */}
      {draft?.ai_flags?.escalate && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-red-800">AI Recommends Escalation</div>
            <div className="text-xs text-red-700 mt-0.5">
              {draft.ai_flags.escalation_reason || 'This message may require senior attention.'}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            thread.channel === 'whatsapp' ? 'bg-green-100' : 'bg-blue-100'
          }`}>
            {thread.channel === 'whatsapp'
              ? <MessageSquare className="w-4 h-4 text-green-600" />
              : <Mail className="w-4 h-4 text-blue-600" />
            }
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">
              {thread.client_name || thread.contact_info}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>{thread.contact_info}</span>
              {draft?.ai_flags?.message_type && (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium">
                  {draft.ai_flags.message_type.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* WhatsApp window countdown */}
        {thread.channel === 'whatsapp' && whatsappTimeLeft !== null && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isWhatsappExpired ? 'bg-red-100 text-red-700' :
            whatsappTimeLeft < 3600000 ? 'bg-orange-100 text-orange-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            <Clock className="w-3 h-3" />
            {isWhatsappExpired ? 'Window Expired' : formatTimeLeft(whatsappTimeLeft)}
          </div>
        )}

        {thread.client_id && (
          <a
            href={`/clients/${thread.client_id}`}
            className="text-xs text-[#647C47] hover:underline flex items-center gap-1"
          >
            <User className="w-3 h-3" />
            Profile
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Phase 1 — Concierge brief commit banner. Operator decides when to
          spin an itinerary from the brief; idempotent on the server side. */}
      {thread.origin === 'concierge' && (
        <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
          {spawnedItinerary ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-purple-800">
                <span className="font-medium">✓ Itinerary created</span>
                <span className="text-purple-600 ml-2">
                  {spawnedItinerary.itinerary_code} — {spawnedItinerary.trip_name}
                </span>
              </div>
              <a
                href={`/itineraries/${spawnedItinerary.id}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-white border border-purple-200 rounded-md hover:bg-purple-100 transition-colors"
              >
                View itinerary
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-purple-800">
                <span className="font-medium">{tConcierge('briefLabel')}</span>
                <span className="text-purple-600 ml-2">
                  Ready to commit to an itinerary when you are.
                </span>
              </div>
              <button
                onClick={handleCommitItinerary}
                disabled={committing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-700 rounded-md hover:bg-purple-800 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {committing ? 'Creating…' : 'Create itinerary from brief'}
              </button>
            </div>
          )}
          {commitError && (
            <div className="mt-2 text-xs text-red-700">{commitError}</div>
          )}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Original Message */}
        {inboxMessage && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">Customer Message</div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              {inboxMessage.subject && (
                <div className="text-xs text-gray-500 mb-1 font-medium">Subject: {inboxMessage.subject}</div>
              )}
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{inboxMessage.message_body}</div>
              <div className="text-[10px] text-gray-400 mt-2">
                {new Date(inboxMessage.received_at).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Context Panel (collapsible) */}
        {draft?.context_used && (
          <div>
            <button
              onClick={() => setShowContext(!showContext)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Context used by AI
            </button>
            {showContext && (
              <div className="mt-2">
                <CopilotContextCard context={draft.context_used as CopilotContext} />
              </div>
            )}
          </div>
        )}

        {/* Operator Notes */}
        {draft?.operator_notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">AI Notes for Operator</div>
            <div className="text-xs text-amber-800">{draft.operator_notes}</div>
          </div>
        )}

        {/* Draft Section */}
        {draft ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">AI Draft</span>
                <Sparkles className="w-3 h-3 text-[#647C47]" />
                {draft.ai_confidence && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    draft.ai_confidence === 'high' ? 'bg-green-100 text-green-700' :
                    draft.ai_confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {draft.ai_confidence} confidence
                  </span>
                )}
                {draft.generation_time_ms && (
                  <span className="text-[10px] text-gray-400">{(draft.generation_time_ms / 1000).toFixed(1)}s</span>
                )}
              </div>
              {draft.status === 'pending' && (
                <button
                  onClick={() => {
                    setIsEditing(!isEditing)
                    if (!isEditing && textareaRef.current) {
                      setTimeout(() => textareaRef.current?.focus(), 0)
                    }
                  }}
                  className="text-xs text-[#647C47] hover:underline"
                >
                  {isEditing ? 'Cancel edit' : 'Edit'}
                </button>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              {isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={editableBody}
                  onChange={(e) => setEditableBody(e.target.value)}
                  className="w-full p-4 text-sm text-gray-800 resize-none focus:outline-none min-h-[200px]"
                  rows={10}
                />
              ) : (
                <div className="p-4 text-sm text-gray-800 whitespace-pre-wrap">
                  {draft.was_edited && draft.edited_body ? draft.edited_body : draft.draft_body}
                </div>
              )}

              {/* Character count */}
              <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex justify-between text-[10px] text-gray-400">
                <span>{editableBody.length} chars</span>
                {draft.was_edited && <span className="text-amber-500">Edited by operator</span>}
                {draft.status === 'sent' && <span className="text-green-600">Sent at {draft.sent_at ? new Date(draft.sent_at).toLocaleString() : ''}</span>}
              </div>
            </div>

            {/* Regenerate input */}
            {showRegenInput && draft.status === 'pending' && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Additional instructions for Claude (optional)..."
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                  onKeyDown={(e) => e.key === 'Enter' && handleRegenerate()}
                />
              </div>
            )}
          </div>
        ) : inboxMessage?.status === 'draft_failed' ? (
          <div className="py-6">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-red-800">Draft generation failed</div>
                <div className="text-xs text-red-700 mt-0.5">
                  {inboxMessage.last_error || 'Unknown error.'}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleGenerateDraftOnDemand}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-md hover:bg-[#4a5c35] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          </div>
        ) : inboxMessage?.status === 'draft_pending' ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Generating AI draft...
          </div>
        ) : inboxMessage?.status === 'new' && thread?.origin === 'concierge' ? (
          <div className="text-center py-8">
            <button
              onClick={handleGenerateDraftOnDemand}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-md hover:bg-[#4a5c35] transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? tDraft('generating') : tDraft('generate')}
            </button>
            <div className="mt-2 text-xs text-gray-400">
              {tConcierge('noAutoDraft')}
            </div>
          </div>
        ) : inboxMessage?.status === 'new' ? (
          <div className="text-center py-8 text-sm text-gray-400">
            Waiting for AI to generate a draft...
          </div>
        ) : null}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Action Bar (sticky bottom) */}
      {draft && draft.status !== 'sent' && draft.status !== 'rejected' && (
        <div className="px-4 py-3 bg-white border-t border-gray-200 flex items-center gap-2">
          {draft.status === 'pending' && (
            <>
              <button
                onClick={() => setShowRegenInput(!showRegenInput)}
                disabled={regenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                {regenerating ? 'Regenerating...' : showRegenInput ? 'Generate' : 'Regenerate'}
              </button>
              {showRegenInput && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-md hover:bg-[#4a5c35] transition-colors disabled:opacity-50"
                >
                  Go
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-md hover:bg-[#4a5c35] transition-colors disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {loading ? 'Approving...' : 'Approve'}
              </button>
            </>
          )}

          {draft.status === 'approved' && (
            <>
              <div className="flex-1 text-xs text-green-600 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Draft approved
              </div>
              <button
                onClick={handleSend}
                disabled={sending || isWhatsappExpired}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 ${
                  isWhatsappExpired
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
                title={isWhatsappExpired ? 'WhatsApp 24-hour window has expired' : 'Send message'}
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending...' : isWhatsappExpired ? 'Window Expired' : 'Send'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Sent confirmation */}
      {draft?.status === 'sent' && (
        <div className="px-4 py-3 bg-green-50 border-t border-green-200 flex items-center gap-2 text-sm text-green-700">
          <Check className="w-4 h-4" />
          Message sent successfully
          {draft.sent_at && (
            <span className="text-xs text-green-600 ml-auto">
              {new Date(draft.sent_at).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
