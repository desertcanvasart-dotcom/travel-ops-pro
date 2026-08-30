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
        <strong>Settings &rarr; User Management</strong> holds <em>login accounts</em> &mdash; the people who can sign in, and what each of them is allowed to do. It is one of two people-systems in Autoura: the other is <Link href="/docs/team-members" className="text-primary-600 hover:underline">Team Members</Link>, the operational staff directory. Read the comparison below before inviting anyone; mixing the two up is the most common setup confusion.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Roles &amp; What They Can Do</h2>
        <p className="text-gray-600 mb-3">A user&apos;s role comes from their organization membership and gates every page and API:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Role</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Access</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr><td className="px-3 py-2 font-medium">Owner</td><td className="px-3 py-2">Everything, always &mdash; the owner passes every gate without being named in it. Ownership is transferred, never invited.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Administrator</td><td className="px-3 py-2">Everything, including Settings, User Management, the Activity Log, and financial configuration.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Manager</td><td className="px-3 py-2">Operations plus finance: rates, financial reports, receipts, bills, commissions, P&amp;L &mdash; but not user management or company settings.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Agent</td><td className="px-3 py-2">Day-to-day sales work: clients, itineraries, invoices, payments, tasks, the inboxes, tours and follow-ups.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Viewer</td><td className="px-3 py-2">The dashboard only. The default for an account with no explicit role &mdash; access fails closed.</td></tr>
            </tbody>
          </table>
        </div>
        <Tip>The very first account to sign up on a fresh install automatically becomes the <strong>Owner</strong> of the organization. Later signups are members of nothing until someone invites them.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Inviting a User</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Invite User</strong> and enter their email and role (Administrator, Manager, Agent or Viewer &mdash; ownership can&apos;t be invited)</li>
          <li>They receive an email link; following it creates their account already confirmed and attached to your organization</li>
          <li>Until they accept, they appear under <strong>Pending Invites</strong>, where the invitation can be cancelled</li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Activating, Deactivating &amp; Deleting</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Deactivate</strong> blocks sign-in everywhere while keeping the account and its history. Deactivation is account-level: an inactive person is inactive in every organization.</li>
          <li><strong>Activate</strong> restores a deactivated account with its previous role.</li>
          <li><strong>Delete user permanently</strong> removes the account after a confirmation. Records they created remain, attributed to their name in history. This cannot be undone &mdash; prefer deactivation for people who might return.</li>
        </ul>
        <Tip>Least privilege pays off: give people the lowest role that covers their actual work, and keep the number of Administrators small. Every admin can see and change everything, including this page.</Tip>
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
              <tr><td className="px-3 py-2 font-medium">What it holds</td><td className="px-3 py-2">Login accounts (who can sign in)</td><td className="px-3 py-2">Operational staff (who does the work)</td></tr>
              <tr><td className="px-3 py-2 font-medium">Roles</td><td className="px-3 py-2">Administrator / Manager / Agent / Viewer</td><td className="px-3 py-2">Owner / Manager / Coordinator / Sales / Tour Guide / Driver / Staff</td></tr>
              <tr><td className="px-3 py-2 font-medium">Controls</td><td className="px-3 py-2">Access to pages and data</td><td className="px-3 py-2">Task assignment, trip ownership, department membership</td></tr>
              <tr><td className="px-3 py-2 font-medium">Overlap</td><td className="px-3 py-2 text-gray-600" colSpan={2}>A team member who needs to log in gets a login via <em>Invite to system</em> on their Team Members row. A driver who never opens Autoura is a team member with no user account &mdash; that is normal.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
