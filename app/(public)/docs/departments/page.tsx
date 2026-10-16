import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function DepartmentsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Departments</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Departments</h1>
      <p className="text-gray-600 mb-8">
        <strong>People &rarr; Departments</strong> decides which department owns each kind of work. Each department owns a set of <em>service types</em>; when tasks are generated from an itinerary, every task is filed under the department that owns its service type &mdash; so hotel reservations reach Reservation, ticketing reaches Aviation, and on-the-ground work reaches Execution. Admins and managers open and edit the page; the owner always can. Departments are private to your company.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Gets the Task</h2>
        <p className="text-gray-600 mb-3">
          The department only decides which department a task belongs to. <strong>Department membership does not assign tasks to people.</strong> The person for each department is chosen in the <em>Generate tasks</em> dialog on the itinerary; tasks without a person are created unassigned. A deactivated person cannot be chosen.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A Suggested Routing</h2>
        <p className="text-gray-600 mb-3">
          A new company starts with <strong>no departments</strong>, and a service category with no active department that owns it gets no task (the Generate tasks dialog lists what was skipped). Create the departments and tick their service types. A common split:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Department</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Service types</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr><td className="px-3 py-2 font-medium">Reservation</td><td className="px-3 py-2">accommodation, cruise, meal, transportation</td></tr>
              <tr><td className="px-3 py-2 font-medium">Aviation</td><td className="px-3 py-2">flight</td></tr>
              <tr><td className="px-3 py-2 font-medium">Execution</td><td className="px-3 py-2">guide, entrance, activity, airport_service, hotel_service, tips, supplies</td></tr>
              <tr><td className="px-3 py-2 font-medium">Accounting</td><td className="px-3 py-2">invoice, payment, commission (non-itinerary work)</td></tr>
            </tbody>
          </table>
        </div>
        <Tip>The ticks on this page win. If a service type is ticked nowhere, task generation falls back to a built-in default that matches departments by <em>name</em> (Reservation, Aviation, Execution, Accounting); a department with a different name gets nothing from it. Inactive departments get no tasks.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Departments</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Create</strong> a department with a name and, if you like, its service types typed with commas between them. A name already used in your company (in any capitalisation) is refused. You can tick or add service types on the card afterwards</li>
          <li><strong>Each card</strong> has an editable name, a description, the member count, an <strong>Active</strong> box, the service-type chips, <strong>Save</strong> and <strong>Delete</strong>. Changes apply when you press Save</li>
          <li><strong>Service types</strong> belong to one active department each. A chip another active department owns is greyed; saving a type someone else owns is refused with &ldquo;Service type already routed to &hellip;&rdquo;. A card also warns you before you save if the server still gives one of its types to another department</li>
          <li><strong>Members</strong> come from <Link href="/docs/team-members" className="text-primary-600 hover:underline">Team Members</Link>. The count on a card counts active members only; hover it to see their names</li>
          <li><strong>Active box</strong> pauses a department without losing its configuration. Its members stay in it and tasks already filed under it stay there. When you tick it again, the card warns you if a service type it lists now belongs to another active department; remove it here or there before saving</li>
          <li><strong>Delete</strong> is allowed for admins and managers. If the department has members or tasks, choose where they move: another active department or none. Its service types go with them (they become unrouted if you choose none). A department whose only members are deactivated needs no target for them</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not assign tasks to a department&apos;s members</li>
          <li>It does not create default departments for a new company</li>
          <li>It does not show a routing health report; unrouted service types only appear as skipped items when you generate tasks</li>
          <li>Agents and viewers cannot change departments</li>
        </ul>
      </section>
    </div>
  )
}
