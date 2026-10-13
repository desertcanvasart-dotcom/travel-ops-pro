import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function TransportPackagesPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Transport Packages</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Transport Packages</h1>
      <p className="text-gray-600 mb-8">
        <strong>Tours &rsaquo; Transport Packages</strong> holds bundled transport prices: one flat price per vehicle for a whole package, such as the sightseeing car that follows a Luxor&ndash;Aswan Nile cruise. Pricing uses a package for the transport of a cruise instead of adding up separate day tours and transfers.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The menu shows <strong>Transport Packages</strong> under <strong>Tours</strong> to the account owner, <strong>Administrators</strong> and <strong>Managers</strong>. Only they can open the screen and add, change or delete packages</li>
          <li><strong>Agents</strong> see the Tours section (<strong>Ready-made Packages</strong>) but not this item. Their quotes and itineraries are still priced with the packages</li>
          <li><strong>Viewers</strong> do not see the Tours section</li>
          <li>Packages belong to your company. Another company&rsquo;s packages are never listed and never used to price your quotes</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Package List</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The header reads <strong>Transport Packages</strong>, with a badge counting all your packages, active and inactive, and an <strong>Add Package</strong> button. Click the header to collapse or expand the list</li>
          <li>Packages are sorted by name. Each shows its name, its type, the route (origin &rarr; destination) and one box per priced vehicle with its price and passenger range</li>
          <li>Prices show in the currency the package was entered in. A package left on the organisation default shows in your organisation&rsquo;s rate currency, converted to your display currency</li>
          <li>The <strong>What&rsquo;s Included</strong> text appears under the prices as <strong>Includes:</strong></li>
          <li>Inactive packages are greyed out and carry an <strong>Inactive</strong> badge</li>
          <li>With no packages yet, the list says <strong>No transport packages yet</strong> and offers <strong>Add your first package</strong></li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Package</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Package</strong></li>
          <li>Enter the <strong>Package Name</strong> (required)</li>
          <li>Choose the <strong>Package Type</strong>: Cruise Sightseeing, Cruise Transfer, Multi-Day Tour or Day Tour. The form says under the field which types pricing uses (see below)</li>
          <li>Pick the <strong>Origin City</strong> and <strong>Destination City</strong> in the direction the cruise sails</li>
          <li>Set <strong>Duration (Days)</strong>: the cruise&rsquo;s length in days, which is the nights aboard plus one. A 4-night cruise needs a 5-day package. It must be a whole number, 1 or more</li>
          <li>Leave <strong>Rate currency</strong> on <strong>Organisation default</strong> unless the supplier contract is in another currency</li>
          <li>Under <strong>Vehicle rates</strong>, enter a <strong>Price</strong> for each vehicle you run. The <strong>Capacity</strong> column comes from Settings &rsaquo; Vocabulary &rsaquo; Vehicle types and cannot be changed here. At least one vehicle needs a price</li>
          <li>Optionally fill in <strong>What&rsquo;s Included</strong> (for example, the sites the car covers), and untick <strong>Active</strong> to save the package switched off</li>
          <li>Click <strong>Create Package</strong></li>
        </ol>
        <Tip>Leave a vehicle&rsquo;s price empty if you do not run it. Pricing then moves the group up to the next vehicle that has a price.</Tip>
        <p className="text-gray-700 mt-3">
          Saving is refused when another <strong>active</strong> package already has the same type, duration, origin and destination; the message names that package. Edit it instead, or make one of the two inactive. Only one package can then fit a given cruise.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing, Duplicating and Deleting</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Edit</strong> (pencil icon) opens the same form; save with <strong>Update Package</strong></li>
          <li><strong>Duplicate</strong> (copy icon) opens the add form filled in from that package, so you can change a few fields and save it as a new package. Change the duration, route or type before saving, or make one of them inactive, because two active packages cannot share all three</li>
          <li><strong>Delete</strong> (bin icon) asks for confirmation, then removes the package for good</li>
          <li>If the package is the only active <strong>Cruise Sightseeing</strong> package of its length, deleting it, deactivating it, or changing its type or duration first shows a warning: every cruise of that length will show <strong>No rate</strong> for its transport until you add another package. Choose <strong>Delete anyway</strong> or <strong>Save anyway</strong> to go ahead</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How Pricing Uses Packages</h2>
        <p className="text-gray-700 mb-3">
          Only active packages are used. The vehicle is picked by group size: the vehicle whose passenger range fits the group, else the smallest one that covers it, else the largest one the package offers. The price is for the vehicle and the whole package, not per person. A package entered in another currency is converted to the quote&rsquo;s currency first; if no exchange rate is available, the package is treated as having no price.
        </p>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Which fields matter where</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>Itineraries, AI-generated itineraries and the B2B calculator on a tour template</strong> use only <strong>Cruise Sightseeing</strong> packages, by exact <strong>Duration</strong>. Itineraries and the template calculator also check the cities</li>
          <li><strong>Cruise Transfer</strong> is used only by the B2B calculator on a variation with its own service list</li>
          <li><strong>Multi-Day Tour</strong> and <strong>Day Tour</strong> are never priced automatically. You can only pick them by hand in the Pricing Grid, on a cruise day</li>
        </ul>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Itineraries and the B2B calculator on a template</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li>A sailing is a run of consecutive cruise days. It needs a Cruise Sightseeing package whose Duration is the nights aboard plus one. The match is exact: with no package of that length, the transport shows as <strong>No rate</strong> and the quote is not complete. The message reads &ldquo;No 5D cruise transport package (4 nights aboard). Add an active 5-day Cruise Sightseeing package for this route in Tours &rsaquo; Transport Packages.&rdquo;</li>
          <li>The sailing&rsquo;s route is the city of the day you board (the day before the first night aboard), the cities of the nights aboard and the city of the day you leave the ship. A package is skipped when its origin and destination appear on that route in the opposite order (a Luxor &rarr; Aswan package for an Aswan &rarr; Luxor cruise), or when neither city appears on it. When the days name no city, the cities are not checked</li>
          <li>If several packages still fit, the one whose origin and destination both lie on the route wins; after that, the package created first. Editing a package does not change which one is used</li>
          <li>The package is added once per sailing to the group&rsquo;s transport, shared across the travellers at each group size, and then gets the margin and any seasonal premium like the rest of the trip. Each night aboard lists &ldquo;Sightseeing transport&rdquo; and the disembark day &ldquo;Transfer off the ship&rdquo; at 0, marked as included in the package</li>
          <li>With a tour leader, or a guide for the whole trip, the vehicle is sized for one more person</li>
          <li>AI-generated itineraries pick the package the same way by type and length, without the city check</li>
        </ul>
        <h3 className="text-lg font-semibold text-gray-900 mb-2"><Link href="/docs/pricing-grid" className="text-primary-600 hover:underline">Pricing Grid</Link></h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li>On a cruise day, every active package appears among the transport options, whatever its type and duration, one option per vehicle, labelled &ldquo;Vehicle (min-max pax) &mdash; Name (Origin&rarr;Destination, Nd)&rdquo;. Packages are not offered on land days</li>
          <li>When the grid fills in a programme by itself, it adds the package on the boarding day using the same rule as itineraries (Cruise Sightseeing, exact length, route)</li>
        </ul>
        <h3 className="text-lg font-semibold text-gray-900 mb-2"><Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B calculator</Link>, variations with their own service list</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>A transportation service whose name contains &ldquo;sightseeing&rdquo; uses a Cruise Sightseeing package. Its length is the template&rsquo;s first sailing (nights aboard plus one), or the tour&rsquo;s length in days when the template has no cruise days. The route is checked against that sailing as above</li>
          <li>A name containing &ldquo;transfer&rdquo; or &ldquo;airport&rdquo; uses a Cruise Transfer package on that route, of any duration</li>
          <li>The vehicle is sized for everyone travelling: adults, children and infants</li>
          <li>With no package that fits, the line is priced from your transportation rates instead</li>
        </ul>
        <p className="text-gray-700 mt-3">
          Vehicle names and sizes are shared with transportation rates; see <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link> and <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Rates Hub</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>There is no search or filter; packages are listed by name</li>
          <li>Prices are a single flat amount per vehicle. There are no separate EU and non-EU rates, no seasons and no validity dates on a package</li>
          <li>The package code is generated automatically and is not shown or editable on the form</li>
          <li>Multi-Day Tour and Day Tour packages do not price anything on their own, and packages never appear on land days in the Pricing Grid</li>
          <li>Deleting the last package of a length is warned about, not blocked</li>
          <li>Despite the web address (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/b2b/pricing-rules</code>), this screen does not manage tiered activity pricing. Group-size tiers for activities live on the activity rates; the old &ldquo;pricing rules&rdquo; are no longer used</li>
        </ul>
      </section>
    </div>
  )
}
