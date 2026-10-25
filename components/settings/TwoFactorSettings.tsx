'use client'

// Settings › Profile › Two-factor login: the person's own authenticator
// devices — list, add one (a second phone is the backup), remove one.
// Removing needs a session that already passed a code (aal2), which anyone
// with a device has here: the middleware let them in only after the code.

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { createClient } from '@/app/supabase'
import { useConfirm } from '@/components/ConfirmDialog'
import TwoFactorEnroll from '@/components/auth/TwoFactorEnroll'

interface Device { id: string; friendly_name?: string | null; created_at?: string }

export default function TwoFactorSettings() {
  const t = useTranslations('twoFactor')
  const confirmDialog = useConfirm()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await createClient().auth.mfa.listFactors()
    setDevices((data?.totp ?? []).filter((f: { status: string }) => f.status === 'verified'))
  }, [])
  useEffect(() => { void load() }, [load])

  const remove = async (d: Device) => {
    const last = (devices?.length ?? 0) <= 1
    if (!(await confirmDialog(last ? t('removeLastConfirm') : t('removeConfirm', { name: d.friendly_name || t('defaultDeviceName') })))) return
    setError(null)
    const { error: err } = await createClient().auth.mfa.unenroll({ factorId: d.id })
    if (err) { setError(`${t('removeFailed')} (${err.message})`); return }
    await load()
  }

  if (!devices) return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />

  return (
    <div className="space-y-4 max-w-md">
      <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${devices.length ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{devices.length ? t('statusOn') : t('statusOff')}</span>
      </div>

      {devices.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
          {devices.map(d => (
            <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-gray-800">{d.friendly_name || t('defaultDeviceName')}</span>
                {d.created_at && <span className="text-xs text-gray-500 ml-2">{t('addedOn', { date: d.created_at.slice(0, 10) })}</span>}
              </span>
              <button type="button" onClick={() => remove(d)} className="text-gray-400 hover:text-red-600 p-1" title={t('remove')} aria-label={t('remove')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-xs">{error}</div>}

      {adding ? (
        <div className="border border-gray-200 rounded-md p-4">
          <TwoFactorEnroll existingCount={devices.length} onDone={() => { setAdding(false); void load() }} />
          <button type="button" onClick={() => setAdding(false)} className="mt-3 text-xs text-gray-500 hover:underline">{t('cancel')}</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 shadow-sm"
        >
          {devices.length ? t('addDevice') : t('startSetup')}
        </button>
      )}
      <p className="text-xs text-gray-500">{t('backupHint')}</p>
    </div>
  )
}
