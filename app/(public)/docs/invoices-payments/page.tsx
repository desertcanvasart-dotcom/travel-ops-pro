import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function InvoicesPaymentsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Invoices &amp; Payments</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Invoices &amp; Payments</h1>

      {/* Viewing Invoices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Invoices</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Invoices</strong> in the sidebar. Filter by status: Draft, Sent, Viewed, Partial, Paid, Overdue, or Cancelled.
        </p>
        <p className="text-gray-600">
          Each invoice shows: invoice number, client name, type, issue date, due date, amount, amount paid, balance due, and status.
        </p>
        <DocScreenshot src="/docs/invoices-payments/invoices-list.jpg" alt="Invoices list page with status filters and invoice table" />
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating an Invoice</h2>
        <p className="text-gray-600 mb-3">The easiest way to create an invoice is from an itinerary:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the itinerary</li>
          <li>Click <strong>Generate Invoice</strong></li>
          <li>The invoice is created with all line items from the itinerary</li>
        </ol>
        <Tip>
          You can also create invoices manually from the Invoices page by clicking <strong>New Invoice</strong>.
        </Tip>
      </section>

      {/* Invoice Types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Types</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Standard</strong> &mdash; Full amount invoice</li>
          <li><strong>Deposit</strong> &mdash; Partial payment (typically 30%)</li>
          <li><strong>Final</strong> &mdash; Remaining balance after deposit</li>
        </ul>
      </section>

      {/* VAT */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">VAT</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>New Invoice has an <strong>Apply VAT (14%)</strong> box instead of a tax-rate field. It is off unless you tick it, or unless the trip you pick carries VAT from its quote.</li>
          <li>VAT is added on top of the invoice&apos;s net (subtotal minus discount), but not on extras or insurance: VAT = (net &minus; extras &minus; insurance) &times; your company&apos;s rate (Settings &rsaquo; Company Profile), rounded to the currency (whole yen for JPY). Total = net + VAT, so the premiums and extras are still billed, just not taxed.</li>
          <li>What is left out: the travellers&apos; confirmed insurance premiums and the confirmed extras and upgrades the app adds to a standard or final invoice for a trip, and, when the trip&apos;s own lines include Extra lines, that share of the rest of the invoice (an extra worth 10% of the trip leaves 10% of the trip amount out).</li>
          <li>When something was left out, the VAT line reads <strong>VAT 14% included: &lt;amount&gt; (extras and insurance not taxed)</strong>, and the invoice records the amount the VAT was charged on.</li>
          <li>The server works the VAT out. The figure in the New Invoice form is a preview on the whole amount you enter; it does not know the premiums and extras the server adds, so the saved invoice can show less VAT.</li>
          <li>A deposit invoice and its final invoice each carry VAT on their own part, so together they carry the VAT on the whole trip less its extras and insurance. A final invoice follows its deposit&apos;s VAT choice.</li>
          <li>An invoice raised from a trip that carries VAT starts with VAT on.</li>
          <li>On the invoice page you can switch VAT on or off until a payment has been recorded against it. After that the invoice keeps its VAT; issue a new invoice to change it.</li>
          <li>The rate and amount are recorded on the invoice when it is issued. Invoices made before VAT existed that already carried a tax amount count as VAT applied, at the rate and amount they recorded.</li>
          <li>Invoices issued before extras and insurance were left out (13 October 2026) keep the VAT they recorded, on their whole net. Switching VAT off and on again on an unpaid one works it out under the current rule; the premium and extras lines of such an older invoice are not marked, so only the trip&apos;s Extra-lines share is left out then.</li>
          <li>The invoice page, the PDF, the WhatsApp message and payment reminder emails all state the VAT line.</li>
        </ul>
      </section>

      {/* Invoice Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Detail Page</h2>
        <p className="text-gray-600 mb-3">The detail page shows:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Invoice number and status</li>
          <li>Client information</li>
          <li>Line items with quantities, prices, and totals</li>
          <li>VAT: <strong>VAT 14% included: &lt;amount&gt;</strong> (with &ldquo;extras and insurance not taxed&rdquo; when they were left out) or <strong>VAT not applied</strong>, always shown</li>
          <li>Discount (if applicable)</li>
          <li><strong>Payment Progress Bar</strong> showing how much has been paid</li>
          <li>Payment history with dates, amounts, and methods</li>
        </ul>
        <ScreenshotPlaceholder caption="Invoice detail page with line items, totals, and payment progress bar" />
      </section>

      {/* Invoice Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Actions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What It Does</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Download PDF</td><td className="px-4 py-2.5">Creates a professional invoice PDF</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Send via WhatsApp</td><td className="px-4 py-2.5">Sends the invoice on WhatsApp</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Send Email</td><td className="px-4 py-2.5">Emails the invoice</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Add Payment</td><td className="px-4 py-2.5">Record a payment received</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Send Reminder</td><td className="px-4 py-2.5">Sends a payment reminder to the client</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Create Final Invoice</td><td className="px-4 py-2.5">Creates the final balance invoice from a deposit</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Recording Payment */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording a Payment</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the invoice</li>
          <li>Click <strong>Add Payment</strong></li>
          <li>Enter:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li>Amount</li>
              <li>Payment date</li>
              <li>Payment method (Bank Transfer, Credit Card, Cash, PayPal, Wise, Airwallex, Stripe)</li>
              <li>Transaction reference (optional)</li>
              <li>Notes (optional)</li>
            </ul>
          </li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <Tip>
          The invoice status updates automatically based on payments received. Partial payments change the status to &ldquo;Partial&rdquo;, full payment changes it to &ldquo;Paid&rdquo;.
        </Tip>
        <ScreenshotPlaceholder caption="Add payment dialog with amount, date, method, and reference fields" />
      </section>

      {/* Payments Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payments Overview</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Payments</strong> in the sidebar to see all payments across all invoices in one place. You can:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Search by client name or invoice number</li>
          <li>Filter by payment method or date range</li>
          <li>Create a new standalone payment</li>
          <li>View payment details</li>
        </ul>
      </section>
    </div>
  )
}
