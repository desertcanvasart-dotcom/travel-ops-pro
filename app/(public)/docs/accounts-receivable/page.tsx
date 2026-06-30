import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function AccountsReceivablePage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Accounts Receivable</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Accounts Receivable</h1>
      <p className="text-gray-600 mb-8">
        Accounts Receivable tracks everything your clients owe you. It rolls up unpaid invoice balances by client, ages each one by how far past due it is, and lets you chase payment with a reminder straight from the list.
      </p>

      {/* Summary & Aging */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary &amp; Aging Report</h2>
        <p className="text-gray-600 mb-3">
          The summary cards and aging bar break down your outstanding receivables by age:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Outstanding</strong> &mdash; The full balance due across all open invoices</li>
          <li><strong>Overdue</strong> &mdash; The amount and count of invoices past their due date</li>
          <li><strong>Current</strong> &mdash; Invoices that are not yet due</li>
          <li><strong>Aging Buckets</strong> &mdash; Current, 1&ndash;30 days, 31&ndash;60 days, and 90+ days overdue</li>
        </ul>
        <ScreenshotPlaceholder caption="Accounts Receivable summary cards and aging report bar" />
      </section>

      {/* Views */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Two Views</h2>
        <p className="text-gray-600 mb-3">
          Switch between two ways of looking at what is owed:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>By Client</strong> &mdash; Each client is grouped with their total outstanding and mini aging chips. Expand a client to see their individual open invoices and a link to their profile.</li>
          <li><strong>By Invoice</strong> &mdash; A flat table of every open invoice with total, amount paid, balance due, and aging bucket.</li>
        </ol>
      </section>

      {/* Filtering */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Searching &amp; Filtering</h2>
        <p className="text-gray-600 mb-3">
          Search by client name, email, or invoice number, and use the <strong>Aging</strong> dropdown to filter by:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Current (Not Due)</strong></li>
          <li><strong>1&ndash;30 Days Overdue</strong></li>
          <li><strong>31&ndash;60 Days Overdue</strong></li>
          <li><strong>90+ Days Overdue</strong></li>
        </ul>
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Chasing Payment</h2>
        <p className="text-gray-600 mb-3">
          From either view you can act on an outstanding invoice directly:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click the <strong>Send Reminder</strong> (mail) icon to open a pre-filled payment reminder addressed to the client, listing the original amount, amount paid, balance due, and due date</li>
          <li>Click <strong>View Invoice</strong> to open the full invoice</li>
          <li>Export the client breakdown with the <strong>CSV</strong> or <strong>PDF</strong> buttons in the header</li>
        </ol>
        <Tip>
          For scheduled, multi-stage chasing rather than one-off reminders, see <Link href="/docs/invoice-reminders" className="underline">Invoice Reminders</Link>, which automates the whole reminder cadence.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/invoice-reminders" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Invoice Reminders
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
