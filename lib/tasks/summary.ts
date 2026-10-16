// ============================================
// The Tasks screen's summary cards, counted by the database
// ============================================
// The cards were computed in JS over one unbounded select of the org's tasks.
// PostgREST caps a response at max-rows (1000 on hosted Supabase), and that
// select had no order and included archived rows, so past ~1000 tasks every
// card undercounted by an arbitrary slice. Each card is now its own
// count-only query (head: true — no rows travel), so it is exact at any size.
//
// One population for every "open" card: Overdue, Due Today and High Priority
// leave out done tasks (Due Today and High Priority used to count them, while
// Overdue did not). Total / To Do / In Progress / Done cover non-archived
// tasks; Archived counts the archived ones.

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface TaskSummary {
  total: number
  todo: number
  in_progress: number
  done: number
  overdue: number
  due_today: number
  high_priority: number
  archived: number
}

/** The board lists at most this many tasks (newest first); the response says
 *  how many matched so the screen can say when it shows fewer. */
export const TASK_LIST_LIMIT = 1000

export const NOT_ARCHIVED = 'archived.eq.false,archived.is.null'

/** Exact counts for the summary cards, over the whole org (filters ignored). */
export async function taskSummary(db: Db, orgId: string, today: string): Promise<TaskSummary> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = async (narrow: (q: any) => any): Promise<number> => {
    const { count: n, error } = await narrow(
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
    )
    if (error) throw error
    return n ?? 0
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = (q: any) => q.or(NOT_ARCHIVED)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open = (q: any) => live(q).neq('status', 'done')

  const [total, todo, in_progress, done, overdue, due_today, high_priority, archived] = await Promise.all([
    count(live),
    count(q => live(q).eq('status', 'todo')),
    count(q => live(q).eq('status', 'in_progress')),
    count(q => live(q).eq('status', 'done')),
    count(q => open(q).lt('due_date', today)),
    count(q => open(q).eq('due_date', today)),
    count(q => open(q).in('priority', ['high', 'urgent'])),
    count(q => q.eq('archived', true)),
  ])
  return { total, todo, in_progress, done, overdue, due_today, high_priority, archived }
}
