import {
  AccountingProvider,
  OAuthTokens,
  ContactPayload,
  InvoicePayload,
  BillPayload,
  PaymentPayload,
  ExternalRef,
  AccountingAuthError,
  AccountingSyncError,
} from './types'
import { resolveTaxTreatment, round2 } from './tax'
import { requireAccountRef } from './account-config'
import type { AccountSummary } from './types'

const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

function getQBApiBase(realmId: string): string {
  const env = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox'
  const host = env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
  return `${host}/v3/company/${realmId}`
}

export class QuickBooksProvider implements AccountingProvider {
  readonly providerName = 'quickbooks' as const
  private accessToken: string = ''
  private realmId: string = ''

  constructor(options?: { accessToken?: string; realmId?: string }) {
    if (options?.accessToken) this.accessToken = options.accessToken
    if (options?.realmId) this.realmId = options.realmId
  }

  setCredentials(accessToken: string, realmId: string) {
    this.accessToken = accessToken
    this.realmId = realmId
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.QUICKBOOKS_CLIENT_ID!,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI!,
      state,
    })
    return `${QB_AUTH_URL}?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string, extras?: Record<string, string>): Promise<OAuthTokens> {
    const response = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI!,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new AccountingAuthError(`QuickBooks token exchange failed: ${error}`)
    }

    const data = await response.json()
    const realmId = extras?.realmId || ''

    // Fetch company info
    let companyName = ''
    if (realmId) {
      try {
        const infoRes = await fetch(`${getQBApiBase(realmId)}/companyinfo/${realmId}`, {
          headers: {
            'Authorization': `Bearer ${data.access_token}`,
            'Accept': 'application/json',
          },
        })
        if (infoRes.ok) {
          const info = await infoRes.json()
          companyName = info.CompanyInfo?.CompanyName || ''
        }
      } catch {
        // Non-critical, continue without company name
      }
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + (data.expires_in * 1000),
      realm_id: realmId,
      company_name: companyName,
    }
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new AccountingAuthError('Failed to refresh QuickBooks token. Please reconnect.')
    }

    const data = await response.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + (data.expires_in * 1000),
      realm_id: this.realmId,
    }
  }

  private async apiRequest(method: string, endpoint: string, body?: unknown) {
    if (!this.accessToken || !this.realmId) {
      throw new AccountingAuthError('QuickBooks not authenticated. Call setCredentials() first.')
    }

    const url = `${getQBApiBase(this.realmId)}${endpoint}`
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401) {
      throw new AccountingAuthError('QuickBooks token expired or invalid')
    }

    if (response.status === 429) {
      throw new AccountingSyncError('QuickBooks rate limit. Retry later.', true)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new AccountingSyncError(`QuickBooks API error (${response.status}): ${errorText}`)
    }

    return response.json()
  }

  /**
   * The company's chart of accounts (M4 discovery).
   *
   * Configuring QUICKBOOKS_BANK_ACCOUNT_ID / QUICKBOOKS_EXPENSE_ACCOUNT_ID is
   * guesswork without seeing the real ids, so this exposes them. Read-only.
   */
  async listAccounts(): Promise<AccountSummary[]> {
    const query = encodeURIComponent(
      "select Id, Name, AccountType, AccountSubType, Active from Account maxresults 500"
    )
    const data = await this.apiRequest('GET', `/query?query=${query}`)
    const rows: Array<Record<string, unknown>> = data.QueryResponse?.Account || []

    return rows.map(a => ({
      id: String(a.Id ?? ''),
      // QuickBooks addresses accounts by Id, so that is what the env var wants.
      ref: String(a.Id ?? ''),
      name: String(a.Name ?? ''),
      type: String(a.AccountType ?? ''),
      subType: a.AccountSubType ? String(a.AccountSubType) : undefined,
      active: a.Active !== false,
    }))
  }

  async upsertContact(contact: ContactPayload): Promise<ExternalRef> {
    const endpoint = contact.type === 'customer' ? '/customer' : '/vendor'

    const qbContact: Record<string, unknown> = {
      DisplayName: contact.name,
    }

    if (contact.email) {
      qbContact.PrimaryEmailAddr = { Address: contact.email }
    }
    if (contact.phone) {
      qbContact.PrimaryPhone = { FreeFormNumber: contact.phone }
    }

    const data = await this.apiRequest('POST', endpoint, qbContact)

    const entity = contact.type === 'customer' ? data.Customer : data.Vendor
    return {
      id: entity?.Id || '',
      number: entity?.DisplayName,
    }
  }

  async createInvoice(invoice: InvoicePayload): Promise<ExternalRef> {
    const qbInvoice = this.mapToQBInvoice(invoice)
    const data = await this.apiRequest('POST', '/invoice', qbInvoice)

    return {
      id: data.Invoice?.Id || '',
      number: data.Invoice?.DocNumber,
    }
  }

  async updateInvoice(externalId: string, invoice: InvoicePayload): Promise<ExternalRef> {
    // QB requires SyncToken for updates - fetch current first
    const current = await this.apiRequest('GET', `/invoice/${externalId}`)
    const syncToken = current.Invoice?.SyncToken || '0'

    const qbInvoice = {
      ...this.mapToQBInvoice(invoice),
      Id: externalId,
      SyncToken: syncToken,
    }
    const data = await this.apiRequest('POST', '/invoice', qbInvoice)

    return {
      id: data.Invoice?.Id || externalId,
      number: data.Invoice?.DocNumber,
    }
  }

  async createBill(bill: BillPayload): Promise<ExternalRef> {
    const qbBill = this.mapToQBBill(bill)
    const data = await this.apiRequest('POST', '/bill', qbBill)

    return {
      id: data.Bill?.Id || '',
      number: data.Bill?.DocNumber,
    }
  }

  async updateBill(externalId: string, bill: BillPayload): Promise<ExternalRef> {
    const current = await this.apiRequest('GET', `/bill/${externalId}`)
    const syncToken = current.Bill?.SyncToken || '0'

    const qbBill = {
      ...this.mapToQBBill(bill),
      Id: externalId,
      SyncToken: syncToken,
    }
    const data = await this.apiRequest('POST', '/bill', qbBill)

    return {
      id: data.Bill?.Id || externalId,
      number: data.Bill?.DocNumber,
    }
  }

  async createPayment(payment: PaymentPayload): Promise<ExternalRef> {
    if (payment.invoice_external_id) {
      // AR payment
      const qbPayment = {
        TotalAmt: payment.amount,
        TxnDate: payment.date,
        Line: [{
          Amount: payment.amount,
          LinkedTxn: [{
            TxnId: payment.invoice_external_id,
            TxnType: 'Invoice',
          }],
        }],
      }
      const data = await this.apiRequest('POST', '/payment', qbPayment)
      return {
        id: data.Payment?.Id || '',
        number: data.Payment?.DocNumber,
      }
    } else if (payment.bill_external_id) {
      // AP payment (bill payment)
      //
      // M4: VendorRef used to be handed payment.bill_external_id — the Bill's
      // transaction id. QuickBooks requires a Vendor id here, so it either
      // rejects the BillPayment or attaches it to whichever vendor happens to
      // carry that id. Both are opaque numbers, so nothing downstream notices;
      // refuse rather than send a reference we know is the wrong kind.
      if (!payment.vendor_external_id) {
        throw new AccountingSyncError(
          'Cannot record a bill payment without the vendor’s QuickBooks id — ' +
            'VendorRef must name a Vendor, not the Bill. Sync the expense (which ' +
            'upserts the vendor) before its payment.',
          false
        )
      }
      const qbBillPayment = {
        TotalAmt: payment.amount,
        TxnDate: payment.date,
        VendorRef: { value: payment.vendor_external_id },
        PayType: 'Check',
        CheckPayment: {
          // M4: was hardcoded '35' — a sandbox id that means something else
          // entirely in a real chart of accounts. Throws if unconfigured rather
          // than paying from a guessed account.
          BankAccountRef: { value: requireAccountRef('quickbooks', 'bank') },
        },
        Line: [{
          Amount: payment.amount,
          LinkedTxn: [{
            TxnId: payment.bill_external_id,
            TxnType: 'Bill',
          }],
        }],
      }
      const data = await this.apiRequest('POST', '/billpayment', qbBillPayment)
      return {
        id: data.BillPayment?.Id || '',
        number: data.BillPayment?.DocNumber,
      }
    }

    throw new AccountingSyncError('Payment must reference an invoice or bill', false)
  }

  private mapToQBInvoice(invoice: InvoicePayload) {
    const taxMode = resolveTaxTreatment(invoice.subtotal, invoice.tax_amount, invoice.total_amount)
    return {
      DocNumber: invoice.invoice_number,
      CustomerRef: invoice.contactExternalId
        ? { value: invoice.contactExternalId }
        : { name: invoice.contact_name },
      TxnDate: invoice.issue_date,
      DueDate: invoice.due_date || undefined,
      CurrencyRef: { value: invoice.currency },
      // H9: carry the invoice tax so QB's total matches the Autoura total.
      // GlobalTaxCalculation tells QB whether the line amounts include the tax;
      // TxnTaxDetail.TotalTax supplies the amount (manual-tax companies). Note:
      // QB companies on Automated Sales Tax may recompute from per-line tax
      // codes — validate against the connected company before go-live.
      ...(taxMode !== 'none'
        ? {
            GlobalTaxCalculation: taxMode === 'inclusive' ? 'TaxInclusive' : 'TaxExcluded',
            TxnTaxDetail: { TotalTax: round2(invoice.tax_amount) },
          }
        : {}),
      Line: [
        ...invoice.line_items.map(li => ({
          DetailType: 'SalesItemLineDetail',
          Amount: li.amount,
          Description: li.description,
          SalesItemLineDetail: {
            Qty: li.quantity,
            UnitPrice: li.unit_price,
          },
        })),
      ],
      CustomerMemo: invoice.notes ? { value: invoice.notes } : undefined,
    }
  }

  private mapToQBBill(bill: BillPayload) {
    // Bill line amounts are net (gross − tax), so tax is charged on top.
    const hasTax = bill.tax_amount > 0
    // M4: resolved once per bill, before building any lines — every line codes
    // to the same expense account, and a missing config should raise up front.
    const expenseAccountRef = requireAccountRef('quickbooks', 'expense')
    return {
      DocNumber: bill.bill_number,
      VendorRef: bill.vendorExternalId
        ? { value: bill.vendorExternalId }
        : { name: bill.vendor_name },
      TxnDate: bill.date,
      DueDate: bill.due_date || undefined,
      CurrencyRef: { value: bill.currency },
      // H9: carry the bill tax so QB's total matches the Autoura total.
      ...(hasTax
        ? {
            GlobalTaxCalculation: 'TaxExcluded',
            TxnTaxDetail: { TotalTax: round2(bill.tax_amount) },
          }
        : {}),
      Line: bill.line_items.map(li => ({
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: li.amount,
        Description: li.description,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: expenseAccountRef },
        },
      })),
    }
  }
}
