import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function DashboardPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Dashboard</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Dashboard</h1>
      <p className="text-gray-600 mb-4">
        The dashboard is the first screen after you log in. It shows today&rsquo;s operations, the quote pipeline,
        money (for managers), the exceptions that need someone to act, the newest quotes and the next follow-ups.
        Every figure is counted from your organisation&rsquo;s data when the page loads.
      </p>
      <p className="text-gray-600 mb-8">
        Open it from <strong>Home &rsaquo; Dashboard</strong>. Every role can open it: owner, admin, manager, agent
        and viewer. What each role sees on it differs, as described below.
      </p>

      {/* Who sees what */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Sees What</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Owner, admin, manager</strong> &mdash; everything on this page, including the money row and balance amounts.</li>
          <li><strong>Agent</strong> &mdash; everything except the money row. Balance rows in Needs Attention show the due date but no amount.</li>
          <li><strong>Viewer</strong> &mdash; the stat cards, Needs Attention without customer emails or balance amounts, Upcoming Follow-ups, Today&rsquo;s Summary and Quick Tips. No money row, no Quick Actions and no Recent Activity.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A card, action or row is a link only when the side menu lets your role open the page it points to. Otherwise it
          shows its figure without a link. For example, an agent does not get the Rates Hub action, and a viewer&rsquo;s cards
          are not links.
        </p>
      </section>

      {/* Row 1 */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Row 1 &mdash; Today&rsquo;s Operations</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Departing This Week</strong> &mdash; bookings that are not cancelled and start between today and six days from today.</li>
          <li><strong>Trips in Progress</strong> &mdash; bookings that are not cancelled, started on or before today and end on or after today.</li>
          <li><strong>Unread Inbox</strong> &mdash; unread messages across your WhatsApp conversations and the email of your connected mailboxes. Hidden conversations are not counted.</li>
          <li><strong>Tasks Due Today</strong> &mdash; open tasks due today. A red badge shows how many open tasks are past their due date. A task is open unless it is done, completed or cancelled.</li>
        </ul>
      </section>

      {/* Row 2 */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Row 2 &mdash; Clients &amp; Pipeline</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Clients</strong> &mdash; all your clients. The line underneath shows how many were added this month: green if that is at least last month&rsquo;s number, red if fewer.</li>
          <li><strong>Pending Follow-ups</strong> &mdash; follow-ups still pending. A red badge shows how many are past their due date.</li>
          <li><strong>Client Quotes</strong> &mdash; all itineraries except custom B2B trips. This is the same set the Itineraries list shows.</li>
          <li><strong>Upcoming Trips</strong> &mdash; confirmed itineraries that start in the next 30 days.</li>
        </ul>
      </section>

      {/* Row 3 */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Row 3 &mdash; Conversion</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Quotes Sent</strong> &mdash; quotes with status sent, confirmed or completed. The <em>sent rate</em> is that number divided by all client quotes.</li>
          <li><strong>Confirmed</strong> &mdash; quotes with status confirmed or completed. The <em>conversion</em> is that number divided by Quotes Sent.</li>
          <li><strong>New this month</strong> &mdash; clients added since the first of this month, with last month&rsquo;s number for comparison.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A completed trip counts as both sent and confirmed, so the conversion rate does not drop when a trip finishes.
        </p>
      </section>

      {/* Money row */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Money Row (Owner, Admin, Manager)</h2>
        <p className="text-gray-600 mb-3">
          Four cards that only owners, admins and managers see. Amounts are shown per currency and never added across
          currencies: a yen total and a euro total sit side by side on one card. Rows belonging to the seeded demo trips are left out.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Outstanding Receivables</strong> &mdash; the unpaid balance of every invoice that is not cancelled. The red badge is the part whose due date is before today. An invoice due today is not overdue yet. Same rule as Accounts Receivable.</li>
          <li><strong>Unpaid Expenses &amp; Bills</strong> &mdash; pending and approved expenses, plus supplier invoices (received, matched or approved) that are not matched to any expense. A supplier invoice matched to an expense is not added again, because the expense already carries that money.</li>
          <li><strong>Received This Month</strong> &mdash; payments dated from the first of this month, minus refunds made in the same period. The line underneath counts the payments, and the refunds if there were any. If refunds are larger than payments the figure is negative.</li>
          <li><strong>Spent This Month</strong> &mdash; expenses marked paid with a payment date this month.</li>
        </ul>
      </section>

      {/* Quick Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <p className="text-gray-600 mb-3">Shortcuts to the most common screens. You only see the ones your role can open:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Unified Inbox</strong> &mdash; WhatsApp and email conversations (owner, admin, manager, agent).</li>
          <li><strong>New Quote</strong> &mdash; start a new itinerary from scratch (owner, admin, manager).</li>
          <li><strong>Rates Hub</strong> &mdash; hotel, guide and service rates (owner, admin, manager).</li>
          <li><strong>B2B Packages</strong> &mdash; the tour inventory of ready-made packages (owner, admin, manager).</li>
        </ul>
        <p className="text-gray-600 mt-3">If none of them apply to your role, the panel is not shown.</p>
      </section>

      {/* Needs Attention */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Needs Attention</h2>
        <p className="text-gray-600 mb-3">
          A list of the problems to fix before a group travels. It looks at bookings departing in the next 45 days, and at
          any future booking whose balance deadline has passed or is within 14 days. Each row can show:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Balance due / OVERDUE</strong> &mdash; the booking still has a balance and is not marked paid, and the balance deadline is within 14 days, has passed, or the trip leaves within 7 days. Managers and above see the amount in the booking&rsquo;s currency. Agents and viewers see the row without the amount.</li>
          <li><strong>Traveller forms</strong> &mdash; not every passenger has submitted their details (for example 3/5 submitted).</li>
          <li><strong>No guide assigned</strong> &mdash; the linked itinerary has no guide.</li>
          <li><strong>Traveller asked for an option / Option accepted, not yet secured</strong> &mdash; a traveller requested or accepted an extra from the portal and the office has not finished handling it.</li>
          <li><strong>Pending portal change request</strong> &mdash; for example a request to add a traveller.</li>
          <li><strong>Customer email waiting for a reply</strong> &mdash; a customer email has waited more than 24 hours for an answer. Automated senders such as no-reply addresses are skipped. Owner, admin, manager and agent only.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          A red dot means urgent: overdue, departing within 7 days, or a customer waiting. An amber dot means soon. Urgent rows
          come first. Click a row to open the booking, itinerary or inbox that fixes it, if your role can open that page.
        </p>
        <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Dismissing a row</h3>
        <p className="text-gray-600">
          Owners, admins, managers and agents can click <strong>×</strong> on a row to hide it for the whole office. The row
          stays hidden while its situation stays the same. It comes back when something changes, for example the customer
          writes again, the balance or deadline moves, or more forms come in. After a dismissal you can click
          <strong> Undo</strong>. The line under the list shows how many rows are currently dismissed. Viewers cannot dismiss.
        </p>
      </section>

      {/* Recent Activity */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-gray-600">
          The five newest client quotes (custom B2B trips excluded), with their code, client and creation time, and a link to
          each when your role can open itineraries. Shown to owners, admins, managers and agents.
        </p>
      </section>

      {/* Upcoming Follow-ups */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Upcoming Follow-ups</h2>
        <p className="text-gray-600">
          The next five pending follow-ups, soonest first. Each shows the client, the follow-up&rsquo;s title (or its
          description if it has no title), how many days until it is due, and its priority: high, medium, normal or low.
          A follow-up links to the client when your role can open Clients.
        </p>
      </section>

      {/* Today's Summary */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Today&rsquo;s Summary</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Quotes Created</strong> &mdash; client quotes created today.</li>
          <li><strong>Bookings</strong> &mdash; bookings created today.</li>
          <li><strong>Payments Received</strong> &mdash; payments dated today. Refunds are not counted.</li>
        </ul>
        <Tip>
          <strong>Tip:</strong> the dashboard uses your computer&rsquo;s date for &ldquo;today&rdquo;, so in Tokyo or Cairo the
          day turns over at your midnight, not the server&rsquo;s.
        </Tip>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not refresh by itself. Reload the page to see new figures.</li>
          <li>It does not convert currencies. Each currency is shown on its own.</li>
          <li>Tasks, follow-ups and email conversations are not yet separated by organisation. On an install that hosts more than one organisation, those counts include all of them.</li>
          <li>&ldquo;Created today&rdquo; counts in Today&rsquo;s Summary start at midnight UTC, not at your local midnight.</li>
          <li>The Departing This Week card is a count; it does not list the departures. Use Bookings for the list.</li>
          <li>The Quick Tips panel is fixed text, not advice based on your data.</li>
        </ul>
      </section>
    </div>
  )
}
