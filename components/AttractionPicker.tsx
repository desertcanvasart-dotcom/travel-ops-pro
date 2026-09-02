'use client'
// ============================================
// Pick a day's entrance tickets from the fee table
// ============================================
// A programme day used to name its sights as free text, and the pricing
// engine matched that text against entrance_fees by English substring. The
// A.T.S programmes describe their days in Japanese sentences, so nothing
// ever matched and no quote carried a single ticket. This picks the fee row
// itself: the day stores entrance_fees ids (exact, language-proof), the
// free-text wording stays for the documents.
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Ticket, X, Plus, Search } from 'lucide-react'

export interface PickableAttraction {
  id: string
  attraction_name: string
  city: string | null
  eur_rate: number | null
  non_eur_rate: number | null
}

let cache: Promise<PickableAttraction[]> | null = null
/** The active, non-add-on fee rows, fetched once per page. */
export function loadPickableAttractions(): Promise<PickableAttraction[]> {
  if (!cache) {
    cache = fetch('/api/rates/entrance-fees?active_only=true&is_addon=false')
      .then(r => r.json())
      .then(j => (j?.success && Array.isArray(j.data) ? j.data : []) as PickableAttraction[])
      .catch(() => [])
  }
  return cache
}

interface Props {
  /** The day's city — offered first, never a hard filter. */
  city?: string | null
  selectedIds: string[]
  onChange: (ids: string[]) => void
  compact?: boolean
}

export default function AttractionPicker({ city, selectedIds, onChange, compact }: Props) {
  const t = useTranslations('attractionPicker')
  const [all, setAll] = useState<PickableAttraction[]>([])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => { loadPickableAttractions().then(setAll) }, [])

  const byId = useMemo(() => new Map(all.map(a => [a.id, a])), [all])
  const chosen = selectedIds.map(id => byId.get(id) ?? { id, attraction_name: t('unknown'), city: null, eur_rate: null, non_eur_rate: null })

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const cityKey = (city ?? '').trim().toLowerCase()
    return all
      .filter(a => !selectedIds.includes(a.id))
      .filter(a => !needle || a.attraction_name.toLowerCase().includes(needle) || (a.city ?? '').toLowerCase().includes(needle))
      .sort((a, b) => {
        const ac = cityKey && (a.city ?? '').toLowerCase() === cityKey ? 0 : 1
        const bc = cityKey && (b.city ?? '').toLowerCase() === cityKey ? 0 : 1
        return ac - bc || (a.city ?? '').localeCompare(b.city ?? '') || a.attraction_name.localeCompare(b.attraction_name)
      })
      .slice(0, 40)
  }, [all, q, city, selectedIds])

  const add = (id: string) => { onChange([...selectedIds, id]); setQ('') }
  const remove = (id: string) => onChange(selectedIds.filter(x => x !== id))

  return (
    <div className="space-y-2" data-testid="attraction-picker">
      <div className="flex flex-wrap gap-2">
        {chosen.map(a => (
          <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 bg-[#e8ede3] border border-[#b8c9a8] text-[#4a5c35] text-xs rounded-full" title={a.city ?? undefined}>
            <Ticket className="w-3 h-3" />
            {a.attraction_name}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(a.id) }} className="hover:text-red-600 ml-0.5" aria-label={t('remove')}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {!open && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(true) }}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 border border-dashed border-gray-300 rounded-full text-xs text-gray-500 hover:border-[#647C47] hover:text-[#647C47]"
          >
            <Plus className="w-3 h-3" />
            {t('add')}
          </button>
        )}
      </div>
      {open && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-sm" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
              placeholder={t('searchPlaceholder')}
              className="flex-1 text-sm outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label={t('close')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className={`overflow-y-auto ${compact ? 'max-h-40' : 'max-h-64'}`}>
            {all.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">{t('loading')}</p>}
            {all.length > 0 && matches.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">{t('none')}</p>}
            {matches.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => add(a.id)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[#e8ede3]/60 text-sm"
              >
                <span className="text-gray-900">{a.attraction_name}</span>
                <span className="text-xs text-gray-400 ml-3 shrink-0">{a.city}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
