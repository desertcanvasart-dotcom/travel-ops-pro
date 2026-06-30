import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

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
        The Analytics dashboard turns your bookings, clients, and revenue into live charts. Every figure is calculated directly from your data &mdash; itineraries, clients, leads, and follow-ups &mdash; so the numbers always reflect the current state of your business.
      </p>

      {/* Date Range */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Choosing a Date Range</h2>
        <p className="text-gray-600 mb-3">
          A range selector at the top controls the window every metric is computed over:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>7 days</strong> &mdash; The past week</li>
          <li><strong>30 days</strong> &mdash; The default view</li>
          <li><strong>90 days</strong> &mdash; The past quarter</li>
          <li><strong>1 year</strong> &mdash; The trailing twelve months</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Growth figures compare the selected window against the immediately preceding period of the same length, so you always see momentum rather than a flat total.
        </p>
        <ScreenshotPlaceholder caption="Analytics dashboard with date range selector and KPI cards" />
      </section>

      {/* Revenue & KPIs */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Revenue &amp; Key Metrics</h2>
        <p className="text-gray-600 mb-3">
          The headline cards summarise performance for the selected range:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Revenue</strong> &mdash; Sum of confirmed and completed itineraries, with period-over-period growth</li>
          <li><strong>Conversion Rate</strong> &mdash; Confirmed bookings as a share of all bookings created</li>
          <li><strong>Average Deal Size</strong> &mdash; Revenue divided by the number of won bookings</li>
          <li><strong>Revenue Trend</strong> &mdash; A line chart grouping revenue into weekly buckets across the range</li>
        </ul>
        <Tip>
          Only itineraries marked <strong>Confirmed</strong> or <strong>Completed</strong> count toward revenue. Quoted and pending deals show up in the pipeline, not the revenue total.
        </Tip>
      </section>

      {/* Bookings & Clients */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Bookings &amp; Clients</h2>
        <p className="text-gray-600 mb-3">
          Below the KPIs, breakdowns show how your work is distributed:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Booking Status</strong> &mdash; Counts of confirmed, pending/quoted, completed, and cancelled itineraries</li>
          <li><strong>Client Mix</strong> &mdash; Total clients split into new (leads &amp; prospects) and returning customers</li>
          <li><strong>Top Destinations</strong> &mdash; The five most-booked cities, ranked by bookings with revenue alongside, drawn from the cities on each itinerary</li>
        </ul>
        <ScreenshotPlaceholder caption="Booking status and top destinations breakdown charts" />
      </section>

      {/* Pipeline */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pipeline View</h2>
        <p className="text-gray-600 mb-3">
          A pipeline panel tracks deals across their lifecycle so nothing stalls unnoticed:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Leads</strong> &mdash; Clients still at the lead stage</li>
          <li><strong>Follow-ups</strong> &mdash; Pending follow-up tasks awaiting action</li>
          <li><strong>Pending</strong> &mdash; Bookings quoted but not yet confirmed</li>
          <li><strong>Confirmed</strong> and <strong>Completed</strong> &mdash; Deals that have been won and delivered</li>
        </ul>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/pricing-grid" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Pricing Grid
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
