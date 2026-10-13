import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function TasksPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Tasks</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Tasks</h1>
      <p className="text-gray-600 mb-4">
        Tasks are your company&rsquo;s to-do list. Each task has a status, a priority, an optional due date and assignee, and can be linked to the itinerary, client, invoice or expense it is about. Open it from <strong>Operate &rsaquo; Tasks</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        Owners, admins, managers and agents have it in their menu and can open it. Viewers do not. You only ever see the tasks of the company you are working in; if you belong to two companies, switch company to see the other one&rsquo;s.
      </p>

      {/* Header */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The page</h2>
        <p className="text-gray-600 mb-3">
          The header has the title, a view toggle (<strong>Kanban</strong>, <strong>Table</strong>, <strong>List</strong>) and an <strong>Add Task</strong> button.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Kanban</strong> &mdash; Three columns: To Do, In Progress and Done, with Start, Complete and Reopen buttons on each card.</li>
          <li><strong>Table</strong> &mdash; Sortable by title, status, priority, due date and assignee, with pages of 25 (or another page size you choose).</li>
          <li><strong>List</strong> &mdash; One compact line per task.</li>
        </ul>
      </section>

      {/* Summary cards */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The summary cards</h2>
        <p className="text-gray-600 mb-3">
          Eight cards across the top. The server counts them over <em>every</em> task of your company, however many there are. They ignore the search box and the filters.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total</strong> &mdash; Tasks that are not archived.</li>
          <li><strong>To Do</strong>, <strong>In Progress</strong>, <strong>Done</strong> &mdash; Tasks that are not archived, by status.</li>
          <li><strong>Overdue</strong> &mdash; Not archived, not done, and due before today.</li>
          <li><strong>Due Today</strong> &mdash; Not archived, not done, and due today.</li>
          <li><strong>High Priority</strong> &mdash; Not archived, not done, and priority High or Urgent.</li>
          <li><strong>Archived</strong> &mdash; Archived tasks.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          &ldquo;Today&rdquo; is the date on your own computer&rsquo;s calendar.
        </p>
      </section>

      {/* Filters */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Finding tasks</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Quick filters</strong> &mdash; <strong>Overdue</strong> (not done, due before today), <strong>Due Today</strong> (every task due today, including done ones, which sit in the Done column) and <strong>This Week</strong> (due from today to seven days ahead). Click a chip again to turn it off.</li>
          <li><strong>Filters</strong> &mdash; Status, Priority, Assigned To (active team members), Department, and Due Date (All, Overdue, Due Today, This Week, Upcoming). <strong>Clear</strong> resets them.</li>
          <li><strong>Search</strong> &mdash; Matches the title and description of the tasks already loaded.</li>
          <li><strong>Show Archived</strong> &mdash; Adds archived tasks to the list. Each can be restored with <strong>Unarchive</strong>.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The page loads at most the newest 1,000 tasks that match the filters. When more match, an amber note says how many are shown out of how many; narrow the filters to reach older ones.
        </p>
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding and editing a task</h2>
        <p className="text-gray-600 mb-3">
          <strong>Add Task</strong> opens the form. Edit a task from its card or row.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Title</strong> (required), <strong>Description</strong>, <strong>Due Date</strong>.</li>
          <li><strong>Priority</strong> &mdash; Low, Medium (the default), High or Urgent.</li>
          <li><strong>Assign To</strong> &mdash; An active team member of your company.</li>
          <li><strong>Department</strong> &mdash; One of your company&rsquo;s departments.</li>
          <li><strong>Link To</strong> &mdash; An itinerary (picked from a list of up to 1,000), a client (from a list of up to 200), or an invoice or expense (type its ID).</li>
          <li><strong>Notes</strong>.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          New tasks start in To Do. If the save is refused, a message says why and the form stays open. The usual reasons: the linked invoice or expense ID is not one of your company&rsquo;s (&ldquo;Assignee, department or linked record not found&rdquo;), or the person you chose has been removed from the team (&ldquo;That team member is no longer active&rdquo;). A task whose assignee was removed later can still be edited; you only have to choose someone else when you change the assignee.
        </p>
        <Tip>
          Saving with a new or changed assignee sends them a <strong>task assigned</strong> notification in the app, and an email unless they turned task emails off in their notification settings.
        </Tip>
      </section>

      {/* Generated tasks */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tasks made from an itinerary</h2>
        <p className="text-gray-600 mb-3">
          On an itinerary, the Tasks card can create the trip&rsquo;s operations tasks: one per kind of service, sent to the department that handles that service type. Each has a booking checklist with one row per service.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Ticking rows moves the task&rsquo;s status: the first tick moves a To Do task to In Progress, and every row ticked with nothing left to cancel makes it Done.</li>
          <li>Marking the task Done ticks every row. It is refused while a booking that left the itinerary still has to be marked Cancelled.</li>
          <li>Creating the tasks again after the itinerary changes keeps your ticks, the assignee and the priority.</li>
        </ul>
      </section>

      {/* Archiving */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Archiving and deleting</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Archive or unarchive one task from its card or row. Archived tasks leave the board and every card except Archived.</li>
          <li><strong>Archive Done (N)</strong> archives <em>every</em> done task of your company that is not archived yet. N is the Done card&rsquo;s number. The filters do not apply; the confirmation says so and gives the count.</li>
          <li>Delete asks for confirmation first. Anyone who can open the page can delete any task of the company.</li>
        </ul>
      </section>

      {/* Reminders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reminders</h2>
        <p className="text-gray-600 mb-3">
          A daily job runs at 06:10 UTC (15:10 in Japan, 09:10 in Egypt). For each company it sends the assignee:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Task due tomorrow</strong> &mdash; at most once a day per task.</li>
          <li><strong>Overdue task</strong> &mdash; at most once every three days per task.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Both arrive in the app, and by email unless the person turned that email off. Archived, done and unassigned tasks are skipped, and so are team members who have been removed.
        </p>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>No recurring tasks.</li>
          <li>The list shows at most 1,000 tasks at a time; the cards always count all of them.</li>
          <li>Search only looks through the tasks already loaded, not the whole company.</li>
          <li>Reminders go out at the same moment for every company, not at each company&rsquo;s morning.</li>
          <li>There is no per-person permission: every owner, admin, manager and agent can edit, archive and delete every task of the company.</li>
        </ul>
      </section>
    </div>
  )
}
