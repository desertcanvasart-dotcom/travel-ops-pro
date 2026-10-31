'use client'

// ============================================
// Settings › Organization › Accounting
// ============================================
// The company's Xero or QuickBooks connection. Moved as it was from the old
// Settings "Integrations" tab (/settings?tab=integrations redirects here, and
// the OAuth callback returns here with ?accounting=connected or ?error=).
// Connecting and disconnecting are admin-only on the server; a manager sees
// the state and is told why the buttons are missing.

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  CreditCard,
  Loader2,
  X,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  FileText,
  Calculator,
  Info,
} from 'lucide-react'

function AccountingContent() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const confirmDialog = useConfirm()
  // The membership role in this company. Connecting the company's accounting
  // software is admin-only on the server (owner included).
  const { role, isAdmin } = useRole()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accountingStatus, setAccountingStatus] = useState<{
    xero: { connected: boolean; company_name: string; last_updated: string } | null
    quickbooks: { connected: boolean; company_name: string; last_updated: string } | null
  }>({ xero: null, quickbooks: null })
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  // What the accounting OAuth callback reported (?accounting=connected&…).
  const [accountingNotice, setAccountingNotice] = useState<{ ok: boolean; text: string } | null>(() => {
    const names: Record<string, string> = { xero: 'Xero', quickbooks: 'QuickBooks' }
    if (searchParams.get('accounting') === 'connected') {
      const now = names[searchParams.get('provider') || ''] || 'The accounting software'
      const replaced = names[searchParams.get('replaced') || '']
      return {
        ok: true,
        text: replaced
          ? `${now} is connected. ${replaced} was switched off: a company sends its books to one accounting provider at a time.`
          : `${now} is connected. New invoices, expenses and payments are sent to it.`,
      }
    }
    if (searchParams.get('error') === 'not_admin') {
      return { ok: false, text: 'Not connected: only the agency owner or an admin of this company can connect its accounting software.' }
    }
    return null
  })

  useEffect(() => {
    fetchAccountingStatus().finally(() => setLoading(false))
  }, [])

  const fetchAccountingStatus = async () => {
    try {
      // The COMPANY's connections, whoever made them (accounting_tokens is per
      // (org_id, provider) since 20270104).
      const response = await fetch('/api/auth/accounting/status')
      if (response.ok) {
        const data = await response.json()
        setAccountingStatus(data)
      }
    } catch (error) {
      console.error('Error fetching accounting status:', error)
    }
  }

  const connectAccounting = async (provider: 'xero' | 'quickbooks') => {
    if (!user) return
    // Connecting one provider switches the other off (one per company).
    const other = provider === 'xero' ? 'quickbooks' : 'xero'
    if (accountingStatus[other]?.connected && !(await confirmDialog(
      `${provider === 'xero' ? 'QuickBooks' : 'Xero'} is connected. Connecting ${provider === 'xero' ? 'Xero' : 'QuickBooks'} switches it off — the company's invoices, expenses and payments then go only to ${provider === 'xero' ? 'Xero' : 'QuickBooks'}. Continue?`
    ))) return
    setConnectingProvider(provider)
    try {
      const response = await fetch('/api/auth/accounting/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await response.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError(data.error || 'Failed to initiate connection')
      }
    } catch (error) {
      console.error('Error connecting accounting:', error)
      setError('Failed to initiate connection')
    } finally {
      setConnectingProvider(null)
    }
  }

  const disconnectAccounting = async (provider: 'xero' | 'quickbooks') => {
    if (!user || !(await confirmDialog(`Disconnect ${provider === 'xero' ? 'Xero' : 'QuickBooks'}?`))) return
    try {
      const res = await fetch('/api/auth/accounting/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to disconnect')
        return
      }
      setAccountingStatus(prev => ({ ...prev, [provider]: null }))
    } catch (error) {
      console.error('Error disconnecting:', error)
    }
  }

  const renderIntegrationsTab = () => {
    const providers = [
      {
        key: 'xero' as const,
        name: 'Xero',
        description: 'Push invoices, expenses, and payments to Xero',
        color: 'bg-[#13B5EA]',
        letterColor: 'text-white',
      },
      {
        key: 'quickbooks' as const,
        name: 'QuickBooks',
        description: 'Push invoices, expenses, and payments to QuickBooks',
        color: 'bg-[#2CA01C]',
        letterColor: 'text-white',
      },
    ]

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Accounting Integrations</h3>
          <p className="text-sm text-gray-500 mt-1">
            Connect your company's accounting software to automatically sync invoices, expenses, and payments.
            The connection belongs to the company: every admin sees it, whoever connected it, and a company
            sends its books to one provider at a time.
          </p>
        </div>

        {accountingNotice && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${accountingNotice.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {accountingNotice.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span className="flex-1">{accountingNotice.text}</span>
            <button onClick={() => setAccountingNotice(null)} className="p-0.5"><X className="w-4 h-4" /></button>
          </div>
        )}

        {!isAdmin && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Only the agency owner or an admin can connect or disconnect the accounting software.</span>
          </div>
        )}

        <div className="space-y-4">
          {providers.map(p => {
            const status = accountingStatus[p.key]
            const isConnected = status?.connected

            return (
              <div key={p.key} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${p.color}`}>
                      <span className={`text-sm font-bold ${p.letterColor}`}>{p.name[0]}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {isConnected
                          ? `Connected to ${status.company_name || p.name}`
                          : p.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <>
                        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Connected
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => disconnectAccounting(p.key)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            Disconnect
                          </button>
                        )}
                      </>
                    ) : isAdmin ? (
                      <button
                        onClick={() => connectAccounting(p.key)}
                        disabled={connectingProvider === p.key}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                      >
                        {connectingProvider === p.key ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <LinkIcon className="w-4 h-4" />
                        )}
                        Connect {p.name}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">Not connected</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* What Gets Synced */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">What gets synced</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-[#647C47] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Invoices</p>
                <p className="text-xs text-gray-500">Client invoices pushed as AR invoices</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CreditCard className="w-4 h-4 text-[#647C47] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Expenses</p>
                <p className="text-xs text-gray-500">Supplier expenses pushed as bills</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calculator className="w-4 h-4 text-[#647C47] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Payments</p>
                <p className="text-xs text-gray-500">Payment records synced automatically</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            Sync is push-only: Autoura sends data to your accounting software. Changes made in Xero or QuickBooks are not pulled back.
          </p>
        </div>

      </div>
    )
  }

  return (
    <div className="m-4 md:m-6 max-w-4xl bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      {error && (
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
    </div>
      ) : renderIntegrationsTab()}
    </div>
  )
}

export default function AccountingSettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
    </div>}>
      <AccountingContent />
    </Suspense>
  )
}
