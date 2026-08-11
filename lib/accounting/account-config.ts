// ============================================
// ACCOUNTING ACCOUNT REFERENCES (audit M4)
// ============================================
// Bill payments and expense lines must name a ledger account in the accounting
// system. Those identifiers were hardcoded — QuickBooks BankAccountRef '35' and
// AccountRef '7', Xero Account '090' — which are ids from whatever sandbox the
// integration was first written against. They mean something completely
// different in a real chart of accounts, or nothing at all.
//
// WHY THIS FAILS CLOSED RATHER THAN KEEPING A DEFAULT
//
// A wrong account id is worse than a failed sync. A failed sync is visible and
// retryable; a payment posted to the wrong ledger account is a silent, plausible
// number in the wrong place, which someone has to unpick from a reconciled
// period later. QuickBooks account 35 might be a checking account, or it might
// be Owner's Equity — the id alone cannot tell us, and neither can this code.
//
// So an unconfigured account raises AccountingConfigError with the env var to
// set and how to find the value, instead of guessing. Same reasoning as the FX
// engine excluding a cost it cannot convert rather than summing it at face
// value: refuse to produce a confident wrong number.
//
// Nothing regresses by doing this — the integration has never been connected
// (no tokens, no sync rows ever recorded), so the hardcoded ids have never
// successfully posted anything to anyone's books.

import { AccountingConfigError } from './types'

/**
 * The account slots the sync needs. They differ by provider, so each provider
 * declares its own set and the lookup is typed against it —
 * requireAccountRef('quickbooks', 'revenue') is a compile error, because QB
 * invoice lines carry no account reference (QuickBooks applies the company's own
 * default income account).
 */
export type AccountSlot = 'bank' | 'expense' | 'revenue'

interface SlotSpec {
  env: string
  /** What this account is used for, in the operator's terms. */
  purpose: string
  /** How to find the right value in that provider's UI/API. */
  hint: string
}

const QUICKBOOKS_SLOTS = {
  bank: {
    env: 'QUICKBOOKS_BANK_ACCOUNT_ID',
    purpose: 'the bank account bill payments are paid FROM',
    hint:
      'In QuickBooks: Accounting → Chart of Accounts → the bank account → the Id in the URL. ' +
      'Or GET /api/accounting/accounts to list the connected chart of accounts.',
  },
  expense: {
    env: 'QUICKBOOKS_EXPENSE_ACCOUNT_ID',
    purpose: 'the expense account supplier bills are coded TO',
    hint:
      'In QuickBooks: Accounting → Chart of Accounts → the expense account → the Id in the URL. ' +
      'Or GET /api/accounting/accounts to list the connected chart of accounts.',
  },
} satisfies Partial<Record<AccountSlot, SlotSpec>>

const XERO_SLOTS = {
  bank: {
    env: 'XERO_BANK_ACCOUNT_CODE',
    purpose: 'the bank account payments are made FROM',
    hint:
      'In Xero: Accounting → Chart of Accounts → the bank account → its Code (e.g. 090). ' +
      'Or GET /api/accounting/accounts to list the connected chart of accounts.',
  },
  expense: {
    env: 'XERO_EXPENSE_ACCOUNT_CODE',
    purpose: 'the expense account supplier bills are coded TO',
    hint:
      'In Xero: Accounting → Chart of Accounts → the expense account → its Code. ' +
      'Or GET /api/accounting/accounts to list the connected chart of accounts.',
  },
  revenue: {
    env: 'XERO_REVENUE_ACCOUNT_CODE',
    purpose: 'the revenue account customer invoices are coded TO',
    hint:
      'In Xero: Accounting → Chart of Accounts → the sales/revenue account → its Code. ' +
      'Or GET /api/accounting/accounts to list the connected chart of accounts.',
  },
} satisfies Partial<Record<AccountSlot, SlotSpec>>

const SLOTS = {
  quickbooks: QUICKBOOKS_SLOTS,
  xero: XERO_SLOTS,
} as const

export type AccountingProviderName = keyof typeof SLOTS

/** The slots a given provider actually declares. */
type SlotOf<P extends AccountingProviderName> = keyof (typeof SLOTS)[P] & AccountSlot

/**
 * Resolve a configured account reference, or throw with something the operator
 * can act on.
 *
 * Throws AccountingConfigError (non-retryable): re-running the sync cannot fix a
 * missing env var, so this must not sit in a retry queue burning attempts.
 */
export function requireAccountRef<P extends AccountingProviderName>(
  provider: P,
  slot: SlotOf<P>
): string {
  const spec = (SLOTS[provider] as Record<AccountSlot, SlotSpec>)[slot]
  const value = process.env[spec.env]?.trim()

  if (!value) {
    throw new AccountingConfigError(
      `${provider} sync needs ${spec.env} — ${spec.purpose}. ` +
        `It is not set, and this refuses to guess: posting to the wrong ledger ` +
        `account is harder to undo than a failed sync. ${spec.hint}`
    )
  }

  return value
}

/**
 * Non-throwing variant for pre-flight checks (a settings page, a health probe):
 * report what is missing without attempting a sync.
 */
export function checkAccountConfig(provider: AccountingProviderName): {
  ok: boolean
  missing: Array<{ slot: AccountSlot; env: string; purpose: string; hint: string }>
} {
  const slots = SLOTS[provider] as Record<AccountSlot, SlotSpec>
  const missing = (Object.keys(slots) as AccountSlot[])
    .filter((slot) => !process.env[slots[slot].env]?.trim())
    .map((slot) => ({ slot, ...slots[slot] }))

  return { ok: missing.length === 0, missing }
}

/** Every account env var, for docs and health output. */
export function accountConfigKeys(): string[] {
  return Object.values(SLOTS).flatMap((slots) => Object.values(slots).map((s) => s.env))
}
