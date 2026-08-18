'use client'

// ============================================
// DEPARTMENTS — create, edit, route service types
// ============================================
// The routing table behind task generation, finally visible. Each service
// type may be owned by ONE active department (the API enforces it); the
// picker greys out types another department already claims, because an
// invisible, ambiguous mapping is exactly how 36 services once sat unrouted
// for months.

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, Loader2, Check, Plus, Trash2 } from 'lucide-react'
import { SERVICE_TYPE_ROUTING } from '@/lib/departments'

interface Department {
  id: string
  name: string
  description: string | null
  service_types: string[] | null
  is_active: boolean
}

const KNOWN_TYPES = Object.keys(SERVICE_TYPE_ROUTING)

export default function DepartmentsPage() {
  const t = useTranslations('departments')
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [deptRes, memberRes] = await Promise.all([
        fetch('/api/departments?include_inactive=1'),
        fetch('/api/team-members'),
      ])
      const deptData = await deptRes.json()
      if (!deptRes.ok) throw new Error(deptData.error)
      setDepartments(deptData.data || [])
      const memberData = await memberRes.json().catch(() => null)
      const rows: Array<{ department_id: string | null }> =
        memberData?.data || memberData?.members || []
      const counts: Record<string, number> = {}
      for (const m of rows) {
        if (m.department_id) counts[m.department_id] = (counts[m.department_id] || 0) + 1
      }
      setMembers(counts)
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = (id: string, fields: Partial<Department>) =>
    setDepartments(prev => prev.map(d => (d.id === id ? { ...d, ...fields } : d)))

  const save = async (dept: Department) => {
    setSavingId(dept.id)
    setError(null)
    try {
      const res = await fetch(`/api/departments/${dept.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dept.name,
          description: dept.description ?? '',
          service_types: dept.service_types ?? [],
          is_active: dept.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      patch(dept.id, data.data)
      setSavedId(dept.id)
      setTimeout(() => setSavedId(null), 2500)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (dept: Department) => {
    if (!confirm(t('deleteConfirm', { name: dept.name }))) return
    setError(null)
    try {
      const res = await fetch(`/api/departments/${dept.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDepartments(prev => prev.filter(d => d.id !== dept.id))
    } catch (err: any) {
      setError(err.message || 'Failed to delete')
    }
  }

  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), service_types: [] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDepartments(prev => [...prev, data.data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } catch (err: any) {
      setError(err.message || 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  // Which active department (if any) owns each type — for greying the picker.
  const ownerOf = (type: string, selfId: string): string | null => {
    for (const d of departments) {
      if (d.id === selfId || !d.is_active) continue
      if ((d.service_types ?? []).includes(type)) return d.name
    }
    return null
  }

  const toggleType = (dept: Department, type: string) => {
    const current = dept.service_types ?? []
    patch(dept.id, {
      service_types: current.includes(type)
        ? current.filter(s => s !== type)
        : [...current, type],
    })
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Building2 className="w-6 h-6 text-[#647C47]" />
        <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">{t('subtitle')}</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-4">
        {departments.map(dept => {
          const types = dept.service_types ?? []
          // Custom types already on this department stay visible even if not
          // in the known vocabulary — removing them silently would unroute work.
          const palette = [...new Set([...KNOWN_TYPES, ...types])]
          return (
            <div key={dept.id} className={`bg-white border rounded-lg p-5 ${dept.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
              <div className="flex items-center gap-3 mb-3">
                <input
                  className="font-semibold text-gray-900 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-2 py-1 text-sm flex-1"
                  value={dept.name}
                  onChange={e => patch(dept.id, { name: e.target.value })}
                />
                <span className="text-xs text-gray-400">{t('memberCount', { count: members[dept.id] ?? 0 })}</span>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dept.is_active}
                    onChange={e => patch(dept.id, { is_active: e.target.checked })}
                  />
                  {t('active')}
                </label>
              </div>
              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3"
                placeholder={t('descriptionPlaceholder')}
                value={dept.description ?? ''}
                onChange={e => patch(dept.id, { description: e.target.value })}
              />
              <p className="text-xs font-medium text-gray-600 mb-2">{t('routedTypes')}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {palette.map(type => {
                  const selected = types.includes(type)
                  const owner = ownerOf(type, dept.id)
                  const blocked = !selected && owner !== null
                  return (
                    <button
                      key={type}
                      disabled={blocked}
                      title={blocked ? t('ownedBy', { name: owner! }) : undefined}
                      onClick={() => toggleType(dept, type)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        selected
                          ? 'bg-[#647C47] text-white border-[#647C47]'
                          : blocked
                            ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-[#647C47]'
                      }`}
                    >
                      {type}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => save(dept)}
                  disabled={savingId === dept.id}
                  className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50"
                >
                  {savingId === dept.id ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId === dept.id ? <Check className="w-4 h-4" /> : null}
                  {savedId === dept.id ? t('saved') : t('save')}
                </button>
                {/* Delete only offers itself when no member references the
                    department; the server re-checks members AND tasks. */}
                {(members[dept.id] ?? 0) === 0 && (
                  <button
                    onClick={() => remove(dept)}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t('delete')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <input
          className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder={t('newPlaceholder')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
        />
        <button
          onClick={create}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t('create')}
        </button>
      </div>
    </div>
  )
}
