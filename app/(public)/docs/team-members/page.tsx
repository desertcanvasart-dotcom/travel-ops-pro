import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function TeamMembersPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Team Members</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Team Members</h1>
      <p className="text-gray-600 mb-8">
        <strong>People &rarr; Team Members</strong> is your operational staff directory: everyone who does the work, whether or not they ever log in. Admins and managers open it; the owner always can. Team members are what you pick from in <em>task assignment</em> dropdowns, the itinerary&apos;s <em>Trip owner</em> selector, the Generate tasks dialog and WhatsApp and email conversation assignment. This is the second of Autoura&apos;s two people-systems &mdash; see <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link> for the comparison table. Team members are private to your company.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Member</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Member</strong></li>
          <li>Fill in name (required), email, phone, role, department and notes:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Role</strong> &mdash; Owner, Manager, Coordinator, Sales, Tour Guide, Driver or Staff. These are <em>job labels</em>, not access levels; the Owner label has nothing to do with the system owner, and a Driver here has no login unless you give them one</li>
              <li><strong>Department</strong> &mdash; one of your active <Link href="/docs/departments" className="text-primary-600 hover:underline">Departments</Link>. It is shown on the card and counted there; it does not route tasks</li>
              <li><strong>Email</strong> &mdash; one person per email in your company. A second member with the same address (in any capitalisation) is refused</li>
            </ul>
          </li>
        </ol>
        <p className="text-gray-600 mt-3">
          Availability and the maximum number of chats are not on this page; they are set in WhatsApp <em>Manage Agents</em>, which lists the same people.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Linking a Member to a Login</h2>
        <p className="text-gray-600 mb-3">
          When a member&apos;s email is the email of a login in <em>your company</em>, Autoura links the two when you add or edit the member (and changing the email relinks). A linked member gets in-app notifications (for example &ldquo;You now own this trip&rdquo;), and is &ldquo;me&rdquo; in the WhatsApp inbox. A login of another company is never linked, even with the same address. If two logins share the address, nothing is linked.
        </p>
        <p className="text-gray-600">
          Members that existed before this rule were linked once where exactly one login of their company matched.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Page</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Tiles: active members, then active Owners, Managers and Coordinators (by role label)</li>
          <li>Filters: search by name or email, role, and <strong>Show inactive</strong></li>
          <li>Each card shows role, department, phone, email, notes and an access chip: <strong>System user</strong> (the email is a login of your company), <strong>Invitation sent</strong> (a pending invitation for it) or <strong>Invite to system</strong></li>
          <li>If the list, a save, a deactivate or a reactivate fails, a red message says why (for example a duplicate email)</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where Members Appear</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Task assignment</strong> &mdash; active members only. Assigning a task notifies the member if they have a linked login. A deactivated person is refused as an assignee, including in the Generate tasks dialog</li>
          <li><strong>Trip owner</strong> &mdash; every itinerary can name the member responsible; only active members can be chosen</li>
          <li><strong>Conversation assignment</strong> &mdash; WhatsApp and email threads can be assigned to a member by hand. New WhatsApp chats are assigned automatically only to members who are active, available, have a linked login and have fewer open chats than their maximum; nobody else is picked</li>
          <li><strong>Departments</strong> &mdash; the department page counts a department&apos;s active members. Membership does not decide who receives routed tasks</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invite to System</h2>
        <p className="text-gray-600 mb-3">
          A team member who needs to <em>use</em> Autoura gets a login through the <strong>Invite to system</strong> link on their card. It opens a dialog to choose the access role (Agent, Manager, Admin or Viewer) and sends a User Management invitation by email; if the email cannot be sent, the dialog shows the invitation link to pass on yourself. Only admins (and the owner) can invite, so managers see a short note instead of the link. Once the person accepts and their login email matches the member&apos;s email, saving the member links them (see above).
        </p>
        <Tip>Deactivating a member does not touch their login. If they also hold one, deactivate that separately in User Management.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deactivating</h2>
        <p className="text-gray-600 mb-3">
          <strong>Deactivate</strong> does what Manage Agents does: the member is marked inactive and unavailable, and every WhatsApp and email conversation assigned to them is unassigned. They disappear from assignment dropdowns. Trips and tasks already assigned to them keep their name; Autoura does not move them, so reassign any you still need. <strong>Reactivate</strong> brings them back (but not their conversations).
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not give anyone access: roles here are labels, access comes from a login&apos;s role in User Management</li>
          <li>It does not route tasks by department</li>
          <li>It does not move trips or tasks when someone is deactivated</li>
          <li>It does not delete members; they are only deactivated</li>
        </ul>
      </section>
    </div>
  )
}
