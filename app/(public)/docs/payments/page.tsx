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
        <strong>Finance &rarr; Payments</strong> is where money received is recorded. A payment can be booked against an <strong>invoice</strong> (updating its balance) or directly against an <strong>itinerary</strong> (a deposit taken before invoicing). Recorded payments feed the Payments list, receipts, receivables aging and the dashboard&apos;s Received figures.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording a Payment</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Payment</strong></li>
          <li>Choose <strong>Invoice</strong> or <strong>Itinerary</strong>, then pick the record</li>
          <li>Set the payment type:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Deposit %</strong> &mdash; a percentage of the total, typically to confirm</li>
              <li><strong>Installment</strong> &mdash; one of an agreed series</li>
              <li><strong>Final payment</strong> &mdash; settles the remaining balance</li>
              <li><strong>Full payment</strong> &mdash; the whole amount at once</li>
            </ul>
          </li>
          <li>Enter the amount and currency, the method (Bank Transfer, Airwallex, Tab, Credit Card, Cash, PayPal, Stripe, Wise), the transaction reference, and the date</li>
          <li>Save &mdash; the payment appears in the list and the linked record&apos;s balance updates</li>
        </ol>
        <Tip>The transaction reference is what reconciles the payment against your bank statement later &mdash; paste the bank&apos;s own reference, not a description.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">After Recording</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><Link href="/docs/receipts" className="text-primary-600 hover:underline">Receipts</Link> can be generated for any payment and sent by WhatsApp or email</li>
          <li>Invoice balances and <Link href="/docs/accounts-receivable" className="text-primary-600 hover:underline">Receivables</Link> aging update immediately</li>
          <li>The dashboard&apos;s money row and <Link href="/docs/financial-reports" className="text-primary-600 hover:underline">Financial Reports</Link> count the payment on its payment date</li>
        </ul>
      </section>
    </div>
  )
}
