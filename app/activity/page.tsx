'use client'

// ============================================
// ACTIVITY — the audit trail, for the owner's eyes
// ============================================
// Every authenticated mutating API call, captured in middleware, append-only
// in the database. This page only reads.

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ScrollText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

interface Entry {
  id: string
  user_email: string | null
  method: string
  path: string
  action: string
  entity_type: string | null
  entity_id: string | null
  ip: string | null
  created_at: string
}

const ACTION_STYLE: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700',
  update: 'bg-blue-50 text-blue-700',
  delete: 'bg-red-50 text-red-700',
  action: 'bg-gray-100 text-gray-600',
}

export default function ActivityPage() {
  const t = useTranslations('activity')
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ user_email: '', entity: '', action: '', from: '', to: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page) })
      for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v)
      const res = await fetch(`/api/activity?${qs.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEntries(data.data)
      setTotalPages(data.pagination.total_pages || 1)
      setTotal(data.pagination.total || 0)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    load()
  }, [load])

  const setF = (k: keyof typeof filters, v: string) => {
    setPage(1)
    setFilters(prev => ({ ...prev, [k]: v }))
  }

  const inputClass = 'px-3 py-2 border border-gray-300 rounded-lg text-sm'

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-1">
        <ScrollText className="w-6 h-6 text-[#647C47]" />
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">{t('subtitle')}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <input className={inputClass} placeholder={t('filterUser')} value={filters.user_email}
          onChange={e => setF('user_email', e.target.value)} />
        <input className={inputClass} placeholder={t('filterEntity')} value={filters.entity}
          onChange={e => setF('entity', e.target.value)} />
        <select className={inputClass} value={filters.action} onChange={e => setF('action', e.target.value)}>
          <option value="">{t('allActions')}</option>
          <option value="create">{t('actionCreate')}</option>
          <option value="update">{t('actionUpdate')}</option>
          <option value="delete">{t('actionDelete')}</option>
        </select>
        <input type="date" className={inputClass} value={filters.from} onChange={e => setF('from', e.target.value)} />
        <input type="date" className={inputClass} value={filters.to} onChange={e => setF('to', e.target.value)} />
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('colWhen')}</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('colWho')}</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('colAction')}</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('colTarget')}</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">{t('empty')}</td></tr>
              ) : entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-gray-900">{e.user_email ?? e.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLE[e.action] ?? ACTION_STYLE.action}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-gray-900">{e.entity_type ?? '—'}</span>
                    {e.entity_id && <span className="text-gray-400"> · {e.entity_id.slice(0, 8)}</span>}
                    <div className="text-[11px] text-gray-400 font-mono">{e.method} {e.path}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{e.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 text-sm text-gray-500">
          <span>{t('total', { count: total })}</span>
          <span className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            {page} / {totalPages}
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </span>
        </div>
      </div>
    </div>
  )
}
