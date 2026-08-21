'use client'

import { useState, useEffect, useCallback } from 'react'
import { History, Loader2, RotateCcw, GitCompare, Check } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'

interface Revision {
  id: string
  version_number: number
  is_current: boolean
  changed_at: string
  change_reason: string | null
  changed_by_email: string | null
}

interface Diff {
  field: string
  label: string
  old_value: any
  new_value: any
}

const fmt = (v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60)
  return String(v)
}

export default function QuoteRevisions({ quoteId, basePath = '/api/b2b/quotes' }: { quoteId: string; basePath?: string }) {
  const confirmDialog = useConfirm()
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [diffFor, setDiffFor] = useState<number | null>(null)
  const [diff, setDiff] = useState<Diff[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${basePath}/${quoteId}/revisions`)
      const json = await res.json()
      if (json.success) setRevisions(json.revisions)
    } catch {
      /* empty state */
    } finally {
      setLoading(false)
    }
  }, [quoteId, basePath])

  useEffect(() => {
    load()
  }, [load])

  const current = revisions.find((r) => r.is_current)

  const showDiff = async (v: number) => {
    if (diffFor === v) { setDiffFor(null); setDiff(null); return }
    if (!current) return
    setDiffFor(v)
    setDiff(null)
    try {
      const res = await fetch(`${basePath}/${quoteId}/revisions/compare?from=${v}&to=${current.version_number}`)
      const json = await res.json()
      if (json.success) setDiff(json.comparison.differences)
    } catch {
      setDiff([])
    }
  }

  const revert = async (v: number) => {
    if (!(await confirmDialog(`Revert this quote to version ${v}? The current state is saved as a new revision first.`))) return
    setBusy(v)
    setError(null)
    try {
      const res = await fetch(`${basePath}/${quoteId}/revisions/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_number: v }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Revert failed')
        return
      }
      window.location.reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
        <History className="w-4 h-4 text-gray-400" /> Revision history
      </h3>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#647C47] animate-spin" /></div>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-gray-400">No revisions yet.</p>
      ) : (
        <div className="space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {revisions.map((r) => (
            <div key={r.id} className="border border-gray-100 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">v{r.version_number}</span>
                  {r.is_current && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#647C47]/10 text-[#647C47]"><Check className="w-3 h-3" />current</span>
                  )}
                  <div className="text-xs text-gray-500 truncate">{r.change_reason || '—'}</div>
                  <div className="text-[10px] text-gray-400">{new Date(r.changed_at).toLocaleString()}{r.changed_by_email ? ` · ${r.changed_by_email}` : ''}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!r.is_current && current && (
                    <button onClick={() => showDiff(r.version_number)} title="Compare to current" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                      <GitCompare className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!r.is_current && (
                    <button onClick={() => revert(r.version_number)} disabled={busy === r.version_number} title="Revert to this version" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50">
                      {busy === r.version_number ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {diffFor === r.version_number && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  {diff === null ? (
                    <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 text-gray-400 animate-spin" /></div>
                  ) : diff.length === 0 ? (
                    <p className="text-[11px] text-gray-400">No differences vs current.</p>
                  ) : (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {diff.map((d) => (
                          <tr key={d.field} className="align-top">
                            <td className="text-gray-400 pr-2 py-0.5 whitespace-nowrap">{d.label}</td>
                            <td className="text-red-600 pr-1 py-0.5">{fmt(d.old_value)}</td>
                            <td className="text-[#647C47] py-0.5">→ {fmt(d.new_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
