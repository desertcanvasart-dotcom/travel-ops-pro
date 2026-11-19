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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How transport is priced by zone</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>The pickup area</strong> &mdash; a transfer or day tour is priced for the area of the guests&apos; hotel in that city: the hotel they arrive at that night, or the one they slept in. With no hotel night in the city, the city&apos;s default area.</li>
          <li>A rate answers only its own area. A rate with no area, or set to the default area, is the city&apos;s rate. A West Bank hotel uses the West Bank rate; with no West Bank rate the day is <strong>a gap that names the area</strong> (&ldquo;&hellip; for Luxor for West Bank hotels&rdquo;), never the city price.</li>
          <li><strong>Sights</strong> &mdash; when rates list the sights they cover, the smallest rate that covers <em>every</em> sight of the day is used (Karnak alone &rarr; East Bank; Karnak and the Valley of the Kings &rarr; both banks). Several equally small: the starred one, else the cheapest with a warning; several transport companies and none starred is a gap. When no listing rate covers the day, a rate that lists no sights is used; with none of those either, a gap names the sights.</li>
          <li>The quote, the per-group prices and the transport preview all use the same rule.</li>
        </ul>
      </section>
    </div>
  )
}
