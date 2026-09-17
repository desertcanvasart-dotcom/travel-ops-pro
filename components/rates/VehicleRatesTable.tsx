'use client'

// ============================================
// Vehicle prices: one table for every rate that prices vehicles
// ============================================
// A transportation rate and a transport package both price a list of
// vehicles (lib/rates/vehicle-bands). They were entered on two different
// forms — the package form had five fixed vehicles and its own capacities —
// so a vehicle added in Settings → Vocabulary could be priced on one and not
// the other (operator, 2026-09-17: "they are different; that will cause
// trouble"). Both forms now use this table:
//
//   - one row per vehicle in Settings → Vocabulary → Vehicle types, plus any
//     vehicle the rate already prices that the vocabulary no longer lists
//     (shown, never dropped)
//   - one price per vehicle; blank = the vehicle is not offered
//   - passenger sizes are the VOCABULARY's, shown and not editable
//     ("transportation rates always follow the Vocabulary vehicle sizes");
//     a vehicle the vocabulary does not list keeps the size it was entered with

import { useTranslations } from 'next-intl'
import { useVehicleLabel } from '@/hooks/useVehicleLabel'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import { PRESET_VEHICLE_BANDS, PRESET_VEHICLE_KEYS, vehicleBands, type VehicleBandRate } from '@/lib/rates/vehicle-bands'

/** One vehicle in the form: its price as typed, and its size. */
export interface VehicleFormRow {
  rate_eur: string
  capacity_min: number
  capacity_max: number
  /** False for a vehicle the vocabulary no longer lists. */
  inVocabulary: boolean
}

export type VehicleFormRows = Record<string, VehicleFormRow>

export interface VehicleOption {
  value: string
  label: string
  min: number
  max: number
}

/** The agency's vehicles with their sizes — the five presets until the vocabulary loads. */
export function useVehicleOptions(): { options: VehicleOption[]; vehicleName: (key: string) => string } {
  const t = useTranslations('rates.transportation')
  const vehicleLabel = useVehicleLabel()
  const vocab = useVocabOptions('vehicle_type', PRESET_VEHICLE_KEYS.map(k => ({
    value: k, label: t(k), meta: { min_pax: PRESET_VEHICLE_BANDS[k].min, max_pax: PRESET_VEHICLE_BANDS[k].max },
  })))
  const options = vocab.map(o => {
    const preset = PRESET_VEHICLE_BANDS[o.value as keyof typeof PRESET_VEHICLE_BANDS]
    return {
      value: o.value,
      label: o.label,
      min: Number(o.meta.min_pax) || preset?.min || 1,
      max: Number(o.meta.max_pax) || preset?.max || 45,
    }
  })
  const vehicleName = (key: string) => options.find(o => o.value === key)?.label ?? vehicleLabel(key, key)
  return { options, vehicleName }
}

/** The form rows for a stored row (null = a new rate). */
export function vehicleRowsFor(row: Record<string, unknown> | null, options: readonly VehicleOption[]): VehicleFormRows {
  const bands = row ? vehicleBands(row) : []
  const rows: VehicleFormRows = {}
  for (const o of options) {
    const b = bands.find(x => x.key === o.value)
    rows[o.value] = { rate_eur: b ? String(b.rate_eur) : '', capacity_min: o.min, capacity_max: o.max, inVocabulary: true }
  }
  for (const b of bands) {
    if (!rows[b.key]) rows[b.key] = { rate_eur: String(b.rate_eur), capacity_min: b.capacity_min, capacity_max: b.capacity_max, inVocabulary: false }
  }
  return rows
}

/** The `vehicles` list a form saves: priced vehicles only. The server stamps
 *  the vocabulary's sizes again (lib/rates/vehicle-bands-server). */
export function vehicleListFromRows(rows: VehicleFormRows): VehicleBandRate[] {
  return Object.entries(rows)
    .filter(([, r]) => r.rate_eur !== '' && parseFloat(r.rate_eur) > 0)
    .map(([key, r]) => ({ key, rate_eur: parseFloat(r.rate_eur), rate_non_eur: null, capacity_min: r.capacity_min, capacity_max: r.capacity_max }))
}

export default function VehicleRatesTable({
  rows,
  onChange,
  vehicleName,
  currency,
}: {
  rows: VehicleFormRows
  onChange: (rows: VehicleFormRows) => void
  vehicleName: (key: string) => string
  /** The rate's own currency, shown on the price column. */
  currency?: string
}) {
  const t = useTranslations('rates.transportation')
  return (
    <div className="space-y-2">
      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full" data-testid="vehicle-rates-table">
          <thead>
            <tr className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="text-left px-3 py-2 font-medium">{t('vehicle')}</th>
              <th className="text-center px-3 py-2 font-medium">{t('capacity')}</th>
              <th className="text-center px-3 py-2 font-medium">{currency ? `${t('singlePrice')} (${currency})` : t('singlePrice')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(rows).map(([key, row]) => (
              <tr key={key} className={`border-t border-gray-200 ${row.inVocabulary ? '' : 'opacity-70'}`}>
                <td className="px-3 py-2">
                  <span className="text-sm font-medium text-gray-700">{vehicleName(key)}</span>
                  {!row.inVocabulary && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700">{t('notInVocabulary')}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-xs text-gray-600" title={row.inVocabulary ? t('sizeFromVocabulary') : undefined}>
                  {t('paxRange', { min: row.capacity_min, max: row.capacity_max })}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={row.rate_eur}
                    onChange={(e) => onChange({ ...rows, [key]: { ...row, rate_eur: e.target.value } })}
                    step="0.01"
                    min="0"
                    placeholder="—"
                    aria-label={`${vehicleName(key)} ${t('singlePrice')}`}
                    className="w-full px-2 py-1 text-sm text-center border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{t('vehicleRatesHint')}</p>
    </div>
  )
}
