'use client'

// ============================================
// Travel insurance, from the office's side
// ============================================
// What each traveller asked for in the portal, what it costs, and the one
// action that matters: confirming it. A choice made in the portal is a request
// — this is where it becomes a charge, which is also what 領収金額合計 means on
// the paper form.
//
// The premium shown is quoted by the server against the trip's length and the
// traveller's age; confirming recomputes it there rather than trusting anything
// this component sends.

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Check, Loader2, Undo2 } from 'lucide-react'

interface Traveller {
  id: string
  name: string
  planCode: string | null
  age: number | null
  confirmedAt: string | null
  confirmedPremiumJpy: number | null
  quote: { planCode: string; bandLabel: string; premiumJpy: number } | null
  ineligible: 'trip_too_long' | 'age_above_band_limit' | 'no_band' | null
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`

const WHY: Record<string, string> = {
  trip_too_long: 'Trip is longer than 3 months — not insurable',
  age_above_band_limit: 'This band is limited to age 69',
  no_band: 'No rate for this trip length',
}

export default function InsuranceCard({ bookingId }: { bookingId: string }) {
  const [travellers, setTravellers] = useState<Traveller[]>([])
  const [ratesLoaded, setRatesLoaded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/insurance`)
      const data = await res.json()
      setTravellers(data.travellers ?? [])
      setRatesLoaded(data.ratesLoaded !== false)
    } catch {
      setError('Could not load insurance requests')
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => { load() }, [load])

  async function act(passengerId: string, confirm: boolean) {
    setBusy(passengerId)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/insurance`, {
        method: confirm ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passenger_id: passengerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.reason ? WHY[data.reason] ?? data.error : data.error ?? 'Could not update')
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  // Nothing requested is not a state worth a card.
  if (loading || travellers.length === 0) return null

  const confirmedTotal = travellers
    .filter(t => t.confirmedAt && t.confirmedPremiumJpy)
    .reduce((sum, t) => sum + Number(t.confirmedPremiumJpy), 0)

  return (
    <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <ShieldCheck size={16} className="text-[#647C47]" />
        Travel insurance
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Confirmed premiums are billed on the next invoice for this trip.
      </p>

      {!ratesLoaded && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          No premium table loaded, so nothing can be priced or confirmed yet.
        </p>
      )}

      <div className="space-y-2">
        {travellers.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-3 py-2 px-3 bg-gray-50 rounded-lg">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{t.name}</div>
              <div className="text-xs text-gray-500">
                {t.planCode ? `Plan ${t.planCode}` : 'No plan chosen yet'}
                {t.quote && ` · ${t.quote.bandLabel}`}
                {t.age != null && ` · age ${t.age}`}
              </div>
              {t.ineligible && (
                <div className="text-xs text-amber-700 mt-0.5">{WHY[t.ineligible]}</div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {t.confirmedAt && t.confirmedPremiumJpy
                  ? yen(t.confirmedPremiumJpy)
                  : t.quote
                    ? yen(t.quote.premiumJpy)
                    : '—'}
              </span>
              {t.confirmedAt ? (
                <button
                  onClick={() => act(t.id, false)}
                  disabled={busy === t.id}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  title="Withdraw this confirmation"
                >
                  {busy === t.id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                  Confirmed
                </button>
              ) : (
                <button
                  onClick={() => act(t.id, true)}
                  disabled={busy === t.id || !t.quote}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#647C47] text-white hover:bg-[#4a5c35] disabled:opacity-40"
                >
                  {busy === t.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Confirm
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirmedTotal > 0 && (
        <p className="text-sm text-gray-900 mt-3 pt-3 border-t border-gray-200 flex justify-between">
          <span className="text-gray-500">To be billed</span>
          <b className="tabular-nums">{yen(confirmedTotal)}</b>
        </p>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
