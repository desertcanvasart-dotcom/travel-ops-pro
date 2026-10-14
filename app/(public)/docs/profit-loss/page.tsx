import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ProfitLossPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Profit &amp; Loss</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Profit &amp; Loss</h1>
      <p className="text-gray-600 mb-4">
        Profit &amp; Loss shows what each trip earned and cost, and what the business keeps after agent commissions. Open it from <strong>Home &rsaquo; Profit &amp; Loss</strong>, under the Finance group in the menu. It has two tabs: <strong>Overview</strong> (the trips) and <strong>Tax</strong> (the VAT your invoices recorded).
      </p>
      <p className="text-gray-600 mb-8">
        Only the <strong>Owner</strong>, <strong>Admin</strong> and <strong>Manager</strong> roles see this screen and can open it, along with the trip detail page. Agents and viewers do not see the menu item, the pages do not open for them, and the figures are refused to them. The Profit &amp; Loss card on a trip page follows the same rule.
      </p>

      {/* Three layers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Three layers of money</h2>
        <p className="text-gray-600 mb-3">The report keeps three things apart, because they answer different questions:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Quoted</strong> &mdash; what you told the client (the trip&rsquo;s price). An intention.</li>
          <li><strong>Accrued</strong> &mdash; invoiced revenue less the trip&rsquo;s costs. This includes the supplier cost, which is the pricing engine&rsquo;s estimate, not a bill anyone sent you.</li>
          <li><strong>Realized</strong> &mdash; money that actually moved: payments received, minus expenses marked Paid and commissions paid out. The supplier cost estimate is not in it.</li>
        </ul>
      </section>

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview tab</h2>
        <p className="text-gray-600 mb-3">The cards at the top, each over the trips that match the filters:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Trips</strong></li>
          <li><strong>Total Revenue</strong> &mdash; <strong>net of VAT</strong> (see below)</li>
          <li><strong>Total Expenses</strong> &mdash; the trips&rsquo; costs (see below)</li>
          <li><strong>Gross Profit</strong> &mdash; revenue minus expenses, with the agent commission shown beneath when there is one</li>
          <li><strong>Net of commission</strong> &mdash; gross profit minus agent commissions, with its margin</li>
          <li><strong>Realized</strong> &mdash; cash in minus cash out, with both amounts beneath</li>
          <li><strong>Avg Margin</strong> &mdash; profit &divide; revenue</li>
          <li><strong>Profitable</strong> and <strong>Loss-Making</strong> &mdash; trips counted on the net figure, after commission</li>
        </ul>
        <p className="text-gray-600 mt-3">
          When the trips are in different currencies, each card lists one amount per currency and the margins show a dash: a margin across two currencies is not a margin. Nothing is converted for the cards.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">One margin definition</h3>
        <p className="text-gray-600">
          Margin means <strong>profit divided by revenue</strong> everywhere: on this screen, on the trip detail page and on the Profit &amp; Loss card of the trip page. A trip priced with a 25% markup on cost therefore shows a 20% margin. (The trip-page card used to show markup on cost; it no longer does.)
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Filters, sorting and export</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Search by trip code, trip name or client</li>
          <li>Trip status: Draft, Quoted, Sent, Confirmed, Completed or Cancelled</li>
          <li>From and To dates, applied to the trip&rsquo;s <strong>start date</strong>. There are no month, quarter or year presets.</li>
          <li>Sort by date, net profit or net margin, ascending or descending; 15 trips per page</li>
          <li>CSV and PDF export of the filtered list</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Which trips are counted</h3>
        <p className="text-gray-600">
          With no status chosen, <strong>Draft and Cancelled trips are left out</strong>, and a line under the cards says so. A draft or a cancelled trip would add its quote as revenue and its estimated cost as cost, and none of that is business. Choose a status in Filters to see those trips anyway. Trips that are Quoted or Sent are counted, using the quote as revenue until an invoice exists; the trip row then carries an italic &ldquo;quoted&rdquo; tag.
        </p>
      </section>

      {/* Per trip */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How a trip&rsquo;s figures are worked out</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Revenue</strong> &mdash; the invoices raised for the trip, <strong>net of VAT</strong>, cancelled invoices excluded. VAT on an invoice is owed to the tax authority, so it is not revenue and not profit: an invoice of 1,140 with 140 of VAT recorded is 1,000 of revenue. Until the trip has an invoice, revenue is the quote (a net price), so the figure does not jump when you invoice. The trip detail page shows the VAT that was left out.
          </li>
          <li>
            <strong>Expenses</strong> &mdash; the trip&rsquo;s saved supplier cost (the pricing estimate), plus the supplier cost of confirmed extras, plus the expenses linked to the trip. Rejected and Cancelled expenses are ignored, and an expense created from a supplier confirmation is not counted twice.
          </li>
          <li><strong>Gross profit</strong> &mdash; revenue minus expenses.</li>
          <li><strong>Agent commission</strong> &mdash; every payable commission on the trip except cancelled ones. Receivable commissions (what suppliers owe you) are shown on the detail page but never added.</li>
          <li><strong>Net profit</strong> &mdash; gross profit minus agent commission; <strong>net margin</strong> is net profit &divide; revenue.</li>
          <li><strong>Realized</strong> &mdash; payments received (net of the VAT in them, in proportion to each invoice), minus expenses marked Paid and commissions paid out.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Click a trip for its detail page: the headline figures, the expense breakdown by category, the trip&rsquo;s expenses and its invoices. Each expense and invoice row is shown in <strong>its own currency</strong>. The invoice list shows the invoice total, VAT included, with the VAT beneath, so it will not add up to the net revenue above it.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Exchange rates</h3>
        <p className="text-gray-600 mb-3">
          A trip has one currency; expenses, commissions and payments carry their own. Each is converted into the trip&rsquo;s currency at the exchange rate on <strong>its own date</strong>. A line with no usable rate is <strong>left out</strong> rather than added at face value, and the report says so: an amber banner at the top of the Overview, and a &ldquo;n left out: no rate&rdquo; line on the trip, list the amounts and dates. While a banner is showing, costs are understated and margins are overstated by those lines.
        </p>
      </section>

      {/* Tax */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tax tab</h2>
        <p className="text-gray-600 mb-3">
          The Tax tab shows the VAT your <strong>issued invoices recorded</strong>. It reads only what each invoice stored when it was issued: whether VAT was applied, the rate, the VAT amount and, when something was left out, the amount VAT was charged on. It never works VAT out from your company rate or from revenue; changing the rate in Settings &rsaquo; Company Profile does not change an invoice already issued.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Per currency: <strong>Net of VAT</strong>, <strong>VAT collected</strong>, <strong>Total billed</strong>, and the number of <strong>invoices without VAT</strong> (marked &ldquo;VAT not applied&rdquo;) with the amount billed on them.</li>
          <li>A table per currency by recorded rate: invoices, net, VAT recorded and total.</li>
          <li>The number of invoices that left <strong>extras or insurance out of the VAT</strong> (they carry no VAT; such an invoice records the amount it taxed).</li>
          <li>Filter by invoice <strong>issue date</strong> (from / to).</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Only issued invoices count: drafts and cancelled invoices do not. Currencies and rates are never added together or converted. VAT you pay on expenses (input VAT) is not recorded anywhere yet, so it is not shown, and the tab is a summary of your records, not a tax return.
        </p>
      </section>

      {/* Trip page card */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Profit &amp; Loss card on a trip</h2>
        <p className="text-gray-600 mb-3">
          On a trip page (Owner, Admin and Manager only) the card shows <strong>Supplier cost</strong>, <strong>Client price</strong>, <strong>Gross profit</strong> and <strong>Margin %</strong> (profit &divide; client price), a breakdown by service type, and the extra expenses entered on the trip, which reduce the margin. It is a quick estimate built in your browser from the trip&rsquo;s services; the report on this screen is the reference.
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Extra expenses</strong> on the card are converted the way this report converts them: each at the stored exchange rate on <strong>its own date</strong>, into the trip&rsquo;s currency. Rejected and Cancelled expenses, and the cost of a booking supplier already inside the supplier cost, are left out. When an expense has no rate, it is <strong>left out of the margin</strong> and an amber <strong>&ldquo;Rate missing&rdquo;</strong> note under the card&rsquo;s header names it and its amount; until a rate is added the margin shown is higher than it really is. If the conversion cannot be loaded at all, the same note says so. The card no longer falls back to built-in approximate rates.
        </p>
        <p className="text-gray-600 mb-3">
          When no supplier cost is recorded for the trip, the card says <strong>Not recorded</strong> instead of working one out. The company margin is applied to every service when the trip is priced, tips, supplies and flights included; there is no pass-through rule.
        </p>
        <Tip>
          For an accurate report, link every expense to its trip, keep invoices up to date, and keep exchange rates current so that nothing is left out.
        </Tip>
      </section>

      {/* What it does not do */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Realized cost covers expenses marked Paid and commissions paid. Supplier invoices paid without an expense row are not in it, so Realized profit can look better than your bank.</li>
          <li>A payment on a cancelled invoice still counts as cash received: the money moved.</li>
          <li>Insurance billed on an invoice has no matching cost in the report, so it reads as pure margin.</li>
          <li>The trip-page card shows the &ldquo;Rate missing&rdquo; note but cannot fix it: add the exchange rate, or enter the expense in the trip&rsquo;s currency. It also builds its service figures in your browser, so for a trip with priced services the report on this screen is still the reference.</li>
          <li>The supplier cost is an estimate until supplier costs are entered as expenses; the report does not know what a supplier actually billed.</li>
          <li>No input VAT, and no month, quarter or year presets for the dates.</li>
          <li>Revenue is the trip&rsquo;s invoices; nothing is converted between currencies for the cards, so a mixed-currency list gives amounts per currency and no overall margin.</li>
        </ul>
      </section>
    </div>
  )
}
