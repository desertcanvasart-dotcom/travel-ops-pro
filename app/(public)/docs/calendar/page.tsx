import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

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
        The Calendar gives you a visual overview of every booking by date. It plots your itineraries across the month, flags resource conflicts, and lets you reschedule a trip simply by dragging it to a new day.
      </p>

      {/* Views */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Three Views</h2>
        <p className="text-gray-600 mb-3">
          Switch between views using the toggle in the top-right of the controls bar:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Month</strong> &mdash; A full grid with each day showing its bookings; days with more than three trips show a <strong>+N more</strong> link that opens a day detail panel</li>
          <li><strong>Week</strong> &mdash; Seven day columns with the full booking card for each trip running that day</li>
          <li><strong>Timeline</strong> &mdash; A horizontal Gantt-style bar per booking, showing duration and span across the date range</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Use the <strong>arrows</strong> and <strong>Today</strong> button to navigate months. Each booking is color-coded by payment status &mdash; not paid, deposit received, partially paid, paid, and completed.
        </p>
        <ScreenshotPlaceholder caption="Month view with color-coded bookings and the view toggle" />
      </section>

      {/* Drag to reschedule */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Drag to Reschedule</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>In Month view, grab any booking card and drag it onto a new day</li>
          <li>A confirmation modal shows the <strong>current dates</strong> and the proposed <strong>new dates</strong></li>
          <li>Confirm to move the trip &mdash; the original duration is preserved, so the end date shifts with the start</li>
        </ol>
        <Tip>
          You cannot drop a booking onto a past date. Past days are disabled, and the move is blocked with a warning.
        </Tip>
      </section>

      {/* Conflicts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Conflict Detection</h2>
        <p className="text-gray-600 mb-3">
          The calendar automatically scans for overlapping bookings and groups conflicts into three kinds:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Guide Conflicts</strong> &mdash; The same guide assigned to two overlapping trips</li>
          <li><strong>Vehicle Conflicts</strong> &mdash; The same vehicle double-booked across overlapping dates</li>
          <li><strong>Date Overlaps</strong> &mdash; Two trips share dates with no shared resource</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Conflicting bookings get an orange ring, and the <strong>conflicts</strong> badge on the Upcoming stat card opens a detail panel listing every clash with links to both itineraries.
        </p>
        <ScreenshotPlaceholder caption="Conflict panel grouped by guide, vehicle, and date overlap" />
      </section>

      {/* Filters & export */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Filters, Stats &amp; Export</h2>
        <p className="text-gray-600 mb-3">
          The stats panel summarizes total bookings, revenue, travelers, and upcoming trips, with a payment-status breakdown. Open <strong>Filters</strong> to narrow the calendar by:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Search</strong> &mdash; Client name, itinerary code, destination, guide, or vehicle</li>
          <li><strong>Guide &amp; Vehicle</strong> &mdash; Filter to a specific resource or unassigned trips</li>
          <li><strong>Payment Status</strong> &mdash; Multi-select one or more statuses</li>
          <li><strong>Date range</strong> &mdash; From and to dates</li>
          <li><strong>Show conflicts only</strong> and <strong>Hide completed</strong> toggles</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Click <strong>Export</strong> to download the currently filtered bookings as a CSV.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/tasks" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Tasks
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
