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
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Hotels</td><td className="px-4 py-2.5">Room rates by city, tier, and per person</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Transportation</td><td className="px-4 py-2.5">One price per vehicle for each service (airport transfer, city tour, day tour, intercity&hellip;) in a city or on a route</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Guides</td><td className="px-4 py-2.5">Daily and hourly rates by language and grade (e.g. Egyptologist, senior), plus a &ldquo;throughout&rdquo; guide who accompanies the whole trip</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Entrance Fees</td><td className="px-4 py-2.5">Attraction tickets with EU and non-EU prices</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Meals</td><td className="px-4 py-2.5">Lunch and dinner rates by quality tier</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Activities</td><td className="px-4 py-2.5">Optional activities and excursions</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Cruises</td><td className="px-4 py-2.5">Nile cruise rates by ship and cabin type</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Airport Assistants</td><td className="px-4 py-2.5">Meet &amp; Greet, Customs Assist, Full Service and VIP Service per airport, for arrivals, departures or both</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Sleeping Trains</td><td className="px-4 py-2.5">Overnight train rates by cabin type</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Flights</td><td className="px-4 py-2.5">Per-person fares between two airports from your Airports list, domestic or international, in dated periods</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Trains</td><td className="px-4 py-2.5">Per-person day-train tickets between two cities, by class</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Tipping</td><td className="px-4 py-2.5">Recommended tipping rates by service type</td></tr>
            </tbody>
          </table>
        </div>
        <DocScreenshot src="/docs/tours-rates/rates-hub.jpg" alt="Rates hub showing rate category cards with counts and quick access links" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding or Editing a Rate</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Go to the relevant rate category</li>
          <li>Click <strong>Add New</strong> or click an existing rate to edit</li>
          <li>Fill in the details (prices, descriptions, supplier info)</li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <Tip>
          Rates are used by the auto-pricing engine when you build itineraries in <strong>Auto</strong> cost mode. Keep them up to date for accurate quotes.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">EU vs Non-EU Pricing</h3>
        <p className="text-gray-600 mb-6">
          Some rates (entrance fees, hotels, cruises) have different prices for European and non-European passport holders. Transport and tickets do not: a vehicle has one price, a flight period has one fare, and a train or airport assistance rate has one rate.
        </p>

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

      {/* Transport & Tickets */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Transport &amp; Tickets</h2>
        <p className="text-gray-600 mb-3">
          Four screens under <strong>Rates &rsaquo; Transport &amp; Tickets</strong>: <strong>Transportation</strong>,{' '}
          <strong>Flights</strong>, <strong>Trains</strong> and <strong>Airport Assistants</strong>. Overnight trains are
          under <strong>Rates &rsaquo; Accommodation &rsaquo; Sleeping Trains</strong>, because the ticket is the night&apos;s bed.
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Who can see them:</strong> the owner, admins and managers. Agents do not open these screens; they see
          transportation, flight and train rates only inside the pickers they use when building a trip. Agents cannot
          read airport assistance rates.
        </p>
        <p className="text-gray-600 mb-6">
          <strong>On every screen:</strong> the supplier you link must be one of your own suppliers; another company&apos;s
          supplier is refused. A rate that a trip line, a tour programme, a tour variation or a B2B pricing rule uses
          cannot be deleted. The message says what uses it; deactivate the rate instead.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Transportation (&ldquo;Transportation Rates&rdquo;)</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Buttons:</strong> CSV import/export, <strong>Align bands with Settings</strong> (with the number of rates whose vehicle sizes differ from Settings), <strong>Add Transportation Rate</strong>.</li>
          <li><strong>Tiles:</strong> Total Rates, Active, Inactive, City (different cities), Linked (rates with a supplier). They count every transportation rate your company has, whatever the filters show.</li>
          <li><strong>Filters:</strong> search, All Cities, All Service Types, All Suppliers, Show/Hide Inactive. Views: cards, table, list. Tick rows to delete several at once.</li>
        </ul>
        <p className="text-gray-600 mb-2">The form:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Transport Company (Supplier)</strong> is required. The list shows every supplier with a transport, local operator or driver role (any of its roles, not only the first), plus types you added in Settings that behave like a transport company or a driver. Choose <strong>No supplier / Direct booking</strong> to save the rate without a supplier.</li>
          <li><strong>Service Type</strong> comes from Settings &rsaquo; Vocabulary &rsaquo; Transport service types: Airport Transfer, Airport Transfer + Sightseeing, City Transfer, City Tour, Intercity, Intercity + Sightseeing, Half Day, Day Tour, Extended Day Tour, Sound &amp; Light, Dinner Transfer, and any you add.</li>
          <li><strong>City</strong>, and a <strong>Destination City</strong> for types that run between two cities. Road transfers also have a trip shape: <strong>One way</strong>, <strong>Same-day return</strong> or <strong>Overnight return</strong>.</li>
          <li><strong>Service Code</strong> is filled in as <code>CITY-SERVICE-TYPE</code> or <code>CITY-TO-DESTINATION-TYPE</code>. It must be unique in your company.</li>
          <li><strong>Route / Service Name</strong>, includes, season, rate currency, <strong>Valid From</strong> / <strong>Valid To</strong> (a new rate runs from today to 2099-12-31), notes, active.</li>
          <li><strong>Vehicles:</strong> one row per vehicle in Settings &rsaquo; Vocabulary &rsaquo; Vehicle types, with its size from there. Each vehicle has <strong>one price</strong>, whatever the travellers&apos; passports. Leave a price blank and that vehicle is not offered.</li>
        </ul>
        <p className="text-gray-600 mb-2">
          <strong>Duplicates:</strong> a rate with the same service type, city, destination, supplier, route name, trip
          shape and validity dates as an existing one is refused, and so is a service code already in use. A second
          supplier for the same service, a differently named route, or next year&apos;s dates make a separate rate.
        </p>
        <p className="text-gray-600 mb-2"><strong>How a trip day is priced:</strong></p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-6">
          <li>Only rates valid on that day count (Valid From / Valid To). An expired rate does not price.</li>
          <li>The rate whose service type and city match the day. A road transfer is found by departure, destination and trip shape.</li>
          <li>When several rates match (two suppliers, or an open-ended rate and a newer one), the one whose validity started most recently wins, then the lowest service code. The choice is the same every time.</li>
          <li>Inside the rate, the vehicle is the one whose size holds the group, else the smallest that seats it. A group bigger than the largest vehicle is priced as several of the largest vehicle: 12 people with a 7-seat minivan as the largest is 2 minivans at twice the price, shown as &ldquo;2 &times; Minivan&rdquo;.</li>
          <li>The price is per vehicle, a group cost shared by the travellers. A rate entered in another currency is converted to your rate currency, in trip pricing and in B2B quotes alike.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Flights (&ldquo;Flight Rates&rdquo;)</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Tiles:</strong> Total Rates, Active, one tile per flight type (Domestic, International and any you add), Airlines, Linked. They count the fares loaded for the current filters.</li>
          <li><strong>Filters:</strong> From: Any / To: Any (airports), airline, type, class, supplier, Show/Hide Inactive. Show Inactive also loads deactivated fares, so you can find and reactivate them.</li>
        </ul>
        <p className="text-gray-600 mb-2">The form:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Airline / Supplier:</strong> suppliers with the Air Carrier role. Picking one fills the airline name, the supplier link and the airline code.</li>
          <li><strong>From</strong> and <strong>To</strong> are airports from Settings &rsaquo; Vocabulary &rsaquo; Airports. The flight type is pre-filled from the airports&apos; countries.</li>
          <li>Cabin class (Economy / Business / First), flight number, departure and arrival time, duration, frequency, baggage. Service code <code>FLT-AIRLINE-FROM-TO-CLASS</code>.</li>
          <li><strong>Validity periods</strong> (up to 6). Each period has a fare, a tax and a guide fare. At least one period needs a fare above 0.</li>
          <li><strong>Guide fare:</strong> blank means the throughout guide pays the customer fare; 0 means he flies free.</li>
        </ul>
        <p className="text-gray-600 mb-2">
          <strong>Duplicates:</strong> a fare with the same route, airline, cabin, flight number and supplier as an
          existing one is refused; add a period to that fare instead. Two flight numbers on one route are two fares.
          Saving an edit updates the price shown in the list and in the pricing grid from the first period.
        </p>
        <p className="text-gray-600 mb-2"><strong>How a flight leg is priced:</strong></p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-6">
          <li>Economy only. The leg&apos;s cities are matched to airports through your Airports list.</li>
          <li>The period covering the day the leg flies gives the fare. A day outside every period, or a period with no fare, leaves the leg unpriced and the quote incomplete. It is never a free ticket.</li>
          <li>If more than one fare flies the route that day, the leg stays unpriced until you pick the flight on the day.</li>
          <li>The cost is fare + tax per person, and margin is added on top of both.</li>
          <li>With a throughout guide, his seat costs the period&apos;s guide fare, or the customer fare when none was entered.</li>
          <li>The list shows the first period&apos;s fare without tax; the pricing grid shows fare + tax.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Trains (&ldquo;Train Rates&rdquo;)</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Tiles:</strong> Total Rates, Active, Routes (different origin&ndash;destination pairs), Avg. Rate (per currency, over priced rates only). They count the rates loaded.</li>
          <li><strong>Views:</strong> table, cards, compact. <strong>Filters:</strong> origin, destination, class, and <strong>Show All / Active Only</strong>, which reloads the list.</li>
          <li><strong>Form:</strong> service code (random <code>TRN-XXXXXX</code>); Origin and Destination from your destination cities (Settings &rsaquo; Destinations); class from Settings &rsaquo; Vocabulary &rsaquo; Train classes; <strong>Rate</strong> per person (required, above 0); <strong>Guide fare</strong> (blank = the customer fare, 0 = free); duration; departure times; Valid From / Valid To (today to one year ahead); supplier (its name becomes the operator); an optional train from the supplier&apos;s trains; description; notes; active.</li>
          <li><strong>Duplicates:</strong> the same route, class, supplier, train and validity dates as an existing rate is refused, and the form switches to editing that rate.</li>
        </ul>
        <p className="text-gray-600 mb-6">
          <strong>How a train leg is priced:</strong> the rates valid on the day of the leg, matched by origin and
          destination city (Giza counts as Cairo). Exactly one rate prices the leg; with more than one, the leg stays
          unpriced until you pick the train on the day. A rate with no price leaves the leg unpriced. The price is per
          person; the throughout guide pays the guide fare, or the customer fare when none was entered.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Airport Assistants</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Tiles:</strong> Total Rates, Active, Airports, VIP Services, average rate (per currency, priced rates only), over all rates.</li>
          <li><strong>Filters:</strong> search, All Airports, All Services, Show All / Active Only.</li>
          <li><strong>Form:</strong> <strong>Airport</strong> (every airport with a code in Settings &rsaquo; Vocabulary &rsaquo; Airports); <strong>Service Type</strong> (Meet &amp; Greet, Customs Assist, Full Service, VIP Service); <strong>Direction</strong> (Arrival, Departure, Both); rate (blank = not priced); rate currency; pricing basis (per group, per person, or per unit with a capacity); supplier; description; service code (<code>AIR-CODE-SERVICE-DIR</code>); notes; active.</li>
          <li><strong>Duplicates:</strong> one rate per airport, service type, direction and supplier. An arrival rate and a departure rate are two rates.</li>
        </ul>
        <p className="text-gray-600 mb-6">
          <strong>How it is priced:</strong> on an arrival or departure day, the airport code comes from your Airports
          list for the day&apos;s city. A luxury trip takes VIP Service, else Full Service, Meet &amp; Greet, Customs
          Assist. Every other trip takes Meet &amp; Greet, else Full Service, else Customs Assist, and never VIP. Within
          that, a priced rate comes before an unpriced one, the exact direction before Both, then the service code. A
          rate with no price leaves the line unpriced.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">What it does not do</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Transportation has no EU / non-EU price on the form, and a flight has one fare per period.</li>
          <li>A flight is always priced in economy, and margin is applied to airport tax too.</li>
          <li>Several vehicles for a big group are always several of the largest vehicle; the app does not mix sizes to find a cheaper combination.</li>
          <li>The pricing grid&apos;s vehicle list still offers the largest vehicle for a group bigger than every vehicle; trip pricing and quotes price the extra vehicles.</li>
          <li>The Flights and Trains tiles count the rates loaded for the current filters, not every rate.</li>
          <li>A flight guide fare stored as 0 by a period save was turned back into blank (the customer fare). If a guide really flies free on a fare, enter 0 again.</li>
        </ul>
      </section>
    </div>
  )
}
