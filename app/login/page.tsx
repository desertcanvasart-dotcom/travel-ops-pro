import { Suspense } from 'react'
import type { Metadata } from 'next'
import LoginContent from './login-content'
import { marketingPagesOff } from '@/lib/http/marketing-pages'
import { businessIdentity } from '@/lib/org-identity'

export const dynamic = 'force-dynamic'

// A company's own install (lib/http/marketing-pages) says whose system this
// is — "Autoura · <company>" — and has no public sign-up. The product site
// keeps its own login page as it was.
function installCompanyName(): string {
  return marketingPagesOff(process.env.MARKETING_PAGES) ? businessIdentity().name : ''
}

export function generateMetadata(): Metadata {
  const company = installCompanyName()
  return company ? { title: `${company} · Autoura` } : {}
}

export default function LoginPage() {
  const showSignUp = !marketingPagesOff(process.env.MARKETING_PAGES)
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
      <LoginContent showSignUp={showSignUp} companyName={installCompanyName()} />
    </Suspense>
  )
}
