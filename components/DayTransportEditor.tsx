'use client'

// ============================================
// A programme day's transport — listed, changeable, like its attractions
// ============================================
// The day's transport was decided by rules and never shown (operator,
// 2026-09-16). This lists the lines the day will be priced with — from the
// engine itself, via /api/b2b/transport-preview — with what each costs, and
// lets the operator change a line's service, where it runs, remove it, or add
// one. The first change turns the day's list into the operator's own
// (`transport_lines`, lib/pricing/transport-lines); "Reset to automatic"
// hands the day back to the rules.

import { useTranslations } from 'next-intl'
import { Car, Plus, RotateCcw, X, AlertTriangle, Ship } from 'lucide-react'
import { useVocabLabel } from '@/hooks/useVocabLabel'
import {
  TRANSPORT_SERVICE_TYPES, isRoadTransfer, sanitizeTransportLines,
  type TransportLine, type TransportLineType,
} from '@/lib/pricing/transport-lines'
import type { PreviewDay, PreviewLine } from '@/app/api/b2b/transport-preview/route'

type Props = {
  /** The engine's view of this day; undefined while it loads. */
  preview: PreviewDay | undefined
  loading: boolean
  failed: boolean
  /** The day's own list as stored; undefined = automatic. */
  value: unknown
  city: string
  prevCity: string | null
  /** Formats a cost in the org's rate currency. */
  format: (amount: number) => string
  onChange: (lines: TransportLine[] | undefined) => void
}

/** What the rules produced, as an editable list the operator now owns. A
 *  line keeps its own city or route only where it differs from the day's
 *  default, so it keeps following the day otherwise. */
function fromPreview(lines: PreviewLine[], city: string, prevCity: string | null): TransportLine[] {
  return lines.map(l => {
    const line: TransportLine = { service_type: l.service_type as TransportLineType }
    if (l.city && l.city !== city) line.city = l.city
    if (isRoadTransfer(l.service_type)) {
      if (l.from && l.from !== prevCity) line.from = l.from
      if (l.to && l.to !== city) line.to = l.to
    }
    return line
  })
}

export default function DayTransportEditor({ preview, loading, failed, value, city, prevCity, format, onChange }: Props) {
  const t = useTranslations('b2bCalculator.transport')
  const vocabLabel = useVocabLabel('transport_service_type')
  const label = (type: string) => vocabLabel(type, t.has(`types.${type}`) ? t(`types.${type}`) : type)

  const stored = sanitizeTransportLines(value)
  const custom = stored !== undefined
  // The list being edited: the operator's own, else what the rules made.
  const base = (): TransportLine[] => stored ?? fromPreview(preview?.lines ?? [], city, prevCity)
  const canEdit = custom || Boolean(preview)

  const change = (i: number, patch: Partial<TransportLine>) => {
    const next = base().map((l, k) => {
      if (k !== i) return l
      const merged: TransportLine = { ...l, ...patch }
      // A route belongs only to a road transfer.
      if (!isRoadTransfer(merged.service_type)) { delete merged.from; delete merged.to }
      for (const key of ['city', 'from', 'to'] as const) if (!merged[key]) delete merged[key]
      return merged
    })
    onChange(next)
  }
  const remove = (i: number) => onChange(base().filter((_, k) => k !== i))
  const add = (type: string) => { if (type) onChange([...base(), { service_type: type as TransportLineType }]) }

  const rows = base()
  const shown = preview?.lines ?? []

  return (
    <div data-testid="day-transport">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-600">
          <Car className="w-3 h-3 inline mr-1" />{t('label')}
          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${custom ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
            {custom ? t('custom') : t('automatic')}
          </span>
        </label>
        {custom && (
          <button type="button" onClick={() => onChange(undefined)} className="inline-flex items-center gap-1 text-xs text-[#647C47] hover:underline">
            <RotateCcw className="w-3 h-3" />{t('reset')}
          </button>
        )}
      </div>

      {failed && <p className="text-xs text-red-600 mb-1">{t('loadFailed')}</p>}
      {!preview && loading && <p className="text-xs text-gray-400 mb-1">{t('loading')}</p>}

      {preview?.cruise_package && (
        <p className="text-xs text-blue-700 mb-1"><Ship className="w-3 h-3 inline mr-1" />{t('cruisePackage')}</p>
      )}
      {canEdit && rows.length === 0 && !preview?.cruise_package && (
        <p className="text-xs text-gray-500 mb-1">{t('none')}</p>
      )}

      <div className="space-y-1.5">
        {rows.map((line, i) => {
          // The engine's result for this line — same order as the list.
          const priced = shown[i]
          const road = isRoadTransfer(line.service_type)
          return (
            <div key={i} className={`rounded-lg border px-2 py-1.5 ${priced && priced.cost == null ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`} data-testid="transport-line">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={line.service_type}
                  onChange={e => change(i, { service_type: e.target.value as TransportLineType })}
                  className="px-2 py-1 border rounded text-xs bg-white"
                  aria-label={t('service')}
                >
                  {TRANSPORT_SERVICE_TYPES.map(type => <option key={type} value={type}>{label(type)}</option>)}
                </select>
                {road ? (
                  <>
                    <input
                      value={line.from ?? ''}
                      placeholder={priced?.from ?? prevCity ?? t('from')}
                      onChange={e => change(i, { from: e.target.value })}
                      className="w-28 px-2 py-1 border rounded text-xs"
                      aria-label={t('from')}
                    />
                    <span className="text-xs text-gray-400">→</span>
                    <input
                      value={line.to ?? ''}
                      placeholder={priced?.to ?? city}
                      onChange={e => change(i, { to: e.target.value })}
                      className="w-28 px-2 py-1 border rounded text-xs"
                      aria-label={t('to')}
                    />
                  </>
                ) : (
                  <input
                    value={line.city ?? ''}
                    placeholder={priced?.city ?? city}
                    onChange={e => change(i, { city: e.target.value })}
                    className="w-32 px-2 py-1 border rounded text-xs"
                    aria-label={t('city')}
                  />
                )}
                <span className={`ml-auto text-xs font-medium ${priced?.cost == null ? 'text-red-700' : 'text-gray-800'}`}>
                  {!priced ? '…' : priced.cost == null ? t('noRate') : format(priced.cost)}
                </span>
                <button type="button" onClick={() => remove(i)} className="p-1 text-gray-400 hover:text-red-600" aria-label={t('remove')} title={t('remove')}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {priced?.rate_name && priced.cost != null && (
                <p className="text-[11px] text-gray-500 mt-0.5">{priced.rate_name}</p>
              )}
              {priced?.message && (
                <p className="text-[11px] text-red-700 mt-0.5 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-px shrink-0" />{priced.message}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {canEdit && (
        <div className="mt-1.5 flex items-center gap-2">
          <Plus className="w-3 h-3 text-gray-400" />
          <select
            value=""
            onChange={e => add(e.target.value)}
            className="px-2 py-1 border rounded text-xs bg-white text-gray-600"
            aria-label={t('add')}
          >
            <option value="">{t('add')}</option>
            {TRANSPORT_SERVICE_TYPES.map(type => <option key={type} value={type}>{label(type)}</option>)}
          </select>
        </div>
      )}
      {custom && <p className="text-[11px] text-gray-500 mt-1">{t('customHint')}</p>}
      {preview && <p className="text-[11px] text-gray-400 mt-0.5">{t('costNote')}</p>}
    </div>
  )
}
