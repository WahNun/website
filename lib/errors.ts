import { createClient } from '@supabase/supabase-js'

// Alphabet ohne verwechselbare Zeichen: kein O/0, kein I/1/l
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const AREA_PREFIX: Record<string, string> = {
  chk:  'CHK',
  pay:  'PAY',
  mail: 'MAIL',
  dash: 'DASH',
  api:  'API',
}

function genSuffix(n = 4): string {
  let s = ''
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

type Context = Record<string, unknown>

/** Lesbarer Text auch für Nicht-Error-Objekte (z. B. Supabase-/Postgrest-Fehler) — vorher „[object Object]“. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    const parts = [o.message, o.code ? `code ${String(o.code)}` : null, o.details, o.hint].filter(Boolean).map(String)
    if (parts.length) return parts.join(' · ')
    try { return JSON.stringify(err).slice(0, 1000) } catch { /* fällt auf String(err) */ }
  }
  return String(err)
}

/**
 * Legt eine Fehlerzeile an und gibt die Referenz zurueck.
 * Schlaegt das Schreiben selbst fehl, wird die Referenz trotzdem zurueckgegeben
 * und der Schreibfehler geht nach console.error — die eigentliche Fehlermeldung
 * darf nie verschluckt werden.
 */
export async function reportError(
  area: string,
  err: unknown,
  ctx: Context = {},
): Promise<string> {
  const prefix = AREA_PREFIX[area] ?? 'API'
  const ref = `${prefix}-${genSuffix()}`
  const message = describeError(err)
  const stack = err instanceof Error ? (err.stack ?? null) : null

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    // Test-Markierung: explizit über ctx.is_test (z. B. Stripe-Testmode-Event), sonst nach dem globalen Sandbox-Schalter
    let isTest = typeof ctx.is_test === 'boolean' ? ctx.is_test : null
    if (isTest === null) {
      const { data: sim } = await supabase.from('app_settings').select('value').eq('key', 'simulation_mode').maybeSingle()
      isTest = Boolean((sim?.value as { enabled?: boolean } | null)?.enabled)
    }
    const { error: writeErr } = await supabase.from('error_events').insert({
      ref,
      area,
      message,
      stack,
      context: ctx,
      is_test: isTest,
    })
    if (writeErr) console.error('[errors] error_events insert failed:', writeErr)
  } catch (writeErr) {
    console.error('[errors] error_events write exception:', writeErr)
  }

  return ref
}
