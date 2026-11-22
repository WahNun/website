import { getServiceClient } from '@/lib/triage'

export async function recordHeartbeat(jobName: string, ok: boolean, detail: string): Promise<void> {
  try {
    const supabase = getServiceClient()
    const now = new Date().toISOString()
    const { error } = await supabase.from('cron_heartbeat').upsert(
      {
        job_name: jobName,
        last_run_at: now,
        ...(ok ? { last_ok_at: now } : {}),
        last_status: ok ? 'ok' : 'error',
        last_detail: detail.slice(0, 500),
      },
      { onConflict: 'job_name' }
    )
    if (error) console.error('[heartbeat] upsert error:', error.message)
  } catch (err) {
    console.error('[heartbeat] unexpected error:', err instanceof Error ? err.message : err)
  }
}
