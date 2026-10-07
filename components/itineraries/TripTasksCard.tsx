'use client'

// This trip's operations tasks, on its page: one per kind of service, each
// with who has it, when it is due and how much of its checklist is done.
// "Create tasks" / "Sync tasks" opens the page's own tasks dialog.
// Ported from autoura-saas, where the itinerary page was redesigned first.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ClipboardList } from 'lucide-react'
import { ChecklistSummary } from '@/components/tasks/TaskChecklist'

interface TripTask {
  id: string
  title: string
  status: string
  due_date: string | null
  checklist?: Parameters<typeof ChecklistSummary>[0]['items'] | null
  assigned_member?: { name?: string | null } | null
}

const STATUS_STYLE: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-50 text-blue-700',
  done: 'bg-green-50 text-green-700',
}

const shortDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function TripTasksCard({ itineraryId, today, onSync, refreshSignal = 0 }: {
  itineraryId: string
  /** YYYY-MM-DD, for "overdue". */
  today: string
  /** Open the page's create / sync dialog. */
  onSync: () => void
  /** Bumped by the page after tasks were generated, to reload. */
  refreshSignal?: number
}) {
  const t = useTranslations('itineraries.detail.tasksCard')
  const [tasks, setTasks] = useState<TripTask[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/tasks?itineraryId=${encodeURIComponent(itineraryId)}`)
      .then(r => r.json())
      .then(json => {
        const rows = Array.isArray(json) ? json : json?.data
        if (Array.isArray(rows)) { setTasks(rows); setFailed(false) } else setFailed(true)
      })
      .catch(() => setFailed(true))
  }, [itineraryId])

  useEffect(() => { load() }, [load, refreshSignal])

  const open = (tasks ?? []).filter(task => task.status !== 'done')
  const statusLabel = (s: string) =>
    s === 'todo' ? t('statusTodo') : s === 'in_progress' ? t('statusInProgress') : s === 'done' ? t('statusDone') : s

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4" data-testid="trip-tasks">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" /> {t('title')}
          {tasks && tasks.length > 0 && <span className="text-gray-400">· {t('open', { count: open.length })}</span>}
        </p>
        <button type="button" onClick={onSync} className="text-xs text-primary-600 hover:underline">
          {tasks && tasks.length > 0 ? t('sync') : t('create')}
        </button>
      </div>

      {tasks === null && !failed && <p className="text-xs text-gray-400">{t('loading')}</p>}
      {failed && <p className="text-xs text-gray-500">{t('loadFailed')}</p>}
      {tasks && tasks.length === 0 && <p className="text-xs text-gray-500">{t('none')}</p>}

      {tasks && tasks.length > 0 && (
        <ul className="space-y-2.5">
          {tasks.map(task => {
            const overdue = !!task.due_date && task.status !== 'done' && task.due_date.slice(0, 10) < today
            return (
              <li key={task.id} className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-gray-900">{task.title}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded ${STATUS_STYLE[task.status] ?? 'bg-gray-100 text-gray-700'}`}>{statusLabel(task.status)}</span>
                </div>
                <p className="text-gray-500 mt-0.5">
                  {task.assigned_member?.name || t('unassigned')}
                  {task.due_date && (
                    <span className={overdue ? 'text-red-600 font-medium' : ''}>
                      {' · '}{overdue ? t('dueOverdue', { date: shortDate(task.due_date) }) : t('due', { date: shortDate(task.due_date) })}
                    </span>
                  )}
                </p>
                {Array.isArray(task.checklist) && task.checklist.length > 0 && (
                  <div className="mt-1"><ChecklistSummary items={task.checklist} /></div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Link href="/tasks" className="mt-3 inline-block text-xs text-primary-600 hover:underline">{t('board')}</Link>
    </div>
  )
}
