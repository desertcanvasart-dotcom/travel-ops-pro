'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/app/supabase'
import { useAuth } from '@/app/contexts/AuthContext'
import {
  User,
  Mail,
  Bell,
  CreditCard,
  Settings,
  Save,
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  Clock,
  Camera,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  FileText,
  Send,
  Crown,
  Calculator,
  Info
} from 'lucide-react'
import { LanguageSelector } from '@/components/LanguageSelector'
import { SignatureEditor } from '@/components/email/RichTextEditor'

// ============================================
// TYPES
// ============================================

interface Profile {
  id: string
  full_name: string
  email: string
  phone?: string
  role?: string
  timezone?: string
  avatar_url?: string
  company_name?: string
  company_logo?: string
}

interface EmailSettings {
  gmail_connected: boolean
  gmail_email?: string
  signature?: string
  auto_reply_enabled: boolean
  auto_reply_message?: string
}

interface NotificationPreference {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  task_completed: boolean
  email_enabled: boolean
  in_app_enabled: boolean
}

interface UserPreferences {
  id?: string
  user_id?: string
  default_tier: string
  default_margin_percent: number
  default_currency: string
}

// ============================================
// TAB CONFIGURATION
// ============================================

const TAB_IDS = ['profile', 'email', 'notifications', 'preferences', 'integrations'] as const
const TAB_ICONS = {
  profile: User,
  email: Mail,
  notifications: Bell,
  preferences: Settings,
  integrations: LinkIcon,
}

const TIMEZONES = [
  { value: 'Africa/Cairo', label: 'Cairo (EET, UTC+2)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]


// ============================================
// MAIN COMPONENT
// ============================================

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const { user } = useAuth()
  const t = useTranslations('settings')

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
    task_completed: false,
    email_enabled: true,
    in_app_enabled: true
  })
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    default_tier: 'standard',
    default_margin_percent: 25,
    default_currency: 'USD'
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
          case 'preferences':
            await fetchPreferences()
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
        const profileData = result.data || result.profile || result
        console.log('Profile loaded:', profileData)
        setProfile(profileData)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
  }

  const fetchPreferences = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return
  
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()
  
      if (data) {
        setUserPreferences({
          id: data.id,
          user_id: data.user_id,
          default_tier: data.default_tier || 'standard',
          default_margin_percent: data.default_margin_percent || 25,
          default_currency: data.default_currency || 'USD'
        })
      }
    } catch (error) {
      console.error('Error fetching preferences:', error)
    }
  }

  const fetchAccountingStatus = async () => {
    try {
      if (!user) return
      const response = await fetch(`/api/auth/accounting/status?userId=${user.id}`)
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
    setConnectingProvider(provider)
    try {
      const response = await fetch('/api/auth/accounting/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, provider }),
      })
      const data = await response.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Error connecting accounting:', error)
      setError('Failed to initiate connection')
    } finally {
      setConnectingProvider(null)
    }
  }

  const disconnectAccounting = async (provider: 'xero' | 'quickbooks') => {
    if (!user || !confirm(`Disconnect ${provider === 'xero' ? 'Xero' : 'QuickBooks'}?`)) return
    try {
      await fetch('/api/auth/accounting/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, provider }),
      })
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
      if (response.ok) {
        const data = await response.json()
        setEmailSettings(data)
      } else {
        // Set defaults if no settings exist
        setEmailSettings({
          gmail_connected: false,
          gmail_email: '',
          signature: '',
          auto_reply_enabled: false,
          auto_reply_message: ''
        })
      }
    } catch (error) {
      console.error('Error fetching email settings:', error)
      setEmailSettings({
        gmail_connected: false,
        gmail_email: '',
        signature: '',
        auto_reply_enabled: false,
        auto_reply_message: ''
      })
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

  const savePreferences = async () => {
    setSaving(true)
    setError(null)
  
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError('Please sign in to save preferences')
        return
      }
  
      const prefData = {
        user_id: user.id,
        default_tier: userPreferences.default_tier,
        default_margin_percent: userPreferences.default_margin_percent,
        default_currency: userPreferences.default_currency,
        updated_at: new Date().toISOString()
      }
  
      const { error } = await supabase
        .from('user_preferences')
        .upsert(prefData, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        })
  
      if (error) throw error
  
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Error saving preferences:', err)
      setError(err.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
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
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
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

  const saveEmailSettings = async () => {
    if (!emailSettings) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save email settings')
      }
    } catch (err) {
      setError('Failed to save email settings')
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

    if (!confirm('Are you sure you want to disconnect your Gmail account?')) {
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
      formData.append('userId', profile.id)

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
            onChange={(e) => setProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder={t('emailPlaceholder')}
          />
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
            value={profile?.role || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, role: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder={t('rolePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('timezone')}</label>
          <select
            value={profile?.timezone || 'Africa/Cairo'}
            onChange={(e) => setProfile(prev => prev ? { ...prev, timezone: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div>
          <LanguageSelector />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('companyName')}</label>
          <input
            type="text"
            value={profile?.company_name || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, company_name: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder={t('companyNamePlaceholder')}
          />
        </div>
      </div>

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
            </div>
          </div>

          <div className="flex items-center gap-2">
            {emailSettings?.gmail_connected ? (
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

      {/* Email Signature */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('emailSignature')}</label>
        <SignatureEditor
          content={emailSettings?.signature || ''}
          onChange={(html) => setEmailSettings(prev => prev ? { ...prev, signature: html } : null)}
          placeholder={t('signaturePlaceholder')}
        />
        <p className="text-xs text-gray-500 mt-1">{t('signatureHint')}</p>
      </div>

      {/* Auto Reply */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">{t('autoReply')}</p>
            <p className="text-xs text-gray-500">{t('autoReplyDescription')}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={emailSettings?.auto_reply_enabled || false}
              onChange={(e) => setEmailSettings(prev => prev ? { ...prev, auto_reply_enabled: e.target.checked } : null)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>

        {emailSettings?.auto_reply_enabled && (
          <textarea
            value={emailSettings?.auto_reply_message || ''}
            onChange={(e) => setEmailSettings(prev => prev ? { ...prev, auto_reply_message: e.target.value } : null)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder={t('autoReplyPlaceholder')}
          />
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveEmailSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('saving') : t('saveChanges')}
        </button>
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

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">{t('inAppNotifications')}</p>
              <p className="text-xs text-gray-500">{t('showInApp')}</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationPrefs.in_app_enabled}
              onChange={(e) => setNotificationPrefs(prev => ({ ...prev, in_app_enabled: e.target.checked }))}
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
          { key: 'task_completed', labelKey: 'taskCompleted', descKey: 'taskCompletedDesc', icon: '✅' },
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

  const renderPreferencesTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">{t('itineraryPreferences')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('configureDefaults')}</p>
      </div>

      {/* Default Tier Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-5 h-5 text-amber-600" />
          <h4 className="text-sm font-bold text-gray-900">{t('defaultServiceTier')}</h4>
        </div>

        <p className="text-xs text-gray-600 mb-4">
          {t('tierDescription')}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { value: 'budget', labelKey: 'tierBudget', descKey: 'tierBudgetDesc' },
            { value: 'standard', labelKey: 'tierStandard', descKey: 'tierStandardDesc' },
            { value: 'deluxe', labelKey: 'tierDeluxe', descKey: 'tierDeluxeDesc' },
            { value: 'luxury', labelKey: 'tierLuxury', descKey: 'tierLuxuryDesc' }
          ].map((tier) => {
            const isSelected = userPreferences.default_tier === tier.value

            return (
              <button
                key={tier.value}
                onClick={() => setUserPreferences(prev => ({ ...prev, default_tier: tier.value }))}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  isSelected
                    ? tier.value === 'luxury'
                      ? 'border-amber-500 bg-amber-50'
                      : tier.value === 'deluxe'
                      ? 'border-purple-500 bg-purple-50'
                      : tier.value === 'standard'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-500 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  {tier.value === 'luxury' && <Crown className="w-4 h-4 text-amber-600" />}
                  <span className={`text-sm font-semibold ${
                    isSelected ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    {t(tier.labelKey)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{t(tier.descKey)}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Default Margin Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💰</span>
          <h4 className="text-sm font-bold text-gray-900">{t('defaultProfitMargin')}</h4>
        </div>

        <p className="text-xs text-gray-600 mb-4">
          {t('marginDescription')}
        </p>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="50"
            step="5"
            value={userPreferences.default_margin_percent}
            onChange={(e) => setUserPreferences(prev => ({ ...prev, default_margin_percent: parseInt(e.target.value) }))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#647C47]"
          />
          <div className="w-20 text-center">
            <span className="text-2xl font-bold text-[#647C47]">{userPreferences.default_margin_percent}%</span>
          </div>
        </div>

        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
        </div>
      </div>

      {/* Default Currency Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💱</span>
          <h4 className="text-sm font-bold text-gray-900">{t('defaultCurrency')}</h4>
        </div>

        <p className="text-xs text-gray-600 mb-4">
          {t('currencyDescription')}
        </p>

        <div className="flex gap-2">
          {['EUR', 'USD', 'GBP', 'EGP'].map((currency) => {
            const isSelected = userPreferences.default_currency === currency
            const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }

            return (
              <button
                key={currency}
                onClick={() => setUserPreferences(prev => ({ ...prev, default_currency: currency }))}
                className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                  isSelected
                    ? 'border-[#647C47] bg-[#647C47]/5 text-[#647C47]'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                {symbols[currency]} {currency}
              </button>
            )
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={savePreferences}
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
            Connect your accounting software to automatically sync invoices, expenses, and payments.
          </p>
        </div>

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
                        <button
                          onClick={() => disconnectAccounting(p.key)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
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
                  Set Up WhatsApp
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
              {activeTab === 'preferences' && renderPreferencesTab()}
              {activeTab === 'integrations' && renderIntegrationsTab()}
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