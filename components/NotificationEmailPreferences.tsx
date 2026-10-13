'use client'

// Your own choice of which notifications also arrive by email. Every role
// gets notifications, so every role can reach this (the Notifications page);
// Settings is manager-and-above. /api/settings/notifications reads and writes
// only the signed-in user's row, and the send path (lib/notifications.ts)
// honours it.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Mail, Save } from 'lucide-react'

interface EmailPrefs {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  email_enabled: boolean
}

const TASK_KEYS = ['task_assigned', 'task_due_soon', 'task_overdue'] as const

export default function NotificationEmailPreferences() {
  const t = useTranslations('notifications.emailPrefs')
  const [prefs, setPrefs] = useState<EmailPrefs | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'saved' | 'error' | null>(null)

  useEffect(() => {
    fetch('/api/settings/notifications')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setPrefs(data) })
      .catch(() => setStatus('error'))
  }, [])

  const save = async () => {
    if (!prefs) return
    setSaving(true)
    setStatus(null)
    try {
      const r = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      setStatus(r.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (!prefs) return null

  return (
    <details className="bg-white border border-gray-200 rounded-lg">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-medium text-gray-700">
        <Mail className="h-4 w-4 text-gray-500" />
        {t('title')}
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <p className="text-xs text-gray-500">{t('help')}</p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={prefs.email_enabled}
            onChange={e => setPrefs({ ...prefs, email_enabled: e.target.checked })}
            className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
          />
          {t('emailEnabled')}
        </label>
        <div className="pl-6 space-y-2">
          {TASK_KEYS.map(key => (
            <label key={key} className={`flex items-center gap-2 text-sm ${prefs.email_enabled ? 'text-gray-700' : 'text-gray-400'}`}>
              <input
                type="checkbox"
                checked={prefs[key]}
                disabled={!prefs.email_enabled}
                onChange={e => setPrefs({ ...prefs, [key]: e.target.checked })}
                className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
              />
              {t(key)}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save')}
          </button>
          {status === 'saved' && <span className="text-xs text-green-700">{t('saved')}</span>}
          {status === 'error' && <span className="text-xs text-red-600">{t('error')}</span>}
        </div>
      </div>
    </details>
  )
}
