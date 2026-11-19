import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default function ZonesDocPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Zones</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Zones</h1>
      <p className="text-gray-600 mb-4">
        <strong>Zones</strong> are the parts of a city that change a transfer&apos;s price: Luxor&apos;s East Bank and
        West Bank, Cairo&apos;s Downtown and 6th of October. Each city has its own list, and one zone in each city is
        its <strong>default</strong>: where a hotel or a transport rate with no zone belongs. Open it from{' '}
        <strong>Home &rsaquo; Settings &rsaquo; Zones</strong> (in Catalog).
      </p>
      <p className="text-gray-600 mb-8">
        The menu shows it to the owner, admins and managers. Only the owner and admins of the company you are working
        in can change zones; a manager sees them read-only. Each company has its own zones, and nothing is filled in
        for you.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working with zones</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Add</strong> &mdash; choose a city from your <Link href="/docs/destinations" className="text-primary-600 hover:underline">Destinations</Link> and type the zone&apos;s name. The first zone of a city becomes its default.</li>
          <li><strong>Rename</strong> &mdash; the name changes; what points at the zone keeps pointing at it.</li>
          <li><strong>Make default</strong> &mdash; one default per city; making another zone the default moves it.</li>
          <li><strong>Move up / down</strong> &mdash; the order the zones are offered in.</li>
          <li><strong>Delete</strong> &mdash; a city&apos;s default can only be deleted once it is the city&apos;s last zone: make another zone the default first.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What zones do today</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Hotels</strong> &mdash; in <strong>Rates &rsaquo; Hotels</strong>, a hotel in a city with zones has an <strong>Area</strong>, and must be given one when it is saved. Changing the city clears it. The list shows each hotel&apos;s area under its city, and <strong>No area yet</strong> in amber (with a filter of that name) for hotels still to do. When a hotel has several rates in the same city, saving one moves the others to the same area. The hotel spreadsheet has a <strong>Zone</strong> column (the area&apos;s name or key; a blank cell keeps what is stored; another city&apos;s area is refused with the row number).</li>
          <li>A zone hotels are in cannot be deleted: the message names the hotels to move first.</li>
        </ul>
        <p className="text-gray-600">
          Nothing changes a price yet. Next, transport rates get a pickup zone, and then automatic pricing uses the
          hotel&apos;s zone to choose the transport rate.
        </p>
      </section>
    </div>
  )
}
