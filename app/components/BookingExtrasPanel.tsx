'use client'

// ============================================
// Extras and upgrades on a booking
// ============================================
// What was sold AFTER the trip was sold: a second tour, a business-class
// upgrade, an extra night. Only Confirm moves money — everything above it is a
// conversation with the customer — so Confirm is the only button that changes
// what they owe, and the panel says so after it does.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Check, X, Sparkles, ArrowUpRight, Trash2, AlertTriangle } from 'lucide-react'
import { currencySymbol } from '@/lib/currency-totals'
import { useConfirm } from '@/components/ConfirmDialog'

type Extra = {
  id: string
  kind: 'addon' | 'upgrade'
  title: string
  description: string | null
  quantity: number
  unit_price: number | null
  currency: string | null
  supplier_cost: number | null
  status: 'requested' | 'offered' | 'accepted' | 'confirmed' | 'declined' | 'withdrawn'
  requested_via: string
  invoiced_at: string | null
  line_amount: number | null
}

type Payload = {
  currency: string
  booking: { total_cost: number | null; base_total_cost: number | null; extras_total: number | null }
  extras: Extra[]
  confirmed_total: number | null
  excluded: Array<{ id: string; title: string; currency: string; amount: number }>
  problem: string | null
}

const STATUS_STYLE: Record<Extra['status'], string> = {
  requested: 'bg-amber-100 text-amber-800',
  offered: 'bg-blue-100 text-blue-800',
  accepted: 'bg-indigo-100 text-indigo-800',
  confirmed: 'bg-[#e8ede3] text-[#4a5c35]',
  declined: 'bg-gray-100 text-gray-600',
  withdrawn: 'bg-gray-100 text-gray-600',
}

const STATUS_LABEL: Record<Extra['status'], string> = {
  requested: 'Awaiting a price',
  offered: 'With the customer',
  accepted: 'Customer accepted',
  confirmed: 'Sold',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

const money = (amount: number | null | undefined, currency: string) =>
  amount == null ? '—' : `${currencySymbol(currency)}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

export default function BookingExtrasPanel({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const confirmDialog = useConfirm()

  const load = useCallback(async () => {
    const res = await fetch(`/api/bookings/${bookingId}/extras`)
    if (res.ok) setData(await res.json())
  }, [bookingId])
  useEffect(() => { load() }, [load])

  const act = async (extra: Extra, action: string, fields?: Record<string, unknown>) => {
    setBusy(extra.id); setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/extras/${extra.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...fields }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'That did not work.'); return }
      if (body.totals) {
        const cur = data?.currency || 'EUR'
        setNotice(
          action === 'withdraw'
            ? `“${extra.title}” withdrawn. The trip total is back to ${money(body.totals.total_cost, cur)} and the balance to ${money(body.totals.balance_due, cur)}.`
            : `“${extra.title}” sold. The trip total is now ${money(body.totals.total_cost, cur)} and the balance ${money(body.totals.balance_due, cur)} — the deposit is unchanged, extras settle with the balance.`
        )
      }
      await load()
    } finally { setBusy(null) }
  }

  const remove = async (extra: Extra) => {
    const ok = await confirmDialog(
      `“${extra.title}” has not been sold, so nothing on the booking changes.`,
      { title: 'Delete this extra?', confirmText: 'Delete', variant: 'danger' }
    )
    if (!ok) return
    setBusy(extra.id); setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/extras/${extra.id}`, { method: 'DELETE' })
      if (!res.ok) setError((await res.json().catch(() => ({})))?.error || 'Could not delete it.')
      await load()
    } finally { setBusy(null) }
  }

  if (!data) return null

  const live = data.extras.filter(e => e.status !== 'declined' && e.status !== 'withdrawn')
  const closed = data.extras.filter(e => e.status === 'declined' || e.status === 'withdrawn')
  const currency = data.currency

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#647C47]" />
          Extras and upgrades
          {data.confirmed_total ? (
            <span className="text-sm font-normal text-gray-500">
              — {money(data.confirmed_total, currency)} sold
            </span>
          ) : null}
        </h3>
        <button type="button" onClick={() => { setAdding(v => !v); setError(null) }}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#e8ede3]">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {notice && <p className="text-sm text-[#4a5c35] bg-[#e8ede3] rounded-lg px-3 py-2 mb-3">{notice}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {data.problem && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {data.problem}
        </p>
      )}
      {data.excluded.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-3">
          Not in the trip total because they are in another currency, and nothing here converts one:{' '}
          {data.excluded.map(x => `${x.title} (${money(x.amount, x.currency)})`).join(', ')}. Invoice these separately.
        </p>
      )}

      {adding && (
        <AddExtraForm
          bookingId={bookingId}
          currency={currency}
          onDone={async () => { setAdding(false); await load() }}
          onError={setError}
        />
      )}

      {live.length === 0 && !adding && (
        <p className="text-sm text-gray-500">
          Nothing extra sold on this booking yet. Add one when the customer asks for another tour, a
          better cabin, or an extra night.
        </p>
      )}

      <div className="divide-y">
        {[...live, ...closed].map(e => (
          <div key={e.id} className="py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-900 flex items-center gap-1.5 flex-wrap">
                {e.kind === 'upgrade' && <ArrowUpRight className="w-3.5 h-3.5 text-[#647C47] flex-shrink-0" />}
                <span className="font-medium">{e.title}</span>
                {e.quantity > 1 && <span className="text-gray-500">× {e.quantity}</span>}
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${STATUS_STYLE[e.status]}`}>
                  {STATUS_LABEL[e.status]}
                </span>
                {e.requested_via === 'portal' && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">from the portal</span>
                )}
              </p>
              {e.description && <p className="text-xs text-gray-600 mt-0.5">{e.description}</p>}
              <p className="text-xs text-gray-500 mt-0.5">
                {e.line_amount == null
                  ? 'No price yet'
                  : `${money(e.line_amount, e.currency || currency)}${e.kind === 'upgrade' ? ' (difference)' : ''}`}
                {e.invoiced_at && ' · invoiced'}
              </p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {busy === e.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              {e.status === 'requested' && (
                <PriceButton disabled={busy === e.id} currency={currency}
                  onPrice={(price, cur) => act(e, 'price', { unit_price: price, currency: cur })} />
              )}
              {(e.status === 'offered' || e.status === 'accepted') && (
                <button type="button" onClick={() => act(e, 'confirm')} disabled={busy === e.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
              )}
              {(e.status === 'requested' || e.status === 'offered') && (
                <button type="button" onClick={() => act(e, 'decline')} disabled={busy === e.id}
                  className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                  Decline
                </button>
              )}
              {(e.status === 'confirmed' || e.status === 'accepted') && !e.invoiced_at && (
                <button type="button" onClick={() => act(e, 'withdraw')} disabled={busy === e.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                  <X className="w-3.5 h-3.5" /> Withdraw
                </button>
              )}
              {(e.status === 'requested' || e.status === 'offered') && (
                <button type="button" onClick={() => remove(e)} disabled={busy === e.id}
                  title="Delete" className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// A price and its currency are entered together, because half of one is not a
// price — the API refuses the pair anyway.
function PriceButton({
  currency, disabled, onPrice,
}: { currency: string; disabled: boolean; onPrice: (price: string, currency: string) => void }) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState('')

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={disabled}
        className="px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#e8ede3] disabled:opacity-40">
        Price it
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500">{currencySymbol(currency)}</span>
      <input type="number" min="0" step="0.01" value={price} autoFocus
        onChange={e => setPrice(e.target.value)}
        className="w-24 px-2 py-1 text-xs border border-gray-300 rounded-lg" />
      <button type="button" disabled={disabled || price === ''}
        onClick={() => { onPrice(price, currency); setOpen(false); setPrice('') }}
        className="px-2 py-1 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
        Save
      </button>
      <button type="button" onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function AddExtraForm({
  bookingId, currency, onDone, onError,
}: { bookingId: string; currency: string; onDone: () => void; onError: (msg: string | null) => void }) {
  const [kind, setKind] = useState<'addon' | 'upgrade'>('addon')
  const [title, setTitle] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [supplierCost, setSupplierCost] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true); onError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/extras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, title, quantity,
          unit_price: price === '' ? null : price,
          currency,
          supplier_cost: supplierCost === '' ? null : supplierCost,
          supplier_currency: currency,
        }),
      })
      if (!res.ok) { onError((await res.json().catch(() => ({})))?.error || 'Could not add it.'); return }
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
      <div className="flex gap-2">
        {(['addon', 'upgrade'] as const).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${
              kind === k ? 'bg-[#647C47] text-white border-[#647C47]' : 'bg-white text-gray-700 border-gray-300'
            }`}>
            {k === 'addon' ? 'Add-on' : 'Upgrade'}
          </button>
        ))}
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)} required
        placeholder={kind === 'upgrade' ? 'Economy → Business, Cairo–Aswan' : 'Extra day at Abu Simbel'}
        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-gray-600">
          Quantity
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
        <label className="text-xs text-gray-600">
          {kind === 'upgrade' ? `Difference (${currencySymbol(currency)})` : `Price (${currencySymbol(currency)})`}
          <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
            placeholder="leave blank to quote later"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
        <label className="text-xs text-gray-600">
          We pay ({currencySymbol(currency)})
          <input type="number" min="0" step="0.01" value={supplierCost} onChange={e => setSupplierCost(e.target.value)}
            placeholder="optional"
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        </label>
      </div>
      <p className="text-[11px] text-gray-500">
        Adding it changes nothing the customer owes. Confirm does that, once they have agreed.
      </p>
      <button type="submit" disabled={busy || !title.trim()}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
      </button>
    </form>
  )
}
