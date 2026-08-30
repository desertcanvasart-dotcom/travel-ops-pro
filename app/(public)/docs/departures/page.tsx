import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function DeparturesPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Departures</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Departures</h1>
      <p className="text-gray-600 mb-8">
        <strong>Operations &rarr; Departures</strong> manages scheduled group departures: a dated run of a tour that travellers book seats on. It works hand-in-hand with <Link href="/docs/capacity-departures" className="text-primary-600 hover:underline">Capacity</Link>, which enforces how much you can operate at once.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Departure</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Departure</strong></li>
          <li>Pick a <strong>tour template</strong> &mdash; or name a custom tour</li>
          <li>Set the dates (duration follows the template), <strong>min/max pax</strong>, and the per-person price</li>
          <li>Choose the starting status &mdash; <strong>Draft</strong> while you prepare, <strong>Open</strong> to start taking bookings</li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Status Lifecycle</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Meaning</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr><td className="px-3 py-2 font-medium">Draft</td><td className="px-3 py-2">Being prepared; not bookable</td></tr>
              <tr><td className="px-3 py-2 font-medium">Open</td><td className="px-3 py-2">Taking bookings; seats counted against max pax</td></tr>
              <tr><td className="px-3 py-2 font-medium">Limited</td><td className="px-3 py-2">Few seats left &mdash; a selling signal</td></tr>
              <tr><td className="px-3 py-2 font-medium">Full</td><td className="px-3 py-2">Max pax reached; no more seats</td></tr>
              <tr><td className="px-3 py-2 font-medium">Guaranteed</td><td className="px-3 py-2">Min pax met &mdash; the departure will run</td></tr>
              <tr><td className="px-3 py-2 font-medium">Cancelled</td><td className="px-3 py-2">Will not run; bookings need rehoming</td></tr>
            </tbody>
          </table>
        </div>
        <Tip>Filters across the top (Upcoming, Open, Limited, Full, Guaranteed, Cancelled) match these statuses, and each row&apos;s dropdown moves it through the lifecycle.</Tip>
      </section>
    </div>
  )
}
