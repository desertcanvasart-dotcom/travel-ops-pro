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
        <strong>Tours &rarr; Transport Packages</strong> holds bundled transport prices: one flat price per vehicle for a whole package, such as the sightseeing car that follows a Luxor&ndash;Aswan Nile cruise. Pricing uses these packages for cruise days instead of adding up separate transfers.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <p className="text-gray-700">
          The menu shows <strong>Transport Packages</strong> to the account owner, <strong>Administrators</strong> and <strong>Managers</strong>. Agents and Viewers do not see the Tours section.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Package List</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Each package shows its name, its type, the route (origin &rarr; destination) and, under that, one box per vehicle with its price and passenger range</li>
          <li>Prices show in the currency the package was entered in; a package left on the organisation default shows in your organisation&rsquo;s rate currency</li>
          <li>The <strong>What&rsquo;s Included</strong> text appears under the prices as <strong>Includes:</strong></li>
          <li>Inactive packages are greyed out and carry an <strong>Inactive</strong> badge</li>
          <li>Click the <strong>Transport Packages</strong> header to collapse or expand the list</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Package</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Package</strong></li>
          <li>Enter the <strong>Package Name</strong> (required)</li>
          <li>Choose the <strong>Package Type</strong>: Cruise Sightseeing, Cruise Transfer, Multi-Day Tour or Day Tour</li>
          <li>Pick the <strong>Origin City</strong> and <strong>Destination City</strong>, and set <strong>Duration (Days)</strong></li>
          <li>Leave <strong>Rate currency</strong> on <strong>Organisation default</strong> unless the supplier contract is in another currency</li>
          <li>Under <strong>Vehicle rates</strong>, enter a <strong>Price</strong> for each vehicle you run. The <strong>Capacity</strong> column comes from Settings &rarr; Vocabulary &rarr; Vehicle types and cannot be changed here. At least one vehicle needs a price</li>
          <li>Optionally fill in <strong>What&rsquo;s Included</strong> (for example, the sites the car covers) and untick <strong>Active</strong> to save it switched off</li>
          <li>Click <strong>Create Package</strong></li>
        </ol>
        <Tip>Leave a vehicle&rsquo;s price empty if you do not run it. Pricing then moves the group up to the next vehicle that has a price.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing, Duplicating and Deleting</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Edit</strong> (pencil icon) opens the same form; save with <strong>Update Package</strong></li>
          <li><strong>Duplicate</strong> (copy icon) opens the add form filled in from that package, so you can change a few fields and save it as a new package</li>
          <li><strong>Delete</strong> (bin icon) asks for confirmation, then removes the package for good</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How Pricing Uses Packages</h2>
        <p className="text-gray-700 mb-3">Only active packages are used. In every case the vehicle is picked by group size: the vehicle whose passenger range fits the group, else the smallest one that covers it, else the largest one the package offers.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Cruise days in an itinerary</strong> &mdash; each sailing needs a package whose <strong>Duration (Days)</strong> is the nights aboard plus one. A 3-night cruise uses a 4-day package. The match is exact: if no package has that length, the line shows as having no rate rather than borrowing a nearby one</li>
          <li><strong><Link href="/docs/pricing-grid" className="text-primary-600 hover:underline">Pricing Grid</Link></strong> &mdash; each package appears among the transport options as &ldquo;Name (Origin&rarr;Destination, Nd)&rdquo;, one option per vehicle, so the grid can switch vehicle as the group grows</li>
          <li><strong><Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B Price Calculator</Link></strong> &mdash; a transportation service with no other rate is priced from a package: a name containing &ldquo;sightseeing&rdquo; uses an active <strong>Cruise Sightseeing</strong> package from Luxor to Aswan; a name containing &ldquo;transfer&rdquo; or &ldquo;airport&rdquo; uses an active <strong>Cruise Transfer</strong> package from Luxor to Aswan</li>
        </ul>
        <p className="text-gray-700 mt-3">
          Vehicle names and sizes are shared with transportation rates; see <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link> and <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Rates Hub</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>There is no search, filter or sorting; packages are listed by name</li>
          <li>Prices are a single flat amount per vehicle. There are no separate EU and non-EU rates, no seasons and no validity dates on a package</li>
          <li>The package code is generated automatically and is not shown or editable on the form</li>
          <li>Cruise-day pricing matches packages by length only; it does not check the package type or cities</li>
          <li>The B2B Price Calculator only looks for Luxor &rarr; Aswan packages; packages on other routes are not used there</li>
          <li>Despite the web address (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/b2b/pricing-rules</code>), this screen does not manage tiered activity pricing; group-size tiers for activities live on the activity rates</li>
        </ul>
      </section>
    </div>
  )
}
