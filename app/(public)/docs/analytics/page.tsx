import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function AnalyticsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Analytics</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Analytics</h1>
      <p className="text-gray-600 mb-8">
        The Analytics Dashboard summarises your trips, clients and revenue for a period you choose. Open it from <strong>Home &rsaquo; Analytics</strong>. Owners, admins and managers can see it; agents and viewers do not have it in their menu and cannot open the page.
      </p>

      {/* Date Range */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Choosing a period</h2>
        <p className="text-gray-600 mb-3">
          The buttons at the top right set the period: <strong>Last 7 Days</strong>, <strong>Last 30 Days</strong> (the default), <strong>Last 90 Days</strong> or <strong>Last Year</strong> (365 days). Each is a rolling window ending now.
        </p>
        <p className="text-gray-600 mb-3">
          A trip belongs to the period when it was <em>created</em> in it, not when it travels. Clients are counted the same way, by the date they were added.
        </p>
        <p className="text-gray-600">
          If the figures cannot be loaded, the page shows a red &ldquo;Analytics could not be loaded&rdquo; message with a <strong>Try again</strong> button instead of the dashboard. It never shows zeros in place of a failed load.
        </p>
      </section>

      {/* Currency */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Currency</h2>
        <p className="text-gray-600 mb-3">
          All money is shown in your company&rsquo;s billing currency. Trips priced in another currency are converted at the exchange rate on file for the trip&rsquo;s start date, the same way Financial Reports does it.
        </p>
        <p className="text-gray-600">
          Only confirmed and completed trips are converted, because only they count as revenue. If a confirmed or completed trip in the period has no exchange rate on file, it is left out of every money figure and an amber banner lists it (&ldquo;1 trip is not included in these figures&rdquo;). The trip is still counted as a booking.
        </p>
      </section>

      {/* KPI cards */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The four headline cards</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Total Revenue</strong> &mdash; The total price of confirmed and completed trips created in the period. The percentage beside it compares this with the period of the same length just before it. When that earlier period had no revenue, it shows a dash (&mdash;) instead of a percentage. The small line underneath shows the last five weeks of the Revenue Trend chart.</li>
          <li><strong>Total Bookings</strong> &mdash; Every trip created in the period, whatever its status, with how many are confirmed and how many are pending.</li>
          <li><strong>Total Clients</strong> &mdash; Clients added in the period. <em>New</em> counts those with the status Lead or Prospect; <em>returning</em> counts those with the status Customer. The bar shows returning clients as a share of the total.</li>
          <li><strong>Conversion Rate</strong> &mdash; Confirmed plus completed trips, divided by all trips created in the period. <em>Avg deal</em> is Total Revenue divided by the number of confirmed and completed trips that could be converted into your currency.</li>
        </ul>
      </section>

      {/* Pipeline */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Booking Pipeline</h2>
        <p className="text-gray-600 mb-3">
          A row of six counts. Two of them ignore the period you chose:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Leads</strong> &mdash; All clients whose status is Lead right now, however long ago they were added.</li>
          <li><strong>Follow-ups</strong> &mdash; All client follow-ups still marked pending right now.</li>
          <li><strong>Pending</strong> &mdash; Trips created in the period that are Draft or Sent.</li>
          <li><strong>Cancelled</strong>, <strong>Confirmed</strong>, <strong>Completed</strong> &mdash; Trips created in the period with that status.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Pending, Cancelled, Confirmed and Completed always add up to Total Bookings. The panel carries a note saying that Leads and Follow-ups are all-time totals.
        </p>
      </section>

      {/* Highlights */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Highlights for this period</h2>
        <p className="text-gray-600">
          Four tiles for the selected period: <strong>New clients</strong>, <strong>Pending bookings</strong>, <strong>Avg deal size</strong> and <strong>Top destination</strong> (the city on the most trips; N/A when no trip lists a city). They repeat figures from the cards and charts above.
        </p>
      </section>

      {/* Charts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Charts</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Revenue Trend</strong> &mdash; One point per week for every week in the period, including weeks with no revenue. Each point is labelled with the date its week starts (Monday, in UTC). The points add up to Total Revenue. The note under the chart names the week with the most revenue.</li>
          <li><strong>Top Destinations</strong> &mdash; Up to five cities with the most trips created in the period, taken from the destinations on each trip. A trip with several cities counts once for each. The dropdown narrows the chart to one city.</li>
          <li><strong>Booking Status</strong> &mdash; A pie of Confirmed, Completed, Pending and Cancelled trips, with the count and share of each. The slices add up to Total Bookings.</li>
          <li><strong>Revenue by Destination</strong> &mdash; The same five cities with the revenue of their confirmed and completed trips. A trip with several cities adds its full price to each of them.</li>
        </ul>
        <Tip>
          Draft, sent and cancelled trips count as bookings but never as revenue. A trip only adds to Total Revenue once it is Confirmed or Completed.
        </Tip>
      </section>

      {/* Quick actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <p className="text-gray-600">
          Links at the bottom of the page open Itineraries, the Calendar, Clients and Follow-ups.
        </p>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not let you pick custom dates; only the four rolling periods are available.</li>
          <li>It does not group trips by travel date. Everything is by creation date.</li>
          <li>It does not measure team members or sales channels.</li>
          <li>It does not count seeded demo trips.</li>
          <li>It does not include a trip in any money figure when its exchange rate is missing; it lists it instead.</li>
          <li>It does not export data.</li>
        </ul>
      </section>
    </div>
  )
}
