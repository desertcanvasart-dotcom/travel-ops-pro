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
  // Internal reference
  internalId: string
}

export interface ExternalRef {
  id: string
  number?: string
}

export interface AccountingProvider {
  readonly providerName: AccountingProviderType

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
