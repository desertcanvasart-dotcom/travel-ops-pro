import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

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
        Accounts Payable lists what you still owe your suppliers: expenses waiting for approval or payment, and supplier bills that have no expense behind them. It groups them by supplier, ages them, and lets you approve and mark expenses paid. Open it from <strong>Home &rsaquo; Finance &rsaquo; Payables</strong>. Owners, admins and managers can see it; agents and viewers do not have it in their menu and cannot open the page.
      </p>

      {/* What is listed */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What Is Listed</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Expenses</strong> with status Pending or Approved. Paid, rejected and cancelled expenses are not owed and are left out.</li>
          <li><strong>Unmatched bills</strong> &mdash; supplier bills (see <Link href="/docs/supplier-invoices" className="underline">Supplier Invoices</Link>) in status Received, Matched or Approved that are not linked to any expense. They are owed too, and without them Payables would show less than the Bills screen and the dashboard. A bill that is linked to an expense is not added a second time, because the expense already carries that money. Disputed, paid and cancelled bills are not listed.</li>
        </ul>
      </section>

      {/* Due date */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How the Due Date Is Worked Out</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>An expense matched to a supplier bill is due on that bill&apos;s due date (the earliest one, if it is split over several bills). The expense list shows &ldquo;(bill number)&rdquo; beside the date.</li>
          <li>An expense with no matched bill, or a matched bill without a due date, is due 14 days after the expense date.</li>
          <li>An unmatched bill is due on its own due date, or 14 days after the bill date if it has none.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>Days past due</strong> is today minus that date.
        </p>
      </section>

      {/* Summary & Aging */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary &amp; Aging Report</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Payable</strong> &mdash; Everything listed, with the number of expenses and bills</li>
          <li><strong>Pending Approval</strong> &mdash; Expenses not yet approved</li>
          <li><strong>Approved to Pay</strong> &mdash; Approved expenses not yet paid</li>
          <li><strong>Unmatched bills</strong> &mdash; Supplier bills with no expense behind them</li>
          <li><strong>Not due yet</strong> &mdash; Due today or later</li>
          <li><strong>1&ndash;30 days overdue</strong>, <strong>31&ndash;60 days overdue</strong>, <strong>60+ days overdue</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">
          The four age tiles add up to Total Payable. The colour bar shows each age bucket&apos;s share of the total. <strong>Amounts are never added across currencies</strong>: a tile shows each currency separately, and the bar shows shares only.
        </p>
      </section>

      {/* Views */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Three Views</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>By Supplier</strong> &mdash; Each supplier with its outstanding total (items counted include unmatched bills). Expand a supplier to see its expenses and bills.</li>
          <li><strong>By Expense</strong> &mdash; A table of every listed item with date, due date, amount, status and age badge. Unmatched bills show status &ldquo;Bill&rdquo; and link to the bill.</li>
          <li><strong>Payment History</strong> &mdash; The 50 most recent paid expenses, newest payment first, with payment date and method. Only the Supplier Type filter and the search box apply to it; aging and status do not.</li>
        </ol>
      </section>

      {/* Filtering */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Searching &amp; Filtering</h2>
        <p className="text-gray-600 mb-3">
          Search by supplier name, expense number or description, then open <strong>Filters</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Aging</strong> &mdash; Not due yet, 1&ndash;30, 31&ndash;60, or 60+ days overdue</li>
          <li><strong>Supplier Type</strong> &mdash; Guide, driver, hotel, transport, ground handler and so on. Unmatched bills have no supplier type and count as Other.</li>
          <li><strong>Status</strong> &mdash; Pending Approval, Approved, or Unmatched bills (bills only)</li>
        </ul>
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Approving &amp; Paying</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Approve</strong> on a pending expense to mark it approved.</li>
          <li>Click <strong>Mark as Paid</strong> on an approved expense. The expense is marked paid with today&apos;s date. If the expense is matched to a supplier bill that is already approved, and every expense on that bill is now paid, the bill is marked paid as well, so it no longer shows as owed on the Bills screen and cannot be paid a second time. A bill that is not yet approved is left alone; approve and pay it from the Bills screen.</li>
          <li>Click <strong>View Expense</strong> to open the expense, or <strong>View Bill</strong> on a bill row.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          If a save fails, a message explains why; nothing is changed. Expenses can be paid from the Expenses screen too, but Mark as Paid here is the one that also settles the bill.
        </p>
        <p className="text-gray-600 mt-3">
          <strong>CSV</strong> and <strong>PDF</strong> in the header export the supplier breakdown as filtered: one row per supplier and currency, with total expenses, outstanding and item count.
        </p>
        <Tip>
          An expense with no matched bill is flagged overdue 14 days after its date. If it is matched to a bill, the bill&apos;s due date decides instead.
        </Tip>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not pay anyone. It records that you paid; the transfer happens outside the system.</li>
          <li>It does not pay or approve a supplier bill. Do that from the Bills screen.</li>
          <li>It does not convert currencies or give one grand total across currencies.</li>
          <li>Payment History is the latest 50 payments only, not a full ledger.</li>
        </ul>
      </section>
    </div>
  )
}
