import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ActivityLogPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Activity Log</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Activity Log</h1>
      <p className="text-gray-600 mb-8">
        The Activity Log is your company&rsquo;s audit trail: who saved a change through the app, when,
        what it touched, and from which IP address. For role, membership and seasonal premium changes it
        also shows the values before and after. Open it from{' '}
        <strong>Home &rsaquo; Settings &rsaquo; Activity Log</strong>. The owner, admins and managers can
        see it; agents and viewers do not have it in their menu and cannot open it. You see only your own
        company&rsquo;s entries. Entries cannot be edited or deleted, by anyone.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What is recorded</h2>
        <p className="text-gray-600 mb-3">There are two kinds of entry.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>
            <strong>A request entry</strong> for every create, update or delete a signed-in person sends to
            the app&rsquo;s server, once their role allows that kind of change. It records the person, the
            time, the action, the area and record it was aimed at, and the IP address. It does not record
            field values, and it does not say whether the change then succeeded: a request the server turns
            down for another reason (a missing field, a duplicate name) still has an entry.
          </li>
          <li>
            <strong>A change entry</strong>, added only after the change was saved, with the values before
            and after. These are written for:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>a user&rsquo;s role or active status changed on <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link> (for example &ldquo;sam@example.com: Role agent &rarr; manager&rdquo;)</li>
              <li>a login deleted, or a person removed from this company</li>
              <li>an invitation accepted: the new member and the role they joined with</li>
              <li>a <Link href="/docs/seasonal-premiums" className="text-primary-600 hover:underline">seasonal premium</Link> created, deleted, renamed, re-priced or switched on or off, and its dates added, moved or deleted</li>
            </ul>
          </li>
        </ul>
        <p className="text-gray-600">
          A change on that list therefore shows two lines: the request and, under it in time, the change
          with its values.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The table</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>When</strong>: the date and time in your browser&rsquo;s time zone.</li>
          <li><strong>Who</strong>: the person&rsquo;s email. If the entry has none, their profile email or name; if the account no longer exists, the first 8 characters of their user id.</li>
          <li><strong>Action</strong>: Create (POST), Update (PUT or PATCH) or Delete (DELETE).</li>
          <li><strong>Target</strong>: the area (the part of the address after <code>/api/</code>, for example <code>rates/attractions</code> or <code>profiles</code>) and the first 8 characters of the record&rsquo;s id, with the method and full address underneath. For a change entry, the before and after values are shown below that.</li>
          <li><strong>IP</strong>: the address the request came from, when known.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The newest entries come first, 50 to a page, with the total (&ldquo;N entries&rdquo;) and page
          arrows at the bottom.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Finding things</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Filter by user email</strong>: any part of the email.</li>
          <li><strong>Filter by area (e.g. rates, bookings)</strong>: any part of the area name.</li>
          <li><strong>All actions</strong>: or only Create, Update or Delete.</li>
          <li><strong>From</strong> and <strong>To</strong> dates: both days included, counted in your own time zone, the same as the When column.</li>
        </ul>
        <p className="text-gray-600 mt-3">Questions it answers:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>&ldquo;Who made Sam a manager?&rdquo;: filter the area to <code>profiles</code>.</li>
          <li>&ldquo;Who raised the Golden Week premium?&rdquo;: filter the area to <code>pricing/seasons</code>.</li>
          <li>&ldquo;What did this account do last Tuesday?&rdquo;: filter by the email and that date.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not record everything. Not recorded: changes the trip editor saves straight from the browser (a trip&rsquo;s days and its services and their prices), scheduled jobs, incoming webhooks, the traveller portal, staff links and the share-page chat, and anything only read.</li>
          <li>It does not show field values except for the changes listed above. For any other update you see that a record was changed, not what was in it.</li>
          <li>It does not say whether a request entry succeeded.</li>
          <li>It cannot be edited, deleted or exported from the app.</li>
        </ul>
        <Tip>
          Changes to the rate tables also reach the owner, admins and managers as a digest notification.
          Seasonal premiums are not part of that digest; this log is where you see them.
        </Tip>
      </section>
    </div>
  )
}
