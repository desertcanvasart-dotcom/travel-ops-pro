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
import { useConfirm } from '@/components/ConfirmDialog'

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
  const confirmDialog = useConfirm()
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // What the SERVER currently holds, per department. The picker greys pills
  // from local state (so deselecting a type unlocks it here immediately), but
  // the exclusivity check on save runs against the server — this snapshot is
  // how a card can say "save Reservation first" instead of letting the PUT 400.
  const [savedTypes, setSavedTypes] = useState<Record<string, { service_types: string[]; is_active: boolean }>>({})
  // Why a blocked pill did nothing. Shown in the card, not as a title
  // attribute: a disabled button gets no pointer events, so the old tooltip
  // never rendered and the rule was invisible.
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null)
  // Per-card draft for a custom service type. The vocabulary is open by
  // design: the server accepts any snake_case token (sanitizeServiceTypes)
  // and routing matches whatever the table owns — the known chips are just
  // the types the app generates today.
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({})

  /** Same shape the server's sanitizer produces, plus friendly space/dash→_. */
  const normalizeCustomType = (s: string) =>
    s.trim().toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '')

  const snapshot = (rows: Department[]) =>
    Object.fromEntries(
      rows.map(d => [d.id, { service_types: d.service_types ?? [], is_active: d.is_active }])
    )

  const load = useCallback(async () => {
    try {
      const [deptRes, memberRes] = await Promise.all([
        fetch('/api/departments?include_inactive=1'),
        fetch('/api/team-members'),
      ])
      const deptData = await deptRes.json()
      if (!deptRes.ok) throw new Error(deptData.error)
      const deptRows: Department[] = deptData.data || []
      setDepartments(deptRows)
      setSavedTypes(snapshot(deptRows))
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
    setNotice(null)
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
      setSavedTypes(prev => ({ ...prev, ...snapshot([data.data]) }))
      setSavedId(dept.id)
      setTimeout(() => setSavedId(null), 2500)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (dept: Department) => {
    if (!(await confirmDialog(t('deleteConfirm', { name: dept.name })))) return
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
      setSavedTypes(prev => ({ ...prev, ...snapshot([data.data]) }))
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

  /** The same question asked of the last SAVED state — i.e. what the server
   *  would answer right now. A type deselected but not yet saved elsewhere is
   *  still owned there as far as the PUT is concerned. */
  const serverOwnerOf = (type: string, selfId: string): string | null => {
    for (const d of departments) {
      if (d.id === selfId) continue
      const saved = savedTypes[d.id]
      if (!saved?.is_active) continue
      if (saved.service_types.includes(type)) return d.name
    }
    return null
  }

  const toggleType = (dept: Department, type: string) => {
    setNotice(null)
    const current = dept.service_types ?? []
    patch(dept.id, {
      service_types: current.includes(type)
        ? current.filter(s => s !== type)
        : [...current, type],
    })
  }

  const addCustomType = (dept: Department) => {
    const type = normalizeCustomType(customDraft[dept.id] ?? '')
    if (!type) return
    setCustomDraft(prev => ({ ...prev, [dept.id]: '' }))
    if ((dept.service_types ?? []).includes(type)) return
    // Exclusivity applies to custom types like any other — one active owner.
    const owner = ownerOf(type, dept.id)
    if (owner) {
      setNotice({ id: dept.id, text: t('blockedNotice', { type, name: owner }) })
      return
    }
    setNotice(null)
    patch(dept.id, { service_types: [...(dept.service_types ?? []), type] })
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
          // Types this card has claimed that the SERVER still gives to someone
          // else — saving now would come back 400, so say so before the click.
          const pending = types
            .map(type => ({ type, owner: serverOwnerOf(type, dept.id) }))
            .filter((p): p is { type: string; owner: string } => p.owner !== null)
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
                      // Deliberately NOT disabled: a disabled button receives no
                      // pointer events, so the click did nothing and explained
                      // nothing. It stays clickable and answers instead.
                      title={blocked ? t('ownedBy', { name: owner! }) : undefined}
                      onClick={() =>
                        blocked
                          ? setNotice({ id: dept.id, text: t('blockedNotice', { type, name: owner! }) })
                          : toggleType(dept, type)
                      }
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        selected
                          ? 'bg-[#647C47] text-white border-[#647C47]'
                          : blocked
                            ? 'bg-gray-50 text-gray-400 border-gray-200 border-dashed hover:border-gray-400 cursor-help'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-[#647C47]'
                      }`}
                    >
                      {type}
                    </button>
                  )
                })}
                <span className="inline-flex items-center gap-1">
                  <input
                    className="w-40 px-2.5 py-1 rounded-full text-xs border border-dashed border-gray-300 focus:border-[#647C47] focus:outline-none"
                    placeholder={t('customTypePlaceholder')}
                    value={customDraft[dept.id] ?? ''}
                    onChange={e => setCustomDraft(prev => ({ ...prev, [dept.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addCustomType(dept)}
                    title={t('customTypeNote')}
                  />
                  <button
                    onClick={() => addCustomType(dept)}
                    disabled={!normalizeCustomType(customDraft[dept.id] ?? '')}
                    className="px-2.5 py-1 rounded-full text-xs border border-gray-300 text-gray-600 hover:border-[#647C47] disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-1"><Plus className="w-3 h-3" />{t('addCustomType')}</span>
                  </button>
                </span>
              </div>
              {notice?.id === dept.id && (
                <p className="-mt-2 mb-3 px-2.5 py-1.5 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
                  {notice.text}
                </p>
              )}
              {pending.length > 0 && (
                <p className="-mt-2 mb-3 px-2.5 py-1.5 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
                  {t('saveOrder', {
                    types: pending.map(p => p.type).join(', '),
                    names: [...new Set(pending.map(p => p.owner))].join(', '),
                  })}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => save(dept)}
                  disabled={savingId === dept.id}
                  className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50"
                >
                  {savingId === dept.id ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId === dept.id ? <Check className="w-4 h-4" /> : null}
                  {savedId === dept.id ? t('saved') : t('save')}
                </button>
                {/* Delete is always visible; a department with members shows
                    WHY it cannot be deleted instead of hiding the option (the
                    server re-checks members AND tasks regardless). */}
                {(members[dept.id] ?? 0) === 0 ? (
                  <button
                    onClick={() => remove(dept)}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t('delete')}
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-400" title={t('deleteBlockedHint', { count: members[dept.id] })}>
                    <Trash2 className="w-3.5 h-3.5" /> {t('deleteBlocked', { count: members[dept.id] })}
                  </span>
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
