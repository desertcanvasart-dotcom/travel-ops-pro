import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function B2CQuotesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2C Quotes</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2C Quotes</h1>
      <p className="text-gray-600 mb-8">
        A B2C quote is a priced offer wrapped around one of your itineraries, built for selling directly to the end consumer. It takes the itinerary&apos;s cost, applies your margin, and produces a clean, shareable offer with its own reference, validity, and revision history.
      </p>

      {/* What a B2C quote is */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What a B2C Quote Is</h2>
        <p className="text-gray-600 mb-3">
          B2C quotes are generated <strong>from an itinerary</strong>, which stays the source of truth for cost and client details. When you create a quote you set:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Travellers</strong> &mdash; Number of people, used to compute the per&#8209;person price</li>
          <li><strong>Margin %</strong> &mdash; Applied to the itinerary cost to set the selling price (defaults to 25%)</li>
          <li><strong>Tier</strong> &mdash; Optional offer tier label</li>
          <li><strong>Validity</strong> &mdash; How many days the offer stays valid (defaults to 30)</li>
          <li><strong>Currency</strong> &mdash; Inherited from the itinerary unless overridden</li>
          <li><strong>Notes</strong> &mdash; Separate internal notes and client&#8209;facing notes</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The system calculates margin amount, selling price, and price per person automatically, assigns a unique <strong>B2C reference number</strong>, and sets a valid&#8209;until date.
        </p>
        <ScreenshotPlaceholder caption="Create B2C quote dialog with travellers, margin, and validity" />
      </section>

      {/* B2C vs B2B */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">B2C vs B2B Quotes</h2>
        <p className="text-gray-600 mb-3">
          Both are priced snapshots, but they serve different audiences:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>B2C quotes</strong> are consumer&#8209;facing &mdash; an offer for a single traveller or party, built directly over an itinerary, sent to the end customer.</li>
          <li><strong>B2B quotes</strong> are partner&#8209;facing &mdash; pricing for tour operators, often with a full rate sheet across passenger counts.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          B2C client notes are kept separate from internal notes, so nothing private is ever exposed to the customer.
        </p>
      </section>

      {/* Sending */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending the Offer</h2>
        <p className="text-gray-600 mb-3">
          From a quote you can send the offer straight to the customer via:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Email</strong> &mdash; Delivered to the client email on the itinerary, with reference, traveller count, total, per&#8209;person price, and validity</li>
          <li><strong>WhatsApp</strong> &mdash; Sent to a provided number through the messaging integration</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Sending marks the quote as <strong>Sent</strong>, records the channel and timestamp, and adds a revision entry noting how it was sent.
        </p>
        <Tip>
          <strong>Permissions:</strong> Sending an offer requires <strong>Manager</strong> role or higher, so quotes only go out once they are reviewed.
        </Tip>
      </section>

      {/* Revisions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Revision History</h2>
        <p className="text-gray-600 mb-3">
          Like B2B quotes, every B2C quote keeps a versioned history. An initial snapshot is taken when the quote is created, and new versions are recorded as it changes. You can:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Compare</strong> any two versions to see a field&#8209;level diff &mdash; travellers, tier, total cost, margin, selling price, per&#8209;person price, currency, valid&#8209;until, and notes</li>
          <li><strong>Revert</strong> to an earlier version, with the revert itself saved as a new revision</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The quote moves through a simple lifecycle &mdash; <strong>Draft</strong> &rarr; <strong>Sent</strong> &mdash; and on to acceptance as the deal progresses.
        </p>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/capacity-departures" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Capacity &amp; Departures
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
