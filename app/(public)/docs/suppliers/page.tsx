import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function SuppliersPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Suppliers</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Suppliers</h1>
      <p className="text-gray-600 mb-4">
        Suppliers is your company&rsquo;s list of everyone you buy from: hotels and hotel groups,
        transport companies and drivers, guides, cruise lines, restaurants, shops and the rest. A
        supplier record says who they are and how to reach them. What they charge lives with the
        rates, under Rates.
      </p>
      <p className="text-gray-600 mb-8">
        Open it from the menu: <strong>Home › Suppliers &amp; Rates › Suppliers</strong>.
      </p>

      {/* Who */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who can use it</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The <strong>Suppliers &amp; Rates</strong> menu is shown to <strong>admins</strong> and <strong>managers</strong> (owners always see it).</li>
          <li>Only managers and above can add, edit, delete, import or export suppliers.</li>
          <li>Agents do not use this screen, but they still see supplier names where a screen asks them to pick one (for example when building an itinerary).</li>
        </ul>
      </section>

      {/* Per company */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Each company has its own suppliers</h2>
        <p className="text-gray-600 mb-3">
          If you run more than one company, each one has its own supplier list. A supplier both
          companies used was copied, one copy per company, and editing one company&rsquo;s copy
          never changes the other&rsquo;s.
        </p>
        <p className="text-gray-600">
          Supplier codes are unique <em>within</em> a company, so both companies can have a
          SUP-0001. New codes come from one shared counter, so a company&rsquo;s numbers are unique
          but not always consecutive.
        </p>
      </section>

      {/* The form */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or editing a supplier</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>Add Supplier</strong>. The form is the same for every kind of supplier:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Supplier Name</strong> (required) and <strong>Supplier Code</strong>. Leave the code blank and the next SUP-#### is given automatically. Clearing the code of an existing supplier keeps its old code. A code another supplier of your company already has is refused with a message naming the code.</li>
          <li><strong>Role(s)</strong> (required): one or more supplier types from Settings › Vocabulary. A driver who also meets clients at the airport holds both roles. The first role is the main one, shown on the badge.</li>
          <li><strong>Status</strong>: Active, Inactive or Pending.</li>
          <li>Contact: <strong>Contact Person</strong>, <strong>Email</strong>, <strong>Phone</strong>, <strong>WhatsApp</strong>, <strong>Website</strong>.</li>
          <li>Location: <strong>City</strong> (from the city list) and <strong>Address</strong>. The country is Egypt unless a CSV says otherwise.</li>
          <li><strong>Notes</strong>.</li>
        </ul>
        <p className="text-gray-600">
          Commission is not on this form: it is set under{' '}
          <strong>Rates › Commissions</strong> (a rate from 0 to 100; 0 means no commission). A
          guide&rsquo;s languages are set on the Guide Rates page.
        </p>
      </section>

      {/* Browsing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Finding suppliers</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Grid, table and list views.</li>
          <li><strong>Search</strong> looks in the code, name, contact person, email and city.</li>
          <li>The <strong>role chips</strong> filter by role. Each chip counts the suppliers holding that role, so a supplier with two roles is counted on both chips; <strong>All</strong> counts each supplier once.</li>
          <li>Filter by <strong>status</strong>, and sort by name, type, city or status.</li>
          <li>Every supplier of your company is loaded, however many there are.</li>
        </ul>
      </section>

      {/* Detail view */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A supplier&rsquo;s page</h2>
        <p className="text-gray-600 mb-3">Click a supplier to open it. It has these tabs:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Details</strong>: contact, location, status and notes. The money section shows
            the commission (&ldquo;We pay&rdquo; or &ldquo;We receive&rdquo; and the percentage)
            when the supplier has one above 0%, with a link to manage it under Rates ›
            Commissions.
          </li>
          <li>
            <strong>Properties</strong>, for hotel groups (their hotels), cruise lines (their ships)
            and train operators (their trains). Each property has its own name, city and contact.
            A property that rates still use cannot be deleted &mdash; deactivate it instead.
          </li>
          <li>
            <strong>Rates</strong>: every rate in your company that names this supplier, whatever
            its role &mdash; a guide&rsquo;s guide rates, a hotel group&rsquo;s hotel rates, a
            transport company&rsquo;s routes (one line per vehicle), cruises, trains, flights,
            meals, activities, airport and hotel assistance. Each line shows the type, the code,
            what it prices, and the EU-passport and non-EU-passport price. Each price is shown in
            the rate&rsquo;s own currency (a rate entered in EGP shows pounds); a rate with no
            currency of its own is shown in your company&rsquo;s rate currency. Inactive rates are
            greyed out. Entrance fees are not listed here.
          </li>
          <li><strong>Documents</strong>: not available yet.</li>
        </ul>
      </section>

      {/* Delete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting and deactivating</h2>
        <p className="text-gray-600 mb-3">
          A supplier can be deleted only when nothing in your records points at it. Delete is
          refused, with the counts of what blocks it, while the supplier has any of these:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>properties (hotels, ships, trains)</li>
          <li>rates, in any rate table</li>
          <li>trip assignments (an itinerary&rsquo;s guide, airport or hotel assistant, or a resource assigned to a trip), departure assignments, or bookings it is the guide on</li>
          <li>booking statuses, booking extras or catalogue extras</li>
          <li>invoices, expenses or commissions</li>
          <li>priced services on a trip, or trip services it sold</li>
          <li>vouchers and other supplier documents</li>
        </ul>
        <p className="text-gray-600 mb-3">
          The message reads, for example, &ldquo;Supplier is referenced by 1 properties, 12 rates
          &mdash; deactivate it instead&rdquo;, and the dialog offers a{' '}
          <strong>Deactivate instead</strong> button, which sets the status to Inactive. An
          inactive supplier keeps every property, rate, assignment and record.
        </p>
        <p className="text-gray-600">
          With several suppliers selected, <strong>bulk delete</strong> deletes the ones it can and
          lists each refused supplier with its reason.
        </p>
      </section>

      {/* CSV */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Importing and exporting suppliers</h2>
        <p className="text-gray-600 mb-3">
          The list has <strong>Sample CSV</strong>, <strong>Import CSV</strong> and{' '}
          <strong>Export</strong> buttons. The sheet&rsquo;s columns are: name, supplier_code,
          roles (several separated by <code>;</code>), status, contact_name, contact_email,
          contact_phone, whatsapp, website, city, country, address, notes,
          default_commission_rate (0&ndash;100), commission_type (payable = we pay them,
          receivable = they pay us; blank with a rate = receivable) and languages (a guide&rsquo;s
          languages, separated by <code>;</code>).
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Export</strong> writes the suppliers currently on screen (after your filters and search), in screen order.</li>
          <li>
            <strong>Import</strong> checks the file first and shows a preview: how many rows will
            add new suppliers, which rows will <strong>update</strong> a supplier you already have,
            and every row that cannot be imported, with its line number and reason. Nothing is
            written until you confirm. Then the good rows are imported and the others are left out.
          </li>
          <li>
            Matching: a row with a supplier_code updates your supplier with that code (even if the
            name in the file is new &mdash; that renames it). A row without a code updates your
            supplier with the same name (capital letters ignored). Anything else is added as a new
            supplier.
          </li>
          <li>
            An update writes the columns the file has. A column missing from the file is left as it
            is; an empty cell in a column the file has clears that field (except status, country
            and supplier code, which keep their value when blank).
          </li>
          <li>
            Rows refused in the preview: the same name or the same supplier code twice in the file;
            a new code on a row whose name you already have under another code; a code whose
            supplier is not the one named, when the name belongs to another of your suppliers; a
            name two of your suppliers share, with no code to pick one; an unknown role; a
            commission outside 0&ndash;100.
          </li>
          <li>The example row from the sample sheet is skipped.</li>
          <li>Matching only looks at your own company&rsquo;s suppliers.</li>
        </ul>
        <Tip>
          Import suppliers <em>before</em> their rates. A rate row whose supplier code is not in
          your company is refused, not guessed &mdash; see{' '}
          <Link href="/docs/bulk-csv" className="text-primary-600 hover:underline">Bulk Import (CSV)</Link>.
        </Tip>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not hold prices. Rates are entered on the rate pages under Rates.</li>
          <li>It does not set commissions or guide languages on the form; those are under Rates › Commissions and Guide Rates (or in the CSV).</li>
          <li>It does not delete a supplier anything still points at. Deactivate it instead.</li>
          <li>Some rate pickers still list inactive suppliers.</li>
          <li>The Documents tab is not available yet.</li>
        </ul>
      </section>
    </div>
  )
}
