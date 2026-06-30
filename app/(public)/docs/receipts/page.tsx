import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function ReceiptsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Receipts</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Receipts</h1>
      <p className="text-gray-600 mb-8">
        The Receipts page is a single place to find, download, and send a receipt for every payment you have received &mdash; whether the payment was recorded against a client invoice or directly against an itinerary.
      </p>

      {/* Where receipts come from */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where Receipts Come From</h2>
        <p className="text-gray-600 mb-3">
          Receipts are generated automatically from payments &mdash; you don&apos;t create them by hand. The page pulls together two sources into one unified list:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Invoice payments</strong> &mdash; Payments logged against a client invoice (shown with a blue badge)</li>
          <li><strong>Itinerary payments</strong> &mdash; Payments recorded directly on an itinerary (shown with a purple badge)</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Each row carries a <strong>Receipt #</strong> &mdash; the payment&apos;s transaction reference, or an auto-generated <strong>RCP-</strong> code when none exists. Stat cards at the top show total receipts, total received, and completed payments.
        </p>
        <ScreenshotPlaceholder caption="Receipts list with source badges, payment method, and action buttons" />
      </section>

      {/* Finding receipts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Finding a Receipt</h2>
        <p className="text-gray-600 mb-3">
          Use the search box to filter by client name, source reference (invoice or itinerary code), or transaction reference. The table lists the receipt number, source, client, date, payment method, and amount, sorted newest first.
        </p>
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing, Downloading &amp; Sending</h2>
        <p className="text-gray-600 mb-3">
          Each receipt has three actions:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>View</strong> &mdash; Opens the receipt page (for itinerary payments) or the related invoice (for invoice payments)</li>
          <li><strong>Preview PDF</strong> &mdash; Generates a branded receipt PDF on the spot and opens it in a preview modal you can download</li>
          <li><strong>Send via WhatsApp</strong> &mdash; Sends the receipt to the client&apos;s phone number; the button is disabled when no phone number is on file</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The whole list can also be exported with the header <strong>CSV</strong> and <strong>PDF</strong> buttons.
        </p>
      </section>

      {/* PDF detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Receipt PDF</h2>
        <p className="text-gray-600 mb-3">
          The generated receipt PDF includes the receipt number, the source invoice or itinerary reference, client details, payment date, payment method, amount, transaction reference, and any notes.
        </p>
        <Tip>
          If a payment has no phone number on file, the WhatsApp button stays disabled &mdash; add the client&apos;s phone to their record to enable instant receipt delivery.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/financial-reports" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Financial Reports
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
