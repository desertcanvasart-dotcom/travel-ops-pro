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

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">EU vs Non-EU Pricing</h3>
        <p className="text-gray-600 mb-6">
          Hotels and Nile cruises carry a price for EU and for non-EU passport holders in every
          dated period. Every other rate takes one price for everybody: sleeping trains and hotel
          services, transport (one price per vehicle), flights (one fare per period), and guides,
          meals, attractions and activities (one <strong>Rate</strong>; their CSV still has a{' '}
          <strong>Rate (non-EU passport, legacy)</strong> column for old sheets).
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
          <li>The Flights and Trains tiles count the rates loaded for the current filters, not every rate.</li>
          <li>A flight guide fare stored as 0 by a period save was turned back into blank (the customer fare). If a guide really flies free on a fare, enter 0 again.</li>
        </ul>
      </section>
    </div>
  )
}
