import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

let settingsCache: { data: Record<string, string>; fetchedAt: number } | null = null
const CACHE_TTL = 60_000 // 1 minute

export async function getSiteSettings(): Promise<Record<string, string>> {
  const now = Date.now()
  if (settingsCache && now - settingsCache.fetchedAt < CACHE_TTL) {
    return settingsCache.data
  }
  const supabase = getServiceClient()
  const { data, error } = await supabase.from('site_settings').select('key, value')
  if (error || !data) return {}
  const map: Record<string, string> = {}
  for (const row of data) map[row.key as string] = row.value as string
  settingsCache = { data: map, fetchedAt: now }
  return map
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const settings = await getSiteSettings()
  return settings[key] ?? fallback
}

export async function setSetting(key: string, value: string): Promise<void> {
  const supabase = getServiceClient()
  await supabase.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() })
  // Invalidate cache
  settingsCache = null
}
