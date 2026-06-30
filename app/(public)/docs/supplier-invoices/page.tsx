import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function SupplierInvoicesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Supplier Invoices</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Supplier Invoices</h1>
      <p className="text-gray-600 mb-8">
        Supplier Invoices brings the bills your suppliers send you into the system and runs them through a three-way match: <strong>supplier invoice &rarr; expense &rarr; payment</strong>. That way you only ever pay what you actually owe, and discrepancies surface before money goes out the door.
      </p>

      {/* The list */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Invoice List</h2>
        <p className="text-gray-600 mb-3">
          The main table shows every supplier invoice with its internal reference, supplier, invoice number, date, amount, and two badges. Summary cards across the top count the <strong>Total</strong>, <strong>Unmatched</strong>, <strong>Awaiting Approval</strong>, and <strong>Paid</strong> invoices.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Status</strong> &mdash; Received, Matched, Approved, Paid, Disputed, or Cancelled</li>
          <li><strong>Match</strong> &mdash; Unmatched, Partial, Matched, or Discrepancy</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Search by supplier or invoice number, and filter by status or match status to focus the list.
        </p>
        <ScreenshotPlaceholder caption="Supplier Invoices list with status and match badges and the summary cards" />
      </section>

      {/* Creating with AI */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding an Invoice with AI</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>New Supplier Invoice</strong> to open the create form. Rather than typing everything in, you can:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Upload a PDF or photo</strong> of the supplier&apos;s invoice into the drop zone</li>
          <li>The AI <strong>reads the invoice</strong> and auto-fills the invoice number, supplier, dates, currency, tax, and line items</li>
          <li>A confidence badge appears &mdash; review and edit the extracted fields before saving</li>
        </ol>
        <p className="text-gray-600 mt-3">
          You can also fill the form manually: choose a supplier, set the dates and currency, and add line items. Selecting a <strong>service category</strong> on a line auto-fills its description and pulls a matching supplier rate when one exists.
        </p>
      </section>

      {/* Linking */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Linking to Trips &amp; Customer Invoices</h2>
        <p className="text-gray-600 mb-3">
          On the create form you can attach a supplier invoice to a <strong>Related Itinerary</strong> and a <strong>Customer Invoice</strong>. This ties supplier cost to the trip and the revenue it supports, which is what makes the three-way match meaningful.
        </p>
      </section>

      {/* Workflow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Matching, Approving &amp; Paying</h2>
        <p className="text-gray-600 mb-3">
          Open an invoice to move it through its lifecycle:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Match Expense</strong> &mdash; Link the invoice to one or more recorded expenses; the match status reflects whether amounts line up or show a discrepancy</li>
          <li><strong>Approve</strong> &mdash; Sign off a matched invoice for payment</li>
          <li><strong>Pay</strong> &mdash; Record settlement with the payment date, method, and reference</li>
          <li><strong>Dispute</strong> &mdash; Flag a problem invoice with a reason instead of approving it</li>
        </ol>
        <Tip>
          A <strong>Discrepancy</strong> match means the supplier&apos;s figure doesn&apos;t agree with your recorded expense. Resolve it before approving so you never overpay.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/accounts-payable" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Accounts Payable
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
