'use client'

// Set up an authenticator app (TOTP) for the signed-in person: Supabase makes
// a secret and QR code, the person scans it, and the first code they enter
// verifies the device — which also raises this session to aal2, so they go
// straight on without a second prompt (lib/auth/two-factor.ts).
//
// A device that was started but never verified is removed first: Supabase
// keeps it as an unverified factor, and a second attempt would otherwise stop
// on a duplicate.

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/app/supabase'

interface Props {
  onDone: () => void
  /** A device the person may already have: the button then reads "Add another device". */
  existingCount?: number
}

export default function TwoFactorEnroll({ onDone, existingCount = 0 }: Props) {
  const t = useTranslations('twoFactor')
  const [step, setStep] = useState<'start' | 'scan'>('start')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Leave nothing half-made behind if the person walks away mid-way: the
  // device being set up, until its first code verifies it.
  const pending = useRef<string | null>(null)
  useEffect(() => () => {
    if (pending.current) void createClient().auth.mfa.unenroll({ factorId: pending.current }).catch(() => {})
  }, [])

  const start = async () => {
    setBusy(true); setError(null)
    try {
      const mfa = createClient().auth.mfa
      const { data: listed } = await mfa.listFactors()
      for (const f of listed?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await mfa.unenroll({ factorId: f.id })
      }
      const name = deviceName.trim() || `${t('defaultDeviceName')} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
      const { data, error: err } = await mfa.enroll({ factorType: 'totp', friendlyName: name })
      if (err || !data) throw err ?? new Error('enroll failed')
      setFactorId(data.id)
      pending.current = data.id
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('scan')
    } catch (e) {
      setError(e instanceof Error && e.message ? `${t('setupFailed')} (${e.message})` : t('setupFailed'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return
    setBusy(true); setError(null)
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
    setBusy(false)
    if (err) { setError(t('wrongCode')); return }
    pending.current = null
    setStep('start'); setFactorId(null); setCode('')
    onDone()
  }

  if (step === 'start') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{t('setupIntro')}</p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="tf-device">{t('deviceName')}</label>
          <input
            id="tf-device"
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            maxLength={60}
            placeholder={t('deviceNamePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#263A29] focus:border-transparent"
          />
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="w-full bg-[#263A29] text-white py-2.5 rounded-lg hover:bg-[#1D2B20] disabled:opacity-50 font-medium"
        >
          {existingCount > 0 ? t('addDevice') : t('startSetup')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-1">
        <li>{t('scanStep')}</li>
        <li>{t('codeStep')}</li>
      </ol>
      {qr && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URL */}
          <img src={qr} alt={t('qrAlt')} width={192} height={192} className="border border-gray-200 rounded-lg bg-white p-2" />
        </div>
      )}
      {secret && (
        <p className="text-xs text-gray-500 text-center">
          {t('manualKey')} <code className="font-mono text-gray-800 break-all select-all">{secret}</code>
        </p>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="tf-code">{t('codeLabel')}</label>
        <input
          id="tf-code"
          value={code}
          onChange={e => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          required
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-lg tracking-[0.3em] text-center text-lg font-mono focus:ring-2 focus:ring-[#263A29] focus:border-transparent"
        />
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
      <button
        type="submit"
        disabled={busy || code.replace(/\s/g, '').length < 6}
        className="w-full bg-[#263A29] text-white py-2.5 rounded-lg hover:bg-[#1D2B20] disabled:opacity-50 font-medium"
      >
        {t('verifyAndFinish')}
      </button>
    </form>
  )
}
