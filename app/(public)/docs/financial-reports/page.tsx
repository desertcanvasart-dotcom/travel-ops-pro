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
      <p className="text-gray-600 mb-4">
        Financial Reports shows one calendar year of your business: revenue, expenses, profit, cash flow, a tax estimate and payments to guides, drivers and other staff. Open it from <strong>Home &rsaquo; Financial Reports</strong>. Pick a year in the selector at the top right and every tab recalculates for that year. The selector always lists the year you are looking at, plus every year that has invoices or expenses.
      </p>
      <p className="text-gray-600 mb-8">
        Only the <strong>Owner</strong>, <strong>Admin</strong> and <strong>Manager</strong> roles see this screen in the menu and can open it. Other roles do not see the menu item, and the report data is refused to them.
      </p>

      {/* Currency */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">One currency for every figure</h2>
        <p className="text-gray-600 mb-3">
          The report asks for your preferred currency (from your preferences) and converts every invoice, payment and expense into it, at the exchange rate on that line&rsquo;s own date. If your preferred currency is not one the report supports, it uses EUR instead and says so under the header. Every amount on the page is formatted in the currency the report actually used.
        </p>
        <p className="text-gray-600 mb-3">
          When no exchange rate is on file for a line&rsquo;s currency and date, that line is <strong>left out</strong> of every total rather than added at face value. An amber banner then says how many lines are missing and lists the first five. The totals are lower than the truth by those lines.
        </p>
        <p className="text-gray-600">
          Demo records are left out too: trips whose code starts with <code>DEMO-</code>, and the invoices, expenses and payments linked to those trips. A grey line under the header says how many records were left out.
        </p>
      </section>

      {/* What counts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What counts</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Revenue</strong> &mdash; the total of invoices issued in the year. Draft and cancelled invoices do not count. Each invoice is placed in the month of its issue date.</li>
          <li><strong>Expenses</strong> &mdash; the total of expenses dated in the year. Rejected and cancelled expenses do not count. Pending expenses that nobody has approved yet <strong>do</strong> count as costs.</li>
          <li><strong>Collected / Cash inflows</strong> &mdash; invoice payments received in the year, placed in the month of the payment date and converted at the rate on that date. A payment counts whatever the status of its invoice.</li>
          <li><strong>Cash outflows</strong> &mdash; expenses with status Paid, placed in the month of the expense date (not the date they were paid).</li>
          <li><strong>Trips</strong> &mdash; confirmed and completed trips that start in the year. Drafts, sent quotes and cancelled trips are not counted.</li>
        </ul>
      </section>

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview tab</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Revenue</strong> and <strong>Total Expenses</strong>, each with the change against the previous year (YoY). The previous year uses the same rules.</li>
          <li><strong>Gross Profit</strong> &mdash; revenue minus expenses, with the margin (profit &divide; revenue).</li>
          <li><strong>Collected</strong> &mdash; payments received in the year, with the Collection Rate (collected &divide; revenue). Because payments are dated when they arrive, a payment in January for a December invoice counts in January, so the rate can be above or below what was collected on this year&rsquo;s invoices.</li>
          <li><strong>Trips</strong> &mdash; the number of confirmed and completed trips, with the average (revenue &divide; trips).</li>
          <li><strong>Invoices</strong> and <strong>Expenses</strong> &mdash; how many counted.</li>
          <li><strong>Quarterly Performance</strong> &mdash; revenue, expenses, profit and margin per quarter.</li>
          <li><strong>Monthly Revenue vs Expenses</strong> &mdash; a bar chart per month.</li>
        </ul>
        <ScreenshotPlaceholder caption="Financial Reports overview with headline cards and the monthly revenue-vs-expenses chart" />
      </section>

      {/* Revenue & Cash Flow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Revenue and Cash Flow tabs</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Revenue</strong> &mdash; the Monthly Revenue Report: invoiced, collected, expenses, net profit, trips and invoices per month, with a totals row.</li>
          <li><strong>Cash Flow</strong> &mdash; Cash Inflows, Cash Outflows and Net Cash Flow (inflows minus outflows). <strong>Pending Receivables</strong> is what is still unpaid on this year&rsquo;s counted invoices (total minus amount paid). <strong>Pending Payables</strong> is this year&rsquo;s counted expenses that are not yet Paid. <strong>Projected Cash</strong> is net cash flow plus pending receivables minus pending payables. A Monthly Cash Flow table shows inflow, outflow and net per month.</li>
        </ul>
      </section>

      {/* Tax */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tax Summary tab</h2>
        <p className="text-gray-600 mb-3">
          This tab is a summary, not a tax calculation. The VAT figures are the amounts recorded on your documents; the deductible categories are a fixed list that you cannot change.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Gross Revenue</strong> and <strong>Total Expenses</strong> &mdash; the same figures as the Overview.</li>
          <li><strong>Deductible Expenses</strong> &mdash; expenses in these categories only: office, software, marketing, fuel, permits, toll and parking. Every other category (hotels, guides, drivers, entrance fees and so on) is treated as not deductible.</li>
          <li><strong>Taxable Income</strong> &mdash; gross revenue minus deductible expenses.</li>
          <li><strong>VAT Summary (as recorded on issued invoices)</strong> &mdash; VAT Collected is the VAT recorded on the year&rsquo;s invoices that count as revenue (not drafts or cancelled ones), converted like their totals. When the invoices are in more than one currency, the amounts in each currency are listed under it. VAT Paid is the tax recorded on the year&rsquo;s expenses; nothing in the app records expense tax yet, so it is normally zero. Net VAT is Collected minus Paid. Nothing is worked out from a rate.</li>
          <li><strong>Expense Breakdown by Category</strong> &mdash; each category&rsquo;s total and share of all expenses.</li>
        </ul>
        <Tip>
          Use these figures for planning only. Your taxable income depends on deductible items this report does not track, and VAT you paid suppliers is not recorded. Confirm amounts with your accountant before filing.
        </Tip>
      </section>

      {/* Commissions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Commissions tab</h2>
        <p className="text-gray-600 mb-3">
          This tab covers expenses in the categories guide, driver, airport staff, hotel staff and ground handler. It shows Total Commissions, Paid, Pending (anything not yet Paid) and the number of recipients, then a breakdown by type with the number of payments (expense lines) per type.
        </p>
        <p className="text-gray-600">
          <strong>Commission Recipients</strong> lists each person or company by supplier name, with total earned, paid and pending. <strong>Trips</strong> is the number of different trips they were paid on. Expense lines not linked to a trip are in the totals but add no trip.
        </p>
      </section>

      {/* Export */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Exporting</h2>
        <p className="text-gray-600">
          The <strong>CSV</strong> and <strong>PDF</strong> buttons in the header export the monthly revenue, expenses, net profit and margin for the year. Each table also has its own <strong>Export</strong> link that downloads that table as CSV. Amounts are in the report currency.
        </p>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not calculate real tax. The deductible categories are fixed, and it does not know the VAT you paid suppliers.</li>
          <li>It does not wait for expense approval. Pending expenses count as costs as soon as they are entered.</li>
          <li>It does not date paid expenses by when they were paid. Cash outflows use the expense date.</li>
          <li>It does not include lines it cannot convert. They are listed in the amber banner instead.</li>
          <li>It does not include demo records (<code>DEMO-</code> trips and what is linked to them).</li>
          <li>It does not report a single month or quarter on its own. It always covers a whole calendar year.</li>
          <li>If the report fails to load, it shows an error with a <strong>Retry</strong> button and no figures, rather than the figures of the year you looked at before.</li>
        </ul>
      </section>
    </div>
  )
}
