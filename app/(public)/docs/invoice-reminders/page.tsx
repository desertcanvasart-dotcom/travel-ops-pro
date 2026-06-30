import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function InvoiceRemindersPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Invoice Reminders</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Invoice Reminders</h1>
      <p className="text-gray-600 mb-8">
        Payment Reminders chases unpaid invoices for you. The system works out which reminder each open invoice is due for based on its due date, queues them up, and can send them automatically every morning &mdash; or you can send them on demand.
      </p>

      {/* Automatic schedule */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Automatic Schedule</h2>
        <p className="text-gray-600 mb-3">
          Reminders run automatically every day at <strong>9:00 AM</strong>, choosing the right stage for each invoice relative to its due date:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>7 days before</strong> the due date</li>
          <li><strong>3 days before</strong> the due date</li>
          <li><strong>On the due date</strong></li>
          <li><strong>7 days overdue</strong> &mdash; first overdue notice</li>
          <li><strong>14 days overdue</strong> &mdash; second notice</li>
          <li><strong>30+ days overdue</strong> &mdash; final notice</li>
        </ul>
        <ScreenshotPlaceholder caption="Payment Reminders page with stat cards and the colour-coded reminder type badges" />
      </section>

      {/* Pending tab */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pending Tab</h2>
        <p className="text-gray-600 mb-3">
          The <strong>Pending</strong> tab lists every invoice currently due for a reminder, showing the invoice, client, balance, due date, reminder type, and how many reminders have already gone out. From here you can:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Tick individual invoices and click <strong>Send Selected</strong></li>
          <li>Click <strong>Send All Active</strong> to send every active reminder at once</li>
          <li>Use the per-row <strong>Send</strong> button to fire a single reminder</li>
        </ol>
        <p className="text-gray-600 mt-3">
          Each card shows the count of <strong>Pending</strong>, <strong>Overdue</strong>, <strong>Due Soon</strong>, <strong>Paused</strong>, and <strong>Selected</strong> invoices.
        </p>
      </section>

      {/* Pausing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pausing Reminders</h2>
        <p className="text-gray-600 mb-3">
          Sometimes you don&apos;t want to chase a specific client &mdash; maybe a payment plan is in place. Use the <strong>Pause</strong> button on a row to stop reminders for that invoice. Paused invoices:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Are excluded from <strong>Send Selected</strong> and <strong>Send All Active</strong></li>
          <li>Show a <strong>Paused</strong> status badge until resumed</li>
          <li>Can be re-enabled any time with the <strong>Resume</strong> button</li>
        </ul>
      </section>

      {/* History */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">History Tab</h2>
        <p className="text-gray-600 mb-3">
          The <strong>History</strong> tab is a full audit trail of every reminder sent, with date &amp; time, invoice, recipient, reminder type, status, and subject line. Filter by <strong>All</strong>, <strong>Sent Only</strong>, or <strong>Failed Only</strong>, and use <strong>Load More</strong> to page through older records.
        </p>
        <Tip>
          Failed reminders show the error message inline, so you can spot a bad email address or delivery issue at a glance and fix it.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/receipts" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Receipts
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
