import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function FinancialReportsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Financial Reports</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Financial Reports</h1>
      <p className="text-gray-600 mb-8">
        Financial Reports give you a full annual picture of your business &mdash; revenue, expenses, profit, cash flow, tax, and commissions &mdash; organised into five tabs. Pick a year from the selector and the whole report recalculates for that period.
      </p>

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview Tab</h2>
        <p className="text-gray-600 mb-3">
          The default view summarises the selected year at a glance:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Headline Cards</strong> &mdash; Total revenue, total expenses, gross profit &amp; margin, collected amount &amp; collection rate, trips, and invoices</li>
          <li><strong>Year-over-Year</strong> &mdash; Revenue and expense change percentages versus the previous year</li>
          <li><strong>Quarterly Performance</strong> &mdash; Revenue, expenses, profit, and margin per quarter</li>
          <li><strong>Monthly Chart</strong> &mdash; A bar chart comparing revenue against expenses month by month</li>
        </ul>
        <ScreenshotPlaceholder caption="Financial Reports overview with headline cards and the monthly revenue-vs-expenses chart" />
      </section>

      {/* Revenue & Cash Flow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Revenue &amp; Cash Flow Tabs</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Revenue</strong> &mdash; A month-by-month table of invoiced, collected, expenses, net profit, trips, and invoices, with a totals row</li>
          <li><strong>Cash Flow</strong> &mdash; Inflows, outflows, net cash flow, pending receivables, pending payables, and projected cash &mdash; plus a monthly cash flow table</li>
        </ul>
      </section>

      {/* Tax */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tax Summary Tab</h2>
        <p className="text-gray-600 mb-3">
          The tax tab estimates your position for the year:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Gross Revenue, Total &amp; Deductible Expenses, Taxable Income</strong></li>
          <li><strong>VAT Summary</strong> &mdash; Estimated VAT collected, VAT paid, and net VAT payable or receivable</li>
          <li><strong>Expense Breakdown by Category</strong> &mdash; A ranked, percentage-weighted view of where spend goes</li>
        </ul>
        <Tip>
          VAT figures are estimates to help with planning &mdash; always confirm final amounts with your accountant before filing.
        </Tip>
      </section>

      {/* Commissions & Export */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Commissions &amp; Exporting</h2>
        <p className="text-gray-600 mb-3">
          The <strong>Commissions</strong> tab summarises totals earned, paid, and pending, breaks them down by recipient type, and lists each recipient with their trip count.
        </p>
        <p className="text-gray-600">
          Every tab can be exported. Use the header <strong>CSV</strong> and <strong>PDF</strong> buttons for the annual report, or the per-section <strong>Export</strong> links to download individual tables.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/accounts-receivable" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Accounts Receivable
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
