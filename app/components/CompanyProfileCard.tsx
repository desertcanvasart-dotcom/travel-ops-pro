'use client'

// ============================================
// Company profile, from Settings → Organization
// ============================================
// The identity printed on customer-facing paper: logo, name, tagline, phone,
// email, website, postal address — plus the operator's document-header contact
// slots (the A.T.S 日程表 reads cairo_guide / south_guide / emergency_japan /
// cairo_office). Documents and the customer portal render whatever is here;
// a blank field renders blank, never a placeholder.
//
// Self-contained like PaymentTermsCard: fetches and saves its own state.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, Loader2, Check, Upload } from 'lucide-react'

interface Profile {
  name: string
  tagline: string
  logo_url: string | null
  contact_email: string
  company_phone: string
  company_website: string
  company_address: string
  document_contacts: Record<string, string>
}

// Company-LEVEL contacts only. The カイロガイド / 南部ガイド header cells are
// per-trip facts — a different guide each departure — so they are filled at
// the itinerary level, never here; the programme document prints them blank
// exactly like the office's own template files.
const CONTACT_SLOTS = ['emergency_japan', 'cairo_office'] as const

export default function CompanyProfileCard() {
  const t = useTranslations('settings.companyProfile')
  const [form, setForm] = useState<Profile>({
    name: '',
    tagline: '',
    logo_url: null,
    contact_email: '',
    company_phone: '',
    company_website: '',
    company_address: '',
    document_contacts: {},
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/organization/branding')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setForm({
        name: data.data.name ?? '',
        tagline: data.data.tagline ?? '',
        logo_url: data.data.logo_url ?? null,
        contact_email: data.data.contact_email ?? '',
        company_phone: data.data.company_phone ?? '',
        company_website: data.data.company_website ?? '',
        company_address: data.data.company_address ?? '',
        document_contacts: data.data.document_contacts ?? {},
      })
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/organization/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('logo', file)
      const res = await fetch('/api/organization/branding', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setForm(prev => ({ ...prev, logo_url: data.logo_url }))
    } catch (err: any) {
      setError(err.message || 'Failed to upload logo')
    } finally {
      setUploading(false)
    }
  }

  const set = (field: keyof Profile, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))
  const setContact = (slot: string, value: string) =>
    setForm(prev => ({
      ...prev,
      document_contacts: { ...prev.document_contacts, [slot]: value },
    }))

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/40'

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('loading')}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-5 h-5 text-[#647C47]" />
        <h3 className="font-semibold text-gray-900">{t('title')}</h3>
      </div>
      <p className="text-sm text-gray-500 mb-5">{t('subtitle')}</p>

      {/* Logo */}
      <div className="flex items-center gap-4 mb-5">
        {form.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.logo_url}
            alt="logo"
            className="h-14 w-auto max-w-[160px] object-contain border border-gray-200 rounded bg-white p-1"
          />
        ) : (
          <div className="h-14 w-24 border border-dashed border-gray-300 rounded flex items-center justify-center text-xs text-gray-400">
            {t('noLogo')}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) uploadLogo(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {t('uploadLogo')}
        </button>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('companyName')}</label>
          <input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('tagline')}</label>
          <input className={inputClass} value={form.tagline} onChange={e => set('tagline', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('phone')}</label>
          <input className={inputClass} value={form.company_phone} onChange={e => set('company_phone', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('email')}</label>
          <input className={inputClass} value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('website')}</label>
          <input className={inputClass} value={form.company_website} onChange={e => set('company_website', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('address')}</label>
          <input className={inputClass} value={form.company_address} onChange={e => set('company_address', e.target.value)} />
        </div>
      </div>

      {/* Document header contacts */}
      <p className="text-xs font-medium text-gray-600 mt-5 mb-1">{t('documentContacts')}</p>
      <p className="text-xs text-gray-400 mb-3">{t('documentContactsHint')}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CONTACT_SLOTS.map(slot => (
          <div key={slot}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t(`slots.${slot}`)}</label>
            <input
              className={inputClass}
              value={form.document_contacts[slot] ?? ''}
              onChange={e => setContact(slot, e.target.value)}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? t('saved') : t('save')}
        </button>
      </div>
    </div>
  )
}
