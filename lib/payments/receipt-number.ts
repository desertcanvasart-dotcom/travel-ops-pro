/**
 * A payment's receipt number — ONE rule for every place a receipt is made
 * (the invoice page, the receipts page, the receipt page, WhatsApp): its
 * own number from the company's receipt series (payments.receipt_number and
 * invoice_payments.receipt_number, migration 20261225); RCP- and the payment
 * id only for a payment that has none (a pending one, or a database before
 * the migration). The transaction reference is NOT the number: two payments
 * with the same bank reference had the same receipt number. It is printed on
 * its own line (ReceiptData.transactionRef).
 *
 * A module of its own so the WhatsApp route can use it without loading the
 * PDF library.
 */
export function receiptNumberFor(payment: { id: string; receipt_number?: string | null }): string {
  return payment.receipt_number || `RCP-${String(payment.id).slice(0, 8).toUpperCase()}`
}
