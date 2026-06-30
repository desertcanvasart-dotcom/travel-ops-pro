import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function PricingGridPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Pricing Grid</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Pricing Grid</h1>
      <p className="text-gray-600 mb-8">
        The Pricing Grid is the single pricing engine behind Autoura. You build a tour day by day, drop services into fixed slots, and the grid prices the whole trip in real time &mdash; for one group or across a range of group sizes. The same engine powers both B2C quotes and B2B rate sheets, so the numbers always agree.
      </p>

      {/* Setting Up */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Setting Up a Quote</h2>
        <p className="text-gray-600 mb-3">
          The header bar holds the inputs that drive the whole calculation:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Pax</strong> &mdash; Group size, which divides group costs and multiplies per-person costs</li>
          <li><strong>Passport</strong> &mdash; EU or non-EU, selecting the correct rate column for fees and cruises</li>
          <li><strong>Client Type</strong> &mdash; B2C or B2B, the two shapes of the one engine</li>
          <li><strong>Tier</strong> &mdash; Budget, Standard, Deluxe, or Luxury</li>
          <li><strong>Start Date</strong> &mdash; Used for seasonal pricing on rates that vary by season</li>
          <li><strong>Margin %</strong> &mdash; Applied on top of supplier cost to get the selling price</li>
          <li><strong>Currency &amp; Exchange Rate</strong> &mdash; Convert EUR-based rates into the client&rsquo;s currency</li>
        </ul>
        <ScreenshotPlaceholder caption="Pricing grid header controls: pax, passport, tier, margin, and currency" />
      </section>

      {/* Days & Slots */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Days &amp; Service Slots</h2>
        <p className="text-gray-600 mb-3">
          Each day expands into a fixed set of service slots. Group slots are charged once and split across the group; per-person slots are multiplied by pax:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Group services</strong> &mdash; Transport, Guide, Airport Services, Hotel Services, Tipping, Boat Rides</li>
          <li><strong>Per-person services</strong> &mdash; Accommodation, Entrance Fees, Flights, Experiences, Meals, Water, Nile Cruise</li>
          <li><strong>Other</strong> &mdash; Free-form custom-amount slots for anything outside the standard list</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Most slots pull live options from your rate tables, so picking &ldquo;4&#9733; hotel&rdquo; or an entrance fee fills in the correct EUR and non-EUR rate automatically. A <strong>day type</strong> preset (arrival, tour, transfer, cruise, free, departure) sets sensible defaults for what each day needs.
        </p>
        <ScreenshotPlaceholder caption="A day row expanded into group and per-person service slots" />
      </section>

      {/* Multi-pax */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Multi-Pax Rate Sheets</h2>
        <p className="text-gray-600 mb-3">
          A single quote prices the trip for one group size. The B2B shape prices the <strong>same trip across a range of group sizes</strong> at once &mdash; the rate sheet partners expect.
        </p>
        <Tip>
          As the group grows, the engine re-selects the right vehicle tier (sedan &rarr; minivan &rarr; van &rarr; minibus &rarr; bus) for each pax count. Transport is the one cost that isn&rsquo;t linear in group size, and the grid handles it automatically.
        </Tip>
      </section>

      {/* Totals & Saving */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Totals &amp; Saving</h2>
        <p className="text-gray-600 mb-3">
          The summary panel recomputes on every change and shows cost per person, total cost, margin amount, and the selling price per person and total. Your work is kept in the browser as you go, so a refresh won&rsquo;t lose it.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Save</strong> &mdash; Persist the grid and link it to a client and tour</li>
          <li><strong>Single supplement</strong> &mdash; Summed from accommodation and cruise single rates</li>
          <li><strong>Quote</strong> &mdash; Export the priced trip as a partner-ready rate sheet</li>
        </ul>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/multi-language" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Multi-Language
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
