import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip, DocScreenshot } from '../layout'

export default function ToursRatesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tours &amp; Rates</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Tours &amp; Rates</h1>

      {/* Tour Templates */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tour Templates</h2>
        <p className="text-gray-600 mb-4">
          Pre-built tour packages you can use as starting points for itineraries.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Browsing Tours</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to <strong>Tours</strong> in the sidebar</li>
          <li>Browse available packages by destination, duration, or category</li>
          <li>Click a tour to see the full details</li>
        </ol>
        <DocScreenshot src="/docs/tours-rates/tours-list.jpg" alt="Tours list page showing tour cards with destination, duration, and pricing" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Detail Page</h3>
        <p className="text-gray-600 mb-3">Each tour shows:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Description</strong> and key <strong>highlights</strong></li>
          <li><strong>Day-by-day itinerary</strong> with cities, activities, and meals</li>
          <li><strong>What&apos;s included</strong> and <strong>what&apos;s not included</strong></li>
          <li><strong>Pricing calculator</strong> &mdash; enter the number of travelers and passport type for an instant price</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Tiers</h3>
        <p className="text-gray-600 mb-3">Most tours come in multiple tiers:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Budget</strong> &mdash; Basic accommodation and services</li>
          <li><strong>Standard</strong> &mdash; Mid-range quality</li>
          <li><strong>Deluxe</strong> &mdash; Premium options</li>
          <li><strong>Luxury</strong> &mdash; Top-tier everything</li>
        </ul>
        <ScreenshotPlaceholder caption="Tour detail page with tier selection, pricing calculator, and day-by-day breakdown" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Managing Tour Templates</h3>
        <p className="text-gray-600 mb-3">
          Go to <strong>Tours &gt; Manage</strong> (admin/manager only) to:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Create new tour templates</li>
          <li>Edit existing tours</li>
          <li>Add/modify variations and pricing</li>
          <li>Set up daily itinerary details</li>
          <li>Auto-price tours from your rates database</li>
        </ul>
      </section>

      {/* Rates Management */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rates Management</h2>
        <p className="text-gray-600 mb-4">
          Manage all your pricing in one place. Go to <strong>Rates</strong> in the sidebar.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Rate Categories</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Category</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What It Covers</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Hotels</td><td className="px-4 py-2.5">Per person per night, in up to six dated periods, with EU and non-EU prices and your supplements, filed by city and tier</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Transportation</td><td className="px-4 py-2.5">Vehicle rates by type, service type, and group size</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Guides</td><td className="px-4 py-2.5">Daily and hourly rates by language and grade (e.g. Egyptologist, senior), plus a &ldquo;throughout&rdquo; guide who accompanies the whole trip</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Entrance Fees</td><td className="px-4 py-2.5">Attraction tickets with EU and non-EU prices</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Meals</td><td className="px-4 py-2.5">Lunch and dinner rates by quality tier</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Activities</td><td className="px-4 py-2.5">Optional activities and excursions</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Nile Cruises</td><td className="px-4 py-2.5">One row per ship, sailing and cabin type; per person per night in up to six dated periods, EU and non-EU</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Airport Services</td><td className="px-4 py-2.5">Meet &amp; greet, VIP lounge, etc.</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Sleeping Trains</td><td className="px-4 py-2.5">One-way fare per cabin (Half Twin, Single) for each train, route and validity window; one price for every passport</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Hotel Services</td><td className="px-4 py-2.5">The Hotel Assistants screen: check-in, check-out, porter and full-service assistance by hotel category and destination; one price for every passport</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Flights</td><td className="px-4 py-2.5">Domestic flight rates</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Tipping</td><td className="px-4 py-2.5">Recommended tipping rates by service type</td></tr>
            </tbody>
          </table>
        </div>
        <DocScreenshot src="/docs/tours-rates/rates-hub.jpg" alt="Rates hub showing rate category cards with counts and quick access links" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding or Editing a Rate</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to the relevant rate category</li>
          <li>Click the add button (<strong>Add Rate</strong> on Hotels, Sleeping Trains and Hotel Services; <strong>Add Cruise</strong> on Nile Cruises), or the pencil on an existing rate</li>
          <li>Fill in the details (prices, descriptions, supplier info)</li>
          <li>Click <strong>Create Rate</strong> or <strong>Update Rate</strong></li>
        </ol>
        <Tip>
          Rates are used by the auto-pricing engine when you build itineraries in <strong>Auto</strong> cost mode. Keep them up to date for accurate quotes.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">EU vs Non-EU Pricing</h3>
        <p className="text-gray-600 mb-6">
          Many rates have different prices for European passport holders and everyone else. Hotels
          and Nile cruises carry both prices in every dated period. Sleeping trains and hotel
          services carry one price for everybody.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Accommodation: hotels, ships, sleeper trains and hotel assistants</h3>
        <p className="text-gray-600 mb-3">
          Menu: <strong>Suppliers &amp; Rates › Accommodation</strong>, then <strong>Hotels</strong>,{' '}
          <strong>Nile Cruises</strong>, <strong>Sleeping Trains</strong> or <strong>Hotel Services</strong>.
          Admins and managers see these screens (the owner always does). The Hotels, Nile Cruises and
          Hotel Services data, including their spreadsheets, is for managers and above, reads included.
          Agents can read sleeping-train rates, because the trip day editor&apos;s travel-leg picker lists
          them; only managers can change them. Each company sees and prices only its own rates,
          suppliers, hotels and ships: a supplier, hotel or ship of another company is refused on save.
        </p>

        <h4 className="font-medium text-gray-900 mt-4 mb-2">Hotels (&ldquo;Hotel Rates&rdquo;)</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Header: <strong>Hotel Companies</strong> (opens the hotel suppliers), the property spreadsheet, the periods spreadsheet, and <strong>Add Rate</strong>.</li>
          <li>Cards: Total Rates, Active, Linked (rows with a supplier), Avg. PP double (all periods; one figure per currency, priced rows only) and Cities.</li>
          <li>The form: hotel company (or &ldquo;No supplier / Direct booking&rdquo;), Service Code (made as <code>ACC-&lt;CITY&gt;-…</code> when blank), Hotel Name (one of that company&apos;s hotels, or a new one created under it on save; a hotel of another hotel company is never linked), City, Property type, Board basis, Rate currency, contacts, Tier, Rate periods, Rate Card Validity, Notes and Active.</li>
          <li>All amounts are per person per night: the price in a double, the single supplement, and the triple reduction off the double.</li>
          <li><strong>Duplicate</strong> (copy icon) opens a new rate pre-filled. It saves when the hotel name, city, tier, board basis, hotel company or Rate Card Validity differs from every existing rate; otherwise the save is refused and names that key.</li>
          <li>A rate with no tier (from an old spreadsheet import) shows <strong>No tier</strong> and is never picked automatically until it is given one.</li>
        </ul>

        <h4 className="font-medium text-gray-900 mt-4 mb-2">How a hotel night is priced</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The night is priced at the period that contains its date. A date in no period is an unpriced hole. With no travel date the first period is used.</li>
          <li>Automatic pick: active hotels in the city at the quoted tier. With a travel date, a rate whose <strong>Rate Card Validity</strong> covers the date and which has a period covering it comes first; then one whose validity covers it; then the rest. Within each group the newest wins. An expired rate card is used only when nothing else is there. A blank Valid From or Valid To is open on that side.</li>
          <li>A hotel chosen on the programme day always wins, even at another tier or city, and the price line says so.</li>
          <li>Throughout guide: the period&apos;s <strong>Guide bed / night</strong>. Blank means not given, and the bed is flagged as unpriced. 0 means the hotel gives it free, and it is priced as a 0 line.</li>
        </ul>

        <h4 className="font-medium text-gray-900 mt-4 mb-2">Nile Cruises (&ldquo;Cruise Rates&rdquo;)</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>One row per ship, sailing and cabin type: Supplier, Ship (one of the supplier&apos;s ships, or a new one), Ship Category, Embarkation and Disembarkation City (the route name is made from them), Sailing days (empty = any day), Duration (Nights), Cabin Type, Tier, Preferred Cruise, Rate currency, Rate periods, Rate Card Validity, Cruise Code (made as <code>CRUISE-&lt;SHIP&gt;-&lt;N&gt;N-&lt;CAB&gt;</code> when blank), Sightseeing Included, Active and Notes.</li>
          <li>Each period takes PP Dbl, Sgl Supp and Tpl Red per person per night, EU and non-EU, and the guide&apos;s bed (blank = unpriced, 0 = free). They are stored as cabin rates: single = double + supplement, triple = double − reduction (0 = no triple cabin). A suite is priced as its own row with Cabin Type Suite.</li>
          <li>A second rate for the same ship, cabin type, route, nights, supplier and Rate Card Validity is refused and names that key. A Cruise Code already in use is refused with that reason.</li>
          <li>Automatic pick: active ships at the tier, narrowed to the embarkation port when one matches. Sailings as long as the programme&apos;s cruise come first; within them, a rate card valid on the sailing date first, then Preferred, then newest. Cost: the double rate × nights per person; a single pays the single − double gap per night.</li>
        </ul>

        <h4 className="font-medium text-gray-900 mt-4 mb-2">Sleeping Trains (&ldquo;Sleeping Train Rates&rdquo;)</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Fields: Supplier (the operator name is taken from it), Train (one of the supplier&apos;s trains), Origin, Destination, Cabin Type (Half Twin or Single), One-Way Rate, Guide fare (blank = the guide pays the customer fare; 0 = free), Roundtrip Rate (reference only, not used in pricing), departure and arrival times, Season (a label only), Valid From and Valid To, Notes and Active.</li>
          <li>Valid To may not be before Valid From. A rate prices only dates inside its window, both ends included.</li>
          <li>One train is a Half Twin row and a Single row for the same route, supplier, train and validity. Sharing travellers pay the Half Twin fare as that night&apos;s bed; a solo traveller pays the Single gap; the throughout guide takes the Single (or its guide fare).</li>
          <li>When more than one train serves the route on the date, the leg is a hole until the exact train is picked on the day.</li>
          <li><strong>Show All</strong> lists switched-off rates too; the cards (Total Rates, Active, Avg. One-way per currency, Routes) count every rate.</li>
        </ul>

        <h4 className="font-medium text-gray-900 mt-4 mb-2">Hotel Services (&ldquo;Hotel Assistants&rdquo;)</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Fields: Supplier, Service Type (Porter, Check-in Assist, Check-out Assist, Full Service, Concierge), Hotel Category (Budget, Standard, Deluxe, Luxury, All), Rate Destination (blank = all destinations), Rate (one price for every passport; blank = not priced), Pricing basis (per group, per person, or per unit with people per unit), Rate currency, Description, Notes and Active.</li>
          <li>A hotel check-in is charged as Check-in Assist, else Full Service. A check-out is charged as Check-out Assist, else Porter, else Full Service. Boarding and leaving a ship use the same check-in and check-out rates.</li>
          <li>Which row: one for the hotel&apos;s city first, then one for all destinations (a row for another city never prices it). Then the quote&apos;s category: Budget, Standard or Luxury; a Deluxe quote reads Deluxe, then Standard. Then an All row. The oldest matching row wins a tie.</li>
          <li>Concierge rows are never added automatically; pick them in the Pricing Grid, which lists every row with its destination.</li>
        </ul>

        <h4 className="font-medium text-gray-900 mt-4 mb-2">Deleting</h4>
        <p className="text-gray-600 mb-3">
          A hotel, ship, sleeper or hotel-service rate that a tour day, a programme day or a Pricing
          Grid line still uses cannot be deleted: the delete is refused and says what uses it. Untick
          <strong> Active</strong> instead. A bulk delete deletes the others and shows the reasons for
          the ones it could not delete.
        </p>

        <h4 className="font-medium text-gray-900 mt-4 mb-2">What it does not do</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-6">
          <li>It does not stop you saving overlapping periods or gaps between periods; the editor only warns.</li>
          <li>It does not price a sleeping train&apos;s round-trip fare or use its Season label.</li>
          <li>It does not drop an expired hotel or ship rate card from the automatic pick when it is the only one; it only ranks it last.</li>
          <li>The day editor&apos;s property list has no travel date, so it is not ranked by Rate Card Validity; the quote&apos;s automatic pick is.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Importing rates from a spreadsheet</h3>
        <p className="text-gray-600 mb-3">
          Each rate category has its own CSV import, so you can load a whole contract at once
          instead of typing rows. Every rate sheet carries a <strong>supplier code</strong> column,
          so each rate attaches to the right supplier &mdash; and a rate whose code is not yet in
          this install is reported and skipped rather than guessed. See{' '}
          <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>{' '}
          for the shared rules and <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>{' '}
          for why the code matters.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Labels in your own words</h3>
        <p className="text-gray-600">
          The category names you rate against &mdash; and the wording throughout the hub &mdash;
          follow your <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link>.
          If your team calls a guide a &ldquo;lecturer&rdquo; or a tour a &ldquo;programme&rdquo;,
          relabel it once and the Rates Hub reads in your words.
        </p>
      </section>
    </div>
  )
}
