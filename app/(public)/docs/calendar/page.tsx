import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function CalendarPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Calendar</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Calendar</h1>
      <p className="text-gray-600 mb-8">
        <strong>Booking Calendar</strong> (&ldquo;View and manage all your bookings &bull; Drag to reschedule&rdquo;) plots your
        company&apos;s trips by date. Open it from <strong>Sell &rsaquo; Calendar</strong>. The menu shows it to admins,
        managers and agents; the owner always sees it.
      </p>

      {/* What it shows */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it shows</h2>
        <p className="text-gray-600 mb-3">
          Every trip with a start and an end date, partner (B2B) trips included, except cancelled trips. It is built from the
          itineraries, not the bookings table: a draft or a quote is shown too, coloured as a quote.
        </p>
        <p className="text-gray-600 mb-3">Each trip is coloured by its payment state, read from its booking:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Quote (not sold)</strong> &mdash; not confirmed and no booking</li>
          <li><strong>No booking yet</strong> &mdash; confirmed or completed, but no booking</li>
          <li><strong>Not Paid</strong>, <strong>Deposit</strong>, <strong>Partial</strong>, <strong>Paid</strong>, <strong>Refunded</strong> &mdash; the booking&apos;s payment status, which recording a payment updates</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Views: <strong>Month</strong> (a grid; a busy day opens a day panel), <strong>Week</strong> and{' '}
          <strong>Timeline</strong>. A trip card shows the client, the itinerary code, the number of travellers (adults plus
          children) and the trip name.
        </p>
      </section>

      {/* Stats */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The figures</h2>
        <p className="text-gray-600 mb-3">
          The figures cover the trips on screen after filters, and count <strong>sold</strong> trips only (confirmed or
          completed, or with a booking that is not cancelled):
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Bookings</strong> &mdash; the number of sold trips</li>
          <li><strong>Total Revenue</strong> &mdash; the sum of their client totals, one figure per currency (not converted)</li>
          <li><strong>Total Travelers</strong> &mdash; their adults plus children</li>
          <li><strong>Upcoming</strong> &mdash; sold trips starting today or later, with the number of conflicts beside it</li>
          <li><strong>Payment Status Breakdown</strong> &mdash; how many trips on screen are in each payment state (quotes included)</li>
        </ul>
      </section>

      {/* Conflicts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Conflicts</h2>
        <p className="text-gray-600 mb-3">
          Two sold trips whose dates overlap are a conflict: a <strong>guide conflict</strong> when they have the same guide,
          a <strong>vehicle conflict</strong> when they have the same vehicle, otherwise a <strong>date overlap</strong>.
          Quotes and drafts never conflict. The guide or vehicle is named from your guides and vehicles lists. Conflicting
          trips get an orange ring; the conflicts badge opens a panel with links to both trips.
        </p>
      </section>

      {/* Filters */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Filters and export</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Search</strong> &mdash; client, itinerary code, trip name, guide or vehicle name</li>
          <li><strong>Filter by Guide</strong> and <strong>Filter by Vehicle</strong> &mdash; one of your active guides or vehicles, or Unassigned</li>
          <li><strong>Payment Status</strong> &mdash; one or more of the payment states above</li>
          <li><strong>From Date</strong> / <strong>To Date</strong></li>
          <li><strong>Show conflicts only</strong>, and <strong>Hide completed bookings</strong> (hides completed trips)</li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>Export</strong> downloads the trips on screen as a CSV: Code, Client, Trip, Status, Start Date, End Date,
          Travelers, Payment Status, Currency, Total Cost, Guide, Vehicle.
        </p>
      </section>

      {/* Drag */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Drag to reschedule</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-3">
          <li>In Month view, drag a trip onto another day (not a past day).</li>
          <li>Confirm the move. The trip keeps its length.</li>
          <li>
            The trip&apos;s dates, every day&apos;s date and its guide, vehicle and staff assignments all move by the same
            number of days, together.
          </li>
        </ol>
        <Tip>
          A trip that has a booking, or supplier documents, cannot be dragged: its booking dates, payment schedule, supplier
          confirmations and vouchers carry the old dates and have been given to the client and suppliers. You are told why.
          Completed trips cannot be moved either.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Revenue is not converted between currencies.</li>
          <li>It does not move a booked trip; change the dates with the client and suppliers first.</li>
          <li>It does not notify anyone when a trip is moved.</li>
          <li>Cancelled trips are not shown.</li>
        </ul>
      </section>
    </div>
  )
}
