import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

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
      <p className="text-gray-600 mb-8">
        Tasks keep your team&apos;s work organized. Each task has a status, priority, due date, and assignee, and can be linked to the record it relates to &mdash; an itinerary, client, invoice, or expense. Assigning a task notifies the team member automatically.
      </p>

      {/* Creating a task */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a Task</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Task</strong></li>
          <li>Fill in the details:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Title &amp; Description</strong> &mdash; What needs doing</li>
              <li><strong>Due Date</strong> &mdash; When it&apos;s due</li>
              <li><strong>Priority</strong> &mdash; Low, Medium, High, or Urgent</li>
              <li><strong>Assigned To</strong> &mdash; A team member; assigning sends them a notification</li>
              <li><strong>Department</strong> &mdash; Group the task by team</li>
              <li><strong>Linked To</strong> &mdash; Attach the task to an itinerary, client, invoice, or expense</li>
            </ul>
          </li>
          <li>Save &mdash; new tasks start in the <strong>To Do</strong> status</li>
        </ol>
        <Tip>
          When you assign or reassign a task, the new assignee receives a <strong>task_assigned</strong> notification (with an optional email), so nothing slips through the cracks.
        </Tip>
      </section>

      {/* Views */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Kanban, Table &amp; List Views</h2>
        <p className="text-gray-600 mb-3">
          Switch views with the toggle in the header:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Kanban</strong> &mdash; Three columns (To Do, In Progress, Done) with quick <strong>Start</strong>, <strong>Complete</strong>, and <strong>Reopen</strong> buttons on each card</li>
          <li><strong>Table</strong> &mdash; A sortable grid with pagination; click any column header to sort by title, status, priority, due date, or assignee</li>
          <li><strong>List</strong> &mdash; A compact single-line layout with a status toggle on the left</li>
        </ul>
        <ScreenshotPlaceholder caption="Kanban board with To Do, In Progress, and Done columns" />
      </section>

      {/* Filters */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Filtering &amp; Summary</h2>
        <p className="text-gray-600 mb-3">
          Summary cards across the top count your total, to do, in progress, done, overdue, due today, high priority, and archived tasks. Narrow the board with:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Search</strong> &mdash; By title or description</li>
          <li><strong>Quick filters</strong> &mdash; Overdue, Due Today, and This Week chips</li>
          <li><strong>Advanced filters</strong> &mdash; Status, priority, assignee, department, and due date</li>
        </ul>
      </section>

      {/* Archiving */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Archiving Completed Work</h2>
        <p className="text-gray-600 mb-3">
          Finished tasks can be archived to keep your boards clean without deleting history:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Archive any single task from its card or row</li>
          <li>Use <strong>Archive Done</strong> to bulk-archive every completed task at once</li>
          <li>Toggle <strong>Show Archived</strong> to review or restore archived tasks</li>
        </ul>
        <Tip>
          Bulk archiving processes each task independently, so one failure won&apos;t stop the rest &mdash; the board always refreshes to reflect what actually saved.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/notifications" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Notifications
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
