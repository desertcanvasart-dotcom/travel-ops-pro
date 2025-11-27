'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Send, Check, AlertCircle, Settings, Phone, Zap } from 'lucide-react'

interface ConfigStatus {
  configured: boolean
  config: {
    accountSid: string
    apiKey: string
    apiSecret: string
    whatsappFrom: string
    businessName: string
    autoSendEnabled: string
    statusUpdatesEnabled: string
  }
  message: string
}

export default function WhatsAppSettingsPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/whatsapp/test')
      const data = await response.json()
      setConfig(data)
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!testPhone) {
      setTestResult({ success: false, message: 'Please enter a phone number' })
      return
    }

    try {
      setTestLoading(true)
      setTestResult(null)

      const response = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: testPhone })
      })

      const data = await response.json()
      setTestResult(data)

    } catch (error: any) {
      setTestResult({ success: false, message: error.message })
    } finally {
      setTestLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-slate-200 rounded w-1/3"></div>
              <div className="h-4 bg-slate-200 rounded w-2/3"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-[#25D366] rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">WhatsApp Integration</h1>
              <p className="text-slate-600 mt-1">Send quotes and updates directly to your clients</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium
            ${config?.configured 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
            }
          `}>
            {config?.configured ? (
              <>
                <Check className="w-4 h-4" />
                <span>Fully Configured</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4" />
                <span>Configuration Incomplete</span>
              </>
            )}
          </div>
        </div>

        {/* Configuration Status */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-5 h-5 text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-800">Configuration Status</h2>
          </div>

          <div className="space-y-3">
            {Object.entries(config?.config || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                <span className="text-slate-600 font-medium capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className={`
                  font-mono text-sm px-3 py-1 rounded-lg
                  ${value.includes('✅') ? 'bg-green-100 text-green-800' : ''}
                  ${value.includes('❌') ? 'bg-red-100 text-red-800' : ''}
                  ${value.includes('⚠️') ? 'bg-yellow-100 text-yellow-800' : ''}
                `}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {!config?.configured && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-2">Configuration Required</p>
                  <p>Please check your <code className="bg-yellow-100 px-2 py-1 rounded">.env.local</code> file and ensure all Twilio credentials are set.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Test Connection */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Phone className="w-5 h-5 text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-800">Test Connection</h2>
          </div>

          <p className="text-slate-600 mb-4">
            Send a test message to verify your WhatsApp integration is working correctly.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Your Phone Number
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+201234567890"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#25D366] focus:border-transparent"
              />
              <p className="text-sm text-slate-500 mt-2">
                Include country code (e.g., +20 for Egypt, +1 for USA)
              </p>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={testLoading || !testPhone}
              className="flex items-center gap-2 px-6 py-3 bg-[#25D366] text-white rounded-lg font-medium hover:bg-[#20BD5A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testLoading ? (
                <>
                  <MessageCircle className="w-4 h-4 animate-pulse" />
                  <span>Sending Test Message...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Test Message</span>
                </>
              )}
            </button>

            {testResult && (
              <div className={`
                flex items-start gap-3 p-4 rounded-lg
                ${testResult.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
                }
              `}>
                {testResult.success ? (
                  <>
                    <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-green-800">
                      <p className="font-medium">Success!</p>
                      <p className="mt-1">{testResult.message}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-red-800">
                      <p className="font-medium">Error</p>
                      <p className="mt-1">{testResult.message}</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-gradient-to-br from-[#25D366] to-[#20BD5A] rounded-2xl shadow-lg p-8 text-white">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Quick Start Guide</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold">1</span>
              </div>
              <div>
                <p className="font-medium">Configure Twilio Credentials</p>
                <p className="text-white/80 text-sm mt-1">Add your credentials to <code className="bg-white/20 px-2 py-1 rounded">.env.local</code></p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold">2</span>
              </div>
              <div>
                <p className="font-medium">Test the Connection</p>
                <p className="text-white/80 text-sm mt-1">Send yourself a test message using the form above</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold">3</span>
              </div>
              <div>
                <p className="font-medium">Start Sending Messages</p>
                <p className="text-white/80 text-sm mt-1">Use the "Send via WhatsApp" buttons throughout the app</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
