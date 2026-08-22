// Next.js server-start hook. Arms the in-process cron scheduler on the
// always-on Railway container (lib/cron/scheduler.ts). Guarded so `next dev`
// on a laptop and CI's build/E2E servers never run production jobs against
// the shared database: only Railway (RAILWAY_SERVICE_NAME) or an explicit
// CRON_IN_PROCESS=true arms it; CRON_IN_PROCESS=false disarms it anywhere.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const flag = process.env.CRON_IN_PROCESS
  const enabled = flag === 'true' || (flag !== 'false' && !!process.env.RAILWAY_SERVICE_NAME)
  if (!enabled) return
  const { startScheduler } = await import('./lib/cron/scheduler')
  startScheduler()
}
