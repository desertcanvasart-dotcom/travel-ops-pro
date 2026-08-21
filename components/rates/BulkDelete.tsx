'use client'

// ============================================
// Bulk delete for the rates pages
// ============================================
// One selection model and one action bar, shared by all thirteen rates pages.
// Each page keeps its own DELETE endpoint; the bar calls it once per selected
// id and reports how many succeeded — a partial failure names its count
// instead of pretending all-or-nothing.

import { useCallback, useMemo, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useConfirmDialog } from '@/components/ConfirmDialog'

export function useBulkSelect() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((ids: string[]) => {
    setSelected(prev => (prev.size === ids.length ? new Set() : new Set(ids)))
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return useMemo(
    () => ({ selected, toggle, toggleAll, clear, has: (id: string) => selected.has(id) }),
    [selected, toggle, toggleAll, clear]
  )
}

export function BulkDeleteBar({
  count,
  label,
  onDelete,
  onClear,
}: {
  count: number
  /** e.g. "attractions" — appears in the button and confirm text. */
  label: string
  /** Deletes the current selection; resolves when done. */
  onDelete: () => Promise<void>
  onClear: () => void
}) {
  const [busy, setBusy] = useState(false)
  // The app's own dialog, not window.confirm: the native box renders as
  // "autoura.net says" at the top of the browser chrome, in the browser's
  // language, unstyled — every other destructive action in the app asks
  // through ConfirmDialog, centred and translated. Hooks before the early
  // return (Rules of Hooks — this exact mistake crashed 11 rates pages once).
  const dialog = useConfirmDialog()
  const t = useTranslations('confirmDialog')
  const tBar = useTranslations('bulkDelete')
  if (count === 0) return null

  const run = async () => {
    const confirmed = await dialog.confirm({
      title: t('bulkDeleteTitle', { count }),
      message: t('bulkDeleteMessage', { count, label }),
      variant: 'danger',
      confirmText: t('delete'),
      cancelText: t('cancel'),
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await onDelete()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
      <span className="text-sm text-red-800 font-medium">{tBar('selected', { count })}</span>
      <button
        onClick={run}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        {tBar('deleteSelected')}
      </button>
      <button onClick={onClear} disabled={busy} className="text-xs text-gray-500 hover:text-gray-700">
        {tBar('clear')}
      </button>
    </div>
  )
}

/**
 * Delete each id via the page's endpoint; returns [succeeded, failed, reasons].
 * `reasons` carries the server's message for every failure (de-duplicated,
 * in order) — a 409 "referenced by 3 invoices" must reach the operator, not
 * collapse into a count.
 */
export async function bulkDeleteByIds(
  ids: string[],
  urlFor: (id: string) => string
): Promise<[number, number, string[]]> {
  const results = await Promise.allSettled(
    ids.map(async id => {
      const res = await fetch(urlFor(id), { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`)
    })
  )
  const ok = results.filter(r => r.status === 'fulfilled').length
  const reasons = [...new Set(
    results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map(r => String(r.reason?.message ?? r.reason))
  )]
  return [ok, results.length - ok, reasons]
}
