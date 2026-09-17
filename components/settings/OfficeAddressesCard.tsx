'use client'

// Settings → Email → Office addresses (lib/email/office-addresses.ts): the
// addresses and domains the office writes from. Mail from them is our reply —
// never a customer waiting for an answer.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Building2 } from 'lucide-react'

export default function OfficeAddressesCard() {
  const t = useTranslations('officeAddresses')
  const [text, setText] = useState('')
  const [automatic, setAutomatic] = useState<{ addresses: string[]; domains: string[] }>({ addresses: [], domains: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/settings/office-email-addresses')
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setText((j.addresses as string[]).join('\n'))
          setAutomatic(j.automatic)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch('/api/settings/office-email-addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) }),
      })
      const j = await res.json()
      if (!res.ok || !j.success) {
        setNotice({ ok: false, text: j.error || t('saveFailed') })
      } else {
        setText((j.addresses as string[]).join('\n'))
        setNotice({ ok: true, text: j.reclassified ? t('savedFixed', { messages: j.reclassified.messages, conversations: j.reclassified.conversations }) : t('saved') })
      }
    } catch {
      setNotice({ ok: false, text: t('saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const covered = [...automatic.addresses, ...automatic.domains.map(d => `@${d}`)]

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5" data-testid="office-addresses-card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-[#647C47]/10 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-6 h-6 text-[#647C47]" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">{t('description')}</p>
          {covered.length > 0 && (
            <p className="text-xs text-gray-600 mb-2">{t('automatic', { list: covered.join(', ') })}</p>
          )}
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <>
              <label htmlFor="office-addresses" className="sr-only">{t('title')}</label>
              <textarea
                id="office-addresses"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={4}
                placeholder={t('placeholder')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('save')}
                </button>
                {notice && <span className={`text-xs ${notice.ok ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
