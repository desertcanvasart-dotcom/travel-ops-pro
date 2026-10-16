import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function CapacityDeparturesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Capacity</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Capacity</h1>
      <p className="text-gray-600 mb-4">
        <strong>Operate &rsaquo; Capacity</strong> is a month calendar of how many groups you can take each day. The availability
        check, the partner availability API and the WhatsApp assistant read it. A day with no entry counts as available with 3
        groups.
      </p>
      <p className="text-gray-600 mb-8">
        The menu shows it to the owner, Administrators and Managers. Agents and Viewers do not see it.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The calendar</h2>
        <p className="text-gray-600 mb-3">
          It opens on your current month (your own date, not UTC) and starts each week on Monday. The legend shows the four
          statuses: Available, Limited, Busy and Blackout. Each day shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>N/M groups</strong> &mdash; groups out that day against the day&apos;s Max groups, and <strong>N free</strong>.</li>
          <li><strong>guides N/M</strong> and <strong>vehicles N/M</strong> when the day has those limits.</li>
          <li>The reason, if one is set.</li>
          <li><strong>not set</strong> for a day with no entry, with its groups out if there are any (against the default 3).</li>
        </ul>
        <p className="text-gray-600 mt-3">A day over any of its limits is outlined in red and marked <strong>over</strong>; hover it to see which.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How groups out are counted</h2>
        <p className="text-gray-600 mb-3">You do not type booked groups. The app counts, for each day:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>each sold trip (an itinerary that is Confirmed or Completed) on the road that day, from its start date to its end date;</li>
          <li>each running departure (Open, Limited, Full or Guaranteed) on the road that day with at least one seat taken &mdash; see <Link href="/docs/departures" className="text-primary-600 hover:underline">Departures</Link>.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Each counts as one group. <strong>Guides</strong> and <strong>vehicles</strong> are the different guides and vehicles
          assigned to those trips and departures. A trip with no guide or vehicle assigned adds none.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing days</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click a day. Shift-click another day in the same month to select the range between them.</li>
          <li>Set <strong>Status</strong> (or Leave unchanged), <strong>Max groups</strong>, <strong>Max guides</strong>, <strong>Max vehicles</strong> and the <strong>Reason</strong>.</li>
          <li>Click <strong>Save N days</strong>.</li>
        </ol>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mt-3">
          <li>Fields showing &ldquo;unchanged&rdquo; keep what each day already had.</li>
          <li>Empty Max guides or Max vehicles to remove that limit (&ldquo;no limit&rdquo;).</li>
          <li><strong>Reset to not set</strong> removes the selected days&apos; entries, so they count as available with 3 groups again.</li>
          <li>Counts must be whole numbers of 0 or more; anything else is refused with a message.</li>
          <li>The Reason is shown to clients and partners when the day is Busy or Blackout.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How the availability check decides</h2>
        <p className="text-gray-600 mb-3">
          For a date range, each day gets its status and the group slots left: Max groups (3 for a day with no entry) minus the
          groups out, never below 0. One enquiry is one group, whatever the party size. Then:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Blackout</strong> on any day &mdash; not available, with the reason.</li>
          <li><strong>Busy</strong> with no slot left on any day &mdash; fully booked.</li>
          <li><strong>Limited</strong> on any day &mdash; available, with a &ldquo;book soon&rdquo; message.</li>
          <li>Otherwise &mdash; available.</li>
        </ul>
        <Tip>The status is what you set. An Available or Limited day stays bookable even when its groups out reach Max groups &mdash; only a Busy day uses the slot count. Mark a day Busy if a full day should turn enquiries away.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not change a day&apos;s status for you; groups out never make a day Busy.</li>
          <li>Max guides and Max vehicles only flag a day as over; they do not stop a trip being confirmed or a guide being assigned.</li>
          <li>Range selection does not cross months.</li>
          <li>Internal notes and notes have no fields on this page.</li>
          <li>The WhatsApp assistant&apos;s replies are drafts not yet shown in the app, so customers are not answered from these numbers automatically. See <Link href="/docs/whatsapp-agent" className="text-primary-600 hover:underline">WhatsApp AI Agent</Link>.</li>
        </ul>
      </section>
    </div>
  )
}
