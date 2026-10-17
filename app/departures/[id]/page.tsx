'use client'

// ============================================
// One departure: its seats and the holds on them
// /departures/[id]
//
// Website orders hold seats on their date's departure as PENDING holds
// (Order Intake → hold_departure_seats). Nothing showed them and nothing
// moved them on, so held seats were invisible on the list and grid, a lost
// order kept its seats for good, and a departure with a hold could never be
// deleted. Here the office sees every hold and confirms or releases it, and
// types the seats it sold outside the app (booked_pax). Taken = booked
// outside + confirmed + pending (lib/departures/seats) — the same figure the
// list, the grid, the availability check and the next web order use.
// ============================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Check, Loader2, Plane, Trash2, Undo2 } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { shortDate } from '@/lib/departures/programme-groups'

type DepartureStatus = 'draft' | 'open' | 'limited' | 'full' | 'guaranteed' | 'cancelled'

const STATUS_OPTIONS: { value: DepartureStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'limited', label: 'Limited' },
  { value: 'full', label: 'Full' },
  { value: 'guaranteed', label: 'Guaranteed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface Hold {
  id: string
  client_id: string | null
  client_name: string | null
  pax: number
  status: 'pending' | 'confirmed' | 'cancelled'
  notes: string | null
  created_at: string
}

interface Departure {
  id: string
  template_id: string | null
  tour_name: string
  tour_code: string | null
  start_date: string
  end_date: string
  duration_days: number
  status: DepartureStatus
  max_pax: number
  min_pax: number | null
  booked_pax: number
  held_confirmed: number
  held_pending: number
  seats_taken: number
  seats_free: number
  price_per_person: number | null
  currency: string | null
  externally_managed: boolean
  internal_notes: string | null
  bookings: Hold[]
}

const HOLD_STYLE: Record<Hold['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function DepartureDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const confirmDialog = useConfirm()

  const [dep, setDep] = useState<Departure | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [maxDraft, setMaxDraft] = useState('')
  const [bookedDraft, setBookedDraft] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/departures/${id}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Could not load the departure')
      setDep(json.data)
      setMaxDraft(String(json.data.max_pax ?? ''))
      setBookedDraft(String(json.data.booked_pax ?? 0))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load the departure')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice(null), 4000)
  }

  const put = async (body: Record<string, unknown>, key: string) => {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Could not save')
      await load()
      return json
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save')
      return null
    } finally {
      setBusy(null)
    }
  }

  const saveSeats = async () => {
    if (!dep) return
    const max = Number(maxDraft)
    const booked = Number(bookedDraft)
    if (!Number.isInteger(max) || max < 1 || !Number.isInteger(booked) || booked < 0) {
      setError('Seats must be a whole number of at least 1, and booked outside the app a whole number')
      return
    }
    const body: Record<string, unknown> = {}
    if (max !== dep.max_pax) body.max_pax = max
    if (booked !== dep.booked_pax) body.booked_pax = booked
    if (Object.keys(body).length === 0) return
    if (await put(body, 'seats')) flash('Seats saved.')
  }

  const changeStatus = async (status: DepartureStatus) => {
    if (!dep || status === dep.status) return
    if (status === 'cancelled') {
      const pending = dep.bookings.filter(h => h.status === 'pending').length
      const confirmed = dep.bookings.filter(h => h.status === 'confirmed').length
      const parts = [
        pending ? `${pending} pending hold(s) will be released` : null,
        confirmed ? `${confirmed} confirmed hold(s) stay until you release them below` : null,
      ].filter(Boolean)
      if (!(await confirmDialog(`Cancel this departure?${parts.length ? ` ${parts.join('; ')}.` : ''}`))) return
    }
    const json = await put({ status }, 'status')
    if (json?.cancellation) {
      const { holds_released, confirmed_holds } = json.cancellation as { holds_released: number; confirmed_holds: number }
      flash(`Departure cancelled. ${holds_released} pending hold(s) released${confirmed_holds ? `; ${confirmed_holds} confirmed hold(s) still need rehoming` : ''}.`)
    } else if (json) {
      flash('Status saved.')
    }
  }

  const actOnHold = async (hold: Hold, action: 'confirm' | 'release') => {
    if (action === 'release' &&
        !(await confirmDialog(`Release ${hold.client_name || 'this'} hold of ${hold.pax} seat(s)? The seats become free for other orders.`))) return
    setBusy(hold.id)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${id}/holds/${hold.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Could not update the hold')
      await load()
      flash(action === 'confirm' ? 'Hold confirmed.' : 'Hold released — its seats are free.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update the hold')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!dep || !(await confirmDialog('Delete this departure? This cannot be undone.'))) return
    setBusy('delete')
    setError(null)
    try {
      const res = await fetch(`/api/departures/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Could not delete')
      router.push(dep.template_id ? `/departures/grid/${dep.template_id}` : '/departures')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    )
  }

  const back = dep?.template_id ? `/departures/grid/${dep.template_id}` : '/departures'
  const mirrored = !!dep?.externally_managed
  const stat = (label: string, value: number | string, hint?: string) => (
    <div className="px-3 py-2 bg-gray-50 rounded-lg" title={hint}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
    </div>
  )

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-4">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#647C47]">
        <ArrowLeft className="w-4 h-4" />
        {dep?.template_id ? 'Dates & prices' : 'Departures'}
      </Link>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          <Check className="w-4 h-4" />
          {notice}
        </div>
      )}

      {dep && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-[#647C47]/10 rounded-lg flex items-center justify-center shrink-0">
                <Plane className="w-5 h-5 text-[#647C47]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-900 truncate">{dep.tour_name}</h1>
                <p className="text-sm text-gray-500">
                  {dep.tour_code ? `${dep.tour_code} · ` : ''}
                  {shortDate(dep.start_date)}
                  {dep.end_date && dep.end_date !== dep.start_date ? ` – ${shortDate(dep.end_date)}` : ''} · {dep.duration_days} days
                  {dep.price_per_person != null ? ` · ${dep.price_per_person.toLocaleString('en-US')} ${dep.currency ?? ''} per person` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={dep.status}
                disabled={mirrored || busy === 'status'}
                onChange={e => changeStatus(e.target.value as DepartureStatus)}
                className="!w-auto !h-8 !py-0 !px-2 !border !border-gray-200 !rounded-md !text-sm !bg-white"
                title="Only Open, Limited and Guaranteed dates take new web-order holds"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={remove}
                disabled={mirrored || busy === 'delete'}
                className="flex items-center gap-1.5 h-8 px-3 border border-gray-200 rounded-md text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>

          {mirrored && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              This departure is kept in sync by an integration. Its dates, seats, status and price are changed at the partner;
              edits here would be overwritten, so they are locked. You can still confirm and release seat holds.
            </div>
          )}

          {/* Seats */}
          <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Seats</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {stat('Seats', dep.max_pax)}
              {stat('Booked outside the app', dep.booked_pax, 'Seats you sold outside the app, typed below')}
              {stat('Held, confirmed', dep.held_confirmed)}
              {stat('Held, pending', dep.held_pending, 'Web-order holds waiting for you')}
              {stat('Free', dep.seats_free, `Seats − ${dep.seats_taken} taken`)}
            </div>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="block">
                <span className="text-xs text-gray-500">Seats (max pax)</span>
                <input
                  type="number"
                  min={1}
                  value={maxDraft}
                  disabled={mirrored}
                  onChange={e => setMaxDraft(e.target.value)}
                  className="mt-1 !w-24 !h-8 !px-2 !border !border-gray-200 !rounded-md !text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Booked outside the app</span>
                <input
                  type="number"
                  min={0}
                  value={bookedDraft}
                  disabled={mirrored}
                  onChange={e => setBookedDraft(e.target.value)}
                  className="mt-1 !w-24 !h-8 !px-2 !border !border-gray-200 !rounded-md !text-sm"
                />
              </label>
              <button
                onClick={saveSeats}
                disabled={mirrored || busy === 'seats'}
                className="flex items-center gap-1.5 h-8 px-3 bg-[#647C47] text-white rounded-md text-sm hover:bg-[#4f6238] disabled:opacity-50"
              >
                {busy === 'seats' && <Loader2 className="w-4 h-4 animate-spin" />}
                Save seats
              </button>
              <span className="text-xs text-gray-500">
                Taken = booked outside the app + confirmed + pending holds. Seats cannot go below what is taken.
              </span>
            </div>
          </section>

          {/* Holds */}
          <section className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Seat holds</h2>
              <p className="text-xs text-gray-500">
                Placed by website orders (Order Intake). Confirm a hold once the order is sold; release it when the order is lost
                — its seats are free again. Cancelling the departure releases its pending holds.
              </p>
            </div>
            {dep.bookings.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">No holds on this departure.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Client</th>
                    <th className="px-2 py-2 text-right font-medium">Pax</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                    <th className="px-2 py-2 text-left font-medium">Notes</th>
                    <th className="px-2 py-2 text-left font-medium">Placed</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dep.bookings.map(h => (
                    <tr key={h.id} className={h.status === 'cancelled' ? 'text-gray-400' : ''}>
                      <td className="px-4 py-2">
                        {h.client_id ? (
                          <Link href={`/clients/${h.client_id}`} className="hover:text-[#647C47] hover:underline">
                            {h.client_name || 'Client'}
                          </Link>
                        ) : (
                          h.client_name || '—'
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{h.pax}</td>
                      <td className="px-2 py-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${HOLD_STYLE[h.status]}`}>
                          {h.status === 'cancelled' ? 'released' : h.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-gray-600">{h.notes || ''}</td>
                      <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{h.created_at ? shortDate(h.created_at.slice(0, 10)) : ''}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {busy === h.id ? (
                          <Loader2 className="inline w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <>
                            {h.status === 'pending' && dep.status !== 'cancelled' && (
                              <button
                                onClick={() => actOnHold(h, 'confirm')}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-700 hover:bg-green-50 rounded"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Confirm
                              </button>
                            )}
                            {h.status !== 'cancelled' && (
                              <button
                                onClick={() => actOnHold(h, 'release')}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                Release
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}
