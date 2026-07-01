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
import { resolveTaxTreatment, allocateLineTax } from './tax'

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_API_URL = 'https://api.xero.com/api.xro/2.0'
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'

export class XeroProvider implements AccountingProvider {
  readonly providerName = 'xero' as const
  private accessToken: string = ''
  private tenantId: string = ''

  constructor(options?: { accessToken?: string; tenantId?: string }) {
    if (options?.accessToken) this.accessToken = options.accessToken
    if (options?.tenantId) this.tenantId = options.tenantId
  }

  setCredentials(accessToken: string, tenantId: string) {
    this.accessToken = accessToken
    this.tenantId = tenantId
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.XERO_CLIENT_ID!,
      redirect_uri: process.env.XERO_REDIRECT_URI!,
      scope: 'openid profile email accounting.transactions accounting.contacts offline_access',
      state,
    })
    return `${XERO_AUTH_URL}?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const response = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.XERO_REDIRECT_URI!,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new AccountingAuthError(`Xero token exchange failed: ${error}`)
    }

    const data = await response.json()

    // Fetch tenant/org info
    const connectionsRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { 'Authorization': `Bearer ${data.access_token}` },
    })

    let tenantId = ''
    let companyName = ''
    if (connectionsRes.ok) {
      const connections = await connectionsRes.json()
      if (connections.length > 0) {
        tenantId = connections[0].tenantId
        companyName = connections[0].tenantName || ''
      }
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + (data.expires_in * 1000),
      tenant_id: tenantId,
      company_name: companyName,
    }
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new AccountingAuthError('Failed to refresh Xero token. Please reconnect.')
    }

    const data = await response.json()
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + (data.expires_in * 1000),
      tenant_id: this.tenantId,
    }
  }

  private async apiRequest(method: string, endpoint: string, body?: unknown) {
    if (!this.accessToken || !this.tenantId) {
      throw new AccountingAuthError('Xero not authenticated. Call setCredentials() first.')
    }

    const response = await fetch(`${XERO_API_URL}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'xero-tenant-id': this.tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401) {
      throw new AccountingAuthError('Xero token expired or invalid')
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      throw new AccountingSyncError(
        `Xero rate limit. Retry after ${retryAfter || '60'}s`,
        true
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new AccountingSyncError(`Xero API error (${response.status}): ${errorText}`)
    }

    return response.json()
  }

  async upsertContact(contact: ContactPayload): Promise<ExternalRef> {
    const xeroContact = {
      Name: contact.name,
      EmailAddress: contact.email || undefined,
      Phones: contact.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: contact.phone }] : undefined,
      IsCustomer: contact.type === 'customer',
      IsSupplier: contact.type === 'vendor',
    }

    const data = await this.apiRequest('POST', '/Contacts', {
      Contacts: [xeroContact],
    })

    const created = data.Contacts?.[0]
    return {
      id: created?.ContactID || '',
      number: created?.ContactNumber,
    }
  }

  async createInvoice(invoice: InvoicePayload): Promise<ExternalRef> {
    const xeroInvoice = this.mapToXeroInvoice(invoice, 'ACCREC')
    const data = await this.apiRequest('POST', '/Invoices', {
      Invoices: [xeroInvoice],
    })

    const created = data.Invoices?.[0]
    return {
      id: created?.InvoiceID || '',
      number: created?.InvoiceNumber,
    }
  }

  async updateInvoice(externalId: string, invoice: InvoicePayload): Promise<ExternalRef> {
    const xeroInvoice = {
      ...this.mapToXeroInvoice(invoice, 'ACCREC'),
      InvoiceID: externalId,
    }
    const data = await this.apiRequest('POST', '/Invoices', {
      Invoices: [xeroInvoice],
    })

    const updated = data.Invoices?.[0]
    return {
      id: updated?.InvoiceID || externalId,
      number: updated?.InvoiceNumber,
    }
  }

  async createBill(bill: BillPayload): Promise<ExternalRef> {
    const xeroBill = this.mapToXeroBill(bill)
    const data = await this.apiRequest('POST', '/Invoices', {
      Invoices: [xeroBill],
    })

    const created = data.Invoices?.[0]
    return {
      id: created?.InvoiceID || '',
      number: created?.InvoiceNumber,
    }
  }

  async updateBill(externalId: string, bill: BillPayload): Promise<ExternalRef> {
    const xeroBill = {
      ...this.mapToXeroBill(bill),
      InvoiceID: externalId,
    }
    const data = await this.apiRequest('POST', '/Invoices', {
      Invoices: [xeroBill],
    })

    const updated = data.Invoices?.[0]
    return {
      id: updated?.InvoiceID || externalId,
      number: updated?.InvoiceNumber,
    }
  }

  async createPayment(payment: PaymentPayload): Promise<ExternalRef> {
    const xeroPayment: Record<string, unknown> = {
      Amount: payment.amount,
      Date: payment.date,
      Reference: payment.reference || '',
      Account: { Code: '090' }, // Default bank account — configurable later
    }

    if (payment.invoice_external_id) {
      xeroPayment.Invoice = { InvoiceID: payment.invoice_external_id }
    } else if (payment.bill_external_id) {
      xeroPayment.Invoice = { InvoiceID: payment.bill_external_id }
    }

    const data = await this.apiRequest('POST', '/Payments', {
      Payments: [xeroPayment],
    })

    const created = data.Payments?.[0]
    return {
      id: created?.PaymentID || '',
      number: created?.Reference,
    }
  }

  private mapToXeroInvoice(invoice: InvoicePayload, type: 'ACCREC' | 'ACCPAY') {
    // H9: carry the invoice tax so Xero's total matches the Autoura total.
    // Without an explicit per-line TaxAmount, Xero adds 0 tax (LineAmountTypes
    // 'Exclusive' with no tax rate) and its total falls short by tax_amount.
    // We detect whether tax is on-top (Exclusive) or already inside the line
    // amounts (Inclusive) and distribute the tax across the lines. Note: Xero
    // honours an explicit line TaxAmount, but the org's TaxType/tax rate config
    // can still override it — validate against the connected org before go-live.
    const taxMode = resolveTaxTreatment(invoice.subtotal, invoice.tax_amount, invoice.total_amount)
    const lineTax = taxMode !== 'none'
      ? allocateLineTax(invoice.line_items.map(li => li.amount), invoice.tax_amount)
      : null
    return {
      Type: type,
      InvoiceNumber: invoice.invoice_number,
      Contact: invoice.contactExternalId
        ? { ContactID: invoice.contactExternalId }
        : { Name: invoice.contact_name, EmailAddress: invoice.contact_email },
      DateString: invoice.issue_date,
      DueDateString: invoice.due_date || undefined,
      Status: this.mapInvoiceStatus(invoice.status),
      CurrencyCode: invoice.currency,
      LineAmountTypes: taxMode === 'inclusive' ? 'Inclusive' : 'Exclusive',
      LineItems: invoice.line_items.map((li, i) => ({
        Description: li.description,
        Quantity: li.quantity,
        UnitAmount: li.unit_price,
        AccountCode: li.account_code || '200', // Default revenue account
        ...(lineTax ? { TaxAmount: lineTax[i] } : {}),
      })),
      Reference: invoice.notes || undefined,
    }
  }

  private mapToXeroBill(bill: BillPayload) {
    // H9: bill line amounts are net (gross − tax), so tax is charged on top.
    const lineTax = bill.tax_amount > 0
      ? allocateLineTax(bill.line_items.map(li => li.amount), bill.tax_amount)
      : null
    return {
      Type: 'ACCPAY' as const,
      InvoiceNumber: bill.bill_number,
      Contact: bill.vendorExternalId
        ? { ContactID: bill.vendorExternalId }
        : { Name: bill.vendor_name },
      DateString: bill.date,
      DueDateString: bill.due_date || undefined,
      Status: 'AUTHORISED',
      CurrencyCode: bill.currency,
      LineAmountTypes: 'Exclusive',
      LineItems: bill.line_items.map((li, i) => ({
        Description: li.description,
        Quantity: li.quantity,
        UnitAmount: li.unit_price,
        AccountCode: li.account_code || '400', // Default expense account
        ...(lineTax ? { TaxAmount: lineTax[i] } : {}),
      })),
      Reference: bill.description || undefined,
    }
  }

  private mapInvoiceStatus(status: string): string {
    switch (status) {
      case 'draft': return 'DRAFT'
      case 'sent':
      case 'viewed':
      case 'partial': return 'AUTHORISED'
      case 'paid': return 'PAID'
      case 'cancelled': return 'VOIDED'
      default: return 'DRAFT'
    }
  }
}
