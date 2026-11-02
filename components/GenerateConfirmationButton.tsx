'use client'

// ============================================
// 予約確認書兼請求書 for one customer's trip
// ============================================
// The office's booking confirmation that is also the invoice. The trip, its
// programme, its booking's travellers and one of its invoices fill it; this
// dialog collects what no record holds yet:
//   - the flights, which are SAVED to the trip (itineraries.flights) so they
//     are typed once, not on every reissue
//   - 担当者, 作成日, rooms and room type — printed as typed, never saved,
//     like every other document dialog here
// The 備考 and the bank account are the company's standing text (Company
// profile), not typed per booking — and kept out of the URL, where a long
// Japanese block is what turns a request into an HTTP 431.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from 'lucide-react'
import { normaliseTripFlights, type TripFlight } from '@/lib/itineraries/flights'

interface Props {
  itineraryId: string
  clientName: string
  /** itineraries.flights as read; normalised here. */
  flights?: unknown
  onFlightsSaved?: (flights: TripFlight[]) => void
  openSignal?: number
}

interface InvoiceOption {
  id: string
  invoice_number: string
  invoice_type: string | null
  status: string | null
}

const EMPTY: TripFlight = { date: '', from: '', to: '', flight_no: '', depart: '', arrive: '', status: 'OK' }

function todayLocalISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function GenerateConfirmationButton({ itineraryId, clientName, flights, onFlightsSaved, openSignal = 0 }: Props) {
  const t = useTranslations('itineraries.confirmation')
  const [open, setOpen] = useState(false)
  useEffect(() => { if (openSignal > 0) setOpen(true) }, [openSignal])

  const [rows, setRows] = useState<TripFlight[]>([])
  const [invoices, setInvoices] = useState<InvoiceOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    invoice_id: '',
    representative: clientName ?? '',
    staff: '',
    created_date: todayLocalISO(),
    rooms: '',
    room_type: '',
  })

  // Fresh from the record each time the dialog opens — the trip may have
  // been edited since the page loaded.
  useEffect(() => {
    if (!open) return
    const stored = normaliseTripFlights(flights) ?? []
    setRows(stored.length ? stored : [{ ...EMPTY }, { ...EMPTY }])
    let cancelled = false
    fetch(`/api/invoices?itineraryId=${encodeURIComponent(itineraryId)}`)
      .then(r => r.json())
      .then(list => {
        if (cancelled || !Array.isArray(list)) return
        setInvoices(list.filter((i: InvoiceOption) => i.status !== 'cancelled'))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, flights, itineraryId])

  const setRow = (i: number, key: keyof TripFlight, value: string) =>
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)))

  async function generate(format: 'pdf' | 'print') {
    setError(null)
    const cleaned = normaliseTripFlights(rows) ?? []
    const stored = normaliseTripFlights(flights) ?? []
    // Save the flights first so the document reads them from the trip. A
    // failure is reported, and the document still opens with what was saved.
    if (JSON.stringify(cleaned) !== JSON.stringify(stored)) {
      setSaving(true)
      try {
        const res = await fetch(`/api/itineraries/${itineraryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flights: cleaned }),
        })
        if (!res.ok) setError(t('flightsNotSaved'))
        else onFlightsSaved?.(cleaned)
      } catch {
        setError(t('flightsNotSaved'))
      } finally {
        setSaving(false)
      }
    }

    const qs = new URLSearchParams({ itinerary_id: itineraryId })
    for (const [k, v] of Object.entries(form)) if (v) qs.set(k, v)
    qs.set('format', format === 'pdf' ? 'pdf' : 'html')
    if (format === 'print') qs.set('print', '1')
    window.open(`/api/documents/booking-confirmation?${qs.toString()}`, '_blank', 'noopener')
  }

  if (!open) return null

  const field = 'w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm'
  const label = 'block text-xs font-medium text-gray-600 mb-1'
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{t('title')}</h3>
          <p className="text-xs text-gray-500 mt-1">{t('hint')}</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{t('invoice')}</label>
              <select value={form.invoice_id} onChange={set('invoice_id')} className={field}>
                <option value="">{invoices.length ? t('latestInvoice') : t('noInvoice')}</option>
                {invoices.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number}{i.invoice_type ? ` · ${i.invoice_type}` : ''}{i.status ? ` · ${i.status}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{t('representative')}</label>
              <input value={form.representative} onChange={set('representative')} className={field} />
            </div>
            <div>
              <label className={label}>{t('staff')}</label>
              <input value={form.staff} onChange={set('staff')} className={field} />
            </div>
            <div>
              <label className={label}>{t('created')}</label>
              <input type="date" value={form.created_date} onChange={set('created_date')} className={field} />
            </div>
            <div>
              <label className={label}>{t('rooms')}</label>
              <input value={form.rooms} onChange={set('rooms')} className={field} inputMode="numeric" />
            </div>
            <div>
              <label className={label}>{t('roomType')}</label>
              <input value={form.room_type} onChange={set('room_type')} className={field} placeholder="ツイン" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={label}>{t('flights')}</span>
              <button
                type="button"
                onClick={() => setRows(prev => [...prev, { ...EMPTY }])}
                className="text-xs text-[#647C47] hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {t('addFlight')}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">{t('flightsHint')}</p>
            <div className="space-y-1.5">
              <div className="grid grid-cols-[8.5rem_1fr_1fr_5.5rem_4.5rem_4.5rem_3.5rem_1.5rem] gap-1 text-[11px] text-gray-500">
                <span>{t('fDate')}</span><span>{t('fFrom')}</span><span>{t('fTo')}</span><span>{t('fNo')}</span>
                <span>{t('fDepart')}</span><span>{t('fArrive')}</span><span>{t('fStatus')}</span><span />
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[8.5rem_1fr_1fr_5.5rem_4.5rem_4.5rem_3.5rem_1.5rem] gap-1 items-center">
                  <input type="date" value={r.date} onChange={e => setRow(i, 'date', e.target.value)} className={field} />
                  <input value={r.from} onChange={e => setRow(i, 'from', e.target.value)} className={field} placeholder="関西空港" />
                  <input value={r.to} onChange={e => setRow(i, 'to', e.target.value)} className={field} placeholder="ドバイ" />
                  <input value={r.flight_no} onChange={e => setRow(i, 'flight_no', e.target.value)} className={field} placeholder="EK317" />
                  <input value={r.depart} onChange={e => setRow(i, 'depart', e.target.value)} className={field} placeholder="23:45" />
                  <input value={r.arrive} onChange={e => setRow(i, 'arrive', e.target.value)} className={field} placeholder="04:35+1" />
                  <input value={r.status} onChange={e => setRow(i, 'status', e.target.value)} className={field} />
                  <button
                    type="button"
                    onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={t('removeFlight')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500">{t('profileHint')}</p>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
          <button
            onClick={() => generate('pdf')}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50"
          >
            {saving ? t('saving') : t('pdf')}
          </button>
          <button
            onClick={() => generate('print')}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-[#647C47] text-[#647C47] rounded-lg text-sm font-medium hover:bg-[#647C47]/10 disabled:opacity-50"
          >
            {t('print')}
          </button>
        </div>
      </div>
    </div>
  )
}
