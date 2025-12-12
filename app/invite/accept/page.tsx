'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  User, 
  Mail, 
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'

interface InvitationData {
  email: string
  role: string
  inviter: {
    full_name: string
    email: string
  }
  expires_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  agent: 'Agent',
  viewer: 'Viewer'
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Full access to all features, settings, and team management',
  manager: 'Manage clients, itineraries, tasks, and view reports',
  agent: 'Work on assigned tasks and clients',
  viewer: 'Read-only access to reports and data'
}

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const supabase = createClientComponentClient()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [formData, setFormData] = useState({
    fullName: '',
    password: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)

  // Verify token on load
  useEffect(() => {
    if (!token) {
      setError('No invitation token provided')
      setLoading(false)
      return
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(`/api/invitations/verify?token=${token}`)
        const data = await response.json()

        if (data.success) {
          setInvitation(data.data)
        } else {
          setError(data.error || 'Invalid invitation')
        }
      } catch (err) {
        setError('Failed to verify invitation')
      } finally {
        setLoading(false)
      }
    }

    verifyToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!formData.fullName.trim()) {
      setError('Please enter your name')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)

    try {
      // Create account with Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: invitation!.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName
          }
        }
      })

      if (signUpError) {
        throw signUpError
      }

      if (data.user) {
        setSuccess(true)
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#647C47] animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying invitation...</p>
        </div>
      </div>
    )
  }

  // Error state (invalid/expired token)
  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link 
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#647C47]/10 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Autoura!</h1>
          <p className="text-gray-600 mb-4">Your account has been created successfully.</p>
          <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  // Main form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#647C47] rounded-xl flex items-center justify-center mx-auto mb-4">
            <img src="/autoura-logo.png" alt="Autoura" className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join Autoura</h1>
          <p className="text-gray-600 mt-1">Complete your account setup</p>
        </div>

        {/* Invitation Info Card */}
        <div className="bg-[#647C47]/10 border border-[#647C47]/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-[#647C47]" />
            </div>
            <div>
              <p className="text-sm text-gray-600">
                <strong>{invitation?.inviter?.full_name || 'An administrator'}</strong> invited you to join as:
              </p>
              <p className="text-lg font-semibold text-[#647C47] mt-1">
                {ROLE_LABELS[invitation?.role || 'agent']}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {ROLE_DESCRIPTIONS[invitation?.role || 'agent']}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={invitation?.email || ''}
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-500"
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="Create a password"
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
              <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="Confirm your password"
                  required
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-[#647C47] hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// Export with Suspense boundary
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  )
}