'use client'

// The frame both two-factor screens share: the login page's look, and a way
// out (sign out) for someone who cannot finish.

import { useTranslations } from 'next-intl'
import { createClient } from '@/app/supabase'

export default function TwoFactorShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const t = useTranslations('twoFactor')
  const signOut = async () => {
    await createClient().auth.signOut()
    window.location.assign('/login')
  }
  return (
    <div className="min-h-screen bg-[#F7F7F4] flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#263A29] rounded-2xl mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" stroke="white" strokeWidth="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
          <p className="text-gray-600 text-sm">{subtitle}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-7 border border-gray-100">{children}</div>
        <p className="text-center text-sm text-gray-500 mt-5">
          <button type="button" onClick={signOut} className="text-[#263A29] hover:underline">{t('signOut')}</button>
        </p>
      </div>
    </div>
  )
}
