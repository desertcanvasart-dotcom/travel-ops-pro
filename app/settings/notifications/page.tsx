'use client'

// ============================================
// Settings › Account › Notifications
// ============================================
// What you are told about, and where. Moved as it was from the old Settings
// "Notifications" tab (/settings?tab=notifications redirects here); reads and
// saves /api/settings/notifications, your own row.

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Mail, Save, Loader2, X, CheckCircle, AlertCircle } from 'lucide-react'

interface NotificationPreference {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  email_enabled: boolean
}

export default function NotificationSettingsPage() {
  const t = useTranslations('settings')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference>({
    task_assigned: true,
    task_due_soon: true,
    task_overdue: true,
    email_enabled: true,
  })

  useEffect(() => {
    fetchNotificationPrefs().finally(() => setLoading(false))
  }, [])

  const fetchNotificationPrefs = async () => {
    try {
      const response = await fetch('/api/settings/notifications')
      if (response.ok) {
        const data = await response.json()
        setNotificationPrefs(data)
      }
    } catch (error) {
      console.error('Error fetching notification prefs:', error)
    }
  }

  const saveNotificationPrefs = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPrefs)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save notification preferences')
      }
    } catch (err) {
      setError('Failed to save notification preferences')
    } finally {
      setSaving(false)
    }
  }

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">{t('notificationPreferences')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('chooseNotifications')}</p>
      </div>

      {/* Delivery Methods */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
        <h4 className="text-sm font-medium text-gray-900">{t('deliveryMethods')}</h4>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">{t('emailNotifications')}</p>
              <p className="text-xs text-gray-500">{t('receiveViaEmail')}</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationPrefs.email_enabled}
              onChange={(e) => setNotificationPrefs(prev => ({ ...prev, email_enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>
      </div>

      {/* Notification Types */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900">{t('taskNotifications')}</h4>

        {[
          { key: 'task_assigned', labelKey: 'taskAssigned', descKey: 'taskAssignedDesc', icon: '📋' },
          { key: 'task_due_soon', labelKey: 'taskDueSoon', descKey: 'taskDueSoonDesc', icon: '⏰' },
          { key: 'task_overdue', labelKey: 'taskOverdue', descKey: 'taskOverdueDesc', icon: '🚨' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-700">{t(item.labelKey)}</p>
                <p className="text-xs text-gray-500">{t(item.descKey)}</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs[item.key as keyof NotificationPreference] as boolean}
                onChange={(e) => setNotificationPrefs(prev => ({ ...prev, [item.key]: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
            </label>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveNotificationPrefs}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('saving') : t('saveChanges')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="m-4 md:m-6 max-w-4xl bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      {saveSuccess && (
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{t('savedSuccessfully')}</span>
        </div>
      )}
      {error && (
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
    </div>
      ) : renderNotificationsTab()}
    </div>
  )
}
