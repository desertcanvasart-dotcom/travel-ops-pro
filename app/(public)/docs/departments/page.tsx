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
        <strong>Operations &rarr; Departments</strong> routes work to teams. Each department owns a set of <em>service types</em>; when tasks are generated from an itinerary, every task lands with the department that owns its service type &mdash; so hotel reservations reach Reservation, ticketing reaches Aviation, and on-the-ground work reaches Execution, automatically.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Default Routing</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Department</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">Service types it owns</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              <tr><td className="px-3 py-2 font-medium">Reservation</td><td className="px-3 py-2">accommodation, cruise, meal, transportation</td></tr>
              <tr><td className="px-3 py-2 font-medium">Aviation</td><td className="px-3 py-2">flight</td></tr>
              <tr><td className="px-3 py-2 font-medium">Execution</td><td className="px-3 py-2">guide, entrance, activity, airport_service, hotel_service, tips, supplies</td></tr>
              <tr><td className="px-3 py-2 font-medium">Accounting</td><td className="px-3 py-2">invoice, payment, commission (non-itinerary work)</td></tr>
            </tbody>
          </table>
        </div>
        <Tip>The table in the app wins over the defaults: move a service type between departments on this page and routing follows immediately, no deploy needed. Each service type has exactly one spelling &mdash; one vocabulary, one owner.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Departments</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Create</strong> a department with a name, description and its routed service types</li>
          <li><strong>Members</strong> come from <Link href="/docs/team-members" className="text-primary-600 hover:underline">Team Members</Link> &mdash; assign people there, and routed tasks reach them</li>
          <li><strong>Active toggle</strong> pauses a department without losing its configuration</li>
          <li><strong>Delete</strong> is blocked while a department still has members &mdash; move the people first</li>
        </ul>
      </section>
    </div>
  )
}
