import { InvoicePayload, BillPayload, PaymentPayload, ContactPayload, LineItemPayload } from './types'

// Map Autoura invoice DB record to provider-agnostic InvoicePayload
export function mapInvoiceToPayload(invoice: Record<string, unknown>): InvoicePayload {
  const lineItems = (invoice.line_items as Array<Record<string, unknown>> || []).map(li => ({
    description: String(li.description || ''),
    quantity: Number(li.quantity || 1),
    unit_price: Number(li.unit_price || 0),
    amount: Number(li.amount || 0),
  }))

  // If no line items, create a single line from total
  const finalLineItems: LineItemPayload[] = lineItems.length > 0
    ? lineItems
    : [{
        description: `Invoice ${invoice.invoice_number}`,
        quantity: 1,
        unit_price: Number(invoice.total_amount || 0),
        amount: Number(invoice.total_amount || 0),
      }]

  return {
    invoice_number: String(invoice.invoice_number || ''),
    contact_name: String(invoice.client_name || ''),
    contact_email: invoice.client_email as string | undefined,
    line_items: finalLineItems,
    subtotal: Number(invoice.subtotal || invoice.total_amount || 0),
    tax_rate: Number(invoice.tax_rate || 0),
    tax_amount: Number(invoice.tax_amount || 0),
    total_amount: Number(invoice.total_amount || 0),
    currency: String(invoice.currency || 'EUR'),
    issue_date: String(invoice.issue_date || new Date().toISOString().split('T')[0]),
    due_date: invoice.due_date as string | undefined,
    status: String(invoice.status || 'draft'),
    notes: invoice.notes as string | undefined,
    internalId: String(invoice.id || ''),
  }
}

// Map Autoura expense DB record to provider-agnostic BillPayload
export function mapExpenseToBillPayload(expense: Record<string, unknown>): BillPayload {
  // `expense.amount` is the gross total. Carry any recorded tax (H9) instead of
  // hardcoding 0; the line amount is the net (gross − tax) so line + tax = total.
  //
  // expenses.tax_amount EXISTS but nothing in the app writes it — there is no UI
  // field and no API path that sets it, so every row is 0 and this arithmetic is
  // a no-op today (net === total). It becomes live the moment expense tax is
  // captured, and the assumption it encodes is that `amount` is GROSS (tax
  // included). Whoever wires up expense tax must either honour that or change
  // this line — if `amount` is ever stored NET, this would subtract the tax
  // twice and under-report the bill.
  const total = Number(expense.amount || 0)
  const taxAmount = Number(expense.tax_amount || 0)
  const net = Math.round((total - taxAmount) * 100) / 100

  return {
    bill_number: String(expense.expense_number || ''),
    vendor_name: String(expense.supplier_name || 'Unknown Supplier'),
    vendor_email: undefined,
    line_items: [{
      description: String(expense.description || expense.category || 'Expense'),
      quantity: 1,
      unit_price: net,
      amount: net,
    }],
    total_amount: total,
    tax_amount: taxAmount,
    currency: String(expense.currency || 'EUR'),
    date: String(expense.expense_date || new Date().toISOString().split('T')[0]),
    due_date: undefined,
    description: String(expense.description || expense.category || ''),
    internalId: String(expense.id || ''),
  }
}

// Map Autoura invoice payment to provider-agnostic PaymentPayload
export function mapInvoicePaymentToPayload(
  payment: Record<string, unknown>,
  invoiceExternalId?: string
): PaymentPayload {
  return {
    amount: Number(payment.amount || 0),
    currency: String(payment.currency || 'EUR'),
    date: String(payment.payment_date || new Date().toISOString().split('T')[0]),
    reference: payment.transaction_reference as string | undefined,
    invoice_external_id: invoiceExternalId,
    internalId: String(payment.id || ''),
  }
}

// Map Autoura expense payment (status=paid) to provider-agnostic PaymentPayload
export function mapExpensePaymentToPayload(
  expense: Record<string, unknown>,
  billExternalId?: string
): PaymentPayload {
  return {
    amount: Number(expense.amount || 0),
    currency: String(expense.currency || 'EUR'),
    date: String(expense.payment_date || new Date().toISOString().split('T')[0]),
    reference: expense.payment_reference as string | undefined,
    bill_external_id: billExternalId,
    internalId: String(expense.id || ''),
  }
}

// Map client info to ContactPayload
export function mapClientToContact(invoice: Record<string, unknown>): ContactPayload {
  return {
    name: String(invoice.client_name || ''),
    email: invoice.client_email as string | undefined,
    phone: invoice.client_phone as string | undefined,
    type: 'customer',
    internalId: String(invoice.client_id || invoice.client_name || ''),
  }
}

// Map supplier info to ContactPayload
export function mapSupplierToContact(expense: Record<string, unknown>): ContactPayload {
  return {
    name: String(expense.supplier_name || ''),
    type: 'vendor',
    internalId: String(expense.supplier_id || expense.supplier_name || ''),
  }
}
