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
        <strong>Tours &rarr; Tour Inventory</strong> (the ready-made packages) is the read-and-price view of your tour catalogue. The page heading reads <strong>Ready Made Packages</strong>, with the subtitle &ldquo;Browse available tours and pricing&rdquo;. It lists your company&apos;s active tours with a stored &ldquo;Starting from&rdquo; price, and each tour opens a detail page with the day-by-day programme, a live price calculator and a <strong>Quote this tour</strong> button. You build and edit tours in <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Manager</Link>.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The menu item and the pages (<code>/tours</code> and <code>/tours/&lt;code&gt;</code>) are open to the owner, Administrators, Managers and Agents. Viewers do not see the Tours menu and cannot open the pages</li>
          <li>Only the owner, Administrators and Managers see <strong>Refresh prices</strong>, <strong>Manage Tours</strong>, <strong>Create a new tour &rarr;</strong>, the delete buttons, the price breakdown (costs and margin) and the button that creates a language version</li>
          <li>Agents see the catalogue, the tour pages, the selling price and <strong>Quote this tour</strong></li>
        </ul>
        <p className="text-gray-700 mt-3">
          Everything is within your own company: another company&apos;s tour code or id shows <strong>Tour Not Found</strong>. Roles are explained in <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Browsing the Catalogue</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Tour Packages</strong>: how many active tours you have (every page of the catalogue is counted, not just the first)</li>
          <li><strong>With Auto-Pricing</strong>: tours priced by the engine from the day builder</li>
          <li><strong>Categories</strong>: how many different themes the tours carry. Shown only when at least one tour has a theme</li>
          <li><strong>Starting From</strong>: the lowest stored price among the tours. Shown only when at least one tour has a price</li>
          <li><strong>Search</strong> (&ldquo;Search by name, description, or city...&rdquo;) matches the name, short description or a city. <strong>All Tiers</strong> keeps tours with an active variation at that tier; <strong>All Categories</strong> filters by theme; <strong>Clear Filters</strong> resets them</li>
          <li>Switch between <strong>Grid</strong>, <strong>List</strong> and <strong>Table</strong> views</li>
        </ul>
        <p className="text-gray-700 mt-3">
          Each tour shows its name, a star if featured (featured tours come first, then the newest), its tier badges or <strong>No variations yet</strong>, its days, the passenger range of its active variations (1&ndash;15 when it has none), its theme, an <strong>Auto-Pricing</strong> mark, &ldquo;Starting from &hellip; per person&rdquo; with the tier, its code, language flags, the number of variations and <strong>View Details</strong>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The &ldquo;Starting from&rdquo; Price</h2>
        <p className="text-gray-700 mb-3">
          The list never prices anything while it loads: it shows a selling price stored on each tour, converted to your display currency. It is worked out as:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>for 2 travellers, on a European passport, with no travel date (so no season premium)</li>
          <li>at your company&apos;s default margin (25% if none is set), in your rate currency, with the first guide language in your list that has a guide rate</li>
          <li>for every tier on your tier ladder; the cheapest tier the engine priced <em>completely</em> wins, rounded to a whole amount. A tier with any missing rate is skipped</li>
          <li>only for auto-priced tours. If no tier is complete, an older authored price for the tour&apos;s active variations is used instead, but only one whose passenger band covers 2 travellers, that has not expired, and that can be converted into your rate currency. Otherwise the card shows <strong>N/A</strong></li>
        </ul>
        <p className="text-gray-700 mt-3 mb-3">
          The stored price changes when someone clicks <strong>Refresh prices</strong>, when the nightly job runs, or when a tour&apos;s itinerary is saved from the B2B calculator. To refresh by hand (owner, Administrators and Managers):
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Refresh prices</strong>. It reads <strong>Refreshing prices&hellip;</strong> while every active tour is priced in turn</li>
          <li>A line reports, for example, &ldquo;18 of 26 tours priced&rdquo;</li>
          <li>An amber panel lists the tours with no price and what each one is missing (<strong>Show</strong> / <strong>Hide</strong>): the tier, then each day&apos;s lookup and why: <em>no rate</em>, <em>unclear match</em> or <em>rate is blank or 0</em>. A tour the engine could not price at all says &ldquo;Could not be priced&rdquo;. Under an N/A card you see how many rates are missing</li>
        </ol>
        <Tip>The missing-rates panel is not saved &mdash; it appears only right after a refresh. Add the rates under <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Rates</Link>, then refresh again.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Tour Detail Page</h2>
        <p className="text-gray-700 mb-3">
          Click <strong>View Details</strong> (or <strong>View</strong> in the table). The address can hold a variation code, a tour code or a tour id.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>A tour opens on one of its <strong>active</strong> variations: the one at your default tier (what &ldquo;standard&rdquo; means on your tier ladder), otherwise the lowest tier on the ladder. There is no variation switcher</li>
          <li>A withdrawn (inactive) variation or tour opened by its address says &ldquo;This tour is no longer offered&rdquo; and is not priced</li>
          <li>A tour with no active variations opens from the tour itself: Private, 1&ndash;15 travellers, English guide, priced at your default tier</li>
        </ul>
        <p className="text-gray-700 mt-3">
          The header shows the name, &ldquo;cities &bull; N days&rdquo;, <strong>Quote this tour</strong>, <strong>Itinerary Doc (日程表)</strong> (only when your company has that document set up), the tier and Private or Shared. Below are tiles for <strong>Duration</strong>, <strong>Group Size</strong> (min&ndash;max pax), <strong>Category</strong>, <strong>Languages</strong> (the variation&apos;s guide languages) and <strong>From</strong> (the calculator&apos;s current price per person), then <strong>About This Tour</strong>, <strong>Highlights</strong>, the <strong>Daily Itinerary</strong> (click a day to expand it; meals and cruise days are marked), <strong>What&apos;s Included</strong>, <strong>Not Included</strong>, <strong>Optional Extras</strong>, <strong>Tour Information</strong> and <strong>Need Help?</strong> with your company&apos;s contact details.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Calculate Your Price</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Number of Travelers</strong>: from the variation&apos;s minimum group size to its maximum. Fewer than the minimum cannot be priced</li>
          <li><strong>Travel Date</strong>: starts two weeks from today; earlier dates are blocked</li>
          <li><strong>Passport Type</strong>: European or Non-European &mdash; it &ldquo;Affects entrance fees at some sites&rdquo;</li>
          <li><strong>Guide language</strong></li>
        </ol>
        <p className="text-gray-700 mt-3">
          The price recalculates shortly after each change. <strong>Price per person</strong> and <strong>Total for N people</strong> are <em>selling prices</em>: cost plus your company&apos;s default margin (25% if none is set) &mdash; the same margin rule as the &ldquo;Starting from&rdquo; card and the B2B calculator. A date inside a seasonal window adds a badge such as &ldquo;Peak +15%&rdquo;; that premium is already in the price. A red line &ldquo;N services have no rate &mdash; this price is incomplete&rdquo; means some services were priced at 0.
        </p>
        <p className="text-gray-700 mt-3">
          The owner, Administrators and Managers also see <strong>View Price Breakdown</strong>: the services day by day at cost, with <strong>No rate</strong> and <strong>Included</strong> tags, the <strong>Net cost</strong>, the <strong>Margin</strong> and its percentage, and <strong>Available Add-ons</strong> (optional services at cost, not added to the price).
        </p>
        <Tip>The card and this page can differ for the same 2 travellers: the card uses the cheapest complete tier and no travel date, while this page prices the variation shown at the date you pick (with any season premium). Seasonal windows are set in <Link href="/docs/seasonal-premiums" className="text-primary-600 hover:underline">Seasonal Premiums</Link>.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quote this tour</h2>
        <p className="text-gray-700">
          <strong>Quote this tour</strong> opens the variation shown in the <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B calculator</Link>, where you choose a partner, options and margin and save a quote. This is how Agents start a B2B quote. A tour with no active variation has no button &mdash; ask a Manager to add one in Tour Manager.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Languages and the 日程表</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The <strong>English</strong> and <strong>日本語</strong> tabs switch the name, descriptions, highlights and inclusions. A tour with no language versions reads as English</li>
          <li>On a language the tour has no version in, the owner, Administrators and Managers see a prompt to create one; both of its buttons machine-translate the existing content (see <Link href="/docs/multi-language" className="text-primary-600 hover:underline">Languages</Link>). Translations count toward each user&apos;s AI request limit, and if the version cannot be saved you see an error rather than &ldquo;Translation completed&rdquo;</li>
          <li><strong>Itinerary Doc (日程表)</strong> opens &ldquo;Generate 日程表&rdquo;. Every field is optional: <strong>Departure date (Day 1)</strong>, <strong>Cairo guide</strong>, <strong>Southern guide</strong>, <strong>Author (作成者)</strong> and <strong>Created (作成日)</strong> (today by default). Then choose <strong>Itinerary PDF</strong> or <strong>Print</strong></li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting a Tour</h2>
        <p className="text-gray-700">
          The owner, Administrators and Managers can hover a tour and click the bin icon (or <strong>Delete</strong> in the table), then confirm <strong>Delete tour?</strong>. This permanently removes the tour with its variations, days and language versions. B2B quotes on those variations that have no itinerary are deleted; quotes with an itinerary are kept but unlinked; partner margins set for those variations are removed. There is no undo &mdash; to hide a tour instead, set it inactive in Tour Manager.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>No editing: names, itineraries, variations and status are changed in Tour Manager</li>
          <li>Inactive tours and variations are not listed, opened or priced</li>
          <li>&ldquo;Starting from&rdquo; prices do not follow rate changes until the next refresh</li>
          <li>The detail calculator does not apply a partner, chosen options, catalogue extras or the single supplement, and cannot save a quote &mdash; use <strong>Quote this tour</strong></li>
          <li>The Daily Itinerary is not translated and not switched by the language tabs</li>
          <li>No export of the list itself (CSV export is in Tour Manager)</li>
          <li>There is no public or partner API for tours</li>
        </ul>
      </section>
    </div>
  )
}
