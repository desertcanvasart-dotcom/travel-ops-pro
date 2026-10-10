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
      errors: [] as string[]
    }

    // The business's calendar day (BUSINESS_TIMEZONE), not the host's: the
    // container clock is UTC, so "due tomorrow" / "overdue" were a day off for
    // any operator whose day had not yet turned over in UTC.
    const todayStr = businessToday()
    const tomorrowStr = shiftDateISO(todayStr, 1)

    // =========================================
    // 1. Find tasks due tomorrow (24h warning)
    // =========================================
    const { data: dueSoonTasks, error: dueSoonError } = await supabase
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, email, user_id, is_active)
      `)
      .eq('due_date', tomorrowStr)
      .neq('status', 'done')
      .not('assigned_to', 'is', null)
      // An archived task is off the board; it must not keep reminding anyone.
      .or('archived.eq.false,archived.is.null')

    if (dueSoonError) {
      results.errors.push(`Due soon query error: ${dueSoonError.message}`)
    } else if (dueSoonTasks && dueSoonTasks.length > 0) {
      for (const task of dueSoonTasks) {
        // A removed (deactivated) team member is not reminded.
        if (!task.assigned_member?.id || task.assigned_member.is_active === false) continue

        // Check if we already sent this notification today
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('related_task_id', task.id)
          .eq('type', 'task_due_soon')
          .gte('created_at', todayStr)
          .limit(1)

        if (existing && existing.length > 0) continue // Already notified

        // Create notification
        await createNotification({
          // user_id makes the recipient's email opt-out apply (lib gates on it);
          // team_member_id keeps the in-app row on the roster address too. A
          // member with no login (user_id null) still gets the courtesy email.
          user_id: task.assigned_member.user_id ?? null,
          team_member_id: task.assigned_member.id,
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
    // 2. Find overdue tasks
    // =========================================
    const { data: overdueTasks, error: overdueError } = await supabase
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, email, user_id, is_active)
      `)
      .lt('due_date', todayStr)
      .neq('status', 'done')
      .not('assigned_to', 'is', null)
      .or('archived.eq.false,archived.is.null')

    if (overdueError) {
      results.errors.push(`Overdue query error: ${overdueError.message}`)
    } else if (overdueTasks && overdueTasks.length > 0) {
      for (const task of overdueTasks) {
        if (!task.assigned_member?.id || task.assigned_member.is_active === false) continue

        // Check if we already sent overdue notification in last 3 days
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
        
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('related_task_id', task.id)
          .eq('type', 'task_overdue')
          .gte('created_at', threeDaysAgo.toISOString())
          .limit(1)

        if (existing && existing.length > 0) continue // Already notified recently

        // Whole calendar days between two YYYY-MM-DD dates.
        const daysOverdue = Math.round((Date.parse(`${todayStr}T00:00:00Z`) - Date.parse(`${String(task.due_date).slice(0, 10)}T00:00:00Z`)) / 86_400_000)

        // Create notification
        await createNotification({
          user_id: task.assigned_member.user_id ?? null,
          team_member_id: task.assigned_member.id,
          type: 'task_overdue',
          title: `Overdue task: ${task.title}`,
          message: `Your task "${task.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue (was due ${formatDate(task.due_date)}). Please complete it as soon as possible.`,
          link: `/tasks`,
          related_task_id: task.id,
        })
        
        results.overdue++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Task reminders sent: ${results.dueSoon} due soon, ${results.overdue} overdue`,
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
