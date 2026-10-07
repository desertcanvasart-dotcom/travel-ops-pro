'use client'

// Cancel a trip from its itinerary page: a reason, and — when the trip has a
// booking — the booking cancelled with it (PUT /api/bookings/[id]). The
// booking goes first, so a refused booking change leaves the itinerary as it
// was rather than half cancelled. Money already received is not touched:
// refunds are recorded on the invoice. Ported from autoura-saas.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

export default function CancelTripDialog({ itineraryId, tripName, booking, paid, currency, onClose, onCancelled }: {
  itineraryId: string
  tripName: string
  booking: { id: string; booking_code: string } | null
  /** What the client has paid, to say so before cancelling. */
  paid: number | null
  currency: string
  onClose: () => void
  onCancelled: (reason: string | null) => void
}) {
  const t = useTranslations('itineraries.detail.cancelTrip')
  const [reason, setReason] = useState('')
  const [withBooking, setWithBooking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    const why = reason.trim() || null
    try {
      if (booking && withBooking) {
        const res = await fetch(`/api/bookings/${booking.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled', cancellation_reason: why, cancelled_at: new Date().toISOString() }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.success === false) {
          throw new Error(res.status === 403
            ? t('bookingForbidden', { code: booking.booking_code })
            : data.error || t('bookingFailed', { code: booking.booking_code }))
        }
      }
      const res = await fetch(`/api/itineraries/${itineraryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancellation_reason: why }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || t('failed'))
      onCancelled(why)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-trip-title">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
        <div>
          <h2 id="cancel-trip-title" className="text-base font-semibold text-gray-900">{t('title')}</h2>
          <p className="text-sm text-gray-600 mt-1">{t('body', { trip: tripName })}</p>
        </div>

        <label className="block text-sm text-gray-700">
          {t('reason')} <span className="text-gray-400">{t('optional')}</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder={t('reasonPlaceholder')} />
        </label>

        {booking && (
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={withBooking} onChange={e => setWithBooking(e.target.checked)} className="mt-0.5" />
            <span>{t('alsoBooking', { code: booking.booking_code })}</span>
          </label>
        )}

        {paid != null && paid > 0.005 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            {t('paidWarning', { amount: `${currency} ${paid.toFixed(2)}` })}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md">{t('keep')}</button>
          <button type="button" onClick={submit} disabled={saving} className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
