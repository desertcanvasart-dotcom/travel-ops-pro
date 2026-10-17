'use client'

import { useState, useEffect, Suspense } from 'react'
import { PartnerIntegrationsPanel } from '@/components/settings/PartnerIntegrationsPanel'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createClient } from '@/app/supabase'
import { useAuth } from '@/app/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useConfirm } from '@/components/ConfirmDialog'
import PreferencesPanel from '@/components/settings/PreferencesPanel'
import {
  User,
  Mail,
  Bell,
  CreditCard,
  Settings,
  Save,
  Loader2,
  X,
  Camera,
  Link as LinkIcon,
  Plug,
  CheckCircle,
  AlertCircle,
  FileText,
  Calculator,
  Info,
  Lock,
  Building2
} from 'lucide-react'
import { LanguageSelector } from '@/components/LanguageSelector'
import PaymentTermsCard from '@/app/components/PaymentTermsCard'
import CompanyProfileCard from '@/app/components/CompanyProfileCard'
import LicenceCard from '@/app/components/LicenceCard'

// ============================================
// TYPES
// ============================================

// Only what this tab shows or saves. Email is the sign-in identity (shown,
// never sent); the role shown is the MEMBERSHIP role in this company
// (useRole), not user_profiles.role, the display mirror. Timezone and company
// name were stored and read by nothing — company identity is Settings ›
// Organization › Company Profile.
interface Profile {
  id: string
  full_name: string
  email: string
  phone?: string
  avatar_url?: string
}

interface EmailSettings {
  gmail_connected: boolean
  gmail_email?: string
  /** The organisation's shared mailbox, connected by a colleague (lib/gmail-mailbox). */
  gmail_shared?: boolean
}

interface NotificationPreference {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  email_enabled: boolean
}

// ============================================
// TAB CONFIGURATION
// ============================================

const TAB_IDS = ['profile', 'email', 'notifications', 'preferences', 'integrations', 'partners', 'organization'] as const
const TAB_ICONS = {
  profile: User,
  email: Mail,
  notifications: Bell,
  preferences: Settings,
  integrations: LinkIcon,
  partners: Plug,
  organization: Building2,
}

// ============================================
// MAIN COMPONENT
// ============================================

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const { user } = useAuth()
  const t = useTranslations('settings')
  const confirmDialog = useConfirm()
  // The membership role in this company. Connecting the company's accounting
  // software is admin-only on the server (owner included).
  const { role, isAdmin } = useRole()

  const [activeTab, setActiveTab] = useState(tabParam || 'profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Data states
  const [profile, setProfile] = useState<Profile | null>(null)
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference>({
    task_assigned: true,
    task_due_soon: true,
    task_overdue: true,
    email_enabled: true,
  })
  const [accountingStatus, setAccountingStatus] = useState<{
    xero: { connected: boolean; company_name: string; last_updated: string } | null
    quickbooks: { connected: boolean; company_name: string; last_updated: string } | null
  }>({ xero: null, quickbooks: null })
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  const [whatsappStatus, setWhatsappStatus] = useState<{
    configured: boolean; whatsapp_number: string; business_name: string; features: { auto_send: boolean; status_updates: boolean }
  } | null>(null)
  const [testingWhatsapp, setTestingWhatsapp] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [showTestDialog, setShowTestDialog] = useState(false)
  // What the accounting OAuth callback reported (?accounting=connected&…).
  const [accountingNotice, setAccountingNotice] = useState<{ ok: boolean; text: string } | null>(() => {
    const names: Record<string, string> = { xero: 'Xero', quickbooks: 'QuickBooks' }
    if (searchParams.get('accounting') === 'connected') {
      const now = names[searchParams.get('provider') || ''] || 'The accounting software'
      const replaced = names[searchParams.get('replaced') || '']
      return {
        ok: true,
        text: replaced
          ? `${now} is connected. ${replaced} was switched off: a company sends its books to one accounting provider at a time.`
          : `${now} is connected. New invoices, expenses and payments are sent to it.`,
      }
    }
    if (searchParams.get('error') === 'not_admin') {
      return { ok: false, text: 'Not connected: only the agency owner or an admin of this company can connect its accounting software.' }
    }
    return null
  })

  // Update URL when tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    router.push(`/settings?tab=${tabId}`, { scroll: false })
  }

  // Load data based on active tab
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        switch (activeTab) {
          case 'profile':
            await fetchProfile()
            break
          case 'email':
            await fetchEmailSettings()
            break
          case 'notifications':
            await fetchNotificationPrefs()
            break
          case 'integrations':
            await fetchAccountingStatus()
            await fetchWhatsappStatus()
            break
        }
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [activeTab])

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/profile')
      if (response.ok) {
        const result = await response.json()
        setProfile(result.data || result.profile || result)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
  }

  const fetchAccountingStatus = async () => {
    try {
      // The COMPANY's connections, whoever made them (accounting_tokens is per
      // (org_id, provider) since 20270104).
      const response = await fetch('/api/auth/accounting/status')
      if (response.ok) {
        const data = await response.json()
        setAccountingStatus(data)
      }
    } catch (error) {
      console.error('Error fetching accounting status:', error)
    }
  }

  const connectAccounting = async (provider: 'xero' | 'quickbooks') => {
    if (!user) return
    // Connecting one provider switches the other off (one per company).
    const other = provider === 'xero' ? 'quickbooks' : 'xero'
    if (accountingStatus[other]?.connected && !(await confirmDialog(
      `${provider === 'xero' ? 'QuickBooks' : 'Xero'} is connected. Connecting ${provider === 'xero' ? 'Xero' : 'QuickBooks'} switches it off — the company's invoices, expenses and payments then go only to ${provider === 'xero' ? 'Xero' : 'QuickBooks'}. Continue?`
    ))) return
    setConnectingProvider(provider)
    try {
      const response = await fetch('/api/auth/accounting/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await response.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError(data.error || 'Failed to initiate connection')
      }
    } catch (error) {
      console.error('Error connecting accounting:', error)
      setError('Failed to initiate connection')
    } finally {
      setConnectingProvider(null)
    }
  }

  const disconnectAccounting = async (provider: 'xero' | 'quickbooks') => {
    if (!user || !(await confirmDialog(`Disconnect ${provider === 'xero' ? 'Xero' : 'QuickBooks'}?`))) return
    try {
      const res = await fetch('/api/auth/accounting/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to disconnect')
        return
      }
      setAccountingStatus(prev => ({ ...prev, [provider]: null }))
    } catch (error) {
      console.error('Error disconnecting:', error)
    }
  }

  const fetchWhatsappStatus = async () => {
    try {
      const response = await fetch('/api/whatsapp/status')
      if (response.ok) {
        const data = await response.json()
        setWhatsappStatus(data)
      }
    } catch (error) {
      console.error('Error fetching WhatsApp status:', error)
    }
  }

  const handleTestWhatsapp = async () => {
    if (!testPhone) return
    setTestingWhatsapp(true)
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone }),
      })
      const data = await res.json()
      if (data.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        setShowTestDialog(false)
        setTestPhone('')
      } else {
        setError(data.error || 'Failed to send test message')
      }
    } catch {
      setError('Failed to send test message')
    } finally {
      setTestingWhatsapp(false)
    }
  }

  const fetchEmailSettings = async () => {
    try {
      const response = await fetch('/api/settings/email')
      setEmailSettings(response.ok ? await response.json() : { gmail_connected: false, gmail_email: '' })
    } catch (error) {
      console.error('Error fetching email settings:', error)
      setEmailSettings({ gmail_connected: false, gmail_email: '' })
    }
  }

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

  // ============================================
  // SAVE HANDLERS
  // ============================================

  const saveProfile = async () => {
    if (!profile) return
    setSaving(true)
    setError(null)

    try {
      // Name and phone only — the route refuses anything else (strict).
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: profile.full_name, phone: profile.phone ?? null })
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save profile')
      }
    } catch (err) {
      setError('Failed to save profile')
    } finally {
      setSaving(false)
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

  // Handle Gmail connection
  const handleConnectGmail = async () => {
    if (!user) {
      setError('Please sign in to connect Gmail')
      return
    }

    try {
      const response = await fetch('/api/gmail/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await response.json()

      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError(data.error || 'Failed to get Gmail authorization URL')
      }
    } catch (err) {
      console.error('Gmail connect error:', err)
      setError('Failed to connect Gmail')
    }
  }

  // Handle Gmail disconnection
  const handleDisconnectGmail = async () => {
    if (!user) {
      setError('Please sign in to disconnect Gmail')
      return
    }

    if (!(await confirmDialog('Are you sure you want to disconnect your Gmail account?'))) {
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('gmail_tokens')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      setEmailSettings(prev => prev ? {
        ...prev,
        gmail_connected: false,
        gmail_email: ''
      } : null)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Gmail disconnect error:', err)
      setError(err.message || 'Failed to disconnect Gmail')
    }
  }

  // Handle avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    console.log('Upload triggered, file:', file, 'profile:', profile)
    
    if (!file) {
      console.log('No file selected')
      return
    }
    
    if (!profile?.id) {
      console.log('No profile ID available')
      setError('Profile not loaded. Please refresh the page.')
      return
    }

    setUploadingAvatar(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      // No userId: the route takes it from the session. Sending it was how any
      // signed-in account could overwrite somebody else's avatar.

      console.log('Uploading to /api/avatar/upload...')
      const response = await fetch('/api/avatar/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      console.log('Upload response:', data)

      if (data.success) {
        setProfile(prev => prev ? { ...prev, avatar_url: data.url } : null)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setError(data.error || 'Failed to upload avatar')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError('Failed to upload avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // ============================================
  // RENDER TABS
  // ============================================

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">{t('profileInformation')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('updatePersonalInfo')}</p>
      </div>

      {/* Avatar Section */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden relative">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10 text-primary-600" />
          )}
          {uploadingAvatar && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
        <div>
          <input
            type="file"
            id="avatar-upload"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleAvatarUpload}
            className="hidden"
          />
          <label
            htmlFor="avatar-upload"
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${uploadingAvatar ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploadingAvatar ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('uploading')}
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                {t('changePhoto')}
              </>
            )}
          </label>
          <p className="text-xs text-gray-500 mt-1">{t('photoUploadHint')}</p>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('fullName')}</label>
          <input
            type="text"
            value={profile?.full_name || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder={t('fullNamePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('emailLabel')}</label>
          <input
            type="email"
            value={profile?.email || ''}
            readOnly
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
          />
          <p className="text-xs text-gray-500 mt-1">{t('emailReadOnlyHint')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
          <input
            type="tel"
            value={profile?.phone || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder={t('phonePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('role')}</label>
          <input
            type="text"
            value={role ?? ''}
            readOnly
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-600 capitalize"
          />
          <p className="text-xs text-gray-500 mt-1">{t('roleReadOnlyHint')}</p>
        </div>

        <div>
          <LanguageSelector />
        </div>
      </div>

      <Link href="/settings/profile" className="inline-flex items-center gap-1.5 text-sm text-[#647C47] hover:underline">
        <Lock className="w-4 h-4" /> {t('changePasswordLink')}
      </Link>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveProfile}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('saving') : t('saveChanges')}
        </button>
      </div>
    </div>
  )

  const renderEmailTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">{t('emailSettings')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('configureEmail')}</p>
      </div>

      {/* Gmail Connection Status */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              emailSettings?.gmail_connected ? 'bg-green-100' : 'bg-gray-200'
            }`}>
              <Mail className={`w-5 h-5 ${emailSettings?.gmail_connected ? 'text-green-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{t('gmailIntegration')}</p>
              <p className="text-xs text-gray-500">
                {emailSettings?.gmail_connected
                  ? t('connectedAs', { email: String(emailSettings?.gmail_email ?? '') })
                  : t('notConnected')}
              </p>
              {emailSettings?.gmail_shared && (
                <p className="text-xs text-gray-500 mt-0.5">{t('sharedMailboxHint')}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {emailSettings?.gmail_connected && emailSettings?.gmail_shared ? (
              <>
                {/* A colleague's connection is the company's mailbox: not this
                    user's to disconnect, and their own can be added. */}
                <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  {t('sharedMailbox')}
                </span>
                <button
                  onClick={handleConnectGmail}
                  className="px-3 py-1.5 text-xs font-medium text-[#647C47] hover:bg-[#647C47]/10 rounded-lg transition-colors"
                >
                  {t('connectGmail')}
                </button>
              </>
            ) : emailSettings?.gmail_connected ? (
              <>
                <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  {t('connected')}
                </span>
                <button
                  onClick={handleDisconnectGmail}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  {t('disconnect')}
                </button>
              </>
            ) : (
              <button
                onClick={handleConnectGmail}
                className="px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
              >
                {t('connectGmail')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Signatures: the real ones (email_signatures) live on /settings/email.
          This tab had its own Signature and Auto-Reply fields, saved to
          user_settings and read by nothing — no email ever carried them. */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-600">{t('signaturesLiveElsewhere')}</p>
        <Link
          href="/settings/email?tab=signatures"
          className="shrink-0 px-3 py-1.5 text-sm font-medium text-[#647C47] border border-[#647C47]/30 rounded-lg hover:bg-[#647C47]/10"
        >
          {t('manageSignatures')}
        </Link>
      </div>
    </div>
  )

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

  const renderIntegrationsTab = () => {
    const providers = [
      {
        key: 'xero' as const,
        name: 'Xero',
        description: 'Push invoices, expenses, and payments to Xero',
        color: 'bg-[#13B5EA]',
        letterColor: 'text-white',
      },
      {
        key: 'quickbooks' as const,
        name: 'QuickBooks',
        description: 'Push invoices, expenses, and payments to QuickBooks',
        color: 'bg-[#2CA01C]',
        letterColor: 'text-white',
      },
    ]

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Accounting Integrations</h3>
          <p className="text-sm text-gray-500 mt-1">
            Connect your company's accounting software to automatically sync invoices, expenses, and payments.
            The connection belongs to the company: every admin sees it, whoever connected it, and a company
            sends its books to one provider at a time.
          </p>
        </div>

        {accountingNotice && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${accountingNotice.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {accountingNotice.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span className="flex-1">{accountingNotice.text}</span>
            <button onClick={() => setAccountingNotice(null)} className="p-0.5"><X className="w-4 h-4" /></button>
          </div>
        )}

        {!isAdmin && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Only the agency owner or an admin can connect or disconnect the accounting software.</span>
          </div>
        )}

        <div className="space-y-4">
          {providers.map(p => {
            const status = accountingStatus[p.key]
            const isConnected = status?.connected

            return (
              <div key={p.key} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${p.color}`}>
                      <span className={`text-sm font-bold ${p.letterColor}`}>{p.name[0]}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {isConnected
                          ? `Connected to ${status.company_name || p.name}`
                          : p.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <>
                        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Connected
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => disconnectAccounting(p.key)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            Disconnect
                          </button>
                        )}
                      </>
                    ) : isAdmin ? (
                      <button
                        onClick={() => connectAccounting(p.key)}
                        disabled={connectingProvider === p.key}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                      >
                        {connectingProvider === p.key ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <LinkIcon className="w-4 h-4" />
                        )}
                        Connect {p.name}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">Not connected</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* What Gets Synced */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">What gets synced</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-[#647C47] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Invoices</p>
                <p className="text-xs text-gray-500">Client invoices pushed as AR invoices</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CreditCard className="w-4 h-4 text-[#647C47] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Expenses</p>
                <p className="text-xs text-gray-500">Supplier expenses pushed as bills</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calculator className="w-4 h-4 text-[#647C47] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Payments</p>
                <p className="text-xs text-gray-500">Payment records synced automatically</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            Sync is push-only: Autoura sends data to your accounting software. Changes made in Xero or QuickBooks are not pulled back.
          </p>
        </div>

        {/* WhatsApp Integration */}
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900">Messaging</h3>
          <p className="text-sm text-gray-500 mt-1">
            Connect WhatsApp Business to send quotes, invoices, and updates to clients and suppliers.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#25D366]">
                <span className="text-sm font-bold text-white">W</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">WhatsApp Business</p>
                <p className="text-xs text-gray-500">
                  {whatsappStatus?.configured
                    ? `Connected: ${whatsappStatus.whatsapp_number}`
                    : 'Send quotes, confirmations, and reminders via WhatsApp'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {whatsappStatus?.configured ? (
                <>
                  <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Connected
                  </span>
                  <button
                    onClick={() => setShowTestDialog(true)}
                    className="px-3 py-1.5 text-xs font-medium text-[#647C47] bg-[#647C47]/10 rounded-lg hover:bg-[#647C47]/20 transition-colors"
                  >
                    Test Connection
                  </button>
                  <a
                    href="/settings/whatsapp"
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Configure
                  </a>
                </>
              ) : (
                <a
                  href="/settings/whatsapp"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
                >
                  <LinkIcon className="w-4 h-4" />
                  WhatsApp status
                </a>
              )}
            </div>
          </div>
        </div>

        {/* What Gets Sent via WhatsApp */}
        {whatsappStatus?.configured && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">What gets sent via WhatsApp</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-[#25D366] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Quotes & Itineraries</p>
                  <p className="text-xs text-gray-500">Send priced itineraries as PDF to clients</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-[#25D366] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Invoices & Receipts</p>
                  <p className="text-xs text-gray-500">Deliver invoices and payment receipts</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Bell className="w-4 h-4 text-[#25D366] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Reminders & Updates</p>
                  <p className="text-xs text-gray-500">Payment reminders and booking status updates</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Test WhatsApp Dialog */}
        {showTestDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowTestDialog(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Test WhatsApp Connection</h3>
              <p className="text-sm text-gray-500 mb-4">Enter a phone number to send a test message.</p>
              <input
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="+1234567890"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#25D366] mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowTestDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTestWhatsapp}
                  disabled={testingWhatsapp || !testPhone}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#25D366] rounded-lg hover:bg-[#1da851] disabled:opacity-50"
                >
                  {testingWhatsapp && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send Test
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {/* Success Toast */}
      {saveSuccess && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-lg animate-in slide-in-from-top">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{t('savedSuccessfully')}</span>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {TAB_IDS.map(tabId => {
              const Icon = TAB_ICONS[tabId]
              const isActive = activeTab === tabId
              return (
                <button
                  key={tabId}
                  onClick={() => handleTabChange(tabId)}
                  className={`
                    flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                    ${isActive
                      ? 'border-[#647C47] text-[#647C47]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {t(tabId)}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'profile' && renderProfileTab()}
              {activeTab === 'email' && renderEmailTab()}
              {activeTab === 'notifications' && renderNotificationsTab()}
              {activeTab === 'preferences' && <PreferencesPanel />}
              {activeTab === 'integrations' && renderIntegrationsTab()}
              {activeTab === 'partners' && <PartnerIntegrationsPanel />}
              {activeTab === 'organization' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#647C47]/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-[#647C47]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">Organization</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Manage your organization name, members, roles, and pending invitations.
                      </p>
                      <a
                        href="/settings/organization"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
                      >
                        <Building2 className="w-4 h-4" />
                        Open organization settings
                      </a>
                    </div>
                  </div>
                </div>
              )}
              {/* Commercial terms live with the org, not with a user: how much
                  money is asked for and when is not a per-agent preference. */}
              {activeTab === 'organization' && <CompanyProfileCard />}
              {activeTab === 'organization' && <PaymentTermsCard />}
              {/* What this install is licensed as — read-only, from LICENSE_KEY. */}
              {activeTab === 'organization' && <LicenceCard />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// EXPORT WITH SUSPENSE BOUNDARY
// ============================================

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}