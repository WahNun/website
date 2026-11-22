'use client'
import { waiverHref } from '@/lib/waiver'
import React, { useState } from 'react'
import { s, supabase } from '@/components/pages/_shared'
import { INSURANCE_LABEL, needsRefresher, monthsSince, type InsuranceSource } from '@/lib/insurance'

export type GuestFileDiver = {
  slot_index: number
  checkin_completed_at: string | null
  checkin_started_at?: string | null
  medical_flag?: boolean | null
  medical_flag_reason?: string | null
  medical_flag_resolved?: boolean | null
  medical_resolved_at?: string | null
  medical_resolved_by?: string | null
  insurance_flag?: boolean | null
  insurance_source?: string | null
  insurance_verified_at?: string | null
  insurance_verified_by?: string | null
  no_show?: boolean | null
  is_minor?: boolean | null
  wetsuit_size?: string | null
  bcd_size?: string | null
  boot_size?: string | null
  special_notes?: string | null
  policy_accepted_at?: string | null
  medical_ack_at?: string | null
  dan_submitted_at?: string | null
  refresher_completed_at?: string | null
  refresher_completed_by?: string | null
  invite_email?: string | null
  customer_id?: string | null
  customer?: {
    id?: string | null
    name?: string | null
    email?: string | null
    phone?: string | null
    phone_prefix?: string | null
    phone_number?: string | null
    dob?: string | null
    nationality?: string | null
    experience_level?: string | null
    cert_agency?: string | null
    cert_number?: string | null
    insurance_provider?: string | null
    insurance_policy_number?: string | null
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
    waiver_signed_at?: string | null
    waiver_pdf_url?: string | null
    logged_dives?: number | null
    last_dive_date?: string | null
    medical_cleared_at?: string | null
    first_name?: string | null
    last_name?: string | null
    gender?: string | null
    country_of_residence?: string | null
    staff_notes?: string | null
    created_at?: string | null
  } | null
}

export function FileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '18px' }}>
      <div style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>{title}</div>
      {children}
    </div>
  )
}

export function FileRow({ k, v, warn }: { k: string; v?: string | null; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '13.5px', padding: '3px 0', lineHeight: 1.6 }}>
      <span style={{ color: s.muted }}>{k}</span>
      <span style={{ color: v ? (warn ? '#ffd080' : '#e8f1fb') : 'rgba(255,255,255,.25)', fontWeight: v ? 600 : 400, textAlign: 'right', wordBreak: 'break-word' }}>
        {v || '—'}
      </span>
    </div>
  )
}

export function GuestFile({ diver, bookingId, onSaved, booked }: { diver: GuestFileDiver; bookingId?: string; onSaved?: () => void; /** Angaben aus der Buchung — erscheinen, solange noch kein Check-in vorliegt */ booked?: { name?: string | null; email?: string | null } }) {
  const cu = diver.customer
  // Staff kann Profildaten nachtragen (z. B. Geburtsdatum für den DAN-Export) — Änderungen landen im Buchungs-Log
  const customerId = diver.customer_id ?? cu?.id ?? null
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ first_name: cu?.first_name ?? '', last_name: cu?.last_name ?? '', gender: cu?.gender ?? '', dob: cu?.dob ?? '', nationality: cu?.nationality ?? '', country_of_residence: cu?.country_of_residence ?? '', phone_prefix: cu?.phone_prefix ?? '', phone_number: cu?.phone_number ?? '' })
  async function save() {
    if (!customerId) return
    setSaving(true); setMsg(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/customers/update', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ customer_id: customerId, booking_id: bookingId, fields: form }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setMsg(`❌ ${d.error ?? `HTTP ${res.status}`}`); return }
      setMsg(d.changed?.length ? `✅ Saved: ${d.changed.join(', ')}` : 'No changes'); setEdit(false); onSaved?.()
    } catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`) }
    finally { setSaving(false) }
  }
  const inp: React.CSSProperties = { background: '#030d1c', border: '1px solid rgba(255,255,255,.14)', borderRadius: '6px', padding: '5px 8px', fontSize: '12.5px', color: '#e8f1fb', fontFamily: s.font, outline: 'none', width: '100%', boxSizing: 'border-box', colorScheme: 'dark' }
  const F = ({ k, name, type = 'text', placeholder }: { k: string; name: keyof typeof form; type?: string; placeholder?: string }) => (
    <label style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: s.muted, padding: '2px 0' }}>{k}
      {name === 'gender'
        ? <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={inp}><option value="">—</option><option value="M">M</option><option value="F">F</option><option value="X">X</option></select>
        : <input type={type} value={form[name]} placeholder={placeholder} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} style={inp} />}
    </label>
  )
  const refresher = needsRefresher(cu?.last_dive_date) && !diver.refresher_completed_at
  const months = monthsSince(cu?.last_dive_date)

  if (!cu) {
    return (
      <div style={{ fontSize: '13.5px', color: s.muted, lineHeight: 1.7, marginTop: '8px' }}>
        {(booked?.name || booked?.email) && (
          <div style={{ color: s.text, marginBottom: '4px' }}>
            Booked as: <strong>{booked.name || '—'}</strong>{booked.email ? ` · ${booked.email}` : ''}
          </div>
        )}
        No check-in data on file yet — certification, medical and waiver appear here once the guest completes the check-in.
      </div>
    )
  }

  const phone = cu.phone || [cu.phone_prefix, cu.phone_number].filter(Boolean).join(' ') || null

  return (
    <div>
      <FileSection title="Personal">
        {edit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <F k="First name" name="first_name" /><F k="Last name" name="last_name" /><F k="Gender" name="gender" />
            <F k="Date of birth" name="dob" type="date" /><F k="Nationality" name="nationality" /><F k="Country" name="country_of_residence" placeholder="country of residence" />
            <F k="Phone prefix" name="phone_prefix" placeholder="+351" /><F k="Phone" name="phone_number" />
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" disabled={saving} onClick={() => void save()} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(74,222,128,.4)', background: 'rgba(74,222,128,.12)', color: '#4ade80', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" disabled={saving} onClick={() => { setEdit(false); setMsg(null) }} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>Cancel</button>
              {msg && <span style={{ fontSize: '12px', color: msg.startsWith('❌') ? '#ff6464' : '#4ade80' }}>{msg}</span>}
            </div>
          </div>
        ) : (
          <>
            <FileRow k="Email" v={cu.email} />
            <FileRow k="Phone" v={phone} />
            <FileRow k="Date of birth" v={cu.dob} warn={!cu.dob} />
            <FileRow k="Nationality" v={cu.nationality} />
            {cu.gender ? <FileRow k="Gender" v={cu.gender} /> : null}
            {cu.country_of_residence ? <FileRow k="Country" v={cu.country_of_residence} /> : null}
            {!cu.dob && <div style={{ fontSize: '12.5px', color: '#ffd080', marginTop: '2px' }}>⚠ No date of birth — guest stays out of the DAN export until it is filled in.</div>}
            {customerId && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => { setMsg(null); setEdit(true) }} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(53,208,255,.35)', background: 'rgba(53,208,255,.08)', color: s.accent, fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: s.font }}>✎ Edit personal details</button>
                {msg && <span style={{ fontSize: '12px', color: msg.startsWith('❌') ? '#ff6464' : '#4ade80' }}>{msg}</span>}
              </div>
            )}
          </>
        )}
      </FileSection>
      <FileSection title="Emergency contact">
        <FileRow k="Name" v={cu.emergency_contact_name} />
        <FileRow k="Phone" v={cu.emergency_contact_phone} />
      </FileSection>
      <FileSection title="Insurance">
        <FileRow k="Source" v={diver.insurance_source ? INSURANCE_LABEL[diver.insurance_source as InsuranceSource] : null} warn={diver.insurance_source === 'none'} />
        <FileRow k="Provider" v={cu.insurance_provider} />
        <FileRow k="Policy no." v={cu.insurance_policy_number} />
        {diver.insurance_verified_at && (
          <FileRow k="Proof checked" v={diver.insurance_verified_at.slice(0, 10) + (diver.insurance_verified_by ? ` · ${diver.insurance_verified_by}` : '')} />
        )}
      </FileSection>
      {diver.medical_flag && (
        <FileSection title="Medical clearance">
          {diver.medical_flag_reason && <FileRow k="Reason" v={diver.medical_flag_reason} warn />}
          <FileRow
            k="Clearance seen"
            v={diver.medical_flag_resolved && diver.medical_resolved_at
              ? diver.medical_resolved_at.slice(0, 10) + (diver.medical_resolved_by ? ` · ${diver.medical_resolved_by}` : '')
              : '—'}
            warn={!diver.medical_flag_resolved}
          />
        </FileSection>
      )}
      <FileSection title="Certification & experience">
        <FileRow k="Level" v={cu.experience_level} />
        <FileRow k="Agency" v={cu.cert_agency} />
        <FileRow k="Licence no." v={cu.cert_number} />
        <FileRow k="Logged dives" v={cu.logged_dives != null ? String(cu.logged_dives) : null} />
        <FileRow k="Last dive" v={cu.last_dive_date ? `${cu.last_dive_date}${months != null ? ` · ${months} months ago` : ''}` : null} warn={!!refresher} />
      </FileSection>
      <FileSection title="Equipment">
        <FileRow k="Wetsuit" v={diver.wetsuit_size} />
        <FileRow k="BCD" v={diver.bcd_size} />
        <FileRow k="Boots" v={diver.boot_size} />
      </FileSection>
      {diver.checkin_completed_at && (
        <FileSection title="Check-in record">
          <FileRow k="Completed" v={diver.checkin_completed_at.slice(0, 16).replace('T', ' ')} />
          {cu.waiver_signed_at && <FileRow k="Waiver signed" v={cu.waiver_signed_at.slice(0, 10)} />}
          {cu.waiver_pdf_url && (
            <div style={{ paddingTop: '4px' }}>
              <a href={waiverHref(cu.waiver_pdf_url) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#35d0ff' }}>Open signature →</a>
            </div>
          )}
          {diver.special_notes && <FileRow k="Notes" v={diver.special_notes} />}
        </FileSection>
      )}
      {cu.staff_notes && (
        <FileSection title="Guest notes">
          <div style={{ fontSize: '12.5px', color: s.muted, fontStyle: 'italic', lineHeight: 1.5 }}>{cu.staff_notes}</div>
        </FileSection>
      )}
    </div>
  )
}
