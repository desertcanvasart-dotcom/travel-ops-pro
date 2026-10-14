import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function UserManagementPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">User Management</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">User Management</h1>
      <p className="text-gray-600 mb-8">
        User Management holds the <em>logins</em> of your company: the people who can sign in, and the
        role that decides what each of them can do. Open it from{' '}
        <strong>Home &rsaquo; Settings &rsaquo; User Management</strong>. The owner, admins and managers
        see it in their menu. The owner and admins can invite people and change them; managers see the
        same page read-only, with no Invite button and no controls. Agents and viewers cannot open it,
        and the list of users and invitations is not available to them in any other way either. It is
        one of two people lists: the other is{' '}
        <Link href="/docs/team-members" className="text-primary-600 hover:underline">Team Members</Link>,
        the staff directory (see the comparison at the end).
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Roles</h2>
        <p className="text-gray-600 mb-3">A person&rsquo;s role is their role in this company. Someone in two companies can hold a different role in each.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Role</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Access</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr><td className="px-3 py-2 font-medium">Owner</td><td className="px-3 py-2">Everything, always. The owner passes every role check. Ownership cannot be invited or picked from the role list.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Administrator</td><td className="px-3 py-2">Everything a manager can do, plus administering the company: inviting people, changing roles, deactivating, deleting and removing people, and the company settings. An admin cannot change, deactivate, delete or remove another admin or the owner; only the owner can change an admin.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Manager</td><td className="px-3 py-2">Sees every page, Settings, User Management and the Activity Log included, and runs operations and finance: rates, seasonal premiums, financial reports, receipts, bills, commissions, profit and loss. Cannot invite people or change roles.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Agent</td><td className="px-3 py-2">Day-to-day sales work: clients, itineraries, the Pricing Grid, invoices, payments, tasks, the inboxes, tours and follow-ups.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Viewer</td><td className="px-3 py-2">The dashboard and notifications.</td></tr>
            </tbody>
          </table>
        </div>
        <Tip>The very first account to sign up on a fresh install becomes the <strong>Owner</strong> of its company. Later sign-ups belong to no company until someone invites them.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The page</h2>
        <p className="text-gray-600 mb-3">
          The title is &ldquo;User Management&rdquo; with &ldquo;Manage user accounts and access
          permissions&rdquo; under it. Four figures sit at the top:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Total Users</strong>: everyone with a login in this company.</li>
          <li><strong>Active</strong>: how many of them are not deactivated.</li>
          <li><strong>Pending Invites</strong>: invitations not yet accepted and not yet expired.</li>
          <li><strong>Admins</strong>: the owner plus the administrators.</li>
        </ul>
        <p className="text-gray-600 mb-3">
          Two tabs, <strong>Users (n)</strong> and <strong>Invitations (n)</strong>, and a search box
          (&ldquo;Search users...&rdquo;) that matches a name or an email.
        </p>
        <p className="text-gray-600">
          Each user row shows the name, the email, an <strong>Inactive</strong> badge when deactivated, the
          role (Owner, Administrator, Manager, Agent or Viewer), &ldquo;Joined&rdquo; and the date, and
          &ldquo;Last login&rdquo; when known. For the owner and admins the role is a drop-down (except on
          the owner&rsquo;s row), followed by the action buttons described below.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who can change whom</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The owner and admins can change the role of managers, agents and viewers, and deactivate, delete or remove them.</li>
          <li>Only the owner can do this to an admin.</li>
          <li>Nobody can do it to the owner. Ownership is transferred, not edited here.</li>
          <li>Nobody can change their own role or active status, or delete themselves.</li>
          <li>A role can be set to Administrator, Manager, Agent or Viewer, never Owner.</li>
        </ul>
        <p className="text-gray-600 mt-3">If a change is not allowed, a message says why and nothing changes.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deactivate, delete, remove from this company</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Deactivate</strong> (the circle with a cross) blocks the login while keeping the account,
            its role and its history. A deactivated login cannot use the app in any company. Their open
            session is not ended, but the app refuses what they ask for. They cannot reactivate themselves.
            <strong> Activate</strong> (the tick) brings them back with their previous role.
          </li>
          <li>
            <strong>Delete user permanently</strong> (the bin) removes the login, its profile and its place in
            this company, after a confirmation. It cannot be undone. A login that still owns records (trips,
            departures, emails or integrations) cannot be deleted: you get the message &ldquo;This login still
            owns records (trips, departures, emails or integrations), so it cannot be deleted. Deactivate it
            instead.&rdquo; and nothing is changed. If the deletion fails for any other reason, nothing is
            changed either.
          </li>
          <li>
            <strong>Remove from this company</strong> (the person with a minus sign) is shown instead of
            Deactivate and Delete for someone who also belongs to another company. They have one login for
            both companies, so deactivating or deleting it would act in both. Removing them takes them out of
            this company only: their login, their profile and their place in the other company stay as they
            are. Deactivating or deleting such a person through any other route is refused with a message
            that says to use Remove from this company.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Inviting a user</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Invite User</strong> (owner and admins only).</li>
          <li>Enter the <strong>Email Address</strong> and pick a <strong>Role</strong>: Administrator (&ldquo;Full access to everything&rdquo;), Manager, Agent or Viewer.</li>
          <li>They get an email with a link that works for <strong>7 days</strong>. If the email cannot be sent, the invitation is still created and you get a warning with a link to pass on yourself.</li>
          <li>Following the link creates their login, already confirmed, in your company with the invited role. If the address already has a confirmed login, that login is added to your company and keeps its password.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          On the Invitations tab, pending invitations show &ldquo;Expires&rdquo; and the date, with
          <strong> Resend</strong> (a new link; the old one stops working) and <strong>Cancel</strong>.
          Expired invitations are listed separately with Resend and a bin to delete them.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">In the Activity Log</h2>
        <p className="text-gray-600">
          Role changes, deactivations and reactivations, deletions, removals from this company and accepted
          invitations each appear in the{' '}
          <Link href="/docs/activity-log" className="text-primary-600 hover:underline">Activity Log</Link>{' '}
          with the value before and after, for example &ldquo;Role agent &rarr; manager&rdquo;.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not edit names or phone numbers. Each person changes their own on their profile. An admin cannot change the name or phone of someone who also belongs to another company.</li>
          <li>It does not transfer ownership.</li>
          <li>It does not sign anyone out of a session that is already open.</li>
          <li>It does not delete a login that still owns records. Deactivate it instead.</li>
          <li>It does not deactivate or delete someone who also belongs to another company. Remove them from this company instead.</li>
        </ul>
        <Tip>Give people the lowest role that covers their work, and keep the number of administrators small.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">User Management vs Team Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700"></th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">User Management</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Team Members</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr><td className="px-3 py-2 font-medium">What it holds</td><td className="px-3 py-2">Logins (who can sign in)</td><td className="px-3 py-2">Operational staff (who does the work)</td></tr>
              <tr><td className="px-3 py-2 font-medium">Roles</td><td className="px-3 py-2">Owner / Administrator / Manager / Agent / Viewer</td><td className="px-3 py-2">Owner / Manager / Coordinator / Sales / Tour Guide / Driver / Staff</td></tr>
              <tr><td className="px-3 py-2 font-medium">Controls</td><td className="px-3 py-2">Access to pages and data</td><td className="px-3 py-2">Task assignment, trip ownership, department membership</td></tr>
              <tr><td className="px-3 py-2 font-medium">Overlap</td><td className="px-3 py-2 text-gray-600" colSpan={2}>A team member who needs to sign in gets a login through <em>Invite to system</em> on their Team Members row. A driver who never opens the app is a team member with no login, which is normal.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
