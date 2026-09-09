import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function TourProgramsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tour Programs Manager</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Tour Programs Manager</h1>
      <p className="text-gray-600 mb-8">
        The Tour Programs Manager lets you create and manage reusable tour templates and their variations. Templates define the core itinerary, while variations represent specific versions (e.g., different hotels, budget levels, or seasonal adjustments) that feed into B2B pricing. You can build templates one at a time, or bulk-create many at once from a spreadsheet &mdash; see <strong>Bulk-creating from a CSV</strong> below.
      </p>

      {/* Concepts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Concepts</h2>
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-1">Tour Template</h3>
            <p className="text-sm text-gray-600">
              The master tour program with a name, code, duration, cities covered, theme, and a day-by-day itinerary stored as structured JSON. Example: &ldquo;4-Day Cairo &amp; Alexandria Luxury Tour&rdquo;.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-1">Tour Variation</h3>
            <p className="text-sm text-gray-600">
              A specific pricing version of a template. Each variation has its own budget tier (standard/deluxe/luxury), language, and can have custom service overrides. One template can have multiple variations.
            </p>
          </div>
        </div>
        <Tip>
          <strong>Flow:</strong> Template &rarr; Variation &rarr; B2B Pricing &rarr; Quote. The template holds the itinerary structure, the variation defines the pricing parameters.
        </Tip>
      </section>

      {/* Bulk create from CSV */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Bulk-creating from a CSV</h2>
        <p className="text-gray-600 mb-3">
          When you have many tours to load, you do not have to add them one by one. The header
          carries <strong>Sample CSV</strong>, <strong>Export</strong> and <strong>Import</strong>:
          download the sample, put one tour per row, and import.
        </p>
        <p className="text-gray-600 mb-3">
          A bulk import creates the flat metadata &mdash; code, name, type, duration, cities,
          descriptions and the featured/active flags. It does <strong>not</strong> carry the
          day-by-day itinerary, hotels or variations, which you build per tour in the editor
          afterwards. Import matches on the template code, so re-importing an existing code updates
          its metadata and never touches an itinerary you have already built.
        </p>
        <Tip>
          The same Sample &rarr; Export &rarr; Import pattern is used for suppliers and rates too.
          The shared rules &mdash; what a sheet carries, how it upserts by code &mdash; are in{' '}
          <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>.
        </Tip>
      </section>

      {/* Viewing Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing Templates</h2>
        <p className="text-gray-600 mb-3">
          Navigate to <strong>Tour Programs Manager</strong> from the sidebar. The page shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Stats Cards</strong> &mdash; Total templates, variations, active count, featured count</li>
          <li><strong>Search &amp; Filter</strong> &mdash; By name, code, city, theme, type, and active/inactive status</li>
          <li><strong>View Modes</strong> &mdash; Table view, card grid, or compact list</li>
        </ul>
        <p className="text-gray-600">
          Each template row shows: name, code, type (day tour/multi-day/stopover), duration, cities, number of variations, available languages, status, and action buttons.
        </p>
        <ScreenshotPlaceholder caption="Tour Programs Manager with template list, search bar, and filter dropdowns" />
      </section>

      {/* Creating a Template */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Template</h2>
        <p className="text-gray-600 mb-3">
          There are two ways to create a template:
        </p>
        <h3 className="text-lg font-medium text-gray-900 mb-2">1. Manual Creation</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4">
          <li>Click <strong>+ Add Template</strong></li>
          <li>Fill in: template name, tour type, duration (days/nights), cities covered, theme</li>
          <li>Add the day-by-day itinerary with activities, attractions, and services</li>
          <li>Save the template</li>
        </ol>
        <h3 className="text-lg font-medium text-gray-900 mb-2">2. AI-Generated (from WhatsApp Parser)</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Use the <strong>WhatsApp Parser</strong> in B2B mode</li>
          <li>Paste a conversation and generate the itinerary</li>
          <li>The system automatically creates both a template and its first variation</li>
          <li>Find the new template in the Tour Programs Manager</li>
        </ol>
        <ScreenshotPlaceholder caption="Template creation form with name, type, duration, and day-by-day editor" />
      </section>

      {/* Managing Variations */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Variations</h2>
        <p className="text-gray-600 mb-3">
          Click the expand arrow on any template to see its variations. Each variation shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Variation Name</strong> &mdash; e.g., &ldquo;Standard English&rdquo; or &ldquo;Deluxe Japanese&rdquo;</li>
          <li><strong>Budget Tier</strong> &mdash; Standard, Deluxe, or Luxury</li>
          <li><strong>Language</strong> &mdash; Guide language for the tour</li>
          <li><strong>Options</strong> &mdash; The upgrades and add-ons this variation sells (see below)</li>
          <li><strong>Price</strong> &mdash; Opens the B2B Price Calculator for this variation</li>
        </ul>
      </section>

      {/* Options & Upgrades */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Options &amp; Upgrades</h2>
        <p className="text-gray-600 mb-3">
          Optional extras &mdash; a balloon ride, an Abu Simbel excursion, a room upgrade &mdash; belong to a
          <strong> variation</strong>, not to the programme as a whole: a Standard private trip and a Deluxe group
          trip can sell different upgrades at different prices. Open them from
          <strong> Tours &rarr; Tour Templates</strong>, expand the programme, and click <strong>Options</strong> on
          the variation row.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Included vs optional</strong> &mdash; move a service between the two; a service in the price
            is costed like any other, an option is offered separately</li>
          <li><strong>Option price</strong> &mdash; set one and that IS the price the customer pays: options are
            priced <em>off-margin</em>, never marked up. Leave it blank and the option is priced from its cost plus
            your usual margin, like everything else</li>
        </ul>
        <Tip>
          Where an accepted option lands depends on one thing &mdash; whether the price has been agreed. Before:
          it becomes a service on the quote or itinerary. After: it is a booking extra, because the booking total
          is frozen and an extra has to move it deliberately (see <Link href="/docs/bookings" className="text-primary-600 hover:underline">Bookings</Link>).
        </Tip>
      </section>

      {/* Template Status */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Template Status</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Active</strong> &mdash; Available for pricing and quoting</li>
          <li><strong>Inactive</strong> &mdash; Hidden by default, can be toggled with the &ldquo;Show Inactive&rdquo; filter</li>
          <li><strong>Featured</strong> &mdash; Starred templates that appear first in lists</li>
        </ul>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/b2b-pricing" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          B2B Pricing
        </Link>
        <Link href="/docs/b2b-quotes" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: B2B Quotes
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
