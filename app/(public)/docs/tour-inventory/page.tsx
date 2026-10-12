import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function TourInventoryPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tour Inventory</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Tour Inventory</h1>
      <p className="text-gray-600 mb-8">
        <strong>Tours &rarr; Tour Inventory</strong> is the read-and-price view of your tour catalogue. The page heading reads <strong>Ready Made Packages</strong>. It lists every active tour template with its tiers, group size and a cached &ldquo;Starting from&rdquo; price, and each tour opens a detail page with the day-by-day programme and a live price calculator. You build and edit tours in <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Manager</Link>; this page is where you browse and price them.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <p className="text-gray-700">
          The Tours menu is shown to the owner, Administrators and Managers. Agents and Viewers do not see it. Roles are explained in <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Browsing the Catalogue</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Stat tiles</strong> &mdash; <strong>Tour Packages</strong> (how many tours are listed) and <strong>With Auto-Pricing</strong>. <strong>Categories</strong> and <strong>Starting From</strong> (the lowest cached price) only appear once at least one tour has a theme or a price</li>
          <li><strong>Search</strong> matches the tour name, short description or a city</li>
          <li><strong>All Tiers</strong> narrows to tours that have an active variation at that tier; <strong>All Categories</strong> narrows by theme. <strong>Clear Filters</strong> resets all three</li>
          <li>Switch between <strong>Grid</strong>, <strong>List</strong> and <strong>Table</strong> views with the buttons above the results</li>
        </ul>
        <p className="text-gray-700 mt-3">
          Each tour shows its name, cities, tier badges (or <strong>No variations yet</strong>), duration, passenger range, theme, an <strong>Auto-Pricing</strong> mark, the <strong>Starting from</strong> price per person, its code, language flags and number of variations. Featured tours carry a star and are listed first.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Refreshing the &ldquo;Starting from&rdquo; Prices</h2>
        <p className="text-gray-700 mb-3">
          The list never prices anything as it loads: it shows a price stored on each tour. A tour with no stored price shows <strong>N/A</strong>. To recompute them:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Refresh prices</strong> in the header. Every active tour is priced in turn, so this can take a while</li>
          <li>A line reports how many were priced, e.g. &ldquo;18 of 26 tours priced&rdquo;</li>
          <li>Tours left without a price are listed in an amber panel (<strong>Show</strong> / <strong>Hide</strong>) with the rates each one is missing, day by day, and why: <em>no rate</em>, <em>unclear match</em>, or <em>rate is blank or 0</em>. Click a tour name to open it</li>
        </ol>
        <p className="text-gray-700 mt-3">
          The stored price is per person for 2 travellers, on a European passport, at your default margin and default guide language, for the cheapest tier the engine could price <em>completely</em>. A tier with any missing rate is skipped, so a tour with gaps shows N/A rather than a misleadingly low number. Saving a tour&apos;s itinerary from the B2B calculator also refreshes that one tour&apos;s price.
        </p>
        <Tip>The missing-rates panel is not saved &mdash; it only appears right after a refresh. Add the listed rates under <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Rates</Link>, then refresh again.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Tour Detail Page</h2>
        <p className="text-gray-700 mb-3">
          Click <strong>View Details</strong> (or <strong>View</strong> in the table) to open a tour. It shows:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Tiles for <strong>Duration</strong>, <strong>Group Size</strong>, <strong>Category</strong>, <strong>Languages</strong> and <strong>From</strong></li>
          <li><strong>About This Tour</strong> with <strong>Highlights</strong>, the <strong>Daily Itinerary</strong> (click a day to expand it; meals are marked), <strong>What&apos;s Included</strong>, <strong>Not Included</strong> and <strong>Optional Extras</strong></li>
          <li><strong>Tour Information</strong>: code, category, duration, private or shared, guide and languages</li>
        </ul>
        <p className="text-gray-700 mt-3">
          A tour with several variations opens on one of them; the page has no variation switcher. A tour with no variations still opens from its template, priced at the standard tier for 1&ndash;15 travellers.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Calculate Your Price</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Pick the <strong>Number of Travelers</strong> (up to the variation&apos;s maximum)</li>
          <li>Set the <strong>Travel Date</strong> (it starts two weeks from today; a date in a seasonal window adds a season badge and uplift)</li>
          <li>Choose <strong>European Passport</strong> or <strong>Non-European Passport</strong> under <strong>Passport Type</strong> &mdash; it changes entrance fees at some sites</li>
          <li>Choose the <strong>Guide language</strong></li>
        </ol>
        <p className="text-gray-700 mt-3">
          The price recalculates on each change and shows the <strong>Price per person</strong> and the total. <strong>View Price Breakdown</strong> lists the services day by day with a <strong>Subtotal</strong>; a service with a red <strong>No rate</strong> tag means the price is incomplete. <strong>Available Add-ons</strong> lists optional services, which are not added to the price.
        </p>
        <Tip>This calculator prices at a 0% margin, so its per-person figure is the cost price &mdash; unlike the list&apos;s &ldquo;Starting from&rdquo;, which includes your default margin. For a selling price with margin, use <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Pricing</Link>. Seasonal windows are set in <Link href="/docs/seasonal-premiums" className="text-primary-600 hover:underline">Seasonal Premiums</Link>.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Languages and the 日程表</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The <strong>English</strong> and <strong>日本語</strong> tabs switch the tour&apos;s name, descriptions, highlights and inclusions. A tab marked <em>Not created</em> offers to create that version; both of its buttons machine-translate the existing content (see <Link href="/docs/multi-language" className="text-primary-600 hover:underline">Languages</Link>)</li>
          <li>If your organisation has the daily itinerary document set up, an <strong>Itinerary Doc (日程表)</strong> button opens a dialog. Every field is optional: <strong>Departure date (Day 1)</strong>, <strong>Cairo guide</strong>, <strong>Southern guide</strong>, <strong>Author (作成者)</strong> and <strong>Created (作成日)</strong>. Then choose <strong>Itinerary PDF</strong> or <strong>Print</strong></li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tour Inventory vs Tour Manager</h2>
        <p className="text-gray-700">
          Both screens show the same tour templates. <strong>Manage Tours</strong> in the header (and <strong>Create a new tour &rarr;</strong> when nothing matches) takes you to Tour Manager, where you create templates, edit itineraries, manage variations and their options, import or export CSV, and set a tour active, inactive or featured. Tour Inventory only lists active tours and is for browsing, pricing and printing.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting a Tour</h2>
        <p className="text-gray-700">
          Hover a tour and click the bin icon (or <strong>Delete</strong> in the table), then confirm <strong>Delete tour?</strong>. This permanently removes the template with all its variations and days. Your own quotes built only on those variations are deleted too; quotes that also have an itinerary are kept but unlinked. There is no undo &mdash; to hide a tour instead, set it inactive in Tour Manager.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>No editing: names, itineraries, variations and status are changed in Tour Manager</li>
          <li>Inactive tours are not listed</li>
          <li>&ldquo;Starting from&rdquo; prices do not update on their own when rates change &mdash; click <strong>Refresh prices</strong></li>
          <li>The detail calculator does not apply a margin, a partner, or optional add-ons, and cannot save a quote</li>
          <li>The Daily Itinerary is not switched by the language tabs; it shows in the language it was written in</li>
          <li>No export or download of the list itself (CSV export lives in Tour Manager)</li>
        </ul>
      </section>
    </div>
  )
}
