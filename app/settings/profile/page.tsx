'use client'

// ============================================
// Settings › Profile — your own name, phone, photo, language and password
// ============================================
// This page used to be a mock: "Save Changes" and "Change Password" waited a
// second and announced success with nothing saved, beside an "Account
// Activity" card of invented numbers and Deactivate/Delete buttons that did
// nothing. Someone changing a password after a suspected compromise was told
// it had changed.
//
// Now every control does what it says:
//   name, phone      PUT /api/profile (your own user_profiles row; the route
//                    accepts these two fields and nothing else)
//   photo            POST /api/avatar/upload (your own, from the session)
//   language         LanguageSelector (a cookie, applied at once)
//   password         the browser session: the current password is checked,
//                    then supabase.auth.updateUser (lib/settings/password)
// Email (the sign-in identity) and role (the company's to grant) are shown,
// not edited.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { User, Lock, Camera, Save, ArrowLeft, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { createClient } from '@/app/supabase'
import { useRole } from '@/hooks/useRole'
import { LanguageSelector } from '@/components/LanguageSelector'
import { changePassword, MIN_PASSWORD_LENGTH } from '@/lib/settings/password'

interface Profile {
  id: string
  full_name: string
  email: string
  phone?: string | null
  avatar_url?: string | null
}

type Notice = { ok: boolean; text: string } | null

const inputClass =
  'w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none'
const readOnlyClass = 'w-full h-9 px-3 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-600'

export default function ProfilePage() {
  const t = useTranslations('settings')
  const { role, canManageSettings } = useRole()
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })

  useEffect(() => {
    let alive = true
    fetch('/api/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (alive && json?.data) setProfile(json.data) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: profile.full_name, phone: profile.phone ?? null }),
      })
      const json = await res.json().catch(() => ({}))
      setNotice(res.ok && json.success ? { ok: true, text: t('profileSaved') } : { ok: false, text: json.error || t('failedToSave') })
    } catch {
      setNotice({ ok: false, text: t('failedToSave') })
    } finally {
      setSaving(false)
    }
  }

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/avatar/upload', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (json.success) {
        setProfile(prev => (prev ? { ...prev, avatar_url: json.url } : prev))
        setNotice({ ok: true, text: t('profileSaved') })
      } else {
        setNotice({ ok: false, text: json.error || t('failedToSave') })
      }
    } catch {
      setNotice({ ok: false, text: t('failedToSave') })
    } finally {
      setUploading(false)
    }
  }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile?.email) return
    setSaving(true)
    setNotice(null)
    try {
      const result = await changePassword(createClient().auth, profile.email, passwords)
      if (result.ok) {
        setPasswords({ current: '', next: '', confirm: '' })
        setNotice({ ok: true, text: t('passwordChanged') })
      } else {
        setNotice({ ok: false, text: t(result.error) })
      }
    } catch {
      setNotice({ ok: false, text: t('failedToSave') })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{t('profileInformation')}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{t('updatePersonalInfo')}</p>
          </div>
          {canManageSettings && (
            <Link
              href="/settings?tab=profile"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('backToSettings')}
            </Link>
          )}
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {notice && (
            <div
              role={notice.ok ? 'status' : 'alert'}
              className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${notice.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}
            >
              {notice.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {notice.text}
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Photo */}
            <div className="bg-gray-50 border-b border-gray-200 p-5 flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-white border-2 border-gray-200 shadow-sm p-0.5 overflow-hidden">
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="w-10 h-10 text-gray-400" />
                    </div>
                  )}
                </div>
                <label
                  htmlFor="avatar-upload"
                  title={t('changePhoto')}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-gray-50 border border-gray-200"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5 text-primary-600" />}
                  <input id="avatar-upload" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={uploadAvatar} className="hidden" />
                </label>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">{profile?.full_name}</h2>
                <p className="text-xs text-primary-600 font-medium capitalize">{role ?? ''}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('photoUploadHint')}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 flex">
              {([['profile', User, t('profileInformation')], ['password', Lock, t('changePassword')]] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setActiveTab(id); setNotice(null) }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium ${
                    activeTab === id ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === 'profile' && (
                <form onSubmit={saveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('fullName')}</label>
                      <input
                        type="text"
                        required
                        value={profile?.full_name ?? ''}
                        onChange={e => setProfile(prev => (prev ? { ...prev, full_name: e.target.value } : prev))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('phone')}</label>
                      <input
                        type="tel"
                        value={profile?.phone ?? ''}
                        onChange={e => setProfile(prev => (prev ? { ...prev, phone: e.target.value } : prev))}
                        className={inputClass}
                        placeholder={t('phonePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('emailLabel')}</label>
                      <input type="email" readOnly value={profile?.email ?? ''} className={readOnlyClass} />
                      <p className="text-[11px] text-gray-500 mt-1">{t('emailReadOnlyHint')}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('role')}</label>
                      <input type="text" readOnly value={role ?? ''} className={`${readOnlyClass} capitalize`} />
                      <p className="text-[11px] text-gray-500 mt-1">{t('roleReadOnlyHint')}</p>
                    </div>
                    <div>
                      <LanguageSelector />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-100">
                    <button
                      type="submit"
                      disabled={saving || !profile}
                      className="px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {saving ? t('saving') : t('saveChanges')}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'password' && (
                <form onSubmit={submitPassword} className="space-y-4 max-w-md">
                  <p className="text-xs text-gray-500">{t('passwordHint')}</p>
                  {([
                    ['current', t('currentPassword'), 'current-password'],
                    ['next', t('newPassword'), 'new-password'],
                    ['confirm', t('confirmPassword'), 'new-password'],
                  ] as const).map(([field, label, autoComplete]) => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <input
                        type="password"
                        required
                        autoComplete={autoComplete}
                        minLength={field === 'current' ? undefined : MIN_PASSWORD_LENGTH}
                        value={passwords[field]}
                        onChange={e => setPasswords(prev => ({ ...prev, [field]: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  ))}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={saving || !profile?.email}
                      className="px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                      {t('changePassword')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
