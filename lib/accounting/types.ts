// Accounting Provider Abstraction Layer
// Supports Xero and QuickBooks via a common interface

export type AccountingProviderType = 'xero' | 'quickbooks'

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expiry_date: number // Unix timestamp in ms
  tenant_id?: string  // Xero
  realm_id?: string   // QuickBooks
  company_name?: string
}

export interface ContactPayload {
  name: string
  email?: string
  phone?: string
  type: 'customer' | 'vendor'
  // Internal reference for sync log
  internalId: string
}

export interface LineItemPayload {
  description: string
  quantity: number
  unit_price: number
  amount: number
  account_code?: string
}

export interface InvoicePayload {
  invoice_number: string
  contact_name: string
  contact_email?: string
  line_items: LineItemPayload[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  currency: string
  issue_date: string    // ISO date string
  due_date?: string
  status: string
  notes?: string
  // Internal reference
  internalId: string
  contactExternalId?: string
}

export interface BillPayload {
  bill_number: string
  vendor_name: string
  vendor_email?: string
  line_items: LineItemPayload[]
  total_amount: number
  tax_amount: number
  currency: string
  date: string           // ISO date string
  due_date?: string
  description?: string
  // Internal reference
  internalId: string
  vendorExternalId?: string
}

export interface PaymentPayload {
  amount: number
  currency: string
  date: string           // ISO date string
  reference?: string
  invoice_external_id?: string  // For AR payments
  bill_external_id?: string     // For AP payments
  /**
   * The VENDOR's id in the accounting system, for AP payments (audit M4).
   * QuickBooks' BillPayment.VendorRef must name a Vendor — the code used to send
   * the Bill's transaction id, which QuickBooks either rejects or mis-associates.
   * A Bill id and a Vendor id are both opaque numbers, so nothing catches the
   * swap downstream; it has to be carried explicitly.
   */
  vendor_external_id?: string
  // Internal reference
  internalId: string
}

export interface ExternalRef {
  id: string
  number?: string
}

/**
 * One entry in a connected company's chart of accounts (M4 discovery).
 *
 * `ref` is the value the sync must send and the env var must hold, and the two
 * providers disagree on what that is: QuickBooks addresses accounts by numeric
 * Id, Xero by Code (e.g. "090"). Keeping `ref` separate from `id` means callers
 * never have to know which.
 */
export interface AccountSummary {
  id: string
  /** The value to put in the env var — QB Id, Xero Code. */
  ref: string
  name: string
  type: string
  subType?: string
  active: boolean
}

export interface AccountingProvider {
  readonly providerName: AccountingProviderType

  /** Chart of accounts, for configuring the M4 account references. */
  listAccounts(): Promise<AccountSummary[]>

  // OAuth
  getAuthUrl(state: string): string
  exchangeCodeForTokens(code: string, extras?: Record<string, string>): Promise<OAuthTokens>
  refreshTokens(refreshToken: string): Promise<OAuthTokens>

  // Contacts
  upsertContact(contact: ContactPayload): Promise<ExternalRef>

  // AR: Invoices
  createInvoice(invoice: InvoicePayload): Promise<ExternalRef>
  updateInvoice(externalId: string, invoice: InvoicePayload): Promise<ExternalRef>

  // AP: Bills (expenses)
  createBill(bill: BillPayload): Promise<ExternalRef>
  updateBill(externalId: string, bill: BillPayload): Promise<ExternalRef>

  // Payments
  createPayment(payment: PaymentPayload): Promise<ExternalRef>
}

// Sync log types
export type SyncEntityType = 'invoice' | 'expense' | 'invoice_payment' | 'expense_payment' | 'contact'
export type SyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'

export interface SyncLogEntry {
  id: string
  provider: AccountingProviderType
  entity_type: SyncEntityType
  entity_id: string
  external_id: string | null
  external_number: string | null
  sync_status: SyncStatus
  last_synced_at: string | null
  last_error: string | null
  retry_count: number
  next_retry_at: string | null
  created_at: string
  updated_at: string
}

export class AccountingAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountingAuthError'
  }
}

export class AccountingSyncError extends Error {
  constructor(message: string, public readonly retryable: boolean = true) {
    super(message)
    this.name = 'AccountingSyncError'
  }
}

/**
 * The integration is misconfigured — a required ledger account reference is
 * missing (audit M4). Deliberately NOT retryable: no number of retries sets an
 * environment variable, so this must fail loudly for an operator instead of
 * sitting in the retry queue burning attempts. `retryable` mirrors
 * AccountingSyncError's shape so sync-service's `isRetryable` treats both the
 * same way.
 */
export class AccountingConfigError extends Error {
  readonly retryable = false
  constructor(message: string) {
    super(message)
    this.name = 'AccountingConfigError'
  }
}
