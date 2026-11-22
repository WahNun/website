import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { addDayCoverToBooking } from '@/lib/dayCover'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Jede gueltige Mitarbeiter-Session darf Flags abhaken. Keine Rollenpruefung —
// am Kiosk ist der Guide eingeloggt und haengt kurz ein Erledigt dran; eine
// Rollenhuerde wuerde dazu fuehren, dass gar nicht abgehakt oder der Account
// offen gelassen wird. Ohne gueltige Session: 401.
async function requireAuth(): Promise<{ userId: string; userEmail: string } | null> {
  const cookieStore = await cookies()

  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return null

  // Identity comes from the session — never from the request body
  return { userId: user.id, userEmail: user.email ?? user.id }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { booking_customer_id, kind, resolved, payment_method, insurance_provider, insurance_policy_number, dan_policy_number, proof_path, proof_name } = body as Record<string, unknown>

  if (!booking_customer_id || typeof booking_customer_id !== 'string') {
    return NextResponse.json({ error: 'booking_customer_id required' }, { status: 400 })
  }
  if (kind !== 'insurance' && kind !== 'medical' && kind !== 'insurance_onsite' && kind !== 'dan_policy' && kind !== 'medical_proof' && kind !== 'refresher' && kind !== 'minor') {
    return NextResponse.json({ error: 'kind must be "insurance", "insurance_onsite", "dan_policy", "medical_proof", "refresher", "minor" or "medical"' }, { status: 400 })
  }
  if (typeof resolved !== 'boolean') {
    return NextResponse.json({ error: 'resolved must be a boolean' }, { status: 400 })
  }

  const db = getAdminSupabase()
  const now = new Date().toISOString()

  // Snapshot before-state for audit log
  const { data: before } = await db
    .from('booking_customers')
    .select('insurance_source,insurance_verified_at,insurance_verified_by,medical_flag_resolved,medical_resolved_at,medical_resolved_by,medical_proof_path,medical_proof_name,dan_policy_number,dan_policy_recorded_at,minor_ack_at,minor_ack_by,booking_id,slot_index,customer_id')
    .eq('id', booking_customer_id)
    .single()
  if (!before) return NextResponse.json({ error: 'Diver not found' }, { status: 404 })

  // Steg-Kauf der Tagesversicherung: Geld ist da → Position + Zahlung an die Buchung (Lucas 24.10.: Kasse muss stimmen)
  let dayCover: { cents: number; days: number } | null = null
  if (kind === 'insurance_onsite' && resolved) {
    // 'later' = Gast zahlt nach dem Tauchgang → offene Zahlung (Due Balance), Versicherung gilt trotzdem sofort
    const method = typeof payment_method === 'string' && ['cash', 'card', 'revolut', 'bank', 'later'].includes(payment_method) ? payment_method : null
    if (!method) return NextResponse.json({ error: 'payment_method required (cash | card | revolut | bank | later) — the cover is added to the booking' }, { status: 400 })
    if (before.insurance_source === 'azd_day') return NextResponse.json({ error: 'This diver already has DAN cover with us' }, { status: 409 })
    try {
      dayCover = await addDayCoverToBooking(db, { bookingId: before.booking_id as string, slotIndex: (before.slot_index as number) ?? 0, payment: method === 'later' ? 'pending' : { method, recordedBy: auth.userId }, by: auth.userEmail })
    } catch (e) {
      return NextResponse.json({ error: `Could not add day cover to the booking: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
    }
  }
  // Nachweis eigener Police: ohne Anbieter + Policennummer keine Freigabe (Lucas 24.10.)
  if (kind === 'insurance' && resolved) {
    const prov = typeof insurance_provider === 'string' ? insurance_provider.trim() : ''
    const pol = typeof insurance_policy_number === 'string' ? insurance_policy_number.trim() : ''
    const { data: cust } = before.customer_id ? await db.from('customers').select('insurance_provider, insurance_policy_number').eq('id', before.customer_id).maybeSingle() : { data: null }
    const finalProv = prov || cust?.insurance_provider || ''
    const finalPol = pol || cust?.insurance_policy_number || ''
    if (!finalProv || !finalPol) return NextResponse.json({ error: 'Enter the insurance provider and policy number before marking the proof as seen' }, { status: 400 })
    if (before.customer_id && (prov || pol)) {
      await db.from('customers').update({ insurance_provider: finalProv, insurance_policy_number: finalPol, updated_at: now }).eq('id', before.customer_id)
      await db.from('booking_changelog').insert({ booking_id: before.booking_id, action: 'profile_updated', changed_by_email: auth.userEmail, description: `🛡 Insurance policy recorded by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}: ${finalProv} · ${finalPol}` })
    }
  }

  let patch: Record<string, unknown>
  if (kind === 'minor') {
    // Crew bestätigt per Knopfdruck: Einverständnis des Erziehungsberechtigten gesehen, Alter und Tiefenlimit gelesen (Lucas 25.10.)
    patch = resolved ? { minor_ack_at: now, minor_ack_by: auth.userEmail } : { minor_ack_at: null, minor_ack_by: null }
    await db.from('booking_changelog').insert({ booking_id: before.booking_id, action: 'profile_updated', changed_by_email: auth.userEmail, description: resolved
      ? `👶 Under-18 diver acknowledged by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1} — guardian consent and depth limit checked`
      : `↩ Under-18 acknowledgement undone by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}` })
  } else if (kind === 'refresher') {
    // Skills-Session im flachen Wasser gemacht → Flag erledigt (Spalten refresher_completed_at/_by)
    patch = resolved ? { refresher_completed_at: now, refresher_completed_by: auth.userEmail } : { refresher_completed_at: null, refresher_completed_by: null }
    await db.from('booking_changelog').insert({ booking_id: before.booking_id, action: 'profile_updated', changed_by_email: auth.userEmail, description: resolved
      ? `↻ Refresher marked as completed by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}`
      : `↩ Refresher completion undone by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}` })
  } else if (kind === 'medical_proof') {
    // Nachweis anhaengen/ersetzen (Flag bleibt offen) bzw. Verweis entfernen; die Datei bleibt im Bucket.
    const pPath = typeof proof_path === 'string' ? proof_path.trim() : ''
    if (resolved && !pPath) return NextResponse.json({ error: 'proof_path required' }, { status: 400 })
    if (resolved && !pPath.startsWith(`${booking_customer_id}/`)) return NextResponse.json({ error: 'Proof file does not belong to this diver' }, { status: 400 })
    if (before.medical_flag_resolved) return NextResponse.json({ error: 'Undo “seen” first, then replace the proof' }, { status: 409 })
    const pName = typeof proof_name === 'string' ? proof_name.slice(0, 120) : null
    patch = resolved ? { medical_proof_path: pPath, medical_proof_name: pName } : { medical_proof_path: null, medical_proof_name: null }
    await db.from('booking_changelog').insert({ booking_id: before.booking_id, action: 'profile_updated', changed_by_email: auth.userEmail, description: resolved
      ? `📎 Medical clearance proof ${before.medical_proof_path ? 'replaced' : 'uploaded'} by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}: ${pName ?? pPath}${before.medical_proof_name ? ` (was ${before.medical_proof_name})` : ''}`
      : `📎 Medical clearance proof removed by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}${before.medical_proof_name ? ` (${before.medical_proof_name} stays in storage)` : ''}` })
  } else if (kind === 'dan_policy') {
    // Unsere bei DAN gekaufte Policennummer (DAN hat keine API → Handeingabe, Lucas 25.10.)
    const num = typeof dan_policy_number === 'string' ? dan_policy_number.trim() : ''
    if (resolved && !num) return NextResponse.json({ error: 'Enter the DAN policy number' }, { status: 400 })
    if (resolved && before.insurance_source !== 'azd_day') return NextResponse.json({ error: 'This diver has no DAN cover bought with us' }, { status: 409 })
    patch = resolved ? { dan_policy_number: num, dan_policy_recorded_at: now } : { dan_policy_number: null, dan_policy_recorded_at: null }
    // Buchungs-Historie: wer hat welche Nummer eingetragen / gelöscht (auch der alte Wert bleibt sichtbar)
    await db.from('booking_changelog').insert({ booking_id: before.booking_id, action: 'profile_updated', changed_by_email: auth.userEmail, description: resolved
      ? `🛡 DAN policy number recorded by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}: ${num}${before.dan_policy_number ? ` (was ${before.dan_policy_number})` : ''}`
      : `↩ DAN policy number cleared by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1}${before.dan_policy_number ? ` (was ${before.dan_policy_number})` : ''}` })
  } else if (kind === 'insurance_onsite') {
    // Guest arrived without insurance and bought a day cover on-site.
    // Mark the source as azd_day and stamp the verification.
    patch = resolved
      ? { insurance_source: 'azd_day', insurance_flag: false, insurance_verified_at: now, insurance_verified_by: auth.userEmail }
      : { insurance_source: 'none', insurance_flag: false, insurance_verified_at: null, insurance_verified_by: null }
  } else if (kind === 'insurance') {
    patch = resolved
      ? { insurance_verified_at: now, insurance_verified_by: auth.userEmail }
      : { insurance_verified_at: null, insurance_verified_by: null }
  } else {
    // Zweistufig (Lucas 25.10.): 1) Nachweis hochladen (medical_proof, Flag bleibt offen), 2) per Bestaetigung „Mark as seen“.
    // Ohne hinterlegten Nachweis keine Freigabe. Dateien bleiben immer im Bucket (Audit).
    if (resolved && !before.medical_proof_path) return NextResponse.json({ error: 'Upload the doctor’s clearance (photo, PDF or document) first, then mark it as seen' }, { status: 400 })
    patch = resolved
      ? { medical_flag_resolved: true,  medical_resolved_at: now,  medical_resolved_by: auth.userEmail }
      : { medical_flag_resolved: false, medical_resolved_at: null, medical_resolved_by: null }
    await db.from('booking_changelog').insert({ booking_id: before.booking_id, action: 'profile_updated', changed_by_email: auth.userEmail, description: resolved
      ? `🩺 Medical clearance marked as seen by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1} — proof: ${before.medical_proof_name ?? before.medical_proof_path}`
      : `↩ Medical clearance undone by ${auth.userEmail ?? 'staff'} for guest ${((before.slot_index as number) ?? 0) + 1} (proof stays attached)` })
  }

  const { data, error } = await db
    .from('booking_customers')
    .update(patch)
    .eq('id', booking_customer_id)
    .select('insurance_source,insurance_flag,insurance_verified_at,insurance_verified_by,medical_flag_resolved,medical_resolved_at,medical_resolved_by,medical_proof_path,medical_proof_name,dan_policy_number,dan_policy_recorded_at,refresher_completed_at,refresher_completed_by,minor_ack_at,minor_ack_by')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log — written server-side so identity cannot be spoofed.
  // Failure must not block the action but must surface in the response.
  let audit_warning: string | undefined
  try {
    const action_type =
      kind === 'minor'
        ? (resolved ? 'minor_acknowledged' : 'minor_ack_undone')
        : kind === 'refresher'
        ? (resolved ? 'refresher_completed' : 'refresher_undone')
        : kind === 'medical_proof'
        ? (resolved ? 'medical_proof_attached' : 'medical_proof_removed')
        : kind === 'dan_policy'
        ? (resolved ? 'dan_policy_recorded' : 'dan_policy_cleared')
        : kind === 'insurance_onsite'
        ? (resolved ? 'insurance_onsite_purchased' : 'insurance_onsite_undone')
        : kind === 'insurance'
          ? (resolved ? 'insurance_proof_seen' : 'insurance_proof_undone')
          : (resolved ? 'medical_clearance_seen' : 'medical_clearance_undone')

    const insuranceOnsiteFields = ['insurance_source', 'insurance_flag', 'insurance_verified_at', 'insurance_verified_by'] as const
    const insuranceFields = ['insurance_verified_at', 'insurance_verified_by'] as const
    const medicalFields = ['medical_flag_resolved', 'medical_resolved_at', 'medical_resolved_by', 'medical_proof_path', 'medical_proof_name'] as const
    const danFields = ['dan_policy_number', 'dan_policy_recorded_at'] as const
    const refresherFields = ['refresher_completed_at', 'refresher_completed_by'] as const
    const minorFields = ['minor_ack_at', 'minor_ack_by'] as const
    const fields = kind === 'minor' ? minorFields : kind === 'refresher' ? refresherFields : kind === 'dan_policy' ? danFields : kind === 'insurance_onsite' ? insuranceOnsiteFields : kind === 'insurance' ? insuranceFields : medicalFields

    const old_value = before
      ? Object.fromEntries(fields.map(f => [f, (before as Record<string, unknown>)[f] ?? null]))
      : null
    const new_value = Object.fromEntries(fields.map(f => [f, (data as Record<string, unknown>)[f] ?? null]))

    const { error: auditError } = await db.from('audit_log').insert({
      entity_type: 'booking_customer',
      entity_id: booking_customer_id,
      ticket_id: null,
      user_id: auth.userId,
      user_email: auth.userEmail,
      action_type,
      old_value,
      new_value,
    })
    if (auditError) audit_warning = auditError.message
  } catch (e) {
    audit_warning = e instanceof Error ? e.message : 'audit log failed'
  }

  return NextResponse.json({ ...data, ...(dayCover ? { day_cover: dayCover } : {}), ...(audit_warning ? { audit_warning } : {}) })
}
