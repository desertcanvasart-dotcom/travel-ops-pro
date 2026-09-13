'use client'

// ============================================
// Licence card, from Settings → Organization
// ============================================
// What this install is licensed as: the licensee, the term, and the state
// the verifier found LICENSE_KEY in (lib/licence). Read-only — the key is
// set in the environment by whoever runs the server, and nothing here can
// change what the app does: a missing or expired licence is shown, never
// enforced by locking anyone out.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { KeyRound, Loader2 } from 'lucide-react'
import type { LicenceResult, LicenceStatus } from '@/lib/licence'

interface LicenceInfo extends LicenceResult {
  configured: boolean
}

const PILL: Record<LicenceStatus, string> = {
  valid: 'bg-green-100 text-green-700',
  grace: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  invalid: 'bg-red-100 text-red-700',
  missing: 'bg-gray-100 text-gray-600',
}

export default function LicenceCard() {
  const t = useTranslations('settings.licence')
  const [info, setInfo] = useState<LicenceInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/licence')
      .then(r => r.json())
      .then(j => { if (alive) { if (j?.success) setInfo(j.data); else setFailed(true) } })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const licence = info?.licence ?? null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-[#647C47]/10 flex items-center justify-center flex-shrink-0">
          <KeyRound className="w-6 h-6 text-[#647C47]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-semibold text-gray-900">{t('title')}</h3>
            {info && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PILL[info.status]}`}>
                {t(`status.${info.status}`)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-4">{t('description')}</p>

          {!info && !failed && <Loader2 className="w-5 h-5 text-[#647C47] animate-spin" />}
          {failed && <p className="text-sm text-red-600">{t('failedToLoad')}</p>}

          {info && licence && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-500">{t('licensee')}</dt>
              <dd className="text-gray-900 font-medium">{licence.licensee}</dd>
              <dt className="text-gray-500">{t('licenceId')}</dt>
              <dd className="text-gray-900 font-mono">{licence.lid}</dd>
              <dt className="text-gray-500">{t('validUntil')}</dt>
              <dd className="text-gray-900">
                {licence.valid_until}
                {info.daysLeft !== null && info.daysLeft > 0 && (
                  <span className="text-gray-500"> · {t('daysLeft', { count: info.daysLeft })}</span>
                )}
              </dd>
              <dt className="text-gray-500">{t('domains')}</dt>
              <dd className="text-gray-900">{licence.domains.join(', ')}</dd>
              <dt className="text-gray-500">{t('seats')}</dt>
              <dd className="text-gray-900">{licence.seats}</dd>
              <dt className="text-gray-500">{t('features')}</dt>
              <dd className="text-gray-900">{licence.features.join(', ')}</dd>
            </dl>
          )}

          {info && (
            <p className={`text-sm mt-4 ${info.status === 'valid' ? 'text-gray-500' : 'text-gray-800'}`}>{info.reason}</p>
          )}
          {info && info.status === 'missing' && (
            <p className="text-sm text-gray-500 mt-2">{t('howToSet')}</p>
          )}
          {info && info.status === 'invalid' && info.configured && (
            <p className="text-sm text-gray-500 mt-2">{t('invalidHint')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
