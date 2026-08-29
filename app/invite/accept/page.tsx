'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserClient } from '@supabase/ssr'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  User,
  Lock,
  Mail,
  Shield
} from 'lucide-react'

interface InvitationData {
  email: string
  role: string
  invited_by_name: string
  expires_at: string
}

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('invite')
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // What actually happened, so the success screen can say it. Three endings:
  //  'dashboard'  — account created (or repaired) and signed in; going to /dashboard
  //  'existing'   — the address already had a confirmed account. Membership is
  //                 granted, but its OWN password still applies, not the one
  //                 just typed, so the next step is signing in as themselves.
  //  'signIn'     — the account is ready with the password just chosen, but the
  //                 automatic sign-in leg failed. They just need to sign in.
  // Getting this wrong is not cosmetic: the screen used to promise "account
  // created, redirecting to dashboard" while sending people to /login with a
  // password that was never set.
  const [outcome, setOutcome] = useState<'dashboard' | 'existing' | 'signIn'>('dashboard')
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    if (token) {
      verifyToken()
    } else {
      setError(t('invalidInvitationLink'))
      setLoading(false)
    }
  }, [token])

  const verifyToken = async () => {
    try {
      const response = await fetch(`/api/invitations/verify?token=${token}`)
      const data = await response.json()

      if (data.success) {
        setInvitation(data.data)
      } else {
        setError(data.error || t('invalidOrExpiredInvitation'))
      }
    } catch (err) {
      setError(t('failedToVerifyInvitation'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!fullName.trim()) {
      setError(t('pleaseEnterFullName'))
      return
    }

    if (password.length < 8) {
      setError(t('passwordMinLength'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'))
      return
    }

    setSubmitting(true)

    try {
      // The SERVER creates the account, already confirmed, and binds the
      // membership in one call. It used to be supabase.auth.signUp() here,
      // which leaves the account unconfirmed when the project requires email
      // confirmation: the invitee then needs a second email before they can
      // ever sign in, and missing it strands the account for good (it exists,
      // so signup answers "already registered", and login always fails).
      // The invitation token was emailed to them — that is the verification.
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, fullName })
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        throw new Error(result.error || t('failedToCreateAccount'))
      }

      // An already-confirmed account keeps its own password (an invitation
      // must never reset a live account's credentials), so signing in with
      // the password just typed would fail — send them to the login page.
      if (result.mode === 'link') {
        setOutcome('existing')
        setSuccess(true)
        setTimeout(() => router.push('/login'), 4000)
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: result.email || invitation!.email,
        password,
      })
      if (signInError) {
        // The account is real and usable; only this leg failed.
        setOutcome('signIn')
        setSuccess(true)
        setTimeout(() => router.push('/login'), 4000)
        return
      }

      setOutcome('dashboard')
      setSuccess(true)

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

    } catch (err: any) {
      setError(err.message || t('failedToCreateAccount'))
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#647C47] animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">{t('verifyingInvitation')}</p>
        </div>
      </div>
    )
  }

  // Error state (invalid/expired token)
  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('invalidInvitation')}</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors"
          >
            {t('goToLogin')}
          </a>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('welcomeToAutoura')}</h1>
          <p className="text-gray-600 mb-4">
            {outcome === 'existing'
              ? t('accountExistsNowLinked')
              : outcome === 'signIn'
                ? t('accountReadyPleaseSignIn')
                : t('accountCreatedSuccessfully')}
          </p>
          <p className="text-sm text-gray-500">
            {outcome === 'dashboard' ? t('redirectingToDashboard') : t('redirectingToSignIn')}
          </p>
        </div>
      </div>
    )
  }

  // Form state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#647C47]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-[#647C47]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('acceptInvitation')}</h1>
          <p className="text-gray-600 mt-2">{t('createAccountToJoinTeam')}</p>
        </div>

        {/* Invitation Info Card */}
        <div className="bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Mail className="w-5 h-5 text-[#647C47]" />
            <span className="text-sm text-gray-700">{invitation?.email}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <User className="w-5 h-5 text-[#647C47]" />
            <span className="text-sm text-gray-700">
              {t('invitedBy')} <span className="font-medium">{invitation?.invited_by_name || t('admin')}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-[#647C47]" />
            <span className="text-sm text-gray-700">
              {t('role')}: <span className="font-medium capitalize">{invitation?.role}</span>
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('fullName')}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                placeholder={t('enterFullNamePlaceholder')}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('password')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                placeholder={t('createPasswordPlaceholder')}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('passwordMinLengthHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('confirmPassword')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                placeholder={t('confirmPasswordPlaceholder')}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-[#647C47] text-white font-medium rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('creatingAccount')}
              </>
            ) : (
              t('createAccount')
            )}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          {t('alreadyHaveAccount')}{' '}
          <a href="/login" className="text-[#647C47] hover:underline font-medium">
            {t('signIn')}
          </a>
        </p>
      </div>
    </div>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-[#647C47] animate-spin" />
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  )
}