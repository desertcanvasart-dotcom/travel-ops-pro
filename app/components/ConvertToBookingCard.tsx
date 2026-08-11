'use client'

// ============================================
// CONVERT TO BOOKING — the operator-facing half of /api/bookings/from-quote
// ============================================
// Turns an accepted quote into a booking in one action, with the deposit
// percentage editable before committing. The percentage is shown as a live
// money figure, because "30%" and "€1,746.62" are not equally reviewable — the
// operator is about to put the second number in front of a client.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, BookmarkCheck, AlertTriangle } from 'lucide-react'

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  EGP: 'E£',
  JPY: '¥',
}

/** JPY has no minor unit. Mirrors lib/currency-totals.ts. */
function formatMoney(amount: number, currency: string): string {
  const code = (currency || 'EUR').toUpperCase()
  const decimals = code === 'JPY' ? 0 : 2
  return `${CURRENCY_SYMBOLS[code] || code + ' '}${amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

interface Props {
  quoteId: string
  quoteType: 'b2b' | 'b2c'
  /** The agreed total — the booking is built from this, not the itinerary total. */
  sellingPrice: number | null
  currency: string | null
  /** Set when this quote already produced a booking. */
  existingBooking?: { id: string; code: string } | null
}

export default function ConvertToBookingCard({
  quoteId,
  quoteType,
  sellingPrice,
  currency,
  existingBooking = null,
}: Props) {
  const t = useTranslations('bookings.fromQuote')
  const router = useRouter()
  const [depositPercent, setDepositPercent] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState(existingBooking)

  const total = Number(sellingPrice ?? 0)
  const code = (currency || 'EUR').toUpperCase()
  // Rounded the same way the server does, so the preview matches what is stored.
  const depositAmount = Math.round(((total * depositPercent) / 100) * 100) / 100

  const convert = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bookings/from-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quoteId,
          quote_type: quoteType,
          deposit_percent: depositPercent,
        }),
      })
      const json = await res.json()

      if (!json.success) {
        // A 409 carries the booking that already exists — show it as the outcome
        // rather than as a failure, since the quote IS booked.
        if (res.status === 409 && json.booking_id) {
          setBooked({ id: json.booking_id, code: json.booking_code })
          return
        }
        setError(json.error || t('failed'))
        return
      }

      router.push(`/bookings/${json.data.id}`)
    } catch {
      setError(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  if (booked) {
    return (
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="text-base font-semibold mb-2 text-blue-900 flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4" />
          {t('alreadyBooked')}
        </h3>
        <button
          onClick={() => router.push(`/bookings/${booked.id}`)}
          className="text-sm text-blue-700 underline"
        >
          {booked.code}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
      <h3 className="text-base font-semibold mb-2 text-blue-900">{t('title')}</h3>
      <p className="text-sm text-blue-700 mb-4">{t('description')}</p>

      {error && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0 mt-0.5" />
          <p className="text-yellow-800 text-xs">{error}</p>
        </div>
      )}

      <label className="block text-xs font-medium text-blue-900 mb-1" htmlFor="deposit-percent">
        {t('depositPercent')}
      </label>
      <div className="flex items-center gap-3 mb-4">
        <input
          id="deposit-percent"
          type="number"
          min={0}
          max={100}
          step={1}
          value={depositPercent}
          onChange={(e) => {
            // Clamped here as well as server-side: the server is the guarantee,
            // but the operator should never see an impossible preview figure.
            const next = Number(e.target.value)
            if (!Number.isFinite(next)) return
            setDepositPercent(Math.min(100, Math.max(0, next)))
          }}
          className="w-20 px-2 py-1.5 text-sm border border-blue-200 rounded-md bg-white"
        />
        <span className="text-sm text-blue-900">
          {t('depositPreview', {
            deposit: formatMoney(depositAmount, code),
            total: formatMoney(total, code),
          })}
        </span>
      </div>

      <button
        onClick={convert}
        disabled={busy || total <= 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium text-sm transition-colors disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('converting')}
          </>
        ) : (
          <>
            <BookmarkCheck className="w-4 h-4" />
            {t('convert')}
          </>
        )}
      </button>
    </div>
  )
}
