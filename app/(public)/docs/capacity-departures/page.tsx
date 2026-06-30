import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function CapacityDeparturesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Capacity &amp; Departures</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Capacity &amp; Departures</h1>
      <p className="text-gray-600 mb-8">
        Define how much your operation can handle and which tours run on which dates. The system turns that into live availability &mdash; used by your team, by resource assignment, and by the WhatsApp AI agent &mdash; so you never promise dates you can&apos;t deliver or overbook a departure.
      </p>

      {/* Operator Capacity */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Operator Capacity</h2>
        <p className="text-gray-600 mb-3">
          Capacity is set per calendar date and measured in <strong>groups</strong> &mdash; how many tours your operation can run at once on that day. Each day records:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Max groups</strong> &mdash; The ceiling for that date</li>
          <li><strong>Booked groups</strong> &mdash; How many are already committed</li>
          <li><strong>Status</strong> &mdash; Available, Limited, Busy, or Blackout</li>
          <li><strong>Reason / notes</strong> &mdash; Context, for example a blackout reason</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Dates with no entry default to available, so you only need to mark the days that differ &mdash; peak periods, holidays, or days you are not operating.
        </p>
        <ScreenshotPlaceholder caption="Capacity calendar showing per-day status and group counts" />
      </section>

      {/* Scheduled Departures */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Scheduled Departures</h2>
        <p className="text-gray-600 mb-3">
          A departure is a specific run of a tour on a specific date, ideal for group or fixed&#8209;date selling. You can create one from a tour template or from scratch, and each carries:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Tour &amp; dates</strong> &mdash; Linked template, start date, and an end date derived from the tour duration</li>
          <li><strong>Seats</strong> &mdash; Max pax, booked pax, and a minimum pax to run</li>
          <li><strong>Status</strong> &mdash; Draft, Open, Limited, Full, Guaranteed, or Cancelled</li>
          <li><strong>Booking cutoff</strong> &mdash; Days before departure when bookings close</li>
          <li><strong>Pricing</strong> &mdash; Price per person and currency, plus public and internal notes</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Departures can be flagged <strong>guaranteed</strong> once they pass the minimum, giving travellers confidence the date will run.
        </p>
      </section>

      {/* Live Availability */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Live Availability</h2>
        <p className="text-gray-600 mb-3">
          The system computes availability on the fly rather than relying on a stale flag. For a requested date range and group size it inspects each day and returns a single verdict with a clear, customer&#8209;ready message:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Blackout</strong> &mdash; Not operating on one or more dates; offers to check alternatives</li>
          <li><strong>Busy</strong> &mdash; Fully booked for the requested group size</li>
          <li><strong>Limited</strong> &mdash; Bookable, but tight &mdash; encourages booking soon</li>
          <li><strong>Available</strong> &mdash; Dates work on your end</li>
        </ul>
        <p className="text-gray-600 mt-3">
          For departures, available spots are computed as max pax minus booked pax, and a departure is only marked bookable when it has enough spots for the party <strong>and</strong> the request is before the booking cutoff.
        </p>
      </section>

      {/* WhatsApp AI Agent & Resource Assignment */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Used by the AI Agent &amp; Resource Assignment</h2>
        <p className="text-gray-600 mb-3">
          Availability is not just a screen for your team &mdash; it feeds automated workflows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>WhatsApp AI agent</strong> &mdash; When a customer asks about dates, the agent checks live capacity and departures and replies accurately, suggesting alternatives or a private tour when a date is full, so it never confirms something you cannot deliver.</li>
          <li><strong>Resource assignment</strong> &mdash; Booked counts feed back into capacity, so the system reflects real load and helps avoid double&#8209;booking guides and vehicles.</li>
        </ul>
        <Tip>
          <strong>No overbooking by design:</strong> Because the AI agent reads the same live numbers your operations team does, its availability answers stay in sync &mdash; busy and blackout dates are surfaced before a booking is ever confirmed.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/quote-revisions" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Quote Revisions
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
