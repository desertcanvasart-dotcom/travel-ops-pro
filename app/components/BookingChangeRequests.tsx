'use client'

// Pending party-size requests from the portal. Approving bumps the booked
// count and seeds the new traveller slots — and reminds the operator the price
// must be recomputed, since adding people changes what is owed.
import { useCallback, useEffect, useState } from 'react'
import { Loader2, UserPlus, Check, X } from 'lucide-react'

type Req = {
  id: string
  requested_count: number
  note: string | null
  requested_via: string
  status: string
  created_at: string
}

export default function BookingChangeRequests({ bookingId }: { bookingId: string }) {
  const [reqs, setReqs] = useState<Req[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/bookings/${bookingId}/change-requests`)
    if (res.ok) setReqs((await res.json()).requests || [])
  }, [bookingId])
  useEffect(() => { load() }, [load])

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/change-requests/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && action === 'approve' && data.repriceNeeded) {
        setNotice(`Added ${data.added}. Booked count is now ${data.newBookedCount} — re-price this booking.`)
      }
      await load()
    } finally { setBusy(null) }
  }

  const pending = reqs.filter(r => r.status === 'pending')
  if (pending.length === 0 && !notice) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      {notice && <p className="text-sm text-amber-900 font-medium mb-2">{notice}</p>}
      {pending.map(r => (
        <div key={r.id} className="flex items-start justify-between gap-3 py-1">
          <div className="flex items-start gap-2">
            <UserPlus className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm text-amber-900 font-medium">
                Add {r.requested_count} traveller{r.requested_count > 1 ? 's' : ''} (requested from the portal)
              </p>
              {r.note && <p className="text-xs text-amber-800">“{r.note}”</p>}
              <p className="text-[11px] text-amber-700">Approving bumps the count and adds blank slots — re-price afterwards.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={() => resolve(r.id, 'approve')} disabled={busy === r.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
              {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
            </button>
            <button type="button" onClick={() => resolve(r.id, 'reject')} disabled={busy === r.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
