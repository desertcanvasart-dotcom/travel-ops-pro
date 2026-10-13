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
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Transportation</td><td className="px-4 py-2.5">Vehicle rates by type, service type, and group size</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Guides</td><td className="px-4 py-2.5">A guide&apos;s rate by language, grade (Egyptologist or Senior Egyptologist), duration, city and guide mode (spot or throughout). See <a href="#guides-services" className="text-primary-600 hover:underline">Guides &amp; Services</a> for which durations automatic pricing uses</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Entrance Fees</td><td className="px-4 py-2.5">Attraction tickets, one price per ticket, by city and validity period</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Meals</td><td className="px-4 py-2.5">Restaurant lunch and dinner rates by tier and city, per person or per group</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Activities</td><td className="px-4 py-2.5">Activities and add-ons priced per person, per unit, as a flat rate or in group-size bands</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Cruises</td><td className="px-4 py-2.5">Nile cruise rates by ship and cabin type</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Airport Services</td><td className="px-4 py-2.5">Meet &amp; greet, VIP lounge, etc.</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Sleeping Trains</td><td className="px-4 py-2.5">Overnight train rates by cabin type</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Flights</td><td className="px-4 py-2.5">Domestic flight rates</td></tr>
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
          Hotels and cruises can carry a separate price for non-EU passport holders. Guides, meals,
          attractions and activities take one <strong>Rate</strong>: the form writes the same figure for
          both passports. Their CSV still has a <strong>Rate (non-EU passport, legacy)</strong> column for
          old sheets.
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

      {/* Guides & Services */}
      <section id="guides-services" className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Guides &amp; Services</h2>
        <p className="text-gray-600 mb-4">
          Four pages under <strong>Home › Suppliers &amp; Rates › Guides &amp; Services</strong>:{' '}
          <strong>Tour Guides</strong>, <strong>Meals</strong>, <strong>Attractions</strong> and{' '}
          <strong>Activities</strong>. Admins and managers see them (the owner always does). Agents do not
          see these pages, but they pick from these rates on trips and vouchers. Viewers cannot read them.
          Each company sees, prices and imports only its own rates.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">On every page</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Add Rate</strong> (<strong>Add Attraction</strong> on Attractions) opens the form. Each row has Edit, Duplicate (opens the form filled in, with the service code cleared) and Delete.</li>
          <li><strong>Import/Export</strong> loads or downloads the table as CSV. A panel shows the change history of the rates.</li>
          <li><strong>Rate currency</strong> is the currency the supplier&apos;s contract is written in. Leave it on <strong>Organisation default</strong> for your company&apos;s rate currency. A row in another currency is listed in that currency with a badge; pricing, the Pricing Grid, the trip rate picker and supplier vouchers convert it into your rate currency at your exchange rates. A row that cannot be converted has no price there.</li>
          <li><strong>Valid From</strong> and <strong>Valid To</strong> are used. Pricing only uses a rate whose period covers the day being priced (the trip&apos;s first day for entrance fees). A rate with no dates is always valid. Without a travel date, today is used.</li>
          <li>The list loads every rate, inactive ones too. The <strong>Active Only</strong> / <strong>Show All</strong> button filters the list on the page. The tiles count every rate, including inactive ones; <strong>Active</strong> counts the active ones.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Duplicates</h3>
        <p className="text-gray-600 mb-3">
          A new rate that matches an existing one is refused with &ldquo;already exists&rdquo;, and you
          edit that rate instead. A rate matches when all of these are the same:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Tour Guides:</strong> language, guide type, tour duration, guide mode, city, linked guide and validity period.</li>
          <li><strong>Meals:</strong> restaurant, city, meal type and validity period.</li>
          <li><strong>Attractions:</strong> name, city and validity period.</li>
          <li><strong>Activities:</strong> name, city, supplier and validity period.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          So next year&apos;s price is a second rate with next year&apos;s dates: Duplicate the rate,
          change Valid From and Valid To, and save. Pricing moves to it on its start date.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Tour Guides</h3>
        <p className="text-gray-600 mb-3">
          Fields: Service Code, Language (from Settings › Vocabulary › Guide languages), Guide Type
          (Egyptologist or Senior Egyptologist), Guide mode (Spot guide or Throughout guide), City, Link to
          Guide (optional), Tour Duration, Rate, Rate currency, Season, Valid From, Valid To, Notes, Active.
          Tiles: Total Rates, Active, Linked to Guide, Avg. Daily Rate (averaged within each currency), Cities.
        </p>
        <p className="text-gray-600 mb-3">How automatic pricing picks a guide rate for a day:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The rate&apos;s language, guide type and guide mode must match the quote. A throughout quote is priced only from Throughout rates; with none, the guide shows as &ldquo;No rate&rdquo;.</li>
          <li>A rate for the day&apos;s city comes first, then a rate with no city, then another city&apos;s rate.</li>
          <li><strong>Full Day</strong> prices an ordinary guiding day. <strong>Half Day</strong> prices a day only when the trip marks it as a half day (a half-day tour, or a day whose transport is set to a half day). With no Half Day rate, that day is priced at the Full Day rate and the line says so.</li>
          <li><strong>Meet &amp; Assist day</strong> prices a throughout guide&apos;s days without sightseeing (arrival and departure).</li>
          <li><strong>Extended</strong> and <strong>Hourly</strong> rates are never used by automatic pricing. You can pick them on supplier vouchers and in the Pricing Grid.</li>
          <li>The throughout guide&apos;s bed is not here. Enter it as <strong>Guide bed / night</strong> on the hotel&apos;s rate periods in Rates › Hotels.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Meals</h3>
        <p className="text-gray-600 mb-3">
          Fields: Restaurant name, Meal type, Cuisine, Restaurant type, City, Tier, Meal category, Dietary
          options, Rate, Rate currency, Per Person Rate, Minimum Pax, Season, Valid From, Valid To, Supplier,
          Notes, Active and Preferred (the star). Tiles: Total Rates, Active, Linked, Avg. rate, Cities.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Automatic pricing prices each lunch or dinner the trip buys at <strong>one</strong> restaurant&apos;s rate of the trip&apos;s tier: the day&apos;s city first, a starred (Preferred) restaurant first, then by restaurant name. It does not average restaurants.</li>
          <li>With <strong>Per Person Rate</strong> unticked, the rate is one price for the whole group. Ticked, it is per traveller, and a group smaller than <strong>Minimum Pax</strong> still pays for the minimum.</li>
          <li>A supplier voucher charges a per-group meal once and a per-person meal for the party, at least the minimum. The Pricing Grid charges a per-group meal once, but shows the minimum only as a note.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Attractions</h3>
        <p className="text-gray-600 mb-3">
          The page is <strong>Attractions &amp; Entrance Fees</strong>. Fields: Attraction Name, Service Code,
          Supplier, City, Category, Fee Type, Season, Rate, Rate currency, Valid From, Valid To, the
          <strong> Pricing &amp; sale</strong> box, Notes and Active. Tiles: Total Attractions, Active,
          Standard, Add-ons, Cities, Avg. rate. A fee of type free shows FREE.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Pricing charges the tickets picked on a programme day. A day with no picked ticket is matched by its wording, through the alias table and then by name. Each ticket is charged once per trip.</li>
          <li><strong>Not included in the automatic price</strong> marks an add-on. An add-on is never matched from a day&apos;s wording; it is charged only when picked on the day. <strong>Offer as a paid extra at booking</strong> is a separate setting.</li>
          <li>Child prices use the engine&apos;s one fixed child discount (50%). There is no child or student discount per ticket.</li>
          <li>In a Japanese session, editing saves the name and notes as the Japanese version and leaves the English name alone.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Activities</h3>
        <p className="text-gray-600 mb-3">
          The page is <strong>Activities &amp; Add-ons Rates</strong>. Pricing Type is one of Per Person
          (rate × travellers), Per Unit (per boat, vehicle or ride, with a unit label and a maximum
          capacity), Flat Rate (one price for the group) or Tiered (Volume Discount): bands of group size,
          each with its own per-person rate. Tiles: Total Rates, Active, Per Person (tiered rates included),
          Per Unit, Flat Rate, Cities.
        </p>
        <p className="text-gray-600">
          The Pricing Grid offers boat, felucca and motor-boat activities in its boat slot and the rest as
          experiences, priced by their pricing type.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Deleting a rate</h3>
        <p className="text-gray-600">
          A delete is refused, with the reason, while the rate is used: by a line on a trip&apos;s Pricing
          Grid, by a tour variation&apos;s service list, by a day of a tour, or (for an attraction) as a
          picked ticket on a programme day or a trip line with the same name. Deactivate the rate instead;
          it stops pricing and stays on file.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">What it does not do</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Automatic pricing never uses Extended or Hourly guide rates.</li>
          <li>Pricing does not choose a guide or restaurant supplier for you: with several rates for one city, the fixed order above decides.</li>
          <li>The Pricing Grid does not add a restaurant&apos;s minimum group; check the note on the option.</li>
          <li>Entrance fees are priced at the fee valid on the trip&apos;s first day, not day by day.</li>
          <li>There is no Egyptian-resident or student price.</li>
        </ul>
      </section>
    </div>
  )
}
