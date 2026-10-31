'use client'

// ============================================
// Settings › Pricing › Pricing defaults (/settings/preferences)
// ============================================
// Your own default tier, margin and currency for new quotes, per (person,
// company) — the panel that was Settings › Preferences. Agents open it too
// (middleware lets them through to this path; the WhatsApp parser links to
// it). The Settings layout gives it its title.

import PreferencesPanel from '@/components/settings/PreferencesPanel'

export default function MyPreferencesPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <PreferencesPanel />
      </div>
    </div>
  )
}
