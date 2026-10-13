import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron/auth'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { businessToday, shiftDateISO } from '@/lib/today'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TASK_FIELDS = `
  id, title, due_date, org_id,
  assigned_member:team_members!tasks_assigned_to_fkey(id, name, email, user_id, is_active, org_id)
`

interface ReminderTask {
  id: string
  title: string
  due_date: string
  org_id: string
  assigned_member: { id: string; name: string; email: string | null; user_id: string | null; is_active: boolean | null; org_id: string } | null
}

interface ReminderFollowup {
  id: string
  title: string
  assigned_to: string
  send_reminder: boolean | null
  reminder_sent: boolean | null
  clients: { first_name: string | null; last_name: string | null } | null
}

// This endpoint should be called by a cron job (Railway cron, Vercel cron, or external service)
// Recommended: Run daily at 8:00 AM local time
// 
// Railway: Add to railway.json or use Railway cron
// Vercel: Add to vercel.json crons
// External: Use cron-job.org or similar service

async function getHandler(request: NextRequest) {
  // Fails closed: see lib/cron/auth.
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const results = {
      dueSoon: 0,
      overdue: 0,
      followups: 0,
      errors: [] as string[]
    }

    // The business's calendar day (BUSINESS_TIMEZONE), not the host's: the
    // container clock is UTC, so "due tomorrow" / "overdue" were a day off for
    // any operator whose day had not yet turned over in UTC.
    const todayStr = businessToday()
    const tomorrowStr = shiftDateISO(todayStr, 1)
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    // One organisation at a time (tasks.org_id, migration 20261203): each
    // reminder is that organisation's notification, about its task, to its
    // own team member, emailed from its own mailbox (lib/notifications) —
    // never another company's.
    const { data: orgs, error: orgsError } = await supabase.from('organizations').select('id')
    if (orgsError) throw orgsError

    for (const { id: orgId } of (orgs ?? []) as Array<{ id: string }>) {
      // A reminder is sent at most once a day (due soon) or every three days
      // (overdue) per task.
      const alreadySent = async (taskId: string, type: string, since: string) => {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('org_id', orgId)
          .eq('related_task_id', taskId)
          .eq('type', type)
          .gte('created_at', since)
          .limit(1)
        return !!existing?.length
      }
      // A removed (deactivated) team member is not reminded, nor one that is
      // not this organisation's.
      const reachable = (task: ReminderTask) =>
        !!task.assigned_member?.id && task.assigned_member.is_active !== false && task.assigned_member.org_id === orgId

      // =========================================
      // 1. Tasks due tomorrow (24h warning)
      // =========================================
      const { data: dueSoonTasks, error: dueSoonError } = await supabase
        .from('tasks')
        .select(TASK_FIELDS)
        .eq('org_id', orgId)
        .eq('due_date', tomorrowStr)
        .neq('status', 'done')
        .not('assigned_to', 'is', null)
        // An archived task is off the board; it must not keep reminding anyone.
        .or('archived.eq.false,archived.is.null')

      if (dueSoonError) {
        results.errors.push(`Due soon query error (${orgId}): ${dueSoonError.message}`)
      } else {
        for (const task of (dueSoonTasks ?? []) as unknown as ReminderTask[]) {
          if (!reachable(task)) continue
          if (await alreadySent(task.id, 'task_due_soon', todayStr)) continue

          await createNotification({
            org_id: orgId,
            // user_id makes the recipient's email opt-out apply (lib gates on it);
            // team_member_id keeps the in-app row on the roster address too. A
            // member with no login (user_id null) still gets the courtesy email.
            user_id: task.assigned_member!.user_id ?? null,
            team_member_id: task.assigned_member!.id,
            type: 'task_due_soon',
            title: `Task due tomorrow: ${task.title}`,
            message: `Your task "${task.title}" is due tomorrow (${formatDate(task.due_date)}). Please complete it soon.`,
            link: `/tasks`,
            related_task_id: task.id,
          })
          results.dueSoon++
        }
      }

      // =========================================
      // 2. Overdue tasks
      // =========================================
      const { data: overdueTasks, error: overdueError } = await supabase
        .from('tasks')
        .select(TASK_FIELDS)
        .eq('org_id', orgId)
        .lt('due_date', todayStr)
        .neq('status', 'done')
        .not('assigned_to', 'is', null)
        .or('archived.eq.false,archived.is.null')

      if (overdueError) {
        results.errors.push(`Overdue query error (${orgId}): ${overdueError.message}`)
      } else {
        for (const task of (overdueTasks ?? []) as unknown as ReminderTask[]) {
          if (!reachable(task)) continue
          if (await alreadySent(task.id, 'task_overdue', threeDaysAgo.toISOString())) continue

          // Whole calendar days between two YYYY-MM-DD dates.
          const daysOverdue = Math.round((Date.parse(`${todayStr}T00:00:00Z`) - Date.parse(`${String(task.due_date).slice(0, 10)}T00:00:00Z`)) / 86_400_000)

          await createNotification({
            org_id: orgId,
            user_id: task.assigned_member!.user_id ?? null,
            team_member_id: task.assigned_member!.id,
            type: 'task_overdue',
            title: `Overdue task: ${task.title}`,
            message: `Your task "${task.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue (was due ${formatDate(task.due_date)}). Please complete it as soon as possible.`,
            link: `/tasks`,
            related_task_id: task.id,
          })
          results.overdue++
        }
      }

      // =========================================
      // 3. Client follow-ups due today
      // =========================================
      // In-app only, to the person who scheduled it (assigned_to: the login id
      // /api/followups stamps), once per due date: reminder_sent is set here
      // and cleared when the follow-up is snoozed or re-dated. The follow-up
      // is this organisation's through its client (no org_id of its own).
      const { data: dueFollowups, error: followupsError } = await supabase
        .from('client_followups')
        .select('id, title, assigned_to, send_reminder, reminder_sent, clients!inner(org_id, first_name, last_name)')
        .eq('clients.org_id', orgId)
        .eq('status', 'pending')
        .eq('due_date', todayStr)
        .not('assigned_to', 'is', null)

      if (followupsError) {
        results.errors.push(`Follow-ups query error (${orgId}): ${followupsError.message}`)
      } else {
        for (const f of (dueFollowups ?? []) as unknown as ReminderFollowup[]) {
          if (f.send_reminder === false || f.reminder_sent === true) continue
          // Only someone still in this organisation is reminded about its client.
          const { data: member } = await supabase
            .from('organization_members').select('user_id').eq('org_id', orgId).eq('user_id', f.assigned_to).maybeSingle()
          if (!member) continue

          const client = [f.clients?.first_name, f.clients?.last_name].filter(Boolean).join(' ')
          const sent = await createNotification({
            org_id: orgId,
            user_id: f.assigned_to,
            type: 'followup_due',
            title: `Follow-up due today: ${f.title}`,
            message: `Your follow-up "${f.title}"${client ? ` with ${client}` : ''} is due today.`,
            link: '/followups',
            send_email: false,
          })
          if (!sent.success) continue
          await supabase.from('client_followups').update({ reminder_sent: true }).eq('id', f.id)
          results.followups++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Task reminders sent: ${results.dueSoon} due soon, ${results.overdue} overdue; ${results.followups} follow-ups due today`,
      results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in task reminders cron:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process task reminders' },
      { status: 500 }
    )
  }
}

// Also support POST for some cron services
async function postHandler(request: NextRequest) {
  // The unwrapped handler: POST is itself wrapped in withJobRun below, and
  // calling the wrapped GET recorded every POST run twice.
  return getHandler(request)
}

// Format date helper
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  // A date-only string parses as UTC midnight; format it in UTC too, or a
  // host west of Greenwich prints the day before.
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  })
}

// Recorded in job_runs so the support bundle can answer "has this job ever run
// here?". Wrapping the ROUTE covers both the in-process scheduler (which calls
// this handler directly) and any external caller. Fail-open: if the recording
// cannot happen, the job still runs — see lib/support/job-runs.ts.
export const GET = withJobRun('task-reminders', () => createServerClient(), getHandler)
export const POST = withJobRun('task-reminders', () => createServerClient(), postHandler)
