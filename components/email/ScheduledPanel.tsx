'use client'

// ============================================
// The scheduled emails: when each goes, and a way to stop it
// ============================================
// Lists /api/gmail/scheduled. Cancel stops the send and leaves the message
// in Drafts; Open opens that draft to change it (the schedule keeps it — the
// draft is sent as it stands when the time comes). A failed one says why.

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Clock, Loader2, X } from 'lucide-react'
import { formatInZone } from '@/lib/time/zoned'

interface ScheduledEmail {
  id: string
  draft_id: string
  to_summary: string | null
  subject: string | null
  send_at: string
  time_zone: string | null
  status: 'scheduled' | 'sending' | 'failed'
  error: string | null
}

const ZONE_LABEL: Record<string, string> = { 'Asia/Tokyo': 'Japan', 'Africa/Cairo': 'Egypt' }

export default function ScheduledPanel({
  onClose,
  onOpenDraft,
}: {
  onClose: () => void
  onOpenDraft: (draftId: string) => void
}) {
  const [items, setItems] = useState<ScheduledEmail[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/gmail/scheduled')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load scheduled emails')
      setItems(data.scheduled as ScheduledEmail[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setItems([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const cancel = async (item: ScheduledEmail) => {
    if (!window.confirm(`Don't send "${item.subject || '(no subject)'}"? It stays in Drafts.`)) return
    setBusy(item.id)
    try {
      const res = await fetch(`/api/gmail/scheduled?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not cancel')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const when = (item: ScheduledEmail) => {
    const at = new Date(item.send_at)
    const zone = item.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone
    return `${formatInZone(at, zone)}${item.time_zone ? ` (${ZONE_LABEL[item.time_zone] ?? item.time_zone})` : ''}`
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4" /> Scheduled emails</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        {error && <p className="mx-5 mt-3 text-xs text-red-600">{error}</p>}
        <div className="flex-1 overflow-y-auto">
          {items === null ? (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map(item => (
                <li key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.subject || '(no subject)'}</p>
                    <p className="text-xs text-gray-500 truncate">{item.to_summary ? `To ${item.to_summary}` : ''}</p>
                    <p className={`text-xs mt-0.5 ${item.status === 'failed' ? 'text-red-600' : 'text-primary-700'}`}>
                      {item.status === 'failed'
                        ? <span className="inline-flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Not sent: {item.error}</span>
                        : item.status === 'sending' ? 'Sending now…' : `Sends ${when(item)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => onOpenDraft(item.draft_id)} className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded">Open</button>
                    {item.status !== 'sending' && (
                      <button onClick={() => cancel(item)} disabled={busy === item.id} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50">
                        {item.status === 'failed' ? 'Dismiss' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
