import { NextRequest, NextResponse } from 'next/server'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

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
  // Optional: Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const todayStr = today.toISOString().split('T')[0]
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    // =========================================
    // 1. Find tasks due tomorrow (24h warning)
    // =========================================
    const { data: dueSoonTasks, error: dueSoonError } = await supabase
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, email, user_id)
      `)
      .eq('due_date', tomorrowStr)
      .neq('status', 'done')
      .not('assigned_to', 'is', null)

    if (dueSoonError) {
      results.errors.push(`Due soon query error: ${dueSoonError.message}`)
    } else if (dueSoonTasks && dueSoonTasks.length > 0) {
      for (const task of dueSoonTasks) {
        if (!task.assigned_member?.id) continue

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
        assigned_member:team_members(id, name, email, user_id)
      `)
      .lt('due_date', todayStr)
      .neq('status', 'done')
      .not('assigned_to', 'is', null)

    if (overdueError) {
      results.errors.push(`Overdue query error: ${overdueError.message}`)
    } else if (overdueTasks && overdueTasks.length > 0) {
      for (const task of overdueTasks) {
        if (!task.assigned_member?.id) continue

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

        const daysOverdue = Math.floor((today.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24))

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
  return GET(request)
}

// Format date helper
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { 
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
