'use client'

// ============================================
// /settings/preferences — your own defaults, on a page agents can open
// ============================================
// The same panel as Settings › Preferences. Settings itself is the admins'
// and managers' screen; an agent sets their default tier, margin and
// currency here (the WhatsApp parser links to it). Middleware lets agents
// through to this path and /settings/email only.

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Settings } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import PreferencesPanel from '@/components/settings/PreferencesPanel'

export default function MyPreferencesPage() {
  const t = useTranslations('settings')
  const { canManageSettings } = useRole()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-gray-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{t('preferences')}</h1>
        </div>
        {canManageSettings && (
          <Link href="/settings?tab=preferences" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" /> {t('backToSettings')}
          </Link>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <PreferencesPanel />
      </div>
    </div>
  )
}
