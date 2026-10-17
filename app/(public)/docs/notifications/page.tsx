import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function NotificationsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Notifications</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Notifications</h1>
      <p className="text-gray-600 mb-8">
        Notifications tell you about work that needs you: a task or trip assigned to you, a task coming due, a customer
        request from the traveller portal. They appear in the bell and on the Notifications page, and can also be emailed to you.
      </p>

      {/* Where and who */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where to find them and who sees what</h2>
        <p className="text-gray-600 mb-3">
          Every role (owner, admin, manager, agent and viewer) has the <strong>bell</strong> at the top of the sidebar and
          can open the <strong>Notifications</strong> page from it (<strong>View all notifications</strong>).
        </p>
        <p className="text-gray-600">
          You see only notifications addressed to you, and only those of the company you are working in. If you work
          in two companies, each company&apos;s notifications appear while you work in that company.
        </p>
      </section>

      {/* Types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What creates a notification</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Label</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">When</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Who gets it</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Task assigned</td>
                <td className="px-4 py-2.5">A task is assigned on the Tasks screen, or tasks are generated for an itinerary</td>
                <td className="px-4 py-2.5">The person the task is assigned to</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Task due soon</td>
                <td className="px-4 py-2.5">The day before an open task&apos;s due date (daily check, at most once a day)</td>
                <td className="px-4 py-2.5">The assignee</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Task overdue</td>
                <td className="px-4 py-2.5">An open task is past its due date (repeated every three days)</td>
                <td className="px-4 py-2.5">The assignee</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Trip assigned</td>
                <td className="px-4 py-2.5">An itinerary is assigned to someone</td>
                <td className="px-4 py-2.5">That person</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">WhatsApp chat assigned</td>
                <td className="px-4 py-2.5">A WhatsApp conversation is assigned to someone</td>
                <td className="px-4 py-2.5">That person</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Email conversation assigned</td>
                <td className="px-4 py-2.5">An email conversation is assigned to someone else in the Unified Inbox</td>
                <td className="px-4 py-2.5">That person</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium">Order received</td>
                <td className="px-4 py-2.5">An order arrives through the public order form or order intake</td>
                <td className="px-4 py-2.5">Owner, admins and managers</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium">Customer request</td>
                <td className="px-4 py-2.5">A traveller asks for a change or an extra on the portal, accepts an extra, or sends a portal message</td>
                <td className="px-4 py-2.5">Owner, admins and managers</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium">Rates changed</td>
                <td className="px-4 py-2.5">Supplier rates were changed (grouped per person and rate table, checked every 15 minutes). Only if the company has rate change alerts turned on.</td>
                <td className="px-4 py-2.5">Owner, admins and managers, except the person who made the change</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Bell */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The bell</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The red badge counts all your unread notifications in this company (shown as 9+ above nine). It refreshes every 30 seconds.</li>
          <li>The list shows your latest 10. Each has <strong>View</strong> (opens the linked record and marks it read), <strong>Read</strong>, and an X to delete it.</li>
          <li><strong>Mark all read</strong> marks every unread notification in this company as read.</li>
          <li><strong>Clear all</strong> asks for confirmation, then deletes all of your notifications in this company, not only the ten shown. This cannot be undone.</li>
        </ul>
      </section>

      {/* Page */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Notifications page</h2>
        <p className="text-gray-600 mb-3">The page loads your latest 100 notifications. Above the list:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Search notifications</strong> &mdash; by title or message</li>
          <li><strong>All / Unread only</strong></li>
          <li><strong>All types</strong> &mdash; WhatsApp chat assigned, Task assigned, Task due soon, Task overdue, plus any other type present in the loaded list</li>
          <li><strong>Mark all as read</strong> &mdash; shown while you have unread items</li>
        </ul>
        <p className="text-gray-600 mb-3">
          Four cards count the loaded notifications: <strong>Total</strong>, <strong>Unread</strong>, unread
          <strong> WhatsApp</strong> ones and unread <strong>Tasks</strong>.
        </p>
        <p className="text-gray-600">
          Each notification shows its type, its age (&ldquo;5 minutes ago&rdquo;, then the date in your screen language
          after a week), the message, and buttons to <strong>View</strong> or <strong>Open chat</strong>,
          <strong> Mark as read</strong>, and <strong>Delete</strong> (with confirmation). <strong>Email sent</strong> marks
          the ones that were also emailed.
        </p>
      </section>

      {/* Email */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Email</h2>
        <p className="text-gray-600 mb-3">
          A notification can also be emailed to you, from your company&apos;s mailbox, with the subject starting
          &ldquo;[Autoura]&rdquo;. Portal messages are never emailed, and rate changes are emailed only if the company
          chose in-app and email alerts.
        </p>
        <p className="text-gray-600 mb-3">
          Everyone, including agents and viewers, chooses this for themselves under
          <strong> Email me about notifications</strong> on the Notifications page. Managers and above also find the same
          choices in <strong>Settings › Notifications</strong>.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Send notifications to my email</strong> &mdash; the master switch. Off means no notification email at all.</li>
          <li><strong>Task assigned to me</strong>, <strong>My task is due soon</strong>, <strong>My task is overdue</strong> &mdash; turn off email for each task type separately.</li>
          <li>Every other type is emailed whenever the master switch is on.</li>
        </ul>
        <Tip>
          The choice is yours and is kept separately for each company you work in: switch company to set the other
          one. Until you save a choice in a company, it starts from the one you saved before. It only affects email: every
          notification still appears in the bell and on this page.
        </Tip>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>There is no way to hide a type from the bell; you can only turn its email off.</li>
          <li>No notification is created when a task is completed or when a new WhatsApp message arrives. The WhatsApp inbox shows unread counts instead.</li>
          <li>The page shows the latest 100 notifications; there is no &ldquo;load more&rdquo;. Older ones are reached by deleting or clearing newer ones.</li>
          <li>The stat cards count only the loaded notifications.</li>
          <li>Notifications are not pushed to your phone or desktop; the bell checks every 30 seconds while the app is open.</li>
        </ul>
      </section>
    </div>
  )
}
