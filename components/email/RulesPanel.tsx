'use client'

// ============================================
// Inbox rules: what happens to new mail automatically
// ============================================
// The organisation's rules (/api/email/rules). New mail is checked after each
// sync (every 10 minutes); a new rule can also run on what is already in the
// inbox. Managers and above make and change rules; agents can see them.

import { useCallback, useEffect, useState } from 'react'
import { Filter, Loader2, Trash2, X } from 'lucide-react'

interface Folder { id: string; name: string }

interface Rule {
  id: string
  name: string | null
  enabled: boolean
  conditions: { from?: string; to?: string; subject?: string; has_words?: string }
  actions: { label_id?: string; skip_inbox?: boolean; mark_read?: boolean; star?: boolean; trash?: boolean; spam?: boolean }
  applied_count: number
}

export interface RulePrefill { from?: string; subject?: string }

const emptyForm = (prefill?: RulePrefill) => ({
  name: '',
  from: prefill?.from ?? '',
  to: '',
  subject: prefill?.subject ?? '',
  has_words: '',
  label_id: '',
  skip_inbox: false,
  mark_read: false,
  star: false,
  trash: false,
  spam: false,
  applyToExisting: true,
})

export function describeRule(rule: Pick<Rule, 'conditions' | 'actions'>, folders: Folder[]): { when: string; then: string } {
  const c = rule.conditions
  const when = [
    c.from && `from “${c.from}”`, c.to && `to “${c.to}”`, c.subject && `subject has “${c.subject}”`, c.has_words && `has the words “${c.has_words}”`,
  ].filter(Boolean).join(', ')
  const a = rule.actions
  const folder = a.label_id ? folders.find(f => f.id === a.label_id)?.name ?? 'a folder' : null
  const then = [
    folder && `file in ${folder}`, a.skip_inbox && 'skip the Inbox', a.mark_read && 'mark as read', a.star && 'star it',
    a.spam && 'send to Spam', a.trash && 'delete it',
  ].filter(Boolean).join(', ')
  return { when, then }
}

export default function RulesPanel({
  folders,
  prefill,
  canEdit,
  onClose,
  onApplied,
}: {
  folders: Folder[]
  prefill?: RulePrefill | null
  canEdit: boolean
  onClose: () => void
  /** A rule ran on existing mail: the list may have changed. */
  onApplied: () => void
}) {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [form, setForm] = useState(emptyForm(prefill ?? undefined))
  const [showForm, setShowForm] = useState(!!prefill)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/email/rules')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load rules')
      setRules(data.rules as Rule[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRules([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/email/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          conditions: { from: form.from, to: form.to, subject: form.subject, has_words: form.has_words },
          actions: {
            label_id: form.label_id || undefined, skip_inbox: form.skip_inbox, mark_read: form.mark_read,
            star: form.star, trash: form.trash, spam: form.spam,
          },
          applyToExisting: form.applyToExisting,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save the rule')
      setNote(data.warning || (form.applyToExisting ? `Rule saved — applied to ${data.appliedToExisting ?? 0} email(s) already in the Inbox.` : 'Rule saved — it applies to new mail.'))
      if (form.applyToExisting) onApplied()
      setForm(emptyForm())
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (rule: Rule) => {
    const res = await fetch('/api/email/rules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    })
    if (res.ok) await load()
    else setError((await res.json().catch(() => ({}))).error || 'Could not change the rule')
  }

  const remove = async (rule: Rule) => {
    if (!window.confirm('Delete this rule? Emails it already filed stay where they are.')) return
    const res = await fetch(`/api/email/rules?id=${encodeURIComponent(rule.id)}`, { method: 'DELETE' })
    if (res.ok) await load()
    else setError((await res.json().catch(() => ({}))).error || 'Could not delete the rule')
  }

  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) => setForm(f => ({ ...f, [k]: v }))
  const field = 'w-full h-8 px-2 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-primary-500 outline-none'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Filter className="w-4 h-4" /> Rules</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-gray-500">Rules run on new mail a few minutes after it arrives (each mail sync).</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {note && <p className="text-xs text-green-700">{note}</p>}

          {rules === null ? (
            <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : rules.length === 0 && !showForm ? (
            <p className="text-sm text-gray-500">No rules yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {rules.map(rule => {
                const d = describeRule(rule, folders)
                return (
                  <li key={rule.id} className="px-3 py-2 flex items-start gap-3">
                    <div className={`flex-1 min-w-0 text-sm ${rule.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                      {rule.name && <p className="font-medium">{rule.name}</p>}
                      <p><span className="text-gray-500">When</span> {d.when}</p>
                      <p><span className="text-gray-500">then</span> {d.then}</p>
                      <p className="text-[11px] text-gray-400">Applied {rule.applied_count} time(s){rule.enabled ? '' : ' · off'}</p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => toggle(rule)} className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded">{rule.enabled ? 'Turn off' : 'Turn on'}</button>
                        <button onClick={() => remove(rule)} className="p-1 hover:bg-red-50 rounded" title="Delete rule"><Trash2 className="w-3.5 h-3.5 text-red-600" /></button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canEdit && !showForm && (
            <button onClick={() => setShowForm(true)} className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">New rule</button>
          )}
          {!canEdit && <p className="text-xs text-gray-500">Managers can add and change rules.</p>}

          {canEdit && showForm && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">When an email</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-600">is from<input className={field} value={form.from} onChange={e => set('from', e.target.value)} placeholder="name, address or @domain" /></label>
                <label className="text-xs text-gray-600">is to<input className={field} value={form.to} onChange={e => set('to', e.target.value)} placeholder="address" /></label>
                <label className="text-xs text-gray-600">subject has<input className={field} value={form.subject} onChange={e => set('subject', e.target.value)} /></label>
                <label className="text-xs text-gray-600">has the words<input className={field} value={form.has_words} onChange={e => set('has_words', e.target.value)} /></label>
              </div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-1">Then</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="col-span-2 text-xs text-gray-600">file it in
                  <select className={field} value={form.label_id} onChange={e => set('label_id', e.target.value)}>
                    <option value="">— no folder —</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                {([['skip_inbox', 'Skip the Inbox (archive)'], ['mark_read', 'Mark as read'], ['star', 'Star it'], ['spam', 'Send to Spam'], ['trash', 'Delete it']] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} /> {label}</label>
                ))}
              </div>
              <label className="block text-xs text-gray-600">Rule name (optional)<input className={field} value={form.name} onChange={e => set('name', e.target.value)} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.applyToExisting} onChange={e => set('applyToExisting', e.target.checked)} /> Also apply to matching emails already in the Inbox</label>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowForm(false); setForm(emptyForm()) }} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save rule'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
