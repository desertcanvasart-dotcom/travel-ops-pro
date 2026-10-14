// ============================================
// A company's accounting connection — the rules the routes share
// ============================================
// A Xero or QuickBooks connection belongs to the COMPANY whose books it
// writes (accounting_tokens UNIQUE (org_id, provider), migration 20270104),
// and a company syncs to one provider at a time (a partial unique index on
// org_id WHERE is_active). Connecting and disconnecting are admin acts (the
// owner passes): every invoice, payment and expense is pushed to the file
// connected here.

import { roleAllows } from '@/lib/auth/roles'
import type { AccountingProviderType } from './types'

export const ACCOUNTING_PROVIDERS: readonly AccountingProviderType[] = ['xero', 'quickbooks']

export function isAccountingProvider(value: unknown): value is AccountingProviderType {
  return typeof value === 'string' && (ACCOUNTING_PROVIDERS as readonly string[]).includes(value)
}

/** The provider a new connection replaces, if the company had it active. */
export function otherAccountingProvider(provider: AccountingProviderType): AccountingProviderType {
  return provider === 'xero' ? 'quickbooks' : 'xero'
}

export const PROVIDER_NAMES: Record<AccountingProviderType, string> = { xero: 'Xero', quickbooks: 'QuickBooks' }

/** Who may connect or disconnect the company's books: admin, owner included. */
export function mayManageAccounting(membershipRole: string | null | undefined): boolean {
  return roleAllows(membershipRole ?? null, ['admin'])
}

/** The callback's state: `${userId}:${provider}:${orgId}:${nonce}`. A state
 *  without a company (minted before the connection was per company) or with
 *  an unknown provider is refused rather than guessed. */
export function parseAccountingState(verified: string | null | undefined): {
  userId: string
  provider: AccountingProviderType
  orgId: string
  nonce: string
} | null {
  if (!verified) return null
  const [userId, provider, orgId, nonce] = verified.split(':')
  if (!userId || !orgId || !isAccountingProvider(provider)) return null
  return { userId, provider, orgId, nonce: nonce ?? '' }
}
