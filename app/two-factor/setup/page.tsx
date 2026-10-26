'use client'

// Set up two-factor before going on: the middleware sends an owner,
// administrator or manager here when the company requires two-factor and
// they have no authenticator yet (lib/auth/two-factor.ts). Verifying the
// first code also raises the session, so they go straight on.

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { safeNextPath } from '@/lib/auth/two-factor'
import TwoFactorEnroll from '@/components/auth/TwoFactorEnroll'
import TwoFactorShell from '../TwoFactorShell'

function Setup() {
  const t = useTranslations('twoFactor')
  const next = safeNextPath(useSearchParams().get('next'))
  return (
    <TwoFactorShell title={t('setupTitle')} subtitle={t('setupRequired')}>
      <TwoFactorEnroll onDone={() => window.location.assign(next)} />
    </TwoFactorShell>
  )
}

export default function TwoFactorSetupPage() {
  return <Suspense fallback={null}><Setup /></Suspense>
}
