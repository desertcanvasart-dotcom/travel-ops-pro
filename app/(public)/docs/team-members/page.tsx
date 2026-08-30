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
        <strong>Operations &rarr; Team Members</strong> is your operational staff directory: everyone who does the work, whether or not they ever log in. Team members are what you pick from in <em>task assignment</em> dropdowns, the itinerary&apos;s <em>Trip owner</em> selector, and department membership. This is the second of Autoura&apos;s two people-systems &mdash; see <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link> for the comparison table.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Member</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Member</strong></li>
          <li>Fill in name, role, department, phone and email:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Role</strong> &mdash; Owner, Manager, Coordinator, Sales, Tour Guide, Driver or Staff. These are <em>job descriptions</em>, not access levels; a Driver here has no login unless you give them one.</li>
              <li><strong>Department</strong> &mdash; where their routed work lands (see <Link href="/docs/departments" className="text-primary-600 hover:underline">Departments</Link>)</li>
            </ul>
          </li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where Members Appear</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Task assignment</strong> &mdash; assigning a task to a member notifies them (if they have a linked account)</li>
          <li><strong>Trip owner</strong> &mdash; every itinerary can name the member responsible; unowned trips prompt &ldquo;Nobody owns this trip yet&rdquo;</li>
          <li><strong>Departments</strong> &mdash; membership decides who receives that department&apos;s routed tasks</li>
          <li><strong>Conversation assignment</strong> &mdash; inbox threads can be assigned to available members</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invite to System</h2>
        <p className="text-gray-600 mb-3">
          A team member who needs to <em>use</em> Autoura gets a login through the <strong>Invite to system</strong> action on their row. That sends a User Management invitation (choose their access role there &mdash; typically Agent). The two records stay linked: the person is one human with a staff profile <em>and</em> an account.
        </p>
        <Tip>Deactivating a member keeps their history and removes them from assignment dropdowns. If they also hold a login, deactivate that separately in User Management.</Tip>
      </section>
    </div>
  )
}
