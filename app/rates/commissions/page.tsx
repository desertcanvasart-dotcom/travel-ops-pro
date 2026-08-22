'use client'

// ============================================
// Rates › Commissions — who pays whom, per supplier
// ============================================
// Two directions, recorded on the supplier row (default_commission_rate +
// commission_type) and read by lib/commission-generation.ts:
//   payable     WE PAY the supplier a share of our profit — a guide who sold
//               an optional tour, for example.
//   receivable  WE RECEIVE a share of the supplier's sale — a shop our clients
//               visit.
// This page exists because the supplier form was cut back to contact details
// (2026-08-22): a commission is a rate, so it lives with the other rates.
// ============================================

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Percent, Search, Edit, Save, X, Check, AlertTriangle, Loader2, Info, TrendingUp, TrendingDown } from 'lucide-react'
import { supplierTypeLabel, SUPPLIER_TYPES } from '@/lib/supplier-types'
import { COMMISSION_DIRECTIONS, type CommissionDirection } from '@/lib/suppliers/fields'

interface Supplier {
  id: string
  name: string
  type: string
  types?: string[] | null
  city?: string | null
  status: string
  default_commission_rate?: number | string | null
  commission_type?: string | null
}

type DirectionFilter = 'all' | CommissionDirection | 'none'

function directionOf(s: Supplier): CommissionDirection | null {
  const rate = Number(s.default_commission_rate)
  if (!Number.isFinite(rate) || s.default_commission_rate === null || s.default_commission_rate === undefined) return null
  if (s.commission_type === 'payable') return 'payable'
  // The generator's own fallback: a rate without a direction is "we receive".
  return 'receivable'
}

export default function CommissionRatesPage() {
  const t = useTranslations('rates.commissions')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<DirectionFilter>('all')
  const [role, setRole] = useState('')
  const [withRateOnly, setWithRateOnly] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDirection, setEditDirection] = useState<CommissionDirection>('receivable')
  const [editRate, setEditRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const showNotice = (tone: 'ok' | 'error', text: string) => {
    setNotice({ tone, text })
    setTimeout(() => setNotice(null), 4000)
  }

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers')
      const json = await res.json()
      setSuppliers(json.data || [])
    } catch (err) {
      console.error('Error fetching suppliers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSuppliers() }, [])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return suppliers
      .filter(s => {
        const dir = directionOf(s)
        if (withRateOnly && !dir) return false
        if (direction === 'none' && dir) return false
        if ((direction === 'payable' || direction === 'receivable') && dir !== direction) return false
        const roles = s.types?.length ? s.types : [s.type]
        if (role && !roles.includes(role)) return false
        if (q && !s.name.toLowerCase().includes(q) && !(s.city || '').toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        // Suppliers with a commission first, then by name.
        const da = directionOf(a) ? 0 : 1, db = directionOf(b) ? 0 : 1
        return da - db || a.name.localeCompare(b.name)
      })
  }, [suppliers, search, direction, role, withRateOnly])

  const startEdit = (s: Supplier) => {
    setEditingId(s.id)
    setEditDirection(directionOf(s) || 'receivable')
    setEditRate(s.default_commission_rate == null ? '' : String(s.default_commission_rate))
  }

  const persist = async (s: Supplier, body: { default_commission_rate: number | null; commission_type: CommissionDirection | null }) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/suppliers/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('failedToSave'))
      setSuppliers(prev => prev.map(x => (x.id === s.id ? { ...x, ...body } : x)))
      setEditingId(null)
      showNotice('ok', body.default_commission_rate === null ? t('cleared', { name: s.name }) : t('saved', { name: s.name }))
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : t('failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = (s: Supplier) => {
    const rate = Number(editRate)
    if (editRate.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      showNotice('error', t('rateRequired'))
      return
    }
    persist(s, { default_commission_rate: rate, commission_type: editDirection })
  }

  const handleClear = (s: Supplier) => persist(s, { default_commission_rate: null, commission_type: null })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  const DirectionBadge = ({ dir }: { dir: CommissionDirection | null }) => {
    if (!dir) return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">{t('directionNone')}</span>
    return dir === 'payable'
      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-700"><TrendingDown className="w-3 h-3" /> {t('directionPay')}</span>
      : <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700"><TrendingUp className="w-3 h-3" /> {t('directionReceive')}</span>
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-gray-50 min-h-screen max-w-6xl mx-auto">
      {notice && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 text-white ${notice.tone === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
          {notice.tone === 'ok' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {notice.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/rates" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title={t('backToHub')}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-2 bg-primary-600/10 rounded-lg"><Percent className="w-6 h-6 text-primary-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-600">{t('subtitle')}</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">{t('count', { count: rows.length })}</p>
      </div>

      {/* The two directions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">{t('explainTitle')}</p>
          <p className="flex items-start gap-2"><TrendingDown className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" /> {t('explainPay')}</p>
          <p className="flex items-start gap-2"><TrendingUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" /> {t('explainReceive')}</p>
          <p className="text-xs text-blue-700 pt-1">{t('enginePayNote')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white"
          />
        </div>
        <select value={direction} onChange={e => setDirection(e.target.value as DirectionFilter)} className="h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white outline-none">
          <option value="all">{t('allDirections')}</option>
          <option value="payable">{t('directionPay')}</option>
          <option value="receivable">{t('directionReceive')}</option>
          <option value="none">{t('directionNone')}</option>
        </select>
        <select value={role} onChange={e => setRole(e.target.value)} className="h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white outline-none">
          <option value="">{t('allRoles')}</option>
          {SUPPLIER_TYPES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 h-10 px-3 border border-gray-200 rounded-lg bg-white cursor-pointer">
          <input type="checkbox" checked={withRateOnly} onChange={e => setWithRateOnly(e.target.checked)} className="w-4 h-4" />
          {t('withRateOnly')}
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{t('supplier')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{t('role')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">{t('direction')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">{t('rate')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">{t('noSuppliers')}</td></tr>
              )}
              {rows.map(s => {
                const dir = directionOf(s)
                const editing = editingId === s.id
                const roles = s.types?.length ? s.types : [s.type]
                return (
                  <tr key={s.id} className={`border-b border-gray-100 ${editing ? 'bg-primary-50/40' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      {s.city && <p className="text-xs text-gray-500">{s.city}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {roles.map(r => <span key={r} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px]">{supplierTypeLabel(r)}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                          {COMMISSION_DIRECTIONS.map(d => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setEditDirection(d)}
                              className={`px-3 h-9 text-xs font-medium flex items-center gap-1 ${editDirection === d ? (d === 'payable' ? 'bg-red-600 text-white' : 'bg-green-600 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                              {d === 'payable' ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                              {d === 'payable' ? t('directionPay') : t('directionReceive')}
                            </button>
                          ))}
                        </div>
                      ) : <DirectionBadge dir={dir} />}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={editRate}
                            onChange={e => setEditRate(e.target.value)}
                            autoFocus
                            className="w-20 h-9 px-2 text-sm text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                          />
                          <span className="text-xs text-gray-500 w-20 text-left">{editDirection === 'payable' ? t('percentOfProfit') : t('percentOfSale')}</span>
                        </div>
                      ) : dir ? (
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{Number(s.default_commission_rate)}%</span>
                          <p className="text-[11px] text-gray-500">{dir === 'payable' ? t('percentOfProfit') : t('percentOfSale')}</p>
                        </div>
                      ) : <span className="text-sm text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => handleSave(s)} disabled={saving} className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50" title={t('save')}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          {dir && (
                            <button type="button" onClick={() => handleClear(s)} disabled={saving} className="px-2 h-9 text-xs text-red-600 hover:bg-red-50 rounded-lg">{t('clear')}</button>
                          )}
                          <button type="button" onClick={() => setEditingId(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title={t('cancel')}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => startEdit(s)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title={t('edit')}>
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
