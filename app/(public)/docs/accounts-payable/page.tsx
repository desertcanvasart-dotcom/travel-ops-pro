import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function AccountsPayablePage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Accounts Payable</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Accounts Payable</h1>
      <p className="text-gray-600 mb-8">
        Accounts Payable tracks everything you owe your suppliers &mdash; guides, drivers, hotels, transport, entrance fees &amp; more. It rolls up every unpaid expense into supplier totals, ages them, and lets you approve and settle payments without leaving the page.
      </p>

      {/* Summary & Aging */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary &amp; Aging Report</h2>
        <p className="text-gray-600 mb-3">
          The top of the page shows summary cards and a visual aging bar that splits your outstanding balance by how long it has been owed:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Payable</strong> &mdash; The full amount outstanding across all suppliers</li>
          <li><strong>Pending Approval</strong> &mdash; Expenses awaiting sign-off before they can be paid</li>
          <li><strong>Approved to Pay</strong> &mdash; Approved expenses ready for settlement</li>
          <li><strong>Aging Buckets</strong> &mdash; Current (0&ndash;14 days), 15&ndash;30 days, 31&ndash;60 days, and 90+ days</li>
        </ul>
        <ScreenshotPlaceholder caption="Accounts Payable summary cards and the colour-coded aging report bar" />
      </section>

      {/* Views */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Three Views</h2>
        <p className="text-gray-600 mb-3">
          Use the toggle to switch how payables are listed:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>By Supplier</strong> &mdash; Each supplier is grouped with its outstanding total and mini aging chips. Expand a supplier to see its individual expenses.</li>
          <li><strong>By Expense</strong> &mdash; A flat table of every outstanding expense with amount, status, and aging bucket.</li>
          <li><strong>Payment History</strong> &mdash; A record of recently paid expenses with payment date and method.</li>
        </ol>
      </section>

      {/* Filtering */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Searching &amp; Filtering</h2>
        <p className="text-gray-600 mb-3">
          Search by supplier or expense, then open <strong>Filters</strong> to narrow the list:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Aging</strong> &mdash; Current, 15&ndash;30, 31&ndash;60, or 90+ days</li>
          <li><strong>Supplier Type</strong> &mdash; Guide, driver, hotel, transport, ground handler, and more</li>
          <li><strong>Status</strong> &mdash; Pending Approval or Approved</li>
        </ul>
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Approving &amp; Paying</h2>
        <p className="text-gray-600 mb-3">
          Each expense moves through a simple two-step workflow inline:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click the <strong>Approve</strong> button on a pending expense to mark it approved</li>
          <li>Click <strong>Mark as Paid</strong> on an approved expense to record payment with today&apos;s date</li>
          <li>Use <strong>View Expense</strong> to open the full expense record for editing</li>
        </ol>
        <p className="text-gray-600 mt-3">
          Export the supplier breakdown at any time with the <strong>CSV</strong> and <strong>PDF</strong> buttons in the header.
        </p>
        <Tip>
          Expenses older than 14 days are flagged as overdue and highlighted, so nothing slips past its due date.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/supplier-invoices" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Supplier Invoices
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
