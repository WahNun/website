// Per-invocation (and cross-warm-request) label-ID cache
const labelCache = new Map<string, string>()

export async function getAccessToken(): Promise<string> {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail is not configured')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    const detail = data.error_description ?? data.error ?? `HTTP ${res.status}`
    throw new Error(`Gmail token refresh failed: ${detail}`)
  }
  return data.access_token
}

export async function ensureLabel(token: string, name: string): Promise<string> {
  if (labelCache.has(name)) return labelCache.get(name)!

  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!listRes.ok) {
    throw new Error(`Gmail labels.list failed: HTTP ${listRes.status}`)
  }
  const listData = await listRes.json() as { labels?: { id: string; name: string }[] }
  const existing = listData.labels?.find(l => l.name === name)
  if (existing) {
    labelCache.set(name, existing.id)
    return existing.id
  }

  const createRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      }),
    }
  )
  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}))
    throw new Error(`Gmail labels.create failed: HTTP ${createRes.status} ${JSON.stringify(errData)}`)
  }
  const created = await createRes.json() as { id: string }
  labelCache.set(name, created.id)
  return created.id
}

export async function addLabel(token: string, messageId: string, labelId: string): Promise<void> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addLabelIds: [labelId] }),
    }
  )
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(`Gmail messages.modify failed for ${messageId}: HTTP ${res.status} ${JSON.stringify(errData)}`)
  }
}
