import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function ContentLibraryPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Content Library</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Content Library</h1>
      <p className="text-gray-600 mb-8">
        The Content Library is your reusable catalog of destinations, sites, experiences, hotels, and more. You write each item once &mdash; with rich descriptions and tiered variations &mdash; and reuse it across itineraries instead of re-typing the same content for every trip.
      </p>

      {/* Categories */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Categories</h2>
        <p className="text-gray-600 mb-3">
          Content is organized into categories, each with its own icon and a tailored set of fields:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Sites &amp; Attractions</strong> &mdash; Duration, best time to visit, accessibility, photography, ticket requirements, and nearby sites</li>
          <li><strong>Experiences &amp; Activities</strong> &mdash; Duration, activity type, difficulty, age requirements, and what to bring</li>
          <li><strong>Hotels, Restaurants, Transport, Cruises,</strong> and more</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The category sidebar shows a count for each, and you can filter content to a single category or search across them all.
        </p>
        <ScreenshotPlaceholder caption="Content Library with the category sidebar and content cards" />
      </section>

      {/* Content items */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Items</h2>
        <p className="text-gray-600 mb-3">
          Each item captures the details you reuse when building itineraries:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Name &amp; Short Description</strong> &mdash; The headline shown on the card</li>
          <li><strong>Location &amp; Duration</strong> &mdash; Where it is and how long it takes</li>
          <li><strong>Tags</strong> &mdash; Keywords for searching and grouping</li>
          <li><strong>Category-specific fields</strong> &mdash; Driven by the schema for that category</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Items can be marked active or inactive to control whether they appear when composing trips.
        </p>
      </section>

      {/* Tiers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tiered Variations</h2>
        <p className="text-gray-600 mb-3">
          Each content item can hold variations across four service tiers, so you can offer the right level for each client:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Budget</strong></li>
          <li><strong>Standard</strong></li>
          <li><strong>Deluxe</strong></li>
          <li><strong>Luxury</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">
          Each card shows how many variations exist and flags any <strong>missing tiers</strong>, so you can spot items that aren&apos;t yet complete across all four levels.
        </p>
        <Tip>
          Filling in every tier means your itinerary builder always has a matching option, whatever the client&apos;s budget.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/suppliers" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Suppliers
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
