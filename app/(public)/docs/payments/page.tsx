import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function PaymentsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Payments</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Payments</h1>
      <p className="text-gray-600 mb-8">
        Open it from <strong>Home &rsaquo; Finance &rsaquo; Payments</strong> (page title <strong>Payment Tracking</strong>). The Finance section of the menu is shown to the owner, admins and managers; agents and viewers do not have it. It lists every payment recorded against an <strong>invoice</strong> or directly against an <strong>itinerary</strong> (a deposit taken before invoicing), and totals them.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Four Tiles</h2>
        <p className="text-gray-600 mb-3">
          Every tile is added up per currency. If you take yen and euro, a tile shows both, for example <strong>¥450,000 + €500</strong>; amounts in different currencies are never added together.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Received</strong> &mdash; every payment recorded against an invoice, plus every trip payment whose status is <strong>Completed</strong>. A trip payment that is Pending, Deposit received, Partially paid, Failed, Refunded or Partially refunded is not counted, and neither is a trip payment of the type refund: a refund is money handed back, not money received, and it is not subtracted either. The Receipts page counts the same way.</li>
          <li><strong>Pending Payments</strong> &mdash; the balance still owed on invoices that are Sent, Partial or Viewed. Drafts are not counted: they were never sent. An invoice that is overdue is counted here too.</li>
          <li><strong>Overdue</strong> &mdash; the balance of those invoices whose due date is before today. The Invoices page uses the same rule, and a draft is never overdue.</li>
          <li><strong>This Month</strong> &mdash; payments counted in Total Received whose payment date is on or after the 1st of the current month.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The List</h2>
        <p className="text-gray-600 mb-3">
          Search by client, reference (invoice number or trip code) or transaction reference. Two filters: <strong>Source</strong> (All Sources, Invoice Payments, Itinerary Payments) and <strong>Method</strong>. There is no date filter. The columns are Date, Source (an Invoice or Itinerary badge), Reference (a link to the invoice or trip), Client, Amount, Method and Txn Ref. Amounts are in each row&apos;s own currency.
        </p>
        <p className="text-gray-600">
          The list shows every payment row, including trip payments that are pending, failed or refunds. Those are marked under the amount (<strong>Not completed</strong> or <strong>Refund</strong>) and are not in the tiles. The <strong>CSV</strong> and <strong>PDF</strong> buttons export the rows listed. <strong>View Invoices</strong> opens the invoices list.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording a Payment</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Payment</strong></li>
          <li>Choose <strong>Invoice</strong> or <strong>Itinerary</strong>, then pick the record. Only invoices that can take a payment are offered: a balance is owed and the invoice has been sent (not a draft, not cancelled).</li>
          <li>For an invoice: the amount starts at the balance due, the currency is the invoice&apos;s, and an amount above the balance is refused (<strong>Payment amount exceeds balance due</strong>).</li>
          <li>For an itinerary, set the payment type:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Deposit</strong> (10%, 15%, 20%, 25%, 30% or 50% of the trip price)</li>
              <li><strong>Installment</strong> and <strong>Final payment</strong> &mdash; the amount starts at the trip price minus what the trip has already been paid (its Completed payments, less completed refunds)</li>
              <li><strong>Full payment</strong> &mdash; the whole trip price</li>
            </ul>
          </li>
          <li>For an itinerary also set the status (Completed, Pending, Deposit Received, Partially Paid, Partially Refunded, Failed, Fully Refunded), the amount, the currency (it must be the trip&apos;s, otherwise the payment is refused), the method (Bank Transfer, Airwallex, Tab, Credit Card, Cash, PayPal, Stripe, Wise), the transaction reference, the payment date, an optional due date and notes.</li>
          <li>Save</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The amount must be a number above zero, on a new payment and when you edit one. Mark a trip payment <strong>Completed</strong> once the money has arrived: that is when it counts as received and gets a receipt number.
        </p>
        <Tip>The transaction reference is what reconciles the payment against your bank statement later &mdash; paste the bank&apos;s own reference, not a description. It is not the receipt number.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a Payment Changes</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>A payment on an <strong>invoice</strong> updates the invoice&apos;s amount paid, balance and status (Partial, then Paid), and so the receivables aging.</li>
          <li>A payment on an <strong>itinerary</strong> does not change any balance by itself. Nothing keeps a running &ldquo;paid&rdquo; figure on the trip; the New Payment screen works out what a trip has been paid from its Completed payments.</li>
          <li>A trip payment records the VAT inside its amount when it is saved, at the rate of the trip at that moment. Its receipt keeps that VAT even if the trip&apos;s VAT is switched later. Editing the amount works the VAT out again for the new amount.</li>
          <li><Link href="/docs/receipts" className="text-primary-600 hover:underline">Receipts</Link> are made for Completed trip payments and for every invoice payment, and can be sent by WhatsApp. There is no email option.</li>
          <li>The dashboard&apos;s money row and <Link href="/docs/financial-reports" className="text-primary-600 hover:underline">Financial Reports</Link> count the payment on its payment date.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not link a trip payment to the trip&apos;s invoice. If a client&apos;s deposit is recorded on the trip and later the same money on the invoice, it is counted twice in Total Received. Record each payment once, in one place.</li>
          <li>It does not convert currencies. A payment is in its invoice&apos;s or trip&apos;s currency.</li>
          <li>It does not subtract refunds from the tiles; a refund is listed and marked but not counted.</li>
        </ul>
      </section>
    </div>
  )
}
