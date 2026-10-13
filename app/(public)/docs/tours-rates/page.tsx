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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Rates hub</h2>
        <p className="text-gray-600 mb-4">
          Open it from <strong>Home › Suppliers &amp; Rates › Rates Hub</strong>. The Suppliers
          &amp; Rates menu is shown to <strong>admins</strong> and <strong>managers</strong>{' '}
          (owners always); the rate pages are theirs too. The menu&rsquo;s four groups
          (Accommodation, Transport &amp; Tickets, Guides &amp; Services, Costs) open the hub on
          the matching tab, and list the rate pages underneath.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mb-3">Tabs</h3>
        <p className="text-gray-600 mb-3">
          Each tab lists your company&rsquo;s active rates of one kind, with the count in brackets:
          Transport, Guides, Entrances (entrance fees, inactive ones included), Hotels, Meals,
          Cruises, Sleep Train, Trains, Airport Asst., Hotel Asst. and Tips. Two links sit beside
          them: <strong>Fixed Costs</strong> and <strong>Seasons</strong> (your seasonal premiums).
          Flights, activities and attractions have their own pages and no hub tab. Every rate is
          loaded, however many there are. If a tab&rsquo;s rates could not be loaded, a red notice
          names it &mdash; an empty tab then means &ldquo;not loaded&rdquo;, not &ldquo;no
          rates&rdquo;.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The four figures at the top</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Services</strong> &mdash; the eleven tab counts added up.</li>
          <li><strong>Categories</strong> &mdash; always 11, the number of tabs.</li>
          <li><strong>Cities</strong> &mdash; the different cities across transport, guides, entrances, hotels, meals, cruise embark and disembark cities, and train origins and destinations.</li>
          <li><strong>Current View</strong> &mdash; the rows on the page you are looking at (at most the per-page size), not the filtered total.</li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Filters and money</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>Search looks in every field. City filters transport, guides, entrances, hotels and meals; Category filters entrances; Tier and Property Type filter hotels, and the Seasonal / Base button switches the hotel columns. 10, 20, 50 or 100 per page.</li>
          <li>A rate entered in its own currency (its Currency field) is shown in that currency, unconverted. A rate without one is in your company&rsquo;s rate currency, shown in your display currency. Hotels show the per-person double price of their first period.</li>
          <li><strong>Export view</strong> saves the current tab&rsquo;s rows as filtered on screen, every field, zeros as 0 and lists written out. It is a file to read, not to re-import. <strong>Print</strong> prints the page.</li>
        </ul>
        <Tip>
          Rates are used by the auto-pricing engine when you build itineraries in <strong>Auto</strong> cost mode. Keep them up to date for accurate quotes.
        </Tip>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Adding or editing a rate</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the rate page from the menu (the hub lists; the rate pages edit)</li>
          <li>Click <strong>Add</strong>, or edit an existing rate</li>
          <li>Fill in the prices (EU and non-EU passport where the rate has both), the supplier and the Currency if it is not your rate currency</li>
          <li>Save</li>
        </ol>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Importing rates from a spreadsheet</h3>
        <p className="text-gray-600 mb-3">
          Each rate page has <strong>Sample CSV</strong>, <strong>Export</strong> and{' '}
          <strong>Import CSV</strong>; Hotels and Nile Cruises also have{' '}
          <strong>Sample Periods</strong>, <strong>Export Periods</strong> and{' '}
          <strong>Import Periods</strong> for their dated prices. An import shows a preview first;
          then it imports the valid rows and lists the rows it skipped, with the reason. A rate
          naming a supplier code your company does not have is skipped rather than guessed. See{' '}
          <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>{' '}
          and <Link href="/docs/rate-periods" className="text-primary-600 hover:underline">Rate Periods</Link>.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Costs: tips, fixed costs, commissions</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>
            <strong>Tipping</strong> (<code>/rates/tipping</code>): each tip has a role, a context,
            a city (blank = anywhere), a rate and a <strong>Rate Unit</strong>. Pricing charges one
            tip per role per day &mdash; the most specific match: role + context + city, then role +
            context anywhere, then role + city, then role anywhere &mdash; converted from the
            tip&rsquo;s currency and rounded to cents. By unit: <em>per day</em> once a day the role
            works; <em>per service</em> once per service that day (two airports, two porter tips);{' '}
            <em>per night</em> once per night covered; <em>per cruise</em> once, on the first day of
            the cruise; <em>per person</em> per traveller. A unit your company added in the
            vocabulary has no rule and is not priced. Leaving Service Code blank makes one from
            role, context and city. The same role + context + city twice, or a code already used,
            is refused with a message.
          </li>
          <li>
            In the <strong>Pricing Grid</strong>, a per-person tip is charged per traveller; every
            other tip once per pick per day for the group (pick a per-cruise tip on one day of the
            cruise). A guide&rsquo;s tips drop when the guide is off.
          </li>
          <li>
            <strong>Fixed Costs</strong> (<code>/rates/fixed-costs</code>): pricing uses one cost,{' '}
            <strong>Water Bottle</strong> (capital letters ignored), per person per touring day,
            converted from its currency. Other cost types are kept for reference and marked{' '}
            &ldquo;Not priced&rdquo;. With no active Water Bottle row &mdash; or one whose currency
            has no exchange rate &mdash; pricing uses a built-in 2.00 per person per day and the
            quote shows a warning saying so. A second cost with the same name is refused. A change
            may take up to five minutes to reach every server.
          </li>
          <li>
            <strong>Commission Rates</strong> (<code>/rates/commissions</code>): a rate from 0 to
            100 on the supplier, with a direction. <em>We receive</em> = rate × the
            supplier&rsquo;s price on the service; <em>We pay</em> = rate × (client price −
            supplier cost), nothing when there is no profit. A service&rsquo;s own commission rate
            overrides the supplier&rsquo;s. 0% is shown and saved as no commission.
          </li>
        </ul>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">What the hub does not do</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-6">
          <li>It does not edit rates; the rate pages do.</li>
          <li>It does not convert a rate&rsquo;s own currency into yours.</li>
          <li>Its Export view is not an import sheet.</li>
          <li>It has no tabs for flights, activities or attractions.</li>
        </ul>

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
