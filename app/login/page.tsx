import { Suspense } from 'react'
import LoginContent from './login-content'
import { marketingPagesOff } from '@/lib/http/marketing-pages'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  // A company's own install has no public sign-up (lib/http/marketing-pages).
  const showSignUp = !marketingPagesOff(process.env.MARKETING_PAGES)
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
      <LoginContent showSignUp={showSignUp} />
    </Suspense>
  )
}
