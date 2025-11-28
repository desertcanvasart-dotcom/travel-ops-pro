
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import Link from 'next/link'
import { 
  Mail, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  Loader2,
  Unlink,
  ExternalLink
} from 'lucide-react'
import { createClient } from '@/app/supabase'

export default function EmailSettingsPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    
    if (success) {
      setMessage({ type: 'success', text: 'Gmail connected successfully!' })
    } else if (error) {
      setMessage({ type: 'error', text: `Connection failed: ${error}` })
    }
  }, [searchParams])

  useEffect(() => {
    if (user) {
      checkGmailConnection()
    }
  }, [user])

  const checkGmailConnection = async () => {
    try {
      const { data, error } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', user?.id)
        .single()

      if (data && !error) {
        setGmailConnected(true)
        setConnectedEmail(data.email)
      }
    } catch (err) {
      // Not connected
    } finally {
      setLoading(false)
    }
  }

  const handleConnectGmail = async () => {
    if (!user) return
    
    setConnecting(true)
    try {
      const response = await fetch('/api/gmail/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await response.json()
      
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        throw new Error(data.error || 'Failed to get auth URL')
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
      setConnecting(false)
    }
  }

  const handleDisconnectGmail = async () => {
    if (!user || !confirm('Are you sure you want to disconnect Gmail?')) return

    try {
      const { error } = await supabase
        .from('gmail_tokens')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      setGmailConnected(false)
      setConnectedEmail(null)
      setMessage({ type: 'success', text: 'Gmail disconnected successfully' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/settings/profile"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Settings
              </Link>
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary-600" />
                Email Settings
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Connect your Gmail to send and receive emails in Autoura</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          
          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-lg border ${
              message.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-700' 
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {message.type === 'success' ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                  <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#EA4335"/>
                </svg>
              </div>
              
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">Gmail</h3>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">
                  Connect your Gmail account to read and send emails directly from Autoura
                </p>

                {loading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking connection...
                  </div>
                ) : gmailConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-700">
                        Connected as <strong>{connectedEmail}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href="/inbox"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Open Inbox
                      </Link>
                      <button
                        onClick={handleDisconnectGmail}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGmail}
                    disabled={connecting}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#EA4335] rounded-lg hover:bg-[#d33426] transition-colors disabled:opacity-50"
                  >
                    {connecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        Connect Gmail
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">What you can do with Gmail connected:</h4>
            <ul className="space-y-1.5">
              {[
                'View your inbox directly in Autoura',
                'Send quotes and confirmations from your email',
                'Reply to client emails without leaving the app',
                'Emails are automatically linked to client profiles'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-blue-800">
                  <Check className="w-3.5 h-3.5 text-blue-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </div>
  )
}