'use client'

// ============================================
// /tasks — Tasks · Follow-ups
// ============================================
// The task board and the client follow-ups as tabs of one page (?type=),
// each moved as it was into ./_views. They read different tables and stay
// two lists. /followups redirects to its tab; plain /tasks is the Tasks tab,
// so every link and notification that says /tasks still lands there. Both
// are agent-and-above, as each page was.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs from '@/components/nav/UrlTabs'
import { tabbedPage } from '@/lib/nav/config'
import TasksView from './_views/TasksView'
import FollowupsView from './_views/FollowupsView'

const PAGE = tabbedPage('/tasks')

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#647C47] animate-spin" /></div>}>
      <UrlTabs
        page={PAGE}
        render={tab => tab === 'task' ? <TasksView /> : tab === 'follow-up' ? <FollowupsView /> : null}
      />
    </Suspense>
  )
}
