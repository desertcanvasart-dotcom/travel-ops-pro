import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ExpensesCommissionsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Expenses &amp; Commissions</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Expenses &amp; Commissions</h1>
      <p className="text-gray-600 mb-4">
        Expenses is where you record what you pay out; Commissions is where you record what suppliers owe you and what you owe guides, agents and sellers. Open them from <strong>Home &rsaquo; Expenses</strong> and <strong>Home &rsaquo; Commissions</strong>, both under the Finance group in the menu.
      </p>
      <p className="text-gray-600 mb-8">
        Only the <strong>Owner</strong>, <strong>Admin</strong> and <strong>Manager</strong> roles see these screens and can use them. Agents and viewers do not see the menu items, the pages do not open for them, and the data is refused to them (they get a &ldquo;Forbidden&rdquo; answer). The same applies to the Add expense entry, the expenses panel and the Profit &amp; Loss card on a trip page: they appear only to those three roles.
      </p>

      {/* Expenses */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Expenses</h2>

        <h3 className="text-lg font-medium text-gray-900 mb-3">The tiles</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Total expenses</strong> &mdash; every expense in the list <strong>except Rejected and Cancelled ones</strong>, which are not costs.</li>
          <li><strong>Pending</strong>, <strong>Approved</strong>, <strong>Paid</strong> &mdash; the expenses in each status.</li>
        </ul>
        <p className="text-gray-600 mb-4">
          Each tile lists one amount <strong>per currency</strong> (for example &ldquo;&yen;120,000 + &euro;300.00&rdquo;). Nothing is converted and nothing is added across currencies. Use the list, grid or chart view; the chart shows the category and status breakdown in the currency most of the list is in, and says which above the bars. The chart still shows every status, Rejected and Cancelled included.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Adding an expense</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Expense</strong></li>
          <li>Fill in:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Category</strong> &mdash; Tour Guide, Driver, Hotel/Accommodation, Transportation, Entrance Fees, Meals, Airport Assistant, Hotel Assistant, Ground Handler, Nile Cruise, Flights, Activities &amp; Tours, Tipping, Permits/Permissions, Toll Fees, Parking, Fuel, Office Expenses, Marketing, Software/Subscriptions or Other</li>
              <li><strong>Description</strong>, <strong>Amount</strong>, <strong>Currency</strong> and <strong>Expense date</strong>. The currency starts as your company&rsquo;s currency; you can pick USD, EUR, GBP, EGP or JPY.</li>
              <li><strong>Supplier</strong> &mdash; choose a city, then a supplier for that category, or type a payee that is not a supplier (an authority, for example)</li>
              <li><strong>Trip</strong> (optional) &mdash; links the expense to a trip of your company</li>
              <li><strong>Receipt</strong> URL and file name</li>
              <li><strong>Status</strong> &mdash; Pending, Approved, Paid, Rejected or Cancelled</li>
              <li><strong>Payment method</strong> &mdash; Cash, Bank Transfer, Credit Card, Wise, PayPal or Company Card; plus a payment date and reference</li>
              <li><strong>Notes</strong></li>
            </ul>
          </li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <p className="text-gray-600 mt-4">
          The server refuses a status, category or currency outside these lists, and a trip or supplier that does not belong to your company. Each company numbers its own expenses (EXP-year-number), so your numbers do not skip when another company on the platform enters one.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Approval and payment</h3>
        <p className="text-gray-600 mb-3">
          The flow is Pending &rarr; Approved &rarr; Paid, or Rejected. On the expense&rsquo;s own page each status is a button. There is no separate approver role: any Admin or Manager can take every step on any expense, including one they entered, and the approver&rsquo;s name is not recorded.
        </p>
        <p className="text-gray-600 mb-3">
          The payment date follows the status. Setting an expense to <strong>Paid</strong> keeps the date it has, or uses the date you give, or today. Any other status clears it.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Deleting an expense</h3>
        <p className="text-gray-600 mb-3">
          A <strong>paid</strong> expense cannot be deleted: it records money that moved. An expense <strong>matched to a supplier invoice</strong> cannot be deleted either, because deleting it would silently remove that match. In both cases the screen tells you why. Set the expense to <strong>Cancelled</strong> instead (a cancelled expense stays on record and counts nowhere), or unmatch it on the supplier invoice first. Any other expense can be deleted, and the deletion is final.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Why link expenses to trips?</h3>
        <p className="text-gray-600">
          Only an expense linked to a trip reaches that trip&rsquo;s profit and loss. Rejected and Cancelled expenses are ignored there. An expense created automatically when you confirm a supplier on a booking is counted once: it is the same money as the trip&rsquo;s supplier cost, so it is not added a second time.
        </p>
        <Tip>
          Link every trip-related expense to its trip, otherwise it never shows in the trip&rsquo;s Profit &amp; Loss.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Filters and exports</h3>
        <p className="text-gray-600">
          Search by number, description or supplier; filter by status (including Cancelled), category, supplier type and expense date range. CSV and PDF export what the list shows, each row in its own currency.
        </p>
      </section>

      {/* Commissions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Commissions</h2>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Types</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Receivable</strong> (shown as &ldquo;In&rdquo;) &mdash; a supplier or partner pays <em>you</em> a share of what they charged, for example a shop or a hotel. The base is what the supplier charged.</li>
          <li><strong>Payable</strong> (shown as &ldquo;Out&rdquo;) &mdash; <em>you</em> pay a guide, agent or seller a share of <em>your profit</em> on a service (client price minus supplier cost). Nothing is paid on a service that made no profit.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The cards</h3>
        <p className="text-gray-600 mb-3">
          <strong>Receivable</strong>, <strong>Payable</strong>, <strong>Pending in</strong> (receivable commissions that are Pending or Invoiced), <strong>Pending out</strong> (payable ones that are Pending), <strong>Received</strong>, <strong>Paid out</strong> and <strong>Net</strong> (receivable minus payable). Every card lists one amount per currency. <strong>Cancelled commissions are not counted in any card</strong>; they stay in the list, dimmed. Disputed commissions are still counted, because the money may still be owed.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Adding a commission by hand</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Commission</strong></li>
          <li>Choose <strong>Receivable</strong> or <strong>Payable</strong> and a <strong>category</strong> (Hotel, Shopping, Restaurant, Transport, Cruise, Attraction, Optional tour, Activity, Show, Spa, Agent referral, Partner, Other)</li>
          <li>Pick a supplier or type a source name, and optionally link a trip</li>
          <li>Enter the <strong>base amount</strong> and the <strong>rate (%)</strong>: the commission amount fills in as base &times; rate &divide; 100, rounded to the currency&rsquo;s smallest unit, and you can type a different amount</li>
          <li>Choose the <strong>currency</strong> (it starts as your company&rsquo;s currency), the dates and the status</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The supplier, trip and client you pick must belong to your company. A manual commission is not checked against commissions generated for the same trip, so you can enter one twice: look at the list before adding.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Changing a commission</h3>
        <p className="text-gray-600 mb-3">
          The edit form changes only the <strong>status</strong>, the <strong>paid / received date</strong> and the <strong>notes</strong>. The type, category, currency, base, rate, amount, supplier and trip are shown for reference but cannot be changed: they are what was owed and to whom. To correct one, delete the commission and add it again.
        </p>
        <p className="text-gray-600 mb-3">
          The paid / received date follows the status. Setting a commission to <strong>Paid</strong> (payable) or <strong>Received</strong> (receivable) records the date, using the one you give or today. Moving it back to any other status clears the date. The tick button on a pending row marks it Received or Paid in one click. When a change is refused, a message says why.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Generate commissions on a trip</h3>
        <p className="text-gray-600 mb-3">
          On a trip, open the <strong>More</strong> menu (the three dots) and choose <strong>Generate commissions</strong>. It is available to the Owner, Admin and Manager. For each priced service it works out:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>the rate &mdash; the service&rsquo;s own, otherwise the supplier&rsquo;s default (Rates &rsaquo; Commissions)</li>
          <li>for a supplier that pays you: that rate on the <strong>supplier&rsquo;s cost</strong></li>
          <li>for a supplier you pay: that rate on your <strong>profit</strong> on the service, and nothing when there is none</li>
          <li>if the service names who <strong>sold</strong> it, a second payable commission to the seller at the seller&rsquo;s rate on the same profit</li>
        </ul>
        <p className="text-gray-600 mb-3">
          The commission takes the trip&rsquo;s currency. A cancelled trip is refused. Services it cannot do anything with are listed in the result message with the reason (no supplier, no rate, no supplier cost, no profit&hellip;), not silently dropped.
        </p>
        <p className="text-gray-600 mb-3">
          A service is marked as done only when everything it can give has been made. Running the button twice does not duplicate: a commission a service already has is not made again. A service that could only be generated in part (for example the seller&rsquo;s commission, while the supplier has no rate yet) stays open, so once you set the missing rate, running it again adds only what is missing. <strong>Deleting a generated commission releases its service</strong>, so it can be generated again. Commissions generated before this link existed carry no reference to their service, and releasing does not apply to them.
        </p>
        <p className="text-gray-600">
          Changing a service&rsquo;s price or rate after generating does not update the commissions already made.
        </p>
        <Tip>
          Agent commissions on a trip (payable) are subtracted from that trip&rsquo;s profit in Profit &amp; Loss, except cancelled ones. Receivable commissions are shown there but never added, because owed is not earned.
        </Tip>
      </section>

      {/* What it does not do */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>No approval chain: there is no separate approver role, no record of who approved, and no limit on what a manager can approve.</li>
          <li>No VAT on expenses: the tax fields on an expense are not filled in anywhere, so there is no input VAT to report.</li>
          <li>No conversion in the tiles and cards: amounts in different currencies are listed side by side. The Profit &amp; Loss screen is where costs are converted, at the exchange rate on each expense&rsquo;s date.</li>
          <li>No automatic update of generated commissions when a service&rsquo;s price or rate changes.</li>
          <li>No editing of a commission&rsquo;s amounts: delete it and add it again.</li>
        </ul>
      </section>
    </div>
  )
}
