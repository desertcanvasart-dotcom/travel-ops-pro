'use client'

// Enter the code from your authenticator app. The middleware sends anyone who
// has set up two-factor here after the password (lib/auth/two-factor.ts); a
// correct code raises the session to aal2 and the person goes on to where
// they were heading.

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/app/supabase'
import { safeNextPath } from '@/lib/auth/two-factor'
import TwoFactorShell from './TwoFactorShell'

interface Device { id: string; friendly_name?: string | null }

function VerifyCode() {
  const t = useTranslations('twoFactor')
  const next = safeNextPath(useSearchParams().get('next'))
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void createClient().auth.mfa.listFactors().then(({ data }: { data: { totp?: Array<Device & { status: string }> } | null }) => {
      const verified = (data?.totp ?? []).filter((f: { status: string }) => f.status === 'verified')
      setDevices(verified)
      setFactorId(verified[0]?.id ?? '')
    })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return
    setBusy(true); setError(null)
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
    if (err) { setBusy(false); setError(t('wrongCode')); return }
    // A full load, so the middleware reads the raised session from its cookie.
    window.location.assign(next)
  }

  return (
    <TwoFactorShell title={t('verifyTitle')} subtitle={t('verifySubtitle')}>
      {devices && devices.length === 0 ? (
        <p className="text-sm text-gray-600">{t('noDevice')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {devices && devices.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="tf-device-pick">{t('chooseDevice')}</label>
              <select id="tf-device-pick" value={factorId} onChange={e => setFactorId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                {devices.map(d => <option key={d.id} value={d.id}>{d.friendly_name || t('defaultDeviceName')}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="tf-verify-code">{t('codeLabel')}</label>
            <input
              id="tf-verify-code"
              value={code}
              onChange={e => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              required
              autoFocus
              className="w-full px-3 py-3 border border-gray-300 rounded-lg tracking-[0.3em] text-center text-xl font-mono focus:ring-2 focus:ring-[#263A29] focus:border-transparent"
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
          <button
            type="submit"
            disabled={busy || !factorId || code.replace(/\s/g, '').length < 6}
            className="w-full bg-[#263A29] text-white py-3 rounded-lg hover:bg-[#1D2B20] disabled:opacity-50 font-medium"
          >
            {t('verify')}
          </button>
          <p className="text-xs text-gray-500">{t('lostDevice')}</p>
        </form>
      )}
    </TwoFactorShell>
  )
}

export default function TwoFactorPage() {
  return <Suspense fallback={null}><VerifyCode /></Suspense>
}
