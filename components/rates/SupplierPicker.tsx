'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'

// ============================================
// Who this rate is bought from
// ============================================
// Every rate screen needs the same control, so it lives here once rather than
// four times. Two decisions are baked in:
//
// PREFERRED TYPE FIRST, EVERYONE STILL AVAILABLE. A page passes the type that
// naturally provides its service — a train rate wants a train operator — and
// those suppliers are grouped at the top. The rest of the roster stays
// selectable underneath, because the operator's own filing is not always the
// one this app expects: the railway they have used for years may still be
// recorded as 'transport', and a picker that hid it would be a picker that
// looked broken.
//
// OPTIONAL, ALWAYS. A rate whose provider nobody has recorded yet is normal.
// The empty choice is first and needs no explaining.

export interface PickableSupplier {
  id: string
  name: string
  /** Primary role, used only for display fallbacks. */
  type: string | null
  /** Every role this supplier fills — what the grouping actually asks. */
  types?: string[] | null
  city?: string | null
}

interface Props {
  value: string
  onChange: (supplierId: string, supplier: PickableSupplier | null) => void
  /** The supplier type that naturally provides this service, grouped first. */
  preferredType: string
  /** What to call that group, e.g. "Train Operators". */
  preferredLabel: string
  label?: string
  className?: string
}

export default function SupplierPicker({
  value, onChange, preferredType, preferredLabel, label = 'Supplier', className = '',
}: Props) {
  const [suppliers, setSuppliers] = useState<PickableSupplier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/suppliers?status=active')
        const data = await res.json()
        if (cancelled) return
        const rows: PickableSupplier[] = (data.data || data.suppliers || data || [])
          .map((s: any) => ({ id: s.id, name: s.name, type: s.type ?? null, types: s.types ?? null, city: s.city ?? null }))
          .filter((s: PickableSupplier) => s.id && s.name)
        rows.sort((a, b) => a.name.localeCompare(b.name))
        setSuppliers(rows)
      } catch {
        // A roster we cannot read leaves the picker empty rather than blocking
        // the rate: the rest of the form still saves.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // A driver who also meets clients airside belongs in the airport group too,
  // which is the whole point of a supplier having more than one role.
  const fills = (s: PickableSupplier) => (s.types?.length ? s.types : s.type ? [s.type] : [])
  const preferred = suppliers.filter(s => fills(s).includes(preferredType))
  const others = suppliers.filter(s => !fills(s).includes(preferredType))
  const describe = (s: PickableSupplier) => (s.city ? `${s.name} — ${s.city}` : s.name)

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-cyan-600" />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value, suppliers.find(s => s.id === e.target.value) ?? null)}
        disabled={loading}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] disabled:bg-gray-50"
      >
        <option value="">{loading ? 'Loading suppliers…' : 'Not recorded yet'}</option>
        {preferred.length > 0 && (
          <optgroup label={preferredLabel}>
            {preferred.map(s => <option key={s.id} value={s.id}>{describe(s)}</option>)}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Other suppliers">
            {others.map(s => <option key={s.id} value={s.id}>{describe(s)}</option>)}
          </optgroup>
        )}
      </select>
      {!loading && preferred.length === 0 && (
        <p className="text-xs text-gray-400 mt-1">
          No {preferredLabel.toLowerCase()} on file yet — any supplier can be chosen, or add one under Suppliers.
        </p>
      )}
    </div>
  )
}
