'use client'

import { WAIVER_VERSION, WAIVER_SECTIONS, GDPR_CONSENT_TEXT, DIVER_CODE_INTRO, DIVER_CODE_PLEDGE, DIVER_CODE_ITEMS, DIVER_CODE_CLOSING, DIVER_CODE_CONSENT_TEXT, GUARDIAN_CONSENT_TEXT } from '@/lib/waiverText'
import { useState, useEffect, useRef, useCallback } from 'react'
import { countriesForSelect, countryName } from '@/lib/countries'
import { POLICY_VERSION, CANCELLATION_SUMMARY, CANCELLATION_BY_US, INSURANCE_NON_REFUNDABLE, TERMS_PATH } from '@/lib/policy'
import { INSURANCE_PROVIDERS, needsRefresher, type InsuranceSource } from '@/lib/insurance'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotInfo {
  id: string
  slot_index: number
  checkin_completed_at: string | null
  invite_email: string | null
  invite_sent_at: string | null
  customer: { name: string } | null
  guest_name?: string | null
  /** Vom Front Office erfasst — dann wird im Check-in nicht erneut gefragt. */
  last_dive_date?: string | null
}

interface BookingInfo {
  product_name: string
  booking_date: string
  session: string
  group_size: number
  source: string
}

interface TokenValidResponse {
  valid: true
  booking: BookingInfo
  slots: SlotInfo[]
  /** Notfallkontakt eines bereits eingecheckten Gastes derselben Buchung. */
  primary_emergency?: { name: string; phone: string; guest: string } | null
  payer_name?: string | null
  /** Wurde beim Kauf eine Tagesversicherung mitgebucht? */
  insurance_included?: boolean
  /** E-Mail des Kaeufers aus dem Checkout — nur bei Buchungstoken. */
  payer_email?: string | null
  /** Testbuchung (kein Echtgeld)? */
  is_test?: boolean
  /** true = Buchungs-Token; false = Einzel-Token eines Eingeladenen. */
  can_delegate?: boolean
  /** Versicherungswahl aus dem Checkout. */
  insurance_choice?: 'azd' | 'own' | null
  /** Kurs mit SSI-Versicherung im Preis (kein DAN) */
  insurance_ssi_included?: boolean
  /** Einsteigerkurs (Kategorie entry): keine Zertifizierung/Erfahrung abfragen */
  is_entry_course?: boolean
  /** AGB/Storno wurden schon beim Buchen akzeptiert */
  terms_accepted?: boolean
  /** Angebot „DAN day cover bei uns kaufen“ (Preis über die Tage-Staffel), null wenn nicht berechenbar */
  day_cover_offer?: { cents: number; days: number } | null
  /** Weitere Buchungen derselben Zahlung (Split-Buchung), je eigener Check-in-Link */
  group_others?: GroupOther[]
}

interface GroupOther { label: string; token: string; product_name: string | null; booking_date: string | null; session?: string | null; extras?: string[]; done: boolean }

interface TokenInvalidResponse {
  valid: false
  reason: 'expired' | 'not_found' | 'all_complete'
  group_others?: GroupOther[]
}

type TokenResponse = TokenValidResponse | TokenInvalidResponse

interface CustomerLookup {
  name: string        // legacy combined name (returned by old customers)
  first_name: string
  last_name: string
  phone: string       // legacy combined phone
  phone_prefix: string
  phone_number: string
  gender: string
  nationality: string
  country_of_residence: string
  dob: string
  experience_level: string
  cert_agency: string
  cert_number: string
  insurance_provider: string
  insurance_policy_number: string
  last_dive_date: string
  logged_dives: number | null
  emergency_contact_name: string
  emergency_contact_phone: string
  wetsuit_size: string
  bcd_size: string
  boot_size: string
  guardian_name: string
  guardian_relationship: string
  guardian_consent: boolean
}

interface FormData {
  first_name: string
  last_name: string
  email: string
  phone_prefix: string
  phone_number: string
  gender: 'M' | 'F' | ''
  dob: string
  nationality: string
  country_of_residence: string
  experience_level: string
  cert_agency: string
  cert_agency_other: string
  cert_number: string
  logged_dives: string
  last_dive_date: string
  insurance_source: InsuranceSource | ''
  insurance_provider: string
  insurance_provider_other: string
  insurance_policy_number: string
  /** own: 'number' = Police jetzt eintragen, 'show' = bei Ankunft vorzeigen (Staff trägt ein) */
  insurance_mode: '' | 'number' | 'show'
  /** DAN day cover bei uns kaufen (Zahlung vor Ort) — bei none Pflicht, bei own Alternative */
  buy_day_cover: boolean
  emergency_contact_name: string
  emergency_contact_phone: string
  wetsuit_size: string
  bcd_size: string
  boot_size: string
  guardian_name: string
  guardian_relationship: string
  guardian_consent: boolean
}


// ─── Styles ───────────────────────────────────────────────────────────────────

const c = {
  navy: '#0a1428',
  navyDark: '#060f1e',
  navyMid: '#0d1e38',
  accent: '#f3efe6',
  accentDim: 'rgba(243,239,230,.15)',
  accentBorder: 'rgba(243,239,230,.25)',
  text: '#f3efe6',
  muted: '#c9c2b6',
  sub: '#4a7a9b',
  success: '#2dd4a0',
  warning: '#ffa040',
  error: '#ff5a5a',
  font: `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(243,239,230,.2)',
  borderRadius: '10px',
  padding: '13px 14px',
  fontSize: '16px',
  color: c.text,
  fontFamily: c.font,
  outline: 'none',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '.14em',
  textTransform: 'uppercase' as const,
  color: c.muted,
  marginBottom: '7px',
  display: 'block',
}

const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '15px',
  borderRadius: '12px',
  border: 'none',
  background: `linear-gradient(135deg, ${c.accent}, #1a8fe0)`,
  color: '#090909',
  fontWeight: 800,
  fontSize: '16px',
  cursor: 'pointer',
  fontFamily: c.font,
  letterSpacing: '.01em',
}

const ghostBtn: React.CSSProperties = {
  padding: '11px 20px',
  borderRadius: '10px',
  border: `1px solid ${c.accentBorder}`,
  background: 'transparent',
  color: c.accent,
  fontWeight: 700,
  fontSize: '14px',
  cursor: 'pointer',
  fontFamily: c.font,
}

const fieldGroup = (children: React.ReactNode, label: string, required = false) => ({})

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CheckinPage() {
  const [token, setToken] = useState<string | null>(null)
  const [slotIndex, setSlotIndex] = useState(0)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      setToken(params.get('token'))
      setSlotIndex(parseInt(params.get('slot') ?? '0', 10) || 0)
    }
  }, [])

  if (!token) {
    return (
      <Layout>
        <ErrorCard reason="not_found" />
      </Layout>
    )
  }

  return (
    <Layout>
      <CheckinFlow token={token} initialSlot={slotIndex} />
    </Layout>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: c.navyDark,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 16px 60px',
      fontFamily: c.font,
      color: c.text,
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '28px', paddingTop: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: c.accent }}>
            AZORES DIVING
          </div>
          <div style={{ fontSize: '11px', color: c.sub, marginTop: '2px' }}>Digital Check-in</div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Error Card ───────────────────────────────────────────────────────────────

/** Weitere Gäste derselben Zahlung (Split-Buchung): jeder hat seinen eigenen Check-in-Link. */
function GroupOthersCard({ others }: { others: GroupOther[] }) {
  if (!others.length) return null
  const open = others.filter(o => !o.done).length
  return (
    <div style={{ background: 'rgba(243,239,230,.05)', border: `1px solid ${c.accentBorder}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', textAlign: 'left' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: c.text, marginBottom: '4px' }}>
        {open > 0 ? 'Your booking has more guests — each one checks in separately' : 'All other guests of this booking are checked in'}
      </div>
      {others.map(o => (
        <div key={o.token} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,.06)', marginTop: '8px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: c.text }}>{o.label}</div>
            {(o.product_name || o.booking_date) && <div style={{ fontSize: '12px', color: c.muted }}>{o.product_name ?? ''}{o.booking_date ? ` · ${formatDate(o.booking_date)}` : ''}{o.session ? ` ${o.session.toUpperCase()}` : ''}</div>}
            {(o.extras ?? []).length > 0 && <div style={{ fontSize: '11.5px', color: c.muted, marginTop: '2px' }}>+ {(o.extras ?? []).join(', ')}</div>}
          </div>
          {o.done
            ? <span style={{ fontSize: '12px', fontWeight: 700, color: c.success, whiteSpace: 'nowrap' }}>✓ Checked in</span>
            : <a href={`/dive-os/checkin?token=${o.token}`} style={{ padding: '9px 14px', borderRadius: '10px', background: '#f3efe6', color: '#090909', fontWeight: 800, fontSize: '13px', textDecoration: 'none', whiteSpace: 'nowrap' }}>Check in {o.label.replace(/ — .*/, '')} →</a>}
        </div>
      ))}
    </div>
  )
}

function ErrorCard({ reason, others }: { reason: 'expired' | 'not_found' | 'all_complete'; others?: GroupOther[] }) {
  const msgs: Record<string, { title: string; body: string }> = {
    expired: {
      title: 'Link Expired',
      body: 'This check-in link has expired. Please contact us to get a new one.',
    },
    not_found: {
      title: 'Invalid Link',
      body: 'This check-in link is not valid. Please make sure you copied the full URL.',
    },
    all_complete: {
      title: 'Already Complete',
      body: 'All guests in this booking have already completed check-in.',
    },
  }
  const { title, body } = msgs[reason] ?? msgs.not_found

  return (
    <Card>
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: c.text, marginBottom: '10px' }}>{title}</div>
        <div style={{ fontSize: '14px', color: c.muted, lineHeight: 1.6, marginBottom: '28px' }}>{body}</div>
        {others && others.length > 0 && <GroupOthersCard others={others} />}
        <a
          href="/dive-os/book"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '13px 24px',
            borderRadius: '12px',
            background: '#25d366',
            color: '#fff',
            fontWeight: 700,
            fontSize: '15px',
            textDecoration: 'none',
          }}
        >
          <span>💬</span> Contact us on WhatsApp
        </a>
      </div>
    </Card>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: c.navyMid,
      border: '1px solid rgba(255,255,255,.08)',
      borderRadius: '18px',
      padding: '28px 24px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const STEPS = ['Welcome', 'Personal', 'Medical', 'Waiver', 'Experience', 'Emergency', 'Review']

/** Ausstellende Organisationen. 'other' oeffnet ein Freitextfeld — die Liste
 *  ist nie vollstaendig, und ein Gast mit einem Schein von sonstwoher soll
 *  nicht raten muessen, was davon am ehesten passt. */
/** Fuesslingsgroessen. EU fuehrend, US daneben — ein Teil der Gaeste kennt nur
 *  die US-Groesse, und wer im Laden danebensteht, will nicht umrechnen. */
const BOOT_SIZES = [
  'EU 36-37 · US 4-5',
  'EU 38-39 · US 6-6.5',
  'EU 40-41 · US 7.5-8',
  'EU 42-43 · US 9-10',
  'EU 44-45 · US 10.5-11.5',
  'EU 46-47 · US 12-13',
  'EU 48+ · US 14+',
] as const

const CERT_AGENCIES = ['SSI', 'PADI', 'CMAS', 'NAUI', 'SDI / TDI', 'RAID', 'BSAC', 'PDIC', 'IANTD'] as const


function ProgressBar({ step, total = STEPS.length }: { step: number; total?: number }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {STEPS.map((label, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: '3px',
              borderRadius: '2px',
              background: i < step ? c.accent : i === step ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.08)',
              transition: 'background .3s',
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: '11px', color: c.muted, textAlign: 'right' }}>
        Step {step + 1} of {total} — {STEPS[step]}
      </div>
    </div>
  )
}

// ─── Guest Progress ───────────────────────────────────────────────────────────

function GuestProgress({ slots, currentSlot }: { slots: SlotInfo[]; currentSlot: number }) {
  if (slots.length <= 1) return null
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      marginBottom: '20px',
      flexWrap: 'wrap',
    }}>
      {slots.map((slot, i) => {
        const done = slot.checkin_completed_at !== null
        const invited = !done && Boolean(slot.invite_sent_at)
        const isCurrent = i === currentSlot
        const bg = done ? 'rgba(45,212,160,.12)' : invited ? 'rgba(243,239,230,.06)' : isCurrent ? c.accentDim : 'rgba(255,255,255,.04)'
        const border = done ? 'rgba(45,212,160,.3)' : invited ? c.accentBorder : isCurrent ? c.accentBorder : 'rgba(255,255,255,.08)'
        const color = done ? c.success : invited ? c.muted : isCurrent ? c.accent : c.muted
        return (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            borderRadius: '20px',
            background: bg,
            border: `1px solid ${border}`,
            fontSize: '12px',
            color,
            fontWeight: isCurrent ? 700 : 500,
          }}>
            {done ? '✓' : invited ? '✉' : isCurrent ? '●' : '○'}
            <span>
              Guest {i + 1}
              {done && slot.customer ? ` · ${slot.customer.name.split(' ')[0]}` : ''}
              {invited ? ' · invited' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Flow ────────────────────────────────────────────────────────────────

// ─── DAN/WRSTC Medical Questionnaire v2022-02-01 ──────────────────────────────
// Verbindlicher englischer Wortlaut — nicht umformulieren.
// © 2020 DAN / WRSTC / RSTC / RSTC Europe / UHMS / CMAS

interface MainQuestion {
  key: string
  label: string
  boxKey?: string   // Buchstabe der Folgebox, falls vorhanden
  direct?: boolean  // true = Ja loest Attestpflicht direkt aus (keine Box)
}

interface BoxItem { key: string; label: string }
interface BoxDef  { intro: string; items: BoxItem[] }

const MAIN_QUESTIONS: MainQuestion[] = [
  { key: 'q1',  label: 'I have had problems with my lungs, breathing, heart and/or blood affecting my normal physical or mental performance.', boxKey: 'A' },
  { key: 'q2',  label: 'I am over 45 years of age.', boxKey: 'B' },
  { key: 'q3',  label: 'I struggle to perform moderate exercise (for example, walk 1.6 kilometer/one mile in 14 minutes or swim 200 meters/yards without resting), OR I have been unable to participate in a normal physical activity due to fitness or health reasons within the past 12 months.', direct: true },
  { key: 'q4',  label: 'I have had problems with my eyes, ears, or nasal passages/sinuses.', boxKey: 'C' },
  { key: 'q5',  label: 'I have had surgery within the last 12 months, OR I have ongoing problems related to past surgery.', direct: true },
  { key: 'q6',  label: 'I have lost consciousness, had migraine headaches, seizures, stroke, significant head injury, or suffer from persistent neurologic injury or disease.', boxKey: 'D' },
  { key: 'q7',  label: 'I am currently undergoing treatment (or have required treatment within the last five years) for psychological problems, personality disorder, panic attacks, or an addiction to drugs or alcohol; or, I have been diagnosed with a learning or developmental disability.', boxKey: 'E' },
  { key: 'q8',  label: 'I have had back problems, hernia, ulcers, or diabetes.', boxKey: 'F' },
  { key: 'q9',  label: 'I have had stomach or intestine problems, including recent diarrhea.', boxKey: 'G' },
  { key: 'q10', label: 'I am taking prescription medications (with the exception of birth control or anti-malarial drugs other than mefloquine (Lariam)).', direct: true },
]

const BOX_QUESTIONS: Record<string, BoxDef> = {
  A: {
    intro: 'I have/have had:',
    items: [
      { key: 'a1', label: 'Chest surgery, heart surgery, heart valve surgery, an implantable medical device (eg, stent, pacemaker, neurostimulator), pneumothorax, and/or chronic lung disease.' },
      { key: 'a2', label: 'Asthma, wheezing, severe allergies, hay fever or congested airways within the last 12 months that limits my physical activity/exercise.' },
      { key: 'a3', label: 'A problem or illness involving my heart such as: angina, chest pain on exertion, heart failure, immersion pulmonary edema, heart attack or stroke, OR am taking medication for any heart condition.' },
      { key: 'a4', label: 'Recurrent bronchitis and currently coughing within the past 12 months, OR have been diagnosed with emphysema.' },
      { key: 'a5', label: 'Symptoms affecting my lungs, breathing, heart and/or blood in the last 30 days that impair my physical or mental performance.' },
    ],
  },
  B: {
    intro: 'I am over 45 years of age and:',
    items: [
      { key: 'b1', label: 'I currently smoke or inhale nicotine by other means.' },
      { key: 'b2', label: 'I have a high cholesterol level.' },
      { key: 'b3', label: 'I have high blood pressure.' },
      { key: 'b4', label: 'I have had a close blood relative die suddenly or of cardiac disease or stroke before the age of 50, OR have a family history of heart disease before age 50 (including abnormal heart rhythms, coronary artery disease or cardiomyopathy).' },
    ],
  },
  C: {
    intro: 'I have/have had:',
    items: [
      { key: 'c1', label: 'Sinus surgery within the last 6 months.' },
      { key: 'c2', label: 'Ear disease or ear surgery, hearing loss, or problems with balance.' },
      { key: 'c3', label: 'Recurrent sinusitis within the past 12 months.' },
      { key: 'c4', label: 'Eye surgery within the past 3 months.' },
    ],
  },
  D: {
    intro: 'I have/have had:',
    items: [
      { key: 'd1', label: 'Head injury with loss of consciousness within the past 5 years.' },
      { key: 'd2', label: 'Persistent neurologic injury or disease.' },
      { key: 'd3', label: 'Recurring migraine headaches within the past 12 months, or take medications to prevent them.' },
      { key: 'd4', label: 'Blackouts or fainting (full/partial loss of consciousness) within the last 5 years.' },
      { key: 'd5', label: 'Epilepsy, seizures, or convulsions, OR take medications to prevent them.' },
    ],
  },
  E: {
    intro: 'I have/have had:',
    items: [
      { key: 'e1', label: 'Behavioral health, mental or psychological problems requiring medical/psychiatric treatment.' },
      { key: 'e2', label: 'Major depression, suicidal ideation, panic attacks, uncontrolled bipolar disorder requiring medication/psychiatric treatment.' },
      { key: 'e3', label: 'Been diagnosed with a mental health condition or a learning/developmental disorder that requires ongoing care or special accommodation.' },
      { key: 'e4', label: 'An addiction to drugs or alcohol requiring treatment within the last 5 years.' },
    ],
  },
  F: {
    intro: 'I have/have had:',
    items: [
      { key: 'f1', label: 'Recurrent back problems in the last 6 months that limit my everyday activity.' },
      { key: 'f2', label: 'Back or spinal surgery within the last 12 months.' },
      { key: 'f3', label: 'Diabetes, either drug or diet controlled, OR gestational diabetes within the last 12 months.' },
      { key: 'f4', label: 'An uncorrected hernia that limits my physical abilities.' },
      { key: 'f5', label: 'Active or untreated ulcers, problem wounds, or ulcer surgery within the last 6 months.' },
    ],
  },
  G: {
    intro: 'I have had:',
    items: [
      { key: 'g1', label: 'Ostomy surgery and do not have medical clearance to swim or engage in physical activity.' },
      { key: 'g2', label: 'Dehydration requiring medical intervention within the last 7 days.' },
      { key: 'g3', label: 'Active or untreated stomach or intestinal ulcers or ulcer surgery within the last 6 months.' },
      { key: 'g4', label: 'Frequent heartburn, regurgitation, or gastroesophageal reflux disease (GERD).' },
      { key: 'g5', label: 'Active or uncontrolled ulcerative colitis or Crohn\'s disease.' },
      { key: 'g6', label: 'Bariatric surgery within the last 12 months.' },
    ],
  },
}

// Welche Box-Schluessel gehoeren zu welchem Box-Buchstaben.
const BOX_KEYS: Record<string, string[]> = {
  A: ['a1','a2','a3','a4','a5'],
  B: ['b1','b2','b3','b4'],
  C: ['c1','c2','c3','c4'],
  D: ['d1','d2','d3','d4','d5'],
  E: ['e1','e2','e3','e4'],
  F: ['f1','f2','f3','f4','f5'],
  G: ['g1','g2','g3','g4','g5','g6'],
}

// Welche Hauptfrage hat welchen Box-Buchstaben ausgeloest.
const BOX_PARENT: Record<string, string> = {
  a: 'Q1', b: 'Q2', c: 'Q4', d: 'Q6', e: 'Q7', f: 'Q8', g: 'Q9',
}

// Gibt lesbare Grund-Strings zurueck, z.B. ["Q3", "Q2 + B1, B3"].
function buildMedicalReasons(answers: Record<string, boolean>): string[] {
  const reasons: string[] = []
  if (answers.q3)  reasons.push('Q3')
  if (answers.q5)  reasons.push('Q5')
  if (answers.q10) reasons.push('Q10')
  const byParent: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(answers)) {
    if (!v || !/^[a-g]\d/.test(k)) continue
    const parent = BOX_PARENT[k[0]]
    if (parent) (byParent[parent] ??= []).push(k.toUpperCase())
  }
  for (const [parent, items] of Object.entries(byParent).sort()) {
    reasons.push(`${parent} + ${items.join(', ')}`)
  }
  return reasons
}

function CheckinFlow({ token, initialSlot }: { token: string; initialSlot: number }) {
  const [step, setStep] = useState(-1) // -1 = loading
  const [tokenData, setTokenData] = useState<TokenValidResponse | null>(null)
  const [tokenError, setTokenError] = useState<'expired' | 'not_found' | 'all_complete' | null>(null)
  const [tokenErrorOthers, setTokenErrorOthers] = useState<GroupOther[]>([])
  const [currentSlot, setCurrentSlot] = useState(initialSlot)

  // Form state
  const [form, setForm] = useState<FormData>({
    first_name: '', last_name: '', email: '', phone_prefix: '', phone_number: '', gender: '', dob: '', nationality: '', country_of_residence: '',
    experience_level: 'none', cert_agency: '', cert_agency_other: '', cert_number: '', logged_dives: '',
    last_dive_date: '',
    insurance_source: '', insurance_provider: '', insurance_provider_other: '', insurance_policy_number: '', insurance_mode: '', buy_day_cover: false,
    emergency_contact_name: '', emergency_contact_phone: '',
    wetsuit_size: '', bcd_size: '', boot_size: '',
    guardian_name: '', guardian_relationship: '', guardian_consent: false,
  })

  // Last dive aus der Buchung (Walk-in erfasst es pro Gast). Dann read-only anzeigen statt erneut fragen.
  const slotLastDive = tokenData?.slots.find(x => x.slot_index === currentSlot)?.last_dive_date ?? null
  useEffect(() => {
    if (slotLastDive) setForm(f => (f.last_dive_date === slotLastDive ? f : { ...f, last_dive_date: slotLastDive }))
  }, [slotLastDive])
  // Beim ersten Ja im Medical-Teil sofort aufklaeren, nicht erst am Ende.
  const [medicalAckOpen, setMedicalAckOpen] = useState(false)
  const [medicalAckAt, setMedicalAckAt] = useState<string | null>(null)
  const [policyAccepted, setPolicyAccepted] = useState(false)
  /** Notfallkontakt des ersten bereits eingecheckten Gastes dieser Buchung. */
  const [primaryEmergency, setPrimaryEmergency] = useState<{ name: string; phone: string; guest: string } | null>(null)
  const [sameAsPrimary, setSameAsPrimary] = useState(false)
  const [welcomeBack, setWelcomeBack] = useState(false)
  // Seitenwechsel im Check-in: neue Seite immer von oben beginnen (kein Hochscrollen nötig)
  useEffect(() => {
    if (step >= 0) window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [step, currentSlot])
  // Einsteigerkurs: nur none/basic/scuba sind gültig — eine aus dem Profil vorbefüllte höhere Stufe zurücksetzen
  useEffect(() => {
    if (tokenData?.is_entry_course) setForm(f => ['none', 'basic', 'scuba'].includes(f.experience_level) ? f : { ...f, experience_level: 'none' })
  }, [tokenData?.is_entry_course, form.experience_level]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Hat die Buchung schon eine Tagesversicherung? Dann gibt es nichts zu klaeren. */
  function dayInsuranceIncluded(): boolean {
    return Boolean(tokenData?.insurance_included)
  }

  function effectiveInsuranceSource(): InsuranceSource {
    if (dayInsuranceIncluded()) return 'azd_day'
    if (tokenData?.insurance_choice === 'azd') return 'azd_day'
    return (form.insurance_source || 'none') as InsuranceSource
  }

  function insuranceProviderValue(): string {
    if (form.insurance_provider === 'other') return form.insurance_provider_other.trim()
    return form.insurance_provider.trim()
  }

  /** 'other' ist keine Agency, sondern die Aufforderung, eine zu nennen. */
  function certAgencyValue(): string {
    if (form.cert_agency === 'other') return form.cert_agency_other.trim()
    return form.cert_agency.trim()
  }
  const emailLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchedRef = useRef(new Set<string>())
  // Geburtsdatum: Browser zeigt ein nicht existierendes Datum (29.02.1999) an, liefert aber keinen Wert → sofort sichtbar melden
  const [dobBad, setDobBad] = useState(false)
  const lookupSeqRef = useRef(0)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [medicalAnswers, setMedicalAnswers] = useState<Record<string, boolean>>({
    q1: false, q2: false, q3: false, q4: false, q5: false,
    q6: false, q7: false, q8: false, q9: false, q10: false,
  })

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [gdprConsent, setGdprConsent] = useState(false)
  const [diverCodeConsent, setDiverCodeConsent] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitRef, setSubmitRef] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Einladungsschritt (erscheint nach eigenem Check-in, wenn group_size > 1)
  const [inviteStepDone, setInviteStepDone] = useState(false)
  const [inviteEmails, setInviteEmails] = useState<Record<number, string>>({})
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteResults, setInviteResults] = useState<Array<{
    slot_index: number; email: string; ok: boolean; error?: string; ref?: string; http_status?: number
  }> | null>(null)
  // Adressen für erneutes Senden im Erfolgsbildschirm (vorbelegt mit invite_email)
  const [resendEmails, setResendEmails] = useState<Record<number, string>>({})

  // ── Schritt-Telemetrie ────────────────────────────────────────────────────
  // Fire-and-forget; Fehler werden still verschluckt.
  const stepEnteredAtRef = useRef<string | null>(null)
  const prevStepRef = useRef<number | null>(null)

  function sendStepEvent(
    bcId: string,
    stepName: string,
    opts: { entered_at?: string; left_at?: string; is_test?: boolean },
  ) {
    if (!bcId) return
    const payload = JSON.stringify({ booking_customer_id: bcId, step: stepName, ...opts })
    fetch('/api/checkin/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => {})
  }

  function beaconCurrentStep(bcId: string, stepName: string) {
    if (!bcId || !stepName) return
    const payload = JSON.stringify({
      booking_customer_id: bcId,
      step: stepName,
      left_at: new Date().toISOString(),
    })
    navigator.sendBeacon('/api/checkin/step', new Blob([payload], { type: 'application/json' }))
  }

  const STEP_NAMES = ['welcome', 'personal', 'medical', 'waiver', 'experience', 'emergency', 'review']

  // Validate token on mount; use payer_email from the booking to prefill the
  // form BEFORE the Personal step renders — no empty flash, no jump.
  useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(`/api/checkin?token=${encodeURIComponent(token)}`)
        const data: TokenResponse = await res.json()
        if (!data.valid) {
          setTokenError((data as TokenInvalidResponse).reason)
          setTokenErrorOthers((data as TokenInvalidResponse).group_others ?? [])
          return
        }
        const validData = data as TokenValidResponse
        setTokenData(validData)
        // Versicherungswahl aus dem Checkout vorausfuellen.
        if (validData.insurance_choice === 'own') {
          setForm(f => ({ ...f, insurance_source: 'own' }))
        }
        const pe = validData.primary_emergency
        if (pe && pe.name) setPrimaryEmergency(pe)
        const firstIncomplete = validData.slots.find(s => !s.checkin_completed_at)
        if (firstIncomplete) setCurrentSlot(firstIncomplete.slot_index)

        if (validData.payer_email) {
          const payerEmail = validData.payer_email
          try {
            const lookupRes = await fetch(
              `/api/checkin?token=${encodeURIComponent(token)}&email=${encodeURIComponent(payerEmail)}`
            )
            if (!lookupRes.ok) throw new Error(`HTTP ${lookupRes.status}`)
            const ld = await lookupRes.json()
            if (ld.found && ld.customer) {
              const cu = ld.customer as CustomerLookup
              setForm(f => ({
                ...f,
                email: payerEmail,
                first_name: cu.first_name || (cu.name ? cu.name.split(' ')[0] : '') || f.first_name,
                last_name: cu.last_name || (cu.name ? cu.name.split(' ').slice(1).join(' ') : '') || f.last_name,
                phone_prefix: cu.phone_prefix || f.phone_prefix,
                phone_number: cu.phone_number || f.phone_number,
                gender: (cu.gender || f.gender) as 'M' | 'F' | '',
                nationality: cu.nationality || f.nationality,
                country_of_residence: cu.country_of_residence || f.country_of_residence,
                dob: cu.dob || f.dob,
                experience_level: cu.experience_level || f.experience_level,
                cert_agency: cu.cert_agency || f.cert_agency,
                cert_number: cu.cert_number || f.cert_number,
                insurance_provider: cu.insurance_provider || f.insurance_provider,
                insurance_policy_number: cu.insurance_policy_number || f.insurance_policy_number,
                last_dive_date: cu.last_dive_date || f.last_dive_date,
                logged_dives: cu.logged_dives != null ? String(cu.logged_dives) : f.logged_dives,
                insurance_source: (cu.insurance_policy_number ? 'own' : f.insurance_source) as InsuranceSource | '',
                emergency_contact_name: cu.emergency_contact_name || f.emergency_contact_name,
                emergency_contact_phone: cu.emergency_contact_phone || f.emergency_contact_phone,
                wetsuit_size: cu.wetsuit_size || f.wetsuit_size,
                bcd_size: cu.bcd_size || f.bcd_size,
                boot_size: cu.boot_size || f.boot_size,
              }))
              setWelcomeBack(true)
            } else {
              // Neuer Gast: E-Mail + Name aus der Buchung (Stripe-Zahler) vorbelegen — nichts doppelt tippen
              const pn = (validData.payer_name ?? '').trim()
              const parts = pn.split(/\s+/).filter(Boolean)
              setForm(f => ({
                ...f,
                email: payerEmail,
                first_name: f.first_name || parts[0] || '',
                last_name: f.last_name || parts.slice(1).join(' ') || '',
              }))
            }
          } catch (e) {
            setLookupError(e instanceof Error ? e.message : 'Failed to load your details')
          }
        }

        setStep(0)
      } catch {
        setTokenError('not_found')
      }
    }
    validate()
  }, [token])

  // ── Step-Tracking: bei jedem Schrittwechsel entered_at / left_at schreiben ──
  useEffect(() => {
    // Welcome (0) wird bewusst nicht getrackt: die Zeit laeuft erst ab Klick auf den Start-Button.
    if (step < 1 || !tokenData) return
    const stepName = STEP_NAMES[step]
    if (!stepName) return

    const bcId = tokenData.slots.find(s => s.slot_index === currentSlot)?.id ?? ''
    const isTest = tokenData.is_test ?? false
    const now = new Date().toISOString()

    // Vorherigen Schritt schliessen
    if (prevStepRef.current !== null && stepEnteredAtRef.current !== null) {
      const prevName = STEP_NAMES[prevStepRef.current]
      if (prevName) sendStepEvent(bcId, prevName, { left_at: now, is_test: isTest })
    }

    // Neuen Schritt betreten
    sendStepEvent(bcId, stepName, { entered_at: now, is_test: isTest })
    stepEnteredAtRef.current = now
    prevStepRef.current = step
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentSlot])

  // ── Beacon beim Verlassen der Seite ───────────────────────────────────────
  useEffect(() => {
    if (!tokenData) return
    function sendBeaconIfActive() {
      if (prevStepRef.current === null || !tokenData) return
      const stepName = STEP_NAMES[prevStepRef.current]
      const bcId = tokenData.slots.find(s => s.slot_index === currentSlot)?.id ?? ''
      if (stepName && bcId) beaconCurrentStep(bcId, stepName)
    }
    function onHidden() { if (document.visibilityState === 'hidden') sendBeaconIfActive() }
    function onPageHide() { sendBeaconIfActive() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenData, currentSlot])

  // Email lookup for returning customers (second diver entering a different email).
  // A sequence number on the ref prevents a late response from overwriting a newer one.
  // touchedRef ensures fields the guest already typed are never overwritten.
  const handleEmailChange = useCallback((email: string) => {
    touchedRef.current.add('email')
    setForm(f => ({ ...f, email }))
    setWelcomeBack(false)
    setLookupError(null)
    if (emailLookupTimerRef.current) clearTimeout(emailLookupTimerRef.current)
    if (email.includes('@') && email.includes('.')) {
      const seq = ++lookupSeqRef.current
      emailLookupTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/checkin?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
          )
          if (lookupSeqRef.current !== seq) return
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (lookupSeqRef.current !== seq) return
          if (data.found && data.customer) {
            const cu = data.customer as CustomerLookup
            const t = touchedRef.current
            setForm(f => ({
              ...f,
              first_name: t.has('first_name') ? f.first_name : (cu.first_name || (cu.name ? cu.name.split(' ')[0] : '') || f.first_name),
              last_name: t.has('last_name') ? f.last_name : (cu.last_name || (cu.name ? cu.name.split(' ').slice(1).join(' ') : '') || f.last_name),
              phone_prefix: t.has('phone_prefix') ? f.phone_prefix : (cu.phone_prefix || f.phone_prefix),
              phone_number: t.has('phone_number') ? f.phone_number : (cu.phone_number || f.phone_number),
              gender: (t.has('gender') ? f.gender : (cu.gender || f.gender)) as 'M' | 'F' | '',
              nationality: t.has('nationality') ? f.nationality : (cu.nationality || f.nationality),
              country_of_residence: t.has('country_of_residence') ? f.country_of_residence : (cu.country_of_residence || f.country_of_residence),
              dob: t.has('dob') ? f.dob : (cu.dob || f.dob),
              experience_level: t.has('experience_level') ? f.experience_level : (cu.experience_level || f.experience_level),
              cert_agency: t.has('cert_agency') ? f.cert_agency : (cu.cert_agency || f.cert_agency),
              cert_number: t.has('cert_number') ? f.cert_number : (cu.cert_number || f.cert_number),
              insurance_provider: t.has('insurance_provider') ? f.insurance_provider : (cu.insurance_provider || f.insurance_provider),
              insurance_policy_number: t.has('insurance_policy_number') ? f.insurance_policy_number : (cu.insurance_policy_number || f.insurance_policy_number),
              last_dive_date: t.has('last_dive_date') ? f.last_dive_date : (cu.last_dive_date || f.last_dive_date),
              logged_dives: t.has('logged_dives') ? f.logged_dives : (cu.logged_dives != null ? String(cu.logged_dives) : f.logged_dives),
              insurance_source: t.has('insurance_source') ? f.insurance_source : ((cu.insurance_policy_number ? 'own' : f.insurance_source) as InsuranceSource | ''),
              emergency_contact_name: t.has('emergency_contact_name') ? f.emergency_contact_name : (cu.emergency_contact_name || f.emergency_contact_name),
              emergency_contact_phone: t.has('emergency_contact_phone') ? f.emergency_contact_phone : (cu.emergency_contact_phone || f.emergency_contact_phone),
              wetsuit_size: t.has('wetsuit_size') ? f.wetsuit_size : (cu.wetsuit_size || f.wetsuit_size),
              bcd_size: t.has('bcd_size') ? f.bcd_size : (cu.bcd_size || f.bcd_size),
              boot_size: t.has('boot_size') ? f.boot_size : (cu.boot_size || f.boot_size),
            }))
            setWelcomeBack(true)
          }
        } catch (e) {
          if (lookupSeqRef.current !== seq) return
          setLookupError(e instanceof Error ? e.message : 'Failed to load your details')
        }
      }, 800)
    } else {
      lookupSeqRef.current++ // cancel any in-flight result
    }
  }, [token])

  // q3, q5, q10 loesen Attestpflicht direkt aus; jedes Ja in den Boxen (a-g) ebenfalls.
  const medicalFlagged =
    !!medicalAnswers.q3 || !!medicalAnswers.q5 || !!medicalAnswers.q10 ||
    Object.entries(medicalAnswers).some(([k, v]) => v && /^[a-g]/.test(k))
  const medicalReasons = buildMedicalReasons(medicalAnswers)

  function nextStep() { setStep(s => s + 1) }
  function prevStep() { setStep(s => s - 1) }

  function handleMainQuestion(qKey: string, value: boolean, boxLetter?: string) {
    setMedicalAnswers(prev => {
      const next = { ...prev, [qKey]: value }
      // Wechsel auf Nein: Box-Antworten verwerfen, nicht nur verstecken.
      if (!value && boxLetter) BOX_KEYS[boxLetter]?.forEach(k => delete next[k])
      return next
    })
    // Direkte Attestpflicht: Dialog sofort oeffnen.
    if (value && ['q3', 'q5', 'q10'].includes(qKey) && !medicalAckAt) setMedicalAckOpen(true)
  }

  function handleBoxQuestion(boxKey: string, value: boolean) {
    setMedicalAnswers(prev => ({ ...prev, [boxKey]: value }))
    if (value && !medicalAckAt) setMedicalAckOpen(true)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body = {
        token,
        slot_index: currentSlot,
        customer: {
          email: form.email,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
          phone_prefix: form.phone_prefix.trim(),
          phone_number: form.phone_number.trim(),
          phone: `${form.phone_prefix.trim()} ${form.phone_number.trim()}`.trim(),
          gender: form.gender,
          dob: form.dob,
          nationality: form.nationality,
          country_of_residence: form.country_of_residence,
          experience_level: form.experience_level,
          cert_agency: certAgencyValue() || null,
          cert_number: form.cert_number.trim() || null,
          insurance_source: form.buy_day_cover && !dayInsuranceIncluded() ? 'azd_day' : (dayInsuranceIncluded() ? 'azd_day' : 'own'),
          insurance_provider: insuranceProviderValue() || null,
          insurance_policy_number: form.insurance_policy_number.trim() || null,
          last_dive_date: form.last_dive_date || null,
          logged_dives: form.logged_dives ? parseInt(form.logged_dives) : null,
          emergency_contact_name: form.emergency_contact_name,
          emergency_contact_phone: form.emergency_contact_phone,
          wetsuit_size: form.wetsuit_size || null,
          bcd_size: form.bcd_size || null,
          boot_size: form.boot_size || null,
          guardian_name: form.guardian_name.trim() || null,
          guardian_relationship: form.guardian_relationship || null,
          guardian_consent_at: form.guardian_consent ? new Date().toISOString() : null,
        },
        medical: {
          flagged: medicalFlagged,
          reasons: medicalReasons,
          acknowledged_at: medicalAckAt,
        },
        medical_answers: medicalAnswers,
        medical_form_version: '2022-02-01',
        waiver_signed: true,
        // Was der Gast in diesem Moment bestaetigt hat — der Server prueft die Version und speichert den Wortlaut als Nachweis
        consents: { waiver_version: WAIVER_VERSION, waiver: true, gdpr_art9: gdprConsent, diver_code: diverCodeConsent },
        buy_day_cover: !dayInsuranceIncluded() && form.buy_day_cover,
        signature_data_url: signatureDataUrl,
        // Zustimmung pro Person, nicht pro Buchung — wer nicht selbst bestaetigt
        // hat, hat nicht bestaetigt.
        policy_accepted: policyAccepted,
        policy_version: POLICY_VERSION,
      }
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) {
        setSubmitRef(data.ref ?? null)
        throw new Error(data.error || 'Submit failed')
      }

      // Mark current slot as completed in local state
      if (tokenData) {
        setTokenData(prev => prev ? ({
          ...prev,
          slots: prev.slots.map(s =>
            s.slot_index === currentSlot
              ? { ...s, checkin_completed_at: new Date().toISOString(), customer: { name: `${form.first_name} ${form.last_name}`.trim() } }
              : s
          ),
        }) : prev)
      }
      // Damit Gast 2 den Notfallkontakt uebernehmen kann, ohne ihn abzutippen.
      // Auf einem anderen Geraet liefert ihn die Token-Antwort.
      setPrimaryEmergency(prev => prev ?? {
        name: form.emergency_contact_name,
        phone: form.emergency_contact_phone,
        guest: `${form.first_name} ${form.last_name}`.trim(),
      })
      setDone(true)
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function startNextGuest() {
    if (!tokenData) return
    // Eingeladene Slots (invite_sent_at gesetzt) gehören dem Eingeladenen —
    // der Bucher füllt nur noch die verbleibenden, nicht delegierten Slots aus.
    const nextSlot = tokenData.slots.find(s => !s.checkin_completed_at && !s.invite_sent_at && s.slot_index !== currentSlot)
    if (!nextSlot) return
    setCurrentSlot(nextSlot.slot_index)
    setForm({
      first_name: '', last_name: '', email: '', phone_prefix: '', phone_number: '', gender: '', dob: '', nationality: '', country_of_residence: '',
      experience_level: 'none', cert_agency: '', cert_agency_other: '', cert_number: '', logged_dives: '',
    last_dive_date: '',
    insurance_source: '', insurance_provider: '', insurance_provider_other: '', insurance_policy_number: '', insurance_mode: '', buy_day_cover: false,
      emergency_contact_name: '', emergency_contact_phone: '',
      wetsuit_size: '', bcd_size: '', boot_size: '',
      guardian_name: '', guardian_relationship: '', guardian_consent: false,
    })
    setMedicalAnswers({ q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false, q8: false, q9: false, q10: false })
    setSignatureDataUrl(null)
    setConfirmed(false)
    setMedicalAckOpen(false)
    setMedicalAckAt(null)
    setPolicyAccepted(false)
    setSameAsPrimary(false)
    setDone(false)
    setWelcomeBack(false)
    touchedRef.current = new Set()
    lookupSeqRef.current++
    setLookupError(null)
    setStep(1)
  }

  // ── Loading ──
  if (step === -1 && !tokenError) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <LoadingSpinner />
          <div style={{ fontSize: '14px', color: c.muted, marginTop: '16px' }}>Validating your check-in link…</div>
        </div>
      </Card>
    )
  }

  if (tokenError) return <ErrorCard reason={tokenError} others={tokenErrorOthers} />
  if (!tokenData) return null

  const booking = tokenData.booking
  const remainingSlots = tokenData.slots.filter(s => !s.checkin_completed_at)

  // ── Success / Invite Step ──
  if (done) {
    const canDelegate = tokenData.can_delegate !== false
    const openSlots = tokenData.slots.filter(s => !s.checkin_completed_at && s.slot_index !== currentSlot)

    // ─── Einladungsschritt ────────────────────────────────────────────────────
    // Nur bei Buchungs-Token (canDelegate) und wenn noch Slots offen sind.
    // Erscheint genau einmal, direkt nach dem eigenen Check-in.
    if (canDelegate && !inviteStepDone && openSlots.length > 0) {
      async function handleSendInvites() {
        const toSend = openSlots
          .map(s => ({ slot_index: s.slot_index, email: (inviteEmails[s.slot_index] ?? '').trim() }))
          .filter(x => x.email.length > 0)

        if (toSend.length === 0) {
          setInviteStepDone(true)
          return
        }

        setInviteSubmitting(true)
        try {
          const res = await fetch('/api/checkin/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, invites: toSend }),
          })
          const data = await res.json()
          const results: NonNullable<typeof inviteResults> = data.results ?? []
          setInviteResults(results)

          // Erfolgreich eingeladene Slots lokal als invite_sent_at markieren,
          // damit GuestProgress und startNextGuest den richtigen Zustand zeigen.
          const sentAt = new Date().toISOString()
          setTokenData(prev => prev ? {
            ...prev,
            slots: prev.slots.map(s => {
              const r = results.find(r => r.slot_index === s.slot_index && r.ok)
              if (r) return { ...s, invite_email: r.email, invite_sent_at: sentAt }
              return s
            }),
          } : prev)
        } catch (e) {
          setInviteResults([{ slot_index: -1, email: '', ok: false, error: e instanceof Error ? e.message : 'Network error' }])
        } finally {
          setInviteSubmitting(false)
        }
      }

      const anyEmailFilled = openSlots.some(s => (inviteEmails[s.slot_index] ?? '').trim().length > 0)
      const sentSlots = inviteResults ? openSlots.filter(s => inviteResults.some(r => r.slot_index === s.slot_index && r.ok)) : []
      const failedResults = inviteResults ? inviteResults.filter(r => !r.ok && r.slot_index >= 0) : []
      const showContinue = inviteResults !== null

      return (
        <div>
          <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
          <Card>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: c.success }}>Your check-in is complete!</div>
            </div>

            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: c.accent, marginBottom: '10px' }}>
              {openSlots.length === 1 ? '1 guest' : `${openSlots.length} guests`} still to check in
            </div>
            <div style={{ fontSize: '14px', color: c.muted, lineHeight: 1.6, marginBottom: '20px' }}>
              Enter an email address to send each guest their own personal check-in link. Leave a field blank to check in on their behalf.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {openSlots.map(slot => {
                const result = inviteResults?.find(r => r.slot_index === slot.slot_index)
                const sent = result?.ok === true
                const failed = result && !result.ok && slot.slot_index >= 0
                return (
                  <div key={slot.slot_index}>
                    <label style={labelStyle}>
                      Guest {slot.slot_index + 1}{(slot.guest_name ?? slot.customer?.name) ? ` — ${slot.guest_name ?? slot.customer?.name}` : ''}
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="email"
                        value={inviteEmails[slot.slot_index] ?? ''}
                        onChange={e => setInviteEmails(prev => ({ ...prev, [slot.slot_index]: e.target.value }))}
                        placeholder="guest@email.com (optional)"
                        disabled={inviteSubmitting || sent}
                        style={{
                          ...inputStyle,
                          opacity: sent ? 0.6 : 1,
                          borderColor: sent ? 'rgba(45,212,160,.4)' : failed ? 'rgba(255,90,90,.4)' : undefined,
                        }}
                        inputMode="email"
                        autoComplete="email"
                      />
                      {sent && (
                        <span style={{ flexShrink: 0, fontSize: '13px', color: c.success, fontWeight: 700 }}>✓</span>
                      )}
                    </div>
                    {failed && result && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: c.error, lineHeight: 1.4 }}>
                        {result.http_status ? `HTTP ${result.http_status} — ` : ''}{result.error}
                        {result.ref && (
                          <span style={{ marginLeft: '6px', fontFamily: 'monospace', color: c.muted }}>Ref: {result.ref}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Globaler Fehler (Netzwerk o.ä.) */}
            {inviteResults?.some(r => r.slot_index < 0) && (
              <div style={{ background: 'rgba(255,90,90,.08)', border: '1px solid rgba(255,90,90,.2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: c.error }}>
                {inviteResults.find(r => r.slot_index < 0)?.error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {!showContinue && (
                <>
                  <button
                    onClick={handleSendInvites}
                    disabled={inviteSubmitting || !anyEmailFilled}
                    style={{
                      ...primaryBtn,
                      opacity: (inviteSubmitting || !anyEmailFilled) ? 0.45 : 1,
                      cursor: (inviteSubmitting || !anyEmailFilled) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {inviteSubmitting ? 'Sending…' : 'Send invitations →'}
                  </button>
                  <button
                    onClick={() => setInviteStepDone(true)}
                    disabled={inviteSubmitting}
                    style={{ ...ghostBtn, width: '100%' }}
                  >
                    {anyEmailFilled ? 'Skip — I\'ll check in for everyone' : 'I\'ll check in for everyone →'}
                  </button>
                </>
              )}

              {showContinue && (
                <>
                  {/* Erneut senden — für fehlgeschlagene oder falsche Adressen */}
                  {failedResults.length > 0 && anyEmailFilled && (
                    <button
                      onClick={handleSendInvites}
                      disabled={inviteSubmitting}
                      style={{ ...ghostBtn, width: '100%' }}
                    >
                      {inviteSubmitting ? 'Sending…' : 'Retry failed invitations'}
                    </button>
                  )}
                  <button
                    onClick={() => setInviteStepDone(true)}
                    style={primaryBtn}
                  >
                    {sentSlots.length > 0 ? 'Continue →' : 'Continue →'}
                  </button>
                </>
              )}
            </div>
          </Card>
        </div>
      )
    }

    // ─── Normaler Erfolgsbildschirm ───────────────────────────────────────────
    // Zeigt eingeladene Slots mit "Resend"-Option, dann "Check in next guest"
    // nur für Slots, die noch beim Bucher liegen (kein invite_sent_at).
    const invitedSlots = tokenData.slots.filter(s => !s.checkin_completed_at && s.invite_sent_at)
    const bookerSlots  = tokenData.slots.filter(s => !s.checkin_completed_at && !s.invite_sent_at && s.slot_index !== currentSlot)

    async function handleResend(slotIndex: number, email: string) {
      try {
        const res = await fetch('/api/checkin/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, invites: [{ slot_index: slotIndex, email }] }),
        })
        const data = await res.json()
        const results: NonNullable<typeof inviteResults> = data.results ?? []
        const sentAt = new Date().toISOString()
        setTokenData(prev => prev ? {
          ...prev,
          slots: prev.slots.map(s => {
            const r = results.find(r => r.slot_index === s.slot_index && r.ok)
            if (r) return { ...s, invite_email: r.email, invite_sent_at: sentAt }
            return s
          }),
        } : prev)
        // Fehler direkt in inviteResults sichtbar machen
        setInviteResults(prev => {
          const without = (prev ?? []).filter(r => r.slot_index !== slotIndex)
          return [...without, ...results]
        })
      } catch (e) {
        setInviteResults(prev => {
          const without = (prev ?? []).filter(r => r.slot_index !== slotIndex)
          return [...without, { slot_index: slotIndex, email, ok: false, error: e instanceof Error ? e.message : 'Network error' }]
        })
      }
    }

    return (
      <div>
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: c.success, marginBottom: '8px' }}>Check-in complete!</div>
          <div style={{ fontSize: '15px', color: c.muted, marginBottom: '24px' }}>See you on the water. 🌊</div>

          {(tokenData.group_others ?? []).length > 0 && <GroupOthersCard others={tokenData.group_others ?? []} />}

          {medicalFlagged && (
            <div style={{ background: 'rgba(255,160,64,.08)', border: '1px solid rgba(255,160,64,.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', textAlign: 'left' }}>
              <div style={{ fontSize: '13px', color: c.warning, fontWeight: 700, marginBottom: '4px' }}>Medical follow-up</div>
              <div style={{ fontSize: '13px', color: c.muted, lineHeight: 1.5 }}>Our team will contact you before your activity to discuss your health declaration.</div>
            </div>
          )}

          <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: '12px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
            <InfoRow label="Activity" value={booking.product_name} />
            <InfoRow label="Date" value={formatDate(booking.booking_date)} />
            <InfoRow label="Session" value={booking.session.toUpperCase()} />
          </div>

          {/* Eingeladene Slots — mit Resend-Option */}
          {invitedSlots.length > 0 && (
            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: c.muted, marginBottom: '10px' }}>
                Invitation{invitedSlots.length > 1 ? 's' : ''} sent
              </div>
              {invitedSlots.map(slot => {
                const resendResult = inviteResults?.find(r => r.slot_index === slot.slot_index)
                const currentResendEmail = resendEmails[slot.slot_index] ?? slot.invite_email ?? ''
                return (
                  <div key={slot.slot_index} style={{ marginBottom: '10px', padding: '10px 14px', background: 'rgba(243,239,230,.04)', border: `1px solid ${c.accentBorder}`, borderRadius: '10px' }}>
                    <div style={{ fontSize: '13px', color: c.text, fontWeight: 600, marginBottom: '6px' }}>
                      Guest {slot.slot_index + 1}
                      {(slot.guest_name ?? slot.customer?.name) ? ` — ${slot.guest_name ?? slot.customer?.name}` : ''}
                    </div>
                    {canDelegate && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="email"
                          value={currentResendEmail}
                          onChange={e => setResendEmails(prev => ({ ...prev, [slot.slot_index]: e.target.value }))}
                          style={{ ...inputStyle, fontSize: '13px', padding: '9px 12px' }}
                          inputMode="email"
                          autoComplete="email"
                        />
                        <button
                          onClick={() => handleResend(slot.slot_index, currentResendEmail)}
                          style={{ ...ghostBtn, fontSize: '12px', padding: '9px 14px', flexShrink: 0 }}
                        >
                          Resend
                        </button>
                      </div>
                    )}
                    {!canDelegate && (
                      <div style={{ fontSize: '12px', color: c.muted }}>✉ {slot.invite_email}</div>
                    )}
                    {resendResult && !resendResult.ok && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: c.error, lineHeight: 1.4 }}>
                        {resendResult.http_status ? `HTTP ${resendResult.http_status} — ` : ''}{resendResult.error}
                        {resendResult.ref && <span style={{ marginLeft: '6px', fontFamily: 'monospace', color: c.muted }}>Ref: {resendResult.ref}</span>}
                      </div>
                    )}
                    {resendResult?.ok && (
                      <div style={{ marginTop: '4px', fontSize: '12px', color: c.success }}>Resent ✓</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {bookerSlots.length > 0 && (
            <button onClick={startNextGuest} style={primaryBtn}>
              Check in next guest →
            </button>
          )}
        </Card>
      </div>
    )
  }

  // ── Step 0 — Welcome ──
  if (step === 0) {
    const completedCount = tokenData.slots.filter(s => s.checkin_completed_at).length
    return (
      <div>
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: c.accent, marginBottom: '10px' }}>Your booking</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: c.text, marginBottom: '6px' }}>{booking.product_name}</div>
            <div style={{ fontSize: '15px', color: c.muted }}>{formatDate(booking.booking_date)} · {booking.session.toUpperCase()}</div>
          </div>

          <div style={{ background: c.accentDim, border: `1px solid ${c.accentBorder}`, borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', color: c.text, lineHeight: 1.6 }}>
              {completedCount > 0
                ? `${completedCount} of ${booking.group_size} guest${booking.group_size > 1 ? 's' : ''} have checked in.`
                : `${booking.group_size} guest${booking.group_size > 1 ? 's' : ''} need${booking.group_size === 1 ? 's' : ''} to complete check-in.`
              }
              {' '}This takes about 3 minutes.
            </div>
          </div>

          <div style={{ fontSize: '13px', color: c.muted, lineHeight: 1.7, marginBottom: '28px' }}>
            You'll fill in your personal details, a short medical declaration, and sign a waiver — then you're all set.
          </div>

          <button onClick={nextStep} style={primaryBtn}>Start Check-in →</button>
        </Card>
      </div>
    )
  }

  // ── Step 1 — Personal Data ──
  if (step === 1) {
    const danRequired = dayInsuranceIncluded()
    const isMinorGuest = (() => {
      if (!form.dob) return false
      const d = new Date(form.dob)
      if (isNaN(d.getTime())) return false
      const now = new Date()
      let age = now.getFullYear() - d.getFullYear()
      const m = now.getMonth() - d.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
      return age < 18
    })()
    const canContinue = form.first_name && form.last_name && form.email &&
      form.phone_prefix && form.phone_number && form.dob && form.nationality &&
      (!danRequired || (form.gender && form.country_of_residence)) &&
      (!isMinorGuest || (form.guardian_name.trim() && form.guardian_relationship.trim() && form.guardian_consent))
    return (
      <div>
        <ProgressBar step={1} />
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card>
          <SectionTitle>Personal Details</SectionTitle>
          {welcomeBack && (
            <div style={{ background: 'rgba(45,212,160,.08)', border: '1px solid rgba(45,212,160,.2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: c.success }}>
              👋 Welcome back! We&apos;ve pre-filled your details.
            </div>
          )}
          {lookupError && (
            <div style={{ background: 'rgba(255,90,90,.08)', border: '1px solid rgba(255,90,90,.2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: c.error }}>
              Could not load your saved details — please fill in the form manually. ({lookupError})
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <Field label="Email *">
              <input
                type="email"
                value={form.email}
                onChange={e => handleEmailChange(e.target.value)}
                placeholder="your@email.com"
                style={inputStyle}
                autoComplete="email"
                inputMode="email"
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="First Name *">
                <input type="text" value={form.first_name} onChange={e => { touchedRef.current.add('first_name'); setForm(f => ({ ...f, first_name: e.target.value })) }} placeholder="As on ID" style={inputStyle} autoComplete="given-name" />
              </Field>
              <Field label="Last Name *">
                <input type="text" value={form.last_name} onChange={e => { touchedRef.current.add('last_name'); setForm(f => ({ ...f, last_name: e.target.value })) }} placeholder="As on ID" style={inputStyle} autoComplete="family-name" />
              </Field>
            </div>
            <Field label={danRequired ? 'Gender *' : 'Gender'}>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['M', 'F'] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => { touchedRef.current.add('gender'); setForm(f => ({ ...f, gender: g })) }}
                    style={{
                      flex: 1, padding: '13px', borderRadius: '10px',
                      border: `1px solid ${form.gender === g ? 'rgba(243,239,230,.5)' : 'rgba(243,239,230,.2)'}`,
                      background: form.gender === g ? 'rgba(243,239,230,.15)' : 'rgba(255,255,255,.04)',
                      color: form.gender === g ? '#f3efe6' : '#c9c2b6',
                      fontWeight: form.gender === g ? 700 : 500,
                      fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{g === 'M' ? 'Male' : 'Female'}</button>
                ))}
              </div>
            </Field>
            <Field label="Phone / WhatsApp *">
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Freie Eingabe (jede Vorwahl erlaubt) + separater Picker für häufige Codes.
                    Kein <datalist>: iOS Safari zwingt damit zur Auswahl aus der Liste. */}
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone_prefix}
                  placeholder="+351"
                  autoComplete="tel-country-code"
                  onChange={e => {
                    touchedRef.current.add('phone_prefix')
                    // nur Ziffern, führendes + erzwingen, max. 4 Ziffern (längste Vorwahl ist 3-stellig + Sonderfälle)
                    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                    setForm(f => ({ ...f, phone_prefix: digits ? `+${digits}` : '' }))
                  }}
                  style={{ ...inputStyle, width: '92px', flexShrink: 0 }}
                />
                <select
                  aria-label="Pick country code"
                  value=""
                  onChange={e => {
                    if (!e.target.value) return
                    touchedRef.current.add('phone_prefix')
                    setForm(f => ({ ...f, phone_prefix: e.target.value }))
                  }}
                  style={{ ...inputStyle, width: '44px', flexShrink: 0, padding: '0 6px', textAlign: 'center', cursor: 'pointer' }}
                >
                    <option value="">▾</option>
                    <option value="+351">🇵🇹 +351</option>
                    <option value="+49">🇩🇪 +49</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+33">🇫🇷 +33</option>
                    <option value="+34">🇪🇸 +34</option>
                    <option value="+39">🇮🇹 +39</option>
                    <option value="+31">🇳🇱 +31</option>
                    <option value="+32">🇧🇪 +32</option>
                    <option value="+41">🇨🇭 +41</option>
                    <option value="+43">🇦🇹 +43</option>
                    <option value="+45">🇩🇰 +45</option>
                    <option value="+46">🇸🇪 +46</option>
                    <option value="+47">🇳🇴 +47</option>
                    <option value="+358">🇫🇮 +358</option>
                    <option value="+353">🇮🇪 +353</option>
                    <option value="+48">🇵🇱 +48</option>
                    <option value="+420">🇨🇿 +420</option>
                    <option value="+36">🇭🇺 +36</option>
                    <option value="+55">🇧🇷 +55</option>
                    <option value="+61">🇦🇺 +61</option>
                    <option value="+64">🇳🇿 +64</option>
                    <option value="+27">🇿🇦 +27</option>
                    <option value="+52">🇲🇽 +52</option>
                    <option value="+54">🇦🇷 +54</option>
                </select>
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={e => { touchedRef.current.add('phone_number'); setForm(f => ({ ...f, phone_number: e.target.value })) }}
                  placeholder="912 345 678"
                  style={{ ...inputStyle, flex: 1 }}
                  autoComplete="tel-national"
                  inputMode="tel"
                />
              </div>
            </Field>
            <Field label="Date of Birth *">
              <input type="date" value={form.dob} min="1900-01-01" max={new Date().toISOString().slice(0, 10)}
                onChange={e => { touchedRef.current.add('dob'); setDobBad(e.target.validity.badInput); setForm(f => ({ ...f, dob: e.target.value })) }}
                onBlur={e => setDobBad(e.target.validity.badInput || e.target.validity.rangeUnderflow || e.target.validity.rangeOverflow)}
                style={{ ...inputStyle, colorScheme: 'dark', ...(dobBad ? { borderColor: '#ff6040' } : {}) }} />
              {dobBad && <div style={{ marginTop: '6px', fontSize: '12.5px', color: '#ff6040' }}>This date does not exist or is out of range (e.g. 29 February only exists in leap years). Please check it.</div>}
            </Field>
            <Field label="Nationality *">
              <select
                value={form.nationality}
                onChange={e => { touchedRef.current.add('nationality'); setForm(f => ({ ...f, nationality: e.target.value })) }}
                style={inputStyle}
              >
                <option value="">Select country…</option>
                {form.country_of_residence && !countriesForSelect().some(c => c.slug === form.country_of_residence) && (
                  <option value={form.country_of_residence}>{form.country_of_residence}</option>
                )}
                {countriesForSelect().map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={danRequired ? 'Country of Residence *' : 'Country of Residence'}>
              <select
                value={form.country_of_residence}
                onChange={e => { touchedRef.current.add('country_of_residence'); setForm(f => ({ ...f, country_of_residence: e.target.value })) }}
                style={inputStyle}
              >
                <option value="">Select country…</option>
                <option value="portugal">Portugal</option>
                <option value="germany">Germany</option>
                <option value="united-kingdom">United Kingdom</option>
                <option value="united-states">United States</option>
                <option value="france">France</option>
                <option value="spain">Spain</option>
                <option value="italy">Italy</option>
                <option value="netherlands">Netherlands</option>
                <option value="belgium">Belgium</option>
                <option value="switzerland">Switzerland</option>
                <option value="austria">Austria</option>
                <option value="denmark">Denmark</option>
                <option value="sweden">Sweden</option>
                <option value="norway">Norway</option>
                <option value="finland">Finland</option>
                <option value="ireland">Ireland</option>
                <option value="poland">Poland</option>
                <option value="czech-republic">Czech Republic</option>
                <option value="hungary">Hungary</option>
                <option value="slovakia">Slovakia</option>
                <option value="slovenia">Slovenia</option>
                <option value="croatia">Croatia</option>
                <option value="greece">Greece</option>
                <option value="romania">Romania</option>
                <option value="bulgaria">Bulgaria</option>
                <option value="luxembourg">Luxembourg</option>
                <option value="iceland">Iceland</option>
                <option value="canada">Canada</option>
                <option value="australia">Australia</option>
                <option value="new-zealand">New Zealand</option>
                <option value="brazil">Brazil</option>
                <option value="argentina">Argentina</option>
                <option value="mexico">Mexico</option>
                <option value="south-africa">South Africa</option>
                <option value="israel">Israel</option>
                <option value="japan">Japan</option>
                <option value="china">China</option>
                <option value="india">India</option>
                <option value="russia">Russia</option>
                <option value="turkey">Turkey</option>
                <option value="egypt">Egypt</option>
                <option value="morocco">Morocco</option>
                <option value="angola">Angola</option>
                <option value="mozambique">Mozambique</option>
                <option value="cape-verde">Cape Verde</option>
                <option value="brazil">Brazil</option>
              </select>
            </Field>
          </div>

          {isMinorGuest && (
            <div style={{ marginTop: '24px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.3)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#fbbf24', marginBottom: '16px' }}>
                👨‍👩‍👦 Parental / Guardian Consent
              </div>
              <p style={{ fontSize: '13.5px', color: c.muted, lineHeight: 1.6, marginBottom: '16px' }}>
                This guest is under 18. A parent or legal guardian must provide consent and is responsible for the minor during all diving activities.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Field label="Guardian Full Name *">
                  <input
                    value={form.guardian_name}
                    onChange={e => setForm(f => ({ ...f, guardian_name: e.target.value }))}
                    placeholder="Full name of parent or legal guardian"
                    style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '8px', color: c.text, fontSize: '14px', padding: '10px 14px', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
                  />
                </Field>
                <Field label="Relationship to Minor *">
                  <select
                    value={form.guardian_relationship}
                    onChange={e => setForm(f => ({ ...f, guardian_relationship: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '8px', color: c.text, fontSize: '14px', padding: '10px 14px', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', appearance: 'none' }}
                  >
                    <option value="">Select relationship…</option>
                    <option value="parent">Parent</option>
                    <option value="legal_guardian">Legal Guardian</option>
                    <option value="grandparent">Grandparent</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.guardian_consent}
                    onChange={e => setForm(f => ({ ...f, guardian_consent: e.target.checked }))}
                    style={{ marginTop: '2px', accentColor: '#fbbf24', width: '16px', height: '16px', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '13px', color: c.text, lineHeight: 1.6 }}>
                    {GUARDIAN_CONSENT_TEXT}
                  </span>
                </label>
              </div>
            </div>
          )}

          <NavButtons
            onBack={() => setStep(0)}
            onNext={nextStep}
            nextDisabled={!canContinue}
            nextLabel="Continue →"
          />
        </Card>
      </div>
    )
  }

  // ── Step 2 — Medical ──
  if (step === 2) {
    return (
      <div>
        <ProgressBar step={2} />
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card>
          <SectionTitle>Medical Self-Declaration</SectionTitle>

          <div style={{ fontSize: '12.5px', color: c.muted, fontStyle: 'italic', lineHeight: 1.55, marginBottom: '16px', padding: '10px 14px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: '8px' }}>
            Note to women: If you are pregnant, or attempting to become pregnant, do not dive.
          </div>

          <div style={{ fontSize: '13.5px', color: c.muted, lineHeight: 1.65, marginBottom: '24px' }}>
            Please answer honestly. Answering &quot;Yes&quot; does not automatically exclude you —
            our team will follow up if a physician&apos;s assessment is needed.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {MAIN_QUESTIONS.map((q, idx) => {
              const isYes = medicalAnswers[q.key] === true
              const isNo  = medicalAnswers[q.key] === false
              const box   = q.boxKey ? BOX_QUESTIONS[q.boxKey] : null

              return (
                <div key={q.key}>
                  {/* Main question row */}
                  <div style={{
                    background: 'rgba(255,255,255,.02)',
                    border: `1px solid ${isYes ? 'rgba(255,160,64,.25)' : 'rgba(255,255,255,.07)'}`,
                    borderRadius: isYes && box ? '10px 10px 0 0' : '10px',
                    padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', color: c.sub, fontWeight: 800, flexShrink: 0, minWidth: '18px', paddingTop: '3px' }}>
                        {idx + 1}.
                      </span>
                      <span style={{ fontSize: '14px', color: c.text, lineHeight: 1.5 }}>{q.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {(['No', 'Yes'] as const).map(answer => {
                        const isYesBtn = answer === 'Yes'
                        const selected = isYesBtn ? isYes : isNo
                        return (
                          <button
                            key={answer}
                            onClick={() => handleMainQuestion(q.key, isYesBtn, q.boxKey)}
                            style={{
                              flex: 1, padding: '8px', borderRadius: '8px',
                              border: `1px solid ${selected ? (isYesBtn ? 'rgba(255,160,64,.5)' : c.accentBorder) : 'rgba(255,255,255,.1)'}`,
                              background: selected ? (isYesBtn ? 'rgba(255,160,64,.12)' : c.accentDim) : 'transparent',
                              color: selected ? (isYesBtn ? c.warning : c.accent) : c.muted,
                              fontWeight: selected ? 700 : 500, fontSize: '14px',
                              cursor: 'pointer', fontFamily: c.font,
                            }}
                          >{answer}</button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Box questions — appear directly below when main question is Yes */}
                  {isYes && box && (
                    <div style={{
                      background: 'rgba(255,160,64,.03)',
                      border: '1px solid rgba(255,160,64,.2)',
                      borderTop: 'none',
                      borderRadius: '0 0 10px 10px',
                      padding: '14px 16px',
                    }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: c.warning, marginBottom: '12px' }}>
                        Box {q.boxKey} — {box.intro}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {box.items.map(item => {
                          const boxIsYes = medicalAnswers[item.key] === true
                          const boxIsNo  = medicalAnswers[item.key] === false
                          return (
                            <div key={item.key} style={{
                              background: boxIsYes ? 'rgba(255,90,90,.05)' : 'rgba(255,255,255,.02)',
                              border: `1px solid ${boxIsYes ? 'rgba(255,90,90,.3)' : 'rgba(255,255,255,.08)'}`,
                              borderRadius: '8px', padding: '10px 12px',
                            }}>
                              <div style={{ fontSize: '13.5px', color: c.text, lineHeight: 1.5, marginBottom: '8px' }}>
                                {item.label}
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {(['No', 'Yes'] as const).map(answer => {
                                  const isYesBtn = answer === 'Yes'
                                  const selected = isYesBtn ? boxIsYes : boxIsNo
                                  return (
                                    <button
                                      key={answer}
                                      onClick={() => handleBoxQuestion(item.key, isYesBtn)}
                                      style={{
                                        flex: 1, padding: '6px', borderRadius: '6px',
                                        border: `1px solid ${selected ? (isYesBtn ? 'rgba(255,90,90,.5)' : c.accentBorder) : 'rgba(255,255,255,.1)'}`,
                                        background: selected ? (isYesBtn ? 'rgba(255,90,90,.12)' : c.accentDim) : 'transparent',
                                        color: selected ? (isYesBtn ? c.error : c.accent) : c.muted,
                                        fontWeight: selected ? 700 : 500, fontSize: '13px',
                                        cursor: 'pointer', fontFamily: c.font,
                                      }}
                                    >{answer}</button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {medicalFlagged && (
            <div style={{ background: 'rgba(255,160,64,.08)', border: '1px solid rgba(255,160,64,.2)', borderRadius: '10px', padding: '12px 16px', marginTop: '20px', fontSize: '13px', color: c.warning, lineHeight: 1.5 }}>
              ⚠️ Based on your answers, written medical clearance from a physician is required before this dive.
              Bring it with you — we will email you the details.
              {medicalAckAt
                ? ' You confirmed this.'
                : <> <button onClick={() => setMedicalAckOpen(true)} style={{ background: 'none', border: 'none', padding: 0, color: c.accent, textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', fontFamily: c.font }}>Read and confirm</button></>}
            </div>
          )}

          <div style={{ fontSize: '11px', color: c.sub, textAlign: 'center', marginTop: '24px', lineHeight: 1.6 }}>
            Diver Medical | Participant Questionnaire — Version 2022-02-01<br />
            © 2020 DAN / WRSTC / RSTC / RSTC Europe / UHMS / CMAS
          </div>

          <NavButtons
            onBack={prevStep}
            onNext={() => { if (medicalFlagged && !medicalAckAt) { setMedicalAckOpen(true); return } nextStep() }}
            nextLabel="Continue →"
          />
        </Card>

        {medicalAckOpen && (
          <MedicalAckDialog
            onConfirm={() => { setMedicalAckAt(new Date().toISOString()); setMedicalAckOpen(false) }}
            onCancel={() => setMedicalAckOpen(false)}
            medicalAnswers={medicalAnswers}
          />
        )}
      </div>
    )
  }

  // ── Step 3 — Acknowledgment of Risk & Signature ──
  if (step === 3) {
    return (
      <div>
        <ProgressBar step={3} />
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card>
          <SectionTitle>Acknowledgment of Inherent Risk &amp; Non-Agency Disclosure</SectionTitle>

          {/* Scrollable document */}
          <div style={{
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: '10px',
            padding: '16px',
            maxHeight: '240px',
            overflowY: 'auto',
            fontSize: '13px',
            color: c.muted,
            lineHeight: 1.75,
            marginBottom: '20px',
          }}>
            {WAIVER_SECTIONS.map(sec => (
              <div key={sec.title} style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: c.accent, marginBottom: '6px' }}>{sec.title}</div>
                <div style={{ whiteSpace: 'pre-line' }}>{sec.body}</div>
              </div>
            ))}
          </div>

          {/* GDPR medical consent checkbox — explicit, non-pre-ticked (Art. 9 GDPR) */}
          <label style={{
            display: 'flex', gap: '12px', alignItems: 'flex-start',
            padding: '14px', borderRadius: '10px', cursor: 'pointer',
            background: gdprConsent ? 'rgba(243,239,230,.06)' : 'rgba(255,255,255,.02)',
            border: `1px solid ${gdprConsent ? 'rgba(243,239,230,.3)' : 'rgba(255,255,255,.08)'}`,
            marginBottom: '20px',
          }}>
            <input
              type="checkbox"
              checked={gdprConsent}
              onChange={e => setGdprConsent(e.target.checked)}
              style={{ marginTop: '2px', accentColor: c.accent, width: '16px', height: '16px', flexShrink: 0 }}
            />
            <span style={{ fontSize: '13px', color: c.text, lineHeight: 1.6 }}>
              {GDPR_CONSENT_TEXT}
            </span>
          </label>

          {/* ── SSI Responsible Diver Code ── */}
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: c.accent, marginBottom: '10px', marginTop: '4px' }}>
            SSI Responsible Diver Code
          </div>
          <div style={{
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: '10px',
            padding: '16px',
            maxHeight: '220px',
            overflowY: 'auto',
            fontSize: '13px',
            color: c.muted,
            lineHeight: 1.75,
            marginBottom: '14px',
          }}>
            <p style={{ marginTop: 0, marginBottom: '12px' }}>
              {DIVER_CODE_INTRO}
            </p>
            <p style={{ marginTop: 0, marginBottom: '10px', fontWeight: 600, color: c.text }}>{DIVER_CODE_PLEDGE}</p>
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              {DIVER_CODE_ITEMS.map((it, i) => (
                <li key={it.title} style={{ marginBottom: i === DIVER_CODE_ITEMS.length - 1 ? '0' : '8px' }}><strong>{it.title}</strong> — {it.body}</li>
              ))}
            </ol>
            <p style={{ marginTop: '12px', marginBottom: 0, fontStyle: 'italic' }}>
              {DIVER_CODE_CLOSING}
            </p>
          </div>
          <label style={{
            display: 'flex', gap: '12px', alignItems: 'flex-start',
            padding: '14px', borderRadius: '10px', cursor: 'pointer',
            background: diverCodeConsent ? 'rgba(243,239,230,.06)' : 'rgba(255,255,255,.02)',
            border: `1px solid ${diverCodeConsent ? 'rgba(243,239,230,.3)' : 'rgba(255,255,255,.08)'}`,
            marginBottom: '20px',
          }}>
            <input
              type="checkbox"
              checked={diverCodeConsent}
              onChange={e => setDiverCodeConsent(e.target.checked)}
              style={{ marginTop: '2px', accentColor: c.accent, width: '16px', height: '16px', flexShrink: 0 }}
            />
            <span style={{ fontSize: '13px', color: c.text, lineHeight: 1.6 }}>
              {DIVER_CODE_CONSENT_TEXT}
            </span>
          </label>

          <div style={{ fontSize: '13px', fontWeight: 700, color: c.text, marginBottom: '10px' }}>
            Signature <span style={{ color: c.muted, fontWeight: 400 }}>(required)</span>
          </div>
          <SignaturePad onSignature={setSignatureDataUrl} />

          <NavButtons
            onBack={prevStep}
            onNext={nextStep}
            nextDisabled={!signatureDataUrl || !gdprConsent || !diverCodeConsent}
            nextLabel="I Agree & Continue →"
          />
        </Card>
      </div>
    )
  }

  // ── Step 4 — Experience ──
  if (step === 4) {
    // Versicherung ist eine Pflichtentscheidung: Police jetzt, Police bei Ankunft, oder bei uns kaufen. „none“ ohne Kauf blockiert.
    const insuranceDecided = dayInsuranceIncluded()
      || Boolean(form.insurance_provider && form.insurance_policy_number.trim())
      || form.insurance_mode === 'show'
      || form.buy_day_cover
    const isEntryCourse = Boolean(tokenData?.is_entry_course)
    // Einsteigerkurs: nur Einsteiger-Stufen zur Wahl (kein Zertifikat nötig, keine Tauchgänge/Agentur abfragen)
    const levels = isEntryCourse
      ? [
          { value: 'none', label: 'No experience' },
          { value: 'basic', label: 'Basic Diver' },
          { value: 'scuba', label: 'Scuba Diver' },
        ]
      : [
          { value: 'none', label: 'No experience' },
          { value: 'ow', label: 'Open Water Diver' },
          { value: 'advanced', label: 'Advanced Open Water' },
          { value: 'dm', label: 'Divemaster' },
          { value: 'instructor', label: 'Instructor' },
        ]
    return (
      <div>
        <ProgressBar step={4} />
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card>
          <SectionTitle>Diving Experience</SectionTitle>

          {isEntryCourse && (
            <div style={{ background: 'rgba(79,227,200,.08)', border: '1px solid rgba(79,227,200,.25)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13.5px', color: '#8ff0dd', lineHeight: 1.55 }}>
              No certificate required — this is your first course. Just tell us what you have done so far.
            </div>
          )}
          <Field label="Certification level">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {levels.map(lv => (
                <button
                  key={lv.value}
                  onClick={() => setForm(f => ({ ...f, experience_level: lv.value }))}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: `1px solid ${form.experience_level === lv.value ? c.accentBorder : 'rgba(255,255,255,.08)'}`,
                    background: form.experience_level === lv.value ? c.accentDim : 'transparent',
                    color: form.experience_level === lv.value ? c.accent : c.text,
                    fontWeight: form.experience_level === lv.value ? 700 : 400,
                    fontSize: '15px',
                    cursor: 'pointer',
                    fontFamily: c.font,
                  }}
                >{lv.label}</button>
              ))}
            </div>
          </Field>

          {!isEntryCourse && (<>

          <div style={{ marginTop: '18px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <Field label="Certifying agency (optional)">
                <select
                  value={form.cert_agency}
                  onChange={e => setForm(f => ({ ...f, cert_agency: e.target.value, cert_agency_other: e.target.value === 'other' ? f.cert_agency_other : '' }))}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">Select…</option>
                  {CERT_AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="other">Other…</option>
                </select>
              </Field>
            </div>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <Field label="Licence number (optional)">
                <input
                  type="text"
                  value={form.cert_number}
                  onChange={e => setForm(f => ({ ...f, cert_number: e.target.value }))}
                  placeholder="e.g. 1234567"
                  style={inputStyle}
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>

          {form.cert_agency === 'other' && (
            <div style={{ marginTop: '12px' }}>
              <Field label="Which agency?">
                <input
                  type="text"
                  value={form.cert_agency_other}
                  onChange={e => setForm(f => ({ ...f, cert_agency_other: e.target.value }))}
                  placeholder="Agency name"
                  style={inputStyle}
                  autoFocus
                />
              </Field>
            </div>
          )}

          </>)}

          {/* Versicherung. Der Nachweis laesst sich hier nicht pruefen — wer eine
              eigene Police angibt, erzeugt ein Flag, das der Empfang bei
              Ankunft aufloest. Wer die Tagesversicherung bei uns gekauft hat,
              hat nichts vorzulegen. */}
          <div style={{ marginTop: '22px', borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: c.sub, marginBottom: '12px' }}>Dive Insurance</div>

            {dayInsuranceIncluded() ? (
              <div style={{ background: 'rgba(79,227,200,.08)', border: '1px solid rgba(79,227,200,.25)', borderRadius: '10px', padding: '12px 14px', fontSize: '13.5px', color: '#8ff0dd', lineHeight: 1.55 }}>
                {tokenData?.insurance_ssi_included ? 'SSI dive insurance is included in your course — nothing to do here.' : 'DAN day insurance is included in your booking — nothing to do here.'}
              </div>
            ) : (
              <>
                <div style={{ fontSize: '13px', color: c.sub, lineHeight: 1.55, marginBottom: '4px' }}>
                  You chose your own dive insurance when booking. Enter the policy now, show it when you arrive, or buy DAN day cover from us instead.
                </div>
                {(
                  <>
                    <div style={{ marginTop: '14px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <Field label="Insurance provider *">
                          <select
                            value={form.insurance_provider}
                            onChange={e => setForm(f => ({ ...f, insurance_provider: e.target.value, insurance_provider_other: e.target.value === 'other' ? f.insurance_provider_other : '' }))}
                            style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                          >
                            <option value="">Select…</option>
                            {INSURANCE_PROVIDERS.map(x => <option key={x} value={x}>{x}</option>)}
                            <option value="other">Other…</option>
                          </select>
                        </Field>
                      </div>
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <Field label="Policy number *">
                          <input
                            type="text"
                            value={form.insurance_policy_number}
                            onChange={e => setForm(f => ({ ...f, insurance_policy_number: e.target.value }))}
                            placeholder="e.g. 4711-2026"
                            style={inputStyle}
                            autoComplete="off"
                          />
                        </Field>
                      </div>
                    </div>

                    {form.insurance_provider === 'other' && (
                      <div style={{ marginTop: '12px' }}>
                        <Field label="Which provider?">
                          <input
                            type="text"
                            value={form.insurance_provider_other}
                            onChange={e => setForm(f => ({ ...f, insurance_provider_other: e.target.value }))}
                            placeholder="Provider name"
                            style={inputStyle}
                            autoFocus
                          />
                        </Field>
                      </div>
                    )}

                    <div style={{ marginTop: '12px', fontSize: '12.5px', color: c.sub, lineHeight: 1.55 }}>
                      Please bring your policy — card, PDF or app. We check it when you arrive.
                    </div>
                    {!(form.insurance_provider && form.insurance_policy_number.trim()) && (
                      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '12.5px', color: c.sub }}>Policy not at hand? Pick one:</div>
                        <button type="button" onClick={() => setForm(f => ({ ...f, insurance_mode: 'show', buy_day_cover: false }))}
                          style={{ textAlign: 'left', padding: '11px 14px', borderRadius: '10px', border: `1px solid ${form.insurance_mode === 'show' && !form.buy_day_cover ? c.accentBorder : 'rgba(255,255,255,.08)'}`, background: form.insurance_mode === 'show' && !form.buy_day_cover ? c.accentDim : 'transparent', color: c.text, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          I'll show my policy at the dive centre
                          <div style={{ fontSize: '12px', color: c.sub, marginTop: '3px' }}>Our team enters the policy number for you before you board.</div>
                        </button>
                        <DayCoverOption form={form} setForm={setForm} offer={tokenData?.day_cover_offer ?? null} c={c} />
                      </div>
                    )}
                  </>
                )}

              </>
            )}
          </div>

          {!isEntryCourse && (<>
          <div style={{ marginTop: '18px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <Field label={form.experience_level === 'none' ? 'Logged dives (optional)' : 'Logged dives *'}>
                <input
                  type="number"
                  value={form.logged_dives}
                  onChange={e => setForm(f => ({ ...f, logged_dives: e.target.value }))}
                  placeholder="e.g. 42"
                  style={{ ...inputStyle, ...(form.experience_level !== 'none' && form.logged_dives === '' ? { borderColor: 'rgba(255,120,112,.55)' } : {}) }}
                  inputMode="numeric"
                  min="0"
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <Field label={slotLastDive || form.experience_level === 'none' ? 'Date of your last dive' : 'Date of your last dive *'}>
                {slotLastDive ? (
                  <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', opacity: .85 }}>
                    {new Date(slotLastDive + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: .6 }}>from your booking</span>
                  </div>
                ) : (
                  <input
                    type="date"
                    value={form.last_dive_date}
                    onChange={e => setForm(f => ({ ...f, last_dive_date: e.target.value }))}
                    style={inputStyle}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                )}
              </Field>
            </div>
          </div>

          {needsRefresher(form.last_dive_date) && (
            <div style={{ marginTop: '12px', background: 'rgba(255,165,0,.09)', border: '1px solid rgba(255,165,0,.28)', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#ffc470', lineHeight: 1.6 }}>
              It has been over a year since your last dive, so your first session with us is a
              Scuba Skills Update: a short pool-and-shallow-water session with an instructor to bring
              buoyancy, mask and regulator skills back to automatic. We ask this of every diver after
              12+ months — the North Atlantic is cold, often with swell and current, and we want you
              sharp before the first descent. Plan a little extra time on your first day.
            </div>
          )}

          {/* Zertifizierte Taucher: Anzahl Tauchgänge + letzter Tauchgang Pflicht (letzterer entfällt, wenn
              er schon bei der Buchung erfasst wurde). Einsteiger ohne Erfahrung: nicht nötig. */}
          {form.experience_level !== 'none' && !(form.logged_dives !== '' && (slotLastDive || form.last_dive_date)) && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#ff9580' }}>
              Please enter your number of logged dives{slotLastDive ? '' : ' and the date of your last dive'} to continue.
            </div>
          )}
          </>)}
          <NavButtons onBack={prevStep} onNext={nextStep} nextLabel="Continue →"
            nextDisabled={(!isEntryCourse && form.experience_level !== 'none' && !(form.logged_dives !== '' && (slotLastDive || form.last_dive_date))) || !insuranceDecided} />
          {!insuranceDecided && (
            <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#ffb3ab' }}>
              Enter your provider and policy number, choose to show it at the centre, or buy DAN day cover from us — diving without insurance is not possible.
            </div>
          )}
        </Card>
      </div>
    )
  }

  // ── Step 5 — Emergency Contact ──
  if (step === 5) {
    const canContinue = form.emergency_contact_name && form.emergency_contact_phone
    return (
      <div>
        <ProgressBar step={5} />
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card>
          <SectionTitle>Emergency Contact &amp; Equipment</SectionTitle>

          {/* Gast 2+ tippt in aller Regel denselben Kontakt ab, den Gast 1
              schon eingetragen hat — Partner, Eltern, dieselbe Reisegruppe.
              Ein Haken statt zweimal Tippen auf dem Handy. */}
          {primaryEmergency && primaryEmergency.name && (
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer',
              marginBottom: '18px', padding: '12px 14px', borderRadius: '10px',
              border: `1px solid ${sameAsPrimary ? c.accentBorder : 'rgba(255,255,255,.08)'}`,
              background: sameAsPrimary ? c.accentDim : 'transparent',
            }}>
              <input
                type="checkbox"
                checked={sameAsPrimary}
                onChange={e => {
                  const on = e.target.checked
                  setSameAsPrimary(on)
                  setForm(f => on
                    ? { ...f, emergency_contact_name: primaryEmergency.name, emergency_contact_phone: primaryEmergency.phone }
                    : { ...f, emergency_contact_name: '', emergency_contact_phone: '' })
                }}
                style={{ marginTop: '2px', width: '18px', height: '18px', accentColor: c.accent, flexShrink: 0 }}
              />
              <span style={{ fontSize: '14px', color: c.text, lineHeight: 1.5 }}>
                Same emergency contact as {primaryEmergency.guest || 'the first guest'}
                <span style={{ display: 'block', fontSize: '12.5px', color: c.muted, marginTop: '2px' }}>
                  {primaryEmergency.name} · {primaryEmergency.phone}
                </span>
              </span>
            </label>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <Field label="Emergency Contact Name *">
              <input type="text" value={form.emergency_contact_name} onChange={e => { setSameAsPrimary(false); setForm(f => ({ ...f, emergency_contact_name: e.target.value })) }} placeholder="Full name" style={inputStyle} />
            </Field>
            <Field label="Emergency Contact Phone *">
              <input type="tel" value={form.emergency_contact_phone} onChange={e => { setSameAsPrimary(false); setForm(f => ({ ...f, emergency_contact_phone: e.target.value })) }} placeholder="+351 …" style={inputStyle} inputMode="tel" />
            </Field>

            <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: c.sub, marginBottom: '14px' }}>Equipment Sizes (optional)</div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <Field label="Wetsuit size">
                    <select value={form.wetsuit_size} onChange={e => setForm(f => ({ ...f, wetsuit_size: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">— select —</option>
                      {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <Field label="BCD size">
                    <select value={form.bcd_size} onChange={e => setForm(f => ({ ...f, bcd_size: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">— select —</option>
                      {['XS', 'S', 'M', 'L', 'XL'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <Field label="Boot size">
                    <select value={form.boot_size} onChange={e => setForm(f => ({ ...f, boot_size: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">— select —</option>
                      {BOOT_SIZES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <NavButtons onBack={prevStep} onNext={nextStep} nextDisabled={!canContinue} nextLabel="Continue →" />
        </Card>
      </div>
    )
  }

  // ── Step 6 — Review ──
  if (step === 6) {
    return (
      <div>
        <ProgressBar step={6} />
        <GuestProgress slots={tokenData.slots} currentSlot={currentSlot} />
        <Card>
          <SectionTitle>Review &amp; Submit</SectionTitle>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
            <ReviewSection title="Personal">
              <InfoRow label="Name" value={`${form.first_name} ${form.last_name}`.trim()} />
              <InfoRow label="Email" value={form.email} />
              <InfoRow label="Phone" value={`${form.phone_prefix} ${form.phone_number}`.trim()} />
              <InfoRow label="Gender" value={form.gender === 'M' ? 'Male' : form.gender === 'F' ? 'Female' : ''} />
              <InfoRow label="Date of birth" value={form.dob} />
              <InfoRow label="Nationality" value={countryName(form.nationality)} />
              <InfoRow label="Country of residence" value={countryName(form.country_of_residence)} />
            </ReviewSection>

            <ReviewSection title="Medical">
              <InfoRow
                label="Medical flag"
                value={medicalFlagged
                  ? `Yes — ${medicalReasons.join('; ')}`
                  : 'No conditions declared'}
                highlight={medicalFlagged ? 'warning' : undefined}
              />
            </ReviewSection>

            <ReviewSection title="Waiver">
              <InfoRow label="Signature" value={signatureDataUrl ? 'Signed ✓' : '—'} highlight="success" />
            </ReviewSection>

            <ReviewSection title="Experience">
              <InfoRow label="Level" value={form.experience_level} />
              {certAgencyValue() && <InfoRow label="Agency" value={certAgencyValue()} />}
              {form.cert_number.trim() && <InfoRow label="Licence no." value={form.cert_number.trim()} />}
              <InfoRow
                label="Insurance"
                value={form.buy_day_cover && !dayInsuranceIncluded()
                  ? `DAN day cover from your dive centre${tokenData?.day_cover_offer ? ` — €${(tokenData.day_cover_offer.cents / 100).toFixed(2)}, pay at the centre` : ''}`
                  : tokenData?.insurance_ssi_included ? 'SSI insurance included in the course'
                  : effectiveInsuranceSource() === 'azd_day' ? 'DAN day insurance with us'
                  : effectiveInsuranceSource() === 'own'
                    ? (form.insurance_policy_number.trim() ? `${insuranceProviderValue()} · ${form.insurance_policy_number.trim()}` : 'Own insurance — policy shown at the centre')
                  : 'Own insurance — policy shown at the centre'}
                highlight={effectiveInsuranceSource() === 'none' ? 'warning' : undefined}
              />
              {form.logged_dives && <InfoRow label="Logged dives" value={form.logged_dives} />}
              {form.last_dive_date && (
                <InfoRow
                  label="Last dive"
                  value={form.last_dive_date + (needsRefresher(form.last_dive_date) ? ' — refresher required' : '')}
                  highlight={needsRefresher(form.last_dive_date) ? 'warning' : undefined}
                />
              )}
            </ReviewSection>

            <ReviewSection title="Emergency Contact">
              <InfoRow label="Name" value={form.emergency_contact_name} />
              <InfoRow label="Phone" value={form.emergency_contact_phone} />
            </ReviewSection>

            {(form.wetsuit_size || form.bcd_size || form.boot_size) && (
              <ReviewSection title="Equipment">
                {form.wetsuit_size && <InfoRow label="Wetsuit" value={form.wetsuit_size} />}
                {form.bcd_size && <InfoRow label="BCD" value={form.bcd_size} />}
                {form.boot_size && <InfoRow label="Boots" value={form.boot_size} />}
              </ReviewSection>
            )}
          </div>

          {!tokenData?.terms_accepted && (<>
          {/* Die Stornobedingungen stehen ausgeschrieben da, nicht als Link.
              Ein Haken auf etwas, das der Gast erst noch aufrufen muesste, ist
              keine Zustimmung, sondern eine Behauptung. */}
          <div style={{
            border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px',
            padding: '16px 18px', marginBottom: '18px', background: 'rgba(255,255,255,.02)',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: c.sub, marginBottom: '12px' }}>
              Cancellation Policy
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {CANCELLATION_SUMMARY.map(row => (
                <div key={row.window} style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '13.5px', lineHeight: 1.5 }}>
                  <span style={{ color: c.muted }}>{row.window}</span>
                  <span style={{ color: c.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.outcome}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '12.5px', color: c.sub, marginTop: '12px', lineHeight: 1.5 }}>
              {CANCELLATION_BY_US} {INSURANCE_NON_REFUNDABLE}{' '}
              <a href={TERMS_PATH} target="_blank" rel="noopener noreferrer" style={{ color: c.accent, textDecoration: 'underline' }}>
                Full terms
              </a>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginBottom: '14px' }}>
            <input
              type="checkbox"
              checked={policyAccepted}
              onChange={e => setPolicyAccepted(e.target.checked)}
              style={{ marginTop: '2px', width: '18px', height: '18px', accentColor: c.accent, flexShrink: 0 }}
            />
            <span style={{ fontSize: '14px', color: c.muted, lineHeight: 1.5 }}>
              I have read and accept the cancellation policy above.
            </span>
          </label>

          </>)}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginBottom: '24px' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ marginTop: '2px', width: '18px', height: '18px', accentColor: c.accent, flexShrink: 0 }}
            />
            <span style={{ fontSize: '14px', color: c.muted, lineHeight: 1.5 }}>
              I confirm that all information provided above is accurate and complete.
            </span>
          </label>

          {submitError && (
            <div style={{ background: 'rgba(255,90,90,.08)', border: '1px solid rgba(255,90,90,.2)', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', fontSize: '13px', color: c.error }}>
              <div>{submitError}</div>
              {submitRef && (
                <div style={{ fontSize: '11px', color: c.muted, marginTop: '6px', fontFamily: 'monospace' }}>
                  Reference: {submitRef}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!confirmed || (!tokenData?.terms_accepted && !policyAccepted) || submitting}
            style={{
              ...primaryBtn,
              opacity: (!confirmed || (!tokenData?.terms_accepted && !policyAccepted) || submitting) ? 0.5 : 1,
              cursor: (!confirmed || (!tokenData?.terms_accepted && !policyAccepted) || submitting) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting…' : 'Complete Check-in ✓'}
          </button>

          <button onClick={prevStep} style={{ ...ghostBtn, width: '100%', marginTop: '12px' }}>← Back</button>
        </Card>
      </div>
    )
  }

  return null
}

/**
 * Aufklaerung beim ersten Ja im Medical-Teil.
 *
 * Bewusst als Dialog und nicht als Hinweiskasten: der Gast steht in dem Moment
 * bei genau der Frage, die ihn betrifft. Ein Satz am Ende des Formulars wird
 * ueberblaettert — und dann steht er am Steg ohne Attest, und jemand muss ihm
 * absagen.
 */
const MEDICAL_TOPICS: Record<string, string> = {
  A:   'lungs, heart and blood',
  B:   'cardiovascular risk factors (over 45)',
  C:   'ears, sinuses or eyes — equalisation',
  D:   'neurological, loss of consciousness',
  E:   'mental health or ongoing medication',
  F:   'back, hernia or diabetes',
  G:   'stomach or intestines',
  Q3:  'physical fitness / exercise tolerance',
  Q5:  'surgery within the last 12 months',
  Q10: 'prescription medication',
}

function topicsFromAnswers(answers: Record<string, boolean>): string[] {
  const hits = new Set<string>()
  if (answers.q3)  hits.add('Q3')
  if (answers.q5)  hits.add('Q5')
  if (answers.q10) hits.add('Q10')
  for (const [k, v] of Object.entries(answers)) {
    if (!v) continue
    const letter = k[0]?.toUpperCase()
    if (letter && letter >= 'A' && letter <= 'G') hits.add(letter)
  }
  return [...hits].map(k => MEDICAL_TOPICS[k]).filter(Boolean) as string[]
}

function MedicalAckDialog({ onConfirm, onCancel, medicalAnswers }: { onConfirm: () => void; onCancel: () => void; medicalAnswers: Record<string, boolean> }) {
  const [checked, setChecked] = useState(false)
  const topics = topicsFromAnswers(medicalAnswers)
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 100, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '20px',
        background: 'rgba(3,10,22,.82)', backdropFilter: 'blur(3px)',
      }}
    >
      <div style={{
        maxWidth: '520px', width: '100%', maxHeight: '88vh', overflowY: 'auto',
        background: '#0A1F3D', border: '1px solid rgba(255,160,64,.35)',
        borderRadius: '16px', padding: '26px 26px 22px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: c.warning, marginBottom: '10px' }}>
          Medical clearance required
        </div>
        <h2 style={{ margin: '0 0 16px', fontSize: '21px', fontWeight: 900, color: c.text, lineHeight: 1.25 }}>
          You will need a doctor&apos;s sign-off before this dive.
        </h2>

        <div style={{ fontSize: '14.5px', color: '#cfe2f4', lineHeight: 1.7, marginBottom: topics.length ? '10px' : '18px' }}>
          Your health declaration flagged the following:
        </div>
        {topics.length > 0 && (
          <ul style={{ margin: '0 0 18px 20px', padding: 0 }}>
            {topics.map(t => (
              <li key={t} style={{ fontSize: '14px', color: '#cfe2f4', lineHeight: 1.7, marginBottom: '4px' }}>{t}</li>
            ))}
          </ul>
        )}
        <div style={{ fontSize: '14.5px', color: '#cfe2f4', lineHeight: 1.7, marginBottom: '18px' }}>
          That is not a problem and it does not exclude you from diving — most conditions are
          cleared without difficulty. But diving with compressed air puts a specific load on the
          body, so the decision belongs to a physician, not to us and not to you.
        </div>

        <div style={{ background: 'rgba(255,160,64,.08)', border: '1px solid rgba(255,160,64,.22)', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px' }}>
          <div style={{ fontSize: '13px', color: c.warning, fontWeight: 700, marginBottom: '8px' }}>What you need to bring</div>
          <div style={{ fontSize: '13.5px', color: '#cfe2f4', lineHeight: 1.7 }}>
            A written statement from a physician confirming you are fit to dive, dated within the
            last 12 months. A diving medical (SSI, PADI or the standard European form) is ideal;
            a signed letter from your own doctor referring to recreational scuba diving also works.
            Paper or on your phone, both fine.
          </div>
        </div>

        <div style={{ fontSize: '13.5px', color: c.sub, lineHeight: 1.7, marginBottom: '20px' }}>
          Without it we cannot take you in the water — that is a safety rule, not paperwork, and
          the crew cannot waive it at the pontoon. We will email you this in writing so you have
          it to hand. If you are unsure whether your condition is relevant, reply to that email
          and ask us first; it is much easier to sort out now than on the morning of the dive.
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginBottom: '20px' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            style={{ marginTop: '2px', width: '18px', height: '18px', accentColor: c.accent, flexShrink: 0 }}
          />
          <span style={{ fontSize: '14px', color: c.text, lineHeight: 1.55 }}>
            I understand and will bring written medical clearance on the day of the dive.
          </span>
        </label>

        <button
          onClick={onConfirm}
          disabled={!checked}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
            fontSize: '15px', fontWeight: 800, fontFamily: c.font,
            background: checked ? c.accent : 'rgba(255,255,255,.08)',
            color: checked ? '#090909' : c.muted,
            cursor: checked ? 'pointer' : 'not-allowed',
          }}
        >Understood</button>

        <button
          onClick={onCancel}
          style={{
            width: '100%', padding: '12px', marginTop: '10px', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,.12)', background: 'transparent',
            color: c.muted, fontSize: '14px', fontFamily: c.font, cursor: 'pointer',
          }}
        >Back to the questions</button>
      </div>
    </div>
  )
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

function SignaturePad({ onSignature }: { onSignature: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  function getPos(e: MouseEvent | Touch, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    // Return CSS-pixel coordinates. ctx.scale(dpr, dpr) handles the DPR mapping —
    // multiplying here too would apply it twice, placing strokes at 4× position on Retina.
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function startDraw(x: number, y: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawing.current = true
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(x: number, y: number) {
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  function endDraw() {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    setHasSig(true)
    onSignature(canvas.toDataURL('image/png'))
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#fff'
      // After ctx.scale the coordinate system is in CSS pixels, so use CSS dimensions here.
      ctx.fillRect(0, 0, rect.width, rect.height)
    }

    const onMouseDown = (e: MouseEvent) => { const p = getPos(e, canvas); startDraw(p.x, p.y) }
    const onMouseMove = (e: MouseEvent) => { const p = getPos(e, canvas); draw(p.x, p.y) }
    const onMouseUp = () => endDraw()

    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); const p = getPos(e.touches[0], canvas); startDraw(p.x, p.y) }
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); const p = getPos(e.touches[0], canvas); draw(p.x, p.y) }
    const onTouchEnd = () => endDraw()

    canvas.addEventListener('mousedown', onMouseDown)
    // move/up on window so a stroke that leaves the canvas boundary still completes cleanly
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    setHasSig(false)
    onSignature(null)
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ position: 'relative', background: '#fff', borderRadius: '10px', overflow: 'hidden', border: `2px solid ${hasSig ? c.accentBorder : 'rgba(255,255,255,.15)'}` }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '140px', touchAction: 'none' }}
        />
        {!hasSig && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            fontSize: '14px', color: '#aaa', pointerEvents: 'none', textAlign: 'center',
          }}>
            Sign here with your finger or mouse
          </div>
        )}
      </div>
      {hasSig && (
        <button onClick={clear} style={{ ...ghostBtn, marginTop: '8px', fontSize: '13px', padding: '7px 16px' }}>Clear signature</button>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


/** Checkbox „DAN day cover bei your dive centre kaufen“ — Preis vom Server, Zahlung vor Ort (offene Position an der Buchung). */
function DayCoverOption({ form, setForm, offer, c }: { form: { buy_day_cover: boolean }; setForm: React.Dispatch<React.SetStateAction<any>>; offer: { cents: number; days: number } | null; c: { accent: string; accentBorder: string; accentDim: string; text: string; sub: string } }) {
  const on = form.buy_day_cover
  return (
    <button type="button" onClick={() => setForm((f: any) => ({ ...f, buy_day_cover: !f.buy_day_cover, insurance_mode: !f.buy_day_cover ? '' : f.insurance_mode }))}
      style={{ textAlign: 'left', padding: '11px 14px', borderRadius: '10px', border: `1px solid ${on ? c.accentBorder : 'rgba(255,255,255,.08)'}`, background: on ? c.accentDim : 'transparent', color: c.text, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
      <span style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${on ? c.accent : 'rgba(255,255,255,.3)'}`, background: on ? c.accent : 'transparent', flexShrink: 0, marginTop: '2px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#090909', fontSize: '12px', fontWeight: 800 }}>{on ? '✓' : ''}</span>
      <span>
        Buy DAN day cover from your dive centre{offer ? ` — €${(offer.cents / 100).toFixed(2)} for ${offer.days} dive day${offer.days === 1 ? '' : 's'}` : ''}
        <div style={{ fontSize: '12px', color: c.sub, marginTop: '3px' }}>Added to your booking, pay at the centre (cash, card or Revolut). Covers every dive day of this booking.</div>
      </span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '18px', fontWeight: 800, color: c.text, marginBottom: '20px' }}>{children}</div>
}

function NavButtons({ onBack, onNext, nextDisabled = false, nextLabel = 'Continue →' }: {
  onBack: () => void
  onNext: () => void
  nextDisabled?: boolean
  nextLabel?: string
}) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
      <button onClick={onBack} style={{ ...ghostBtn, flexShrink: 0 }}>← Back</button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        style={{ ...primaryBtn, opacity: nextDisabled ? 0.45 : 1, cursor: nextDisabled ? 'not-allowed' : 'pointer', flex: 1 }}
      >{nextLabel}</button>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase', color: c.sub, marginBottom: '6px', marginTop: '12px' }}>{title}</div>
      <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '10px', padding: '4px 0' }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: 'success' | 'warning' }) {
  const valueColor = highlight === 'success' ? c.success : highlight === 'warning' ? c.warning : c.text
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,.04)', gap: '12px' }}>
      <span style={{ fontSize: '13px', color: c.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '13px', color: valueColor, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div style={{
      width: '36px', height: '36px', margin: '0 auto',
      border: `3px solid rgba(243,239,230,.2)`,
      borderTopColor: c.accent,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}
