import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Gueltige Schrittnamen — alles andere wird abgelehnt.
const VALID_STEPS = new Set(['welcome', 'personal', 'medical', 'waiver', 'experience', 'emergency', 'review'])

export async function POST(req: NextRequest) {
  let body: {
    booking_customer_id?: string
    step?: string
    entered_at?: string
    left_at?: string
    is_test?: boolean
  }
  try {
    const text = await req.text()
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { booking_customer_id, step, entered_at, left_at, is_test } = body

  if (!booking_customer_id || typeof booking_customer_id !== 'string') {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (!step || !VALID_STEPS.has(step)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (!entered_at && !left_at) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Messkohorte: solange app_settings.telemetry_cohort aktiv ist, werden neue
  // Zeilen damit markiert (unabhaengig von is_test). Pro (Gast, Schritt) gibt es
  // nur eine Zeile (ignoreDuplicates) -> es zaehlt der erste Durchlauf.
  let cohort: string | null = null
  if (entered_at) {
    const { data: cfg } = await supabase.from('app_settings').select('value').eq('key', 'telemetry_cohort').maybeSingle()
    const v = cfg?.value as { active?: boolean; name?: string } | undefined
    if (v?.active && typeof v.name === 'string' && v.name) cohort = v.name
  }

  if (entered_at) {
    // Schritt betreten: Zeile anlegen. Falls sie schon existiert (z.B. bei
    // erneutem Vorwaerts/Rueckwaerts), ignorieren — entered_at bleibt erhalten.
    await supabase.from('checkin_step_events').upsert(
      {
        booking_customer_id,
        step,
        entered_at,
        is_test: Boolean(is_test),
        cohort,
      },
      { onConflict: 'booking_customer_id,step', ignoreDuplicates: true },
    )
  }

  if (left_at) {
    // Schritt verlassen: left_at nachtragen.
    await supabase
      .from('checkin_step_events')
      .update({ left_at })
      .eq('booking_customer_id', booking_customer_id)
      .eq('step', step)
  }

  return NextResponse.json({ ok: true })
}
