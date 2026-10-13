import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

export default function FollowupsRemindersPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Follow-ups</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Follow-ups</h1>
      <p className="text-gray-600 mb-4">
        A follow-up is a dated reminder to get back to a client: a call, an email, a quote to send. You schedule it on the client&rsquo;s page and work through them on the Follow-up Dashboard, at <strong>Operate &rsaquo; Follow-ups</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        Owners, admins, managers and agents have it in their menu and can open it. Viewers do not. You only see the follow-ups of the company you are working in, and your role there is what counts: if you belong to two companies, switch company to see the other one&rsquo;s.
      </p>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Scheduling a follow-up</h2>
        <p className="text-gray-600 mb-3">
          The Follow-up Dashboard has no &ldquo;new&rdquo; button. Open the client, then click <strong>Add Follow-up</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Follow-up Type</strong> &mdash; Phone Call, Email, WhatsApp Message, Meeting, Send Quote, Booking Confirmation, Payment Reminder, Request Feedback or Other.</li>
          <li><strong>Due Date</strong> (required).</li>
          <li><strong>Priority</strong> &mdash; Low, Medium (the default), High or Urgent.</li>
          <li><strong>Notes</strong> (optional) &mdash; Shown under the follow-up on the dashboard.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          You become the follow-up&rsquo;s owner, which is who gets its reminder. Click a follow-up on the client&rsquo;s page to edit or delete it, or mark it complete there.
        </p>
      </section>

      {/* Dashboard */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Follow-up Dashboard</h2>
        <p className="text-gray-600 mb-3">
          Titled &ldquo;Follow-up Dashboard&rdquo; (&ldquo;Never miss a client touchpoint&rdquo;), with a <strong>Back to Clients</strong> button. It lists pending follow-ups only. Four cards count them on the server, over all of your company&rsquo;s pending follow-ups; each card is also a filter:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Due Today</strong> &mdash; Due today. This is the view the page opens on.</li>
          <li><strong>This Week</strong> &mdash; Due from today to seven days ahead.</li>
          <li><strong>Overdue</strong> &mdash; Due before today.</li>
          <li><strong>All Pending</strong> &mdash; Every pending follow-up.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          &ldquo;Today&rdquo; is the date on your own computer&rsquo;s calendar. Two drop-downs narrow the list further: priority (Low, Medium, High, Urgent) and type (every type the Add Follow-up form offers).
        </p>
        <p className="text-gray-600 mt-3">
          Each row shows the client&rsquo;s name (a link to the client) and client code, a priority badge (Urgent in solid red), the type, the due date marked (Overdue) or (Today), your notes, and the client&rsquo;s phone and email as links. The page loads up to 1,000 follow-ups, soonest first; if more are pending, an amber note says so (the cards still count them all). If the list cannot be loaded, a red message says so instead of &ldquo;All Caught Up!&rdquo;.
        </p>
        <DocScreenshot src="/docs/followups-reminders/followups.jpg" alt="Follow-ups list with scheduled dates, client names, and status indicators" />
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Working a follow-up</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Complete</strong> &mdash; Marks it completed, recording who and when. It leaves the dashboard.</li>
          <li><strong>Snooze 1 Day</strong> / <strong>Snooze 1 Week</strong> &mdash; Moves the due date one day or seven days later than it was. An overdue follow-up moves to one day or seven days after today instead, so it is never still overdue after a snooze.</li>
          <li><strong>Delete</strong> &mdash; Removes it, after a confirmation.</li>
        </ul>
      </section>

      {/* Reminder */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The due-day reminder</h2>
        <p className="text-gray-600 mb-3">
          On a follow-up&rsquo;s due date, the daily reminder job (06:10 UTC, the same one that sends task reminders) gives its owner one in-app notification: &ldquo;Follow-up due today&rdquo;, linking to this page. It is sent once per due date; snoozing or changing the date sends it again on the new day. It is not emailed.
        </p>
        <Tip>
          Pending follow-ups scheduled before follow-ups had owners were given one: the person the activity log shows scheduling it, else the person who created the client, else whoever is assigned to the client&rsquo;s latest trip &mdash; always someone in the client&rsquo;s company. Any that none of these could name still have no owner and remind nobody; they were set aside for review. Someone who has left the company is not reminded.
        </Tip>
      </section>

      {/* Dashboard */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">On the main Dashboard</h2>
        <p className="text-gray-600">
          The <strong>Dashboard</strong> lists your company&rsquo;s five soonest pending follow-ups due from today on, and counts pending and overdue ones.
        </p>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>No email or WhatsApp reminders, and no reminder before the due date &mdash; only the in-app one on the day.</li>
          <li>No due time: a follow-up is due on a date.</li>
          <li>No way to assign a follow-up to someone else; the person who schedules it owns it.</li>
          <li>Completed follow-ups are not listed on this page; see them on the client&rsquo;s page.</li>
          <li>No separate &ldquo;Reminders&rdquo; page for follow-ups. Invoice payment reminders are a different feature, described in <Link href="/docs/invoice-reminders" className="text-primary-600 hover:underline">Invoice Reminders</Link>.</li>
        </ul>
      </section>
    </div>
  )
}
