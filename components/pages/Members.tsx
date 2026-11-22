'use client'
import React, { useState, useEffect, useRef, ChangeEvent } from 'react'
import { createPortal } from 'react-dom'

import { createClient as createRawSupabaseClient } from '@supabase/supabase-js'
import { supabase, s, useIsMobile, type Lang, TEAM } from './_shared'
import { logAuditEvent } from '@/lib/auditLog'
import { auditFromClient } from '@/lib/auditClient'
import { SIMULATION_EVENT } from '@/lib/simulationClient'
import { useSimulation } from '@/lib/useSimulation'
import { useAiModes, type AiMode } from '@/lib/aiModes'
import { productTypeFor, requiresLastDive, isProgramProduct } from '@/lib/productType'
import TicketHistory from '@/components/audit/TicketHistory'
import TicketMessages from '@/components/audit/TicketMessages'
import AuditChangelog from '@/components/audit/AuditChangelog'
import LiveBoats from '@/components/dashboard/LiveBoats'
import FrontOfficeBookings from './FrontOfficeBookings'
import SessionPicker, { type Picked } from '@/components/booking/SessionPicker'
import { sessionRank, isNightProduct } from '@/lib/availability'
import { PAYMENT_STATE_LABEL, PAYMENT_STATE_COLOR, type PaymentState } from '@/lib/paymentState'
import { computeInsuranceBlocks, primaryInsurancePlanId, needsRefresher as needsRefresherOn } from '@/lib/insurance'

interface GuestEntry {
 firstName: string
 lastName: string
 email: string
 product: string
 sessions: Picked[]
 insurance: 'own' | 'add' | null
 fullEquipment: boolean
 equipmentItems: string[]
 addonItems: string[]
 addonDays: Record<string, string[]>
 lastDive: string
 residential: boolean
 /** „+ Add item“ pro Gast (Split): zusätzliche Produkte als Preiszeile, Menge 1, ohne Tauchtage (Lucas 24.10.) */
 extraItems: string[]
}
import MiniDatePicker from '@/components/booking/MiniDatePicker'
import FinanceMovements from '@/components/pages/FinanceMovements'
import FinanceOverview, { FinanceHeadline } from '@/components/pages/FinanceOverview'
import FinanceReports from '@/components/finance/FinanceReports'
import CsvButton from '@/components/finance/CsvButton'
import { pricesTable, priceLogTable, pendingRefundsTable, loadRefundHistoryTable } from '@/components/finance/financeCsvTables'
import { csvFileName } from '@/lib/financeReports'
import OpenPayments from '@/components/dashboard/OpenPayments'
import CashRefunds from '@/components/pages/CashRefunds'
import { CopyButton, parsePayout } from '@/components/booking/RefundFields'
import CourseLoad from '@/components/dashboard/CourseLoad'
import CheckoutAnalytics from '@/components/dashboard/CheckoutAnalytics'
import BrandGuidelines from '@/components/knowledge/BrandGuidelines'
import BookingTools from '@/components/knowledge/BookingTools'
import { showToast as showGlobalToast, ToastHost } from '@/components/ui/Toast'
import { resolveWindowMode } from '@/lib/bookingWindows'
import { useStaffNames } from '@/lib/useStaffNames'
import PendingPayments from '@/components/pages/PendingPayments'
import PaymentStatusMissing from '@/components/pages/PaymentStatusMissing'
import PaymentDecision, { type RequestFailure } from '@/components/booking/PaymentDecision'
import PaymentRequestRetry from '@/components/booking/PaymentRequestRetry'
import PaymentRequestFailed from '@/components/pages/PaymentRequestFailed'
import { asOnlineDepositMode, ONLINE_DEPOSIT_THRESHOLD_CENTS, type OnlineDepositMode } from '@/lib/onlineDeposit'
import { CentreBrandForm } from '@/components/booking/CentreBrandForm'

type MemberPage = 'dashboard' | 'frontoffice' | 'finances' | 'aisupport' | 'schedule' | 'profiles' | 'myprofile' | 'knowledgebase' | 'diagnostics' | 'marketing' | 'boatmanagement' | 'testing' | 'settings'
type Ticket = { id: string; name: string; email: string; phone?: string; preferredChannel: 'email' | 'whatsapp' | 'form_submission' | 'internal'; sessionId?: string; message: string; conversation: string; timestamp: string; status: 'open' | 'in_progress' | 'resolved'; archived: boolean; handlingAgent?: string; claimedBy?: string; claimedAt?: string; unclaimedSince?: string; note?: string }

const SLUG_TO_PAGE: Record<string, MemberPage> = {
 'overview': 'dashboard', 'front-office': 'frontoffice', 'finances': 'finances',
 'ai-support': 'aisupport', 'schedule': 'schedule', 'staff': 'profiles', 'my-profile': 'myprofile',
 'knowledge-base': 'knowledgebase', 'error-log': 'diagnostics', 'telemetry': 'diagnostics',
 'diagnostics': 'diagnostics', 'marketing': 'marketing', 'boat-management': 'boatmanagement', 'testing': 'testing', 'checkout-analytics': 'diagnostics',
 'settings': 'settings',
}
const PAGE_TO_SLUG: Record<MemberPage, string> = {
 dashboard: 'overview', frontoffice: 'front-office', finances: 'finances',
 aisupport: 'ai-support', schedule: 'schedule', profiles: 'staff', myprofile: 'my-profile',
 knowledgebase: 'knowledge-base', diagnostics: 'diagnostics',
 marketing: 'marketing', boatmanagement: 'boat-management', testing: 'testing', settings: 'settings',
}

async function logAction(opts: {
 action: string; entity_type: string; entity_id?: string; source?: string;
 payload_before?: Record<string, unknown>; payload_after?: Record<string, unknown>;
 notes?: string; actor_name?: string; actor_role?: string; actor_company?: string
}) {
 try {
 await supabase.from('system_logs').insert({
 action: opts.action, entity_type: opts.entity_type, entity_id: opts.entity_id ?? null,
 source: opts.source ?? 'azd', payload_before: opts.payload_before ?? null,
 payload_after: opts.payload_after ?? null, notes: opts.notes ?? null,
 actor_name: opts.actor_name ?? null, actor_role: opts.actor_role ?? null,
 actor_company: opts.actor_company ?? null,
 })
 } catch (e) { console.warn('[audit] log failed:', e) }
}
const SSI_MATRIX: { name: string; ssiPro: string; mid: string; level: string; levelLabel: string; teaching: string; paidUntil: string|null; r: Record<string,number>; a?: Record<string,number> }[] = [
 { name:'Emanuel', ssiPro:'61194', mid:'669423', level:'ait', levelLabel:'AIT', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:1,night:1,dsbt:1,mEco:0,cID:0,shk:1,rr:0,rrI:0,expI:0,dmT:1,aiT:1} },
 { name:'Paulo', ssiPro:'100648', mid:'2903449', level:'dmi', levelLabel:'DMI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:1,night:1,dsbt:1,mEco:1,cID:0,shk:0,rr:1,rrI:1,expI:1,dmT:1,aiT:1} },
 { name:'Milton', ssiPro:'100751', mid:'2810014', level:'dg', levelLabel:'Dive Guide', teaching:'non', paidUntil:null, r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Célia', ssiPro:'118298', mid:'2906627', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'André', ssiPro:'78780', mid:'2031742', level:'dmi', levelLabel:'DMI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:1,night:1,dsbt:0,mEco:1,cID:0,shk:0,rr:1,rrI:1,expI:0,dmT:1,aiT:1} },
 { name:'Fatema', ssiPro:'128389', mid:'2884802', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:0,night:0,dsbt:1,mEco:1,cID:1,shk:0,rr:1,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Vasco', ssiPro:'99441', mid:'3172464', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:0,sr:1,deep:0,nav:0,night:0,dsbt:1,mEco:1,cID:0,shk:0,rr:0,rrI:0,expI:1,dmT:0,aiT:0} },
 { name:'Carolina', ssiPro:'126209', mid:'2028346', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Lucas', ssiPro:'125455', mid:'3719862', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Florian', ssiPro:'121341', mid:'3483034', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Lois', ssiPro:'125432', mid:'3258303', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Sergio', ssiPro:'129679', mid:'4656789', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Marta', ssiPro:'129359', mid:'4656792', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Paulo T.', ssiPro:'80924', mid:'2307753', level:'owi', levelLabel:'OWI', teaching:'non', paidUntil:null, r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:0,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Justýna', ssiPro:'115466', mid:'3427222', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
]
const SSI_COL_LABELS: Record<string,string> = {
 snD:'Snorkel Diver',snI:'Snorkel Instr.',ts:'Try Scuba',bOWD:'Basic OWD',aOWD:'Adv OWD',dmK:'DM Circuit',
 ean:'Nitrox/EAN',pb:'Perf Buoyancy',sod:'Sci of Diving',sr:'Stress & Rescue',deep:'Deep Diving',
 nav:'Navigation',night:'Night & LV',dsbt:'Boat Diving',mEco:'Marine Ecology',cID:'Coral ID',
 shk:'Shark Ecology',rr:'React Right',rrI:'RR Instructor',expI:'Expedition',dmT:'DM Trainer',aiT:'AIT'
}

function PageAccessDenied({ nav }: { nav: (p: MemberPage) => void }) {
 return (
 <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '40px', background: '#000' }}>
 <div style={{ fontSize: '36px' }}></div>
 <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0, color: '#f3efe6' }}>Access restricted</h2>
 <p style={{ fontSize: '14px', color: 'rgba(255,255,255,.45)', margin: 0, textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>Your account does not have permission to view this page. Contact your admin if you think this is a mistake.</p>
 <button onClick={() => nav('dashboard')} style={{ marginTop: '8px', padding: '10px 24px', borderRadius: 0, border: 'none', background: 'rgba(243,239,230,.15)', color: '#f3efe6', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}> Back to Dashboard</button>
 </div>
 )
}

/* ══════════════════════════════
 LOGIN
══════════════════════════════ */
function PageLogin({ onLogin }: { onLogin: () => void }) {
 const isMobile = useIsMobile()
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)

 async function handleLogin() {
 if (!email || !password) { setError('Please enter your email and password.'); return }
 setLoading(true)
 setError(null)
 const { error: err } = await supabase.auth.signInWithPassword({ email, password })
 setLoading(false)
 if (err) {
 setError(err.message === 'Invalid login credentials' ? 'Incorrect email or password.' : err.message)
 } else {
 onLogin()
 }
 }

 const inp: React.CSSProperties = {
 width: '100%', padding: '12px 14px', borderRadius: 0, fontSize: '15px',
 background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
 color: '#f3efe6', fontFamily: s.font, outline: 'none', boxSizing: 'border-box',
 }

 return (
 <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: s.bg }}>
 <div style={{ width: '100%', maxWidth: '400px' }}>
 <div style={{ textAlign: 'center', marginBottom: '40px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent, marginBottom: '10px' }}>Azores Diving</div>
 <h1 style={{ fontSize: '28px', fontWeight: 500, margin: 0, letterSpacing: '-.02em' }}>Member Area</h1>
 <p style={{ color: s.muted, fontSize: '14px', marginTop: '8px' }}>Sign in with your staff account</p>
 </div>

 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
 <input
 type="email" placeholder="Email address" value={email}
 onChange={e => setEmail(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleLogin()}
 style={inp}
 />
 <input
 type="password" placeholder="Password" value={password}
 onChange={e => setPassword(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleLogin()}
 style={inp}
 />

 {error && (
 <div style={{ background: 'rgba(201,146,140,.1)', border: '1px solid rgba(201,146,140,.25)', borderRadius: 0, padding: '10px 14px', fontSize: '14px', color: '#c9928c' }}>
 {error}
 </div>
 )}

 <button
 onClick={handleLogin}
 disabled={loading}
 style={{ width: '100%', padding: '13px', borderRadius: 0, border: 'none', background: loading ? 'rgba(243,239,230,.4)' : s.accent, color: '#000', fontWeight: 500, fontSize: '15px', cursor: loading ? 'default' : 'pointer', fontFamily: s.font, marginTop: '4px' }}
 >
 {loading ? 'Signing in…' : 'Sign in'}
 </button>
 </div>

 <p style={{ textAlign: 'center', color: s.muted, fontSize: '14px', marginTop: '28px', lineHeight: 1.6 }}>
 No account yet? Ask your team admin to send you an invite.
 </p>
 {/* Refunds */}

 </div>
 </div>
 )
}

// Klick auf das angezeigte Datum (Today / Tomorrow / Datum) öffnet einen Kalender und springt zum gewählten Tag (Lucas 30.10.)
function DayPickerLabel({ dayOffset, setDayOffset, label, style }: { dayOffset: number; setDayOffset: (v: number) => void; label: string; style: React.CSSProperties }) {
 const [open, setOpen] = useState(false)
 const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
 const btnRef = useRef<HTMLButtonElement>(null)
 const current = (() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
 const openPicker = () => {
 const r = btnRef.current?.getBoundingClientRect()
 if (r) setPos({ top: r.bottom, left: Math.max(8, Math.min(r.left + r.width / 2 - 160, window.innerWidth - 340)) })
 setOpen(o => !o)
 }
 const pick = (v: string) => {
 const [y, m, d] = v.split('-').map(Number)
 const t = new Date(); t.setHours(0, 0, 0, 0)
 const target = new Date(y, m - 1, d)
 setDayOffset(Math.round((target.getTime() - t.getTime()) / 86400000))
 setOpen(false)
 }
 return (
 <>
 <button ref={btnRef} type="button" onClick={openPicker} title="Pick a date"
 style={{ ...style, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: s.font, textDecoration: 'underline dotted', textUnderlineOffset: '4px', textDecorationColor: 'rgba(243,239,230,.4)' }}>{label}</button>
 {open && typeof document !== 'undefined' && createPortal(
 <>
 <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
 <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}>
 <MiniDatePicker value={current} onChange={pick} />
 </div>
 </>, document.body)}
 </>
 )
}

function PageDashboard({ nav, dayOffset, setDayOffset, userRole }: { nav: (p: MemberPage) => void; dayOffset: number; setDayOffset: (v: number | ((p: number) => number)) => void; userRole: string | null }) {
 const isMobile = useIsMobile()
 const [clock, setClock] = useState('--:--:--')
 const [rollAM, setRollAM] = useState<{name:string,role:string,start:string,end:string}[]>([])
 const [rollPM, setRollPM] = useState<{name:string,role:string,start:string,end:string}[]>([])
 const [wxData, setWxData] = useState<{sky:string,airTemp:string,windLabel:string,windDeg:number,windSource:'windguru'|'open-meteo',gustKn:number|null,swellLabel:string,waterTemp:string,source:string,fetchTime:string}|null>(null)

 // Simulation-Modus: steht er aus, sieht auch ein Admin nur Echtdaten.
 // Der Schalter schuetzt nicht den Staff — das macht die RLS — sondern den
 // Admin davor, eine simulierte Woche fuer die echte zu halten.
 // Welt dieser Person (Sandbox / Production) aus useSimulation, damit das Dashboard dieselbe Regel nutzt wie die Datenbank (06.11.2026)
 const { sandbox: dashSandbox } = useSimulation()
 const simulationMode = dashSandbox ?? false
 const [tbdBookingPopup, setTbdBookingPopupRaw] = useState<string | null>(null)
 const [payBookingPopup, setPayBookingPopup] = useState<string | null>(null)
 const [dashReloadKey, setDashReloadKey] = useState(0)
 const [tbdItems, setTbdItems] = useState<{ bookingId: string; seats: number }[]>([])
 // Beim Schließen des Buchungs-Popups Boote + Course Load sofort neu laden (Hinweis „ohne Zeitfenster“ verschwindet)
 const setTbdBookingPopup = (id: string | null) => { setTbdBookingPopupRaw(id); if (id === null) setDashReloadKey(k => k + 1) }
 const simLoaded = dashSandbox !== null

 useEffect(() => {
 const fetchWeather = async () => {
 try {
 // Both fetches go through same-origin API routes to avoid CSP blocks
 const wxRes = await fetch('/api/weather')
 if (!wxRes.ok) throw new Error(`weather ${wxRes.status}`)
 const wx = await wxRes.json()

 const wc: number = wx.weathercode ?? 0
 const skyMap: Record<number, string> = { 0:'Clear',1:'Mainly Clear',2:'Pt. Cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Light Rain',53:'Drizzle',55:'Drizzle',61:'Light Rain',63:'Rain',65:'Heavy Rain',80:'Showers',81:'Showers',82:'Heavy Showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm' }
 const sky = skyMap[wc] ?? 'Pt. Cloudy'
 const waveH: number | null = wx.wave_height ?? null
 const waveP: number | null = wx.wave_period ?? null
 const waterT: number | null = wx.sea_surface_temperature ?? null

 // Wind: try Windguru first, fall back to Open-Meteo
 let windDeg: number = wx.winddirection_10m ?? 0
 let windLabel = ''
 let gustKn: number | null = null
 let windSource: 'windguru' | 'open-meteo' = 'open-meteo'
 try {
 const wgRes = await fetch('/api/windguru')
 if (wgRes.ok) {
 const wg = await wgRes.json()
 if (wg.windLabel && wg.windDirDeg != null) {
 windDeg = wg.windDirDeg
 windLabel = wg.windLabel
 gustKn = wg.gustKn ?? null
 windSource = 'windguru'
 }
 }
 } catch { /* fall through to Open-Meteo wind */ }

 if (!windLabel) {
 const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
 const windDir = dirs[Math.round(windDeg / 22.5) % 16]
 const windKn = Math.round(wx.windspeed_10m ?? 0)
 const gustKnOm: number | null = wx.windgusts_10m != null ? Math.round(wx.windgusts_10m) : null
 gustKn = gustKnOm
 windLabel = `${windDir} ${windKn} kn${gustKnOm ? ` (${gustKnOm})` : ''}`
 windSource = 'open-meteo'
 }

 setWxData({
 sky,
 airTemp: `${Math.round(wx.temperature_2m ?? 0)} °C`,
 windLabel,
 windDeg,
 windSource,
 gustKn,
 swellLabel: waveH !== null ? `${waveH.toFixed(1)} m${waveP !== null ? ` / ${Math.round(waveP)} s` : ''}` : '—',
 waterTemp: waterT !== null ? `${Math.round(waterT)} °C` : '22 °C',
 source: 'Open-Meteo',
 fetchTime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
 })
 } catch { /* silent — show demo data */ }
 }
 fetchWeather()
 }, [])

 const rollDate = (() => {
 const d = new Date(); d.setDate(d.getDate() + dayOffset); return d
 })()
 const rollDateLabel = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : dayOffset === -1 ? 'Yesterday'
 : rollDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' })

 useEffect(() => {
 setRollAM([]); setRollPM([])
 const n = new Date(); n.setDate(n.getDate() + dayOffset)
 const wd = n.getDay()
 const diff = (wd === 0 ? -6 : 1 - wd)
 const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() + diff)
 const monStr = mon.toISOString().slice(0,10)
 const dayIdx = wd === 0 ? 6 : wd - 1
 const amKey = `${monStr}_d${dayIdx}_am`
 const pmKey = `${monStr}_d${dayIdx}_pm`
 supabase.from('schedule_data').select('cell_key,entries').in('cell_key', [amKey, pmKey]).eq('is_test', simulationMode)
 .then(({ data }) => {
 if (!data) return
 data.forEach(row => {
 const entries = (row.entries || []).filter((e: any) => e.role && e.role !== 'Folga' && e.role !== 'Meia Folga')
 if (row.cell_key === amKey) setRollAM(entries)
 if (row.cell_key === pmKey) setRollPM(entries)
 })
 })
 }, [dayOffset, simulationMode, userRole])

 // Datum, auf das sich das gesamte Panel bezieht — folgt dem ‹ › Tages-Umschalter.
 // Vorher hing die Bootsanzeige fest an "heute", der Umschalter hatte darauf keine Wirkung.
 const rollDateStr = `${rollDate.getFullYear()}-${String(rollDate.getMonth() + 1).padStart(2, '0')}-${String(rollDate.getDate()).padStart(2, '0')}`

 useEffect(() => {
 function tick() {
 const n = new Date()
 setClock([n.getHours(), n.getMinutes(), n.getSeconds()].map(x => String(x).padStart(2, '0')).join(':'))
 }
 tick()
 const id = setInterval(tick, 1000)
 return () => clearInterval(id)
 }, [])

 const divider = <div style={{ width: '1px', height: '20px', background: 'rgba(243,239,230,.15)', opacity: .7, flexShrink: 0 }} />

 const condItem = (icon: string, label: string, val: string) => (
 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
 <span style={{ fontSize: '14px', lineHeight: 1 }}>{icon}</span>
 <div style={{ lineHeight: 1.1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, opacity: .8 }}>{label}</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{val}</div>
 </div>
 </div>
 )

 return (
 <div style={{ background: '#000', minHeight: '100vh' }}>

 {/* ── LIVE OPS BAR ── */}
 <div style={{
 background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(0,0,0,.72) 100%)', borderBottom: '1px solid rgba(255,255,255,.12)',
 padding: '11px 28px', display: 'flex', alignItems: 'center', gap: '14px',
 flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none',
 position: 'sticky', top: 'var(--member-subnav-h, 44px)', zIndex: 90, backdropFilter: 'blur(12px)',
 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
 title={wxData ? `Live weather data · ${wxData.windSource === 'windguru' ? 'Wind: Windguru · ' : ''}${wxData.source} · ${wxData.fetchTime}` : 'Demo data — live weather not available'}>
 <span aria-hidden style={{ width: '9px', height: '9px', borderRadius: '50%', display: 'inline-block', background: wxData ? '#b7c4b0' : '#c9928c', boxShadow: 'none' }} />
 Live Ops
 </div>
 {divider}
 <div style={{ fontSize: '14px', color: s.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{rollDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · São Miguel</div>
 {divider}
 {condItem('', 'Sky', wxData?.sky ?? 'Pt. Cloudy')}
 {divider}
 {condItem('', 'Air', wxData?.airTemp ?? '24 °C')}
 {divider}
 {/* Wind with compass SVG */}
 <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
 <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
 <circle cx="9" cy="9" r="8" fill="none" stroke="rgba(243,239,230,.15)" strokeWidth="1.2"/>
 <g transform={`rotate(${wxData?.windDeg ?? 45},9,9)`}>
 <line x1="9" y1="3" x2="9" y2="15" stroke="#b7c4b0" strokeWidth="1.8" strokeLinecap="round"/>
 <polygon points="9,2 7,7 11,7" fill="#b7c4b0"/>
 </g>
 </svg>
 <div style={{ lineHeight: 1.1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, opacity: .8 }}>Wind</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{wxData?.windLabel ?? 'NE 14 kn'}</div>
 </div>
 </div>
 {divider}
 {condItem('', 'Swell', wxData?.swellLabel ?? '0.4 m / 8 s')}
 {divider}
 {condItem('', 'Water', wxData?.waterTemp ?? '22 °C')}
 {divider}
 {condItem('', 'Visibility', '20–25 m')}
 {divider}
 {condItem('', 'Conditions', wxData ? (parseFloat(wxData.swellLabel) < 0.5 ? 'Excellent' : parseFloat(wxData.swellLabel) < 1.0 ? 'Good' : parseFloat(wxData.swellLabel) < 1.5 ? 'Fair' : 'Rough') : 'Excellent')}
 <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
 {dayOffset !== 0 && (
 <button type="button" onClick={() => setDayOffset(0)} title="Back to today"
 style={{ padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.4)', background: 'rgba(243,239,230,.12)', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap', letterSpacing: '.04em' }}> Today</button>
 )}
 </div>
 <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '10px', borderLeft: '1px solid rgba(243,239,230,.15)' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
 <button type="button" onClick={() => setDayOffset(o => o - 1)} style={{ background: 'none', border: 'none', color: 'rgba(243,239,230,.5)', cursor: 'pointer', fontSize: '14px', padding: '0 3px', lineHeight: 1, fontFamily: s.font }}>‹</button>
 <DayPickerLabel dayOffset={dayOffset} setDayOffset={setDayOffset} label={rollDateLabel} style={{ fontSize: '14px', fontWeight: 500, color: dayOffset === 0 ? s.accent : '#c9b48a', whiteSpace: 'nowrap', minWidth: '58px', textAlign: 'center', letterSpacing: '.04em' }} />
 <button type="button" onClick={() => setDayOffset(o => o + 1)} style={{ background: 'none', border: 'none', color: 'rgba(243,239,230,.5)', cursor: 'pointer', fontSize: '14px', padding: '0 3px', lineHeight: 1, fontFamily: s.font }}>›</button>
 </div>
 <span style={{ width: '1px', height: '16px', background: 'rgba(243,239,230,.15)', display: 'inline-block' }} />
 <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#b7c4b0', display: 'inline-block', boxShadow: 'none' }} />
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>{clock}</span>
 </div>
 </div>

 <div style={{ padding: isMobile ? '14px 12px' : '20px 16px', maxWidth: '1320px', margin: '0 auto' }}>

 {/* ── SIMULATION BANNER ── */}
 {userRole === 'admin' && simLoaded && (
 <div style={{
 display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
 marginBottom: '18px', padding: '10px 16px', borderRadius: 0,
 background: simulationMode ? 'rgba(201,180,138,.12)' : 'rgba(255,255,255,.03)',
 border: `1px solid ${simulationMode ? 'rgba(201,180,138,.5)' : 'rgba(255,255,255,.07)'}`,
 }}>
 <span style={{ fontSize: '15px' }}>{simulationMode ? '' : ''}</span>
 <div style={{ lineHeight: 1.4 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: simulationMode ? '#c9b48a' : s.muted }}>
 {simulationMode ? 'Sandbox' : 'Production'}
 </div>
 <div style={{ fontSize: '14px', color: s.muted }}>
 {simulationMode
 ? 'Sandbox: only test bookings and simulated shifts are shown. Admins only — staff cannot see them. Switch at the top right (next to Sign out).'
 : 'Production: only real bookings and shifts are shown.'}
 </div>
 </div>
 </div>
 )}

 {/* ── THE BOATS (live) ── */}
 <LiveBoats
 rollDateStr={rollDateStr}
 isAdmin={userRole === 'admin' || simulationMode} // Sandbox: Staff sehen das Dashboard wie der Admin (Workshop); Production: weiter „Coming Soon“
 isMobile={isMobile}
 simulationMode={simulationMode}
 onTbdChange={setTbdItems}
 reloadKey={dashReloadKey}
 onRefresh={() => setDashReloadKey(k => k + 1)}
 />

 {tbdBookingPopup && (
 <div onClick={() => setTbdBookingPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, boxShadow: 'none' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Booking <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: s.text, fontWeight: 500 }}>{tbdBookingPopup.slice(0, 8).toUpperCase()}</span> · Sessions tab</span>
 <button type="button" onClick={() => setTbdBookingPopup(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 0, padding: '6px 12px', fontSize: '14px', cursor: 'pointer' }}>Close </button>
 </div>
 <div style={{ padding: '14px' }}>
 <FrontOfficeBookings focusBookingId={tbdBookingPopup} embedded initialTab="sessions" />
 </div>
 </div>
 </div>
 )}

 {/* ── OPEN PAYMENTS: wer taucht heute und hat noch Saldo offen ── */}
 <OpenPayments
 rollDateStr={rollDateStr}
 isToday={dayOffset === 0}
 simulationMode={simulationMode}
 reloadKey={dashReloadKey}
 onOpen={(id) => setPayBookingPopup(id)}
 />

 {payBookingPopup && (
 <div onClick={() => setPayBookingPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, boxShadow: 'none' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Booking <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: s.text, fontWeight: 500 }}>{payBookingPopup.slice(0, 8).toUpperCase()}</span> · Payments tab</span>
 <button type="button" onClick={() => { setPayBookingPopup(null); setDashReloadKey(k => k + 1) }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 0, padding: '6px 12px', fontSize: '14px', cursor: 'pointer' }}>Close </button>
 </div>
 <div style={{ padding: '14px' }}>
 <FrontOfficeBookings focusBookingId={payBookingPopup} embedded initialTab="payments" />
 </div>
 </div>
 </div>
 )}

 {/* ── INFO GRID: Courses · Bookings · Staff ── */}
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: isMobile ? '12px' : '20px', marginBottom: '20px' }}>

 {/* Active Courses — B-5 CourseLoad Widget */}
 <CourseLoad rollDateStr={rollDateStr} isAdmin={userRole === 'admin' || simulationMode} simulationMode={simulationMode} reloadKey={dashReloadKey} />
 {false && <div style={{ position: 'relative', background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '20px', overflow: 'hidden' }}>
 <div style={{ position: 'absolute', inset: 0, background: 'rgba(9,9,9,.6)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', zIndex: 10 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(243,239,230,.8)' }}>Coming Soon</div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', textAlign: 'center', lineHeight: 1.5 }}>Course tracking coming soon</div>
 </div>
 <div style={{ filter: 'blur(1px)', opacity: .5, pointerEvents: 'none', userSelect: 'none' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent, marginBottom: '16px' }}>Active Courses</div>
 {[
 { name: 'Open Water Diver', sub: 'Gruppe Müller · 2 students', tag: 'Day 2/4', next: ' Ocean dives today 14:00' },
 { name: 'Advanced Open Water Diver', sub: 'Solo · R. Ferreira', tag: 'Day 1/2', next: ' Deep dive + navigation' },
 ].map(c => (
 <div key={c.name} style={{ background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '14px', marginBottom: '10px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{c.name}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '3px' }}>{c.sub}</div>
 </div>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.accent, background: 'rgba(243,239,230,.1)', padding: '3px 9px', borderRadius: 0 }}>{c.tag}</span>
 </div>
 <div style={{ marginTop: '10px', fontSize: '14px', color: '#b7c4b0', fontWeight: 500 }}>{c.next}</div>
 </div>
 ))}
 <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', marginTop: '12px', paddingTop: '12px' }}>
 <div style={{ fontSize: '14px', color: s.muted }}>No other active courses today</div>
 </div>
 </div>
 </div>}

 {/* Needs attention — ersetzt den Platzhalter „Booking Requests“; Hinweis „ohne Zeitfenster“ wohnt hier statt über den Booten */}
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: `1px solid ${tbdItems.length > 0 ? 'rgba(201,180,138,.4)' : 'rgba(243,239,230,.15)'}`, borderRadius: 0, padding: '20px' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent }}>Needs attention</div>
 {tbdItems.length > 0 && <span style={{ fontSize: '14px', fontWeight: 500, color: '#d4a07a', background: 'rgba(212,160,122,.12)', padding: '3px 9px', borderRadius: 0 }}>{tbdItems.length} open</span>}
 </div>
 {tbdItems.length === 0 ? (
 <div style={{ fontSize: '14px', color: s.muted }}> Nothing open for this day</div>
 ) : tbdItems.map(r => (
 <div key={r.bookingId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 0, background: 'rgba(201,180,138,.06)', border: '1px solid rgba(201,180,138,.25)', marginBottom: '8px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}> No time slot yet</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>Booking {r.bookingId.slice(0, 8).toUpperCase()} · {r.seats} {r.seats === 1 ? 'guest' : 'guests'} · not on any boat</div>
 </div>
 <button type="button" onClick={() => setTbdBookingPopup(r.bookingId)} style={{ background: 'rgba(201,180,138,.15)', border: '1px solid rgba(201,180,138,.5)', color: '#c9b48a', borderRadius: 0, padding: '5px 12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>Set AM/PM </button>
 </div>
 ))}
 </div>

 {/* Staff on Roll */}
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '20px' }}>
 <div style={{ marginBottom: '16px' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent }}>Staff on Roll</div>
 <button type="button" onClick={() => nav('schedule')} style={{ fontSize: '14px', color: s.muted, cursor: 'pointer', fontWeight: 500, background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>Edit ›</button>
 </div>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
 <button type="button" onClick={() => setDayOffset(o => o - 1)} style={{ background: 'rgba(243,239,230,.08)', border: '1px solid rgba(243,239,230,.18)', borderRadius: 0, color: s.accent, fontSize: '15px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: s.font, flexShrink: 0 }}>‹</button>
 <DayPickerLabel dayOffset={dayOffset} setDayOffset={setDayOffset} label={rollDateLabel} style={{ fontSize: '14px', fontWeight: 500, color: dayOffset === 0 ? s.text : '#c9b48a', minWidth: '90px', textAlign: 'center', letterSpacing: '.02em' }} />
 <button type="button" onClick={() => setDayOffset(o => o + 1)} style={{ background: 'rgba(243,239,230,.08)', border: '1px solid rgba(243,239,230,.18)', borderRadius: 0, color: s.accent, fontSize: '15px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: s.font, flexShrink: 0 }}>›</button>
 </div>
 </div>
 {rollAM.length === 0 && rollPM.length === 0 ? (
 <div style={{ textAlign: 'center', padding: '20px 0', color: s.muted, fontSize: '14px' }}>
 No schedule assigned for {rollDateLabel}.<br/>
 <button type="button" onClick={() => nav('schedule')} style={{ color: s.accent, cursor: 'pointer', fontWeight: 500, fontSize: '14px', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>Open Schedule </button>
 </div>
 ) : (
 <>
 {rollAM.length > 0 && (
 <div style={{ marginBottom: '14px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#b7c4b0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
 <span></span> AM Shift
 </div>
 {rollAM.map(st => (
 <div key={st.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: 0, background: 'rgba(183,196,176,.05)', border: '1px solid rgba(183,196,176,.12)', marginBottom: '5px' }}>
 <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#b7c4b0', flexShrink: 0 }} />
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{st.name}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{st.role}</div>
 </div>
 {(st.start || st.end) && (
 <div style={{ fontSize: '14px', color: '#b7c4b0', fontWeight: 500, whiteSpace: 'nowrap', background: 'rgba(183,196,176,.1)', padding: '2px 8px', borderRadius: 0 }}>
 {st.start}{st.end ? `–${st.end}` : ''}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 {rollPM.length > 0 && (
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#d4a07a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
 <span></span> PM Shift
 </div>
 {rollPM.map(st => (
 <div key={st.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: 0, background: 'rgba(212,160,122,.05)', border: '1px solid rgba(212,160,122,.12)', marginBottom: '5px' }}>
 <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#d4a07a', flexShrink: 0 }} />
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{st.name}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{st.role}</div>
 </div>
 {(st.start || st.end) && (
 <div style={{ fontSize: '14px', color: '#d4a07a', fontWeight: 500, whiteSpace: 'nowrap', background: 'rgba(212,160,122,.1)', padding: '2px 8px', borderRadius: 0 }}>
 {st.start}{st.end ? `–${st.end}` : ''}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </>
 )}
 </div>
 </div>

 {/* ── COURSE CAPACITY ── */}
 <div style={{ position: 'relative', background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '22px', marginBottom: '20px', overflow: 'hidden' }}>
 <div style={{ position: 'absolute', inset: 0, background: 'rgba(9,9,9,.6)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', zIndex: 10 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(243,239,230,.8)' }}>Coming Soon</div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', textAlign: 'center', lineHeight: 1.5 }}>Capacity planning coming soon</div>
 </div>
 <div style={{ filter: 'blur(1px)', opacity: .5, pointerEvents: 'none', userSelect: 'none' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent }}>Course Capacity</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '3px' }}>Who can take a new student tomorrow?</div>
 </div>
 <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
 {[['#b7c4b0', 'Available'], ['#d4a07a', 'Partial'], [s.muted, 'Guiding only']].map(([color, label]) => (
 <span key={label as string} style={{ fontSize: '14px', color: color as string, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
 <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color as string, display: 'inline-block' }} /> {label}
 </span>
 ))}
 </div>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: '10px' }}>
 {[
 { name: 'Fatema Yelmar', role: 'Instructor', dot: '#b7c4b0', avail: ' Free from 10:00', active: 'Active: OWD · Group Müller', load: 33, slots: '2/6 students · OWD · Scuba Diver · Specialties' },
 { name: 'Lois Cascallar', role: 'Instructor', dot: '#b7c4b0', avail: ' Free all day', active: 'No active course', load: 0, slots: '0/6 students · OWD · Advanced · Specialties' },
 { name: 'Celia Martin', role: 'Instructor', dot: '#b7c4b0', avail: ' Free all day', active: 'No active course', load: 0, slots: '0/6 students · OWD · Advanced · React Right' },
 { name: 'Paulo', role: 'Instructor', dot: '#b7c4b0', avail: ' Free from 09:00', active: 'Active: OWD · R. Ferreira', load: 16, slots: '1/6 students · OWD · Advanced Open Water Diver' },
 { name: 'Lucas W.', role: 'Instructor', dot: '#d4a07a', avail: ' Half-day available', active: 'Active: Adv. Adventurer · 1 student', load: 25, slots: '1/4 students · OWD · Advanced · Specialties' },
 { name: 'Vasco Rebordão', role: 'Guide / Lead', dot: s.muted, avail: ' Guiding PM', active: 'Active: Guiding PM boat', load: null, slots: 'Dive Guide programs' },
 ].map(inst => (
 <div key={inst.name} style={{ background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '13px 15px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: inst.dot, flexShrink: 0 }} />
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{inst.name}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{inst.role}</div>
 </div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: inst.dot, textAlign: 'right', whiteSpace: 'nowrap' }}>{inst.avail}</div>
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '4px' }}><em style={{ opacity: .8 }}>{inst.active}</em></div>
 {inst.load !== null && (
 <div style={{ margin: '6px 0 4px', height: '4px', borderRadius: 0, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
 <div style={{ width: `${inst.load}%`, height: '100%', background: '#b7c4b0', borderRadius: 0 }} />
 </div>
 )}
 <div style={{ fontSize: '14px', color: s.muted }}>{inst.slots}</div>
 </div>
 ))}
 </div>
 <div style={{ marginTop: '16px', padding: '14px 18px', background: 'rgba(183,196,176,.09)', border: '1px solid rgba(183,196,176,.25)', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
 <span style={{ fontSize: '18px' }}></span>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#b7c4b0' }}>Open Water Diver — can start tomorrow (22 Jul)</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>Fatema, Lois, Celia or Paulo are all free · max 6 students each · theory in the morning, pool afternoon</div>
 </div>
 <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
 <div style={{ fontSize: '14px', color: s.muted }}>4 instructors available</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#b7c4b0' }}>24 open slots</div>
 </div>
 </div>
 </div>
 </div>


 </div>

 </div>
 )
}

/* ══════════════════════════════
 FRONT OFFICE
══════════════════════════════ */
// ─── Online booking mode (Low Season, Lucas 28.10.2026) ──────────────────────
// site_settings.booking_mode: 'open' = Sofortzahlung wie bisher · 'request' = Gast sendet Anfrage, Team gibt frei.
// Lesen public (/api/site-settings), Schreiben nur Admin (/api/admin/settings, schreibt ins Audit-Log).
function BookingModeSwitch({ isAdmin }: { isAdmin: boolean }) {
 const [mode, setMode] = useState<'open' | 'request' | null>(null)
 const [saving, setSaving] = useState(false)
 const [msg, setMsg] = useState<string | null>(null)
 useEffect(() => {
 fetch('/api/site-settings?key=booking_mode').then(r => r.json())
 .then(d => setMode(d?.value === 'request' ? 'request' : 'open'))
 .catch(e => setMsg(`Could not load booking mode: ${e instanceof Error ? e.message : String(e)}`))
 }, [])
 async function save(next: 'open' | 'request') {
 if (!isAdmin || saving || next === mode) return
 if (!confirm(next === 'request'
 ? 'Switch the public booking page to REQUEST mode?\n\nGuests will no longer pay instantly: every booking arrives as a request that the team approves in Front Office Booking Requests. Payment links are sent on approval.'
 : 'Switch the public booking page back to OPEN mode?\n\nGuests pay instantly via Stripe again. Open requests stay as they are and can still be approved.')) return
 setSaving(true); setMsg(null)
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 if (!token) throw new Error('Not signed in — reload and sign in again')
 const r = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ key: 'booking_mode', value: next }) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok) throw new Error(`HTTP ${r.status} ${d.error ?? ''}`.trim())
 setMode(next)
 setMsg(` Saved — public booking page is now in ${next.toUpperCase()} mode (takes effect immediately on the server; the page text may lag up to a minute).`)
 } catch (e) {
 setMsg(` Booking mode was NOT saved: ${e instanceof Error ? e.message : String(e)}`)
 } finally {
 setSaving(false)
 }
 }
 const pill = (m: 'open' | 'request', active: boolean) => ({
 padding: '6px 14px', borderRadius: 0, border: `1px solid ${active ? (m === 'request' ? 'rgba(201,180,138,.6)' : 'rgba(183,196,176,.6)') : 'rgba(255,255,255,.15)'}`,
 background: active ? (m === 'request' ? 'rgba(201,180,138,.15)' : 'rgba(183,196,176,.12)') : 'transparent',
 color: active ? (m === 'request' ? '#c9b48a' : '#b7c4b0') : s.muted, fontSize: '14px', fontWeight: 500, fontFamily: s.font,
 cursor: isAdmin && !saving ? 'pointer' : 'default', opacity: saving ? .6 : 1,
 })
 return (
 <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 0, background: mode === 'request' ? 'rgba(201,180,138,.05)' : 'rgba(243,239,230,.04)', border: `1px solid ${mode === 'request' ? 'rgba(201,180,138,.3)' : 'rgba(243,239,230,.14)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '2px' }}>Default booking mode{mode === 'request' ? ' — REQUEST (low season)' : mode === 'open' ? ' — OPEN' : ''} <span style={{ fontWeight: 400, color: s.muted }}>· applies to every date not covered by a window below</span></div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5 }}>
 {mode === 'request'
 ? 'Guests send a booking request, no payment until the team approves. Open requests: filter " Requests" below Approve sends the payment link.'
 : 'Guests pay instantly via Stripe. Switch to Request for the low season so every date is confirmed by the team first.'}
 {!isAdmin && ' (Only admins can change this.)'}
 </div>
 {msg && <div style={{ marginTop: '6px', fontSize: '14px', fontWeight: 500, color: msg.startsWith('') ? '#b7c4b0' : '#c9928c' }}>{msg}</div>}
 </div>
 <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
 <button type="button" disabled={!isAdmin || saving || mode === null} onClick={() => save('open')} style={pill('open', mode === 'open')}>Open</button>
 <button type="button" disabled={!isAdmin || saving || mode === null} onClick={() => save('request')} style={pill('request', mode === 'request')}>Request</button>
 </div>
 </div>
 )
}

// ─── Online 50 % deposit (Lucas 30.10.2026) ──────────────────────────────────
// site_settings.online_deposit_mode: 'off' | 'sandbox' (nur /book?sandbox=1 für Staff-Tests) | 'live' (alle Gäste).
// Regel: ab 350 € Warenkorb, 50 % auf alles außer Versicherung (immer voll). Server prüft verbindlich (/api/checkout).
// Lesen public (/api/site-settings), Schreiben nur Admin (/api/admin/settings, Audit-Log). Kein confirm (Lucas 28.10.).
function OnlineDepositSwitch({ isAdmin }: { isAdmin: boolean }) {
 const [mode, setMode] = useState<OnlineDepositMode | null>(null)
 const [saving, setSaving] = useState(false)
 const [msg, setMsg] = useState<string | null>(null)
 useEffect(() => {
 fetch('/api/site-settings?key=online_deposit_mode').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
 .then(d => setMode(asOnlineDepositMode(d?.value)))
 .catch(e => setMsg(`Could not load deposit setting: ${e instanceof Error ? e.message : String(e)}`))
 }, [])
 const label: Record<OnlineDepositMode, string> = { off: 'OFF', sandbox: 'SANDBOX ONLY', live: 'LIVE' }
 async function save(next: OnlineDepositMode) {
 if (!isAdmin || saving || next === mode) return
 setSaving(true); setMsg(null)
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 if (!token) throw new Error('Not signed in — reload and sign in again')
 const r = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ key: 'online_deposit_mode', value: next }) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok) throw new Error(`HTTP ${r.status} ${d.error ?? ''}`.trim())
 setMode(next)
 setMsg(`Saved — online 50% deposit is now ${label[next]} (from €${(ONLINE_DEPOSIT_THRESHOLD_CENTS / 100).toFixed(0)} cart total). Takes effect immediately on the server.`)
 } catch (e) {
 setMsg(`Deposit setting was NOT saved: ${e instanceof Error ? e.message : String(e)}`)
 } finally {
 setSaving(false)
 }
 }
 const pill = (active: boolean) => ({
 padding: '6px 14px', borderRadius: 0, border: `1px solid ${active ? 'rgba(243,239,230,.6)' : 'rgba(255,255,255,.15)'}`,
 background: active ? 'rgba(243,239,230,.12)' : 'transparent',
 color: active ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, fontFamily: s.font,
 cursor: isAdmin && !saving ? 'pointer' : 'default', opacity: saving ? .6 : 1,
 })
 return (
 <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 0, background: 'rgba(243,239,230,.04)', border: '1px solid rgba(243,239,230,.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '2px' }}>Online 50% deposit{mode ? ` — ${label[mode]}` : ''}</div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5 }}>
 Guests can pay a 50% deposit online for carts of €{(ONLINE_DEPOSIT_THRESHOLD_CENTS / 100).toFixed(0)} or more (insurance always in full). Sandbox only = visible on /book?sandbox=1 for staff tests; Live = visible for every guest. Not offered in request mode.
 {!isAdmin && ' (Only admins can change this.)'}
 </div>
 {msg && <div style={{ marginTop: '6px', fontSize: '14px', fontWeight: 500, color: msg.startsWith('Saved') ? '#b7c4b0' : '#c9928c' }}>{msg}</div>}
 </div>
 <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
 {(['off', 'sandbox', 'live'] as OnlineDepositMode[]).map(m => (
 <button key={m} type="button" disabled={!isAdmin || saving || mode === null} onClick={() => save(m)} style={pill(mode === m)}>{m === 'off' ? 'Off' : m === 'sandbox' ? 'Sandbox only' : 'Live'}</button>
 ))}
 </div>
 </div>
 )
}

function PageFrontOffice({ nav, userRole }: { nav: (p: MemberPage) => void; userRole?: string | null }) {
 const isMobile = useIsMobile()
 // Testbuchung: schreibt is_test = true. Nur Admins koennen das umschalten;
 // fuer alle anderen entsteht immer eine echte Buchung.
 const [foIsTest, setFoIsTest] = useState(false)
 const [foProduct, setFoProduct] = useState('')
 const [foSessionsPicked, setFoSessionsPicked] = useState<Picked[]>([])
 const [foGuests, setFoGuests] = useState(1)
 const [foPayment, setFoPayment] = useState<'cash' | 'bank' | 'revolut' | 'card' | 'link' | ''>('') // '' = noch nicht gewaehlt: bewusst keine Vorauswahl (Lucas 05.11.2026)
 const [foName, setFoName] = useState('')
 // Zahler-Adresse: macht bei Walk-ins das Vorausfuellen im Check-in moeglich.
 // Der Check-in gibt Kundendaten nur zu E-Mails heraus, die nachweislich zu
 // dieser Buchung gehoeren — ohne dieses Feld gaebe es fuer Walk-ins keine.
 const [foEmail, setFoEmail] = useState('')
 const [foPhone, setFoPhone] = useState('')
 // Sub-tabs: the walk-in form is the daily tool, the simulator is for testing
 // the guest-facing Stripe flow without leaving the members area.
 const [foTab, setFoTab] = useState<'walkin' | 'simulator'>('walkin')
 const [foSection, setFoSection] = useState<'new' | 'history' | 'requests' | 'cash' | 'dan'>(() => {
 if (typeof window === 'undefined') return 'new'
 const v = localStorage.getItem('azd_foTab')
 return v === 'new' || v === 'history' || v === 'requests' || v === 'cash' || v === 'dan' ? v : 'new'
 })
 // Offene Buchungsanfragen (Low Season) für den Tab-Zähler
 const [foOpenRequests, setFoOpenRequests] = useState<number | null>(null)
 const { sandbox: foSandbox } = useSimulation()
 // Offene Bargeld-Refunds für den Tab-Zähler
 const [foCashRefunds, setFoCashRefunds] = useState<number | null>(null)
 const [foCashTick, setFoCashTick] = useState(0)
 useEffect(() => {
 if (foSandbox === null) return
 let alive = true
 const q = () => supabase.from('booking_refunds').select('id', { count: 'exact', head: true }).eq('status', 'requested').eq('method', 'cash').eq('is_test', foSandbox === true)
 .then(({ count, error }) => { if (alive && !error) setFoCashRefunds(count ?? 0) })
 q()
 const id = setInterval(q, 60_000)
 return () => { alive = false; clearInterval(id) }
 }, [foSandbox, foSection, foCashTick])
 useEffect(() => {
 if (foSandbox === null) return
 let alive = true
 supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('is_test', foSandbox === true).eq('request_state', 'requested')
 .then(({ count, error }) => { if (alive && !error) setFoOpenRequests(count ?? 0) })
 const id = setInterval(() => {
 supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('is_test', foSandbox === true).eq('request_state', 'requested')
 .then(({ count, error }) => { if (alive && !error) setFoOpenRequests(count ?? 0) })
 }, 60_000)
 return () => { alive = false; clearInterval(id) }
 }, [foSandbox, foSection])
 const [danInfo, setDanInfo] = useState<{ pending_rows: number; session_dates: string[]; customers: number; blocked?: { booking_customer_id: string; booking_id: string; name: string; days: number; cost_cents: number; charged_cents: number; reason: string }[] } | null>(null)
 const [danLoading, setDanLoading] = useState(false)
 const [danDownloading, setDanDownloading] = useState(false)
 const [danSubmitting, setDanSubmitting] = useState(false)
 const [danMsg, setDanMsg] = useState<string | null>(null)
 // Letzte heruntergeladene DAN-Datei: nur deren Zeilen werden als gemeldet gestempelt (nie „alles Offene“)
 const [danBatch, setDanBatch] = useState<{ id: string; rows: string[]; test: boolean; at: string } | null>(null)
 const [danPopupBookingId, setDanPopupBookingId] = useState<string | null>(null)
 const [danFixBusy, setDanFixBusy] = useState<string | null>(null)
 // DAN-Export folgt dem globalen Sandbox/Production-Schalter
 const { sandbox: danSandbox, canProduction: foCanProduction } = useSimulation()
 const danTestMode = danSandbox === true
 // In the Simulator every booking is test data — not a choice, so it cannot be
 // forgotten. In the walk-in tab an admin may still flag one deliberately.
 // Tab folgt dem globalen Schalter: Sandbox = nur Simulator, Production = nur Quick Booking.
 // Nicht-Admins sind immer in der Sandbox (nur Simulator).
 useEffect(() => {
 if (!userRole || danSandbox === null) return
 setFoTab(!foCanProduction || danSandbox ? 'simulator' : 'walkin')
 }, [userRole, danSandbox, foCanProduction])
 const isSim = foTab === 'simulator'
 const effectiveIsTest = isSim || (foCanProduction ? foIsTest : true) // Data access = sandbox: immer Sandbox-Buchung
 const [stripeMode, setStripeMode] = useState<{
 mode: string; live_allowed: boolean; webhook_configured: boolean; test_key_configured?: boolean
 diagnostics?: { raw_length: number; clean_length: number; stripped: number; prefix: string; webhook_raw_length: number; webhook_clean_length: number }
 } | null>(null)
 const [simLoading, setSimLoading] = useState(false)
 const [simError, setSimError] = useState<string | null>(null)
 const [foNotes, setFoNotes] = useState('')
 const [foNif, setFoNif] = useState('') // Steuernummer für namentliche Rechnung (optional)
 const foNifClean = foNif.replace(/[\s.-]/g,'').toUpperCase()
 const foNifValid = foNifClean === '' || /^[0-9]{9}$/.test(foNifClean) || /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(foNifClean)
 const [foNifTouched, setFoNifTouched] = useState(false) // Fehler erst nach Verlassen des Felds — sonst meckert „DE" schon beim Tippen
 const foNifShowErr = !foNifValid && foNifTouched
 // Refresher detection: letztes Tauchdatum pro Buchung (für Split-Booking später per Gast)
 const [foLastDive, setFoLastDive] = useState('')
 const [foLastDiveOpen, setFoLastDiveOpen] = useState(false)
 const [foGuestLastDiveOpen, setFoGuestLastDiveOpen] = useState<number | null>(null)
 // Per-Gast Last-Dive für Single-View mit foGuests >= 2
 const [foGuestLastDives, setFoGuestLastDives] = useState<string[]>([])
 const [foAutoSplitNote, setFoAutoSplitNote] = useState<string | null>(null)
 // Per-Gast Name für Gruppenmodus mit foGuests >= 2 (Pflicht ab Gast 2; Gast 1 = Zahler/foName)
 const [foGuestNames, setFoGuestNames] = useState<string[]>([])
 const [foGuestLastDiveOpenSingle, setFoGuestLastDiveOpenSingle] = useState<number | null>(null)
 const [foSplit, setFoSplit] = useState(false)
 const [foDepositOnly, setFoDepositOnly] = useState(false)
 const [foGuestEntries, setFoGuestEntries] = useState<GuestEntry[]>([])
 const [foLinkUrl, setFoLinkUrl] = useState<string | null>(null)
 // Pflichtschritt nach dem Anlegen (Cash / Transfer / Revolut): Buchungen, fuer die der Zahlungsstatus noch gesetzt werden muss
 const [foPayDecide, setFoPayDecide] = useState<string[] | null>(null)
 const [foPayNote, setFoPayNote] = useState<string | null>(null)
 const [foPayReqFailed, setFoPayReqFailed] = useState<RequestFailure[]>([])
 const [foLinkCopied, setFoLinkCopied] = useState(false)
 const [foLinkLoading, setFoLinkLoading] = useState(false)
 const [foDatePickerOpen, setFoDatePickerOpen] = useState(false)
 const [foGroupInsurance, setFoGroupInsurance] = useState<'own' | 'add' | null>(null)
 const [foGroupFullEquipment, setFoGroupFullEquipment] = useState(false)
 const [foGroupEquipmentItems, setFoGroupEquipmentItems] = useState<string[]>([])
 const [foGroupAddonItems, setFoGroupAddonItems] = useState<string[]>([])
 const [foGroupAddonDays, setFoGroupAddonDays] = useState<Record<string, string[]>>({}) // empty = all days
 const [foAddonPickerOpen, setFoAddonPickerOpen] = useState<string | null>(null)
 const [foGuestAddonPickerOpen, setFoGuestAddonPickerOpen] = useState<{ gi: number; apName: string } | null>(null)
 const [foCustomLines, setFoCustomLines] = useState<{ label: string; amount: number }[]>([])
 const [foExtraLines, setFoExtraLines] = useState<{ product: string }[]>([])
 const [foResidential, setFoResidential] = useState(false)

 const [foSubmitted, setFoSubmitted] = useState(false)
 const [foCheckinToken, setFoCheckinToken] = useState<string | null>(null)
 const [foCreatedBookingId, setFoCreatedBookingId] = useState<string | null>(null) // Success-Screen: Link in die Booking History
 // Deep-Link aus einem Ticket (AI Support „Open in Booking Requests"): localStorage trägt die Buchung über den Seitenwechsel
 const [foOpenBookingId, setFoOpenBookingId] = useState<string | null>(() => {
 if (typeof window === 'undefined') return null
 const v = localStorage.getItem('azd_foOpenBooking')
 if (v) localStorage.removeItem('azd_foOpenBooking')
 return v || null
 })
 const [foLoading, setFoLoading] = useState(false)
 const [foCopied, setFoCopied] = useState(false)
 // Email-Status nach Buchungserstellung: null | 'sending' | 'sent' | Fehlerstring
 const [foEmailStatus, setFoEmailStatus] = useState<string | null>(null)

 const [foProductsList, setFoProductsList] = useState<{id:string;name:string;category:string;price:number;residentialPrice?:number;sessionsIncluded:number;boatDays?:number|null;equipmentIncluded?:boolean;computerIncluded?:boolean;insuranceIncluded?:boolean}[]>([])
 useEffect(() => {
 supabase.from('course_prices').select('id,name,category,price_cents,residential_price_cents,sessions_included,boat_days,equipment_included,computer_included,insurance_included').order('category').order('name')
 .then(({ data }) => {
 if (data) {
 const list = data.map(p => ({ id: p.id, name: p.name, category: p.category, price: p.price_cents / 100, residentialPrice: p.residential_price_cents != null ? p.residential_price_cents / 100 : undefined, sessionsIncluded: p.sessions_included ?? 1, boatDays: p.boat_days ?? null, equipmentIncluded: !!p.equipment_included, computerIncluded: !!p.computer_included, insuranceIncluded: !!p.insurance_included }))
 setFoProductsList(list)
 // Vorher stand hier fest 'Double Dive' — ein Name, den es in
 // course_prices nicht gibt ('Daily Double Dive'). Das <select> zeigte
 // deshalb Position 1 der Liste, die Summary aber den toten String:
 // Dropdown "10-Dive Pack", Summary "Double Dive" zum Preis des Packs.
 setFoProduct(prev => {
 const renderCats = new Set(['dives','entry','specialty','pro','ecology','equipment','extras','insurance'])
 if (prev && list.some(x => x.name === prev && renderCats.has(x.category))) return prev
 // Default = Daily Double Dive (wie /book), nicht das alphabetisch erste ("10-Dive Pack")
 return list.find(p => p.id === 'daily-double-dive')?.name ?? list.find(p => renderCats.has(p.category))?.name ?? ''
 })
 }
 })
 }, [])
 const selectedProduct = foProductsList.find(p => p.name === foProduct)
 // Effective price helper: returns residential price when foResidential is active and the product has one
 const getEP = (p: { price: number; residentialPrice?: number } | undefined, residential?: boolean): number => {
 const r = residential !== undefined ? residential : foResidential
 return p ? (r && p.residentialPrice != null ? p.residentialPrice : p.price) : 0
 }
 // Products where DAN day insurance is already included in the price
 // Uses startsWith to match variants like "Basic Diver (Pool + Sea)", "Open Water Diver SSI" etc.
 // Versicherung inklusive kommt aus course_prices.insurance_included (Daten, nicht Produktnamen)
 const insuranceIncludedFor = (productName: string) => !!foProductsList.find(p => p.name === productName)?.insuranceIncluded
 const insuranceIncluded = insuranceIncludedFor(foProduct)
 // Reine Miet-/Zuschlags-/Versicherungsprodukte sind keine Tauchgaenge: keine Versicherungsabfrage (kein DAN, kein Flag)
 const insuranceNotNeededFor = (productName: string) => ['equipment', 'equipment-legacy', 'extras', 'insurance'].includes(foProductsList.find(p => p.name === productName)?.category ?? '')
 const insuranceNotNeeded = insuranceNotNeededFor(foProduct)
 const insuranceSkipFor = (productName: string) => insuranceIncludedFor(productName) || insuranceNotNeededFor(productName)
 const insuranceSkip = insuranceIncluded || insuranceNotNeeded
 useEffect(() => { if (insuranceNotNeeded && foGroupInsurance !== null) setFoGroupInsurance(null) }, [insuranceNotNeeded]) // eslint-disable-line react-hooks/exhaustive-deps
 // Derived from foSessionsPicked — single source of truth for the booking form
 const foRequired = selectedProduct?.sessionsIncluded ?? 1
 // Refresher erforderlich wenn: nie getaucht ODER letztes Tauchen > 12 Monate her
 // Scuba Skills Update: wenn letzter Tauchgang > 12 Monate her
 // Gleiche Regel wie der Server (25.10.): > 12 Monate vor dem SPÄTESTEN gebuchten Tauchtag (ohne Auswahl: heute)
 const foLatestPickedDay = [...foSessionsPicked].map(x => x.date).filter(Boolean).sort().slice(-1)[0] ?? null
 const needsRefresher = !!foLastDive && needsRefresherOn(foLastDive, foLatestPickedDay)
 // Letzte-Tauchgang-Daten pro Gast (1 Gast = foLastDive, Gruppe = foGuestLastDives) — /api/checkout verlangt sie bei Zertifikats-Produkten
 const foLastDiveList = () => Array.from({ length: foGuests }, (_, i) => ((foGuests <= 1 ? foLastDive : (foGuestLastDives[i] ?? '')) || '').trim())
 const foLastDivePayload = () => requiresLastDive(foProduct, selectedProduct?.category) ? { last_dive_dates: foLastDiveList() } : {}
 // When SSU is auto-added (non-split), session[0] = SSU day, sessions[1..n] = main product
 const ssuOffset = (!foSplit && needsRefresher) ? 1 : 0
 // Summary-Chips: europäische Schreibweise (DD.MM.YYYY)
 const fmtEu = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d
 const foPickRequired = foRequired + ssuOffset
 // SSU kommt erst NACH der Datumswahl dazu (Last dive steht weiter unten): dann fehlt ein Tag. Nicht zurück-scrollen lassen —
 // Picker automatisch wieder öffnen und ins Bild holen (einmal pro Auslösung), Fallback-Button steht im SSU-Hinweis.
 const foSsuPromptedRef = useRef(false)
 // Gästezahl 1 2+: das bereits gewählte Last-Dive-Datum gehört Gast 1 — übernehmen statt erneut abzufragen.
 // Ist es älter als 12 Monate, greift derselbe Auto-Split wie bei einer Auswahl in der Gästezeile.
 const foPrevGuestsRef = useRef(foGuests)
 useEffect(() => {
 const prev = foPrevGuestsRef.current
 foPrevGuestsRef.current = foGuests
 if (!(prev <= 1 && foGuests > 1) || foSplit || !foLastDive) return
 const v = foLastDive
 const next = Array.from({ length: foGuests }, (_, i) => (i === 0 ? v : (foGuestLastDives[i] ?? '')))
 setFoGuestLastDives(next)
 setFoLastDive('')
 }, [foGuests]) // eslint-disable-line react-hooks/exhaustive-deps
 // Gruppenmodus mit 2+ Gästen: ist bei IRGENDEINEM Gast der letzte Tauchgang > 12 Monate her automatisch in die Split-Ansicht
 // (egal wie man dorthin kommt: Datum gewählt, Gästezahl erhöht, nach Reduzieren auf 1 und erneutem Erhöhen).
 useEffect(() => {
 if (foSplit || foGuests <= 1) return
 const oldIdx = Array.from({ length: foGuests }, (_, i) => i).filter(i => {
 const d = (foGuestLastDives[i] ?? '').trim()
 return /^\d{4}-\d{2}-\d{2}$/.test(d) && (Date.now() - new Date(d + 'T12:00:00').getTime()) > 365 * 24 * 60 * 60 * 1000
 })
 if (oldIdx.length === 0) return
 const ssuExists = foProductsList.some(p => p.name === 'Scuba Skills Update')
 setFoSplit(true)
 setFoDatePickerOpen(false)
 const who = oldIdx.map(i => i + 1)
 setFoAutoSplitNote(`${who.length === 1 ? `Guest ${who[0]}'s` : `Guests ${who.join(' and ')}'`} last dive was more than 12 months ago, so ${who.length === 1 ? 'that guest gets' : 'those guests get'} a Scuba Skills Update first (pool, no boat) and need${who.length === 1 ? 's' : ''} their own dates. Each guest is booked separately now: check the dates, insurance and equipment per guest below.`)
 setTimeout(() => document.getElementById('fo-split-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
 setFoGuestEntries(Array.from({ length: foGuests }, (_, i) => ({
 firstName: '', lastName: '', email: '',
 product: oldIdx.includes(i) && ssuExists ? 'Scuba Skills Update' : foProduct,
 sessions: [...foSessionsPicked], insurance: null, fullEquipment: false, equipmentItems: [], addonItems: [], addonDays: {},
 lastDive: (foGuestLastDives[i] ?? '').trim(), residential: false, extraItems: [],
 })))
 }, [foGuests, foSplit, foGuestLastDives]) // eslint-disable-line react-hooks/exhaustive-deps
 // Gästezahl im Split-Modus auf 1 reduziert zurück in die Einzelansicht (Split gibt es nur ab 2 Gästen) und Viewport nach oben
 useEffect(() => {
 if (foGuests > 1 || !foSplit) return
 const carried = (foGuestEntries[0]?.lastDive || foGuestLastDives[0] || '').trim()
 setFoSplit(false)
 setFoGuestEntries([])
 setFoAutoSplitNote(null)
 if (carried && !foLastDive) setFoLastDive(carried)
 setFoDatePickerOpen(false)
 setTimeout(() => document.getElementById('fo-split-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
 }, [foGuests]) // eslint-disable-line react-hooks/exhaustive-deps
 // Last-dive-Picker klappt nach unten auf: Viewport mitnehmen, damit der ganze Kalender sichtbar ist (Header ist sticky)
 const foRevealPicker = (el: HTMLElement | null) => {
 if (!el) return
 el.style.scrollMarginTop = '150px'
 setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
 }
 // Dive-Date-Picker: ganzer Kalender im Blick, auch wenn er je nach Monat (5 oder 6 Wochen) unterschiedlich hoch ist.
 // Beobachtet die Höhe und scrollt bei Bedarf nach unten, ohne den Kopf unter den sticky Header zu schieben.
 const foPickerRef = (el: HTMLDivElement | null) => {
 if (!el || (el as any).__fit) return
 ;(el as any).__fit = true
 const fit = () => {
 const r = el.getBoundingClientRect()
 const overflow = r.bottom - (window.innerHeight - 16)
 const room = r.top - 150
 if (overflow > 0 && room > 0) window.scrollBy({ top: Math.min(overflow, room), behavior: 'smooth' })
 }
 setTimeout(fit, 120)
 if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => setTimeout(fit, 60)).observe(el)
 }
 const foOpenDatePicker = () => {
 setFoDatePickerOpen(true)
 setTimeout(() => document.getElementById('fo-date-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
 }
 useEffect(() => {
 if (!needsRefresher || foSplit) { foSsuPromptedRef.current = false; return }
 if (foSessionsPicked.length > 0 && foSessionsPicked.length < foPickRequired && !foSsuPromptedRef.current) {
 foSsuPromptedRef.current = true
 foOpenDatePicker()
 }
 }, [needsRefresher, foSplit, foSessionsPicked.length, foPickRequired]) // eslint-disable-line react-hooks/exhaustive-deps
 const foDate = foSessionsPicked[ssuOffset]?.date ?? ''
 const foSession = (foSessionsPicked[ssuOffset]?.session?.toUpperCase() ?? 'AM') as 'AM' | 'PM' | 'NIGHT'
 // Split: erster Gast, erste Session
 const firstPickedDate = foSplit
 ? (foGuestEntries[0]?.sessions[0]?.date ?? null)
 : (foSessionsPicked[0]?.date ?? null)
 const refresherDate = firstPickedDate

 // --- Insurance & Equipment helpers ---
 const INSURANCE_PLAN_PRICE: Record<string, number> = { 'insurance-1d': 10, 'insurance-3d': 23, 'insurance-5d': 30, 'insurance-7d': 38, 'insurance-10d': 48 }
 function computeGuestInsuranceCost(sessions: Picked[]): number {
 const dates = [...new Set(sessions.map((s2: Picked) => s2.date))]
 const blocks = computeInsuranceBlocks(dates)
 return blocks.reduce((sum, b) => sum + (INSURANCE_PLAN_PRICE[b.planId] ?? 0) * b.units, 0)
 }
 const equipProductsList = foProductsList.filter(p => p.category === 'equipment')
 const fullEquipProduct = equipProductsList.find(p => p.id === 'rental-full-double') ?? equipProductsList.find(p => /full.?equip/i.test(p.name))
 const individualEquipProducts = fullEquipProduct ? equipProductsList.filter(p => p !== fullEquipProduct) : equipProductsList
 // Items NOT covered by Full Equipment — can still be added on top
 const FULL_EQUIP_EXTRAS = ['15L Tank', 'Torch', 'Gloves']
 const addonProductsList = foProductsList.filter(p => p.category === 'addon')
 // Equipment-Inklusiv-Regel (course_prices.equipment_included): bei Einsteigerkursen + SSU keine Miete anbieten.
 // Zahlbare Extras bleiben: Torch, 15L Tank, Gloves — und Computer, wenn er nicht inkludiert ist.
 const equipRuleFor = (productName: string) => {
 const p = foProductsList.find(x => x.name === productName)
 const included = !!p?.equipmentIncluded
 const extras = included ? individualEquipProducts.filter(ep => FULL_EQUIP_EXTRAS.includes(ep.name) || (ep.name === 'Computer' && !p?.computerIncluded)) : individualEquipProducts
 return { included, computerIncluded: !!p?.computerIncluded, extras }
 }
 const groupEquipRule = equipRuleFor(foProduct)
 // Produktwechsel auf einen Inklusiv-Kurs: Full Equipment und nicht-erlaubte Mietteile aus dem State werfen,
 // sonst würden sie unsichtbar weiterberechnet.
 useEffect(() => {
 if (!groupEquipRule.included) return
 const allowed = new Set(groupEquipRule.extras.map(e => e.name))
 if (foGroupFullEquipment) setFoGroupFullEquipment(false)
 if (foGroupEquipmentItems.some(x => !allowed.has(x))) setFoGroupEquipmentItems(foGroupEquipmentItems.filter(x => allowed.has(x)))
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [foProduct, groupEquipRule.included])
 useEffect(() => {
 if (!foSplit || foGuestEntries.length === 0) return
 let changed = false
 const next = foGuestEntries.map(e => {
 const r = equipRuleFor(e.product)
 if (!r.included) return e
 const allowed = new Set(r.extras.map(x => x.name))
 const items = e.equipmentItems.filter(x => allowed.has(x))
 if (!e.fullEquipment && items.length === e.equipmentItems.length) return e
 changed = true
 return { ...e, fullEquipment: false, equipmentItems: items }
 })
 if (changed) setFoGuestEntries(next)
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [foSplit, foGuestEntries.map(e => e.product).join('|'), foProductsList.length])
 function computeEquipCost(items: string[], residential?: boolean): number {
 return items.reduce((sum, name) => {
 const p = foProductsList.find(x => x.name === name)
 return sum + getEP(p, residential)
 }, 0)
 }

 // Muss VOR den Summen stehen (const-TDZ: sonst „Cannot access before initialization“ im Split-Modus)
 const geExtraCost = (ge: GuestEntry) => (ge.extraItems ?? []).reduce((s2, name) => s2 + getEP(foProductsList.find(x => x.name === name), ge.residential), 0)
 // Grand totals for summary + submit
 const totalBaseAmount = foSplit
 ? foGuestEntries.reduce((sum, e) => sum + getEP(foProductsList.find(p => p.name === e.product), e.residential), 0)
 : getEP(selectedProduct) * foGuests
 const totalInsuranceCost = foSplit
 ? foGuestEntries.reduce((sum, e) => sum + (e.insurance === 'add' ? computeGuestInsuranceCost(e.sessions) : 0), 0)
 : (foGroupInsurance === 'add' ? computeGuestInsuranceCost(foSessionsPicked) * foGuests : 0)
 const foGroupNumDays = new Set(foSessionsPicked.map(s => s.date)).size || 1
 const totalEquipCost = foSplit
 ? foGuestEntries.reduce((sum, e) => {
 const numDays = new Set(e.sessions.map((s2: Picked) => s2.date)).size || 1
 if (e.fullEquipment && fullEquipProduct) return sum + getEP(fullEquipProduct, e.residential) * numDays
 return sum + computeEquipCost(e.equipmentItems, e.residential) * numDays
 }, 0)
 : (foGroupFullEquipment && !groupEquipRule.included && fullEquipProduct
 ? (getEP(fullEquipProduct) + computeEquipCost(foGroupEquipmentItems)) * foGuests * foGroupNumDays
 : computeEquipCost(foGroupEquipmentItems) * foGuests * foGroupNumDays)
 const totalAddonCost = foSplit
 ? foGuestEntries.reduce((sum, e) => {
 const numDays = new Set(e.sessions.map((s2: Picked) => s2.date)).size || 1
 return sum + e.addonItems.reduce((s2, name) => {
 const p = foProductsList.find(x => x.name === name); return s2 + getEP(p, e.residential) * numDays
 }, 0) + geExtraCost(e)
 }, 0)
 : (() => {
 return foGroupAddonItems.reduce((s2, name) => {
 const p = foProductsList.find(x => x.name === name)
 const days = foGroupAddonDays[name]
 const numDays = (days && days.length > 0) ? days.length : foGroupNumDays
 return s2 + getEP(p) * foGuests * numDays
 }, 0)
 })()
 const totalExtrasCost = foExtraLines.reduce((sum, line) => {
 const p = foProductsList.find(x => x.name === line.product)
 return sum + getEP(p)
 }, 0)
 const totalCustomCost = foCustomLines.reduce((sum, l) => sum + (l.amount || 0), 0)
 // Auto-add Scuba Skills Update when last dive > 12 months (non-split mode only; split handles it per guest)
 const ssuProduct = (!foSplit && needsRefresher) ? foProductsList.find(p => p.name === 'Scuba Skills Update') : undefined
 // booking_extras für den Gruppenmodus (Zahlungslink UND Direktbuchung) — eine Quelle,
 // damit die FO-Buchungsübersicht in beiden Fällen Versicherung/Equipment/Add-ons strukturiert sieht.
 // Walk-in mit „ TBD"-Sessions: Instructor-Ticket über die API anlegen (idempotent, service role)
 async function requestInstructorTicket(bookingId: string, sessions: { session: string }[]) {
 if (!sessions.some(x => x.session.toLowerCase() === 'tbd')) return
 try {
 const authTok = (await supabase.auth.getSession()).data.session?.access_token
 const r = await fetch('/api/bookings/instructor-ticket', {
 method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${authTok ?? ''}` },
 body: JSON.stringify({ booking_id: bookingId }),
 })
 if (!r.ok) { const d = await r.json().catch(() => ({})); alert(`Booking saved, but the instructor ticket failed: ${r.status} ${d.error ?? ''}`) }
 } catch (e) { alert(`Booking saved, but the instructor ticket failed: ${e instanceof Error ? e.message : String(e)}`) }
 }
 const buildGroupBookingExtras = (): { booking_extras?: Record<string, unknown> } => {
 const ex: Record<string, unknown> = {}
 if (foGroupInsurance === 'add') {
 // computeGuestInsuranceCost gibt EUR zurück in Cents umrechnen
 const insCostPerDiverEur = computeGuestInsuranceCost(foSessionsPicked)
 ex.insurance = {
 product_id: 'dan-insurance',
 name: 'DAN Dive Insurance',
 per_diver_cents: Math.round(insCostPerDiverEur * 100),
 guests: foGuests,
 total_cents: Math.round(insCostPerDiverEur * foGuests * 100),
 }
 }
 const eqItems: unknown[] = []
 if (foGroupFullEquipment && !groupEquipRule.included && fullEquipProduct) {
 eqItems.push({
 product_id: fullEquipProduct.id,
 name: fullEquipProduct.name,
 quantity: foGuests * foGroupNumDays,
 unit_price_cents: Math.round(getEP(fullEquipProduct) * 100),
 total_cents: Math.round(getEP(fullEquipProduct) * foGuests * foGroupNumDays * 100),
 })
 }
 for (const eqName of foGroupEquipmentItems) {
 const ep = equipProductsList.find(x => x.name === eqName)
 if (ep) eqItems.push({
 product_id: ep.id,
 name: ep.name,
 quantity: foGuests * foGroupNumDays,
 unit_price_cents: Math.round(getEP(ep) * 100),
 total_cents: Math.round(getEP(ep) * foGuests * foGroupNumDays * 100),
 })
 }
 const addonArr: unknown[] = []
 for (const addonName of foGroupAddonItems) {
 const ap = foProductsList.find(x => x.name === addonName)
 if (!ap) continue
 const adDays = foGroupAddonDays[addonName]
 const numAddonDays = (adDays && adDays.length > 0) ? adDays.length : foGroupNumDays
 addonArr.push({
 product_id: ap.id,
 name: ap.name,
 quantity: foGuests * numAddonDays,
 unit_price_cents: Math.round(getEP(ap) * 100),
 total_cents: Math.round(getEP(ap) * foGuests * numAddonDays * 100),
 })
 }
 // foExtraLines: extras added manually via the extra line picker
 for (const line of foExtraLines) {
 const ep = foProductsList.find(x => x.name === line.product)
 if (!ep) continue
 const unitCents = Math.round(getEP(ep) * 100)
 const item = { product_id: ep.id, name: ep.name, quantity: 1, unit_price_cents: unitCents, total_cents: unitCents }
 if (ep.id.startsWith('rental-')) eqItems.push(item)
 else addonArr.push(item)
 }
 // ssuProduct (Scuba Skills Update): automatisch bei > 12 Monate letztem Tauchgang
 if (ssuProduct) {
 const ssuCentsUnit = Math.round(getEP(ssuProduct) * 100)
 addonArr.push({
 product_id: ssuProduct.id,
 name: ssuProduct.name,
 quantity: 1,
 unit_price_cents: ssuCentsUnit,
 total_cents: ssuCentsUnit,
 })
 }
 if (eqItems.length > 0) ex.equipment = eqItems
 if (addonArr.length > 0) ex.addons = addonArr
 // foCustomLines: freeform Zusatzposten (label + positiver Betrag)
 const customArr: { label: string; amount_cents: number }[] = []
 for (const cl of foCustomLines) {
 if (!cl.label.trim() || cl.amount <= 0) continue
 customArr.push({ label: cl.label.trim(), amount_cents: Math.round(cl.amount * 100) })
 }
 if (customArr.length > 0) ex.custom = customArr
 if (foResidential) ex.discounts = [{ label: 'Residential / Erasmus discount', amount_cents: Math.round(residentialSavingAmount * 100) }]
 return Object.keys(ex).length > 0 ? { booking_extras: ex } : {}
 }
 // booking_extras pro Gast im Split-Modus — gleiche Struktur wie im Gruppenmodus.
 /** Preis der „+ Add item“-Zeilen eines Split-Gasts (Euro) */
 const buildGuestBookingExtras = (ge: GuestEntry): { booking_extras?: Record<string, unknown> } => {
 const ex: Record<string, unknown> = {}
 const nd = new Set(ge.sessions.map(s2 => s2.date)).size || 1
 if (ge.insurance === 'add') {
 const insEur = computeGuestInsuranceCost(ge.sessions)
 ex.insurance = { product_id: 'dan-insurance', name: 'DAN Dive Insurance', per_diver_cents: Math.round(insEur * 100), guests: 1, total_cents: Math.round(insEur * 100) }
 }
 const eqItems: unknown[] = []
 const rule = equipRuleFor(ge.product)
 if (ge.fullEquipment && !rule.included && fullEquipProduct) {
 const unit = Math.round(getEP(fullEquipProduct, ge.residential) * 100)
 eqItems.push({ product_id: fullEquipProduct.id, name: fullEquipProduct.name, quantity: nd, unit_price_cents: unit, total_cents: unit * nd })
 }
 for (const name of ge.equipmentItems) {
 const ep = foProductsList.find(x => x.name === name)
 if (!ep) continue
 const unit = Math.round(getEP(ep, ge.residential) * 100)
 eqItems.push({ product_id: ep.id, name: ep.name, quantity: nd, unit_price_cents: unit, total_cents: unit * nd })
 }
 const addonArr: unknown[] = []
 for (const name of ge.addonItems) {
 const ap = foProductsList.find(x => x.name === name)
 if (!ap) continue
 const unit = Math.round(getEP(ap, ge.residential) * 100)
 addonArr.push({ product_id: ap.id, name: ap.name, quantity: nd, unit_price_cents: unit, total_cents: unit * nd })
 }
 for (const name of ge.extraItems ?? []) {
 const ep = foProductsList.find(x => x.name === name)
 if (!ep) continue
 const unit = Math.round(getEP(ep, ge.residential) * 100)
 const item = { product_id: ep.id, name: ep.name, quantity: 1, unit_price_cents: unit, total_cents: unit }
 if (ep.id.startsWith('rental-')) eqItems.push(item); else addonArr.push(item)
 }
 if (eqItems.length > 0) ex.equipment = eqItems
 if (addonArr.length > 0) ex.addons = addonArr
 if (ge.residential) ex.discounts = [{ label: 'Residential / Erasmus discount', product_id: geProdIdFor(ge.product) }]
 return Object.keys(ex).length > 0 ? { booking_extras: ex } : {}
 }
 const geProdIdFor = (name: string) => foProductsList.find(x => x.name === name)?.id ?? null

 // Versicherungs-Felder auf der Buchung — der Check-in liest bookings.insurance_product_id /
 // insurance_choice, um die Frage „eigene Versicherung?" zu überspringen. Wer DAN schon bezahlt
 // hat, darf nicht noch einmal gefragt werden. (Online setzt der Webhook dieselben Felder.)
 function insuranceFieldsFor(choice: 'add' | 'own' | null, sessions: Picked[], guests: number) {
 if (choice === 'add') {
 const dates = [...new Set(sessions.map(sv => sv.date))]
 const planId = primaryInsurancePlanId(computeInsuranceBlocks(dates)) ?? 'insurance-1d'
 return {
 insurance_choice: 'azd',
 insurance_product_id: planId,
 insurance_amount: Math.round(computeGuestInsuranceCost(sessions) * guests * 100),
 }
 }
 if (choice === 'own') return { insurance_choice: 'own' }
 return {}
 }

 // Bestätigungsmail mit Check-in-Link für Walk-ins ohne Zahlungsaufforderung (Cash).
 // Online-Buchungen bekommen dieselbe Mail aus dem Stripe-Webhook; Bank/Revolut die Zahlungsaufforderung.
 async function sendWalkinConfirmation(bookingId: string, toEmail: string) {
 setFoEmailStatus('sending')
 const authSess = await supabase.auth.getSession()
 const authToken = authSess.data.session?.access_token
 if (!authToken) { setFoEmailStatus('error:no auth token'); return }
 try {
 const r = await fetch('/api/send-booking-confirmation', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${authToken}` },
 body: JSON.stringify({ booking_id: bookingId, to_email: toEmail }),
 })
 const d = await r.json()
 if (r.ok && d.ok) setFoEmailStatus('sent')
 else setFoEmailStatus(`error:${r.status} ${d.error ?? 'unbekannt'}`)
 } catch (e) {
 setFoEmailStatus(`error:${e instanceof Error ? e.message : String(e)}`)
 }
 }
 const ssuCost = ssuProduct ? getEP(ssuProduct) : 0
 const grandTotal = totalBaseAmount + totalInsuranceCost + totalEquipCost + totalAddonCost + totalExtrasCost + totalCustomCost + ssuCost
 // How much was saved by the residential discount (0 when not active)
 const anyResidential = foSplit ? foGuestEntries.some(e => e.residential) : foResidential
 const residentialSavingAmount = !anyResidential ? 0 : (() => {
 const sv = (p: { price: number; residentialPrice?: number } | undefined) =>
 p && p.residentialPrice != null ? p.price - p.residentialPrice : 0
 const eqSv = (items: string[], nd: number) =>
 items.reduce((s, name) => s + sv(foProductsList.find(x => x.name === name)) * nd, 0)
 const baseSv = foSplit
 ? foGuestEntries.reduce((s, e) => s + (e.residential ? sv(foProductsList.find(p => p.name === e.product)) : 0), 0)
 : sv(selectedProduct) * foGuests
 const equipSv = foSplit
 ? foGuestEntries.reduce((s, e) => {
 if (!e.residential) return s
 const nd = new Set(e.sessions.map((ss: Picked) => ss.date)).size || 1
 return s + (e.fullEquipment && fullEquipProduct ? sv(fullEquipProduct) * nd : eqSv(e.equipmentItems, nd))
 }, 0)
 : (foGroupFullEquipment && !groupEquipRule.included && fullEquipProduct
 ? (sv(fullEquipProduct) + eqSv(foGroupEquipmentItems, 1)) * foGuests * foGroupNumDays
 : eqSv(foGroupEquipmentItems, 1) * foGuests * foGroupNumDays)
 const addonSv = foSplit
 ? foGuestEntries.reduce((s, e) => {
 const uniqueDates = [...new Set(e.sessions.map((ss: Picked) => ss.date))]
 const totalDays = uniqueDates.length || 1
 return s + e.addonItems.reduce((s2: number, name: string) => {
 const days = e.addonDays?.[name]; const nd = (days && days.length > 0) ? days.length : totalDays
 return s2 + sv(foProductsList.find(x => x.name === name)) * nd
 }, 0) + (e.extraItems ?? []).reduce((s2: number, name: string) => s2 + sv(foProductsList.find(x => x.name === name)), 0)
 }, 0)
 : foGroupAddonItems.reduce((s2, name) => {
 const days = foGroupAddonDays[name]; const nd = (days && days.length > 0) ? days.length : foGroupNumDays
 return s2 + sv(foProductsList.find(x => x.name === name)) * foGuests * nd
 }, 0)
 const extrasSv = foExtraLines.reduce((s, line) => s + sv(foProductsList.find(x => x.name === line.product)), 0)
 return baseSv + equipSv + addonSv + extrasSv
 })()

 // Validation: alle Gäste komplett ausgefüllt? (inkl. Insurance-Pflichtangabe)
 const allPicked = foSplit
 ? foGuestEntries.length === foGuests && foGuestEntries.every(e => {
 const req = foProductsList.find(p => p.name === e.product)?.sessionsIncluded ?? 1
 const entryInsuranceIncluded = insuranceSkipFor(e.product)
 const entryCat = foProductsList.find(p => p.name === e.product)?.category
 const lastDiveOk = !requiresLastDive(e.product, entryCat) || /^\d{4}-\d{2}-\d{2}$/.test(e.lastDive ?? '')
 return e.firstName.trim() && e.lastName.trim() && e.email.trim() && e.product && e.sessions.length >= req && (entryInsuranceIncluded || e.insurance !== null) && lastDiveOk
 })
 : foSessionsPicked.length >= foPickRequired && (insuranceSkip || foGroupInsurance !== null)
 // Name pro Gast ist Pflicht (sonst steht auf der Bootskarte „Seat 2" bzw. kein Name)
 && Array.from({ length: foGuests }, (_, i) => (i === 0 ? (foGuestNames[0] || foName) : foGuestNames[i]) ?? '').every(n => n.trim().length > 0)
 // Letzter Tauchgang pro Gast Pflicht bei Produkten mit Vorzertifikat — sonst fragt der Check-in erneut
 && (!requiresLastDive(foProduct, selectedProduct?.category) || Array.from({ length: foGuests }, (_, i) => (foGuests <= 1 ? foLastDive : (foGuestLastDives[i] ?? ''))).every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))

 // Was fehlt noch? Konkret benennen statt „Fill in all required fields" (sonst Rätselraten, welches Feld gemeint ist)
 const foMissing: string[] = (() => {
 const m: string[] = []
 const dateOk = (d: string | undefined | null) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')
 if (foSplit) {
 if (foGuestEntries.length !== foGuests) m.push(`guest details (${foGuestEntries.length} of ${foGuests} guests added)`)
 foGuestEntries.forEach((e, i) => {
 const g = `Guest ${i + 1}`
 const req = foProductsList.find(p => p.name === e.product)?.sessionsIncluded ?? 1
 const cat = foProductsList.find(p => p.name === e.product)?.category
 if (!e.firstName.trim() || !e.lastName.trim()) m.push(`${g}: name`)
 if (!e.email.trim()) m.push(`${g}: email`)
 if (!e.product) m.push(`${g}: product`)
 else {
 if (e.sessions.length < req) m.push(`${g}: dive dates (${e.sessions.length} of ${req})`)
 if (!insuranceSkipFor(e.product) && e.insurance === null) m.push(`${g}: insurance choice`)
 if (requiresLastDive(e.product, cat) && !dateOk(e.lastDive)) m.push(`${g}: last dive date`)
 }
 })
 } else {
 if (foSessionsPicked.length < foPickRequired) m.push(`dive dates (${foSessionsPicked.length} of ${foPickRequired})`)
 if (!insuranceSkip && foGroupInsurance === null) m.push('insurance choice')
 {
 const noName = Array.from({ length: foGuests }, (_, i) => i).filter(i => !((i === 0 ? (foGuestNames[0] || foName) : foGuestNames[i]) ?? '').trim())
 if (noName.length) m.push(foGuests <= 1 ? 'guest name' : `name of guest ${noName.map(i => i + 1).join(', ')}`)
 }
 if (requiresLastDive(foProduct, selectedProduct?.category)) {
 const noDive = Array.from({ length: foGuests }, (_, i) => i).filter(i => !dateOk(foGuests <= 1 ? foLastDive : (foGuestLastDives[i] ?? '')))
 if (noDive.length) m.push(foGuests <= 1 ? 'last dive date' : `last dive date of guest ${noDive.map(i => i + 1).join(', ')}`)
 }
 }
 if (!foEmail.trim()) m.push('email')
 if (!foPhone.trim()) m.push('phone')
 if (!foPayment) m.push('payment method')
 return m
 })()

 // Which Stripe account is the server really talking to? Read from the loaded
 // key, not from a setting — the failure we are guarding against is going live
 // with a test key still in place.
 useEffect(() => {
 supabase.auth.getSession().then(({ data }) => {
 const token = data.session?.access_token
 if (!token) return
 fetch('/api/stripe-mode', { headers: { Authorization: `Bearer ${token}` } })
 .then(r => r.ok ? r.json() : null)
 .then(d => { if (d) setStripeMode(d) })
 .catch(() => {})
 })
 }, [])

 useEffect(() => {
 if (foSection !== 'dan') return
 setDanLoading(true)
 setDanMsg(null)
 supabase.auth.getSession().then(async ({ data: { session: s } }) => {
 const url = danTestMode ? '/api/admin/dan-export?test=1' : '/api/admin/dan-export'
 const res = await fetch(url, {
 headers: { Authorization: `Bearer ${s?.access_token}` },
 })
 if (res.ok) { const d = await res.json(); setDanInfo(d) }
 else { setDanMsg('Could not load DAN export data') }
 setDanLoading(false)
 })
 }, [foSection, danTestMode])

 async function startSimulatedCheckout() {
 if (!selectedProduct || !foDate) return
 setSimLoading(true); setSimError(null)
 try {
 const staffTokenSim = (await supabase.auth.getSession()).data.session?.access_token
 if (!staffTokenSim) throw new Error('Session expired — please sign in again (sandbox bookings need a staff login).')
 const res = await fetch('/api/checkout', {
 method: 'POST',
 headers: { 'content-type': 'application/json', ...(staffTokenSim ? { authorization: `Bearer ${staffTokenSim}` } : {}) },
 body: JSON.stringify({
 product_id: selectedProduct.id,
 booking_date: foDate,
 session: foSession.toLowerCase(),
 group_size: foGuests,
 customer_email: foEmail.trim() || undefined,
 terms_accepted: true,
 is_test: true,
 ...foLastDivePayload(),
 ...(ssuProduct && foSessionsPicked[0]?.date ? { refresher_date: foSessionsPicked[0].date } : {}),
 }),
 })
 const data = await res.json()
 if (!res.ok || !data.url) {
 setSimError(data.error ?? 'Could not start checkout.')
 setSimLoading(false)
 return
 }
 window.location.href = data.url
 } catch {
 setSimError('Network error — please try again.')
 setSimLoading(false)
 }
 }

 function openGuestView() {
 const params = new URLSearchParams()
 if (selectedProduct?.id) params.set('product', selectedProduct.id)
 if (foDate) params.set('date', foDate)
 params.set('session', foSession.toLowerCase())
 params.set('guests', String(foGuests))
 if (foEmail.trim()) params.set('email', foEmail.trim())
 if (isSim) params.set('sandbox', '1') // Simulator = immer Stripe-Testkonto (Server prüft Token + Rolle); Production = echte Buchung mit echtem Geld
 window.open('/dive-os/book?' + params.toString(), '_blank', 'noopener')
 }

 return (
 <div style={{ background: s.bgDark, minHeight: '100vh', padding: isMobile ? '12px 14px 40px' : '14px 40px 60px' }}>
 <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
 {/* Kein Seitenkopf (Lucas 30.10.): Überschrift, Untertitel und „ Dashboard" entfallen, die Navigation steht oben */}

 {/* ── Section tabs ── */}
 <div style={{ display: 'flex', borderBottom: '1px solid rgba(243,239,230,.2)', marginBottom: '12px', flexWrap: 'wrap' }}>
 {([['new', ' New Booking'], ['history', ' Booking History'], ['requests', ` Booking Requests${foOpenRequests ? ` (${foOpenRequests})` : ''}`], ['cash', ` Cash refunds${foCashRefunds ? ` (${foCashRefunds})` : ''}`], ['dan', ' DAN Export']] as const).map(([key, label]) => (
 <button key={key} type="button" onClick={() => { setFoOpenBookingId(null); setFoSection(key); localStorage.setItem('azd_foTab', key) }} style={{
 padding: '9px 20px', fontSize: '14px', fontWeight: 500, border: 'none', background: 'transparent', cursor: 'pointer', letterSpacing: '.06em', fontFamily: s.font,
 color: foSection === key ? s.accent : s.muted,
 borderBottom: foSection === key ? `2px solid ${s.accent}` : '2px solid transparent',
 }}>{label}</button>
 ))}
 </div>

 {foSection === 'new' && (<>
 {/* ── Sub-tabs ── */}
 {false && (
 <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 {([['walkin', ' Quick Booking'], ['simulator', ' Simulator']] as const).map(([key, label]) => (
 <button key={key} type="button" onClick={() => setFoTab(key)} style={{
 padding: '10px 18px', border: 'none', cursor: 'pointer', fontFamily: s.font,
 fontSize: '14px', fontWeight: 500,
 background: 'transparent',
 color: foTab === key ? s.accent : s.muted,
 borderBottom: `2px solid ${foTab === key ? s.accent : 'transparent'}`,
 marginBottom: '-1px',
 }}>{label}</button>
 ))}
 </div>
 )}


 {/* Stripe mode — only shown in the Simulator */}
 {foTab === 'simulator' && (
 <div style={{
 display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'nowrap',
 marginBottom: '20px', padding: '14px 18px', borderRadius: 0,
 background: stripeMode?.mode === 'live' ? 'rgba(201,146,140,.12)' : stripeMode?.mode === 'test' ? 'rgba(183,196,176,.1)' : 'rgba(255,255,255,.04)',
 border: `1px solid ${stripeMode?.mode === 'live' ? 'rgba(201,146,140,.45)' : stripeMode?.mode === 'test' ? 'rgba(183,196,176,.35)' : 'rgba(255,255,255,.1)'}`,
 }}>
 <span style={{ fontSize: '18px', lineHeight: 1.2 }}>{stripeMode?.mode === 'live' ? '' : stripeMode?.mode === 'test' ? '' : ''}</span>
 <div style={{ lineHeight: 1.5 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: stripeMode?.mode === 'live' ? '#c9928c' : stripeMode?.mode === 'test' ? '#b7c4b0' : s.muted }}>
 {stripeMode === null ? 'Checking Stripe mode…'
 : stripeMode.test_key_configured ? 'Stripe sandbox — no real money'
 : stripeMode.mode === 'live' ? 'Stripe is LIVE — and no test key is set: online checkout is disabled here'
 : stripeMode.mode === 'test' ? 'Stripe sandbox — no real money'
 : 'Stripe not configured'}
 </div>
 <div style={{ fontSize: '14px', color: s.muted }}>
 Everything created in this tab is flagged as test data — visible to admins only, never invoiced.
 {(stripeMode?.mode === 'test' || stripeMode?.test_key_configured) && <> Online checkout uses test card <code style={{ background: 'rgba(0,0,0,.35)', padding: '1px 5px', borderRadius: 0 }}>4242 4242 4242 4242</code>, any future expiry, any CVC.</>}
 {stripeMode?.mode === 'live' && !stripeMode?.test_key_configured && <span style={{ color: '#c9928c' }}> Careful: online checkout would charge a real card.</span>}
 {stripeMode && !stripeMode.webhook_configured && <span style={{ color: '#d4a07a' }}> No webhook secret set — online bookings will not be created after payment.</span>}
 </div>
 </div>
 </div>
 )}

 {/* Same booking interface in both tabs — one piece of code, so the
 Simulator can never drift away from what staff actually uses.
 The tab decides what a booking means: real, or test data. */}
 {(foTab === 'walkin' || foTab === 'simulator') && (
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: isMobile ? '16px' : '20px', alignItems: 'start' }}>

 {/* Left: Form */}
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '28px' }}>
 {foSubmitted ? (
 <div style={{ padding: '8px 0' }}>
 <div style={{ textAlign: 'center', marginBottom: '28px' }}>
 <div style={{ fontSize: '48px', marginBottom: '12px' }}></div>
 <div style={{ fontSize: '19px', fontWeight: 500, color: s.text, marginBottom: '6px' }}>{isSim ? 'Test booking created' : 'Booking created'}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{foName || 'Guest'} · {foProduct} · {foDate} {foSession} · {foGuests} guest{foGuests > 1 ? 's' : ''}</div>
 </div>
 {foPayDecide && <PaymentDecision bookingIds={foPayDecide} sendRequest requestDeposit={foDepositOnly} onDone={(note, failed) => { setFoPayNote(note); setFoPayReqFailed(failed); setFoPayDecide(null) }} />}
 {!foPayDecide && <PaymentRequestRetry items={foPayReqFailed} isDeposit={foDepositOnly} />}
 {foPayNote && <div style={{ fontSize: '14px', color: '#b7c4b0', background: 'rgba(183,196,176,.08)', border: '1px solid rgba(183,196,176,.3)', borderRadius: 0, padding: '10px 12px', marginBottom: '16px' }}>Payment status saved: {foPayNote}</div>}
 {!foPayDecide && (<>
 {foCreatedBookingId && (
 <button type="button" onClick={() => { setFoOpenBookingId(foCreatedBookingId); setFoSection('history'); try { localStorage.setItem('azd_foTab', 'history') } catch {} }}
 style={{ display: 'block', width: '100%', marginBottom: '16px', padding: '10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.4)', background: 'rgba(243,239,230,.08)', color: s.accent, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
 Open this booking in Booking History 
 </button>
 )}

 {foLinkUrl && (() => {
 const waLinkStripe = `https://wa.me/?text=${encodeURIComponent(`Here is your payment link for ${foProduct} on ${foDate}: ${foLinkUrl}`)}`
 return (
 <div style={{ background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '18px', marginBottom: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '10px' }}> Payment Link</div>
 <div style={{ background: '#000', borderRadius: 0, padding: '10px 12px', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', color: s.accent, wordBreak: 'break-all', marginBottom: '12px', userSelect: 'all' }}>
 {foLinkUrl}
 </div>
 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
 <button
 onClick={() => { navigator.clipboard.writeText(foLinkUrl!).then(() => { setFoLinkCopied(true); setTimeout(() => setFoLinkCopied(false), 2000) }) }}
 style={{ padding: '8px 14px', borderRadius: 0, border: `1px solid ${foLinkCopied ? 'rgba(183,196,176,.5)' : 'rgba(243,239,230,.3)'}`, background: foLinkCopied ? 'rgba(183,196,176,.12)' : 'rgba(243,239,230,.1)', color: foLinkCopied ? '#b7c4b0' : s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}
 >{foLinkCopied ? ' Copied' : ' Copy'}</button>
 <a href={waLinkStripe} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid rgba(183,196,176,.4)', background: 'rgba(183,196,176,.1)', color: '#c9c2b6', fontSize: '14px', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
 <span></span> Send via WhatsApp
 </a>
 <button onClick={() => { setFoSubmitted(false); setFoCreatedBookingId(null); setFoLinkUrl(null); setFoLinkCopied(false) }} style={{ padding: '8px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 New booking
 </button>
 </div>
 </div>
 )
 })()}
 {/* Email-Status Toast */}
 {foEmailStatus && (
 <div style={{
 padding: '10px 14px', borderRadius: 0, marginBottom: '12px', fontSize: '14px', fontWeight: 500,
 background: foEmailStatus === 'sending' ? 'rgba(255,200,50,.08)' : foEmailStatus === 'sent' ? 'rgba(183,196,176,.1)' : 'rgba(201,146,140,.1)',
 border: `1px solid ${foEmailStatus === 'sending' ? 'rgba(255,200,50,.25)' : foEmailStatus === 'sent' ? 'rgba(183,196,176,.3)' : 'rgba(201,146,140,.3)'}`,
 color: foEmailStatus === 'sending' ? '#c9b48a' : foEmailStatus === 'sent' ? '#b7c4b0' : '#c9928c',
 }}>
 {foEmailStatus === 'sending' ? (foPayment === 'cash' ? ' Sending confirmation + check-in link…' : ' Sending payment request…') :
 foEmailStatus === 'sent' ? (foPayment === 'cash' ? ' Confirmation + check-in link sent' : ' Payment request sent') :
 ` Email error: ${foEmailStatus.replace('error:', '')}`}
 </div>
 )}

 {foCheckinToken && (() => {
 const checkinUrl = `https://azoresdiving.com/checkin?token=${foCheckinToken}`
 const waLink = `https://wa.me/?text=${encodeURIComponent(`Here is your check-in link for ${foProduct} on ${foDate}: ${checkinUrl}`)}`
 return (
 <div style={{ background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '18px', marginBottom: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '10px' }}>Check-in Link</div>
 <div style={{ background: '#000', borderRadius: 0, padding: '10px 12px', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', color: s.accent, wordBreak: 'break-all', marginBottom: '12px', userSelect: 'all' }}>
 {checkinUrl}
 </div>
 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
 <button
 onClick={() => {
 navigator.clipboard.writeText(checkinUrl).then(() => {
 setFoCopied(true)
 setTimeout(() => setFoCopied(false), 2000)
 })
 }}
 style={{ padding: '9px 16px', borderRadius: 0, border: `1px solid rgba(243,239,230,.3)`, background: foCopied ? 'rgba(243,239,230,.15)' : 'transparent', color: s.accent, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}
 >
 {foCopied ? ' Copied!' : ' Copy link'}
 </button>
 <a
 href={waLink}
 target="_blank"
 rel="noopener noreferrer"
 style={{ padding: '9px 16px', borderRadius: 0, border: '1px solid rgba(183,196,176,.3)', background: 'transparent', color: '#c9c2b6', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
 >
 Send via WhatsApp
 </a>
 </div>
 </div>
 )
 })()}


 <button onClick={() => { setFoSubmitted(false); setFoCreatedBookingId(null); setFoPayment(''); setFoPayDecide(null); setFoPayNote(null); setFoPayReqFailed([]); setFoLinkUrl(null); setFoLinkCopied(false); setFoName(''); setFoNotes(''); setFoNif(''); setFoSessionsPicked([]); setFoGuests(1); setFoCheckinToken(null); setFoCopied(false); setFoLastDive(''); setFoLastDiveOpen(false); setFoSplit(false); setFoGuestEntries([]); setFoGuestNames([]); setFoGroupInsurance(null); setFoGroupFullEquipment(false); setFoGroupEquipmentItems([]); setFoGroupAddonItems([]); setFoGroupAddonDays({}); setFoAddonPickerOpen(null); setFoGuestAddonPickerOpen(null); setFoCustomLines([]); setFoExtraLines([]); setFoResidential(false); setFoEmailStatus(null) }}
 style={{ width: '100%', padding: '12px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>
 + New booking
 </button>
 </>)}
 </div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Product</div>
 <select value={foProduct} onChange={e => {
 const nextName = e.target.value
 // Night Dive Tagesprodukt: gewählte Tage passen nicht zum neuen Session-Typ zurücksetzen
 const wasNight = isNightProduct(selectedProduct)
 const willNight = isNightProduct(foProductsList.find(p => p.name === nextName))
 if (wasNight !== willNight) setFoSessionsPicked([])
 setFoProduct(nextName)
 }} style={{ width: '100%', background: '#121210', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '11px 13px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none' }}>
 {['dives','entry','specialty','pro','ecology','equipment','extras','insurance'].map(cat => {
 const rawCatItems = foProductsList.filter(p => p.category === cat)
 if (!rawCatItems.length) return null
 const catItems = cat !== 'dives' ? rawCatItems : rawCatItems.slice().sort((a, b) => {
 const rank = (n: string) => n.startsWith('Daily Double') ? 0 : /^\d/.test(n) ? parseInt(n, 10) : n.startsWith('Night') ? 900 : n.startsWith('Single') ? 999 : 500
 return rank(a.name) - rank(b.name)
 })
 const catLabel: Record<string,string> = { dives: 'Dive Packages', entry: 'Entry & Core', specialty: 'Specialties', pro: 'Safety & Pro', ecology: 'Ecology', equipment: 'Equipment', extras: 'Extras & Sites', insurance: 'Insurance' }
 return <optgroup key={cat} label={catLabel[cat] ?? cat}>{catItems.map(p => <option key={p.id} value={p.name}>{p.name} — €{p.price}</option>)}</optgroup>
 })}
 </select>
 </div>

 {/* Date + Session combined popup picker */}
 <div>
 <div id="fo-split-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', scrollMarginTop: '150px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted }}>Date &amp; Session</div>
 {foGuests > 1 && (
 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: foSplit ? s.accent : s.muted, cursor: 'pointer', userSelect: 'none' }}>
 <input
 type="checkbox"
 checked={foSplit}
 onChange={e => {
 const on = e.target.checked
 setFoAutoSplitNote(null)
 setFoSplit(on)
 setFoDatePickerOpen(false)
 if (on) {
 setFoGuestEntries(Array.from({ length: foGuests }, () => ({ firstName: '', lastName: '', email: '', product: foProduct, sessions: [], insurance: null, fullEquipment: false, equipmentItems: [], addonItems: [], addonDays: {}, lastDive: '', residential: false, extraItems: [] })))
 setFoSessionsPicked([])
 } else {
 setFoGuestEntries([])
 }
 }}
 style={{ accentColor: s.accent, width: '13px', height: '13px', cursor: 'pointer' }}
 />
 Split per guest
 </label>
 )}
 </div>

 {foSplit ? (
 /* ── Per-Gast: Name + Email + Produkt + Sessions ── */
 <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
 {foAutoSplitNote && (
 <div role="status" style={{ padding: '12px 14px', borderRadius: 0, background: 'rgba(212,160,122,.12)', border: '1px solid rgba(212,160,122,.45)', color: '#d4a07a', fontSize: '14px', lineHeight: 1.55, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
 <div style={{ flex: 1 }}> <b>Switched to “Split per guest”.</b> {foAutoSplitNote}</div>
 <button type="button" onClick={() => setFoAutoSplitNote(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#d4a07a', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
 </div>
 )}
 {Array.from({ length: foGuests }, (_, gi) => {
 const entry: GuestEntry = foGuestEntries[gi] ?? { firstName: '', lastName: '', email: '', product: foProduct, sessions: [], insurance: null, fullEquipment: false, equipmentItems: [], addonItems: [], addonDays: {}, lastDive: '', residential: false, extraItems: [] }
 const entryProduct = foProductsList.find(p => p.name === entry.product)
 const entryRequired = entryProduct?.sessionsIncluded ?? 1
 const gOpen = foDatePickerOpen === (gi as unknown as boolean)
 const gComplete = entry.sessions.length >= entryRequired
 const updateEntry = (patch: Partial<GuestEntry>) => {
 setFoGuestEntries(prev => {
 const updated = [...prev]
 while (updated.length <= gi) updated.push({ firstName: '', lastName: '', email: '', product: foProduct, sessions: [], insurance: null, fullEquipment: false, equipmentItems: [], addonItems: [], addonDays: {}, lastDive: '', residential: false, extraItems: [] })
 updated[gi] = { ...updated[gi], ...patch }
 return updated
 })
 }
 return (
 <div key={gi} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '12px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: gComplete && entry.firstName && entry.lastName && entry.email ? s.accent : s.muted, marginBottom: '10px' }}>
 Guest {gi + 1}{entry.firstName ? ` — ${entry.firstName} ${entry.lastName}` : ''}
 </div>
 <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
 <input placeholder="First name" value={entry.firstName} onChange={e => updateEntry({ firstName: e.target.value })}
 style={{ flex: 1, background: '#121210', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, padding: '8px 10px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none' }} />
 <input placeholder="Last name" value={entry.lastName} onChange={e => updateEntry({ lastName: e.target.value })}
 style={{ flex: 1, background: '#121210', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, padding: '8px 10px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none' }} />
 </div>
 <input placeholder="Email" type="email" value={entry.email} onChange={e => updateEntry({ email: e.target.value })}
 style={{ width: '100%', boxSizing: 'border-box', background: '#121210', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, padding: '8px 10px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none', marginBottom: '8px' }} />
 <select value={entry.product} onChange={e => updateEntry({ product: e.target.value, sessions: [] })}
 style={{ width: '100%', background: '#121210', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '8px 10px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none', marginBottom: '8px' }}>
 {['dives','entry','specialty','pro','ecology','equipment','extras','insurance'].map(cat => {
 const catItems = foProductsList.filter(p => p.category === cat)
 if (!catItems.length) return null
 const catLabel: Record<string,string> = { dives: 'Dive Packages', entry: 'Entry & Core', specialty: 'Specialties', pro: 'Safety & Pro', ecology: 'Ecology', equipment: 'Equipment', extras: 'Extras & Sites', insurance: 'Insurance' }
 return <optgroup key={cat} label={catLabel[cat] ?? cat}>{catItems.map(p => <option key={p.id} value={p.name}>{p.name} — €{p.price}</option>)}</optgroup>
 })}
 </select>
 <div style={{ position: 'relative' }}>
 <button type="button" onClick={() => setFoDatePickerOpen(prev => prev === (gi as unknown as boolean) ? false : (gi as unknown as boolean))}
 style={{ width: '100%', background: '#121210', border: `1px solid ${gOpen ? 'rgba(243,239,230,.4)' : gComplete ? 'rgba(243,239,230,.25)' : 'rgba(255,255,255,.12)'}`, borderRadius: 0, padding: '8px 10px', fontSize: '14px', color: entry.sessions.length > 0 ? s.text : s.muted, fontFamily: s.font, outline: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
 <span style={{ flex: 1 }}>{entry.sessions.length > 0 ? entry.sessions.map(p => `${p.date} · ${p.session.toUpperCase()}`).join(' · ') : 'Select date and session…'}</span>
 <span style={{ fontSize: '14px', opacity: 0.5 }}></span>
 </button>
 {gOpen && (
 <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, background: '#000', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, padding: '18px', minWidth: '640px', maxWidth: '780px', boxShadow: 'none' }} ref={foPickerRef}>
 <SessionPicker staffMode required={entryRequired} seats={1} picked={entry.sessions}
 mode={isNightProduct(foProductsList.find(p => p.name === entry.product)) ? 'night' : 'boat'}
 allowTbd={['entry','specialty','ecology','pro'].includes(foProductsList.find(p => p.name === entry.product)?.category ?? '')}
 onChange={next => {
 // Divemaster / Dive Guide: nur Starttag, Session TBD — der Instructor verteilt die Wochen per Ticket
 const prog = isProgramProduct(foProductsList.find(p => p.name === entry.product)?.id)
 updateEntry({ sessions: prog ? next.map(x => ({ ...x, session: 'tbd' as const })) : next })
 }}
 />
 <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', position: 'sticky', bottom: 0, paddingTop: '10px', background: 'linear-gradient(to top, #090909 70%, rgba(255,255,255,.045))' }}>
 <button type="button" onClick={() => setFoDatePickerOpen(false)}
 style={{ padding: '11px 56px', borderRadius: 0, border: '1px solid rgba(243,239,230,.5)', background: 'rgba(243,239,230,.15)', color: s.accent, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>
 Confirm
 </button>
 </div>
 </div>
 )}
 </div>
 {/* ── Insurance (required, unless included in product) ── */}
 <div style={{ marginTop: '8px' }}>
 {insuranceIncludedFor(entry.product) ? (
 <div style={{ padding: '7px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'rgba(243,239,230,.08)', color: s.accent, fontSize: '14px', fontWeight: 500 }}>
 Insurance included in {entry.product}
 </div>
 ) : insuranceNotNeededFor(entry.product) ? null : (
 <>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: entry.insurance === null ? '#d4a07a' : s.muted, marginBottom: '5px' }}>
 Insurance {entry.insurance === null ? ' required' : ''}
 </div>
 <div style={{ display: 'flex', gap: '6px' }}>
 {(['own', 'add'] as const).map(val => (
 <button key={val} type="button" onClick={() => updateEntry({ insurance: val })}
 style={{ flex: 1, padding: '7px 10px', borderRadius: 0, border: `1px solid ${entry.insurance === val ? s.accent : 'rgba(255,255,255,.12)'}`, background: entry.insurance === val ? 'rgba(243,239,230,.12)' : 'transparent', color: entry.insurance === val ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {val === 'own' ? ' Own insurance' : ` Add DAN${entry.sessions.length > 0 ? ` (€${computeGuestInsuranceCost(entry.sessions)})` : ''}`}
 </button>
 ))}
 </div>
 </>
 )}
 </div>
 {/* ── Equipment + Add-ons (optional) ── */}
 {(equipProductsList.length > 0 || addonProductsList.length > 0) && (
 <div style={{ marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
 {equipProductsList.length > 0 && (
 <div style={{ flex: 1, minWidth: '180px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '5px' }}>Equipment</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
 {equipRuleFor(entry.product).included && (
 <span style={{ padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(183,196,176,.3)', background: 'rgba(183,196,176,.08)', color: '#b7c4b0', fontSize: '14px', fontWeight: 500 }}>
 Equipment included{equipRuleFor(entry.product).computerIncluded ? ' (incl. computer)' : ''}
 </span>
 )}
 {fullEquipProduct && !equipRuleFor(entry.product).included && (
 <button type="button" onClick={() => {
 const next = !entry.fullEquipment
 updateEntry({ fullEquipment: next, equipmentItems: next ? entry.equipmentItems.filter(x => FULL_EQUIP_EXTRAS.includes(x)) : [] })
 }}
 style={{ padding: '6px 10px', borderRadius: 0, border: `1px solid ${entry.fullEquipment ? s.accent : 'rgba(255,255,255,.12)'}`, background: entry.fullEquipment ? 'rgba(243,239,230,.12)' : 'transparent', color: entry.fullEquipment ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 Full Equipment (€{fullEquipProduct.price})
 </button>
 )}
 {equipRuleFor(entry.product).extras.map(ep => {
 const isIncluded = entry.fullEquipment && !FULL_EQUIP_EXTRAS.includes(ep.name)
 const isSelected = entry.equipmentItems.includes(ep.name)
 return (
 <button key={ep.id} type="button" disabled={isIncluded} onClick={() => {
 if (isIncluded) return
 updateEntry({ equipmentItems: isSelected ? entry.equipmentItems.filter(x => x !== ep.name) : [...entry.equipmentItems, ep.name] })
 }}
 style={{ padding: '6px 10px', borderRadius: 0, border: `1px solid ${isIncluded ? 'rgba(255,255,255,.06)' : isSelected ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.1)'}`, background: isIncluded ? 'transparent' : isSelected ? 'rgba(243,239,230,.1)' : 'transparent', color: isIncluded ? 'rgba(255,255,255,.2)' : isSelected ? s.accent : s.muted, fontSize: '14px', cursor: isIncluded ? 'not-allowed' : 'pointer', fontFamily: s.font, textDecoration: isIncluded ? 'line-through' : 'none' }}>
 {ep.name} €{ep.price}{isIncluded ? ' ' : ''}
 </button>
 )
 })}
 </div>
 </div>
 )}
 {addonProductsList.length > 0 && (
 <div style={{ flex: 1, minWidth: '160px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '5px' }}>Add-ons</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
 {addonProductsList.map(ap => {
 const isSel = entry.addonItems.includes(ap.name)
 const noDs = entry.sessions.length === 0
 const uniqueDates = [...new Set(entry.sessions.map((ss: Picked) => ss.date))]
 const selAddonDays = entry.addonDays?.[ap.name]
 const dayLabel = isSel && selAddonDays && selAddonDays.length > 0 ? ` (${selAddonDays.length}d)` : ''
 return (
 <button key={ap.id} type="button" disabled={noDs} onClick={() => {
 const has = entry.addonItems.includes(ap.name)
 if (has) {
 const newDays = { ...entry.addonDays }; delete newDays[ap.name]
 updateEntry({ addonItems: entry.addonItems.filter(x => x !== ap.name), addonDays: newDays })
 } else {
 updateEntry({ addonItems: [...entry.addonItems, ap.name] })
 if (uniqueDates.length > 1) setFoGuestAddonPickerOpen({ gi, apName: ap.name })
 }
 }}
 style={{ padding: '6px 10px', borderRadius: 0, border: `1px solid ${noDs ? 'rgba(255,255,255,.06)' : isSel ? 'rgba(251,191,36,.5)' : 'rgba(255,255,255,.1)'}`, background: noDs ? 'transparent' : isSel ? 'rgba(251,191,36,.1)' : 'transparent', color: noDs ? 'rgba(255,255,255,.22)' : isSel ? '#c9b48a' : s.muted, fontSize: '14px', cursor: noDs ? 'not-allowed' : 'pointer', fontFamily: s.font, opacity: noDs ? 0.5 : 1 }}>
 {ap.name}{dayLabel} €{ap.price}
 </button>
 )
 })}
 </div>
 </div>
 )}
 </div>
 )}
 {/* ── Per-guest „+ Add item“: weitere Produkte als Preiszeile (Menge 1, keine Tauchtage — Tage im Sessions-Tab) ── */}
 {(entry.extraItems ?? []).length > 0 && (
 <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
 {(entry.extraItems ?? []).map((name, xi) => (
 <div key={xi} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
 <select value={name} onChange={e => updateEntry({ extraItems: entry.extraItems.map((x, i) => i === xi ? e.target.value : x) })}
 style={{ flex: 1, background: '#121210', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '6px 9px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none' }}>
 {['dives','entry','specialty','pro','ecology','equipment','extras','insurance'].map(cat => {
 const catItems = foProductsList.filter(p => p.category === cat)
 if (!catItems.length) return null
 return <optgroup key={cat} label={cat}>{catItems.map(p => <option key={p.id} value={p.name}>{p.name} — €{p.price}</option>)}</optgroup>
 })}
 </select>
 <span style={{ fontSize: '14px', color: s.muted, minWidth: '44px' }}>€{getEP(foProductsList.find(p => p.name === name), entry.residential)}</span>
 <button type="button" onClick={() => updateEntry({ extraItems: entry.extraItems.filter((_, i) => i !== xi) })}
 style={{ padding: '5px 9px', borderRadius: 0, border: '1px solid rgba(201,146,140,.3)', background: 'transparent', color: '#c9928c', fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}></button>
 </div>
 ))}
 </div>
 )}
 <button type="button" onClick={() => updateEntry({ extraItems: [...(entry.extraItems ?? []), foProductsList.find(p => ['dives','entry','specialty','pro','ecology','equipment','extras','insurance'].includes(p.category))?.name ?? ''] })}
 style={{ marginTop: '8px', padding: '5px 11px', borderRadius: 0, border: '1px dashed rgba(243,239,230,.3)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 + Add item for this guest
 </button>
 {/* ── Per-guest Last Dive + Residential ── */}
 <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
 {/* Last Dive */}
 <div style={{ flex: '1 1 160px', position: 'relative' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '4px' }}>Last dive</div>
 <button type="button" onClick={e => { const opening = foGuestLastDiveOpen !== gi; setFoGuestLastDiveOpen(prev => prev === gi ? null : gi); if (opening) foRevealPicker(e.currentTarget.parentElement) }}
 style={{ width: '100%', background: '#121210', border: `1px solid ${foGuestLastDiveOpen === gi ? 'rgba(243,239,230,.4)' : entry.lastDive && (Date.now() - new Date(entry.lastDive).getTime()) > 365*24*60*60*1000 ? 'rgba(212,160,122,.5)' : 'rgba(255,255,255,.1)'}`, borderRadius: 0, padding: '7px 10px', fontSize: '14px', color: entry.lastDive ? s.text : s.muted, fontFamily: s.font, outline: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
 <span>{entry.lastDive ? new Date(entry.lastDive + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date…'}</span>
 <span style={{ opacity: 0.5 }}></span>
 </button>
 {foGuestLastDiveOpen === gi && (
 <MiniDatePicker value={entry.lastDive} max={new Date().toISOString().slice(0, 10)}
 onChange={v => {
 const isOld = (Date.now() - new Date(v + 'T12:00:00').getTime()) > 365 * 24 * 60 * 60 * 1000
 const ssuExists = foProductsList.some(p => p.name === 'Scuba Skills Update')
 const updates: Partial<GuestEntry> = { lastDive: v }
 if (isOld && ssuExists) updates.product = 'Scuba Skills Update'
 updateEntry(updates)
 setFoGuestLastDiveOpen(null)
 }} />
 )}
 {entry.lastDive && (Date.now() - new Date(entry.lastDive).getTime()) > 365*24*60*60*1000 && (
 <div style={{ marginTop: '4px', fontSize: '14px', color: '#d4a07a' }}> Scuba Skills Update required</div>
 )}
 </div>
 {/* Residential */}
 <label style={{ flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: 0, background: entry.residential ? 'rgba(251,191,36,.07)' : 'rgba(255,255,255,.02)', border: `1px solid ${entry.residential ? 'rgba(251,191,36,.35)' : 'rgba(255,255,255,.08)'}`, cursor: 'pointer', marginTop: '18px' }}>
 <input type="checkbox" checked={entry.residential} onChange={ev => updateEntry({ residential: ev.target.checked })} style={{ width: '13px', height: '13px', accentColor: '#c9b48a', cursor: 'pointer', flexShrink: 0 }} />
 <span style={{ fontSize: '14px', color: entry.residential ? '#c9b48a' : s.muted, lineHeight: 1.3 }}>
 <b style={{ color: entry.residential ? '#c9b48a' : s.text }}>Residential</b> / Erasmus
 </span>
 </label>
 </div>
 {/* ── Per-guest addon day picker modal ── */}
 {foGuestAddonPickerOpen !== null && foGuestAddonPickerOpen.gi === gi && (() => {
 const { apName } = foGuestAddonPickerOpen
 const uniqueDates = [...new Set(entry.sessions.map((ss: Picked) => ss.date))].sort()
 const selDays = entry.addonDays?.[apName] ?? []
 return (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
 onClick={() => setFoGuestAddonPickerOpen(null)}>
 <div style={{ background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, padding: '20px 22px', minWidth: '260px', maxWidth: '340px', width: '90%' }}
 onClick={e => e.stopPropagation()}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '3px' }}>Apply add-on to which days?</div>
 <div style={{ fontSize: '14px', color: '#c9b48a', marginBottom: '14px', fontStyle: 'italic' }}>{apName}</div>
 <button type="button" onClick={() => updateEntry({ addonDays: { ...entry.addonDays, [apName]: [] } })}
 style={{ width: '100%', padding: '8px', borderRadius: 0, border: `1px solid ${selDays.length === 0 ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.15)'}`, background: selDays.length === 0 ? 'rgba(243,239,230,.12)' : 'transparent', color: selDays.length === 0 ? s.accent : s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font, marginBottom: '8px', fontWeight: 500 }}>
 All days ({uniqueDates.length}d)
 </button>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
 {uniqueDates.map(date => {
 const isChk = selDays.includes(date)
 return (
 <label key={date} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', borderRadius: 0, background: isChk ? 'rgba(251,191,36,.08)' : 'transparent', border: `1px solid ${isChk ? 'rgba(251,191,36,.3)' : 'rgba(255,255,255,.07)'}` }}>
 <input type="checkbox" checked={isChk} onChange={ev => {
 const d = entry.addonDays?.[apName] ?? []
 updateEntry({ addonDays: { ...entry.addonDays, [apName]: ev.target.checked ? [...d, date] : d.filter((x: string) => x !== date) } })
 }} style={{ accentColor: '#c9b48a' }} />
 <span style={{ fontSize: '14px', color: s.text }}>{date}</span>
 </label>
 )
 })}
 </div>
 <button type="button" onClick={() => setFoGuestAddonPickerOpen(null)}
 style={{ width: '100%', padding: '10px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>
 Confirm
 </button>
 </div>
 </div>
 )
 })()}
 </div>
 )
 })}
 </div>
 ) : (
 /* ── Gruppen-Picker + Insurance + Equipment + Extras ── */
 <>
 <div id="fo-date-picker" style={{ position: 'relative', scrollMarginTop: '140px' }}>
 <button
 type="button"
 onClick={() => setFoDatePickerOpen(o => !o)}
 style={{
 width: '100%', background: '#121210', border: `1px solid ${foDatePickerOpen === true ? 'rgba(243,239,230,.4)' : 'rgba(255,255,255,.12)'}`,
 borderRadius: 0, padding: '11px 13px', fontSize: '16px', color: foDate ? s.text : s.muted,
 fontFamily: s.font, outline: 'none', textAlign: 'left', cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box',
 }}
 >
 <span>{foSessionsPicked.length > 0 ? foSessionsPicked.map(p => `${p.date} · ${p.session.toUpperCase()}`).join(' · ') : 'Select date and session…'}</span>
 <span style={{ fontSize: '16px', opacity: 0.6 }}></span>
 </button>
 {foDatePickerOpen === true && (
 <div style={{
 position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
 background: '#000', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0,
 padding: '18px', minWidth: '640px', maxWidth: '780px', boxShadow: 'none',
 }} ref={foPickerRef}>
 {needsRefresher && !foSplit && (
 <div style={{ marginBottom: '14px', padding: '11px 14px', borderRadius: 0, background: 'rgba(212,160,122,.12)', border: '1px solid rgba(212,160,122,.4)', fontSize: '14px', lineHeight: 1.55, color: '#d4a07a' }}>
 <b>Why are we asking for a new date?</b> The last dive was more than 12 months before the dive day, so a <b>Scuba Skills Update</b> is required first.
 {refresherDate ? <> The date you already picked (<b>{refresherDate}</b>) is now the <b>update day</b> (pool, no boat).</> : null}
 {foSessionsPicked.length < foPickRequired
 ? <> Please pick the <b>first dive day after it</b>.</>
 : <> Both days are set — press Confirm.</>}
 </div>
 )}
 <SessionPicker
 staffMode
 mode={isNightProduct(selectedProduct) ? 'night' : 'boat'}
 allowTbd={['entry','specialty','ecology','pro'].includes(selectedProduct?.category ?? '')}
 required={foPickRequired}
 seats={foGuests}
 picked={foSessionsPicked}
 // SSU automatisch dazu (Lucas 28.10.): Tag 1 = Skills Update, Tauchtage nur danach — davor/am selben Tag sperren
 blockedSlots={needsRefresher && !foSplit && refresherDate
 ? (date) => date <= refresherDate ? `Scuba Skills Update is on ${refresherDate} — dive days must come after it` : null
 : undefined}
 onChange={(next) => {
 // Divemaster / Dive Guide: nur der Starttag zählt — Session immer TBD, der Instructor verteilt die Wochen per Ticket (Lucas 31.10.)
 setFoSessionsPicked(isProgramProduct(selectedProduct?.id) ? next.map((x, i) => i >= ssuOffset ? { ...x, session: 'tbd' as const } : x) : next)
 }}
 />
 <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', position: 'sticky', bottom: 0, paddingTop: '10px', background: 'linear-gradient(to top, #090909 70%, rgba(255,255,255,.045))' }}>
 <button type="button" onClick={() => setFoDatePickerOpen(false)}
 style={{ padding: '11px 56px', borderRadius: 0, border: '1px solid rgba(243,239,230,.5)', background: 'rgba(243,239,230,.15)', color: s.accent, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>
 Confirm
 </button>
 </div>
 </div>
 )}
 </div>

 {/* ── Group Insurance (required, unless included in product) ── */}
 <div style={{ marginTop: '10px' }}>
 {insuranceIncluded ? (
 <div style={{ padding: '8px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'rgba(243,239,230,.08)', color: s.accent, fontSize: '14px', fontWeight: 500 }}>
 Insurance included in {foProduct}
 </div>
 ) : insuranceNotNeeded ? null : (
 <>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: foGroupInsurance === null ? '#d4a07a' : s.muted, marginBottom: '6px' }}>
 Insurance {foGroupInsurance === null ? ' required' : ''}
 </div>
 <div style={{ display: 'flex', gap: '6px' }}>
 {(['own', 'add'] as const).map(val => (
 <button key={val} type="button" onClick={() => setFoGroupInsurance(val)}
 style={{ flex: 1, padding: '8px 12px', borderRadius: 0, border: `1px solid ${foGroupInsurance === val ? s.accent : 'rgba(255,255,255,.12)'}`, background: foGroupInsurance === val ? 'rgba(243,239,230,.12)' : 'transparent', color: foGroupInsurance === val ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {val === 'own' ? ' Own insurance' : ` Add DAN${foSessionsPicked.length > 0 ? ` (€${computeGuestInsuranceCost(foSessionsPicked)} × ${foGuests})` : ` × ${foGuests}`}`}
 </button>
 ))}
 </div>
 </>
 )}
 </div>

 {/* ── Group Equipment + Add-ons (optional) ── */}
 {(equipProductsList.length > 0 || addonProductsList.length > 0) && (
 <div style={{ marginTop: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
 {equipProductsList.length > 0 && (
 <div style={{ flex: 1, minWidth: '200px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '6px' }}>Equipment</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
 {groupEquipRule.included && (
 <span style={{ padding: '7px 12px', borderRadius: 0, border: '1px solid rgba(183,196,176,.3)', background: 'rgba(183,196,176,.08)', color: '#b7c4b0', fontSize: '14px', fontWeight: 500 }}>
 Equipment included{groupEquipRule.computerIncluded ? ' (incl. computer)' : ''}
 </span>
 )}
 {fullEquipProduct && !groupEquipRule.included && (
 <button type="button" onClick={() => {
 const next = !foGroupFullEquipment
 setFoGroupFullEquipment(next)
 // keep only extras when turning full equip on; clear all when turning off
 setFoGroupEquipmentItems(next ? foGroupEquipmentItems.filter(x => FULL_EQUIP_EXTRAS.includes(x)) : [])
 }}
 style={{ padding: '7px 12px', borderRadius: 0, border: `1px solid ${foGroupFullEquipment ? s.accent : 'rgba(255,255,255,.12)'}`, background: foGroupFullEquipment ? 'rgba(243,239,230,.12)' : 'transparent', color: foGroupFullEquipment ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 Full Equipment (€{fullEquipProduct.price} × {foGuests})
 </button>
 )}
 {groupEquipRule.extras.map(ep => {
 const isIncluded = foGroupFullEquipment && !FULL_EQUIP_EXTRAS.includes(ep.name)
 const isSelected = foGroupEquipmentItems.includes(ep.name)
 return (
 <button key={ep.id} type="button" disabled={isIncluded} onClick={() => {
 if (isIncluded) return
 setFoGroupEquipmentItems(isSelected ? foGroupEquipmentItems.filter(x => x !== ep.name) : [...foGroupEquipmentItems, ep.name])
 }}
 style={{ padding: '7px 12px', borderRadius: 0, border: `1px solid ${isIncluded ? 'rgba(255,255,255,.06)' : isSelected ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.1)'}`, background: isIncluded ? 'transparent' : isSelected ? 'rgba(243,239,230,.1)' : 'transparent', color: isIncluded ? 'rgba(255,255,255,.2)' : isSelected ? s.accent : s.muted, fontSize: '14px', cursor: isIncluded ? 'not-allowed' : 'pointer', fontFamily: s.font, textDecoration: isIncluded ? 'line-through' : 'none' }}>
 {ep.name} €{ep.price}{isIncluded ? ' ' : ''}
 </button>
 )
 })}
 </div>
 </div>
 )}
 {addonProductsList.length > 0 && (
 <div style={{ flex: 1, minWidth: '180px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '6px' }}>Add-ons</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
 {addonProductsList.map(ap => {
 const isAddonSel = foGroupAddonItems.includes(ap.name)
 const adDays = foGroupAddonDays[ap.name]
 const adDaysCount = adDays && adDays.length > 0 ? adDays.length : null
 const noDates = foSessionsPicked.length === 0
 return (
 <button key={ap.id} type="button" disabled={noDates} onClick={() => {
 if (isAddonSel) {
 setFoGroupAddonItems(foGroupAddonItems.filter(x => x !== ap.name))
 setFoGroupAddonDays(prev => { const n = { ...prev }; delete n[ap.name]; return n })
 } else {
 setFoGroupAddonItems([...foGroupAddonItems, ap.name])
 const picDates = [...new Set(foSessionsPicked.map(sv => sv.date))]
 if (picDates.length > 1) setFoAddonPickerOpen(ap.name)
 }
 }}
 style={{ padding: '7px 12px', borderRadius: 0, border: `1px solid ${noDates ? 'rgba(255,255,255,.06)' : isAddonSel ? 'rgba(251,191,36,.5)' : 'rgba(255,255,255,.1)'}`, background: noDates ? 'transparent' : isAddonSel ? 'rgba(251,191,36,.1)' : 'transparent', color: noDates ? 'rgba(255,255,255,.22)' : isAddonSel ? '#c9b48a' : s.muted, fontSize: '14px', cursor: noDates ? 'not-allowed' : 'pointer', fontFamily: s.font, opacity: noDates ? 0.5 : 1 }}>
 {ap.name} €{ap.price}{adDaysCount !== null ? ` · ${adDaysCount}d` : ''}
 </button>
 )
 })}
 </div>
 </div>
 )}
 </div>
 )}

 {/* ── Addon day picker modal ── */}
 {foAddonPickerOpen !== null && (() => {
 const apName = foAddonPickerOpen
 const picDates = [...new Set(foSessionsPicked.map(sv => sv.date))].sort()
 const selDays = foGroupAddonDays[apName] ?? []
 return (
 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
 onClick={() => setFoAddonPickerOpen(null)}>
 <div style={{ background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, padding: '20px 22px', minWidth: '260px', maxWidth: '340px', width: '90%' }}
 onClick={e => e.stopPropagation()}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '3px' }}>Apply add-on to which days?</div>
 <div style={{ fontSize: '14px', color: '#c9b48a', marginBottom: '14px', fontStyle: 'italic' }}>{apName}</div>
 <button type="button" onClick={() => setFoGroupAddonDays(prev => { const n = { ...prev }; delete n[apName]; return n })}
 style={{ width: '100%', padding: '8px', borderRadius: 0, border: `1px solid ${selDays.length === 0 ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.15)'}`, background: selDays.length === 0 ? 'rgba(243,239,230,.12)' : 'transparent', color: selDays.length === 0 ? s.accent : s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font, marginBottom: '8px', fontWeight: 500 }}>
 All days ({foGroupNumDays}d)
 </button>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
 {picDates.map(date => {
 const isChk = selDays.includes(date)
 return (
 <label key={date} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', borderRadius: 0, background: isChk ? 'rgba(251,191,36,.08)' : 'transparent', border: `1px solid ${isChk ? 'rgba(251,191,36,.3)' : 'rgba(255,255,255,.07)'}` }}>
 <input type="checkbox" checked={isChk} onChange={ev => {
 setFoGroupAddonDays(prev => {
 const d = prev[apName] ?? []
 return { ...prev, [apName]: ev.target.checked ? [...d, date] : d.filter(x => x !== date) }
 })
 }} style={{ accentColor: '#c9b48a' }} />
 <span style={{ fontSize: '14px', color: s.text }}>{date}</span>
 </label>
 )
 })}
 </div>
 <button type="button" onClick={() => setFoAddonPickerOpen(null)}
 style={{ width: '100%', padding: '10px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>
 Confirm
 </button>
 </div>
 </div>
 )
 })()}

 </>
 )}

 {/* ── Extra line items (nur Gruppenbuchung — im Split pro Gast, siehe Karte) ── */}
 {!foSplit && <>
 {foExtraLines.length > 0 && (
 <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {foExtraLines.map((line, li) => (
 <div key={li} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
 <select value={line.product} onChange={e => setFoExtraLines(prev => prev.map((x, i) => i === li ? { product: e.target.value } : x))}
 style={{ flex: 1, background: '#121210', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '7px 10px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none' }}>
 {['dives','entry','specialty','pro','ecology','equipment','extras','insurance'].map(cat => {
 const catItems = foProductsList.filter(p => p.category === cat)
 if (!catItems.length) return null
 const catLabel: Record<string,string> = { dives: 'Dive Packages', entry: 'Entry & Core', specialty: 'Specialties', pro: 'Safety & Pro', ecology: 'Ecology', equipment: 'Equipment', extras: 'Extras & Sites', insurance: 'Insurance' }
 return <optgroup key={cat} label={catLabel[cat] ?? cat}>{catItems.map(p => <option key={p.id} value={p.name}>{p.name} — €{p.price}</option>)}</optgroup>
 })}
 </select>
 <span style={{ fontSize: '14px', color: s.muted, minWidth: '50px' }}>
 €{foProductsList.find(p => p.name === line.product)?.price ?? 0}
 </span>
 <button type="button" onClick={() => setFoExtraLines(prev => prev.filter((_, i) => i !== li))}
 style={{ padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(201,146,140,.3)', background: 'transparent', color: 'rgba(201,146,140,.8)', fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}></button>
 </div>
 ))}
 </div>
 )}
 <button type="button" onClick={() => setFoExtraLines(prev => [...prev, { product: foProductsList.find(p => ['dives','entry','specialty','pro','ecology','equipment','extras','insurance'].includes(p.category))?.name ?? '' }])}
 style={{ marginTop: '8px', padding: '6px 12px', borderRadius: 0, border: '1px dashed rgba(243,239,230,.3)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 + Add item
 </button>
 {/* ── Custom line items (free text + amount) ── */}
 {foCustomLines.length > 0 && (
 <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {foCustomLines.map((cl, ci) => (
 <div key={ci} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
 <input value={cl.label} placeholder="Custom item name"
 onChange={e => setFoCustomLines(prev => prev.map((x, i) => i === ci ? { ...x, label: e.target.value } : x))}
 style={{ flex: 1, background: '#121210', border: '1px solid rgba(251,191,36,.25)', borderRadius: 0, padding: '7px 10px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none' }} />
 <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>€</span>
 <input type="number" min="0" step="0.01" value={cl.amount || ''} placeholder="0"
 onChange={e => setFoCustomLines(prev => prev.map((x, i) => i === ci ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
 style={{ width: '70px', background: '#121210', border: '1px solid rgba(251,191,36,.25)', borderRadius: 0, padding: '7px 8px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none' }} />
 </div>
 <button type="button" onClick={() => setFoCustomLines(prev => prev.filter((_, i) => i !== ci))}
 style={{ padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(201,146,140,.3)', background: 'transparent', color: 'rgba(201,146,140,.8)', fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}></button>
 </div>
 ))}
 </div>
 )}
 <button type="button" onClick={() => setFoCustomLines(prev => [...prev, { label: '', amount: 0 }])}
 style={{ marginTop: '8px', padding: '6px 12px', borderRadius: 0, border: '1px dashed rgba(251,191,36,.35)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 + Add custom item
 </button>
 </>}
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '12px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Guests</div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <button onClick={() => setFoGuests(g => Math.max(1, g - 1))} style={{ width: '34px', height: '34px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'transparent', color: s.text, fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font }}>−</button>
 <span style={{ fontSize: '20px', fontWeight: 500, color: s.text, minWidth: '24px', textAlign: 'center' }}>{foGuests}</span>
 <button onClick={() => setFoGuests(g => g + 1)} style={{ width: '34px', height: '34px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'transparent', color: s.text, fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: s.font }}>+</button>
 </div>
 </div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Guest name / group</div>
 <input value={foName} onChange={e => setFoName(e.target.value)} placeholder="e.g. Müller Group" style={{ width: '100%', background: '#121210', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, padding: '11px 13px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 </div>
 <div style={{ marginBottom: '8px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '7px' }}>Email</div>
 <input value={foEmail} onChange={e => setFoEmail(e.target.value)} type="email" placeholder="for check-in link and receipt" style={{ width: '100%', background: '#121210', border: `1px solid ${!foEmail.trim() ? 'rgba(255,180,0,.4)' : 'rgba(255,255,255,.12)'}`, borderRadius: 0, padding: '11px 13px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 {!foEmail.trim() && (
 <div style={{ fontSize: '14px', color: '#c9b48a', marginTop: '4px' }}> Email required to create booking</div>
 )}
 </div>
 <div style={{ marginBottom: '16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '7px' }}>Phone</div>
 <input value={foPhone} onChange={e => setFoPhone(e.target.value)} type="tel" placeholder="+351 912 345 678" style={{ width: '100%', background: '#121210', border: `1px solid ${!foPhone.trim() ? 'rgba(255,180,0,.4)' : 'rgba(255,255,255,.12)'}`, borderRadius: 0, padding: '11px 13px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 {!foPhone.trim() && (
 <div style={{ fontSize: '14px', color: '#c9b48a', marginTop: '4px' }}> Phone required to create booking</div>
 )}
 </div>
 </div>

 {/* ── Last Dive / Refresher (Group mode only — Split has per-guest) ── */}
 {!foSplit && <div>
 <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted }}>{foGuests >= 2 ? 'Guests' : 'Last dive'}</div>
 {foGuests >= 2 && <div style={{ fontSize: '14px', color: s.muted, opacity: 0.7 }}>one line per diver</div>}
 </div>

 {foGuests <= 1 ? (
 /* ── Single Guest: bisheriges Verhalten ── */
 <div style={{ position: 'relative' }}>
 <button
 type="button"
 onClick={e => { const opening = !foLastDiveOpen; setFoLastDiveOpen(o => !o); if (opening) foRevealPicker(e.currentTarget.parentElement) }}
 style={{
 width: '100%', background: '#121210',
 border: `1px solid ${foLastDiveOpen ? 'rgba(243,239,230,.4)' : needsRefresher ? 'rgba(212,160,122,.5)' : 'rgba(255,255,255,.12)'}`,
 borderRadius: 0, padding: '11px 13px', fontSize: '15px',
 color: foLastDive ? s.text : s.muted, fontFamily: s.font, outline: 'none',
 textAlign: 'left', cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box',
 }}
 >
 <span>{foLastDive ? new Date(foLastDive + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Select date…'}</span>
 <span style={{ fontSize: '15px', opacity: 0.5 }}></span>
 </button>
 {foLastDiveOpen && (
 <MiniDatePicker
 value={foLastDive}
 max={new Date().toISOString().slice(0, 10)}
 onChange={v => { setFoLastDive(v); setFoLastDiveOpen(false) }}
 />
 )}
 </div>
 ) : (
 /* ── Multi-Guest: eine Zeile pro Gast ── */
 <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
 {/* Spaltenköpfe — gleiche Flex-Verhältnisse wie die Zeilen darunter */}
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
 <span style={{ minWidth: '52px', flexShrink: 0 }} />
 <span style={{ flex: 1.4, fontSize: '14px', color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase' }}>Full name *</span>
 <span style={{ flex: 1, fontSize: '14px', color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase' }}>Last dive</span>
 </div>
 {Array.from({ length: foGuests }, (_, gi) => {
 const gld = foGuestLastDives[gi] ?? ''
 const gldOld = !!gld && (Date.now() - new Date(gld + 'T12:00:00').getTime()) > 365 * 24 * 60 * 60 * 1000
 return (
 <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
 <span style={{ fontSize: '14px', color: s.muted, minWidth: '52px', flexShrink: 0 }}>Guest {gi + 1}</span>
 <input
 type="text"
 value={foGuestNames[gi] ?? ''}
 placeholder={gi === 0 && foName ? `${foName} (payer)` : 'Full name *'}
 onChange={e => {
 const v = e.target.value
 setFoGuestNames(prev => Array.from({ length: foGuests }, (_, i) => i === gi ? v : (prev[i] ?? '')))
 }}
 style={{
 flex: 1.4, background: '#121210',
 border: `1px solid ${(gi === 0 ? (foGuestNames[0] || foName) : foGuestNames[gi])?.trim() ? 'rgba(255,255,255,.12)' : 'rgba(201,146,140,.55)'}`,
 borderRadius: 0, padding: '8px 11px', fontSize: '14px',
 color: s.text, fontFamily: s.font, outline: 'none', boxSizing: 'border-box',
 }}
 />
 <div style={{ flex: 1, position: 'relative' }}>
 <button
 type="button"
 onClick={e => { const opening = foGuestLastDiveOpenSingle !== gi; setFoGuestLastDiveOpenSingle(prev => prev === gi ? null : gi); if (opening) foRevealPicker(e.currentTarget.parentElement) }}
 style={{
 width: '100%', background: '#121210',
 border: `1px solid ${foGuestLastDiveOpenSingle === gi ? 'rgba(243,239,230,.4)' : gldOld ? 'rgba(212,160,122,.5)' : 'rgba(255,255,255,.12)'}`,
 borderRadius: 0, padding: '8px 11px', fontSize: '14px',
 color: gld ? s.text : s.muted, fontFamily: s.font, outline: 'none',
 textAlign: 'left', cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box',
 }}
 >
 <span>{gld ? new Date(gld + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Last dive…'}</span>
 <span style={{ opacity: 0.5 }}></span>
 </button>
 {foGuestLastDiveOpenSingle === gi && (
 <MiniDatePicker
 value={gld}
 max={new Date().toISOString().slice(0, 10)}
 onChange={v => {
 // Last-Dive-Array aktualisieren
 const nextLastDives = Array.from({ length: foGuests }, (_, i) =>
 i === gi ? v : (foGuestLastDives[i] ?? ''))
 setFoGuestLastDives(nextLastDives)
 setFoGuestLastDiveOpenSingle(null)

 // Wenn > 1 Jahr auto-switch auf Split View
 const isOld = (Date.now() - new Date(v + 'T12:00:00').getTime()) > 365 * 24 * 60 * 60 * 1000
 if (isOld) {
 const ssuExists = foProductsList.some(p => p.name === 'Scuba Skills Update')
 setFoSplit(true)
 setFoDatePickerOpen(false)
 setFoAutoSplitNote(`Guest ${gi + 1}'s last dive was more than 12 months ago, so that guest gets a Scuba Skills Update first (pool, no boat) and needs their own dates. Each guest is booked separately now: check the dates, insurance and equipment per guest below.`)
 setTimeout(() => document.getElementById('fo-split-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
 // Alle Gäste behalten die bisherigen Sessions; nur Produkt für Gast i wechselt
 setFoGuestEntries(Array.from({ length: foGuests }, (_, i) => ({
 firstName: '',
 lastName: '',
 email: '',
 product: i === gi && ssuExists ? 'Scuba Skills Update' : foProduct,
 sessions: [...foSessionsPicked],
 insurance: null,
 fullEquipment: false,
 equipmentItems: [],
 addonItems: [],
 addonDays: {},
 lastDive: nextLastDives[i] ?? '',
 residential: false,
 extraItems: [],
 })))
 }
 }}
 />
 )}
 {gldOld && (
 <div style={{ marginTop: '3px', fontSize: '14px', color: '#d4a07a' }}> Scuba Skills Update required</div>
 )}
 </div>
 </div>
 )
 })}
 </div>
 )}

 {/* Warning nur für Single-Gast */}
 {foGuests <= 1 && needsRefresher && refresherDate && (
 <div style={{
 marginTop: '10px', padding: '10px 13px', borderRadius: 0,
 background: 'rgba(212,160,122,.1)', border: '1px solid rgba(212,160,122,.35)',
 fontSize: '14px', color: '#d4a07a', lineHeight: 1.5,
 }}>
 <b>Scuba Skills Update required</b> — last dive &gt; 12 months ago.
 First session on <b>{refresherDate}</b> will be a Scuba Skills Update before going on the boat.
 {foSessionsPicked.length < foPickRequired && (
 <div style={{ marginTop: '8px' }}>
 <b>Next: pick the first dive day after the update.</b>{' '}
 <button type="button" onClick={foOpenDatePicker} style={{ marginLeft: '6px', padding: '5px 11px', borderRadius: 0, border: '1px solid rgba(212,160,122,.6)', background: 'rgba(212,160,122,.18)', color: '#d4a07a', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}> Pick dive date</button>
 </div>
 )}
 </div>
 )}
 {foGuests <= 1 && needsRefresher && !refresherDate && (
 <div style={{ marginTop: '6px', fontSize: '14px', color: '#d4a07a' }}>
 Scuba Skills Update required — select a date above to see which day it falls on.
 </div>
 )}
 </div>}

 {!foSplit && <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 0, background: foResidential ? 'rgba(251,191,36,.07)' : 'rgba(255,255,255,.03)', border: `1px solid ${foResidential ? 'rgba(251,191,36,.35)' : 'rgba(255,255,255,.08)'}`, cursor: 'pointer' }}>
 <input type="checkbox" checked={foResidential} onChange={e => setFoResidential(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: '#c9b48a', cursor: 'pointer', flexShrink: 0 }} />
 <span style={{ fontSize: '14px', color: foResidential ? '#c9b48a' : s.muted, lineHeight: 1.4 }}>
 <b style={{ color: foResidential ? '#c9b48a' : s.text }}>Residential / Erasmus discount</b> — local resident or exchange student rate
 </span>
 </label>}

 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Payment method{!foPayment && <span style={{ color: '#d4a07a', marginLeft: '10px', letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>Please choose one</span>}</div>
 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
 {(['cash', 'bank', 'revolut', 'card', 'link'] as const).map(pm => (
 <button key={pm} disabled={pm === 'card'} title={pm === 'card' ? 'Not available yet — no card terminal. Use Stripe Payment Link for card payments.' : undefined} onClick={() => setFoPayment(pm)} style={{ opacity: pm === 'card' ? 0.4 : 1, padding: '8px 14px', borderRadius: 0, border: `1px solid ${foPayment === pm ? s.accent : 'rgba(255,255,255,.12)'}`, background: foPayment === pm ? 'rgba(243,239,230,.12)' : 'transparent', color: foPayment === pm ? s.accent : s.muted, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font , ...(pm === 'card' ? { cursor: 'not-allowed' } : {})}}>
 {pm === 'cash' ? ' Cash' : pm === 'bank' ? ' Transfer' : pm === 'revolut' ? ' Revolut' : pm === 'card' ? ' Card (not available yet)' : ' Stripe Payment Link'}
 </button>
 ))}
 </div>
 </div>

 {/* 50% deposit checkbox — only for split + link/bank/revolut */}
 {true && (
 <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 0, background: foDepositOnly ? 'rgba(201,180,138,.07)' : 'rgba(255,255,255,.03)', border: `1px solid ${foDepositOnly ? 'rgba(201,180,138,.35)' : 'rgba(255,255,255,.08)'}`, cursor: 'pointer' }}>
 <input type="checkbox" checked={foDepositOnly} onChange={e => setFoDepositOnly(e.target.checked)} style={{ accentColor: '#c9b48a', width: '15px', height: '15px', cursor: 'pointer' }} />
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: foDepositOnly ? '#c9b48a' : s.text }}>Charge 50% deposit now</div>
 <div style={{ fontSize: '14px', color: s.muted }}>Guest pays half upfront — remaining balance due on arrival</div>
 </div>
 </label>
 )}

 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Notes (optional)</div>
 <textarea value={foNotes} onChange={e => setFoNotes(e.target.value)} placeholder="Equipment sizes, cert level, special requests…" rows={2} style={{ width: '100%', background: '#121210', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, padding: '11px 13px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
 </div>

 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Tax number / NIF (optional — for a named invoice)</div>
 <input value={foNif} onChange={e => setFoNif(e.target.value)} onBlur={() => setFoNifTouched(true)} placeholder="e.g. 123456789 or DE123456789" inputMode="text" autoComplete="off" style={{ width: '100%', background: '#121210', border: `1px solid ${!foNifShowErr ? 'rgba(255,255,255,.12)' : '#c9928c'}`, borderRadius: 0, padding: '11px 13px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 <div style={{ fontSize: '14px', color: !foNifShowErr ? s.muted : '#c9928c', marginTop: '6px' }}>{!foNifShowErr ? 'Leave empty for "Consumidor Final". Portuguese NIF: 9 digits; EU VAT: country code + number.' : 'Not a valid NIF/VAT format — 9 digits (PT) or country code + number (EU).'}</div>
 </div>
 </div>
 )}
 </div>

 {/* Right: Summary */}
 {!foSubmitted && (
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '22px', position: 'sticky', top: '100px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '16px' }}>Summary</div>
 <div style={{ marginBottom: '16px' }}>
 <div style={{ fontSize: '16px', fontWeight: 500, color: s.text, marginBottom: '4px' }}>{foProduct}{insuranceIncluded ? <span style={{ fontSize: '14px', fontWeight: 500, color: s.accent, marginLeft: '6px', opacity: 0.8 }}>(inkl. Insurance)</span> : null}</div>
 {/* Split-Modus: Tage je Gast stehen in der Aufschlüsselung; Gruppenmodus: Tage als Chips an den Line-Items (Lucas 28.10.) */}
 {foSplit && foSessionsPicked.slice(ssuOffset).length > 0 && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '1px' }}>
 {foSessionsPicked.slice(ssuOffset).map((p, pi) => (
 <div key={pi} style={{ fontSize: '14px', color: s.muted }}>{p.date} · {p.session.toUpperCase()}</div>
 ))}
 </div>
 )}
 {foName && <div style={{ fontSize: '14px', color: s.muted }}>{foName}</div>}
 {foSplit && needsRefresher && refresherDate && (
 <div style={{ marginTop: '6px', padding: '5px 9px', borderRadius: 0, background: 'rgba(212,160,122,.12)', border: '1px solid rgba(212,160,122,.3)', fontSize: '14px', color: '#d4a07a', display: 'inline-block' }}>
 Scuba Skills Update · {refresherDate}
 </div>
 )}
 </div>
 <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '14px', marginBottom: '16px' }}>
 {foSplit ? (
 // ── Split mode: per-guest breakdown ──────────────────────────────
 <>
 {foGuestEntries.map((ge, gi) => {
 const geProd = foProductsList.find(p => p.name === ge.product)
 const geInsuranceIncluded = insuranceIncludedFor(ge.product)
 const geNd = new Set(ge.sessions.map((sv: Picked) => sv.date)).size || 1
 const geName = [ge.firstName, ge.lastName].filter(Boolean).join(' ')
 return (
 <div key={gi} style={{ marginBottom: gi < foGuestEntries.length - 1 ? '12px' : 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '5px', paddingBottom: '4px', borderBottom: '1px solid rgba(243,239,230,.18)' }}>
 Guest {gi + 1}{geName ? `: ${geName}` : ''}
 </div>
 {ge.residential && (
 <div style={{ fontSize: '14px', color: '#c9b48a', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '3px' }}> Residential rate</div>
 )}
 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '14px' }}>
 <span style={{ color: s.muted }}>{ge.product}</span>
 <span style={{ color: s.text, fontWeight: 500 }}>€{getEP(geProd, ge.residential)}</span>
 </div>
 {ge.sessions.map((sv: Picked, si: number) => (
 <div key={si} style={{ fontSize: '14px', color: s.muted, paddingLeft: '8px' }}>{sv.date} · {sv.session.toUpperCase()}</div>
 ))}
 {!geInsuranceIncluded && ge.insurance === 'add' && (
 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '14px' }}>
 <span style={{ color: s.muted }}>DAN Insurance</span>
 <span style={{ color: s.text, fontWeight: 500 }}>€{computeGuestInsuranceCost(ge.sessions)}</span>
 </div>
 )}
 {!geInsuranceIncluded && ge.insurance === 'own' && (
 <div style={{ fontSize: '14px', color: s.muted, padding: '3px 0' }}> Own insurance</div>
 )}
 {ge.fullEquipment && !equipRuleFor(ge.product).included && fullEquipProduct && (
 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '14px' }}>
 <span style={{ color: s.muted }}> Full Equipment × {geNd}d</span>
 <span style={{ color: s.text, fontWeight: 500 }}>€{getEP(fullEquipProduct, ge.residential) * geNd}</span>
 </div>
 )}
 {ge.equipmentItems.map((name: string, ei: number) => {
 const ep2 = foProductsList.find((x) => x.name === name)
 return ep2 ? (
 <div key={ei} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '14px' }}>
 <span style={{ color: s.muted }}>{name} × {geNd}d</span>
 <span style={{ color: s.text, fontWeight: 500 }}>€{getEP(ep2, ge.residential) * geNd}</span>
 </div>
 ) : null
 })}
 {ge.addonItems.map((name: string, ai: number) => {
 const ap2 = foProductsList.find((x) => x.name === name)
 return ap2 ? (
 <div key={ai} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '14px' }}>
 <span style={{ color: s.muted }}>{name}</span>
 <span style={{ color: s.text, fontWeight: 500 }}>€{getEP(ap2, ge.residential) * geNd}</span>
 </div>
 ) : null
 })}
 {(ge.extraItems ?? []).map((name: string, xi: number) => {
 const xp = foProductsList.find((x) => x.name === name)
 return xp ? (
 <div key={`x${xi}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '14px' }}>
 <span style={{ color: s.muted }}>+ {name}</span>
 <span style={{ color: s.text, fontWeight: 500 }}>€{getEP(xp, ge.residential)}</span>
 </div>
 ) : null
 })}
 </div>
 )
 })}
 {foCustomLines.filter(l => l.label.trim()).map((cl, ci) => (
 <div key={`cl${ci}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: '14px', marginTop: '4px' }}>
 <span style={{ color: s.muted }}> {cl.label}</span>
 <span style={{ color: s.text, fontWeight: 500 }}>€{cl.amount}</span>
 </div>
 ))}
 {!foSplit && foResidential && (
 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: '14px', marginTop: '4px' }}>
 <span style={{ color: s.muted }}> Residential / Erasmus</span>
 <span style={{ color: '#b7c4b0', fontWeight: 500 }}>{residentialSavingAmount > 0 ? `−€${residentialSavingAmount % 1 === 0 ? residentialSavingAmount : residentialSavingAmount.toFixed(2)}` : 'discount applied'}</span>
 </div>
 )}
 {foSplit && residentialSavingAmount > 0 && (
 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: '14px', marginTop: '4px' }}>
 <span style={{ color: s.muted }}> Residential savings</span>
 <span style={{ color: '#b7c4b0', fontWeight: 500 }}>−€{residentialSavingAmount % 1 === 0 ? residentialSavingAmount : residentialSavingAmount.toFixed(2)}</span>
 </div>
 )}
 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.06)', fontSize: '14px', marginTop: '4px' }}>
 <span style={{ color: s.muted }}>Payment</span>
 <span style={{ color: s.text, fontWeight: 500 }}>{foPayment === '' ? 'Not chosen yet' : foPayment === 'cash' ? ' Cash' : foPayment === 'bank' ? ' Transfer' : foPayment === 'revolut' ? ' Revolut' : foPayment === 'card' ? ' Card' : ' Payment Link'}</span>
 </div>
 </>
 ) : (
 // ── Group mode: flat list ─────────────────────────────────────────
 [
 [`${foProduct} × ${foGuests}`, `€${totalBaseAmount}`, foSessionsPicked.slice(ssuOffset).map(p => ({ text: `${fmtEu(p.date)} · ${p.session.toUpperCase()}`, kind: 'dive' as const }))],
 totalInsuranceCost > 0 ? [`DAN Insurance`, `€${totalInsuranceCost}`] : null,
 ...(foGroupFullEquipment && !groupEquipRule.included && fullEquipProduct
 ? [[` Full Equipment × ${foGuests}`, `€${getEP(fullEquipProduct) * foGuests * foGroupNumDays}`]]
 : totalEquipCost > 0 ? [[`Equipment`, `€${totalEquipCost}`]] : []),
 ...(foGroupEquipmentItems.length > 0
 ? foGroupEquipmentItems.map(name => {
 const p = foProductsList.find(x => x.name === name)
 return p ? [`${name} × ${foGuests}`, `€${getEP(p) * foGuests * foGroupNumDays}`] : null
 }).filter(Boolean)
 : []),
 ...foGroupAddonItems.map(name => {
 const p = foProductsList.find(x => x.name === name)
 if (!p) return null
 const days = foGroupAddonDays[name]
 const numDays = (days && days.length > 0) ? days.length : foGroupNumDays
 return [`${name} × ${foGuests}${numDays !== foGroupNumDays ? ` (${numDays}d)` : ''}`, `€${getEP(p) * foGuests * numDays}`, (days && days.length > 0 && numDays !== foGroupNumDays) ? days.map(d => ({ text: fmtEu(d), kind: 'dive' as const })) : undefined]
 }).filter(Boolean),
 ...foCustomLines.filter(l => l.label.trim()).map(l => [` ${l.label}`, `€${l.amount}`]),
 ...foExtraLines.map(line => {
 const p = foProductsList.find(x => x.name === line.product)
 return p ? [line.product, `€${getEP(p)}`] : null
 }),
 ssuProduct ? [` Scuba Skills Update`, `€${ssuCost}`, refresherDate ? [{ text: `${fmtEu(refresherDate)} · pool & shallow water`, kind: 'ssu' as const }] : undefined] : null,
 foResidential ? [` Residential / Erasmus`, residentialSavingAmount > 0 ? `−€${residentialSavingAmount % 1 === 0 ? residentialSavingAmount : residentialSavingAmount.toFixed(2)}` : `discount applied`] : null,
 ['Payment', foPayment === '' ? 'Not chosen yet' : foPayment === 'cash' ? ' Cash' : foPayment === 'bank' ? ' Transfer' : foPayment === 'revolut' ? ' Revolut' : foPayment === 'card' ? ' Card' : ' Payment Link'],
 ].filter(Boolean).map((row) => {
 const [l, v, chips] = row as [string, string, Array<{ text: string; kind: 'dive' | 'ssu' }> | undefined]
 return (
 <div key={l} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: '14px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 <span style={{ color: s.muted }}>{l}</span>
 <span style={{ color: s.text, fontWeight: 500 }}>{v}</span>
 </div>
 {chips && chips.length > 0 && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
 {chips.map((c, ci) => (
 <span key={ci} style={{ fontSize: '14px', fontWeight: 500, padding: '2px 8px', borderRadius: 0, fontVariantNumeric: 'tabular-nums',
 background: c.kind === 'ssu' ? 'rgba(212,160,122,.12)' : 'rgba(243,239,230,.1)', border: `1px solid ${c.kind === 'ssu' ? 'rgba(212,160,122,.35)' : 'rgba(243,239,230,.3)'}`, color: c.kind === 'ssu' ? '#d4a07a' : s.accent }}>
 {c.kind === 'ssu' ? ' ' : ' '}{c.text}
 </span>
 ))}
 </div>
 )}
 </div>
 )
 })
 )}
 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontSize: '22px', fontWeight: 500 }}>
 <span style={{ color: s.text }}>Total</span>
 <span style={{ color: s.accent }}>€{grandTotal}</span>
 </div>
 </div>
 {!isSim && (
 <label style={{
 display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
 padding: '10px 12px', borderRadius: 0,
 background: effectiveIsTest ? 'rgba(201,180,138,.1)' : 'rgba(255,255,255,.03)',
 border: `1px solid ${effectiveIsTest ? 'rgba(201,180,138,.45)' : 'rgba(255,255,255,.08)'}`,
 cursor: isSim ? 'default' : 'pointer',
 }}>
 <input type="checkbox" checked={effectiveIsTest} disabled={isSim}
 onChange={e => setFoIsTest(e.target.checked)}
 style={{ width: '16px', height: '16px', accentColor: '#c9b48a', cursor: isSim ? 'default' : 'pointer', flexShrink: 0 }} />
 <span style={{ fontSize: '14px', color: effectiveIsTest ? '#c9b48a' : s.muted, lineHeight: 1.5 }}>
 <b>Test booking</b> — created as test data, visible to admins only, never invoiced.
 {isSim && ' Always on in the Simulator.'}
 </span>
 </label>
 )}
 <button
 onClick={async () => {
 if (!allPicked || foLoading || !foPayment) return
 if (!foNifValid) { alert('Tax number / NIF has an invalid format — fix it or leave the field empty (Consumidor Final).'); return }
 setFoLoading(true)
 // --- Split + Payment Link: per-guest Stripe checkout + pending booking ---
 if (foSplit && foPayment === 'link') {
 try {
 const session = await supabase.auth.getSession()
 const token = session.data.session?.access_token
 if (!token) throw new Error('Not authenticated')
 for (let gi = 0; gi < foGuestEntries.length; gi++) {
 const ge = foGuestEntries[gi]
 const geProd = foProductsList.find(p => p.name === ge.product)
 const geNd = new Set(ge.sessions.map(s2 => s2.date)).size || 1
 const geEquipCost = ge.fullEquipment && !equipRuleFor(ge.product).included && fullEquipProduct
 ? fullEquipProduct.price * geNd
 : computeEquipCost(ge.equipmentItems) * geNd
 const geAddonCost = ge.addonItems.reduce((s2, n) => {
 const p = foProductsList.find(x => x.name === n)
 return s2 + (p?.price ?? 0) * geNd
 }, 0) + geExtraCost(ge)
 const totalCents = Math.round(((geProd?.price ?? 0) + (ge.insurance === 'add' ? computeGuestInsuranceCost(ge.sessions) : 0) + geEquipCost + geAddonCost) * 100)
 const amountCents = foDepositOnly ? Math.ceil(totalCents / 2) : totalCents
 const firstSess = ge.sessions[0]
 const gEmail = ge.email.trim().toLowerCase()
 if (!gEmail) throw new Error(`Guest ${gi + 1} has no email — required for payment link`)

 // Create Stripe checkout for this guest
 const checkoutRes = await fetch('/api/fo-checkout', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
 body: JSON.stringify({
 amount_cents: amountCents,
 product_name: ge.product,
 customer_email: gEmail,
 sessions: ge.sessions.map(sv => ({ date: sv.date, session: sv.session.toLowerCase() })),
 is_deposit: foDepositOnly,
 total_cents: foDepositOnly ? totalCents : undefined,
 is_test: effectiveIsTest,
 }),
 })
 const checkoutData = await checkoutRes.json()
 if (!checkoutRes.ok || !checkoutData.url) throw new Error(checkoutData.error ?? `Could not create checkout for guest ${gi + 1}`)

 // Write pending booking (will be confirmed by Stripe webhook)
 const gToken = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,'0')).join('')
 const gExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
 const { data: gIns, error: gErr } = await supabase
 .from('bookings')
 .insert({
 source: 'azd',
 product_type: productTypeFor(ge.product, geProd?.category),
 product_name: ge.product,
 booking_date: firstSess?.date ?? null,
 session: firstSess?.session?.toLowerCase() ?? null,
 group_size: 1,
 status: 'pending',
 stripe_session_id: checkoutData.id,
 checkin_token: gToken,
 checkin_token_expires_at: gExpires,
 ...buildGuestBookingExtras(ge),
 staff_notes: foNotes.trim() || null, // nur echte Staff-Notizen — Buchungsdaten stehen in booking_extras / booking_sessions / booking_payments
 customer_nif: foNifClean || null,
 amount: totalCents,
 currency: 'eur',
 customer_name: `${ge.firstName} ${ge.lastName}`.trim() || null,
 customer_email: gEmail,
 is_test: effectiveIsTest,
 payment_method: 'link',
 last_dive_date: ge.lastDive || null,
 refresher_required: !!(ge.lastDive && (Date.now() - new Date(ge.lastDive).getTime()) > 365*24*60*60*1000),
 }).select('id').single()
 if (gErr) throw gErr
 if (gi === 0 && gIns?.id) setFoCreatedBookingId(gIns.id)

 // Send payment request email
 await fetch('/api/send-payment-request', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
 body: JSON.stringify({
 booking_id: checkoutData.id, // use session id as reference (booking lookup by stripe_session_id handled server-side)
 payment_method: 'link',
 is_deposit: foDepositOnly,
 to_email: gEmail,
 guest_name: `${ge.firstName} ${ge.lastName}`.trim() || null,
 checkout_url: checkoutData.url,
 amount_cents: amountCents,
 }),
 })
 }
 setFoSubmitted(true)
 } catch (e) {
 alert('Error generating split payment links — ' + String(e))
 } finally {
 setFoLoading(false)
 }
 return
 }
 // --- Create Link: Single Stripe Checkout URL ---
 if (foPayment === 'link') {
 setFoLinkUrl(null)
 try {
 const session = await supabase.auth.getSession()
 const token = session.data.session?.access_token
 const gEmail = foEmail.trim().toLowerCase()
 const totalCents = Math.round(grandTotal * 100)
 // If deposit mode: use fo-checkout (custom amount + deposit flag)
 if (foDepositOnly && gEmail && token) {
 const amountCents = Math.ceil(totalCents / 2)
 const checkoutRes = await fetch('/api/fo-checkout', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
 body: JSON.stringify({
 amount_cents: amountCents,
 product_name: foProduct,
 customer_email: gEmail,
 sessions: foSessionsPicked.slice(ssuOffset).map(sv => ({ date: sv.date, session: sv.session.toLowerCase() })),
 is_deposit: true,
 total_cents: totalCents,
 is_test: effectiveIsTest,
 }),
 })
 const checkoutData = await checkoutRes.json()
 if (!checkoutRes.ok || !checkoutData.url) throw new Error(checkoutData.error ?? 'Could not create deposit link')
 // Write pending booking (confirmed by webhook when paid)
 const pToken = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,'0')).join('')
 const { data: insertedBooking, error: insertDepositErr } = await supabase.from('bookings').insert({
 source: 'azd',
 product_type: productTypeFor(foProduct, selectedProduct?.category),
 product_name: foProduct,
 booking_date: foDate,
 session: foSession.toLowerCase(),
 group_size: foGuests,
 status: 'pending',
 stripe_session_id: checkoutData.id,
 checkin_token: pToken,
 checkin_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
 amount: totalCents,
 currency: 'eur',
 customer_name: foName || null,
 customer_email: gEmail,
 is_test: effectiveIsTest,
 payment_method: 'link',
 staff_notes: foNotes.trim() || null, // nur echte Staff-Notizen — Deposit-Fakt steht in booking_payments + Changelog
 customer_nif: foNifClean || null,
 }).select('id').single()
 if (insertDepositErr) console.error('[FO deposit insert]', insertDepositErr)
 if (insertedBooking?.id) {
 await supabase.from('booking_changelog').insert({
 booking_id: insertedBooking.id,
 action: 'deposit_link_created',
 description: ` Deposit link sent — 50% (€${(amountCents / 100).toFixed(2)}) upfront, €${((totalCents - amountCents) / 100).toFixed(2)} due on arrival`,
 changed_by_email: (await supabase.auth.getUser()).data.user?.email ?? null,
 }).then(({ error }) => { if (error) console.warn('[FO deposit] changelog:', error) })
 void auditFromClient(supabase, { bookingId: insertedBooking.id, action: 'deposit_link_created', description: `Deposit link sent — 50% (€${(amountCents / 100).toFixed(2)}) upfront, €${((totalCents - amountCents) / 100).toFixed(2)} due on arrival` })
 }
 // Audit K3: Vorab-Buchung sofort mit Gäste-Slots und Tauchtagen anlegen — wie ein Walk-in mit Bank.
 // Sonst hält die Buchung bis zur Zahlung keinen Platz und ist auf keiner Bootskarte; der Webhook
 // legt beides nur nach, wenn es fehlt (idempotent).
 if (insertedBooking?.id) {
 const depSlots = Array.from({ length: foGuests }, (_, i) => ({
 booking_id: insertedBooking.id, slot_index: i, is_minor: false, is_test: effectiveIsTest,
 guest_name: ((i === 0 ? (foGuestNames[0] || foName) : foGuestNames[i]) ?? '').trim() || null,
 last_dive_date: (foGuests <= 1 ? foLastDive : (foGuestLastDives[i] ?? '')) || null,
 }))
 const { error: depSlotErr } = await supabase.from('booking_customers').insert(depSlots)
 if (depSlotErr) console.warn('[FO deposit] booking_customers:', depSlotErr.message)
 const depSessions = foSessionsPicked.slice(ssuOffset)
 if (ssuOffset === 1 && foSessionsPicked[0]) {
 const sd = foSessionsPicked[0]
 const { error: ssuErr } = await supabase.from('booking_sessions').insert({ booking_id: insertedBooking.id, session_date: sd.date, session: sd.session.toLowerCase(), seats: foGuests, is_boat_day: false, notes: 'Scuba Skills Update', is_test: effectiveIsTest, status: 'booked' })
 if (ssuErr) console.warn('[FO deposit] SSU session:', ssuErr.message)
 }
 if (depSessions.length > 0) {
 const isCourseCatDep = ['entry','specialty','ecology','pro'].includes(selectedProduct?.category ?? '')
 const bdDep = isCourseCatDep ? (selectedProduct?.boatDays ?? null) : null
 const sortedDep = [...depSessions].sort((a, b) => a.date.localeCompare(b.date) || sessionRank(a.session) - sessionRank(b.session))
 const firstBoatIdxDep = bdDep === null ? 0 : Math.max(0, sortedDep.length - bdDep)
 const { error: depSessErr } = await supabase.from('booking_sessions').insert(
 depSessions.map(sv => ({
 booking_id: insertedBooking.id, session_date: sv.date, session: sv.session.toLowerCase(), seats: foGuests,
 is_boat_day: sv.session === 'night' ? false : bdDep === null ? true : sortedDep.indexOf(sv) >= firstBoatIdxDep, is_test: effectiveIsTest, status: 'booked',
 }))
 )
 if (depSessErr) console.warn('[FO deposit] booking_sessions:', depSessErr.message)
 }
 }
 // Send payment request email with correct booking UUID
 setFoEmailStatus('sending')
 fetch('/api/send-payment-request', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
 body: JSON.stringify({
 booking_id: insertedBooking?.id ?? undefined,
 stripe_session_id: checkoutData.id,
 payment_method: 'link',
 is_deposit: true,
 to_email: gEmail,
 guest_name: foName || null,
 checkout_url: checkoutData.url,
 amount_cents: amountCents,
 total_amount_cents: totalCents,
 inline_product_name: foProduct,
 inline_sessions: foSessionsPicked.slice(ssuOffset).map(sv => ({ date: sv.date, session: sv.session.toLowerCase() })),
 inline_is_test: effectiveIsTest,
 }),
 }).then(r => r.json()).then(d => {
 if (d.ok) setFoEmailStatus('sent')
 else setFoEmailStatus(`error:${d.error ?? 'unbekannt'}`)
 }).catch(e => { setFoEmailStatus(`error:${e.message}`) })
 setFoLinkUrl(checkoutData.url)
 setFoCreatedBookingId(insertedBooking?.id ?? null)
 setFoSubmitted(true)
 } else {
 // Standard full-price checkout (existing flow)
 // Build equipment + addon items for Stripe line items
 const foStdAddons: { product_id: string; quantity: number }[] = []
 if (foGroupFullEquipment && !groupEquipRule.included && fullEquipProduct) {
 foStdAddons.push({ product_id: fullEquipProduct.id, quantity: foGuests * foGroupNumDays })
 }
 for (const eqName of foGroupEquipmentItems) {
 const ep = equipProductsList.find(x => x.name === eqName)
 if (ep) foStdAddons.push({ product_id: ep.id, quantity: foGuests * foGroupNumDays })
 }
 for (const addonName of foGroupAddonItems) {
 const ap = foProductsList.find(x => x.name === addonName)
 if (!ap) continue
 const adDays = foGroupAddonDays[addonName]
 const numAddonDays = (adDays && adDays.length > 0) ? adDays.length : foGroupNumDays
 foStdAddons.push({ product_id: ap.id, quantity: foGuests * numAddonDays })
 }
 // foExtraLines: extras added manually via the extra line picker
 for (const line of foExtraLines) {
 const ep = foProductsList.find(x => x.name === line.product)
 if (ep) foStdAddons.push({ product_id: ep.id, quantity: 1 })
 }
 // ssuProduct (Scuba Skills Update): automatisch bei > 12 Monate letztem Tauchgang
 // (Der Server legt das SSU selbst in den Warenkorb, seit 25.10. — hier KEIN Addon mehr, sonst doppelt; er braucht nur refresher_date.)
 const staffTokenStd = (await supabase.auth.getSession()).data.session?.access_token
 if (effectiveIsTest && !staffTokenStd) throw new Error('Session expired — please sign in again (test bookings need a staff login, otherwise the payment link would be LIVE).')
 const res = await fetch('/api/checkout', {
 method: 'POST',
 // Bearer = Staff-Override im Checkout: kein 18:00-Cutoff, keine Kapazitätssperre (Walk-in am selben Tag)
 headers: { 'content-type': 'application/json', ...(staffTokenStd ? { authorization: `Bearer ${staffTokenStd}` } : {}) },
 body: JSON.stringify({
 product_id: selectedProduct?.id,
 sessions: foSessionsPicked.slice(ssuOffset).map(sv => ({ date: sv.date, session: sv.session.toLowerCase() })),
 group_size: foGuests,
 customer_email: gEmail || undefined,
 is_test: effectiveIsTest,
 terms_accepted: true,
 ...foLastDivePayload(),
 ...(ssuProduct && foSessionsPicked[0]?.date ? { refresher_date: foSessionsPicked[0].date } : {}),
 ...(foGroupInsurance === 'add' ? { insurance_requested: true, insurance_choice: 'azd' } : {}),
 ...(foGroupInsurance === 'own' ? { insurance_choice: 'own' } : {}),
 ...(foStdAddons.length > 0 ? { addons: foStdAddons } : {}),
 // foCustomLines: freeform Zusatzposten (label + Betrag)
 ...(foCustomLines.filter(l => l.label.trim() && l.amount > 0).length > 0 ? {
 custom_items: foCustomLines
 .filter(l => l.label.trim() && l.amount > 0)
 .map(l => ({ label: l.label.trim(), amount_cents: Math.round(l.amount * 100) })),
 } : {}),
 }),
 })
 const data = await res.json()
 if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not create link')
 setFoLinkUrl(data.url)
 setFoSubmitted(true)
 // Pre-create booking in DB so it appears in history immediately
 // (webhook will confirm it on payment)
 const totalCentsStd = Math.round(grandTotal * 100)
 const pTokenStd = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,'0')).join('')
 const { data: insertedStdBooking, error: insertStdErr } = await supabase.from('bookings').insert({
 source: 'azd',
 product_type: productTypeFor(foProduct, selectedProduct?.category),
 product_name: foProduct,
 booking_date: foDate,
 session: foSession.toLowerCase(),
 group_size: foGuests,
 status: 'pending',
 stripe_session_id: data.id,
 checkin_token: pTokenStd,
 checkin_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
 amount: totalCentsStd,
 currency: 'eur',
 customer_name: foName || null,
 customer_email: gEmail || null,
 is_test: effectiveIsTest,
 payment_method: 'link',
 ...(foNotes ? { staff_notes: foNotes } : {}),
 customer_nif: foNifClean || null,
 ...buildGroupBookingExtras(),
 }).select('id').single()
 if (insertStdErr) console.error('[FO std insert]', insertStdErr)
 setFoCreatedBookingId(insertedStdBooking?.id ?? null)
 if (insertedStdBooking?.id) {
 await supabase.from('booking_changelog').insert({
 booking_id: insertedStdBooking.id,
 action: 'booking_created',
 description: ` Booking created (Front Office — Stripe payment link, €${(totalCentsStd / 100).toFixed(2)})`,
 changed_by_email: (await supabase.auth.getUser()).data.user?.email ?? null,
 }).then(({ error }) => { if (error) console.warn('[FO std] changelog:', error) })
 void auditFromClient(supabase, { bookingId: insertedStdBooking.id, action: 'booking_created', description: `Booking created (Front Office — Stripe payment link, €${(totalCentsStd / 100).toFixed(2)})` })
 }
 // Send payment link email if guest email provided
 if (gEmail && token) {
 setFoEmailStatus('sending')
 fetch('/api/send-payment-request', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
 body: JSON.stringify({
 booking_id: insertedStdBooking?.id ?? undefined,
 stripe_session_id: data.id,
 payment_method: 'link',
 is_deposit: false,
 to_email: gEmail,
 guest_name: foName || null,
 checkout_url: data.url,
 amount_cents: totalCentsStd,
 inline_product_name: foProduct,
 inline_sessions: foSessionsPicked.slice(ssuOffset).map(sv => ({ date: sv.date, session: sv.session.toLowerCase() })),
 inline_is_test: effectiveIsTest,
 }),
 }).then(r => r.json()).then(d => {
 if (d.ok) setFoEmailStatus('sent')
 else setFoEmailStatus(`error:${d.error ?? 'unbekannt'}`)
 }).catch(e => { setFoEmailStatus(`error:${e.message}`) })
 }
 }
 } catch (e) {
 alert('Error generating link — ' + String(e))
 } finally {
 setFoLoading(false)
 }
 return
 }
 // --- Walk-in Booking Split (per-guest, no payment link) ---
 if (foSplit) {
 const { data: { user: foSplitUser } } = await supabase.auth.getUser()
 const foSplitStaffEmail = foSplitUser?.email ?? null
 const results: { token: string; bookingId: string }[] = []
 for (let gi = 0; gi < foGuestEntries.length; gi++) {
 const ge = foGuestEntries[gi]
 const geProd = foProductsList.find(p => p.name === ge.product)
 const gToken = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,'0')).join('')
 const gExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
 const firstSess = ge.sessions[0]
 const geNd = new Set(ge.sessions.map(s2 => s2.date)).size || 1
 const geEquipCost = ge.fullEquipment && !equipRuleFor(ge.product).included && fullEquipProduct
 ? fullEquipProduct.price * geNd
 : computeEquipCost(ge.equipmentItems) * geNd
 const geAddonCost = ge.addonItems.reduce((s2, n) => {
 const p = foProductsList.find(x => x.name === n)
 return s2 + (p?.price ?? 0) * geNd
 }, 0) + geExtraCost(ge)
 const { data: gBooking, error: gErr } = await supabase
 .from('bookings')
 .insert({
 source: 'azd',
 product_type: productTypeFor(ge.product, geProd?.category),
 product_name: ge.product,
 booking_date: firstSess?.date ?? null,
 session: firstSess?.session?.toLowerCase() ?? null,
 group_size: 1,
 status: 'pending', // auch Cash: confirmed erst, wenn die Zahlung im Payments-Tab erfasst ist (setzt paid_at)
 sessions_expected: ge.sessions.length,
 checkin_token: gToken,
 checkin_token_expires_at: gExpires,
 // Split = EINE Buchung mit Kind-Buchungen pro Gast: Gast 1 ist die Hauptbuchung,
 // alle weiteren hängen per parent_booking_id daran (FO listet sie gruppiert).
 ...(results[0]?.bookingId ? { parent_booking_id: results[0].bookingId } : {}),
 ...insuranceFieldsFor(insuranceSkipFor(ge.product) ? null : ge.insurance, ge.sessions, 1),
 ...buildGuestBookingExtras(ge),
 staff_notes: foNotes.trim() || null, // nur echte Staff-Notizen — Buchungsdaten stehen in booking_extras / booking_sessions / booking_payments
 customer_nif: foNifClean || null,
 amount: Math.round(((geProd?.price ?? 0) + (ge.insurance === 'add' ? computeGuestInsuranceCost(ge.sessions) : 0) + geEquipCost + geAddonCost) * 100),
 currency: 'eur',
 customer_name: `${ge.firstName} ${ge.lastName}`.trim() || null,
 customer_email: ge.email.trim().toLowerCase() || null,
 is_test: effectiveIsTest,
 payment_method: foPayment,
 last_dive_date: ge.lastDive || null,
 refresher_required: !!(ge.lastDive && (Date.now() - new Date(ge.lastDive).getTime()) > 365*24*60*60*1000),
 })
 .select('id')
 .single()
 if (gErr || !gBooking) throw gErr ?? new Error(`No booking for guest ${gi + 1}`)
 await supabase.from('booking_customers').insert({ booking_id: gBooking.id, slot_index: 0, is_minor: false, is_test: effectiveIsTest, guest_name: `${ge.firstName} ${ge.lastName}`.trim() || null, last_dive_date: ge.lastDive || null })
 // Create booking_sessions entries so Sessions tab shows the dive dates
 if (ge.sessions.length > 0) {
 const isCourseCat = ['entry','specialty','ecology','pro'].includes(geProd?.category ?? '')
 const bd = isCourseCat ? (geProd?.boatDays ?? null) : null
 const sorted = [...ge.sessions].sort((a, b) => a.date.localeCompare(b.date) || sessionRank(a.session) - sessionRank(b.session))
 const firstBoatIdx = bd === null ? 0 : Math.max(0, sorted.length - bd)
 const { error: gSessErr } = await supabase.from('booking_sessions').insert(
 ge.sessions.map(sv => ({
 booking_id: gBooking.id,
 session_date: sv.date,
 session: sv.session.toLowerCase(),
 seats: 1,
 is_boat_day: sv.session === 'night' ? false : bd === null ? true : sorted.indexOf(sv) >= firstBoatIdx,
 is_test: effectiveIsTest,
 status: 'booked',
 }))
 )
 if (gSessErr) console.warn('[FO] booking_sessions insert (split):', gSessErr)
 }
 await requestInstructorTicket(gBooking.id, ge.sessions)
 // Changelog entry with staff email for transparency
 await supabase.from('booking_changelog').insert({
 booking_id: gBooking.id,
 action: 'booking_created',
 description: ` Booking created (Walk-in split — guest ${gi + 1})`,
 changed_by_email: foSplitStaffEmail,
 }).then(({ error }) => { if (error) console.warn('[FO] changelog insert (split):', error) })
 void auditFromClient(supabase, { bookingId: gBooking.id, action: 'booking_created', description: `Booking created (Walk-in split — guest ${gi + 1})` })
 results.push({ token: gToken, bookingId: gBooking.id })
 const geEmail = ge.email.trim().toLowerCase()
 if (foPayment === 'cash' && geEmail) void sendWalkinConfirmation(gBooking.id, geEmail)
 // Zahlungsaufforderung (bank/revolut) geht nicht mehr beim Anlegen raus, sondern erst nach dem Pflichtschritt
 // "What happened with the payment?" und nur, wenn etwas offen bleibt (PaymentDecision, Lucas 06.11.2026).
 if (foPayment !== 'cash') {
 fetch('/api/walkin-invoice', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
 body: JSON.stringify({ booking_id: gBooking.id, payment_method: foPayment, product_id: geProd?.id }),
 }).then(r => r.json()).then(d => { if (!d.ok && !d.skipped) console.warn('[FO] walkin-invoice (split):', d) })
 .catch(e => console.error('[FO] walkin-invoice error (split):', e))
 }
 }
 setFoCheckinToken(results[0]?.token ?? null)
 setFoCreatedBookingId(results[0]?.bookingId ?? null)
 setFoPayNote(null); setFoPayReqFailed([]); setFoPayDecide(['cash', 'bank', 'revolut'].includes(foPayment) ? results.map(r => r.bookingId) : null)
 setFoSubmitted(true)
 setFoLoading(false)
 return
 }
 // --- Walk-in Booking (Gruppe, kein Split) ---
 try {
 const { data: { user: foGroupUser } } = await supabase.auth.getUser()
 const foGroupStaffEmail = foGroupUser?.email ?? null
 const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
 .map(b => b.toString(16).padStart(2, '0')).join('')
 const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
 const { data: booking, error: bookingError } = await supabase
 .from('bookings')
 .insert({
 source: 'azd',
 product_type: productTypeFor(foProduct, selectedProduct?.category),
 product_name: foProduct,
 booking_date: foDate,
 session: foSession.toLowerCase(),
 group_size: foGuests,
 status: 'pending', // auch Cash: confirmed erst, wenn die Zahlung im Payments-Tab erfasst ist (setzt paid_at)
 checkin_token: token,
 checkin_token_expires_at: expires,
 ...buildGroupBookingExtras(),
 ...insuranceFieldsFor(insuranceSkip ? null : foGroupInsurance, foSessionsPicked, foGuests),
 staff_notes: foNotes.trim() || null, // nur echte Staff-Notizen — Buchungsdaten stehen in booking_extras / booking_sessions / booking_payments
 customer_nif: foNifClean || null,
 amount: Math.round(grandTotal * 100),
 currency: 'eur',
 customer_name: foName || null,
 customer_email: foEmail.trim().toLowerCase() || null,
 // Muss explizit gesetzt werden: der Spalten-Default ist true,
 // damit eine vergessene Angabe im Test landet und nicht in den Echtdaten.
 is_test: effectiveIsTest,
 payment_method: foPayment,
 last_dive_date: foLastDive || null,
 refresher_required: needsRefresher,
 sessions_expected: foSessionsPicked.length,
 })
 .select('id')
 .single()
 if (bookingError || !booking) throw bookingError ?? new Error('No booking returned')
 const slots = Array.from({ length: foGuests }, (_, i) => ({
 booking_id: booking.id,
 slot_index: i,
 is_minor: false,
 is_test: effectiveIsTest,
 // Name vor dem Check-in — Gast 1 fällt auf den Zahler zurück
 guest_name: ((i === 0 ? (foGuestNames[0] || foName) : foGuestNames[i]) ?? '').trim() || null,
 // Letzter Tauchgang pro Gast (Einzelgast: das eine Feld) — Check-in fragt dann nicht erneut
 last_dive_date: (foGuests <= 1 ? foLastDive : (foGuestLastDives[i] ?? '')) || null,
 }))
 const { error: slotsError } = await supabase.from('booking_customers').insert(slots)
 if (slotsError) { console.error('[FO] booking_customers insert failed:', slotsError); alert(`Booking saved, but guest slots failed: ${slotsError.message}`) }
 // Create booking_sessions entries so Sessions tab shows the dive dates
 if (foSessionsPicked.length > 0) {
 const isCourseCatGroup = ['entry','specialty','ecology','pro'].includes(selectedProduct?.category ?? '')
 const bdGroup = isCourseCatGroup ? (selectedProduct?.boatDays ?? null) : null
 // Scuba Skills Update = Pool-/Instructor-Tag (Index 0), KEIN Bootstag; die Bootslogik gilt nur für die übrigen Tage
 const ssuDayGroup = ssuProduct ? foSessionsPicked[0] : undefined
 const sortedGroup = [...foSessionsPicked].filter(x => x !== ssuDayGroup).sort((a, b) => a.date.localeCompare(b.date) || sessionRank(a.session) - sessionRank(b.session))
 const firstBoatIdxGroup = bdGroup === null ? 0 : Math.max(0, sortedGroup.length - bdGroup)
 const { error: gSessErr } = await supabase.from('booking_sessions').insert(
 foSessionsPicked.map(sv => ({
 booking_id: booking.id,
 session_date: sv.date,
 session: sv.session.toLowerCase(),
 seats: foGuests,
 is_boat_day: sv === ssuDayGroup ? false : sv.session === 'night' ? false : bdGroup === null ? true : sortedGroup.indexOf(sv) >= firstBoatIdxGroup,
 ...(sv === ssuDayGroup ? { notes: 'Scuba Skills Update' } : {}),
 is_test: effectiveIsTest,
 status: 'booked',
 }))
 )
 if (gSessErr) console.warn('[FO] booking_sessions insert (group):', gSessErr)
 }
 await requestInstructorTicket(booking.id, foSessionsPicked)
 // Changelog entry with staff email for transparency
 await supabase.from('booking_changelog').insert({
 booking_id: booking.id,
 action: 'booking_created',
 description: ' Booking created (Walk-in)',
 changed_by_email: foGroupStaffEmail,
 }).then(({ error }) => { if (error) console.warn('[FO] changelog insert (group):', error) })
 void auditFromClient(supabase, { bookingId: booking.id, action: 'booking_created', description: 'Booking created (Walk-in)' })
 setFoCheckinToken(token)
 setFoCreatedBookingId(booking.id)
 setFoPayNote(null); setFoPayReqFailed([]); setFoPayDecide(['cash', 'bank', 'revolut'].includes(foPayment) ? [booking.id] : null)
 setFoSubmitted(true)
 // Cash: Bestätigung + Check-in-Link sofort per Mail (Online macht das der Webhook)
 if (foPayment === 'cash' && foEmail.trim()) void sendWalkinConfirmation(booking.id, foEmail.trim().toLowerCase())
 // Zahlungsaufforderung (bank/revolut) geht nicht mehr beim Anlegen raus, sondern erst nach dem Pflichtschritt
 // "What happened with the payment?" und nur, wenn etwas offen bleibt (PaymentDecision, Lucas 06.11.2026).
 // Keyinvoice für non-Cash Walk-in Zahlungen (Feature-Flag WALKIN_KEYINVOICE_ENABLED)
 if (foPayment !== 'cash') {
 fetch('/api/walkin-invoice', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
 body: JSON.stringify({ booking_id: booking.id, payment_method: foPayment, product_id: selectedProduct?.id }),
 }).then(r => r.json()).then(d => {
 if (d.ok) console.log('[FO] Keyinvoice Walk-in:', d.doc)
 else if (!d.skipped) console.warn('[FO] walkin-invoice:', d)
 }).catch(e => console.error('[FO] walkin-invoice error:', e))
 }
 } catch (e) {
 console.error('[FO] create booking error:', e)
 alert('Error creating booking — check console for details.')
 } finally {
 setFoLoading(false)
 }
 }}
 style={{ width: '100%', padding: '13px', borderRadius: 0, border: 'none', background: allPicked && !foLoading && !!foEmail.trim() && !!foPhone.trim() && !!foPayment ? s.accent : 'rgba(255,255,255,.08)', color: allPicked && !foLoading && !!foEmail.trim() && !!foPhone.trim() && !!foPayment ? '#090909' : s.muted, fontWeight: 500, fontSize: '15px', cursor: allPicked && !foLoading && !!foEmail.trim() && !!foPhone.trim() && !!foPayment ? 'pointer' : 'default', fontFamily: s.font }}
 >
 {foLoading ? (foPayment === 'link' ? 'Generating…' : 'Creating…') : foMissing.length > 0 ? `Missing: ${foMissing.join(' · ')}` : foPayment === 'link' ? ' Generate Payment Link' : 'Create booking & send check-in link'}
 </button>
 </div>
 )}
 </div>
 )}


 {/* Online booking — the guest path. Same button as the site header. Simulator = Stripe test, Quick Booking (Production) = real money. */}
 {(foTab === 'simulator' || foTab === 'walkin') && (
 <div style={{
 marginTop: '20px', padding: '22px 24px', borderRadius: 0,
 background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
 display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap',
 }}>
 <div style={{ flex: '1 1 300px', lineHeight: 1.55 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '6px' }}>{isSim ? 'Simulate an online booking' : 'Online booking — REAL payment'}</div>
 <div style={{ fontSize: '14px', color: s.sub }}>
 {isSim
 ? 'The form above simulates a walk-in. This is the other path: the same button a guest sees in the site header. It opens the public booking page with the values above, then Stripe test checkout and online check-in.'
 : 'Opens the public booking page with the values above, exactly as a guest sees it. Checkout uses the live Stripe account: a real card is charged and a real booking is created.'}
 </div>
 </div>
 <button type="button" onClick={openGuestView} style={{
 padding: '13px 32px', borderRadius: 0, border: 'none', cursor: 'pointer',
 background: 'linear-gradient(135deg, #f3efe6, #c9c2b6)', color: '#000',
 fontWeight: 500, fontSize: '15px', fontFamily: s.font,
 boxShadow: 'none', whiteSpace: 'nowrap',
 }}>Book now</button>
 </div>
 )}
 </>)}

 {/* Booking History */}
 {foSection === 'history' && (
 <div style={{ padding: '4px 0' }}>
 <FrontOfficeBookings key={foOpenBookingId ?? 'list'} expandBookingId={foOpenBookingId ?? undefined} />
 </div>
 )}

 {/* Booking Requests (Low Season): eigener Tab, getrennt von der Historie */}
 {foSection === 'requests' && (
 <div style={{ padding: '4px 0' }}>
 <FrontOfficeBookings key={`requests:${foOpenBookingId ?? ''}`} requestsOnly expandBookingId={foOpenBookingId ?? undefined} />
 </div>
 )}

 {/* Cash refunds: Front Office gibt Bargeld selbst frei */}
 {foSection === 'cash' && <CashRefunds sandbox={foSandbox} onChanged={() => setFoCashTick(n => n + 1)} />}

 {/* DAN Export */}
 {foSection === 'dan' && (
 <div style={{ padding: isMobile ? '14px' : '24px' }}>
 {/* Info banner */}
 <div style={{ background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '14px 18px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
 <span style={{ fontSize: '18px', flexShrink: 0 }}></span>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent, marginBottom: '4px' }}>DAN Batch-Export</div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.55 }}>Every checked-in diver with DAN cover (bought with the booking or at the centre), one row per dive day, that has not been submitted yet. Download the .xls, upload it in the DAN portal, then click „Mark as submitted“ — only the rows of that file are marked. A dive day that is moved or cancelled after submission opens a correction ticket.</div>
 </div>
 </div>

 {/* Modus folgt dem globalen Schalter */}
 <div style={{ marginBottom: '20px', fontSize: '14px', fontWeight: 500, color: danTestMode ? '#c9b48a' : s.muted }}>
 {danTestMode ? ' Sandbox — test bookings only' : ' Production — real bookings only'}
 <span style={{ fontWeight: 400, color: s.muted }}> · switch at the top right (next to Sign out)</span>
 </div>

 {danLoading && <div style={{ color: s.muted, fontSize: '14px', padding: '20px 0' }}>Loading…</div>}
 {danMsg && <div style={{ color: '#c9928c', fontSize: '14px', padding: '12px 0' }}>{danMsg}</div>}

 {danInfo && !danLoading && (
 <div>
 {/* Stats */}
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '28px' }}>
 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '16px 18px' }}>
 <div style={{ fontSize: '28px', fontWeight: 500, color: danInfo.pending_rows > 0 ? '#c9b48a' : '#b7c4b0' }}>{danInfo.pending_rows}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Rows pending</div>
 </div>
 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '16px 18px' }}>
 <div style={{ fontSize: '28px', fontWeight: 500, color: s.text }}>{danInfo.customers}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Guests</div>
 </div>
 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '16px 18px' }}>
 <div style={{ fontSize: '28px', fontWeight: 500, color: s.text }}>{danInfo.session_dates.length}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Dive days</div>
 </div>
 </div>

 {(danInfo.blocked?.length ?? 0) > 0 && (
 <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: 0, background: 'rgba(201,146,140,.07)', border: '1px solid rgba(201,146,140,.3)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#c9928c', marginBottom: '6px' }}> {danInfo.blocked!.length} diver{danInfo.blocked!.length === 1 ? '' : 's'} held back — DAN would cost more than the guest paid</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '8px' }}>These divers are not in the file until fixed. Each row says what to do.</div>
 {danInfo.blocked!.map(b => {
 const needsRecalc = b.charged_cents > 0
 return (
 <div key={b.booking_customer_id} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', color: s.text, padding: '6px 0', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.06)' }}>
 <button type="button" onClick={() => setDanPopupBookingId(b.booking_id)} style={{ padding: '1px 8px', borderRadius: 0, border: '1px solid rgba(243,239,230,.35)', background: 'rgba(243,239,230,.08)', color: s.accent, fontSize: '14px', fontWeight: 500, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', cursor: 'pointer' }}>{b.booking_id.slice(0, 8).toUpperCase()} </button>
 <span style={{ fontWeight: 500 }}>{b.name}</span>
 <span style={{ color: s.muted, flex: '1 1 260px' }}>
 {needsRecalc
 ? `${b.days} dive day${b.days === 1 ? '' : 's'} booked, insurance charged for less (€${(b.charged_cents / 100).toFixed(2)}; DAN cost €${(b.cost_cents / 100).toFixed(2)}).`
 : `Diver is flagged as DAN-insured, but no insurance was ever charged on this booking (cover sold at the centre before payments were tracked?). Add DAN cover via the booking’s Add tab — or, if the guest has their own insurance, clear the flag in the diver’s profile.`}
 </span>
 {needsRecalc ? (
 <button type="button" disabled={danFixBusy === b.booking_customer_id} onClick={async () => {
 setDanFixBusy(b.booking_customer_id); setDanMsg(null)
 try {
 const { data: { session: s2 } } = await supabase.auth.getSession()
 const r = await fetch('/api/bookings/reconcile-insurance', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${s2?.access_token}` }, body: JSON.stringify({ booking_id: b.booking_id }) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok || !d.ok) { setDanMsg(`Error: ${d.error ?? `HTTP ${r.status}`}`); return }
 setDanMsg(` ${b.name}: insurance recalculated for ${d.days} day(s) — ${d.diffCents > 0 ? '+' : ''}€${(d.diffCents / 100).toFixed(2)} added to the booking (guest pays the difference at the centre)`)
 const url = danTestMode ? '/api/admin/dan-export?test=1' : '/api/admin/dan-export'
 const r2 = await fetch(url, { headers: { Authorization: `Bearer ${s2?.access_token}` } })
 if (r2.ok) setDanInfo(await r2.json())
 } finally { setDanFixBusy(null) }
 }} style={{ padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(183,196,176,.4)', background: 'rgba(183,196,176,.12)', color: '#b7c4b0', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>
 {danFixBusy === b.booking_customer_id ? '…' : ' Recalculate insurance'}
 </button>
 ) : (
 <button type="button" onClick={() => setDanPopupBookingId(b.booking_id)} style={{ padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(201,180,138,.4)', background: 'rgba(201,180,138,.1)', color: '#c9b48a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>Open booking</button>
 )}
 </div>
 )
 })}
 </div>
 )}
 {danInfo.session_dates.length > 0 && (
 <div style={{ marginBottom: '24px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Dive days in export</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
 {danInfo.session_dates.map(d => (
 <span key={d} style={{ fontSize: '14px', padding: '3px 10px', borderRadius: 0, background: 'rgba(243,239,230,.1)', border: '1px solid rgba(243,239,230,.2)', color: s.accent }}>{d}</span>
 ))}
 </div>
 </div>
 )}

 {danInfo.pending_rows === 0 ? (
 <div style={{ textAlign: 'center', padding: '40px 0', color: '#b7c4b0', fontSize: '15px', fontWeight: 500 }}> All submitted — nothing pending</div>
 ) : (
 <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
 {/* Download */}
 <button
 disabled={danDownloading}
 onClick={async () => {
 setDanDownloading(true)
 setDanMsg(null)
 try {
 const { data: { session: s2 } } = await supabase.auth.getSession()
 const dlUrl = danTestMode ? '/api/admin/dan-export?dl=1&test=1' : '/api/admin/dan-export?dl=1'
 const res = await fetch(dlUrl, {
 headers: { Authorization: `Bearer ${s2?.access_token}` },
 })
 if (!res.ok) { setDanMsg(`Download failed (HTTP ${res.status})`); return }
 const batchId = res.headers.get('x-dan-batch')
 const rowKeys = (res.headers.get('x-dan-rows') ?? '').split(',').filter(Boolean)
 if (batchId) setDanBatch({ id: batchId, rows: rowKeys, test: danTestMode, at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })
 const blob = await res.blob()
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? 'DAN_Batch.xls'
 document.body.appendChild(a); a.click(); document.body.removeChild(a)
 URL.revokeObjectURL(url)
 } finally {
 setDanDownloading(false)
 }
 }}
 style={{ padding: '12px 24px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: danDownloading ? 'not-allowed' : 'pointer', opacity: danDownloading ? 0.6 : 1 }}
 >
 {danDownloading ? ' Download…' : ' Download .xls'}
 </button>

 {/* Mark submitted */}
 <button
 disabled={danSubmitting || !danBatch || danBatch.test !== danTestMode}
 title={!danBatch ? 'Download the file first — only the rows of that file get marked' : danBatch.test !== danTestMode ? 'Last download was in the other mode — download again' : `Marks the ${danBatch.rows.length} rows of the file downloaded at ${danBatch.at}`}
 onClick={async () => {
 if (!danBatch) return
 if (!confirm(`Mark the ${danBatch.rows.length} rows of the file downloaded at ${danBatch.at} as submitted to DAN?`)) return
 setDanSubmitting(true)
 setDanMsg(null)
 try {
 const { data: { session: s2 } } = await supabase.auth.getSession()
 const postRes = await fetch('/api/admin/dan-export?mark=1', {
 method: 'POST',
 headers: { Authorization: `Bearer ${s2?.access_token}`, 'Content-Type': 'application/json' },
 body: JSON.stringify({ batch_id: danBatch.id, rows: danBatch.rows, test: danBatch.test }),
 })
 const result = await postRes.json().catch(() => ({}))
 if (postRes.ok) {
 setDanMsg(` ${result.marked} rows (${result.divers} divers) marked as submitted`)
 setDanBatch(null)
 // Liste neu laden — es können inzwischen neue Zeilen dazugekommen sein
 const url = danTestMode ? '/api/admin/dan-export?test=1' : '/api/admin/dan-export'
 const r2 = await fetch(url, { headers: { Authorization: `Bearer ${s2?.access_token}` } })
 if (r2.ok) setDanInfo(await r2.json())
 } else {
 setDanMsg(`Error ${postRes.status}: ${result.error ?? 'unknown'}`)
 }
 } finally {
 setDanSubmitting(false)
 }
 }}
 style={{ padding: '12px 24px', borderRadius: 0, border: '1px solid rgba(183,196,176,.3)', background: 'rgba(183,196,176,.1)', color: '#b7c4b0', fontSize: '14px', fontWeight: 500, cursor: danSubmitting ? 'not-allowed' : 'pointer', opacity: danSubmitting ? 0.6 : 1 }}
 >
 {danSubmitting ? ' Marking…' : ' Mark as submitted'}
 </button>

 {/* Reload */}
 <button
 onClick={() => { setDanInfo(null); setFoSection('new'); setTimeout(() => setFoSection('dan'), 50) }}
 style={{ padding: '12px 18px', borderRadius: 0, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer' }}
 >
 Reload
 </button>
 </div>
 )}
 </div>
 )}
 </div>
 )}
 </div>
 {/* Buchungs-Popup aus dem DAN-Export (gesperrte Taucher): volles FO-Detail */}
 {danPopupBookingId && (
 <div onClick={() => setDanPopupBookingId(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, boxShadow: 'none' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Booking <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: s.text, fontWeight: 500 }}>{danPopupBookingId.slice(0, 8).toUpperCase()}</span> · changes here are live</span>
 <button type="button" onClick={() => setDanPopupBookingId(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 0, padding: '6px 12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Close </button>
 </div>
 <div style={{ padding: '14px' }}>
 <FrontOfficeBookings focusBookingId={danPopupBookingId} embedded />
 </div>
 </div>
 </div>
 )}
 </div>
 )
}

/* ══════════════════════════════
 AI SUPPORT
══════════════════════════════ */

// Single source of truth — edit this when website content changes, then hit Sync in AI Support Knowledge
const WEBSITE_KNOWLEDGE = `AZORES DIVING — Website Knowledge Base
Last updated: 2026-08-21

== WHAT WE OFFER ==

1. DAILY DIVES
 - AM Double Dive: Two morning dives, departs ~08:00, back ~13:00
 - PM Double Dive: Two afternoon dives, departs ~13:30, back ~17:30
 - Equipment rental available (full Mares set €35 per double dive) — not included in the dive price
 - Suitable for certified divers (Open Water Diver or equivalent)

2. BASIC DIVER (replaces "Try Scuba" — we no longer use that name)
 - SSI certification: Basic Diver (ISO 11121)
 - No prior experience or certification needed
 - Minimum age: 10 years
 - Confined water (pool): max 5 m depth
 - Open water: max 12 m depth
 - Certificate valid for 6 months
 - PRICES:
 * Pool session only: €95
 * Pool + Sea dive (group, max 2 students per instructor): €139
 * Pool + Sea — Private instructor (1-on-1): €185
 - All gear (Mares) included

3. FORMIGAS EXPEDITION
 - Day trip to the Formigas islets (offshore)
 - Manta rays, sharks, schooling barracuda, large pelagics
 - Weather-dependent — we only go when conditions are safe and excellent
 - For certified divers only (Open Water Diver minimum)

4. COURSES (SSI)
 - Open Water Diver (OWD): Full entry-level certification, min age 15
 - Advanced Open Water Diver: Next level after OWD
 - Rescue Diver
 - Divemaster
 - Specialties: Deep, Wreck, Navigation, Night, Perfect Buoyancy, React Right, Dry Suit, etc.

== IMPORTANT CORRECTIONS ==
- NEVER say "Try Scuba" — the product is called "Basic Diver"
- "Scuba Diver" (€320) exists as a product but is NOT actively sold. Never recommend or list it by default. For beginners without certification always steer to Basic Diver (taster, from €95) or Open Water Diver (full certification, €460). Only if a customer explicitly asks for Scuba Diver: confirm it exists (€320, equipment included, 2 dives, max 12 m with a professional) and still point out that OWD is the better value for most people.
- Minimum age for Basic Diver is 10 years (not 12, not 14)
- Minimum age for Open Water Diver is 15 years
- Equipment: included in the price for all entry-level courses (Basic Diver, Open Water Diver, Scuba Diver, Upgrade to OWD, SSI Explorers) and the Scuba Skills Update. For fun dives, specialties and pro courses equipment is rented separately (full Mares set €35 per double dive, single items from €3). Torch, 15L tank and gloves are always paid extras.
- Dive limits on every dive: back on the surface at 50 bar or after 50 minutes, whichever comes first. A 15L tank is an extra air reserve for heavier breathers — it does not extend the dive beyond 50 minutes.

== DIVE SITES (São Miguel, Azores) ==
Dori Wreck, Arco do Espelho, Arco do Cavaco, Ponta da Galera, Viteleiro, Baixa do Meio, Pedra do Pio, and the Formigas islets (offshore, conditions permitting)

== POLICIES ==
- Full refund if cancelled more than 72 hours before the dive; 50% refund between 48–72 hours; no refund under 48 hours or no-show
- Weather cancellations: always 100% refunded
- No strong swimming skills required for Basic Diver — just basic comfort in water
- Medical form required for all participants
- Dive insurance recommended

== CONTACT ==
- WhatsApp / Phone: +351 927 382 023
- Email: azoresdiving@gmail.com
- Location: Marina de Ponta Delgada, São Miguel, Azores, Portugal
- NEVER give any other phone number — ONLY +351 927 382 023`


// ── Triage Log Tab (admin-only) ───────────────────────────────────────────────
type TriageRow = {
 id: string
 processed_at: string
 from_email: string
 from_name: string | null
 subject: string | null
 body_preview: string | null
 pre_filter_blocked: boolean
 mistral_result: string | null
 final_result: string
 gmail_message_id: string | null
 feedback_correct: boolean | null
 feedback_note: string | null
 feedback_at: string | null
}

type TriageStat = {
 final_result: string
 pre_filter_blocked: boolean
 total: number
 rated: number
 correct: number
 wrong: number
}

function TriageLogTab({ supabase, session }: { supabase: any; session: any }) {
 const [rows, setRows] = React.useState<TriageRow[]>([])
 const [loading, setLoading] = React.useState(true)
 const [filter, setFilter] = React.useState('')
 const [running, setRunning] = React.useState(false)
 const [runResult, setRunResult] = React.useState<string | null>(null)
 const [expandedId, setExpandedId] = React.useState<string | null>(null)
 const [localFeedback, setLocalFeedback] = React.useState<Record<string, { correct: boolean | null; note: string }>>({})
 const [savingFeedback, setSavingFeedback] = React.useState<Record<string, boolean>>({})
 const [savedFeedback, setSavedFeedback] = React.useState<Record<string, boolean>>({})
 const [activePromptText, setActivePromptText] = React.useState<string | null>(null)
 const [showPrompt, setShowPrompt] = React.useState(false)
 const [stats, setStats] = React.useState<TriageStat[]>([])
 const [showStats, setShowStats] = React.useState(false)

 const load = React.useCallback(async () => {
 setLoading(true)
 const { data } = await supabase
 .from('email_triage_log')
 .select('*')
 .order('processed_at', { ascending: false })
 .limit(200)
 setRows((data ?? []) as TriageRow[])
 setLoading(false)
 }, [supabase])

 const loadStats = React.useCallback(async () => {
 const { data } = await supabase.from('triage_accuracy').select('*')
 setStats((data ?? []) as TriageStat[])
 }, [supabase])

 const loadActivePrompt = React.useCallback(async () => {
 const { data } = await supabase
 .from('triage_config')
 .select('prompt_text')
 .eq('is_active', true)
 .maybeSingle()
 setActivePromptText(data?.prompt_text ?? null)
 }, [supabase])

 React.useEffect(() => { load(); loadStats(); loadActivePrompt() }, [load, loadStats, loadActivePrompt]) // eslint-disable-line

 const runTest = React.useCallback(async () => {
 setRunning(true)
 setRunResult(null)
 try {
 const { data: { session: fresh } } = await supabase.auth.getSession()
 const res = await fetch('/api/triage-classify', {
 method: 'GET',
 headers: { Authorization: `Bearer ${fresh?.access_token}` },
 })
 const data = await res.json() as { ok: boolean; classified: number; failed: number; remaining: number; error?: string }
 if (data.ok) {
 setRunResult(` Classified ${data.classified}, ${data.failed} failed, ${data.remaining} still pending`)
 } else {
 setRunResult(` ${data.error ?? 'Classification failed'}`)
 }
 await Promise.all([load(), loadStats()])
 } catch {
 setRunResult(' Error running classification')
 } finally {
 setRunning(false)
 }
 }, [supabase, load, loadStats])

 const saveFeedback = React.useCallback(async (rowId: string) => {
 const fb = localFeedback[rowId]
 if (!fb || fb.correct === null) return
 setSavingFeedback(prev => ({ ...prev, [rowId]: true }))
 const { error } = await supabase
 .from('email_triage_log')
 .update({ feedback_correct: fb.correct, feedback_note: fb.note.trim() || null, feedback_at: new Date().toISOString() })
 .eq('id', rowId)
 if (!error) {
 setSavedFeedback(prev => ({ ...prev, [rowId]: true }))
 setRows(prev => prev.map(r => r.id === rowId
 ? { ...r, feedback_correct: fb.correct!, feedback_note: fb.note.trim() || null, feedback_at: new Date().toISOString() }
 : r
 ))
 setTimeout(() => setSavedFeedback(prev => ({ ...prev, [rowId]: false })), 3000)
 loadStats()
 }
 setSavingFeedback(prev => ({ ...prev, [rowId]: false }))
 }, [supabase, localFeedback, loadStats])

 const activatePrompt = React.useCallback(async (pId: string, newText: string) => {
 try {
 const res = await fetch('/api/triage-prompt-regen', {
 method: 'POST',
 headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
 body: JSON.stringify({ action: 'activate', promptId: pId }),
 })
 if (res.ok) {
 setActivePromptText(newText)
 setRunResult(' New prompt activated!')
 await loadActivePrompt()
 }
 } catch {
 setRunResult(' Error activating prompt')
 }
 }, [session, loadActivePrompt])

 const filtered = filter
 ? rows.filter(r =>
 r.from_email.toLowerCase().includes(filter.toLowerCase()) ||
 (r.subject ?? '').toLowerCase().includes(filter.toLowerCase()) ||
 r.final_result.toLowerCase().includes(filter.toLowerCase())
 )
 : rows

 const resultColor = (r: string) =>
 r === 'ticket' ? '#b7c4b0' : r === 'internal' ? '#c9b48a' : r === 'ignore' ? 'rgba(255,255,255,.3)' : '#d4a07a'
 const resultBg = (r: string) =>
 r === 'ticket' ? 'rgba(183,196,176,.1)' : r === 'internal' ? 'rgba(201,180,138,.07)' : r === 'ignore' ? 'rgba(255,255,255,.03)' : 'rgba(212,160,122,.1)'

 const counts = {
 ticket: rows.filter(r => r.final_result === 'ticket').length,
 internal: rows.filter(r => r.final_result === 'internal').length,
 ignore: rows.filter(r => r.final_result === 'ignore').length,
 review: rows.filter(r => r.final_result === 'review').length,
 wrong: rows.filter(r => r.feedback_correct === false).length,
 }

 // ── Treffergenauigkeit (ueber ALLE Zeilen, nicht nur die geladenen 200) ──
 const sum = (rs: TriageStat[], k: 'total' | 'rated' | 'correct' | 'wrong') => rs.reduce((a, r) => a + Number(r[k] ?? 0), 0)
 const decided = stats.filter(r => r.final_result !== 'pending')
 const acc = {
 total: sum(decided, 'total'),
 rated: sum(decided, 'rated'),
 correct: sum(decided, 'correct'),
 pending: sum(stats.filter(r => r.final_result === 'pending'), 'total'),
 modelRated: sum(decided.filter(r => !r.pre_filter_blocked), 'rated'),
 modelCorrect: sum(decided.filter(r => !r.pre_filter_blocked), 'correct'),
 preRated: sum(decided.filter(r => r.pre_filter_blocked), 'rated'),
 preCorrect: sum(decided.filter(r => r.pre_filter_blocked), 'correct'),
 }
 const pct = (c: number, n: number) => n === 0 ? null : Math.round((c / n) * 100)
 const accPct = pct(acc.correct, acc.rated)
 const pctColor = (v: number | null) => v === null ? 'rgba(255,255,255,.3)' : v >= 90 ? '#b7c4b0' : v >= 70 ? '#d4a07a' : '#c9928c'
 const statCell: React.CSSProperties = { minWidth: '86px' }
 const statLabel: React.CSSProperties = { fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.32)', marginBottom: '3px' }

 const btn: React.CSSProperties = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, color: 'rgba(255,255,255,.75)', fontSize: '14px', padding: '6px 13px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }

 return (
 <div style={{ padding: '20px' }}>
 {/* ── Toolbar ── */}
 <div style={{ marginBottom: '16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,.38)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}> EMAIL TRIAGE — SHADOW MODE</div>
 {/* ── Treffergenauigkeit ── */}
 <div style={{ marginBottom: '14px', padding: '12px 16px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0 }}>
 <div style={{ display: 'flex', gap: '26px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
 <div style={statCell}>
 <div style={statLabel}>Accuracy</div>
 <div style={{ fontSize: '26px', fontWeight: 500, lineHeight: 1, color: pctColor(accPct) }}>
 {accPct === null ? '—' : `${accPct}%`}
 </div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', marginTop: '4px' }}>
 {acc.correct}/{acc.rated} rated
 </div>
 </div>
 <div style={statCell}>
 <div style={statLabel}>Mistral only</div>
 <div style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1, color: pctColor(pct(acc.modelCorrect, acc.modelRated)) }}>
 {pct(acc.modelCorrect, acc.modelRated) === null ? '—' : `${pct(acc.modelCorrect, acc.modelRated)}%`}
 </div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', marginTop: '4px' }}>{acc.modelCorrect}/{acc.modelRated}</div>
 </div>
 <div style={statCell}>
 <div style={statLabel}>Coverage</div>
 <div style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1, color: 'rgba(255,255,255,.6)' }}>
 {acc.total === 0 ? '—' : `${pct(acc.rated, acc.total)}%`}
 </div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', marginTop: '4px' }}>
 {acc.rated} of {acc.total} decided
 </div>
 </div>
 <button onClick={() => setShowStats(v => !v)} style={{ ...btn, marginLeft: 'auto', fontSize: '14px', padding: '5px 11px' }}>
 {showStats ? ' Details' : ' Details'}
 </button>
 </div>
 {acc.rated > 0 && acc.rated < 30 && (
 <div style={{ marginTop: '10px', fontSize: '14px', color: '#d4a07a', lineHeight: 1.5 }}>
 Only {acc.rated} ratings so far — not yet reliable. Meaningful from roughly 100 randomly picked emails; rating only the conspicuous cases understates accuracy.
 </div>
 )}
 {acc.pending > 0 && (
 <div style={{ marginTop: '8px', fontSize: '14px', color: 'rgba(255,255,255,.3)', lineHeight: 1.5 }}>
 {acc.pending} rows are pending and excluded from the accuracy figure — they have not been classified yet.
 </div>
 )}
 {showStats && (
 <div style={{ marginTop: '14px', overflowX: 'auto' }}>
 <table style={{ borderCollapse: 'collapse', fontSize: '14px', width: '100%', minWidth: '460px' }}>
 <thead>
 <tr style={{ color: 'rgba(255,255,255,.32)', textAlign: 'left' }}>
 <th style={{ padding: '5px 10px 7px 0', fontWeight: 500, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Decision</th>
 <th style={{ padding: '5px 10px 7px 0', fontWeight: 500, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Decided by</th>
 <th style={{ padding: '5px 10px 7px 0', fontWeight: 500, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Total</th>
 <th style={{ padding: '5px 10px 7px 0', fontWeight: 500, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Rated</th>
 <th style={{ padding: '5px 10px 7px 0', fontWeight: 500, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Correct</th>
 <th style={{ padding: '5px 0 7px 0', fontWeight: 500, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase' }}>Accuracy</th>
 </tr>
 </thead>
 <tbody>
 {[...stats].sort((a, b) => b.total - a.total).map(r => {
 const q = pct(Number(r.correct), Number(r.rated))
 return (
 <tr key={`${r.final_result}-${r.pre_filter_blocked}`} style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
 <td style={{ padding: '7px 10px 7px 0' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: resultColor(r.final_result), background: resultBg(r.final_result), padding: '2px 8px', borderRadius: 0 }}>{r.final_result}</span>
 </td>
 <td style={{ padding: '7px 10px 7px 0', color: 'rgba(255,255,255,.5)' }}>{r.pre_filter_blocked ? 'Pre-filter (removed 22.09.)' : 'Mistral'}</td>
 <td style={{ padding: '7px 10px 7px 0', color: 'rgba(255,255,255,.5)' }}>{r.total}</td>
 <td style={{ padding: '7px 10px 7px 0', color: 'rgba(255,255,255,.5)' }}>{r.rated}</td>
 <td style={{ padding: '7px 10px 7px 0', color: 'rgba(255,255,255,.5)' }}>{r.correct}</td>
 <td style={{ padding: '7px 0', fontWeight: 500, color: pctColor(q) }}>{q === null ? '—' : `${q}%`}</td>
 </tr>
 )
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
 <span style={{ fontSize: '14px', color: '#b7c4b0', fontWeight: 500 }}> {counts.ticket} ticket</span>
 {counts.internal > 0 && <span style={{ fontSize: '14px', color: '#c9b48a', fontWeight: 500 }}> {counts.internal} internal</span>}
 <span style={{ fontSize: '14px', color: 'rgba(255,255,255,.38)', fontWeight: 500 }}> {counts.ignore} ignored</span>
 <span style={{ fontSize: '14px', color: '#d4a07a', fontWeight: 500 }}> {counts.review} review</span>
 {counts.wrong > 0 && <span style={{ fontSize: '14px', color: '#ff8888', fontWeight: 500 }}> {counts.wrong} Feedback</span>}
 <span style={{ fontSize: '14px', color: 'rgba(255,255,255,.22)' }}>· {rows.length} total</span>
 </div>
 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
 <input placeholder='Filter…' value={filter} onChange={e => setFilter(e.target.value)}
 style={{ ...btn, padding: '6px 10px', minWidth: '160px', cursor: 'text' }} />
 <button onClick={load} disabled={loading} style={{ ...btn, opacity: loading ? 0.5 : 1 }}>{loading ? '' : ''} Refresh</button>
 <button onClick={runTest} disabled={running || loading}
 style={{ ...btn, opacity: (running || loading) ? 0.5 : 1, background: 'rgba(183,196,176,.1)', borderColor: 'rgba(183,196,176,.28)', color: '#b7c4b0', fontWeight: 500 }}>
 {running ? ' Running…' : ' Classify pending'}
 </button>
 <button onClick={() => setShowPrompt(p => !p)} style={{ ...btn, opacity: 0.65 }}>
 {showPrompt ? ' Hide prompt' : ' Active prompt'}
 </button>
 </div>
 {runResult && (
 <div style={{ marginTop: '8px', fontSize: '14px', color: runResult.startsWith('') ? '#b7c4b0' : '#ff8888', padding: '6px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 0 }}>
 {runResult}
 </div>
 )}
 <div style={{ marginTop: '8px', fontSize: '14px', color: 'rgba(255,255,255,.28)', lineHeight: 1.5 }}>
 Shadow mode: emails are classified but no action is taken — nothing is marked as read, no tickets are created. Rate the results, then ask Claude in chat: &ldquo;Pull my feedback and write a new prompt&rdquo; activate.
 </div>
 </div>

 {/* ── Aktiver Prompt ── */}
 {showPrompt && (
 <div style={{ marginBottom: '16px', padding: '14px', background: 'rgba(212,160,122,.05)', border: '1px solid rgba(212,160,122,.18)', borderRadius: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#d4a07a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}> Active classification prompt</div>
 {activePromptText
 ? <pre style={{ fontSize: '14px', color: 'rgba(255,255,255,.65)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>{activePromptText}</pre>
 : <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)' }}>No active prompt — default is used.</div>}
 </div>
 )}

{/* ── Triage Liste ── */}
 {loading ? (
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', padding: '24px 0', textAlign: 'center' }}>Loading…</div>
 ) : filtered.length === 0 ? (
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.3)', padding: '24px 0', textAlign: 'center' }}>No entries yet.</div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {filtered.map(row => {
 const isExpanded = expandedId === row.id
 const fb = localFeedback[row.id]
 const existingCorrect = row.feedback_correct
 const displayCorrect = fb !== undefined ? fb.correct : existingCorrect

 return (
 <div key={row.id} style={{ border: `1px solid ${isExpanded ? 'rgba(243,239,230,.22)' : resultColor(row.final_result) + '44'}`, borderRadius: 0, overflow: 'hidden' }}>
 {/* Row header */}
 <button type="button" onClick={() => setExpandedId(isExpanded ? null : row.id)}
 style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: isExpanded ? 'rgba(243,239,230,.04)' : resultBg(row.final_result), cursor: 'pointer', width: '100%', border: 'none', fontFamily: 'inherit', textAlign: 'left' }}
 onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
 onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = resultBg(row.final_result) }}>
 {/* Time */}
 <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '40px' }}>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.5)', fontWeight: 500 }}>
 {new Date(row.processed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
 </div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.28)' }}>
 {new Date(row.processed_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
 </div>
 </div>
 {/* Icon */}
 <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: resultBg(row.final_result), border: `1px solid ${resultColor(row.final_result)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
 {row.final_result === 'ticket' ? '' : row.final_result === 'ignore' ? '' : ''}
 </div>
 {/* Sender + Subject */}
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px', flexWrap: 'wrap' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,.9)' }}>{row.from_name ?? row.from_email}</span>
 <span style={{ fontSize: '14px', fontWeight: 500, color: resultColor(row.final_result), background: resultBg(row.final_result), border: `1px solid ${resultColor(row.final_result)}50`, borderRadius: 0, padding: '1px 7px', letterSpacing: '.04em' }}>
 {row.final_result.toUpperCase()}
 </span>
 {row.pre_filter_blocked && (
 <span style={{ fontSize: '14px', fontWeight: 500, color: '#ff9999', background: 'rgba(201,146,140,.1)', border: '1px solid rgba(201,146,140,.22)', borderRadius: 0, padding: '1px 6px' }}>PRE-FILTER</span>
 )}
 {existingCorrect === true && <span style={{ fontSize: '14px' }} title="Feedback: correct"></span>}
 {existingCorrect === false && <span style={{ fontSize: '14px' }} title="Feedback: wrong"></span>}
 </div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
 <span style={{ color: 'rgba(255,255,255,.25)', marginRight: '6px' }}>{row.from_email}</span>
 {row.subject ?? '(no subject)'}
 </div>
 </div>
 <span style={{ fontSize: '14px', color: 'rgba(255,255,255,.28)', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}></span>
 </button>

 {/* Expanded detail */}
 {isExpanded && (
 <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', background: 'rgba(0,0,0,.22)', display: 'flex', alignItems: 'flex-start' }}>
 {/* Left: email content */}
 <div style={{ flex: 1, minWidth: 0, padding: '16px 18px', maxHeight: '70vh', overflowY: 'auto' }}>
 {/* Classification breakdown */}
 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
 <div style={{ padding: '7px 12px', borderRadius: 0, background: row.pre_filter_blocked ? 'rgba(201,146,140,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${row.pre_filter_blocked ? 'rgba(201,146,140,.28)' : 'rgba(255,255,255,.08)'}` }}>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.32)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '3px' }}>Pre-filter</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: row.pre_filter_blocked ? '#ff9999' : 'rgba(255,255,255,.45)' }}>{row.pre_filter_blocked ? ' BLOCKED' : ' passed'}</div>
 </div>
 {row.mistral_result && (
 <div style={{ padding: '7px 12px', borderRadius: 0, background: resultBg(row.mistral_result), border: `1px solid ${resultColor(row.mistral_result)}40` }}>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.32)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '3px' }}>Mistral</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: resultColor(row.mistral_result) }}>{row.mistral_result}</div>
 </div>
 )}
 <div style={{ padding: '7px 12px', borderRadius: 0, background: resultBg(row.final_result), border: `1px solid ${resultColor(row.final_result)}55` }}>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.32)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '3px' }}>Final</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: resultColor(row.final_result) }}>{row.final_result.toUpperCase()}</div>
 </div>
 </div>
 {/* Email body */}
 <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,.32)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>Email Content</div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.75)', lineHeight: 1.65, padding: '12px 14px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '340px', overflowY: 'auto' }}>
 {row.body_preview ?? '(no content captured)'}
 </div>
 </div>

 {/* Right: feedback */}
 <div style={{ width: '210px', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,.07)', padding: '16px', alignSelf: 'stretch' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,.32)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}>Feedback</div>
 {/* Show existing saved feedback if no local edit */}
 {existingCorrect !== null && fb === undefined && (
 <div style={{ marginBottom: '10px', padding: '7px 10px', borderRadius: 0, background: existingCorrect ? 'rgba(183,196,176,.07)' : 'rgba(201,146,140,.07)', border: `1px solid ${existingCorrect ? 'rgba(183,196,176,.18)' : 'rgba(201,146,140,.18)'}` }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: existingCorrect ? '#b7c4b0' : '#ff9999', marginBottom: row.feedback_note ? '4px' : 0 }}>
 {existingCorrect ? ' Correct' : ' Wrong'}
 </div>
 {row.feedback_note && <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.48)', lineHeight: 1.5 }}>{row.feedback_note}</div>}
 </div>
 )}
 {/* Buttons */}
 <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
 <button
 onClick={() => setLocalFeedback(prev => ({ ...prev, [row.id]: { correct: true, note: prev[row.id]?.note ?? row.feedback_note ?? '' } }))}
 style={{ flex: 1, padding: '7px 0', borderRadius: 0, border: `1px solid ${displayCorrect === true ? 'rgba(183,196,176,.5)' : 'rgba(255,255,255,.1)'}`, background: displayCorrect === true ? 'rgba(183,196,176,.15)' : 'transparent', color: displayCorrect === true ? '#b7c4b0' : 'rgba(255,255,255,.5)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
 Correct
 </button>
 <button
 onClick={() => setLocalFeedback(prev => ({ ...prev, [row.id]: { correct: false, note: prev[row.id]?.note ?? row.feedback_note ?? '' } }))}
 style={{ flex: 1, padding: '7px 0', borderRadius: 0, border: `1px solid ${displayCorrect === false ? 'rgba(201,146,140,.5)' : 'rgba(255,255,255,.1)'}`, background: displayCorrect === false ? 'rgba(201,146,140,.12)' : 'transparent', color: displayCorrect === false ? '#ff9999' : 'rgba(255,255,255,.5)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
 Wrong
 </button>
 </div>
 {/* Note + save */}
 {fb !== undefined && (
 <>
 <textarea
 value={fb.note}
 onChange={e => setLocalFeedback(prev => ({ ...prev, [row.id]: { ...prev[row.id], note: e.target.value } }))}
 placeholder={fb.correct === false ? 'Why was this decision wrong?' : 'Optional note…'}
 rows={3}
 style={{ width: '100%', resize: 'none', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, color: 'rgba(255,255,255,.8)', fontSize: '14px', padding: '8px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5 }}
 />
 <button onClick={() => saveFeedback(row.id)} disabled={savingFeedback[row.id]}
 style={{ width: '100%', marginTop: '6px', padding: '7px 0', borderRadius: 0, border: '1px solid rgba(243,239,230,.28)', background: 'rgba(243,239,230,.1)', color: '#f3efe6', fontSize: '14px', fontWeight: 500, cursor: savingFeedback[row.id] ? 'default' : 'pointer', fontFamily: 'inherit', opacity: savingFeedback[row.id] ? 0.5 : 1 }}>
 {savingFeedback[row.id] ? ' Saving…' : savedFeedback[row.id] ? ' Saved!' : ' Save'}
 </button>
 </>
 )}
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.2)', lineHeight: 1.5, marginTop: '10px' }}>
 Feedback with a note is used to improve the classification prompt.
 </div>
 </div>
 </div>
 )}
 </div>
 )
 })}
 </div>
 )}
 </div>
 )
}

function PageAISupport({ nav, tickets, onRefresh, onResolve, onUnresolve, onInProgress, onClaim, onUnclaim, onTakeover, onArchive, onUnarchive, onSaveNote, mistralModel, setMistralModel, systemPrompt, setSystemPrompt, kbFiles, setKbFiles, session, userRole, newMsgCount, clearTicketBadge }: { nav: (p: MemberPage) => void; tickets: Ticket[]; onRefresh: () => void; onResolve: (id: string) => void; onUnresolve: (id: string) => void; onInProgress: (id: string) => void; onClaim: (id: string, name: string) => void; onUnclaim: (id: string) => void; onTakeover: (id: string, name: string) => void; onArchive: (id: string) => void; onUnarchive: (id: string) => void; onSaveNote: (id: string, note: string) => void; mistralModel: string; setMistralModel: (m: string) => void; systemPrompt: string; setSystemPrompt: (p: string) => void; kbFiles: {name: string, content: string}[]; setKbFiles: React.Dispatch<React.SetStateAction<{name: string, content: string}[]>>; session: any; userRole?: string | null; newMsgCount?: Record<string, number>; clearTicketBadge?: (id: string) => void }) {
 const [aiTab, setAiTab] = useState<'prompt' | 'faq' | 'knowledge' | 'history' | 'tickets' | 'changelog' | 'triage'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('azd_aiTab') as any) || 'prompt' : 'prompt'))
 const [staffName, setStaffName] = useState<string>('')
 useEffect(() => {
 const email = session?.user?.email
 if (!email) return
 supabase.from('profiles').select('name').eq('email', email).maybeSingle()
 .then(({ data }: any) => { if (data?.name) setStaffName(data.name) })
 }, [session])
 const [promptSaved, setPromptSaved] = useState(true)
 const { modes: aiModes, error: aiModesError, setMode: setAiMode } = useAiModes()
 const [aiModeMsg, setAiModeMsg] = useState('')
 async function changeAiMode(which: 'link' | 'chat' | 'tickets', value: AiMode) {
 setAiModeMsg('')
 try { await setAiMode(which, value); setAiModeMsg(` Saved: ${which === 'link' ? 'Payment link' : which === 'chat' ? 'Chatbot data' : 'Tickets'} ${value}`) }
 catch (e) { setAiModeMsg(`Error: ${e instanceof Error ? e.message : String(e)}`) }
 }
 const [bookingToggle, setBookingToggle] = useState<boolean | null>(null)
 const [bookingToggleSaving, setBookingToggleSaving] = useState(false)
 useEffect(() => {
 if (userRole !== 'admin') return
 session?.supabaseAccessToken || supabase.auth.getSession().then(({ data }) => {
 const token = data?.session?.access_token
 if (!token) return
 fetch('/api/admin/settings?key=chatbot_booking_enabled', { headers: { Authorization: `Bearer ${token}` } })
 .then(r => r.json())
 .then(d => { if (d.value !== undefined) setBookingToggle(d.value === 'true') })
 .catch(() => {})
 })
 }, [userRole, session]) // eslint-disable-line react-hooks/exhaustive-deps
 async function saveBookingToggle(enabled: boolean) {
 setBookingToggleSaving(true)
 const { data } = await supabase.auth.getSession()
 const token = data?.session?.access_token
 try {
 if (!token) throw new Error('Not logged in — reload and sign in again.')
 const r = await fetch('/api/admin/settings', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
 body: JSON.stringify({ key: 'chatbot_booking_enabled', value: enabled ? 'true' : 'false' }),
 })
 if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`HTTP ${r.status} ${j.error ?? ''}`.trim()) }
 setBookingToggle(enabled)
 } catch (e) {
 // Sichtbarer Fehler statt stillem Umschalten ohne Speichern
 alert(`Booking bot setting was NOT saved: ${e instanceof Error ? e.message : String(e)}`)
 }
 setBookingToggleSaving(false)
 }
 type CronHbRow = { job_name: string; last_ok_at: string | null; last_run_at: string | null; last_status: string | null; last_detail: string | null }
 const [cronHb, setCronHb] = useState<CronHbRow[] | null>(null)
 const [cronHbError, setCronHbError] = useState<string | null>(null)
 useEffect(() => {
 // Die Tabelle darf nur der Admin lesen (RLS) — Nicht-Admins bekämen leere Zeilen und sähen fälschlich „never ran“
 if (userRole !== 'admin') return
 const fetchHb = () => {
 supabase.from('cron_heartbeat')
 .select('job_name,last_ok_at,last_run_at,last_status,last_detail')
 .then(({ data, error }) => {
 if (error) { setCronHbError(error.message); return }
 setCronHb(data as CronHbRow[])
 setCronHbError(null)
 })
 }
 fetchHb()
 const id = setInterval(fetchHb, 60_000)
 return () => clearInterval(id)
 }, [userRole])
 const [historyConvs, setHistoryConvs] = useState<any[]>([])
 const [historyLoading, setHistoryLoading] = useState(false)
 const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
 const [historySubTab, setHistorySubTab] = useState<'active' | 'archived'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('azd_historySubTab') as any) || 'active' : 'active'))
 const [historySearch, setHistorySearch] = useState('')
 const [ticketSubTab, setTicketSubTab] = useState<'open' | 'archived'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('azd_ticketSubTab') as any) || 'open' : 'open'))
 const [ticketOwnerFilter, setTicketOwnerFilter] = useState<'all' | 'mine'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('azd_ticketOwnerFilter') as any) || 'all' : 'all'))
 const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)
 const [ticketNoteEdits, setTicketNoteEdits] = useState<Record<string, string>>({})
 const [ticketNotesList, setTicketNotesList] = useState<Record<string, {id: string; author_name: string; content: string; created_at: string}[]>>({})
 const [ticketNoteAdding, setTicketNoteAdding] = useState<Record<string, boolean>>({})
 const [ticketSidebarTab, setTicketSidebarTab] = useState<Record<string, 'history' | 'notes'>>({})
 const [ticketLastNote, setTicketLastNote] = useState<Record<string, {author_name: string; content: string; created_at: string}>>({})
 // Instructor-Tickets (note = booking:<bookingId>): Zeitfenster direkt im Ticket setzen — kein Wechsel ins Front Office
 type SlotRow = { id: string; session_date: string; session: string; notes: string | null; is_boat_day: boolean | null; start_time?: string | null }
 type SlotBooking = { id: string; product_name: string | null; customer_name: string | null; customer_email: string | null; group_size: number | null; status: string }
 const [slotData, setSlotData] = useState<Record<string, { loading: boolean; error?: string; booking?: SlotBooking; sessions: SlotRow[]; picks: Record<string, 'am' | 'pm' | 'full'>; times: Record<string, string>; dates: Record<string, string>; boat: Record<string, boolean>; saving?: boolean; msg?: string; capacityWarning?: boolean }>>({})
 const [ticketBookingPopup, setTicketBookingPopup] = useState<string | null>(null)
 async function loadSlots(ticket: Ticket) {
 const m = /^booking:([0-9a-f-]{36})$/.exec(ticket.note ?? '')
 if (!m) return
 setSlotData(p => ({ ...p, [ticket.id]: { loading: true, sessions: [], picks: {}, times: {}, dates: {}, boat: {} } }))
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 const res = await fetch(`/api/bookings/assign-slots?booking_id=${m[1]}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
 const d = await res.json().catch(() => ({}))
 if (!res.ok || !d.ok) { setSlotData(p => ({ ...p, [ticket.id]: { loading: false, error: d.error ?? `HTTP ${res.status}`, sessions: [], picks: {}, times: {}, dates: {}, boat: {} } })); return }
 setSlotData(p => ({ ...p, [ticket.id]: { loading: false, booking: d.booking as SlotBooking, sessions: d.sessions as SlotRow[], picks: {}, times: {}, dates: {}, boat: {} } }))
 } catch (e) {
 setSlotData(p => ({ ...p, [ticket.id]: { loading: false, error: e instanceof Error ? e.message : String(e), sessions: [], picks: {}, times: {}, dates: {}, boat: {} } }))
 }
 }
 async function saveSlots(ticket: Ticket, force = false) {
 const m = /^booking:([0-9a-f-]{36})$/.exec(ticket.note ?? '')
 const d = slotData[ticket.id]
 if (!m || !d) return
 // Nur Zeilen mit echter Änderung: Schicht, Startzeit oder Datum (Lucas 24.10.: Tage im Ticket verschiebbar, Mail bei jedem Update)
 const slots = d.sessions.flatMap(x => {
 const pick = d.picks[x.id]
 const time = d.times[x.id]
 const date = d.dates[x.id]
 const cur = x.start_time ? x.start_time.slice(0, 5) : ''
 const boat = d.boat[x.id]
 const o: { session_id: string; session?: string; start_time?: string; new_date?: string; is_boat_day?: boolean } = { session_id: x.id }
 if (pick && (pick !== x.session)) o.session = pick
 if (time !== undefined && time !== cur) o.start_time = time
 if (date && date !== x.session_date) o.new_date = date
 if (boat !== undefined && boat !== Boolean(x.is_boat_day)) o.is_boat_day = boat
 return Object.keys(o).length > 1 ? [o] : []
 })
 if (slots.length === 0) { setSlotData(p => ({ ...p, [ticket.id]: { ...d, msg: ' Nothing changed — pick a slot, a start time or a new date' } })); return }
 setSlotData(p => ({ ...p, [ticket.id]: { ...d, saving: true, msg: undefined } }))
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 const res = await fetch('/api/bookings/assign-slots', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ booking_id: m[1], slots, ticket_id: ticket.id, ...(force ? { force: true } : {}) }) })
 const r = await res.json().catch(() => ({}))
 if (!res.ok || !r.ok) { setSlotData(p => ({ ...p, [ticket.id]: { ...d, saving: false, msg: `${r.capacity_warning ? '' : ''} ${r.error ?? `HTTP ${res.status}`}`, capacityWarning: Boolean(r.capacity_warning) } })); return }
 const mailNote = r.mail === 'sent' ? ' · guest emailed' : r.mail === 'error' ? ` · email failed: ${r.mail_error}` : ''
 const msg = r.remaining === 0
 ? ` All time slots set — ticket resolved${mailNote}`
 : ` ${(r.set as string[]).join(' · ')} — ${r.remaining} day(s) still open${mailNote}`
 setSlotData(p => ({ ...p, [ticket.id]: { ...d, saving: false, msg } }))
 await loadSlots(ticket)
 setSlotData(p => ({ ...p, [ticket.id]: { ...(p[ticket.id] ?? d), msg } }))
 onRefresh()
 } catch (e) {
 setSlotData(p => ({ ...p, [ticket.id]: { ...d, saving: false, msg: ` ${e instanceof Error ? e.message : String(e)}` } }))
 }
 }
 // Anwesenheits-Tickets (note = attendance:<bookingId>:<date>): zwei Knöpfe, Ergebnis sichtbar (nie stumm)
 const [attendanceBusy, setAttendanceBusy] = useState<string | null>(null)
 const [attendanceMsg, setAttendanceMsg] = useState<Record<string, string>>({})
 async function decideAttendance(ticket: Ticket, outcome: 'present' | 'no_show' | 'trip_cancelled') {
 const m = /^attendance:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(ticket.note ?? '')
 if (!m) return
 setAttendanceBusy(ticket.id)
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 const res = await fetch('/api/attendance', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ booking_id: m[1], dive_date: m[2], outcome, ticket_id: ticket.id }) })
 const d = await res.json().catch(() => ({}))
 if (!res.ok || !d.ok) { setAttendanceMsg(p => ({ ...p, [ticket.id]: ` ${d.error ?? `HTTP ${res.status}`}` })); return }
 setAttendanceMsg(p => ({ ...p, [ticket.id]: outcome === 'present' ? ` Completed${d.mail === 'sent' ? ' · thank-you mail sent' : d.mail === 'error' ? ` · mail failed: ${d.mail_error}` : ''}` : outcome === 'no_show' ? ' Marked no-show · seats released' : ' Day cancelled by AZD · booking kept — rebook or refund in Front Office' }))
 onRefresh()
 } catch (e) {
 setAttendanceMsg(p => ({ ...p, [ticket.id]: ` ${e instanceof Error ? e.message : String(e)}` }))
 } finally { setAttendanceBusy(null) }
 }
 useEffect(() => {
 supabase.from('ticket_notes').select('ticket_id, author_name, content, created_at').order('created_at', { ascending: false })
 .then(({ data }) => {
 if (!data) return
 const map: Record<string, {author_name: string; content: string; created_at: string}> = {}
 for (const n of data) { if (!map[n.ticket_id as string]) map[n.ticket_id as string] = { author_name: n.author_name as string, content: n.content as string, created_at: n.created_at as string } }
 setTicketLastNote(map)
 })
 }, []) // eslint-disable-line react-hooks/exhaustive-deps
 function loadTicketNotes(ticketId: string) {
 supabase.from('ticket_notes').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false })
 .then(({ data }) => {
 if (data) {
 setTicketNotesList(prev => ({ ...prev, [ticketId]: data }))
 if (data.length > 0) setTicketLastNote(prev => ({ ...prev, [ticketId]: data[0] }))
 }
 })
 }
 async function addTicketNote(ticketId: string, content: string) {
 if (!content.trim()) return
 const author = staffName || (session?.user?.email?.split('@')[0] ?? 'Team')
 setTicketNoteAdding(prev => ({ ...prev, [ticketId]: true }))
 const { data, error } = await supabase.from('ticket_notes').insert({ ticket_id: ticketId, author_name: author, content: content.trim() }).select().single()
 setTicketNoteAdding(prev => ({ ...prev, [ticketId]: false }))
 if (!error && data) {
 setTicketNotesList(prev => ({ ...prev, [ticketId]: [data, ...(prev[ticketId] ?? [])] }))
 setTicketNoteEdits(prev => ({ ...prev, [ticketId]: '' }))
 setTicketLastNote(prev => ({ ...prev, [ticketId]: data }))
 }
 }
 const [ticketReply, setTicketReply] = useState<Record<string, string>>({})
 const [ticketReplySending, setTicketReplySending] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
 const [ticketAttachments, setTicketAttachments] = useState<Record<string, File[]>>({})
 const [ticketEmailSending, setTicketEmailSending] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
 const [refreshingEmails, setRefreshingEmails] = useState(false)
 const [kbSaveStatus, setKbSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
 const [websiteSyncStatus, setWebsiteSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
 const [liveChats, setLiveChats] = useState<Record<string, any[]>>({})
 const chatContainerRef = useRef<HTMLDivElement>(null)

 // Auto-scroll chat container to bottom whenever messages update (scroll container, not page)
 useEffect(() => {
 if (chatContainerRef.current) {
 chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
 }
 }, [liveChats, expandedTicketId])

 // Live chat: fetch + subscribe when a ticket with sessionId is expanded
 useEffect(() => {
 const ticket = tickets.find(t => t.id === expandedTicketId)
 if (!ticket?.sessionId) return
 const sid = ticket.sessionId
 // Initial fetch
 supabase.from('chat_conversations').select('messages').eq('session_id', sid).maybeSingle()
 .then(({ data }) => { if (data?.messages) setLiveChats(prev => ({ ...prev, [sid]: data.messages })) })
 // Seen-set to deduplicate broadcast vs postgres_changes
 const seenTexts = new Set<string>()
 // postgres_changes — catch ALL events (INSERT + UPDATE) so new rows are not missed
 const ch = supabase.channel('admin-live-' + sid)
 .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations', filter: 'session_id=eq.' + sid }, payload => {
 const msgs = (payload.new as any)?.messages
 if (msgs) setLiveChats(prev => ({ ...prev, [sid]: msgs }))
 })
 .subscribe()
 // Broadcast subscription on the shared staff-reply channel for instant customer messages
 const bc = supabase.channel('staff-reply-' + sid)
 .on('broadcast', { event: 'customer_message' }, ({ payload }: { payload: { role: string; text: string } }) => {
 if (!payload?.text) return
 const key = 'user:' + payload.text
 if (seenTexts.has(key)) return
 seenTexts.add(key)
 setLiveChats(prev => {
 const existing = prev[sid] || []
 return { ...prev, [sid]: [...existing, { role: 'user', text: payload.text }] }
 })
 })
 .subscribe()
 // Polling fallback every 8 s — catches messages realtime might miss
 const poll = setInterval(() => {
 supabase.from('chat_conversations').select('messages').eq('session_id', sid).maybeSingle()
 .then(({ data }) => { if (data?.messages) setLiveChats(prev => ({ ...prev, [sid]: data.messages })) })
 }, 8000)
 return () => { supabase.removeChannel(ch); supabase.removeChannel(bc); clearInterval(poll) }
 }, [expandedTicketId]) // eslint-disable-line react-hooks/exhaustive-deps

 const syncWebsiteContent = async () => {
 setWebsiteSyncStatus('syncing')
 const name = 'website-content.txt'
 const content = WEBSITE_KNOWLEDGE
 const { error } = await supabase.from('kb_files').upsert({ name, content, size_chars: content.length }, { onConflict: 'name' })
 if (error) { setWebsiteSyncStatus('error'); return }
 setKbFiles(prev => {
 const without = prev.filter(f => f.name !== name)
 return [...without, { name, content }]
 })
 setKbSaveStatus(prev => ({ ...prev, [name]: 'saved' }))
 setWebsiteSyncStatus('synced')
 setTimeout(() => setWebsiteSyncStatus('idle'), 3000)
 }

 // Mark already-loaded KB files as saved
 useEffect(() => {
 if (kbFiles.length > 0) {
 setKbSaveStatus(prev => {
 const next = { ...prev }
 kbFiles.forEach(f => { if (!next[f.name]) next[f.name] = 'saved' })
 return next
 })
 }
 }, [kbFiles.length])

 const reloadHistory = () => {
 setHistoryLoading(true)
 supabase.from('chat_conversations').select('*').eq('is_test', aiModes.chat === 'sandbox').order('created_at', { ascending: false }).limit(200)
 .then(({ data }) => { setHistoryConvs(data || []); setHistoryLoading(false) })
 }

 const refreshTicketEmails = async () => {
 if (refreshingEmails) return
 setRefreshingEmails(true)
 // Immediately refresh tickets — don't wait for Gmail
 onRefresh()
 try {
 const accessToken = session?.access_token
 if (!accessToken) return
 await fetch('/api/refresh-ticket-emails', {
 method: 'POST',
 headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
 })
 // Refresh again after Gmail to pick up any new email-replies
 onRefresh()
 } finally {
 setRefreshingEmails(false)
 }
 }

 const exportConvMd = (conv: any) => {
 const convMsgs: {role: string, text: string}[] = Array.isArray(conv.messages) ? conv.messages : []
 const date = new Date(conv.created_at).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
 const lines = [
 `# Chat Export — ${date}`,
 `**Session:** ${conv.session_id || 'unknown'}`,
 `**Messages:** ${conv.message_count || convMsgs.length}`,
 `**Status:** ${conv.resolved ? 'Resolved' : 'Open'}`,
 '',
 '---',
 '',
 ]
 convMsgs.forEach(m => {
 const role = m.role === 'user' ? '**Visitor**' : m.role === 'team' ? '**Team**' : '**Bot**'
 lines.push(`${role}: `)
 lines.push(m.text || '', '')
 })
 const content = lines.join('\n')
 const blob = new Blob([content], { type: 'text/markdown' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `chat-${(conv.session_id || 'export').slice(0, 8)}.md`
 document.body.appendChild(a)
 a.click()
 document.body.removeChild(a)
 URL.revokeObjectURL(url)
 }

 useEffect(() => {
 if (aiTab !== 'history' || aiModes.chat === null) return
 reloadHistory()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [aiTab, aiModes.chat])

 // Auto-archive previous-day chats on load (skip chats that have an open ticket)
 useEffect(() => {
 if (historyLoading || historyConvs.length === 0) return
 const todayStr = new Date().toISOString().slice(0, 10)
 const toArchive = historyConvs.filter(c => {
 if (c.archived) return false
 const convDate = (c.created_at || '').slice(0, 10)
 if (convDate >= todayStr) return false
 // keep if there is an open (unresolved) ticket linked to this session
 const hasOpenTicket = tickets.some(t => t.sessionId === c.session_id && t.status !== 'resolved')
 return !hasOpenTicket
 })
 if (toArchive.length === 0) return
 const ids = toArchive.map(c => c.session_id)
 supabase.from('chat_conversations')
 .update({ archived: true, updated_at: new Date().toISOString() })
 .in('session_id', ids)
 .then(() => setHistoryConvs(prev => prev.map(c => ids.includes(c.session_id) ? { ...c, archived: true } : c)))
 }, [historyLoading])

 const resolveConv = async (sessionId: string) => {
 await supabase.from('chat_conversations').update({ resolved: true, updated_at: new Date().toISOString() }).eq('session_id', sessionId)
 setHistoryConvs(prev => prev.map(c => c.session_id === sessionId ? { ...c, resolved: true } : c))
 }

 const archiveConv = async (sessionId: string) => {
 await supabase.from('chat_conversations').update({ archived: true, updated_at: new Date().toISOString() }).eq('session_id', sessionId)
 setHistoryConvs(prev => prev.map(c => c.session_id === sessionId ? { ...c, archived: true } : c))
 setSelectedConvId(null)
 }

 const unarchiveConv = async (sessionId: string) => {
 await supabase.from('chat_conversations').update({ archived: false, updated_at: new Date().toISOString() }).eq('session_id', sessionId)
 setHistoryConvs(prev => prev.map(c => c.session_id === sessionId ? { ...c, archived: false } : c))
 setSelectedConvId(null)
 }

 const fmtTime = (iso: string) => {
 const d = new Date(iso), now = new Date()
 const diffMs = now.getTime() - d.getTime()
 const diffMin = Math.floor(diffMs / 60000)
 const diffH = Math.floor(diffMs / 3600000)
 const diffD = Math.floor(diffMs / 86400000)
 if (diffMin < 2) return 'Just now'
 if (diffH < 1) return `${diffMin} min ago`
 if (diffD < 1) return `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
 if (diffD < 2) return `Yesterday ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
 return `${diffD} days ago`
 }
 const [faqs, setFaqs] = useState([
 { q: 'Can I book just one dive, or do I need a package?', a: 'Yes — single dives are available on request. Our standard schedule runs double dives, which makes planning easier, but if you only want one dive, just let us know when booking.' },
 { q: 'How do I book?', a: 'Online through our website, by walking up to our kiosk at the marina, or via WhatsApp (+351 927 382 023). We love walk-ins and respond quickly on WhatsApp.' },
 { q: 'Is card payment accepted?', a: 'Yes — card payment is accepted at the kiosk and online.' },
 { q: 'What is your cancellation policy?', a: 'Cancel up to 72 hours before: full refund. Cancel between 72 and 48 hours before: 50% refund. Cancel less than 48 hours before or no-show: no refund. Need to reschedule? Reach out as early as possible and we will do our best to find you another slot.' },
 { q: 'I have never dived before — what can I do?', a: 'Our Basic Diver programme is made for this. No certification, no experience needed — just a minimum age of 10. You get online theory beforehand, a pool skills session, then a real harbour dive to up to 12 m with your instructor. You leave with an official SSI Basic Diver certification. Many guests call it one of the best hours of their lives.' },
 { q: 'Can a non-diving companion come on the boat?', a: 'Yes. A partner or friend who does not dive is welcome on the boat trip. Let us know when booking so we can confirm space. Non-divers can snorkel or simply enjoy being out on the Atlantic.' },
 { q: 'What certification do I need for the Formigas expedition?', a: 'Advanced Open Water (or equivalent) plus a minimum of 40 logged dives. See the Formigas page for full requirements and to join the waitlist.' },
 { q: 'Is the Formigas trip guaranteed on a specific date?', a: 'No — it runs only when conditions allow the 42 nm offshore crossing safely. When a window opens, we contact everyone on the waitlist.' },
 { q: 'What can I expect to see underwater?', a: 'On a typical dive: grey triggerfish, barracuda, moray eels, groupers, stingrays, ornate wrasse, damselfish, and more Atlantic reef fish. Seasonally: Mola mola. At Formigas: mantas and other large pelagics. Our team includes marine biologists who love talking you through what is out there.' },
 { q: 'When is the best time of year?', a: 'We dive year-round. Mola mola and mantas are most common July through October. Visibility and conditions are excellent April through November.' },
 { q: 'What should I bring?', a: 'Just yourself and a swimsuit. We provide everything: wetsuit, BCD, regulator, fins, mask, and weights. Your own gear is welcome too.' },
 { q: 'How early should I arrive?', a: 'Please be at Marina Quiosque A at least 30 minutes before your scheduled departure for check-in, equipment fitting, and briefing.' },
 { q: 'What happens if conditions are bad?', a: 'Safety always comes first. If we cancel due to weather, sea conditions, or any safety reason, you choose: full refund or reschedule — your call, no pressure.' },
 { q: 'Can I fly after diving?', a: 'Yes, but timing matters. After certified dives, wait at least 24 hours before flying or travelling to significant altitude. After the Basic Diver programme (introductory diving), the minimum is 12 hours. This is a safety rule — nitrogen needs time to leave your body.' },
 { q: 'I have a medical condition or special requirements — can I still dive?', a: 'Please reach out before booking and we will do everything we can to make it work. We have dived with guests with depth restrictions, heart conditions, sensory differences, neurodiversity, and more. There is nothing too sensitive to ask — we would rather talk it through than have you miss the ocean.' },
 { q: 'I have been told I can only dive to a limited depth — is that a problem?', a: 'In most cases, not at all. Many of our dive sites are beautiful at shallower depths, and our guides adapt the dive plan entirely to your limit. Just let us know your restriction when booking.' },
 { q: 'Is diving suitable for guests with sensory sensitivities or neurodiversity?', a: 'Yes. We adjust our briefing approach, take extra time, and plan the dive around what works best for you. Talk to us in advance — we will prepare accordingly.' }
 ])
 const [newFaqQ, setNewFaqQ] = useState('')
 const [newFaqA, setNewFaqA] = useState('')
 const [apiKeySaved, setApiKeySaved] = useState(false)
 const [apiTestStatus, setApiTestStatus] = useState<'idle'|'testing'|'ok'|string>('idle')
 const testApiConnection = async () => {
 setApiTestStatus('testing')
 try {
 const res = await fetch('/api/chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: mistralModel, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
 })
 if (res.status === 503) { setApiTestStatus('503 – No API key configured in Vercel') }
 else if (res.ok) { setApiTestStatus('ok') }
 else {
 const err = await res.json().catch(() => ({}))
 setApiTestStatus(`${res.status} – ${err?.error || res.statusText}`)
 }
 } catch (e: any) { setApiTestStatus(`Network error – ${e.message}`) }
 }

 const hbAgo = (iso: string | null) => {
 if (!iso) return 'never'
 const ms = Date.now() - new Date(iso).getTime()
 const min = Math.floor(ms / 60000)
 const h = Math.floor(ms / 3600000)
 const d = Math.floor(ms / 86400000)
 if (min < 2) return 'just now'
 if (h < 1) return `${min} min ago`
 if (d < 1) return `${h}h ago`
 return `${d}d ago`
 }
 const hbColor = (row: CronHbRow | undefined, maxOkHours = 2) => {
 if (!row || !row.last_ok_at) return '#c9928c'
 if (row.last_status === 'error') return '#c9928c'
 const ms = Date.now() - new Date(row.last_ok_at).getTime()
 if (ms < 10 * 60 * 1000) return '#b7c4b0'
 if (ms < maxOkHours * 60 * 60 * 1000) return '#c9b48a'
 return '#c9928c'
 }

 return (
 <div style={{ background: s.bgDark, minHeight: '100vh', padding: '40px 40px 60px' }}>
 <div style={{ maxWidth: '1320px', margin: '0 auto' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
 <button type="button" onClick={() => nav('dashboard')} style={{ fontSize: '14px', color: s.accent, cursor: 'pointer', fontWeight: 500, background: 'none', border: 'none', padding: 0, fontFamily: s.font }}> Dashboard</button>
 <span style={{ color: s.muted }}>·</span>
 <span style={{ fontSize: '14px', color: s.muted }}>AI Support</span>
 </div>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
 <div>
 <div style={{ fontSize: '22px', fontWeight: 500, color: s.text, marginBottom: '4px' }}> AI Support — Chatbot Config</div>
 <div style={{ fontSize: '14px', color: s.muted }}>Powered by Mistral AI. Configure the system prompt, model, and FAQs for the customer-facing chat widget.</div>
 </div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: apiTestStatus === 'ok' ? 'rgba(183,196,176,.08)' : 'rgba(243,239,230,.06)', border: `1px solid ${apiTestStatus === 'ok' ? 'rgba(183,196,176,.3)' : 'rgba(243,239,230,.18)'}`, borderRadius: 0, padding: '7px 13px' }}>
 <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: apiTestStatus === 'ok' ? '#b7c4b0' : s.accent, display: 'inline-block' }} />
 <span style={{ fontSize: '14px', color: apiTestStatus === 'ok' ? '#b7c4b0' : s.accent, fontWeight: 500 }}>{apiTestStatus === 'ok' ? 'Connected · Mistral AI' : 'Key via Vercel env var'}</span>
 </div>
 </div>

 {/* Cron job heartbeat status */}
 {userRole !== 'admin' ? null : cronHbError ? (
 <div style={{ marginBottom: '20px', fontSize: '14px', color: '#c9928c', background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.25)', borderRadius: 0, padding: '8px 14px', fontFamily: 'ui-monospace,monospace' }}>
 cron_heartbeat read error: {cronHbError}
 </div>
 ) : cronHb !== null ? (
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
 {([{ key: 'poll-gmail', label: 'Last email fetch', maxOkHours: 2 }, { key: 'triage-classify', label: 'Last triage run', maxOkHours: 2 }, { key: 'post-dive', label: 'Last post-dive run', maxOkHours: 26 }] as const).map(({ key, label, maxOkHours }) => {
 const row = cronHb.find(r => r.job_name === key)
 const color = hbColor(row, maxOkHours)
 const timeStr = hbAgo(row?.last_ok_at ?? null)
 const status = row
 ? (row.last_status === 'error' ? `ERROR: ${(row.last_detail ?? '').slice(0, 80)}` : 'ok')
 : 'never ran'
 return (
 <div key={key} title={row?.last_detail ?? undefined} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '6px 12px', fontSize: '14px', color: s.muted, fontFamily: s.font }}>
 <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
 <span>{label}:</span>
 <span style={{ color: s.text, fontWeight: 500 }}>{timeStr}</span>
 <span style={{ color }}>· {status}</span>
 </div>
 )
 })}
 </div>
 ) : null}

 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, overflow: 'hidden' }}>
 {/* Tabs */}
 <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,.08)', overflowX: 'auto' }}>
 {(['prompt', 'faq', 'knowledge', 'history', 'tickets', 'changelog', ...(userRole === 'admin' ? ['triage' as const] : [])] as const).map(tab => {
 const openCount = tickets.filter(t => (t.status === 'open' || t.status === 'in_progress') && !t.archived).length
 return (
 <button key={tab} onClick={() => { setAiTab(tab); localStorage.setItem('azd_aiTab', tab) }} style={{ flex: 1, minWidth: '80px', padding: '14px 8px', fontSize: '14px', fontWeight: 500, border: 'none', background: 'transparent', cursor: 'pointer', color: aiTab === tab ? s.accent : s.muted, borderBottom: aiTab === tab ? `2px solid ${s.accent}` : '2px solid transparent', fontFamily: s.font, transition: 'color .15s', whiteSpace: 'nowrap', position: 'relative' }}>
 {tab === 'prompt' ? ' Configuration' : tab === 'faq' ? ' FAQs' : tab === 'knowledge' ? ' Knowledge' : tab === 'history' ? ' History' : tab === 'tickets' ? ' Tickets' : tab === 'changelog' ? ' Changelog' : ' Triage'}
 {tab === 'tickets' && openCount > 0 && <span style={{ marginLeft: '5px', fontSize: '14px', fontWeight: 500, background: '#c9928c', color: '#f3efe6', borderRadius: 0, padding: '1px 5px' }}>{openCount}</span>}
 </button>
 )
 })}
 </div>

 {/* System Prompt */}
 {aiTab === 'prompt' && (
 <div style={{ padding: '28px' }}>
 {userRole === 'admin' && (
 <div style={{ marginBottom: '20px', background: 'rgba(201,180,138,.05)', border: '1px solid rgba(201,180,138,.22)', borderRadius: 0, padding: '16px 18px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '3px' }}>Sandbox / Production</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px' }}>Independent of the global switch. Sets what the chatbot issues and what this dashboard shows and creates.</div>
 {([
 ['link', 'Chatbot payment link', 'Sandbox = Stripe test link (staff login needed, no real money) · Production = live link', aiModes.link],
 ['chat', 'Chatbot conversations', 'Which conversations are shown here; new chats are stored in this mode', aiModes.chat],
 ['tickets', 'Tickets', 'Which tickets are shown here; new tickets are created in this mode', aiModes.tickets],
 ] as const).map(([k, label, hint, val]) => (
 <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap' }}>
 <div style={{ minWidth: '220px', flex: 1 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{label}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{hint}</div>
 </div>
 <div style={{ display: 'flex', gap: '6px' }}>
 {(['sandbox', 'production'] as const).map(m => (
 <button key={m} type="button" disabled={val === null} onClick={() => { if (val !== m) changeAiMode(k, m) }}
 style={{ padding: '6px 12px', borderRadius: 0, fontSize: '14px', fontWeight: 500, cursor: val === null ? 'wait' : 'pointer', fontFamily: 'inherit',
 border: `1px solid ${val === m ? (m === 'sandbox' ? 'rgba(201,180,138,.6)' : 'rgba(183,196,176,.5)') : 'rgba(255,255,255,.15)'}`,
 background: val === m ? (m === 'sandbox' ? 'rgba(201,180,138,.18)' : 'rgba(183,196,176,.14)') : 'transparent',
 color: val === m ? (m === 'sandbox' ? '#c9b48a' : '#b7c4b0') : s.muted }}>
 {m === 'sandbox' ? ' Sandbox' : ' Production'}
 </button>
 ))}
 </div>
 </div>
 ))}
 {(aiModeMsg || aiModesError) && <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 500, color: (aiModeMsg || aiModesError || '').startsWith('') ? '#b7c4b0' : '#c9928c' }}>{aiModeMsg || aiModesError}</div>}
 </div>
 )}
 {userRole === 'admin' && (
 <div style={{ marginBottom: '20px', background: 'rgba(243,239,230,.04)', border: '1px solid rgba(243,239,230,.14)', borderRadius: 0, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '3px' }}>Chatbot Booking</div>
 <div style={{ fontSize: '14px', color: s.muted }}>Allow guests to create bookings via the chatbot</div>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
 <button
 onClick={() => { if (bookingToggle !== null && !bookingToggleSaving) saveBookingToggle(!bookingToggle) }}
 disabled={bookingToggle === null || bookingToggleSaving}
 title={bookingToggleSaving ? 'Saving…' : bookingToggle ? 'Click to disable chatbot booking' : 'Click to enable chatbot booking'}
 style={{ position: 'relative', width: '52px', height: '28px', borderRadius: 0, border: 'none', background: bookingToggle ? '#b7c4b0' : 'rgba(255,255,255,.15)', cursor: bookingToggle === null || bookingToggleSaving ? 'not-allowed' : 'pointer', opacity: bookingToggle === null ? 0.5 : 1, transition: 'background .2s', flexShrink: 0 }}
 >
 <span style={{ position: 'absolute', top: '4px', left: bookingToggle ? '28px' : '4px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: 'none' }} />
 </button>
 <span style={{ fontSize: '14px', fontWeight: 500, color: bookingToggle ? '#b7c4b0' : 'rgba(255,255,255,.35)', letterSpacing: '.04em' }}>
 {bookingToggleSaving ? 'Saving…' : bookingToggle ? 'Enabled — guests can book via chat' : bookingToggle === null ? '…' : 'Disabled — chat info only'}
 </span>
 </div>
 </div>
 )}
 {userRole === 'admin' ? (<>
 <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, marginBottom: '16px' }}>The system prompt controls the chatbot&apos;s personality and behaviour. Loaded before every conversation. <span style={{ color: s.accent }}>Changes apply immediately</span> — Save stores permanently.</p>
 <textarea value={systemPrompt} onChange={e => { const v = e.target.value; setSystemPrompt(v); localStorage.setItem('azd_mistral_prompt_v2', v); setPromptSaved(false) }}
 style={{ width: '100%', minHeight: '200px', background: '#000', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '14px', fontSize: '14px', color: s.text, lineHeight: 1.65, fontFamily: 'ui-monospace,monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
 <div style={{ fontSize: '14px', color: s.muted }}>{systemPrompt.length} chars · ~{Math.ceil(systemPrompt.length / 4)} tokens</div>
 <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
 {promptSaved ? <span style={{ fontSize: '14px', color: '#b7c4b0' }}> Saved</span> : <span style={{ fontSize: '14px', color: '#c9b48a' }}> Unsaved</span>}
 <button onClick={() => { localStorage.setItem('azd_mistral_prompt_v2', systemPrompt); setSystemPrompt(systemPrompt); setPromptSaved(true) }} style={{ padding: '9px 20px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Save</button>
 </div>
 </div>
 <div style={{ marginTop: '22px', background: 'rgba(243,239,230,.04)', border: '1px solid rgba(243,239,230,.14)', borderRadius: 0, padding: '18px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent, marginBottom: '4px' }}> Mistral API — Model &amp; Connection</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '16px', lineHeight: 1.6 }}>
 The API key is stored securely as <code style={{ background: 'rgba(255,255,255,.07)', padding: '1px 5px', borderRadius: 0, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>MISTRAL_API_KEY</code> in Vercel — never exposed to the browser.
 To rotate the key: <a href="https://vercel.com/azd5/azd/settings/environment-variables" target="_blank" rel="noreferrer" style={{ color: s.accent, fontWeight: 500 }}>Vercel Dashboard Environment Variables</a>.
 </div>
 <div style={{ marginBottom: '14px' }}>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '6px' }}>Model</div>
 <select value={mistralModel} onChange={e => { setMistralModel(e.target.value); localStorage.setItem('azd_mistral_model', e.target.value) }} style={{ background: '#000', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, padding: '9px 12px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none', minWidth: '280px' }}>
 <option value="mistral-large-latest">mistral-large-latest — Most capable</option>
 <option value="mistral-medium-latest">mistral-medium-latest — Balanced</option>
 <option value="mistral-small-latest">mistral-small-latest — Fast &amp; cheap</option>
 <option value="open-mistral-nemo">open-mistral-nemo — Fastest</option>
 <option value="pixtral-large-latest">pixtral-large-latest — Multimodal</option>
 <option value="codestral-latest">codestral-latest — Code specialised</option>
 </select>
 </div>
 <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
 <button onClick={testApiConnection} disabled={apiTestStatus === 'testing'} style={{ padding: '8px 16px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'transparent', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {apiTestStatus === 'testing' ? 'Testing…' : 'Test connection'}
 </button>
 {apiTestStatus === 'ok' && <span style={{ fontSize: '14px', fontWeight: 500, padding: '4px 10px', borderRadius: 0, background: 'rgba(183,196,176,.12)', color: '#b7c4b0', border: '1px solid rgba(183,196,176,.3)' }}> Connected</span>}
 {apiTestStatus !== 'idle' && apiTestStatus !== 'testing' && apiTestStatus !== 'ok' && (
 <span title={apiTestStatus} style={{ fontSize: '14px', fontWeight: 500, padding: '4px 10px', borderRadius: 0, background: 'rgba(201,146,140,.12)', color: '#c9928c', border: '1px solid rgba(201,146,140,.3)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}> {apiTestStatus}</span>
 )}
 </div>
 </div>
 </> ) : (
 <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: 'rgba(255,255,255,.35)', letterSpacing: '.02em' }}> Admin access required to edit configuration</div>
 )}
 </div>
 )}

 {/* FAQs */}
 {aiTab === 'faq' && (
 <div style={{ padding: '28px' }}>
 <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, marginBottom: '20px' }}>FAQs are automatically appended to the system prompt — the AI uses them as ready-made answers.</p>
 {faqs.map((faq, i) => (
 <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 0, padding: '13px 16px', marginBottom: '8px', border: '1px solid rgba(255,255,255,.07)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '5px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>Q: {faq.q}</div>
 <button onClick={() => setFaqs(f => f.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: '#c9928c', cursor: 'pointer', fontSize: '14px', flexShrink: 0, padding: '0 2px' }}></button>
 </div>
 <div style={{ fontSize: '14px', color: s.muted }}>A: {faq.a}</div>
 </div>
 ))}
 <div style={{ marginTop: '20px', background: 'rgba(243,239,230,.04)', border: '1px solid rgba(243,239,230,.14)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent, marginBottom: '12px' }}>+ Add FAQ</div>
 <input value={newFaqQ} onChange={e => setNewFaqQ(e.target.value)} placeholder="Question…" style={{ width: '100%', background: '#000', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, padding: '9px 12px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }} />
 <textarea value={newFaqA} onChange={e => setNewFaqA(e.target.value)} placeholder="Answer…" rows={2} style={{ width: '100%', background: '#000', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, padding: '9px 12px', fontSize: '16px', color: s.text, fontFamily: s.font, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
 <button onClick={() => { if (newFaqQ.trim() && newFaqA.trim()) { setFaqs(f => [...f, { q: newFaqQ.trim(), a: newFaqA.trim() }]); setNewFaqQ(''); setNewFaqA('') } }}
 style={{ marginTop: '10px', padding: '9px 22px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Add</button>
 </div>
 </div>
 )}

 {/* Knowledge Base */}
 {aiTab === 'knowledge' && (
 <div style={{ padding: '28px' }}>
 <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, marginBottom: '20px' }}>Upload PDF, Markdown or TXT files — they get added to the AI's knowledge. Price lists, SSI guidelines, site descriptions, etc.</p>
 <label style={{ display: 'block', border: '2px dashed rgba(243,239,230,.25)', borderRadius: 0, padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: '20px', background: 'rgba(243,239,230,.03)' }}>
 <input type="file" accept=".md,.txt,.pdf" multiple style={{ display: 'none' }}
 onChange={e => {
 Array.from(e.target.files || []).forEach(file => {
 if (kbFiles.some(f => f.name === file.name)) return
 const reader = new FileReader()
 reader.onload = async ev => {
 const content = (ev.target?.result as string) || ''
 setKbFiles(prev => [...prev, { name: file.name, content }])
 setKbSaveStatus(prev => ({ ...prev, [file.name]: 'saving' }))
 const { error } = await supabase.from('kb_files').upsert({ name: file.name, content, size_chars: content.length }, { onConflict: 'name' })
 if (error) {
 console.error('KB save failed:', error)
 setKbSaveStatus(prev => ({ ...prev, [file.name]: 'error' }))
 } else {
 setKbSaveStatus(prev => ({ ...prev, [file.name]: 'saved' }))
 }
 }
 reader.readAsText(file)
 })
 e.target.value = ''
 }} />
 <div style={{ fontSize: '28px', marginBottom: '8px' }}></div>
 <div style={{ fontSize: '14px', color: s.text, fontWeight: 500 }}>Drop files or click to browse</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '4px' }}>PDF · Markdown · TXT — max 10 MB</div>
 </label>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '10px' }}>Uploaded files</div>
 {kbFiles.length === 0 && <div style={{ fontSize: '14px', color: s.muted, textAlign: 'center', padding: '12px 0' }}>No files uploaded yet — TXT and Markdown are best for large docs.</div>}
 {kbFiles.map((f, i) => {
 const status = kbSaveStatus[f.name] || 'saved'
 return (
 <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: status === 'error' ? 'rgba(255,107,107,.05)' : 'rgba(255,255,255,.04)', borderRadius: 0, marginBottom: '6px', border: `1px solid ${status === 'error' ? 'rgba(255,107,107,.2)' : status === 'saving' ? 'rgba(243,239,230,.2)' : 'rgba(255,255,255,.07)'}` }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
 <span style={{ fontSize: '14px' }}>{f.name.endsWith('.pdf') ? '' : f.name.endsWith('.md') ? '' : ''}</span>
 <span style={{ fontSize: '14px', color: s.text }}>{f.name}</span>
 </div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>{f.content.length > 999 ? Math.round(f.content.length / 1000) + 'k' : f.content.length} chars</span>
 {status === 'saving' && <span style={{ fontSize: '14px', color: s.accent, fontWeight: 500, animation: 'pulse 1s infinite' }}> Saving…</span>}
 {status === 'saved' && <span style={{ fontSize: '14px', color: '#b7c4b0', fontWeight: 500 }}> Saved in DB</span>}
 {status === 'error' && (
 <>
 <span style={{ fontSize: '14px', color: '#c9928c', fontWeight: 500 }}> Save failed</span>
 <button onClick={async () => {
 setKbSaveStatus(prev => ({ ...prev, [f.name]: 'saving' }))
 const { error } = await supabase.from('kb_files').upsert({ name: f.name, content: f.content, size_chars: f.content.length }, { onConflict: 'name' })
 setKbSaveStatus(prev => ({ ...prev, [f.name]: error ? 'error' : 'saved' }))
 }} style={{ padding: '2px 8px', borderRadius: 0, border: '1px solid rgba(255,107,107,.4)', background: 'transparent', color: '#c9928c', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Retry</button>
 </>
 )}
 <button onClick={() => { const name = f.name; setKbFiles(prev => prev.filter((_, j) => j !== i)); setKbSaveStatus(prev => { const n = { ...prev }; delete n[name]; return n }); void supabase.from('kb_files').delete().eq('name', name) }} style={{ background: 'transparent', border: 'none', color: '#c9928c', cursor: 'pointer', fontSize: '14px' }}></button>
 </div>
 </div>
 )
 })}
 <div style={{ marginTop: '28px', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '24px' }}>
 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '6px' }}>Website Content Sync</div>
 <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, margin: 0 }}>
 Pushes the current site content (products, prices, dive sites, policies) into the bot's knowledge. Hit this whenever prices or products change.
 </p>
 </div>
 <button onClick={syncWebsiteContent} disabled={websiteSyncStatus === 'syncing'}
 style={{ padding: '10px 20px', borderRadius: 0, border: `1px solid ${websiteSyncStatus === 'synced' ? 'rgba(183,196,176,.5)' : websiteSyncStatus === 'error' ? 'rgba(255,107,107,.5)' : 'rgba(243,239,230,.35)'}`, background: websiteSyncStatus === 'synced' ? 'rgba(183,196,176,.12)' : websiteSyncStatus === 'error' ? 'rgba(255,107,107,.1)' : 'rgba(243,239,230,.1)', color: websiteSyncStatus === 'synced' ? '#b7c4b0' : websiteSyncStatus === 'error' ? '#c9928c' : s.accent, fontWeight: 500, fontSize: '14px', cursor: websiteSyncStatus === 'syncing' ? 'default' : 'pointer', fontFamily: s.font, whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .2s' }}>
 {websiteSyncStatus === 'syncing' ? ' Syncing…' : websiteSyncStatus === 'synced' ? ' Synced!' : websiteSyncStatus === 'error' ? ' Error — retry' : ' Sync Website Content'}
 </button>
 </div>
 <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 0, padding: '14px 16px', border: '1px solid rgba(255,255,255,.07)', maxHeight: '180px', overflowY: 'auto' }}>
 <pre style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,.35)', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{WEBSITE_KNOWLEDGE.slice(0, 600)}…</pre>
 </div>
 <p style={{ fontSize: '14px', color: s.muted, marginTop: '8px', opacity: .6 }}>
 Stored as <code style={{ background: 'rgba(255,255,255,.06)', padding: '1px 5px', borderRadius: 0, fontSize: '14px' }}>website-content.txt</code> in the knowledge base. Edit the <code style={{ background: 'rgba(255,255,255,.06)', padding: '1px 5px', borderRadius: 0, fontSize: '14px' }}>WEBSITE_KNOWLEDGE</code> constant in the source code to update.
 </p>
 </div>
 </div>
 )}

 {/* Chat History */}
 {aiTab === 'history' && (
 <div style={{ padding: '28px' }}>
 {/* Header */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
 <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, margin: 0 }}>Every customer chat is logged here automatically.</p>
 <button onClick={reloadHistory} style={{ marginLeft: '16px', padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', flexShrink: 0, fontFamily: s.font }}> Refresh</button>
 </div>

 {/* Sub-tabs */}
 <div style={{ display: 'flex', gap: '4px', marginBottom: '18px', background: 'rgba(255,255,255,.04)', borderRadius: 0, padding: '3px' }}>
 {(['active', 'archived'] as const).map(tab => (
 <button key={tab} onClick={() => { setHistorySubTab(tab); localStorage.setItem('azd_historySubTab', tab); setSelectedConvId(null); setHistorySearch('') }}
 style={{ flex: 1, padding: '6px 0', borderRadius: 0, border: 'none', background: historySubTab === tab ? 'rgba(243,239,230,.15)' : 'transparent', color: historySubTab === tab ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, textTransform: 'capitalize' }}>
 {tab === 'active' ? `Active (${historyConvs.filter(c => !c.archived).length})` : `Archive (${historyConvs.filter(c => c.archived).length})`}
 </button>
 ))}
 </div>

 {/* Archive search */}
 {historySubTab === 'archived' && (
 <input
 value={historySearch}
 onChange={e => setHistorySearch(e.target.value)}
 placeholder="Search archived conversations…"
 style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px', padding: '9px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none' }}
 />
 )}

 {historyLoading && <div style={{ textAlign: 'center', padding: '40px 20px', color: s.muted, fontSize: '14px' }}>Loading…</div>}

 {/* Conversation list */}
 {!historyLoading && (() => {
 const filtered = historyConvs
 .filter(c => historySubTab === 'archived' ? c.archived : !c.archived)
 .filter(c => !historySearch || (c.first_message || '').toLowerCase().includes(historySearch.toLowerCase()))
 if (filtered.length === 0) return (
 <div style={{ textAlign: 'center', padding: '48px 20px', color: s.muted, fontSize: '14px' }}>
 <div style={{ fontSize: '28px', marginBottom: '10px' }}>{historySubTab === 'archived' ? '' : ''}</div>
 {historySubTab === 'archived' ? (historySearch ? 'No results for your search.' : 'No archived conversations yet.') : 'No conversations yet — they appear here as soon as visitors chat.'}
 </div>
 )
 return filtered.map((conv) => {
 const isOpen = selectedConvId === conv.session_id
 const msgs: {role: string, text: string}[] = Array.isArray(conv.messages) ? conv.messages : []
 return (
 <div key={conv.session_id} style={{ marginBottom: '8px', border: `1px solid ${isOpen ? 'rgba(243,239,230,.25)' : 'rgba(255,255,255,.07)'}`, borderRadius: 0, overflow: 'hidden' }}>
 {/* Header row */}
 <button type="button" onClick={() => setSelectedConvId(isOpen ? null : conv.session_id)}
 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: isOpen ? 'rgba(243,239,230,.05)' : 'rgba(255,255,255,.03)', cursor: 'pointer', width: '100%', border: 'none', fontFamily: s.font, textAlign: 'left' }}
 onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
 onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,.03)' }}>
 {(() => {
 const isLead = (conv.first_message || '').startsWith('[CONTACT]')
 const raw = (conv.first_message || '').replace('[CONTACT] ', '')
 const displayMsg = isLead
 ? raw.replace('WhatsApp:', ' ').replace('email:', ' ')
 : (conv.first_message || '(no message)')
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
 <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isLead ? 'rgba(183,196,176,.1)' : 'rgba(243,239,230,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{isLead ? '' : ''}</div>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>{displayMsg}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{isLead ? 'Lead capture' : `${conv.message_count} messages`} · {fmtTime(conv.created_at)}</div>
 </div>
 </div>
 )
 })()}
 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '10px' }}>
 {historySubTab === 'active' && !conv.resolved && (
 <button onClick={e => { e.stopPropagation(); resolveConv(conv.session_id) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(183,196,176,.3)', background: 'transparent', color: '#b7c4b0', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>Mark as Resolved</button>
 )}
 {historySubTab === 'active' && (
 <button onClick={e => { e.stopPropagation(); archiveConv(conv.session_id) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Archive</button>
 )}
 {historySubTab === 'archived' && (
 <button onClick={e => { e.stopPropagation(); unarchiveConv(conv.session_id) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Unarchive</button>
 )}
 <button onClick={e => { e.stopPropagation(); exportConvMd(conv) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.35)', background: 'transparent', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}> Export</button>
 <span style={{ fontSize: '14px', color: s.muted, transition: 'transform .2s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}></span>
 </div>
 </button>
 {/* Expanded messages */}
 {isOpen && (
 <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', background: 'rgba(0,0,0,.2)' }}>
 <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
 {msgs.length === 0 && <div style={{ color: s.muted, fontSize: '14px', textAlign: 'center' }}>No messages recorded.</div>}
 {msgs.map((m, i) => (
 <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
 <div style={{ maxWidth: '80%', padding: '9px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? 'rgba(243,239,230,.15)' : m.role === 'team' ? 'rgba(183,196,176,.1)' : 'rgba(255,255,255,.06)', border: m.role === 'user' ? '1px solid rgba(243,239,230,.2)' : m.role === 'team' ? '1px solid rgba(183,196,176,.25)' : '1px solid rgba(255,255,255,.08)', fontSize: '14px', color: s.text, lineHeight: 1.5 }}>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '4px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em' }}>{m.role === 'user' ? 'Visitor' : m.role === 'team' ? 'Team' : 'Bot'}</div>
 {m.text}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 )
 })
 })()}
 </div>
 )}

 {/* Tickets */}
 {aiTab === 'tickets' && (
 <div style={{ padding: '28px' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
 <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6, margin: 0 }}>Support tickets created when the chatbot can't help a visitor. Reply directly via email from here.</p>
 <button onClick={refreshTicketEmails} disabled={refreshingEmails} style={{ flexShrink: 0, marginLeft: '16px', padding: '7px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: refreshingEmails ? 'rgba(255,255,255,.3)' : s.muted, fontSize: '14px', fontWeight: 500, cursor: refreshingEmails ? 'default' : 'pointer', fontFamily: s.font, display: 'flex', alignItems: 'center', gap: '5px' }}>{refreshingEmails ? ' Checking emails…' : ' Refresh'}</button>
 </div>
 {/* Sub-tabs + Mine/All */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
 <div style={{ display: 'flex', gap: '8px' }}>
 {(['open', 'archived'] as const).map(st => {
 const cnt = st === 'open' ? tickets.filter(t => !t.archived && t.status === 'open').length : tickets.filter(t => t.archived).length
 return (
 <button key={st} onClick={() => { setTicketSubTab(st); setExpandedTicketId(null); localStorage.setItem('azd_ticketSubTab', st) }}
 style={{ padding: '7px 16px', borderRadius: 0, border: `1px solid ${ticketSubTab === st ? 'rgba(243,239,230,.3)' : 'rgba(255,255,255,.1)'}`, background: ticketSubTab === st ? 'rgba(243,239,230,.08)' : 'transparent', color: ticketSubTab === st ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {st === 'open' ? ' Open' : ' Archived'}
 {cnt > 0 && <span style={{ marginLeft: '6px', fontSize: '14px', fontWeight: 500, background: st === 'open' ? '#c9928c' : 'rgba(255,255,255,.15)', color: '#f3efe6', borderRadius: 0, padding: '1px 6px' }}>{cnt}</span>}
 </button>
 )
 })}
 </div>
 {ticketSubTab === 'open' && (
 <div style={{ display: 'flex', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, overflow: 'hidden' }}>
 {(['all', 'mine'] as const).map(f => (
 <button key={f} onClick={() => { setTicketOwnerFilter(f); localStorage.setItem('azd_ticketOwnerFilter', f) }}
 style={{ padding: '6px 14px', border: 'none', background: ticketOwnerFilter === f ? 'rgba(201,146,140,.15)' : 'transparent', color: ticketOwnerFilter === f ? '#ff5050' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, transition: 'background .15s' }}>
 {f === 'all' ? 'All' : `Mine${staffName ? ' (' + staffName + ')' : ''}`}
 </button>
 ))}
 </div>
 )}
 </div>
 {/* Ticket list */}
 {(() => {
 const filtered = (ticketSubTab === 'open'
 ? tickets.filter(t => !t.archived)
 : tickets.filter(t => t.archived)
 ).filter(t => ticketOwnerFilter === 'mine' ? t.claimedBy === staffName : true)
 if (filtered.length === 0) return (
 <div style={{ textAlign: 'center', padding: '48px 20px', color: s.muted, fontSize: '14px' }}>
 <div style={{ fontSize: '28px', marginBottom: '10px' }}>{ticketSubTab === 'archived' ? '' : ''}</div>
 {ticketSubTab === 'archived' ? 'No archived tickets.' : 'No tickets yet — they appear here when the bot escalates a conversation.'}
 </div>
 )
 return filtered.map(ticket => {
 const isExpanded = expandedTicketId === ticket.id
 const reply = ticketReply[ticket.id] || ''
 const statusColor = ticket.status === 'open' ? '#d4a07a' : ticket.status === 'in_progress' ? '#ff5050' : '#b7c4b0'
 const statusBg = ticket.status === 'open' ? 'rgba(212,160,122,.12)' : ticket.status === 'in_progress' ? 'rgba(201,146,140,.12)' : 'rgba(183,196,176,.1)'
 const ageHours = ticket.status === 'open' && !ticket.claimedBy ? (Date.now() - new Date(ticket.unclaimedSince ?? ticket.timestamp.replace(' · ', 'T').replace(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/, '$1T$2:00')).getTime()) / 36e5 : 0
 const ageColor = ageHours > 72 ? 'rgba(201,146,140,.22)' : ageHours > 24 ? 'rgba(212,160,122,.16)' : ageHours > 2 ? 'rgba(212,160,122,.08)' : ''
 const ageBorderColor = ageHours > 72 ? 'rgba(201,146,140,.5)' : ageHours > 24 ? 'rgba(212,160,122,.4)' : ageHours > 2 ? 'rgba(212,160,122,.25)' : ''
 const ageLabel = ageHours > 72 ? ` ${Math.floor(ageHours / 24)}d unclaimed` : ageHours > 24 ? `${Math.floor(ageHours / 24)}d unclaimed` : ageHours > 2 ? `${Math.floor(ageHours)}h unclaimed` : ''
 const ageLabelColor = ageHours > 72 ? 'rgba(201,146,140,.95)' : ageHours > 24 ? 'rgba(212,160,122,.9)' : 'rgba(212,160,122,.75)'
 // Shared send-in-chat logic (used by button click AND Enter key)
 const sendChatReply = async () => {
 if (!reply.trim() || !ticket.sessionId) return
 const tid = ticket.id
 const replyText = reply.trim()
 setTicketReply(prev => ({ ...prev, [tid]: '' }))
 setTicketReplySending(prev => ({ ...prev, [tid]: 'sending' }))
 const existingMsgs = liveChats[ticket.sessionId!] || []
 const updatedMsgs = [...existingMsgs, { role: 'team', text: replyText, sender: staffName || 'AZD Team' }]
 const { error } = await supabase.from('chat_conversations')
 .update({ staff_reply_text: replyText, staff_reply_at: new Date().toISOString(), messages: updatedMsgs, updated_at: new Date().toISOString() })
 .eq('session_id', ticket.sessionId)
 if (error) {
 setTicketReplySending(prev => ({ ...prev, [tid]: 'error' }))
 } else {
 setLiveChats(prev => ({ ...prev, [ticket.sessionId!]: updatedMsgs }))
 try {
 const bc = supabase.channel('staff-reply-' + ticket.sessionId)
 await Promise.race([
 new Promise<void>(res => { bc.subscribe(status => { if (status === 'SUBSCRIBED') res() }) }),
 new Promise<void>(res => setTimeout(res, 3000))
 ])
 await bc.send({ type: 'broadcast', event: 'staff_reply', payload: { text: replyText, sender: staffName || 'AZD Team' } })
 supabase.removeChannel(bc)
 } catch {}
 setTicketReplySending(prev => ({ ...prev, [tid]: 'sent' }))
 setTimeout(() => setTicketReplySending(prev => ({ ...prev, [tid]: 'idle' })), 3000)
 }
 }
 const sendEmailReply = async () => {
 if (!reply.trim()) return
 const tid = ticket.id
 const replyText = reply.trim()
 setTicketEmailSending(prev => ({ ...prev, [tid]: 'sending' }))
 try {
 // Base64-encode any attached files
 const files = ticketAttachments[tid] ?? []
 const attachments = await Promise.all(files.map(file => new Promise<{ filename: string; content: string; mimeType: string }>((resolve, reject) => {
 const reader = new FileReader()
 reader.onload = () => {
 const dataUrl = reader.result as string
 const base64 = dataUrl.split(',')[1]
 resolve({ filename: file.name, content: base64, mimeType: file.type || 'application/octet-stream' })
 }
 reader.onerror = reject
 reader.readAsDataURL(file)
 })))
 const { data: { session: fresh } } = await supabase.auth.getSession()
 const res = await fetch('/api/send-email', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fresh?.access_token}` },
 body: JSON.stringify({ to: ticket.email, subject: 'Re: Your enquiry — Azores Diving', text: replyText, ticket_id: tid, attachments }),
 })
 if (res.ok) {
 setTicketReply(prev => ({ ...prev, [tid]: '' }))
 setTicketAttachments(prev => ({ ...prev, [tid]: [] }))
 setTicketEmailSending(prev => ({ ...prev, [tid]: 'sent' }))
 setTimeout(() => setTicketEmailSending(prev => ({ ...prev, [tid]: 'idle' })), 3000)
 } else {
 const errJson = await res.json().catch(() => ({})) as { error?: string }
 console.error('[send-email] API error', res.status, errJson)
 if (res.status === 401) {
 alert(`Session expired — please reload the page and try again.`)
 } else {
 alert(`Email error ${res.status}: ${errJson?.error ?? 'unknown'}`)
 }
 setTicketEmailSending(prev => ({ ...prev, [tid]: 'error' }))
 }
 } catch (e) {
 console.error('[send-email] fetch error', e)
 alert(`Email send exception: ${e}`)
 setTicketEmailSending(prev => ({ ...prev, [tid]: 'error' }))
 }
 }
 return (
 <div key={ticket.id} style={{ marginBottom: '10px', border: `1px solid ${isExpanded ? 'rgba(243,239,230,.25)' : ageBorderColor || (ticket.status === 'open' ? 'rgba(212,160,122,.2)' : ticket.status === 'in_progress' ? 'rgba(201,146,140,.25)' : 'rgba(255,255,255,.07)')}`, borderRadius: 0, overflow: 'hidden', background: ageColor || undefined }}>
 {/* Header row — click to expand */}
 <button type="button" onClick={() => { const nextId = isExpanded ? null : ticket.id; setExpandedTicketId(nextId); if (nextId && (ticket.note ?? '').startsWith('booking:') && ticket.status !== 'resolved') void loadSlots(ticket); if (nextId) loadTicketNotes(nextId) }}
 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 18px', background: isExpanded ? 'rgba(243,239,230,.04)' : 'rgba(255,255,255,.025)', cursor: 'pointer', width: '100%', border: 'none', fontFamily: s.font, textAlign: 'left' }}
 onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
 onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,.025)' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
 <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(212,160,122,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}></div>
 <div style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{ticket.name}</span>
 <span style={{ fontSize: '14px', fontWeight: 500, color: statusColor, background: statusBg, padding: '2px 7px', borderRadius: 0 }}>{ticket.status === 'open' ? ' Open' : ticket.status === 'in_progress' ? (ticket.claimedBy ? ` ${ticket.claimedBy}` : ' In Progress') : ' Resolved'}</span>
 {ticket.status === 'open' && ageLabel && <span style={{ fontSize: '14px', fontWeight: 500, color: ageLabelColor }}>{ageLabel}</span>}
 <span style={{ fontSize: '14px', fontWeight: 500, padding: '2px 7px', borderRadius: 0,
 background: ticket.preferredChannel === 'internal' ? 'rgba(201,180,138,.12)' : ticket.preferredChannel === 'form_submission' ? 'rgba(212,160,122,.1)' : ticket.preferredChannel === 'whatsapp' ? 'rgba(183,196,176,.12)' : 'rgba(243,239,230,.1)',
 color: ticket.preferredChannel === 'internal' ? '#c9b48a' : ticket.preferredChannel === 'form_submission' ? '#d4a07a' : ticket.preferredChannel === 'whatsapp' ? '#b7c4b0' : s.accent,
 border: `1px solid ${ticket.preferredChannel === 'internal' ? 'rgba(201,180,138,.3)' : ticket.preferredChannel === 'form_submission' ? 'rgba(212,160,122,.25)' : ticket.preferredChannel === 'whatsapp' ? 'rgba(183,196,176,.25)' : 'rgba(243,239,230,.2)'}` }}>
 {ticket.preferredChannel === 'internal' ? ' Internal · Instructor' : ticket.preferredChannel === 'form_submission' ? ' Contact Form' : ticket.preferredChannel === 'whatsapp' ? ' Bot · WhatsApp' : ' Bot · Email'}
 </span>
 {((newMsgCount ?? {})[ticket.id] ?? 0) > 0 && (
 <span style={{
 fontSize: '14px', fontWeight: 500, color: '#f3efe6',
 background: '#e53e3e', borderRadius: 0,
 padding: '1px 6px', minWidth: '18px', textAlign: 'center',
 lineHeight: '16px', display: 'inline-block',
 }}>
 {(newMsgCount ?? {})[ticket.id]}
 </span>
 )}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
 <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(ticket.id).then(() => showGlobalToast('Ticket ID copied')).catch(() => showGlobalToast('Could not copy')) }} title="Copy ticket ID" style={{ fontSize: '14px', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', padding: '1px 6px', borderRadius: 0, border: '1px solid rgba(243,239,230,.18)', background: 'rgba(243,239,230,.05)', color: 'rgba(243,239,230,.6)', cursor: 'pointer', letterSpacing: '.03em' }}>#{ticket.id.slice(0, 8)}</button>
 <span>{ticket.email}</span>
 <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(ticket.email).then(() => showGlobalToast('Email copied')).catch(() => showGlobalToast('Could not copy')) }} title="Copy email" style={{ fontSize: '14px', padding: '1px 5px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: s.muted, cursor: 'pointer', fontFamily: s.font }}></button>
 {ticket.phone && (<><span>· {ticket.phone}</span><button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(ticket.phone || '').then(() => showGlobalToast('Phone copied')).catch(() => showGlobalToast('Could not copy')) }} title="Copy phone" style={{ fontSize: '14px', padding: '1px 5px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: s.muted, cursor: 'pointer', fontFamily: s.font }}></button></>)}
 <span>· {ticket.timestamp}</span>
 </div>
 {!isExpanded && ticketLastNote[ticket.id] && (
 <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.accent, flexShrink: 0 }}> {ticketLastNote[ticket.id].author_name}:</span>
 <span style={{ fontSize: '14px', color: s.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticketLastNote[ticket.id].content}</span>
 </div>
 )}
 </div>
 </div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
 {!ticket.archived && ticket.status !== 'resolved' && (ticket.note ?? '').startsWith('attendance:') && (
 <>
 <button disabled={attendanceBusy === ticket.id} onClick={e => { e.stopPropagation(); void decideAttendance(ticket, 'present') }} title="Guest was on the boat — mark completed, send thank-you mail" style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(183,196,176,.4)', background: 'rgba(183,196,176,.12)', color: '#b7c4b0', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}> Was there</button>
 <button disabled={attendanceBusy === ticket.id} onClick={e => { e.stopPropagation(); void decideAttendance(ticket, 'trip_cancelled') }} title="We cancelled the trip (weather, no boat) — day is cancelled, booking stays, no no-show" style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(201,180,138,.4)', background: 'rgba(201,180,138,.1)', color: '#c9b48a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}> Trip cancelled</button>
 <button disabled={attendanceBusy === ticket.id} onClick={e => { e.stopPropagation(); if (confirm('Mark as NO-SHOW? Seats are released, no refund.')) void decideAttendance(ticket, 'no_show') }} title="Guest did not show up — status no_show, seats released, no refund" style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(201,146,140,.4)', background: 'rgba(201,146,140,.1)', color: '#c9928c', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}> No-show</button>
 </>
 )}
 {attendanceMsg[ticket.id] && <span style={{ fontSize: '14px', color: attendanceMsg[ticket.id].startsWith('') ? '#c9928c' : '#b7c4b0', whiteSpace: 'nowrap' }}>{attendanceMsg[ticket.id]}</span>}
 {!ticket.archived && (ticket.status === 'open' || (ticket.status === 'in_progress' && !ticket.claimedBy)) && (
 <button onClick={e => { e.stopPropagation(); onClaim(ticket.id, staffName || session?.user?.email || 'Staff') }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(212,160,122,.3)', background: 'transparent', color: '#d4a07a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>Claim</button>
 )}
 {!ticket.archived && ticket.status === 'in_progress' && ticket.claimedBy === staffName && (
 <button onClick={e => { e.stopPropagation(); onUnclaim(ticket.id) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(201,146,140,.2)', background: 'transparent', color: 'rgba(201,146,140,.8)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>Unclaim</button>
 )}
 {!ticket.archived && ticket.status === 'in_progress' && ticket.claimedBy && ticket.claimedBy !== staffName && (
 <button onClick={e => { e.stopPropagation(); onTakeover(ticket.id, staffName || session?.user?.email || 'Staff') }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(212,160,122,.25)', background: 'transparent', color: '#d4a07a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>Take Over</button>
 )}
 {!ticket.archived && (ticket.status === 'open' || ticket.status === 'in_progress') && (
 <button onClick={e => { e.stopPropagation(); onResolve(ticket.id) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(183,196,176,.3)', background: 'transparent', color: '#b7c4b0', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>Mark as Resolved</button>
 )}
 {!ticket.archived && ticket.status === 'resolved' && (
 <button onClick={e => { e.stopPropagation(); onUnresolve(ticket.id) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>Mark as Unresolved</button>
 )}
 {!ticket.archived && (
 <button onClick={e => { e.stopPropagation(); onArchive(ticket.id); setExpandedTicketId(null) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Archive</button>
 )}
 {ticket.archived && (
 <button onClick={e => { e.stopPropagation(); onUnarchive(ticket.id) }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Unarchive</button>
 )}
 <span style={{ fontSize: '14px', color: s.muted, transition: 'transform .2s', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}></span>
 </div>
 </button>
 {/* Expanded body */}
 {isExpanded && (
 <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', background: 'rgba(0,0,0,.2)', display: 'flex', alignItems: 'flex-start' }}>
 {/* Left: main content */}
 <div style={{ flex: 1, minWidth: 0, padding: '18px', maxHeight: '70vh', overflowY: 'auto' }}>
 {/* Request-Tickets: ein Klick direkt in den Planner, Buchung aufgeklappt (Lucas 28.10.: sonst ist das Ticket überflüssig) */}
 {(() => {
 const m = /^request(?:-reply)?:([0-9a-f-]{36})/.exec(ticket.note ?? '')
 if (!m) return null
 const bid = m[1]
 return (
 <button type="button" onClick={() => { try { localStorage.setItem('azd_foTab', 'requests'); localStorage.setItem('azd_foOpenBooking', bid) } catch {} ; nav('frontoffice') }}
 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '14px', padding: '10px 16px', borderRadius: 0, border: '1px solid rgba(243,239,230,.4)', background: 'rgba(243,239,230,.1)', color: s.accent, fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>
 Open in Booking Requests {bid.slice(0, 8)}
 </button>
 )
 })()}
 {(ticket.note ?? '').startsWith('booking:') && ticket.status !== 'resolved' && (() => {
 const d = slotData[ticket.id]
 const open = (d?.sessions ?? []).filter(x => x.session === 'tbd')
 const bid = (ticket.note ?? '').slice(8)
 return (
 <div style={{ marginBottom: '16px', padding: '14px', borderRadius: 0, border: '1px solid rgba(201,180,138,.3)', background: 'rgba(201,180,138,.06)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c9b48a', marginBottom: '6px' }}> Set time slots here</div>
 {d?.booking && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center', fontSize: '14px', marginBottom: '10px' }}>
 <span style={{ fontWeight: 500, color: s.text }}>{d.booking.product_name ?? 'Course'}</span>
 <span style={{ color: s.sub }}>{d.booking.customer_name ?? 'Guest'}{d.booking.customer_email ? ` · ${d.booking.customer_email}` : ''}</span>
 <span style={{ color: s.muted }}>{d.booking.group_size ?? 1} guest{(d.booking.group_size ?? 1) === 1 ? '' : 's'}</span>
 <button type="button" onClick={() => setTicketBookingPopup(bid)} title="Open the full booking (payments, sessions, log)" style={{ padding: '2px 9px', borderRadius: 0, border: '1px solid rgba(243,239,230,.35)', background: 'rgba(243,239,230,.08)', color: s.accent, fontSize: '14px', fontWeight: 500, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', cursor: 'pointer' }}>{bid.slice(0, 8).toUpperCase()} </button>
 </div>
 )}
 {d?.loading && <div style={{ fontSize: '14px', color: s.muted }}>Loading sessions…</div>}
 {d?.error && <div style={{ fontSize: '14px', color: '#c9928c' }}> {d.error}</div>}
 {d && !d.loading && !d.error && open.length === 0 && <div style={{ fontSize: '14px', color: '#b7c4b0' }}> No open days — every session has a time slot.</div>}
 {(d?.sessions ?? []).map(x => {
 const curPick = d.picks[x.id] ?? (x.session === 'tbd' ? undefined : (x.session as 'am' | 'pm'))
 const dateVal = d.dates[x.id] ?? x.session_date
 const timeVal = d.times[x.id] ?? (x.start_time ? x.start_time.slice(0, 5) : '')
 const boatVal = d.boat[x.id] ?? Boolean(x.is_boat_day)
 const dirty = Boolean(d.picks[x.id] && d.picks[x.id] !== x.session) || (d.times[x.id] !== undefined && d.times[x.id] !== (x.start_time ? x.start_time.slice(0, 5) : '')) || (Boolean(d.dates[x.id]) && d.dates[x.id] !== x.session_date) || (d.boat[x.id] !== undefined && d.boat[x.id] !== Boolean(x.is_boat_day))
 return (
 <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', flexWrap: 'wrap', opacity: 1 }}>
 <input type="date" value={dateVal} min={new Date().toISOString().slice(0, 10)} title="Move this day" onChange={e => { const v = e.target.value; setSlotData(p => ({ ...p, [ticket.id]: { ...p[ticket.id], dates: { ...p[ticket.id].dates, [x.id]: v } } })) }}
 style={{ background: '#000', border: `1px solid ${dateVal !== x.session_date ? 'rgba(201,180,138,.6)' : 'rgba(255,255,255,.12)'}`, borderRadius: 0, padding: '4px 8px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none', colorScheme: 'dark' }} />
 <span style={{ fontSize: '14px', color: x.session === 'tbd' ? '#c9b48a' : s.muted, minWidth: '70px' }}>{x.session === 'tbd' ? 'open' : `set: ${x.session.toUpperCase()}`}{x.notes ? ` · ${x.notes}` : ''}</span>
 {x.session !== 'night' && ([[true, ' Boat'], [false, ' Pool']] as const).map(([bv, bl]) => (
 <button key={bl} type="button" title="Boat seat or pool/harbour day" onClick={() => setSlotData(p => ({ ...p, [ticket.id]: { ...p[ticket.id], boat: { ...p[ticket.id].boat, [x.id]: bv } } }))}
 style={{ padding: '5px 10px', borderRadius: 0, border: `1px solid ${boatVal === bv ? 'rgba(201,180,138,.55)' : 'rgba(255,255,255,.12)'}`, background: boatVal === bv ? 'rgba(201,180,138,.14)' : 'transparent', color: boatVal === bv ? '#c9b48a' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {bl}
 </button>
 ))}
 {([['am', 'AM'], ['pm', 'PM'], ['full', 'Full day']] as const).map(([tt, label]) => {
 const on = curPick === tt
 return (
 <button key={tt} type="button" title={tt === 'full' ? 'Course takes the whole day — AM and PM session' : undefined} onClick={() => setSlotData(p => ({ ...p, [ticket.id]: { ...p[ticket.id], picks: { ...p[ticket.id].picks, [x.id]: tt } } }))}
 style={{ padding: '5px 14px', borderRadius: 0, border: `1px solid ${on ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.12)'}`, background: on ? 'rgba(243,239,230,.16)' : 'transparent', color: on ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {label}
 </button>
 )
 })}
 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: s.muted }}>Start
 <input type="time" value={timeVal} onChange={e => { const v = e.target.value; setSlotData(p => ({ ...p, [ticket.id]: { ...p[ticket.id], times: { ...p[ticket.id].times, [x.id]: v } } })) }} title="Optional: exact start time — goes into the guest email instead of the default 08:00 / 13:00"
 style={{ background: '#000', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, padding: '4px 8px', fontSize: '14px', color: s.text, fontFamily: s.font, outline: 'none' }} />
 </label>
 {dirty && <span style={{ fontSize: '14px', color: '#c9b48a' }}> changed</span>}
 </div>
 )
 })}
 {(d?.sessions ?? []).length > 0 && (
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
 <button type="button" disabled={d?.saving} onClick={() => void saveSlots(ticket)}
 style={{ padding: '7px 16px', borderRadius: 0, border: '1px solid rgba(183,196,176,.4)', background: 'rgba(183,196,176,.12)', color: '#b7c4b0', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {d?.saving ? 'Saving…' : 'Save changes & email guest'}
 </button>
 <span style={{ fontSize: '14px', color: s.muted }}>Every save emails the guest the full schedule (open days as “to be confirmed”). Dates can be moved here. The ticket resolves once every day has a slot.</span>
 </div>
 )}
 {d?.msg && <div style={{ fontSize: '14px', marginTop: '8px', color: d.msg.startsWith('') ? '#c9928c' : d.msg.startsWith('') ? '#c9b48a' : '#b7c4b0' }}>{d.msg}</div>}
 {d?.capacityWarning && !d.saving && (
 <button type="button" onClick={() => void saveSlots(ticket, true)}
 style={{ marginTop: '6px', padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(201,180,138,.5)', background: 'rgba(201,180,138,.12)', color: '#c9b48a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 Save anyway (overbook — staff decision)
 </button>
 )}
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '8px' }}>Boat = takes a boat seat (capacity check). Pool = pool/harbour day, no seat.</div>
 </div>
 )
 })()}
 {/* Customer message */}
 <div style={{ marginBottom: '14px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>Customer Message</div>
 <div style={{ fontSize: '14px', color: s.text, lineHeight: 1.6, padding: '11px 14px', background: 'rgba(212,160,122,.06)', border: '1px solid rgba(212,160,122,.15)', borderRadius: 0 }}>
 "{ticket.message}"
 </div>
 </div>
 {/* Email thread */}
 <TicketMessages ticketId={ticket.id} refreshTrigger={ticketEmailSending[ticket.id]} onLastMessageRead={clearTicketBadge ? () => clearTicketBadge(ticket.id) : undefined} />
 {/* Chatbot context — only for bot-originated tickets */}
 {ticket.preferredChannel !== 'form_submission' && (
 <div style={{ marginBottom: '18px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>Chatbot Context</div>
 <div style={{ fontSize: '14px', color: s.muted, fontStyle: 'italic', padding: '9px 13px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 0, lineHeight: 1.5 }}>{ticket.conversation}</div>
 </div>
 )}
 {/* Live chat conversation */}
 {ticket.sessionId && liveChats[ticket.sessionId] && liveChats[ticket.sessionId].filter((m: any) => m.role === 'user' || m.role === 'bot' || m.role === 'team').length > 0 && (
 <div style={{ marginBottom: '18px' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, textTransform: 'uppercase', letterSpacing: '.08em' }}> Live Chat</div>
 <button
 onClick={() => {
 const sid = ticket.sessionId
 if (!sid) return
 supabase.from('chat_conversations').select('messages').eq('session_id', sid).maybeSingle()
 .then(({ data }) => { if (data?.messages) setLiveChats(prev => ({ ...prev, [sid]: data.messages })) })
 }}
 title="Refresh chat"
 style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.muted, fontSize: '15px', padding: '2px 6px', borderRadius: 0, lineHeight: 1, opacity: 0.7 }}
 ></button>
 </div>
 <div ref={chatContainerRef} style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '7px', padding: '12px', background: 'rgba(0,0,0,.25)', borderRadius: 0, border: '1px solid rgba(255,255,255,.07)' }}>
 {liveChats[ticket.sessionId]
 .filter((m: any) => m.role === 'user' || m.role === 'bot' || m.role === 'team')
 .map((m: any, i: number) => (
 <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
 <div style={{ maxWidth: '80%', padding: '7px 12px', borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px', background: m.role === 'user' ? 'rgba(243,239,230,.12)' : m.role === 'team' ? 'rgba(183,196,176,.12)' : 'rgba(255,255,255,.06)', border: `1px solid ${m.role === 'user' ? 'rgba(243,239,230,.22)' : m.role === 'team' ? 'rgba(183,196,176,.25)' : 'rgba(255,255,255,.08)'}`, fontSize: '14px', color: s.text, lineHeight: 1.5 }}>
 {m.role === 'team' && <span style={{ display: 'block', fontSize: '14px', color: '#b7c4b0', fontWeight: 500, marginBottom: '3px' }}>{m.sender || 'AZD Team'}</span>}
 {m.role === 'bot' && <span style={{ display: 'block', fontSize: '14px', color: s.muted, fontWeight: 500, marginBottom: '3px' }}>Bot</span>}
 {m.text}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 {/* Reply box */}
 {!ticket.archived && (
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Reply to {ticket.name}</div>
 <textarea
 value={reply}
 onChange={e => setTicketReply(prev => ({ ...prev, [ticket.id]: e.target.value }))}
 onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && ticket.sessionId) { e.preventDefault(); sendChatReply() } }}
 placeholder={`Hi ${ticket.name.split(' ')[0]}, thanks for reaching out! ... (Enter to send · Shift+Enter for newline)`}
 style={{ width: '100%', minHeight: '100px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '12px 14px', fontFamily: s.font, resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.55 }}
 />
 {/* Attachment picker */}
 <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
 <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: 0, border: '1px dashed rgba(255,255,255,.18)', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 Attach file
 <input type="file" multiple style={{ display: 'none' }} onChange={e => {
 const newFiles = Array.from(e.target.files ?? [])
 if (!newFiles.length) return
 setTicketAttachments(prev => ({ ...prev, [ticket.id]: [...(prev[ticket.id] ?? []), ...newFiles] }))
 e.target.value = ''
 }} />
 </label>
 {(ticketAttachments[ticket.id] ?? []).map((f, i) => (
 <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: 0, background: 'rgba(243,239,230,.1)', border: '1px solid rgba(243,239,230,.2)', fontSize: '14px', color: s.accent, maxWidth: '160px' }}>
 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
 <button onClick={() => setTicketAttachments(prev => ({ ...prev, [ticket.id]: (prev[ticket.id] ?? []).filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: s.muted, cursor: 'pointer', padding: '0 1px', fontSize: '14px', lineHeight: 1, fontFamily: s.font }}>×</button>
 </span>
 ))}
 </div>
 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
 {ticket.sessionId && (
 <button
 onClick={sendChatReply}
 style={{ padding: '8px 20px', borderRadius: 0, border: 'none', background: reply.trim() ? '#f3efe6' : 'rgba(255,255,255,.1)', color: reply.trim() ? '#090909' : s.muted, fontSize: '14px', fontWeight: 500, cursor: reply.trim() ? 'pointer' : 'default', fontFamily: s.font, transition: 'background .2s' }}>
 {ticketReplySending[ticket.id] === 'sending' ? ' Sending…' : ticketReplySending[ticket.id] === 'sent' ? ' Sent in Chat' : ticketReplySending[ticket.id] === 'error' ? ' Error — retry' : ' Send in Chat'}
 </button>
 )}
 <button
 onClick={sendEmailReply}
 disabled={ticketEmailSending[ticket.id] === 'sending' || !reply.trim()}
 style={{ padding: '8px 20px', borderRadius: 0, border: 'none', background: reply.trim() ? 'rgba(243,239,230,.15)' : 'rgba(255,255,255,.06)', color: reply.trim() ? s.accent : 'rgba(255,255,255,.2)', fontSize: '14px', fontWeight: 500, cursor: reply.trim() && ticketEmailSending[ticket.id] !== 'sending' ? 'pointer' : 'default', fontFamily: s.font, transition: 'background .2s' }}>
 {ticketEmailSending[ticket.id] === 'sending' ? ' Sending…' : ticketEmailSending[ticket.id] === 'sent' ? ' Email Sent' : ticketEmailSending[ticket.id] === 'error' ? ' Error — retry' : ' Send Email'}
 </button>
 </div>
 </div>
 )}
 </div>
 {/* Right: history / notes toggle column */}
 {(() => {
 const sideTab = ticketSidebarTab[ticket.id] ?? 'notes'
 const noteCount = (ticketNotesList[ticket.id] ?? []).length
 return (
 <div style={{ width: '220px', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,.07)', padding: '14px 16px 18px', alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
 {/* Toggle pills */}
 <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', background: 'rgba(255,255,255,.04)', borderRadius: 0, padding: '3px' }}>
 {(['notes', 'history'] as const).map(tab => (
 <button key={tab} onClick={() => setTicketSidebarTab(prev => ({ ...prev, [ticket.id]: tab }))}
 style={{ flex: 1, padding: '5px 0', borderRadius: 0, border: 'none', background: sideTab === tab ? 'rgba(243,239,230,.14)' : 'transparent', color: sideTab === tab ? s.accent : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, letterSpacing: '.04em' }}>
 {tab === 'history' ? 'History' : `Notes${noteCount > 0 ? ` (${noteCount})` : ''}`}
 </button>
 ))}
 </div>

 {/* History panel */}
 {sideTab === 'history' && (
 <div style={{ flex: 1 }}>
 <button onClick={() => navigator.clipboard.writeText(ticket.id).then(() => showGlobalToast('Ticket ID copied')).catch(() => showGlobalToast('Could not copy'))} title="Copy full ticket ID" style={{ fontSize: '14px', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', padding: '1px 6px', borderRadius: 0, border: '1px solid rgba(243,239,230,.15)', background: 'rgba(243,239,230,.04)', color: 'rgba(243,239,230,.5)', cursor: 'pointer', marginBottom: '12px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{ticket.id}</button>
 <TicketHistory ticketId={ticket.id} />
 </div>
 )}

 {/* Notes panel */}
 {sideTab === 'notes' && (
 <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
 {(ticketNotesList[ticket.id] ?? []).length > 0 ? (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px', overflowY: 'auto', maxHeight: '240px' }}>
 {(ticketNotesList[ticket.id] ?? []).map(n => (
 <div key={n.id} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '8px 10px', flexShrink: 0 }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '6px' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.author_name}</span>
 <span style={{ fontSize: '14px', color: s.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
 </div>
 <div style={{ fontSize: '14px', color: 'rgba(255,255,255,.75)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.content}</div>
 </div>
 ))}
 </div>
 ) : (
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '10px', fontStyle: 'italic' }}>No notes yet.</div>
 )}
 {/* Quick note chips */}
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
 {['Waiting for reply', 'Contacted via WhatsApp', 'Email sent', 'Follow-up needed', 'Waiting for booking confirmation', 'Escalated'].map(q => (
 <button key={q} onClick={() => setTicketNoteEdits(prev => ({ ...prev, [ticket.id]: q }))}
 style={{ fontSize: '14px', padding: '3px 8px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>
 {q}
 </button>
 ))}
 </div>
 <textarea
 value={ticketNoteEdits[ticket.id] ?? ''}
 placeholder="Add a note…"
 rows={3}
 onChange={e => setTicketNoteEdits(prev => ({ ...prev, [ticket.id]: e.target.value }))}
 style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, color: s.text, fontSize: '14px', fontFamily: s.font, padding: '9px 10px', resize: 'vertical', outline: 'none', lineHeight: 1.5, minHeight: '68px', boxSizing: 'border-box' }}
 />
 <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
 <button
 disabled={ticketNoteAdding[ticket.id] || !(ticketNoteEdits[ticket.id] ?? '').trim()}
 onClick={() => addTicketNote(ticket.id, ticketNoteEdits[ticket.id] ?? '')}
 style={{ fontSize: '14px', padding: '5px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'rgba(243,239,230,.08)', color: s.accent, cursor: (ticketNoteAdding[ticket.id] || !(ticketNoteEdits[ticket.id] ?? '').trim()) ? 'not-allowed' : 'pointer', fontFamily: s.font, opacity: !(ticketNoteEdits[ticket.id] ?? '').trim() ? 0.4 : 1 }}
 >
 {ticketNoteAdding[ticket.id] ? 'Adding…' : '+ Add Note'}
 </button>
 </div>
 </div>
 )}
 </div>
 )
 })()}
 </div>
 )}
 </div>
 )
 })
 })()}
 </div>
 )}

 {/* Changelog */}
 {aiTab === 'changelog' && (
 <div style={{ padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '16px' }}> Audit Changelog</div>
 <AuditChangelog
 isAdmin={userRole === 'admin' || userRole === 'front_office'}
 userId={session?.user?.id ?? ''}
 />
 </div>
 )}

 {aiTab === 'triage' && userRole === 'admin' && (
 <TriageLogTab supabase={supabase} session={session} />
 )}
 </div>
 </div>

 {/* Buchungs-Popup aus dem Instructor-Ticket: volles FO-Detail (Payments, Sessions, Log) */}
 {ticketBookingPopup && (
 <div onClick={() => setTicketBookingPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, boxShadow: 'none' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Booking <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: s.text, fontWeight: 500 }}>{ticketBookingPopup.slice(0, 8).toUpperCase()}</span> · changes here are live</span>
 <button type="button" onClick={() => setTicketBookingPopup(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 0, padding: '6px 12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Close </button>
 </div>
 <div style={{ padding: '14px' }}>
 <FrontOfficeBookings focusBookingId={ticketBookingPopup} embedded />
 </div>
 </div>
 </div>
 )}
 </div>
 )
}

/* ══════════════════════════════
 FINANCES
══════════════════════════════ */
function PageFinances({ nav }: { nav: (p: MemberPage) => void }) {
 const who = useStaffNames()
 const isMobile = useIsMobile()
 const [finTab, setFinTab] = useState<'overview' | 'upcoming' | 'reports' | 'pricing' | 'refunds' | 'history'>(() => {
 if (typeof window === 'undefined') return 'overview'
 const v = localStorage.getItem('azd_finTab')
 return v === 'overview' || v === 'upcoming' || v === 'reports' || v === 'pricing' || v === 'refunds' || v === 'history' ? v : 'overview'
 })
 const [prices, setPrices] = useState<{id:string;name:string;category:string;price_cents:number;is_placeholder:boolean;notes:string|null}[]>([])
 const [pricesLoading, setPricesLoading] = useState(false)
 const [editingId, setEditingId] = useState<string|null>(null)
 const [editVal, setEditVal] = useState('')
 const [savingId, setSavingId] = useState<string|null>(null)
 const [pricesSaved, setPricesSaved] = useState<string|null>(null)
 const [stripeSyncStatus, setStripeSyncStatus] = useState<Record<string,'syncing'|'synced'|'error'>>({})
 const [toastMsg, setToastMsg] = useState<string|null>(null)
 const [priceLog, setPriceLog] = useState<{id:string;product_id:string;product_name:string;old_price_cents:number;new_price_cents:number;changed_by_email:string;changed_at:string}[]>([])

 // ── Pending Manual Refunds ─────────────────────────────────────────────────
 type PendingRefund = { id: string; booking_id: string; amount: number; method: string; description: string; payout_masked: string | null; requested_at: string; requested_by_email: string | null; is_test: boolean; booking: { customer_name: string | null; customer_email: string | null; phone: string | null; amount: number | null; refunded_amount_cents: number | null; status: string; payment_state: PaymentState | null; booking_date: string; product_name: string | null } }
 const [pendingRefunds, setPendingRefunds] = useState<PendingRefund[]>([])
 const [refundPopupBookingId, setRefundPopupBookingId] = useState<string | null>(null)
 const [refundsLoading, setRefundsLoading] = useState(false)
 // Refund-Historie: erledigte Anträge (authorisiert/ausgezahlt), neueste zuerst
 type RefundHistoryRow = { id: string; booking_id: string; amount: number; currency: string | null; method: string; status: string; description: string | null; requested_at: string; requested_by_email: string | null; authorized_by_email: string | null; paid_at: string | null; stripe_refund_id: string | null; notes: string | null; is_test: boolean; customer_name: string | null; product_name: string | null }
 const [refundHistory, setRefundHistory] = useState<RefundHistoryRow[]>([])
 const [refundHistoryLoading, setRefundHistoryLoading] = useState(false)
 const [refundHistoryError, setRefundHistoryError] = useState<string | null>(null)
 const [refundHistoryTick, setRefundHistoryTick] = useState(0)
 const REFUND_PAGE_SIZE = 25
 const [refundPage, setRefundPage] = useState(0)
 const [refundSearch, setRefundSearch] = useState('')
 const [refundSearchQ, setRefundSearchQ] = useState('') // entprellt
 const [refundMonth, setRefundMonth] = useState('') // YYYY-MM oder leer
 const [refundMethod, setRefundMethod] = useState('all')
 const [histTab, setHistTab] = useState<'all' | 'payments' | 'refunds' | 'cash'>('all')
 // Action needed: ein Bereich pro Untertab statt alles untereinander (Lucas 06.11.2026). Alle Bereiche bleiben geladen
 // (nur ausgeblendet), damit die Zaehler am Tab und an den Untertabs stimmen.
 const [actTab, setActTab] = useState<'requests' | 'status' | 'confirm' | 'refunds'>(() => {
 if (typeof window === 'undefined') return 'requests'
 const v = localStorage.getItem('azd_finActTab')
 return v === 'requests' || v === 'status' || v === 'confirm' || v === 'refunds' ? v : 'requests'
 })
 const [refundHistoryCount, setRefundHistoryCount] = useState(0)
 const [refundHistorySum, setRefundHistorySum] = useState(0)
 useEffect(() => { const h = setTimeout(() => setRefundSearchQ(refundSearch.trim()), 350); return () => clearTimeout(h) }, [refundSearch])
 useEffect(() => { setRefundPage(0) }, [refundSearchQ, refundMonth, refundMethod])
 // Test-/Echtdaten wie im Dashboard: Simulationsmodus aus app_settings (null = noch nicht geladen)
 const [simulationMode, setSimulationMode] = useState<boolean | null>(null)
 useEffect(() => {
 supabase.from('app_settings').select('value').eq('key', 'simulation_mode').maybeSingle()
 .then(({ data }) => setSimulationMode(Boolean((data?.value as { enabled?: boolean } | null)?.enabled)))
 const h = (e: Event) => setSimulationMode(Boolean((e as CustomEvent).detail))
 window.addEventListener(SIMULATION_EVENT, h)
 return () => window.removeEventListener(SIMULATION_EVENT, h)
 }, [])
 // KeyInvoice: fehlgeschlagene Belege (Rechnung / Gutschrift / Annullierung) sichtbar machen
 type KiIssue = { id: string; kind: string | null; booking_id: string | null; amount_cents: number | null; error: string | null; updated_at: string }
 const [kiIssues, setKiIssues] = useState<KiIssue[]>([])
 const [kiMsg, setKiMsg] = useState<string | null>(null)
 const [kiBusyId, setKiBusyId] = useState<string | null>(null)
 const kiToken = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''
 const loadKiIssues = async () => {
 try {
 const res = await fetch('/api/admin/keyinvoice-issues', { headers: { authorization: `Bearer ${await kiToken()}` } })
 const j = await res.json().catch(() => ({}))
 if (res.status === 403) return // kein Admin Karte bleibt unsichtbar
 if (!res.ok) { setKiMsg(`Invoice issues ${res.status}: ${(j as { error?: string }).error ?? res.statusText}`); return }
 setKiIssues((j as { rows?: KiIssue[] }).rows ?? []); setKiMsg(null)
 } catch (e) { setKiMsg(`Invoice issues: ${e instanceof Error ? e.message : String(e)}`) }
 }
 useEffect(() => { void loadKiIssues() }, [])
 const retryKi = async (id: string) => {
 setKiBusyId(id); setKiMsg(null)
 try {
 const res = await fetch('/api/admin/keyinvoice-issues', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await kiToken()}` }, body: JSON.stringify({ id }) })
 const j = await res.json().catch(() => ({}))
 if (!res.ok) setKiMsg(`Retry ${res.status}: ${(j as { error?: string }).error ?? res.statusText}`)
 else showToast(` KeyInvoice document ${(j as { doc?: string | null }).doc ?? ''} issued — PDF emailed to the guest`)
 } catch (e) { setKiMsg(`Retry: ${e instanceof Error ? e.message : String(e)}`) }
 setKiBusyId(null); await loadKiIssues()
 }
 const [markingRefundId, setMarkingRefundId] = useState<string|null>(null)
 const [refundNoteInput, setRefundNoteInput] = useState<Record<string,string>>({})
 const [expandedLogId, setExpandedLogId] = useState<string|null>(null)
 useEffect(() => {
 if (finTab !== 'pricing') return
 supabase.from('price_change_log').select('*').order('changed_at', { ascending: false }).limit(200)
 .then(({ data }) => { if (data) setPriceLog(data) })
 }, [finTab])

 // Zähler auf dem Tab "Action needed" (Lucas 30.10.): offene Refund-Anträge, unabhängig vom aktiven Tab;
 // aktualisiert sich nach jeder Freigabe (pendingRefunds ändert sich)
 const [actionCount, setActionCount] = useState<number | null>(null)
 const [pendingPayCount, setPendingPayCount] = useState(0)
 const [payMissingCount, setPayMissingCount] = useState(0)
 const [payReqFailCount, setPayReqFailCount] = useState(0)
 const totalAction = (actionCount ?? 0) + pendingPayCount + payMissingCount + payReqFailCount
 useEffect(() => {
 if (simulationMode === null) return
 supabase.from('booking_refunds').select('id', { count: 'exact', head: true }).eq('status', 'requested').eq('is_test', simulationMode)
 .then(({ count, error }) => { if (error) console.warn('[finances] action count failed:', error.message); else setActionCount(count ?? 0) })
 }, [simulationMode, pendingRefunds])

 useEffect(() => {
 if ((finTab !== 'refunds' && finTab !== 'history') || simulationMode === null) return
 setRefundsLoading(true)
 ;(async () => {
 // Jede Zeile ein Refund-Antrag (booking_refunds). Buchung + Telefon (customers via E-Mail) dazu.
 const { data: rows } = await supabase.from('booking_refunds')
 .select('id, booking_id, amount, method, description, payout_masked, requested_at, requested_by_email, is_test')
 .eq('status', 'requested').eq('is_test', simulationMode).order('requested_at', { ascending: true })
 const ids = [...new Set((rows ?? []).map(r => r.booking_id))]
 const { data: bks } = ids.length ? await supabase.from('bookings').select('id,customer_name,customer_email,amount,refunded_amount_cents,status,payment_state,booking_date,product_name').in('id', ids) : { data: [] }
 const emails = [...new Set((bks ?? []).map(b => b.customer_email).filter((e): e is string => Boolean(e)))]
 const { data: custs } = emails.length ? await supabase.from('customers').select('email, phone, phone_prefix, phone_number').in('email', emails) : { data: [] }
 const phoneBy = new Map<string, string>()
 for (const c of custs ?? []) { const ph = c.phone || [c.phone_prefix, c.phone_number].filter(Boolean).join(' '); if (c.email && ph) phoneBy.set(c.email, ph) }
 const bkBy = new Map((bks ?? []).map(b => [b.id, b]))
 setPendingRefunds((rows ?? []).map(r => {
 const b = bkBy.get(r.booking_id)
 return { ...r, booking: { customer_name: b?.customer_name ?? null, customer_email: b?.customer_email ?? null, phone: b?.customer_email ? (phoneBy.get(b.customer_email) ?? null) : null, amount: b?.amount ?? null, refunded_amount_cents: b?.refunded_amount_cents ?? null, status: b?.status ?? '—', payment_state: (b?.payment_state as PaymentState | null) ?? null, booking_date: b?.booking_date ?? '', product_name: b?.product_name ?? null } }
 }))
 setRefundsLoading(false)
 })()
 }, [finTab, simulationMode])

 useEffect(() => {
 if ((finTab !== 'refunds' && finTab !== 'history') || simulationMode === null) return
 let cancelled = false
 setRefundHistoryLoading(true)
 setRefundHistoryError(null)
 ;(async () => {
 // Suche: Name/E-Mail/Produkt der Buchung, 8-stellige Buchungsnummer oder Beschreibung des Refunds
 let searchOr: string | null = null
 if (refundSearchQ) {
 const q = refundSearchQ.replace(/[,()%*]/g, ' ').trim()
 const parts: string[] = [`description.ilike.%${q}%`]
 const { data: hit, error: hErr } = await supabase.from('bookings').select('id')
 .or(`customer_name.ilike.%${q}%,customer_email.ilike.%${q}%,product_name.ilike.%${q}%`).limit(150)
 if (hErr) { if (!cancelled) { setRefundHistoryError(`Search: ${hErr.message}`); setRefundHistoryLoading(false) } return }
 const ids = (hit ?? []).map(x => x.id)
 if (/^[0-9a-f]{8}$/i.test(q)) {
 const lo = `${q.toLowerCase()}-0000-0000-0000-000000000000`, hi = `${q.toLowerCase()}-ffff-ffff-ffff-ffffffffffff`
 const { data: byNo } = await supabase.from('bookings').select('id').gte('id', lo).lte('id', hi).limit(20)
 ids.push(...(byNo ?? []).map(x => x.id))
 }
 if (ids.length) parts.push(`booking_id.in.(${[...new Set(ids)].join(',')})`)
 searchOr = parts.join(',')
 }
 const apply = <T extends { neq: Function; eq: Function; or: Function; gte: Function; lt: Function }>(q: T): T => {
 let x: any = q.neq('status', 'requested').eq('is_test', simulationMode) // eslint-disable-line @typescript-eslint/no-explicit-any
 if (refundMethod !== 'all') x = x.eq('method', refundMethod)
 if (searchOr) x = x.or(searchOr)
 if (refundMonth) {
 const [y, m] = refundMonth.split('-').map(Number)
 const start = new Date(Date.UTC(y, m - 1, 1)).toISOString(), end = new Date(Date.UTC(y, m, 1)).toISOString()
 x = x.gte('paid_at', start).lt('paid_at', end)
 }
 return x as T
 }
 const from = refundPage * REFUND_PAGE_SIZE
 const pageQ = apply(supabase.from('booking_refunds')
 .select('id, booking_id, amount, currency, method, status, description, requested_at, requested_by_email, authorized_by_email, paid_at, stripe_refund_id, notes, is_test', { count: 'exact' }))
 .order('paid_at', { ascending: false, nullsFirst: false }).range(from, from + REFUND_PAGE_SIZE - 1)
 const sumQ = apply(supabase.from('booking_refunds').select('amount')).limit(10000)
 const [{ data: rows, error, count }, { data: sums, error: sErr }] = await Promise.all([pageQ, sumQ])
 if (cancelled) return
 if (error) { setRefundHistoryError(`${error.code ?? ''} ${error.message}`.trim()); setRefundHistoryLoading(false); return }
 if (sErr) setRefundHistoryError(`Total: ${sErr.message}`)
 const ids = [...new Set((rows ?? []).map(r => r.booking_id))]
 const { data: bks, error: bErr } = ids.length ? await supabase.from('bookings').select('id,customer_name,product_name').in('id', ids) : { data: [], error: null }
 if (bErr) setRefundHistoryError(`Bookings: ${bErr.message}`)
 const bkBy = new Map((bks ?? []).map(b => [b.id, b]))
 setRefundHistory((rows ?? []).map(r => ({ ...r, customer_name: bkBy.get(r.booking_id)?.customer_name ?? null, product_name: bkBy.get(r.booking_id)?.product_name ?? null })))
 setRefundHistoryCount(count ?? (rows ?? []).length)
 setRefundHistorySum((sums ?? []).reduce((a: number, r: { amount: number }) => a + (r.amount ?? 0), 0))
 setRefundHistoryLoading(false)
 })()
 return () => { cancelled = true }
 }, [finTab, simulationMode, refundHistoryTick, refundPage, refundSearchQ, refundMonth, refundMethod])

 // Override der Auszahlungsart (nur hier, nur Admin): Karten-Refund auf anderem Weg auszahlen — mit Pflicht-Begruendung
 const [refundOverride, setRefundOverride] = useState<Record<string, { on: boolean; method: string; reason: string }>>({})

 const [payoutShown, setPayoutShown] = useState<Record<string, string>>({})
 const [payoutErr, setPayoutErr] = useState<Record<string, string>>({})
 const [payoutLoading, setPayoutLoading] = useState<string | null>(null)
 async function revealPayout(refundId: string) {
 setPayoutLoading(refundId)
 setPayoutErr(prev => { const n = { ...prev }; delete n[refundId]; return n })
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 const res = await fetch('/api/refund-payout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` }, body: JSON.stringify({ refund_id: refundId }) })
 const d = await res.json().catch(() => ({}))
 if (!res.ok || !d.ok) setPayoutErr(prev => ({ ...prev, [refundId]: `HTTP ${res.status}: ${d.error ?? 'Reveal failed'}` }))
 else setPayoutShown(prev => ({ ...prev, [refundId]: d.details as string }))
 } catch (e) {
 setPayoutErr(prev => ({ ...prev, [refundId]: e instanceof Error ? e.message : 'Network error' }))
 }
 setPayoutLoading(null)
 }
 async function markRefundPaid(refundId: string) {
 const ov = refundOverride[refundId]
 if (ov?.on && (ov.reason ?? '').trim().length < 10) { showToast(' Override needs a reason (at least 10 characters): why not refund the original way?'); return }
 setMarkingRefundId(refundId)
 const notes = refundNoteInput[refundId] || null
 // Server setzt refund_paid_at UND schickt dem Gast die Refund-Mail mit dem erstatteten Betrag.
 // Ergebnis/Fehler sichtbar als Toast — nie stumm.
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 const res = await fetch('/api/refund-paid', {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` },
 body: JSON.stringify({ refund_id: refundId, notes, ...(ov?.on ? { override_method: ov.method, override_reason: ov.reason.trim() } : {}) }),
 })
 const d = await res.json().catch(() => ({}))
 if (!res.ok || !d.ok) { showToast(` Not marked (HTTP ${res.status}): ${d.error ?? 'unknown error'}`); setMarkingRefundId(null); return }
 setPendingRefunds(prev => prev.filter(b => b.id !== refundId))
 setRefundHistoryTick(n => n + 1)
 showToast(d.mail === 'refund'
 ? ` Refund marked as paid · email sent (€${((d.amount_cents ?? 0) / 100).toFixed(2)} via ${d.method ?? 'manual'})`
 : ` Refund marked as paid · no email: ${d.error ?? 'unknown'}`)
 } catch (e) {
 showToast(` ${e instanceof Error ? e.message : String(e)}`)
 }
 setMarkingRefundId(null)
 }

 const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

 function showToast(msg: string) {
 if (toastTimer.current) clearTimeout(toastTimer.current)
 setToastMsg(msg)
 toastTimer.current = setTimeout(() => setToastMsg(null), 3500)
 }

 useEffect(() => {
 if (finTab !== 'pricing' || prices.length > 0) return
 setPricesLoading(true)
 supabase.from('course_prices').select('*').order('category').order('name')
 // Namen mit Zahlen natuerlich sortieren (1 day, 3 days, 10 days statt 1, 10, 3) — Lucas 06.11.2026
 .then(({ data }) => { if (data) setPrices([...data].sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name), 'en', { numeric: true }))); setPricesLoading(false) })
 }, [finTab])

 async function savePrice(id: string) {
 const cents = Math.round(parseFloat(editVal.replace(',', '.')) * 100)
 if (isNaN(cents) || cents < 0) return
 setSavingId(id)
 const currentProduct = prices.find(p => p.id === id)
 const oldCents = currentProduct?.price_cents ?? 0
 await supabase.from('course_prices').update({ price_cents: cents, is_placeholder: false, updated_at: new Date().toISOString() }).eq('id', id)
 // Log the change
 const { data: { session: authSession } } = await supabase.auth.getSession()
 const adminEmail = authSession?.user?.email ?? 'unknown'
 const logEntry = { product_id: id, product_name: currentProduct?.name ?? id, old_price_cents: oldCents, new_price_cents: cents, changed_by_email: adminEmail, changed_at: new Date().toISOString() }
 await supabase.from('price_change_log').insert(logEntry)
 setPriceLog(prev => [{ id: crypto.randomUUID(), ...logEntry }, ...prev].slice(0, 50))
 setPrices(prev => prev.map(p => p.id === id ? { ...p, price_cents: cents, is_placeholder: false } : p))
 setSavingId(null)
 setEditingId(null)
 setPricesSaved(id)
 setTimeout(() => setPricesSaved(null), 2000)
 // Auto-sync to Stripe
 setStripeSyncStatus(prev => ({ ...prev, [id]: 'syncing' }))
 try {
 const { data: { session } } = await supabase.auth.getSession()
 const res = await fetch('/api/stripe-sync-price', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
 body: JSON.stringify({ product_id: id, new_price_cents: cents }),
 })
 const ok = res.ok
 setStripeSyncStatus(prev => ({ ...prev, [id]: ok ? 'synced' : 'error' }))
 if (ok) showToast('Price saved & synced to Stripe ')
 else showToast('Saved to DB — Stripe sync failed, check logs')
 } catch {
 setStripeSyncStatus(prev => ({ ...prev, [id]: 'error' }))
 showToast('Saved to DB — Stripe sync failed, check logs')
 }
 setTimeout(() => setStripeSyncStatus(prev => { const n = { ...prev }; delete n[id]; return n }), 4000)
 }

 const categoryLabels: Record<string, string> = { dives: 'Dive Packages', entry: 'Entry & Core', specialty: 'Advanced & Specialties', ecology: 'Ecology', pro: 'Safety & Pro', equipment: 'Equipment Rental', extras: 'Extras & Sites', insurance: 'Insurance' }
 const categoryColors: Record<string, string> = { dives: '#f3efe6', entry: '#b7c4b0', specialty: '#c9c2b6', ecology: '#b7c4b0', pro: '#c9c2b6', equipment: '#d4a07a', extras: '#c9b48a', insurance: '#c9928c' }
 const ALL_CATEGORIES = ['dives', 'entry', 'specialty', 'ecology', 'pro', 'equipment', 'extras', 'insurance']
 const grouped = prices.reduce((acc, p) => { if (!acc[p.category]) acc[p.category] = []; acc[p.category].push(p); return acc }, {} as Record<string, typeof prices>)

 return (
 <div style={{ background: '#000', minHeight: '100vh', padding: '24px 16px' }}>

 {/* Toast */}
 {toastMsg && (
 <div style={{
 position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
 background: '#121210', border: '1px solid rgba(243,239,230,.35)', borderRadius: 0,
 padding: '13px 22px', fontSize: '14px', fontWeight: 500, color: '#f3efe6',
 boxShadow: 'none', zIndex: 9999, whiteSpace: 'nowrap',
 animation: 'fadeInUp .2s ease',
 }}>
 {toastMsg}
 </div>
 )}

 {/* Kopfbereich "Members Area / Finances / Revenue overview" entfernt (Lucas 06.11.2026): der Tab oben sagt schon, wo man ist.
 Geblieben ist nur die KeyInvoice-Warnung, wenn Belege fehlgeschlagen sind. */}
 <div style={{ marginBottom: kiIssues.length > 0 || kiMsg ? '20px' : 0 }}>
 {(kiIssues.length > 0 || kiMsg) && (
 <div style={{ padding: '12px 16px', borderRadius: 0, background: 'rgba(201,146,140,.08)', border: '1px solid rgba(201,146,140,.4)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c9928c' }}> KeyInvoice — {kiIssues.length} document{kiIssues.length === 1 ? '' : 's'} not issued</div>
 {kiMsg && <div style={{ fontSize: '14px', color: '#c9928c', marginTop: '6px' }}>{kiMsg}</div>}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
 {kiIssues.map(d => (
 <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '14px', color: s.text }}>
 <span style={{ fontWeight: 500 }}>{d.kind === 'credit_note' ? 'Credit note' : d.kind === 'void' ? 'Void' : 'Invoice'}{d.amount_cents != null ? ` · €${(d.amount_cents / 100).toFixed(2)}` : ''}</span>
 <span style={{ color: s.muted, flex: 1, minWidth: '220px' }}>{d.error}</span>
 {d.booking_id && (
 <button type="button" onClick={() => setRefundPopupBookingId(d.booking_id!)} title="Open booking" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', fontWeight: 500, color: '#f3efe6', textDecoration: 'underline' }}>
 Booking {d.booking_id.slice(0, 8).toUpperCase()} 
 </button>
 )}
 <button type="button" disabled={kiBusyId === d.id} onClick={() => retryKi(d.id)} style={{ fontSize: '14px', fontWeight: 500, padding: '5px 12px', borderRadius: 0, cursor: kiBusyId === d.id ? 'wait' : 'pointer', fontFamily: s.font, background: 'rgba(243,239,230,.12)', color: '#f3efe6', border: '1px solid rgba(243,239,230,.3)' }}>{kiBusyId === d.id ? 'Retrying…' : 'Retry'}</button>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Finances widget */}
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, overflow: 'hidden' }}>
 {/* Tab bar */}
 <div style={{ display: 'flex', borderBottom: '1px solid rgba(243,239,230,.2)', flexWrap: 'wrap' }}>
 {(['overview', 'upcoming', 'refunds', 'history', 'reports', 'pricing'] as const).map(tab => (
 <button key={tab} onClick={() => { setFinTab(tab); localStorage.setItem('azd_finTab', tab) }} style={{
 padding: '14px 22px', fontSize: '14px', fontWeight: 500, border: 'none', background: 'transparent', cursor: 'pointer', letterSpacing: '.06em', fontFamily: s.font,
 color: finTab === tab ? s.accent : s.muted,
 borderBottom: finTab === tab ? `2px solid ${s.accent}` : '2px solid transparent',
 }}>
 {tab === 'overview' ? 'Overview' : tab === 'upcoming' ? 'Upcoming' : tab === 'reports' ? 'Reports' : tab === 'pricing' ? 'Pricing' : tab === 'history' ? 'History' : 'Action needed'}
 {tab === 'refunds' && totalAction > 0 && (
 <span title={`${actionCount ?? 0} refund request(s), ${pendingPayCount} payment(s) waiting and ${payMissingCount} booking(s) without payment status, ${payReqFailCount} payment request(s) not sent`} style={{ marginLeft: '8px', display: 'inline-block', minWidth: '18px', padding: '1px 6px', borderRadius: 0, background: '#c9928c', color: '#000', fontSize: '14px', fontWeight: 500, lineHeight: '16px', textAlign: 'center', letterSpacing: 0 }}>{totalAction}</span>
 )}
 </button>
 ))}
 {finTab !== 'refunds' && (
 <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 20px' }}>
 <FinanceHeadline simulationMode={simulationMode} />
 </div>
 )}
 </div>

 {/* Overview (Day / Month / Year) und Upcoming: echte Zahlen aus dem Ledger */}
 {(finTab === 'overview' || finTab === 'upcoming') && (
 <div style={{ padding: isMobile ? '14px' : '22px' }}>
 <FinanceOverview tab={finTab} simulationMode={simulationMode} who={who} onOpenBooking={setRefundPopupBookingId} isMobile={isMobile} />
 </div>
 )}

 {/* Pricing */}
 {/* Reports: Sales, Bookings, Occupancy mit Zeitraum und CSV (Lucas 05.11.) */}
 {finTab === 'reports' && (
 <div style={{ padding: isMobile ? '14px' : '22px' }}>
 <FinanceReports simulationMode={simulationMode} who={who} isMobile={isMobile} onOpenBooking={setRefundPopupBookingId} />
 </div>
 )}

 {finTab === 'pricing' && (
 <div style={{ padding: isMobile ? '14px' : '24px' }}>
 {/* Stripe sync info */}
 <div style={{ background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.2)', borderRadius: 0, padding: '14px 18px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
 <span style={{ fontSize: '18px', flexShrink: 0 }}></span>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent, marginBottom: '4px' }}>Prices auto-sync to Stripe</div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.55 }}>Saving a price here updates both the website and Stripe simultaneously. No manual update needed.</div>
 </div>
 </div>

 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
 <CsvButton fileName={csvFileName('pricing', null, false)} table={pricesTable(prices)} label="Download price list (CSV)" />
 <CsvButton fileName={csvFileName('price-change-log', null, false)} table={priceLogTable(priceLog, who)} label="Download price changes (CSV)" />
 </div>

 {pricesLoading && <div style={{ color: s.muted, fontSize: '14px', padding: '20px 0' }}>Loading prices…</div>}

 {!pricesLoading && ALL_CATEGORIES.map(cat => {
 const catPrices = grouped[cat] || []
 if (!catPrices.length) return null
 return (
 <div key={cat} style={{ marginBottom: '32px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: categoryColors[cat], marginBottom: '12px' }}>{categoryLabels[cat]}</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
 {catPrices.map(p => {
 const isEditing = editingId === p.id
 const isSaved = pricesSaved === p.id
 const displayPrice = '€' + (p.price_cents / 100).toFixed(2).replace('.00', '')
 const rowLog = priceLog.filter(e => e.product_id === p.id)
 const isExpanded = expandedLogId === p.id
 return (
 <div key={p.id} onClick={() => { if (rowLog.length > 0 && !isEditing) setExpandedLogId(isExpanded ? null : p.id) }} style={{ borderRadius: 0, background: isEditing ? 'rgba(243,239,230,.06)' : 'rgba(255,255,255,.02)', border: isEditing ? '1px solid rgba(243,239,230,.2)' : '1px solid transparent', overflow: 'hidden', cursor: rowLog.length > 0 && !isEditing ? 'pointer' : 'default' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px' }}>
 <div style={{ flex: 1, fontSize: '14px', color: s.text }}>{p.name}</div>
 {p.is_placeholder && !isEditing && (
 <span style={{ fontSize: '14px', fontWeight: 500, padding: '2px 7px', borderRadius: 0, background: 'rgba(212,160,122,.15)', color: '#d4a07a', border: '1px solid rgba(212,160,122,.25)', whiteSpace: 'nowrap' }}>TBC</span>
 )}
 {isSaved && <span style={{ fontSize: '14px', color: '#b7c4b0', fontWeight: 500 }}> Saved</span>}
 {stripeSyncStatus[p.id] === 'syncing' && <span style={{ fontSize: '14px', color: '#f3efe6', fontWeight: 500 }}> Stripe…</span>}
 {stripeSyncStatus[p.id] === 'synced' && <span style={{ fontSize: '14px', color: '#b7c4b0', fontWeight: 500 }}> Stripe </span>}
 {stripeSyncStatus[p.id] === 'error' && <span style={{ fontSize: '14px', color: '#c9928c', fontWeight: 500 }}> Stripe failed</span>}
 {isEditing ? (
 <>
 <span style={{ fontSize: '14px', color: s.muted }}>€</span>
 <input
 autoFocus
 value={editVal}
 onChange={e => setEditVal(e.target.value)}
 onClick={e => e.stopPropagation()}
 onKeyDown={e => { if (e.key === 'Enter') savePrice(p.id); if (e.key === 'Escape') setEditingId(null) }}
 style={{ width: '80px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(243,239,230,.4)', borderRadius: 0, color: s.text, fontSize: '14px', fontWeight: 500, padding: '5px 8px', fontFamily: s.font, outline: 'none' }}
 />
 <button onClick={e => { e.stopPropagation(); savePrice(p.id) }} disabled={savingId === p.id} style={{ padding: '5px 14px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {savingId === p.id ? '…' : 'Save'}
 </button>
 <button onClick={e => { e.stopPropagation(); setEditingId(null) }} style={{ padding: '5px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>Cancel</button>
 </>
 ) : (
 <>
 <span style={{ fontSize: '14px', fontWeight: 500, color: p.is_placeholder ? '#d4a07a' : s.text, minWidth: '60px', textAlign: 'right' }}>{displayPrice}</span>
 <button onClick={e => { e.stopPropagation(); setEditingId(p.id); setEditVal((p.price_cents / 100).toFixed(2)) }} style={{ padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>Edit</button>
 </>
 )}
 </div>
 {isExpanded && rowLog.length > 0 && (
 <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
 {rowLog.map(entry => (
 <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '10px', alignItems: 'center', fontSize: '14px' }}>
 <span style={{ color: '#c9928c', fontWeight: 500 }}>€{(entry.old_price_cents / 100).toFixed(2).replace('.00', '')} <span style={{ color: '#b7c4b0' }}>€{(entry.new_price_cents / 100).toFixed(2).replace('.00', '')}</span></span>
 <span style={{ color: s.muted }}>{entry.changed_by_email}</span>
 <span style={{ color: 'rgba(201,194,182,.4)', textAlign: 'right' }}>{new Date(entry.changed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} {new Date(entry.changed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 )
 })}
 </div>
 </div>
 )
 })}

 {/* Price Change Log */}
 {priceLog.length > 0 && (
 <div style={{ marginTop: '40px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(243,239,230,.5)', marginBottom: '14px' }}>Price Change Log</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
 {priceLog.map(entry => (
 <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '12px', alignItems: 'center', padding: '9px 12px', borderRadius: 0, background: 'rgba(255,255,255,.02)', fontSize: '14px' }}>
 <span style={{ color: s.text, fontWeight: 500 }}>{entry.product_name}</span>
 <span style={{ color: '#c9928c', fontWeight: 500 }}>€{(entry.old_price_cents / 100).toFixed(2).replace('.00', '')}</span>
 <span style={{ color: '#b7c4b0', fontWeight: 500 }}> €{(entry.new_price_cents / 100).toFixed(2).replace('.00', '')}</span>
 <span style={{ color: s.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
 {entry.changed_by_email} · {new Date(entry.changed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} {new Date(entry.changed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 )}

 {/* Refunds */}
 {/* Action needed und History teilen sich diesen Block: die Listen bleiben geladen (Zaehler), sichtbar ist nur der gewaehlte Tab */}
 {(finTab === 'refunds' || finTab === 'history') && (
 <div style={{ padding: isMobile ? '14px' : '24px' }}>
 <div role="tablist" style={{ display: finTab === 'refunds' ? 'flex' : 'none', gap: '6px', flexWrap: 'wrap', marginBottom: '22px', borderBottom: '1px solid rgba(255,255,255,.08)', paddingBottom: '12px' }}>
 {([['requests', 'Payment request not sent', payReqFailCount], ['status', 'Payment status not set', payMissingCount], ['confirm', 'Payments to confirm', pendingPayCount], ['refunds', 'Refunds to authorize', actionCount ?? 0]] as const).map(([k, l, n]) => (
 <button key={k} type="button" role="tab" aria-selected={actTab === k} onClick={() => { setActTab(k); try { localStorage.setItem('azd_finActTab', k) } catch {} }}
 style={{ padding: '8px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, border: `1px solid ${actTab === k ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.12)'}`, background: actTab === k ? 'rgba(243,239,230,.12)' : 'transparent', color: actTab === k ? s.accent : s.muted }}>
 {l}{n > 0 && <span style={{ marginLeft: '8px', display: 'inline-block', minWidth: '18px', padding: '1px 6px', borderRadius: 0, background: '#c9928c', color: '#000', fontSize: '14px', fontWeight: 500, lineHeight: '16px', textAlign: 'center' }}>{n}</span>}
 </button>
 ))}
 </div>
 <div style={{ display: finTab === 'refunds' && actTab === 'requests' ? 'block' : 'none' }}>
 <PaymentRequestFailed sandbox={simulationMode} onCount={setPayReqFailCount} onOpenBooking={setRefundPopupBookingId} />
 {payReqFailCount === 0 && <div style={{ fontSize: '14px', color: s.muted }}>Nothing to do here. Every payment request went out.</div>}
 </div>
 <div style={{ display: finTab === 'refunds' && actTab === 'status' ? 'block' : 'none' }}>
 <PaymentStatusMissing sandbox={simulationMode} onCount={setPayMissingCount} onOpenBooking={setRefundPopupBookingId} who={who} />
 {payMissingCount === 0 && <div style={{ fontSize: '14px', color: s.muted }}>Nothing to do here. Every Front Office booking has a payment status.</div>}
 </div>
 <div style={{ display: finTab === 'refunds' && actTab === 'confirm' ? 'block' : 'none' }}>
 <PendingPayments sandbox={simulationMode} onCount={setPendingPayCount} onOpenBooking={setRefundPopupBookingId} />
 {pendingPayCount === 0 && <div style={{ fontSize: '14px', color: s.muted }}>Nothing to do here. No transfer or Revolut payment is waiting to be confirmed.</div>}
 </div>
 <div style={{ display: finTab === 'refunds' && actTab === 'refunds' ? 'block' : 'none' }}>
 <div style={{ marginBottom: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#c9928c', marginBottom: '4px' }}>Refunds Awaiting Authorization</div>
 <div style={{ fontSize: '14px', color: s.muted }}>Every refund request lands here — Stripe, cash, bank transfer, Revolut, MB WAY. Nothing is paid out and the guest is not emailed until you authorize it. Stripe refunds are executed on authorization; for cash/bank/Revolut, authorize once the money has been handed over.</div>
 </div>

 {pendingRefunds.length > 0 && (
 <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
 <CsvButton fileName={csvFileName('refunds-awaiting-authorization', null, Boolean(simulationMode))} table={pendingRefundsTable(pendingRefunds, who)} />
 </div>
 )}

 {refundsLoading && <div style={{ color: s.muted, fontSize: '14px', padding: '20px 0' }}>Loading...</div>}

 {!refundsLoading && pendingRefunds.length === 0 && (
 <div style={{ background: 'rgba(183,196,176,.05)', border: '1px solid rgba(183,196,176,.15)', borderRadius: 0, padding: '18px 22px', fontSize: '14px', color: '#b7c4b0', textAlign: 'center' }}>
 No pending refunds
 </div>
 )}

 {!refundsLoading && pendingRefunds.length > 0 && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
 {pendingRefunds.map(r => {
 const b = r.booking
 const refundAmt = (r.amount / 100).toFixed(2)
 const RM: Record<string,string> = { stripe: ' Stripe — executed on authorize', cash: ' Cash', bank: ' Bank Transfer', revolut: ' Revolut', mb_way: ' MB WAY', other: ' Other' }
 const ref = r.booking_id.slice(0, 8).toUpperCase()
 return (
 <div key={r.id} style={{ background: 'rgba(201,146,140,.04)', border: '1px solid rgba(201,146,140,.18)', borderRadius: 0, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{b.customer_name ?? '—'}{r.is_test ? <span style={{ marginLeft: '8px', fontSize: '14px', color: '#c9b48a', border: '1px solid rgba(201,180,138,.4)', borderRadius: 0, padding: '1px 5px' }}>TEST</span> : null}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 Booking <button type="button" onClick={() => setRefundPopupBookingId(r.booking_id)} title="Open booking" style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: '#f3efe6', fontWeight: 500, background: 'transparent', border: '1px solid rgba(243,239,230,.35)', borderRadius: 0, padding: '1px 7px', cursor: 'pointer', fontSize: '14px' }}>{ref} </button> · {b.product_name ?? '—'}{b.booking_date ? ` · ${new Date(b.booking_date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {b.customer_email ? <a href={`mailto:${b.customer_email}`} style={{ color: '#f3efe6', textDecoration: 'none' }}>{b.customer_email}</a> : '—'}{b.phone ? <> · <a href={`tel:${b.phone.replace(/\s+/g, '')}`} style={{ color: '#f3efe6', textDecoration: 'none' }}>{b.phone}</a></> : ' · no phone on file'}
 </div>
 <div style={{ fontSize: '14px', color: s.text, marginTop: '8px', padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 0, borderLeft: '3px solid #d4a07a' }}>
 {r.description}
 </div>
 {r.payout_masked && r.method !== 'stripe' && (
 <div style={{ marginTop: '6px', padding: '8px 10px', background: 'rgba(201,180,138,.08)', border: '1px solid rgba(201,180,138,.35)', borderRadius: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.1em', color: '#c9b48a' }}>PAY TO </span>
 {!payoutShown[r.id] && <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', color: s.text }}>{r.payout_masked}</span>}
 {!payoutShown[r.id] && (
 <button type="button" disabled={payoutLoading === r.id} onClick={() => revealPayout(r.id)}
 style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 0, border: '1px solid rgba(201,180,138,.5)', background: 'transparent', color: '#c9b48a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, opacity: payoutLoading === r.id ? .6 : 1 }}>
 {payoutLoading === r.id ? 'Decrypting…' : ' Reveal (logged)'}
 </button>
 )}
 {payoutShown[r.id] && (
 <button type="button" onClick={() => setPayoutShown(prev => { const n = { ...prev }; delete n[r.id]; return n })}
 style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Hide</button>
 )}
 </div>
 {payoutErr[r.id] && <div style={{ fontSize: '14px', color: '#c9928c' }}> {payoutErr[r.id]}</div>}
 {payoutShown[r.id] && [{ label: 'Amount', value: refundAmt }, ...parsePayout(payoutShown[r.id])].map(it => (
 <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <span style={{ width: '92px', flexShrink: 0, fontSize: '14px', color: s.muted }}>{it.label}</span>
 <span style={{ flex: 1, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', color: s.text, userSelect: 'all', wordBreak: 'break-all' }}>{it.value}</span>
 <CopyButton value={it.value} />
 </div>
 ))}
 </div>
 )}
 {!r.payout_masked && r.method !== 'stripe' && r.method !== 'cash' && (
 <div style={{ marginTop: '6px', fontSize: '14px', color: '#d4a07a' }}> No payout details on this request (older request) — ask the guest before paying out.</div>
 )}
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: '16px', fontWeight: 500, color: '#c9928c' }}>{'€'}{refundAmt}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '1px' }}>of €{((b.amount ?? 0) / 100).toFixed(2)} booking</div>
 </div>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '14px' }}>
 <div>
 <div style={{ color: s.muted, marginBottom: '2px' }}>REFUND METHOD</div>
 <div style={{ color: s.text, fontWeight: 500 }}>{RM[r.method] ?? r.method}</div>
 </div>
 <div>
 <div style={{ color: s.muted, marginBottom: '2px' }}>REQUESTED</div>
 <div style={{ color: s.text, fontWeight: 500 }}>{new Date(r.requested_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {new Date(r.requested_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{r.requested_by_email ? ` · ${who(r.requested_by_email)}` : ''}</div>
 </div>
 <div>
 <div style={{ color: s.muted, marginBottom: '2px' }}>BOOKING · PAYMENT</div>
 <div style={{ color: s.text, fontWeight: 500, display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
 <span>{b.status}</span>
 {b.payment_state && <span style={{ padding: '1px 8px', borderRadius: 0, fontSize: '14px', border: `1px solid ${PAYMENT_STATE_COLOR[b.payment_state]}55`, background: `${PAYMENT_STATE_COLOR[b.payment_state]}1f`, color: PAYMENT_STATE_COLOR[b.payment_state] }}>{PAYMENT_STATE_LABEL[b.payment_state]}</span>}
 </div>
 </div>
 </div>
 <div>
 <label style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, display: 'block', marginBottom: '4px' }}>Note (optional)</label>
 <input
 type="text"
 placeholder={r.method === 'stripe' ? 'e.g. approved after call with guest' : 'e.g. handed over in cash 23/10'}
 value={refundNoteInput[r.id] ?? ''}
 onChange={e => setRefundNoteInput(prev => ({ ...prev, [r.id]: e.target.value }))}
 style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '7px 10px', fontFamily: s.font, outline: 'none' }}
 />
 </div>
 {r.method === 'stripe' && (
 <div style={{ border: '1px solid rgba(212,160,122,.25)', borderRadius: 0, padding: '8px 10px', background: 'rgba(212,160,122,.05)' }}>
 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#d4a07a', cursor: 'pointer' }}>
 <input type="checkbox" checked={refundOverride[r.id]?.on ?? false}
 onChange={e => setRefundOverride(prev => ({ ...prev, [r.id]: { method: prev[r.id]?.method ?? 'bank', reason: prev[r.id]?.reason ?? '', on: e.target.checked } }))} />
 Pay out another way instead of Stripe (override)
 </label>
 {refundOverride[r.id]?.on && (
 <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
 <select value={refundOverride[r.id]?.method ?? 'bank'}
 onChange={e => setRefundOverride(prev => ({ ...prev, [r.id]: { ...prev[r.id], method: e.target.value } }))}
 style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '7px 10px', fontFamily: s.font }}>
 <option value="cash"> Cash</option>
 <option value="bank"> Bank Transfer</option>
 <option value="revolut"> Revolut</option>
 <option value="mb_way"> MB WAY</option>
 </select>
 <input type="text" placeholder="Reason (required) — why not refund to the card?" value={refundOverride[r.id]?.reason ?? ''}
 onChange={e => setRefundOverride(prev => ({ ...prev, [r.id]: { ...prev[r.id], reason: e.target.value } }))}
 style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '7px 10px', fontFamily: s.font }} />
 <div style={{ fontSize: '14px', color: s.muted }}> Nothing goes back through Stripe: you pay the guest yourself. Risk: the guest can still dispute the card payment (double loss). The override is logged with your name and reason.</div>
 </div>
 )}
 </div>
 )}
 {(refundOverride[r.id]?.on ? refundOverride[r.id].method : r.method) !== 'stripe' && (
 <div style={{ fontSize: '14px', color: s.muted }}>Press only after the money has really been paid out. The guest then gets the refund email.</div>
 )}
 <button
 onClick={() => markRefundPaid(r.id)}
 disabled={markingRefundId === r.id}
 style={{ width: '100%', padding: '10px', borderRadius: 0, border: 'none', background: 'rgba(183,196,176,.85)', color: '#000', fontWeight: 500, fontSize: '14px', cursor: 'pointer', fontFamily: s.font, opacity: markingRefundId === r.id ? .6 : 1 }}>
 {(() => {
 const eff = refundOverride[r.id]?.on ? refundOverride[r.id].method : r.method
 const label: Record<string, string> = { cash: 'cash', bank: 'bank transfer', revolut: 'Revolut', mb_way: 'MB WAY', other: 'other' }
 if (markingRefundId === r.id) return eff === 'stripe' ? 'Authorizing...' : 'Confirming...'
 if (eff === 'stripe') return `Authorize Refund — €${refundAmt} via Stripe`
 return ` Confirm refund done — €${refundAmt} sent by ${label[eff] ?? eff}${refundOverride[r.id]?.on ? ' (override)' : ''}`
 })()}
 </button>
 </div>
 )
 })}
 </div>
 )}
 </div>

 {/* ── Historie: eigener Tab eine Ebene hoeher (06.11.), darin die Auswahl All / Payments / Refunds / Cash (30.10.) ── */}
 <div style={{ display: finTab === 'history' ? 'block' : 'none' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '10px' }}>History</div>
 <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', fontSize: '14px', color: s.muted }}>
 <span>Show</span>
 <select value={histTab} aria-label="Show" onChange={e => setHistTab(e.target.value as typeof histTab)} style={{ background: '#000', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, padding: '7px 10px', color: s.text, fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', colorScheme: 'dark' }}>
 <option value="all">All movements</option><option value="payments">Payments in</option><option value="refunds">Refunds</option><option value="cash">Cash</option>
 </select>
 </div>
 {histTab !== 'refunds' && (
 <FinanceMovements view={histTab} simulationMode={simulationMode} who={who} onOpenBooking={setRefundPopupBookingId} />
 )}
 {histTab === 'refunds' && (
 <div>
 <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>Refund History</div>
 {refundHistoryCount > 0 && (
 <div style={{ fontSize: '14px', color: s.muted }}>
 {refundHistoryCount} refund{refundHistoryCount === 1 ? '' : 's'}{(refundSearchQ || refundMonth || refundMethod !== 'all') ? ' (filtered)' : ''} · total <span style={{ color: '#c9928c', fontWeight: 500 }}>€{(refundHistorySum / 100).toFixed(2)}</span>
 </div>
 )}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px' }}>Authorized and paid-out refunds, newest first. Click the booking number to open the booking.{simulationMode ? ' (Test data)' : ''}</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
 <input value={refundSearch} onChange={e => setRefundSearch(e.target.value)} placeholder="Search name, email, product, booking no. or reason…" style={{ flex: '1 1 240px', minWidth: 0, background: '#000', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, padding: '8px 12px', color: s.text, fontSize: '14px', fontFamily: 'inherit' }} />
 <input type="month" value={refundMonth} onChange={e => setRefundMonth(e.target.value)} title="Month paid out" style={{ background: '#000', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, padding: '7px 10px', color: s.text, fontSize: '14px', fontFamily: 'inherit', colorScheme: 'dark' }} />
 <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)} style={{ background: '#000', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, padding: '8px 10px', color: s.text, fontSize: '14px', fontFamily: 'inherit' }}>
 <option value="all">All methods</option><option value="stripe">Stripe</option><option value="cash">Cash</option><option value="bank">Bank Transfer</option><option value="revolut">Revolut</option><option value="mb_way">MB WAY</option><option value="other">Other</option>
 </select>
 {(refundSearch || refundMonth || refundMethod !== 'all') && (
 <button type="button" onClick={() => { setRefundSearch(''); setRefundMonth(''); setRefundMethod('all') }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, borderRadius: 0, padding: '7px 12px', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>Clear filters</button>
 )}
 </div>
 <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
 <CsvButton fileName={csvFileName(`history-refunds${refundMonth ? `-${refundMonth}` : ''}`, null, Boolean(simulationMode))} disabled={refundHistoryCount === 0}
 load={() => loadRefundHistoryTable({ sim: Boolean(simulationMode), search: refundSearchQ, month: refundMonth, method: refundMethod }, who)} />
 </div>
 {refundHistoryLoading && <div style={{ color: s.muted, fontSize: '14px', padding: '10px 0' }}>Loading...</div>}
 {refundHistoryError && <div style={{ color: '#c9928c', fontSize: '14px', padding: '8px 0' }}> Could not load refund history: {refundHistoryError}</div>}
 {!refundHistoryLoading && !refundHistoryError && refundHistory.length === 0 && (
 <div style={{ fontSize: '14px', color: s.muted, padding: '14px 0' }}>{(refundSearchQ || refundMonth || refundMethod !== 'all') ? 'No refunds match these filters.' : 'No completed refunds yet.'}</div>
 )}
 {refundHistory.length > 0 && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {refundHistory.map(r => {
 const RMH: Record<string, string> = { stripe: ' Stripe', cash: ' Cash', bank: ' Bank Transfer', revolut: ' Revolut', mb_way: ' MB WAY', other: ' Other' }
 const when = r.paid_at ?? r.requested_at
 return (
 <div key={r.id} style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>
 {r.customer_name ?? '—'}
 {r.is_test && <span style={{ marginLeft: '8px', fontSize: '14px', color: '#c9b48a' }}>TEST</span>}
 <span style={{ marginLeft: '8px', fontSize: '14px', fontWeight: 400, color: s.muted }}>{r.product_name ?? ''}</span>
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 Booking <button type="button" onClick={() => setRefundPopupBookingId(r.booking_id)} title="Open booking" style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: '#f3efe6', fontWeight: 500, background: 'transparent', border: '1px solid rgba(243,239,230,.35)', borderRadius: 0, padding: '0 6px', cursor: 'pointer' }}>{r.booking_id.slice(0, 8).toUpperCase()}</button>
 {' · '}{RMH[r.method] ?? r.method}
 {r.stripe_refund_id ? <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}> · {r.stripe_refund_id}</span> : null}
 </div>
 {r.description && <div style={{ fontSize: '14px', color: s.text, marginTop: '5px' }}>{r.description}</div>}
 {r.notes && <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px', fontStyle: 'italic' }}>{r.notes}</div>}
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '4px' }}>
 Requested by {who(r.requested_by_email)}{r.authorized_by_email ? ` · authorized by ${who(r.authorized_by_email)}` : ''}
 </div>
 </div>
 <div style={{ textAlign: 'right', flexShrink: 0 }}>
 <div style={{ fontSize: '15px', fontWeight: 500, color: '#c9928c' }}>€{(r.amount / 100).toFixed(2)}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>{new Date(when).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date(when).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
 {r.status !== 'paid' && <div style={{ fontSize: '14px', color: '#c9b48a', marginTop: '2px', textTransform: 'uppercase' }}>{r.status}</div>}
 </div>
 </div>
 )
 })}
 </div>
 )}
 {refundHistoryCount > REFUND_PAGE_SIZE && (
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '14px', fontSize: '14px', color: s.muted }}>
 <button type="button" disabled={refundPage === 0 || refundHistoryLoading} onClick={() => setRefundPage(p => Math.max(0, p - 1))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: refundPage === 0 ? s.muted : s.text, borderRadius: 0, padding: '6px 14px', cursor: refundPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}> Previous</button>
 <span>Page {refundPage + 1} of {Math.max(1, Math.ceil(refundHistoryCount / REFUND_PAGE_SIZE))}</span>
 <button type="button" disabled={(refundPage + 1) * REFUND_PAGE_SIZE >= refundHistoryCount || refundHistoryLoading} onClick={() => setRefundPage(p => p + 1)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: (refundPage + 1) * REFUND_PAGE_SIZE >= refundHistoryCount ? s.muted : s.text, borderRadius: 0, padding: '6px 14px', cursor: (refundPage + 1) * REFUND_PAGE_SIZE >= refundHistoryCount ? 'default' : 'pointer', fontFamily: 'inherit' }}>Next </button>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 )}

 {/* Buchungs-Popup aus dem Refunds-Tab: volles FO-Detail (Payments, Refunds, Sessions, Changelog) */}
 {refundPopupBookingId && (
 <div onClick={() => setRefundPopupBookingId(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
 <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', background: '#121210', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, boxShadow: 'none', overflow: 'hidden' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
 <span style={{ fontSize: '14px', color: s.muted }}>Booking <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: s.text, fontWeight: 500 }}>{refundPopupBookingId.slice(0, 8).toUpperCase()}</span> · changes here are live</span>
 <button type="button" onClick={() => setRefundPopupBookingId(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.text, borderRadius: 0, padding: '4px 10px', cursor: 'pointer', fontSize: '14px', fontFamily: s.font }}>Close </button>
 </div>
 <div style={{ padding: '14px' }}>
 <FrontOfficeBookings focusBookingId={refundPopupBookingId} embedded />
 </div>
 </div>
 </div>
 )}

 </div>
 </div>
 )
}

/* ══════════════════════════════
 SCHICHTPLAN
══════════════════════════════ */
function PageSchedule({ nav, session, readonly }: { nav: (p: MemberPage) => void; session: any; readonly?: boolean }) {
 const isMobile = useIsMobile()
 // Schedule folgt dem globalen Sandbox-Schalter: Admin in Sandbox = Test-Dienstplan, sonst Echt-Dienstplan.
 // Nicht-Admins (readonly) sehen immer den echten.
 const { sandbox: schedSandbox } = useSimulation()
 const schedReady = !!readonly || schedSandbox !== null
 const schedTest = !readonly && schedSandbox === true
 const [schedOffset, setSchedOffset] = useState(0)
 const [schedData, setSchedData] = useState<Record<string,{name:string,role:string,start:string,end:string}[]>>({})
 const [schedCell, setSchedCell] = useState<string|null>(null)
 const [selectedRole, setSelectedRole] = useState<string>('')
 const [editingTime, setEditingTime] = useState<{key:string,name:string}|null>(null)
 const [schedView, setSchedView] = useState<'week'|'month'>('week')
 const [monthOffset, setMonthOffset] = useState(0)

 const upsertCell = (key: string, entries: {name:string,role:string,start:string,end:string}[]) => {
 if (!schedReady) return
 supabase.from('schedule_data').upsert({ cell_key: key, entries, updated_at: new Date().toISOString(), is_test: schedTest }, { onConflict: 'cell_key,is_test' })
 .then(({ error }) => { if (error) console.error('[schedule] save failed', error.message) })
 }

 useEffect(() => {
 if (schedView !== 'week' || !schedReady) return
 const now2 = new Date()
 const d2 = now2.getDay()
 const diff2 = (d2 === 0 ? -6 : 1 - d2)
 const base2 = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate() + diff2)
 const mon2 = new Date(base2.getFullYear(), base2.getMonth(), base2.getDate() + schedOffset * 7)
 const monStr = mon2.toISOString().slice(0,10)
 const keys: string[] = []
 for (let i = 0; i < 7; i++) { keys.push(`${monStr}_d${i}_am`, `${monStr}_d${i}_pm`) }
 supabase.from('schedule_data').select('cell_key,entries').in('cell_key', keys).eq('is_test', schedTest)
 .then(({ data }) => {
 if (data && data.length > 0) {
 const loaded: Record<string,{name:string,role:string,start:string,end:string}[]> = {}
 data.forEach(row => { loaded[row.cell_key] = row.entries || [] })
 setSchedData(loaded)
 } else {
 setSchedData({})
 }
 })
 }, [schedOffset, schedView, schedReady, schedTest])

 useEffect(() => {
 if (schedView !== 'month' || !schedReady) return
 const nowM2 = new Date()
 const firstOfMonth2 = new Date(nowM2.getFullYear(), nowM2.getMonth() + monthOffset, 1)
 const lastOfMonth2 = new Date(nowM2.getFullYear(), nowM2.getMonth() + monthOffset + 1, 0)
 const dow02 = firstOfMonth2.getDay() === 0 ? 6 : firstOfMonth2.getDay() - 1
 let mon2 = new Date(firstOfMonth2.getFullYear(), firstOfMonth2.getMonth(), firstOfMonth2.getDate() - dow02)
 const keys2: string[] = []
 while (mon2 <= lastOfMonth2) {
 const monStr2 = mon2.toISOString().slice(0, 10)
 for (let d = 0; d < 7; d++) keys2.push(`${monStr2}_d${d}_am`, `${monStr2}_d${d}_pm`)
 mon2 = new Date(mon2.getFullYear(), mon2.getMonth(), mon2.getDate() + 7)
 }
 supabase.from('schedule_data').select('cell_key,entries').in('cell_key', keys2).eq('is_test', schedTest)
 .then(({ data }) => {
 const loaded: Record<string,{name:string,role:string,start:string,end:string}[]> = {}
 if (data) data.forEach(row => { loaded[row.cell_key] = row.entries || [] })
 setSchedData(loaded)
 })
 }, [schedView, monthOffset, schedReady, schedTest])
 const DEFAULT_SHIFT_TIMES: Record<string,Record<string,{start:string,end:string}>> = {
 am: {
 'Skipper': { start:'07:30', end:'13:30' },
 'Guide': { start:'07:30', end:'13:30' },
 'DSD': { start:'08:00', end:'13:30' },
 'Front Office': { start:'08:00', end:'14:00' },
 'Kiosk A': { start:'07:45', end:'16:45' },
 'Kiosk C': { start:'07:45', end:'16:45' },
 'Kubo': { start:'07:45', end:'16:45' },
 'IT': { start:'09:00', end:'13:00' },
 'Crew': { start:'07:00', end:'13:00' },
 'Tanks': { start:'07:00', end:'13:00' },
 },
 pm: {
 'Skipper': { start:'13:00', end:'18:30' },
 'Guide': { start:'13:00', end:'18:30' },
 'DSD': { start:'13:30', end:'19:00' },
 'Front Office': { start:'13:00', end:'19:00' },
 'Kiosk A': { start:'11:00', end:'20:00' },
 'Kiosk C': { start:'11:00', end:'20:00' },
 'Kubo': { start:'11:00', end:'20:00' },
 'IT': { start:'13:00', end:'18:00' },
 'Crew': { start:'12:30', end:'18:00' },
 'Tanks': { start:'12:30', end:'18:00' },
 },
 }
 const getDefaultShiftTime = (role: string, sess: string) => {
 const t = DEFAULT_SHIFT_TIMES[sess]?.[role]
 return t || (sess === 'am' ? { start:'08:00', end:'13:30' } : { start:'13:00', end:'18:30' })
 }

 const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
 const ROLE_CATS = [
 { label: 'Course', color: '#f3efe6', dim: 'rgba(243,239,230,.5)', bg: 'rgba(243,239,230,.14)', border: 'rgba(243,239,230,.5)', roles: ['AOWD','Buoyancy','Deep','DSD','Navigation','Night','Offshore Prep','OWD','React Right','Refresh','Rescue','Waves & Currents','Wreck'] },
 { label: 'Guide', color: '#b7c4b0', dim: 'rgba(183,196,176,.5)', bg: 'rgba(183,196,176,.14)', border: 'rgba(183,196,176,.5)', roles: ['Guide'] },
 { label: 'Skipper', color: '#c9b48a', dim: 'rgba(201,180,138,.5)', bg: 'rgba(201,180,138,.14)', border: 'rgba(201,180,138,.5)', roles: ['Skipper'] },
 { label: 'Office', color: '#c9c2b6', dim: 'rgba(243,239,230,0.50)', bg: 'rgba(243,239,230,0.14)', border: 'rgba(243,239,230,0.50)', roles: ['IT','Kiosk A','Kiosk C','Kubo'] },
 { label: 'Crew', color: '#c9c2b6', dim: 'rgba(243,239,230,0.40)', bg: 'rgba(243,239,230,0.10)', border: 'rgba(243,239,230,0.35)', roles: ['Crew','Tanks'] },
 { label: 'Folga', color: '#c9b48a', dim: 'rgba(251,146,60,.5)', bg: 'rgba(251,146,60,.14)', border: 'rgba(251,146,60,.5)', roles: ['Meia Folga','Folga'] },
 ]
 const now = new Date()
 const day = now.getDay()
 const diff = (day === 0 ? -6 : 1 - day)
 const baseMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
 const monday = new Date(baseMonday.getFullYear(), baseMonday.getMonth(), baseMonday.getDate() + schedOffset * 7)
 const weekLabel = monday.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit' })
 const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
 const sundayLabel = sunday.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit' })
 const cellKey = (d: number, sess: string) => `${monday.toISOString().slice(0,10)}_d${d}_${sess}`
 // ── Month view ──
 const nowM = new Date()
 const firstOfMonth = new Date(nowM.getFullYear(), nowM.getMonth() + monthOffset, 1)
 const lastOfMonth = new Date(nowM.getFullYear(), nowM.getMonth() + monthOffset + 1, 0)
 const monthLabel = firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
 const mDow0 = firstOfMonth.getDay() === 0 ? 6 : firstOfMonth.getDay() - 1
 const monthWeeks: Date[] = []
 {
 let mMon = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), firstOfMonth.getDate() - mDow0)
 while (mMon <= lastOfMonth) { monthWeeks.push(new Date(mMon)); mMon = new Date(mMon.getFullYear(), mMon.getMonth(), mMon.getDate() + 7) }
 }
 const monthCellKey = (weekMon: Date, dayIdx: number, sess: string) => `${weekMon.toISOString().slice(0,10)}_d${dayIdx}_${sess}`
 const todayIso = new Date().toISOString().slice(0,10)
 const actor = { name: session?.user?.email ?? 'unknown', role: session?.user?.role ?? null, company: null as string | null }
 const toggleStaff = (key: string, name: string, role?: string) => {
 const sess = key.includes('_am') ? 'am' : 'pm'
 setSchedData(prev => {
 const cur = prev[key] || []
 const existing = cur.find(e => e.name === name)
 let newEntries: {name:string,role:string,start:string,end:string}[]
 if (existing) {
 logAction({ action: 'shift_staff_removed', entity_type: 'shift', entity_id: key, payload_before: { name, role: existing.role, start: existing.start, end: existing.end }, notes: `${actor.name} removed ${name} from ${key}`, actor_name: actor.name, actor_role: actor.role ?? undefined, actor_company: actor.company ?? undefined })
 newEntries = cur.filter(e => e.name !== name)
 } else {
 const assignedRole = role || ''
 const isFolga = assignedRole === 'Folga' || assignedRole === 'Meia Folga'
 const t = (assignedRole && !isFolga) ? getDefaultShiftTime(assignedRole, sess) : { start: '', end: '' }
 logAction({ action: 'shift_staff_added', entity_type: 'shift', entity_id: key, payload_after: { name, role: assignedRole, start: t.start, end: t.end }, notes: `${actor.name} added ${name} (${assignedRole}) to ${key}`, actor_name: actor.name, actor_role: actor.role ?? undefined, actor_company: actor.company ?? undefined })
 newEntries = [...cur, { name, role: assignedRole, start: t.start, end: t.end }]
 }
 upsertCell(key, newEntries)
 return { ...prev, [key]: newEntries }
 })
 }
 const assignRole = (key: string, name: string, role: string) => {
 const sess = key.includes('_am') ? 'am' : 'pm'
 const isFolga = role === 'Folga' || role === 'Meia Folga'
 const t = isFolga ? { start: '', end: '' } : getDefaultShiftTime(role, sess)
 setSchedData(prev => {
 const cur = prev[key] || []
 const before = cur.find(e => e.name === name)
 const newStart = isFolga ? '' : (before?.start || t.start)
 const newEnd = isFolga ? '' : (before?.end || t.end)
 logAction({ action: 'shift_role_assigned', entity_type: 'shift', entity_id: key, payload_before: { name, role: before?.role ?? '' }, payload_after: { name, role, start: newStart, end: newEnd }, notes: `${actor.name} set ${name} ${role} on ${key}`, actor_name: actor.name, actor_role: actor.role ?? undefined, actor_company: actor.company ?? undefined })
 const newEntries = cur.map(e => e.name === name ? { ...e, role, start: newStart, end: newEnd } : e)
 upsertCell(key, newEntries)
 return { ...prev, [key]: newEntries }
 })
 }
 const updateTime = (key: string, name: string, field: 'start'|'end', val: string) => {
 setSchedData(prev => {
 const cur = prev[key] || []
 const before = cur.find(e => e.name === name)
 logAction({ action: 'shift_time_updated', entity_type: 'shift', entity_id: key, payload_before: { name, [field]: before?.[field] ?? '' }, payload_after: { name, [field]: val }, notes: `${actor.name} changed ${name} ${field} ${val} on ${key}`, actor_name: actor.name, actor_role: actor.role ?? undefined, actor_company: actor.company ?? undefined })
 const newEntries = cur.map(e => e.name === name ? { ...e, [field]: val } : e)
 upsertCell(key, newEntries)
 return { ...prev, [key]: newEntries }
 })
 }

 const removeFromShift = (key: string, name: string) => {
 setSchedData(prev => {
 const cur = prev[key] || []
 const removed = cur.find(e => e.name === name)
 logAction({ action: 'shift_staff_removed', entity_type: 'shift', entity_id: key, payload_before: { name, role: removed?.role ?? '' }, payload_after: {}, notes: `${actor.name} removed ${name} from ${key}`, actor_name: actor.name, actor_role: actor.role ?? undefined, actor_company: actor.company ?? undefined })
 const newEntries = cur.filter(e => e.name !== name)
 upsertCell(key, newEntries)
 return { ...prev, [key]: newEntries }
 })
 }

 return (
 <div style={{ background: '#000', minHeight: '100vh', padding: '24px 16px' }}>
 <div style={{ maxWidth: '1320px', margin: '0 auto' }}>
 <div style={{ marginBottom: '24px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Members Area</div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
 <button onClick={() => nav('dashboard')} style={{ padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>&#8592; Dashboard</button>
 <h1 style={{ fontSize: '26px', fontWeight: 500, color: s.text, margin: 0 }}>&#a39e94; Schedule</h1>
 {schedTest && <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c9b48a', border: '1px solid rgba(201,180,138,.5)', background: 'rgba(201,180,138,.12)', borderRadius: 0, padding: '4px 10px' }}> Sandbox schedule</span>}
 </div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
 <div style={{ display: 'flex', borderRadius: 0, overflow: 'hidden', border: '1px solid rgba(243,239,230,.2)' }}>
 <button onClick={() => setSchedView('week')} style={{ padding: '5px 12px', background: schedView === 'week' ? 'rgba(243,239,230,.18)' : 'transparent', color: schedView === 'week' ? s.accent : s.muted, border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500, fontFamily: s.font }}>Weekly</button>
 <button onClick={() => setSchedView('month')} style={{ padding: '5px 12px', background: schedView === 'month' ? 'rgba(243,239,230,.18)' : 'transparent', color: schedView === 'month' ? s.accent : s.muted, border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500, fontFamily: s.font }}>Monthly</button>
 </div>
 {schedView === 'week' ? <>
 <button onClick={() => setSchedOffset(o => o - 1)} style={{ padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'transparent', color: s.accent, cursor: 'pointer', fontSize: '16px', fontFamily: s.font }}>&#8249;</button>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text, minWidth: '130px', textAlign: 'center' }}>{weekLabel} – {sundayLabel}</span>
 <button onClick={() => setSchedOffset(o => o + 1)} style={{ padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'transparent', color: s.accent, cursor: 'pointer', fontSize: '16px', fontFamily: s.font }}>&#8250;</button>
 {schedOffset !== 0 && <button onClick={() => setSchedOffset(0)} style={{ padding: '6px 12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, cursor: 'pointer', fontSize: '14px', fontFamily: s.font }}>Today</button>}
 </> : <>
 <button onClick={() => setMonthOffset(o => o - 1)} style={{ padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'transparent', color: s.accent, cursor: 'pointer', fontSize: '16px', fontFamily: s.font }}>&#8249;</button>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text, minWidth: '130px', textAlign: 'center' }}>{monthLabel}</span>
 <button onClick={() => setMonthOffset(o => o + 1)} style={{ padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'transparent', color: s.accent, cursor: 'pointer', fontSize: '16px', fontFamily: s.font }}>&#8250;</button>
 {monthOffset !== 0 && <button onClick={() => setMonthOffset(0)} style={{ padding: '6px 12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, cursor: 'pointer', fontSize: '14px', fontFamily: s.font }}>Today</button>}
 </>}
 </div>
 </div>
 {readonly
 ? <p style={{ fontSize: '14px', color: 'rgba(255,180,60,.75)', marginTop: '6px' }}>&#128274; Read-only — contact an admin to make changes.</p>
 : <p style={{ fontSize: '14px', color: s.muted, marginTop: '6px' }}>Click any cell to assign staff and their role for that shift.</p>
 }
 </div>
 {schedView === 'week' && (<div style={{ overflowX: 'auto' }}>
 <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', gap: '2px', minWidth: '620px' }}>
 <div />
 {DAYS.map((d, i) => {
 const dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
 return (
 <div key={d} style={{ textAlign: 'center', padding: '8px 4px', fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase' }}>
 {d}<br /><span style={{ fontSize: '14px', fontWeight: 400, opacity: .7 }}>{dt.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit' })}</span>
 </div>
 )
 })}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 500, color: s.accent, letterSpacing: '.08em', textTransform: 'uppercase', padding: '4px' }}>AM</div>
 {DAYS.map((_, i) => {
 const key = cellKey(i, 'am')
 const entries = schedData[key] || []
 return (
 <div key={key} onClick={() => { if (!readonly) { setSchedCell(schedCell === key ? null : key); setSelectedRole('') } }}
 style={{ minHeight: '80px', background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: schedCell === key ? '1px solid rgba(243,239,230,.6)' : '1px solid rgba(243,239,230,.12)', borderRadius: 0, padding: '6px', cursor: readonly ? 'default' : 'pointer', transition: 'border .15s' }}>
 {entries.length === 0 && <div style={{ fontSize: '14px', color: s.muted, opacity: .4, textAlign: 'center', marginTop: '22px' }}>&#8212;</div>}
 {[...entries].sort((a,b) => {
 const aF = (a.role==='Folga'||a.role==='Meia Folga') ? 1 : 0
 const bF = (b.role==='Folga'||b.role==='Meia Folga') ? 1 : 0
 return aF - bF
 }).map(e => {
 const isFolga = e.role === 'Folga' || e.role === 'Meia Folga'
 const chipColor = isFolga ? '#c9928c' : '#b7c4b0'
 const chipBg = isFolga ? 'rgba(255,96,96,.1)' : 'rgba(183,196,176,.1)'
 const timeColor = isFolga ? 'rgba(255,96,96,.5)' : 'rgba(183,196,176,.55)'
 return (
 <div key={e.name} style={{ fontSize: '14px', fontWeight: 500, color: chipColor, background: chipBg, borderRadius: 0, padding: '3px 6px', marginBottom: '3px' }}>
 <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}{e.role ? <span style={{ fontSize: '14px', opacity: .65, marginLeft: '4px' }}>· {e.role}</span> : null}</div>
 {(e.start || e.end) && <div style={{ fontSize: '14px', color: timeColor, fontWeight: 500, marginTop: '1px' }}>{e.start}{e.end ? ` – ${e.end}` : ''}</div>}
 </div>
 )
 })}
 </div>
 )
 })}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 500, color: '#d4a07a', letterSpacing: '.08em', textTransform: 'uppercase', padding: '4px' }}>PM</div>
 {DAYS.map((_, i) => {
 const key = cellKey(i, 'pm')
 const entries = schedData[key] || []
 return (
 <div key={key} onClick={() => { if (!readonly) { setSchedCell(schedCell === key ? null : key); setSelectedRole('') } }}
 style={{ minHeight: '80px', background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: schedCell === key ? '1px solid rgba(212,160,122,.6)' : '1px solid rgba(243,239,230,.12)', borderRadius: 0, padding: '6px', cursor: readonly ? 'default' : 'pointer', transition: 'border .15s' }}>
 {entries.length === 0 && <div style={{ fontSize: '14px', color: s.muted, opacity: .4, textAlign: 'center', marginTop: '22px' }}>&#8212;</div>}
 {[...entries].sort((a,b) => {
 const aF = (a.role==='Folga'||a.role==='Meia Folga') ? 1 : 0
 const bF = (b.role==='Folga'||b.role==='Meia Folga') ? 1 : 0
 return aF - bF
 }).map(e => {
 const isFolga = e.role === 'Folga' || e.role === 'Meia Folga'
 const chipColor = isFolga ? '#c9928c' : '#d4a07a'
 const chipBg = isFolga ? 'rgba(255,96,96,.1)' : 'rgba(212,160,122,.1)'
 const timeColor = isFolga ? 'rgba(255,96,96,.5)' : 'rgba(212,160,122,.55)'
 return (
 <div key={e.name} style={{ fontSize: '14px', fontWeight: 500, color: chipColor, background: chipBg, borderRadius: 0, padding: '3px 6px', marginBottom: '3px' }}>
 <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}{e.role ? <span style={{ fontSize: '14px', opacity: .65, marginLeft: '4px' }}>· {e.role}</span> : null}</div>
 {(e.start || e.end) && <div style={{ fontSize: '14px', color: timeColor, fontWeight: 500, marginTop: '1px' }}>{e.start}{e.end ? ` – ${e.end}` : ''}</div>}
 </div>
 )
 })}
 </div>
 )
 })}
 </div>
 </div>)}
 {schedView === 'month' && (
 <div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
 {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => (
 <div key={d} style={{ textAlign: 'center', padding: '6px 4px', fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase' }}>{d}</div>
 ))}
 </div>
 {monthWeeks.map((weekMon, wi) => (
 <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
 {[0,1,2,3,4,5,6].map(d => {
 const dayDate = new Date(weekMon.getFullYear(), weekMon.getMonth(), weekMon.getDate() + d)
 const amKey = monthCellKey(weekMon, d, 'am')
 const pmKey = monthCellKey(weekMon, d, 'pm')
 const amE = (schedData[amKey] || []).filter(e => e.role !== 'Folga' && e.role !== 'Meia Folga')
 const pmE = (schedData[pmKey] || []).filter(e => e.role !== 'Folga' && e.role !== 'Meia Folga')
 const isThisMonth = dayDate.getMonth() === firstOfMonth.getMonth()
 const isToday = dayDate.toISOString().slice(0,10) === todayIso
 return (
 <div key={d} style={{
 minHeight: '72px',
 background: isThisMonth ? 'rgba(0,0,0,0.70)' : 'rgba(255,255,255,.045)',
 border: isToday ? '1px solid rgba(243,239,230,.5)' : '1px solid rgba(243,239,230,.08)',
 borderRadius: 0,
 padding: '6px',
 opacity: isThisMonth ? 1 : 0.4,
 }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: isToday ? s.accent : s.text, marginBottom: '3px' }}>{dayDate.getDate()}</div>
 {amE.length > 0 && (
 <div style={{ fontSize: '14px', color: '#f3efe6', marginBottom: '2px', lineHeight: 1.3 }}>
 {amE.slice(0,3).map(e => e.name.split(' ')[0]).join(', ')}{amE.length > 3 ? ` +${amE.length-3}` : ''}
 </div>
 )}
 {pmE.length > 0 && (
 <div style={{ fontSize: '14px', color: '#d4a07a', lineHeight: 1.3 }}>
 {pmE.slice(0,3).map(e => e.name.split(' ')[0]).join(', ')}{pmE.length > 3 ? ` +${pmE.length-3}` : ''}
 </div>
 )}
 {amE.length === 0 && pmE.length === 0 && isThisMonth && (
 <div style={{ fontSize: '14px', color: s.muted, opacity: .3, textAlign: 'center', marginTop: '12px' }}>—</div>
 )}
 </div>
 )
 })}
 </div>
 ))}
 </div>
 )}
 {schedCell && (
 <div style={{ marginTop: '20px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, padding: '18px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
 Assign staff — {schedCell.includes('_am') ? 'AM' : 'PM'} · {DAYS[parseInt(schedCell.split('_d')[1])]}
 </div>

 {/* STEP 1: Role picker */}
 <div style={{ marginBottom: '18px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px' }}>1 · Pick a role</div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, auto)', gap: '0 20px', alignItems: 'start', overflowX: 'auto' }}>
 {ROLE_CATS.map(cat => (
 <div key={cat.label}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: cat.color, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px', opacity: .75, whiteSpace: 'nowrap', borderBottom: `1px solid ${cat.border}`, paddingBottom: '5px' }}>{cat.label}</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
 {[...cat.roles].sort().map(r => {
 const isActive = selectedRole === r
 return (
 <button key={r} onClick={() => setSelectedRole(isActive ? '' : r)} style={{ padding: '3px 10px', borderRadius: 0, border: `1px solid ${isActive ? cat.border : 'rgba(255,255,255,.08)'}`, background: isActive ? cat.bg : 'transparent', color: isActive ? cat.color : cat.dim, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap', textAlign: 'left' }}>{r}</button>
 )
 })}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* STEP 2: Name picker (only after role selected) */}
 {selectedRole && (
 <div style={{ marginBottom: '18px', paddingTop: '14px', borderTop: '1px solid rgba(243,239,230,.12)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
 2 · Assign <span style={{ color: (() => { const cat = ROLE_CATS.find(c => c.roles.includes(selectedRole)); return cat?.color ?? s.accent })() }}>{selectedRole}</span> to
 </div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
 {TEAM.map(m => {
 const entries = schedData[schedCell] || []
 const entry = entries.find(e => e.name === m.name)
 const sel = !!entry
 return (
 <button key={m.name} onClick={() => toggleStaff(schedCell, m.name, sel ? undefined : selectedRole)}
 style={{ padding: '7px 12px', borderRadius: 0, border: sel ? '1px solid rgba(183,196,176,.6)' : '1px solid rgba(255,255,255,.15)', background: sel ? 'rgba(183,196,176,.12)' : 'transparent', color: sel ? '#b7c4b0' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, display: 'flex', alignItems: 'center', gap: '6px' }}>
 {m.name}{entry?.role && <span style={{ fontSize: '14px', opacity: .75, color: s.accent }}>· {entry.role}</span>}
 </button>
 )
 })}
 </div>
 </div>
 )}

 {/* Assigned staff — time editing */}
 {(schedData[schedCell] || []).length > 0 && (
 <div style={{ paddingTop: '14px', borderTop: '1px solid rgba(243,239,230,.12)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px' }}>Assigned this shift</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
 {(schedData[schedCell] || []).map(e => (
 <div key={e.name} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#b7c4b0' }}>{e.name}{e.role && <span style={{ fontSize: '14px', opacity: .7, marginLeft: '5px' }}>· {e.role}</span>}</div>
 <button onClick={ev => { ev.stopPropagation(); removeFromShift(schedCell, e.name) }} title="Remove from shift" style={{ background: 'none', border: 'none', color: 'rgba(201,146,140,.55)', fontSize: '14px', lineHeight: 1, cursor: 'pointer', padding: '0 2px', fontFamily: s.font, flexShrink: 0 }}>×</button>
 </div>
 {e.role && e.role !== 'Folga' && e.role !== 'Meia Folga' && (
 editingTime?.key === schedCell && editingTime?.name === e.name ? (
 <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={ev => ev.stopPropagation()}>
 <input type="time" value={e.start} onChange={ev => updateTime(schedCell, e.name, 'start', ev.target.value)} style={{ background: '#000', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '2px 5px', fontFamily: s.font, outline: 'none', width: '84px' }} />
 <span style={{ color: s.muted, fontSize: '14px' }}>–</span>
 <input type="time" value={e.end} onChange={ev => updateTime(schedCell, e.name, 'end', ev.target.value)} style={{ background: '#000', border: '1px solid rgba(243,239,230,.3)', borderRadius: 0, color: s.text, fontSize: '14px', padding: '2px 5px', fontFamily: s.font, outline: 'none', width: '84px' }} />
 <button onClick={() => setEditingTime(null)} style={{ background: 'rgba(183,196,176,.12)', border: '1px solid rgba(183,196,176,.3)', borderRadius: 0, color: '#b7c4b0', fontSize: '14px', padding: '2px 8px', cursor: 'pointer', fontFamily: s.font, fontWeight: 500 }}></button>
 </div>
 ) : (
 <button onClick={ev => { ev.stopPropagation(); setEditingTime({ key: schedCell, name: e.name }) }} style={{ fontSize: '14px', color: s.muted, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '0 2px', fontFamily: s.font }}>
 {e.start && e.end ? `${e.start} – ${e.end} ` : '+ time '}
 </button>
 )
 )}
 </div>
 ))}
 </div>
 </div>
 )}

 <button onClick={() => { setSchedCell(null); setSelectedRole('') }} style={{ marginTop: '18px', padding: '7px 18px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>Done</button>
 </div>
 )}
 </div>
 </div>
 )
}

/* ══════════════════════════════
 TEAM PROFILES
══════════════════════════════ */
function PageProfiles({ nav, session }: { nav: (p: MemberPage) => void; session: any }) {
 const isMobile = useIsMobile()
 const [profiles, setProfiles] = useState<any[]>([])
 const [profileEdit, setProfileEdit] = useState<any|null>(null)
 const [profileIsNew, setProfileIsNew] = useState(false)
 const [delConfirm, setDelConfirm] = useState<{id:string,step:number}|null>(null)
 const [inviteStatus, setInviteStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle')
 const [inviteError, setInviteError] = useState('')
 const [inviteRole, setInviteRole] = useState('')
 const [initPassword, setInitPassword] = useState('')
 const [createStatus, setCreateStatus] = useState<'idle'|'creating'|'done'|'error'>('idle')
 const [createError, setCreateError] = useState('')
 const [magicInviteStatus, setMagicInviteStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle')
 const [magicInviteError, setMagicInviteError] = useState('')
 const [langSearch, setLangSearch] = useState('')
 const [certSearch, setCertSearch] = useState('')

 const sendInvite = async (p: any) => {
 if (!session?.access_token) { setInviteStatus('error'); setInviteError('Nicht angemeldet'); return }
 if (!p.email || !p.name) { setInviteStatus('error'); setInviteError('Name + Email erforderlich'); return }
 const pw = initPassword.trim()
 const digits = (pw.match(/\d/g) || []).length
 if (!pw || pw.length < 8 || digits < 2) {
 setInviteStatus('error')
 setInviteError('Passwort erforderlich: min. 8 Zeichen und mind. 2 Zahlen')
 return
 }
 setInviteStatus('sending')
 try {
 const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-staff`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${session.access_token}`,
 },
 body: JSON.stringify({ email: p.email, name: p.name, password: pw, role: p.role || 'staff', company: p.company || 'azd' }),
 })
 const data = await res.json()
 if (data.error) throw new Error(data.error)
 setInviteStatus('sent')
 setInitPassword('')
 } catch (err: any) {
 setInviteStatus('error')
 setInviteError(err.message)
 }
 }

 const sendMagicInvite = async (p: any) => {
 if (!session?.access_token) { setMagicInviteStatus('error'); setMagicInviteError('Nicht angemeldet'); return }
 if (!p.email || !p.name) { setMagicInviteStatus('error'); setMagicInviteError('Name + Email erforderlich'); return }
 setMagicInviteStatus('sending')
 try {
 const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-staff`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${session.access_token}`,
 },
 body: JSON.stringify({ email: p.email, name: p.name, role: inviteRole || p.role || 'staff', company: p.company || 'azd' }),
 })
 const data = await res.json()
 if (data.error) throw new Error(data.error)
 setMagicInviteStatus('sent')
 } catch (err: any) {
 setMagicInviteStatus('error')
 setMagicInviteError(err.message)
 }
 }

 const QUALS = ['SSI Instructor','PADI Instructor','Divemaster','Guide','Skipper','Marine Biologist','Front Office','IT','Crew','Management','Director','Marketing']
 const DIVE_CERTS = ['Open Water Diver','Advanced OW Diver','Rescue Diver','Divemaster','SSI Instructor','PADI Instructor']
 const SPECIALTY_CERTS = ['Deep Diving','Wreck Diving','Navigation','Night & LV','Perfect Buoyancy','Waves, Tides & Currents','Computer Diving','Boat Diving','Photo & Video','React Right','Stress & Rescue','Science of Diving','Offshore Prep','Blue Oceans','Coral ID','Fish ID','Manta & Ray Ecology','Marine Invertebrate Ecology','Marine Mammal Ecology','Nudibranch Ecology']
 // Programmes an Instructor can be authorized to teach (matches course_prices IDs by label)
 const TEACH_CERTS = ['Basic Diver','Scuba Diver','Open Water Diver','Advanced OW Diver','Deep Diving','Wreck Diving','Navigation','Night & LV','Perfect Buoyancy','Waves, Tides & Currents','Computer Diving','Boat Diving','Photo & Video','React Right','Stress & Rescue','Science of Diving','Dive Guide','Divemaster','Offshore Prep','Blue Oceans','Coral ID','Fish ID','Manta & Ray Ecology','Marine Invertebrate Ecology','Marine Mammal Ecology','Nudibranch Ecology','SSI Explorers']
 // Programmes a Divemaster can assist with (under instructor supervision)
 const ASSIST_CERTS = ['Basic Diver','Scuba Diver','Open Water Diver','Advanced OW Diver','Deep Diving','Wreck Diving','Navigation','Night & LV','Perfect Buoyancy','Waves, Tides & Currents','Computer Diving','Boat Diving','React Right']
 const ALL_LANGS: [string,string,string][] = [
 ['\u{1F1F5}\u{1F1F9}','PT','Portuguese'],['\u{1F1EC}\u{1F1E7}','EN','English'],['\u{1F1E9}\u{1F1EA}','DE','German'],['\u{1F1EB}\u{1F1F7}','FR','French'],['\u{1F1EA}\u{1F1F8}','ES','Spanish'],
 ['\u{1F1EE}\u{1F1F9}','IT','Italian'],['\u{1F1F3}\u{1F1F1}','NL','Dutch'],['\u{1F1F7}\u{1F1FA}','RU','Russian'],['\u{1F1E8}\u{1F1F3}','ZH','Chinese'],['\u{1F1EF}\u{1F1F5}','JA','Japanese'],
 ['\u{1F1F8}\u{1F1E6}','AR','Arabic'],['\u{1F1F0}\u{1F1F7}','KO','Korean'],['\u{1F1F8}\u{1F1EA}','SV','Swedish'],['\u{1F1E9}\u{1F1F0}','DA','Danish'],['\u{1F1F3}\u{1F1F4}','NO','Norwegian'],
 ['\u{1F1EB}\u{1F1EE}','FI','Finnish'],['\u{1F1F5}\u{1F1F1}','PL','Polish'],['\u{1F1E8}\u{1F1FF}','CS','Czech'],['\u{1F1ED}\u{1F1FA}','HU','Hungarian'],['\u{1F1F7}\u{1F1F4}','RO','Romanian'],
 ['\u{1F1E7}\u{1F1EC}','BG','Bulgarian'],['\u{1F1ED}\u{1F1F7}','HR','Croatian'],['\u{1F1FA}\u{1F1E6}','UK','Ukrainian'],['\u{1F1F7}\u{1F1F8}','SR','Serbian'],['\u{1F1EC}\u{1F1F7}','EL','Greek'],
 ['\u{1F1F9}\u{1F1F7}','TR','Turkish'],['\u{1F1EE}\u{1F1F1}','HE','Hebrew'],['\u{1F1EE}\u{1F1E9}','ID','Indonesian'],['\u{1F1F2}\u{1F1FE}','MS','Malay'],['\u{1F1F9}\u{1F1ED}','TH','Thai'],
 ['\u{1F1FB}\u{1F1F3}','VI','Vietnamese'],['\u{1F1EE}\u{1F1F3}','HI','Hindi'],['\u{1F1E7}\u{1F1E9}','BN','Bengali'],['\u{1F1F5}\u{1F1F0}','UR','Urdu'],['\u{1F1F5}\u{1F1ED}','TL','Filipino'],
 ['\u{1F1F0}\u{1F1FF}','KK','Kazakh'],['\u{1F1EC}\u{1F1EA}','KA','Georgian'],['\u{1F1E6}\u{1F1F2}','HY','Armenian'],['\u{1F1E6}\u{1F1FF}','AZ','Azerbaijani'],
 ]
 const COMMON_CODES = ['PT','EN','DE','FR','ES','IT','NL','RU','ZH','AR']
 const AVAIL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

 // Load profiles from Supabase on mount
 useEffect(() => {
 supabase.from('profiles').select('*').order('created_at', { ascending: true })
 .then(({ data }) => {
 if (data) setProfiles(data.map(dbRowToProfile))
 })
 }, [])

 function dbRowToProfile(row: any) {
 const q = row.qualifications || {}
 return {
 id: row.id,
 name: row.name || '',
 email: row.email || '',
 phone: row.phone || '',
 role: row.role || 'staff',
 company: row.company || 'azd',
 dataAccess: row.data_access === 'production' ? 'production' : 'sandbox',
 quals: row.dive_role ? [row.dive_role] : [],
 langs: row.langs || [],
 availDays: row.avail_days || [],
 availNote: row.avail_note || '',
 photoUrl: row.avatar_url || '',
 contractUrl: row.contract_url || '',
 notes: row.notes || '',
 isPublic: row.is_public !== false,
 diveCerts: row.dive_certs || [],
 specialtyCerts: row.specialty_certs || [],
 teachCerts: q.can_teach || [],
 assistCerts: q.can_assist || [],
 diveRole: row.dive_role || 'other',
 ssiPro: q.ssi_pro || '',
 ssiMid: q.ssi_mid || '',
 ssiLevel: q.ssi_level || '',
 ssiLevelLabel: q.ssi_level_label || '',
 ssiTeaching: q.ssi_teaching || '',
 ssiPaidUntil: q.ssi_paid_until || '',
 matrixR: q.matrix_r || null,
 matrixA: q.matrix_a || null,
 }
 }

 const newProfile = () => ({
 id: null, name: '', email: '', phone: '', role: 'staff' as const, company: 'azd',
 quals: [] as string[], langs: [] as string[], availDays: [] as string[], availNote: '',
 photoUrl: '', contractUrl: '', notes: '', isPublic: true,
 diveCerts: [] as string[], specialtyCerts: [] as string[],
 teachCerts: [] as string[], assistCerts: [] as string[], diveRole: 'other',
 ssiPro: '', ssiMid: '', ssiLevel: '', ssiLevelLabel: '', ssiTeaching: '', ssiPaidUntil: '',
 matrixR: null as Record<string,number>|null, matrixA: null as Record<string,number>|null,
 })

 const saveProfile = async (p: any) => {
 const payload: any = {
 name: p.name, email: p.email || null, phone: p.phone || null,
 role: p.role, company: p.company,
 data_access: p.dataAccess === 'production' ? 'production' : 'sandbox',
 avatar_url: p.photoUrl || null, contract_url: p.contractUrl || null,
 notes: p.notes || '', is_public: p.isPublic,
 langs: p.langs, avail_days: p.availDays, avail_note: p.availNote || '',
 dive_certs: p.diveCerts, specialty_certs: p.specialtyCerts || [],
 dive_role: p.diveRole || 'other',
 qualifications: {
 ...(p.teachCerts?.length ? { can_teach: p.teachCerts } : {}),
 ...(p.assistCerts?.length ? { can_assist: p.assistCerts } : {}),
 ...(p.ssiPro ? { ssi_pro: p.ssiPro } : {}),
 ...(p.ssiMid ? { ssi_mid: p.ssiMid } : {}),
 ...(p.ssiLevel ? { ssi_level: p.ssiLevel, ssi_level_label: ({ dg:'Dive Guide', owi:'OWI', dmi:'DMI', ait:'AIT' } as any)[p.ssiLevel] || p.ssiLevel } : {}),
 ...(p.ssiTeaching ? { ssi_teaching: p.ssiTeaching } : {}),
 ...(p.ssiPaidUntil ? { ssi_paid_until: p.ssiPaidUntil } : {}),
 ...(p.matrixR ? { matrix_r: p.matrixR } : {}),
 ...(p.matrixA ? { matrix_a: p.matrixA } : {}),
 },
 updated_at: new Date().toISOString(),
 }
 if (profileIsNew) {
 if (initPassword && p.email) {
 // Create auth user first via edge function, then save full profile
 setCreateStatus('creating')
 try {
 const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-staff`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
 body: JSON.stringify({ email: p.email, name: p.name, password: initPassword }),
 })
 const result = await res.json()
 if (result.error) { setCreateStatus('error'); setCreateError(result.error); return }
 // Upsert full profile with the new auth UUID
 const { data } = await supabase.from('profiles').upsert({ id: result.userId, ...payload }).select().single()
 if (data) setProfiles(prev => [...prev, dbRowToProfile(data)])
 setCreateStatus('done')
 } catch (err: any) {
 setCreateStatus('error'); setCreateError(err.message); return
 }
 } else {
 // No password — just insert profile (auth account can be linked later)
 const { data, error } = await supabase.from('profiles').insert(payload).select().single()
 if (!error && data) setProfiles(prev => [...prev, dbRowToProfile(data)])
 }
 } else {
 await supabase.from('profiles').update(payload).eq('id', p.id)
 setProfiles(prev => prev.map((x: any) => x.id === p.id ? { ...p } : x))
 }
 setProfileEdit(null); setInitPassword(''); setCreateStatus('idle'); setLangSearch(''); setCertSearch('')
 }
 const chip = (label: string, active: boolean, onClick: () => void, color = '#b7c4b0') => (
 <button key={label} onClick={onClick} style={{ padding: '5px 11px', borderRadius: 0, border: active ? `1px solid ${color}60` : '1px solid rgba(255,255,255,.15)', background: active ? `${color}18` : 'transparent', color: active ? color : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{label}</button>
 )

 if (profileEdit) {
 const p = profileEdit
 const set = (k: string, v: any) => setProfileEdit((prev: any) => ({ ...prev, [k]: v }))
 const toggleArr = (k: string, v: string) => set(k, p[k].includes(v) ? p[k].filter((x: string) => x !== v) : [...p[k], v])
 const filteredLangs = langSearch ? ALL_LANGS.filter(([,c,n]) => n.toLowerCase().includes(langSearch.toLowerCase()) || c.toLowerCase().includes(langSearch.toLowerCase())) : ALL_LANGS
 const commonLangs = ALL_LANGS.filter(([,c]) => COMMON_CODES.includes(c))
 const filteredCerts = certSearch ? SPECIALTY_CERTS.filter(c => c.toLowerCase().includes(certSearch.toLowerCase())) : SPECIALTY_CERTS
 const isInstructor = p.diveRole === 'instructor'
 const isDivemaster = p.diveRole === 'divemaster'
 return (
 <div style={{ background: '#000', minHeight: '100vh', padding: '24px 16px' }}>
 <div style={{ maxWidth: '900px', margin: '0 auto' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
 <button onClick={() => { setProfileEdit(null); setLangSearch(''); setCertSearch(''); setInviteStatus('idle'); setInviteError(''); setInviteRole('') }} style={{ padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>&#8592; Back</button>
 <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 500, color: s.text }}>{profileIsNew ? 'New Profile' : p.name || 'Edit Profile'}</h2>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
 {([['Name','name','text'],['Phone','phone','tel']] as [string,string,string][]).map(([label, key, type]) => (
 <div key={key}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
 <input value={p[key]} onChange={e => set(key, e.target.value)} type={type} placeholder={label} style={{ width: '100%', padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 </div>
 ))}
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Dive Role</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
 {(['other','guide','divemaster','instructor'] as const).map(dr => (
 <button key={dr} onClick={() => set('diveRole', dr)} style={{ padding: '6px 14px', borderRadius: 0, border: `1px solid ${p.diveRole === dr ? 'rgba(243,239,230,.5)' : 'rgba(255,255,255,.15)'}`, background: p.diveRole === dr ? 'rgba(243,239,230,.18)' : 'transparent', color: p.diveRole === dr ? '#f3efe6' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {dr === 'other' ? 'Other / Staff' : dr === 'guide' ? 'Guide' : dr === 'divemaster' ? 'Divemaster' : 'Instructor'}
 </button>
 ))}
 </div>
 {isInstructor && (
 <div style={{ marginBottom: '16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#d4a07a', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Teaching Authorization (can teach)</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
 {TEACH_CERTS.map(tc => (
 <button key={tc} onClick={() => toggleArr('teachCerts', tc)} style={{ padding: '4px 10px', borderRadius: 0, border: `1px solid ${(p.teachCerts||[]).includes(tc) ? 'rgba(212,160,122,.5)' : 'rgba(255,255,255,.15)'}`, background: (p.teachCerts||[]).includes(tc) ? 'rgba(212,160,122,.15)' : 'transparent', color: (p.teachCerts||[]).includes(tc) ? '#d4a07a' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{tc}{(p.teachCerts||[]).includes(tc) ? ' ' : ''}</button>
 ))}
 </div>
 </div>
 )}
 {isDivemaster && (
 <div style={{ marginBottom: '16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#c9c2b6', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>DM Authorization (can assist)</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
 {ASSIST_CERTS.map(ac => (
 <button key={ac} onClick={() => toggleArr('assistCerts', ac)} style={{ padding: '4px 10px', borderRadius: 0, border: `1px solid ${(p.assistCerts||[]).includes(ac) ? 'rgba(243,239,230,0.50)' : 'rgba(255,255,255,.15)'}`, background: (p.assistCerts||[]).includes(ac) ? 'rgba(243,239,230,0.15)' : 'transparent', color: (p.assistCerts||[]).includes(ac) ? '#c9c2b6' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{ac}{(p.assistCerts||[]).includes(ac) ? ' ' : ''}</button>
 ))}
 </div>
 </div>
 )}
 </div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Dive Certifications</div>
 {(p.diveCerts || []).length > 0 && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
 {(p.diveCerts || []).map((dc: string) => (
 <button key={dc} onClick={() => toggleArr('diveCerts', dc)} style={{ padding: '5px 11px', borderRadius: 0, border: '1px solid rgba(243,239,230,.5)', background: 'rgba(243,239,230,.15)', color: '#f3efe6', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{dc} ×</button>
 ))}
 </div>
 )}
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Certification level</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
 {DIVE_CERTS.filter(dc => !(p.diveCerts || []).includes(dc)).map(dc => (
 <button key={dc} onClick={() => toggleArr('diveCerts', dc)} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'transparent', color: '#f3efe6', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{dc}</button>
 ))}
 </div>
 <input value={certSearch} onChange={e => setCertSearch(e.target.value)} placeholder="Search specialties: Deep, Nitrox, Wreck…" style={{ width: '100%', padding: '8px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 {certSearch && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '100px', overflowY: 'auto', marginTop: '8px' }}>
 {filteredCerts.filter(dc => !(p.diveCerts || []).includes(dc)).map(dc => (
 <button key={dc} onClick={() => { toggleArr('diveCerts', dc); setCertSearch('') }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'transparent', color: '#f3efe6', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{dc}</button>
 ))}
 {filteredCerts.filter(dc => !(p.diveCerts || []).includes(dc)).length === 0 && (
 <button onClick={() => { toggleArr('diveCerts', certSearch.trim()); setCertSearch('') }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.4)', background: 'rgba(243,239,230,.1)', color: '#f3efe6', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>+ Add &ldquo;{certSearch.trim()}&rdquo;</button>
 )}
 </div>
 )}
 {isInstructor && (
 <div style={{ marginTop: '12px', padding: '12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(243,239,230,.04)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Authorized to teach</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{TEACH_CERTS.map(tc => chip(tc, p.teachCerts.includes(tc), () => toggleArr('teachCerts', tc), '#f3efe6'))}</div>
 </div>
 )}
 {isDivemaster && (
 <div style={{ marginTop: '12px', padding: '12px', borderRadius: 0, border: '1px solid rgba(243,239,230,0.20)', background: 'rgba(243,239,230,0.04)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#c9c2b6', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Can assist with</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{ASSIST_CERTS.map(ac => chip(ac, p.assistCerts.includes(ac), () => toggleArr('assistCerts', ac), '#c9c2b6'))}</div>
 </div>
 )}
 </div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Qualifications and Skills</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{QUALS.map(q => chip(q, p.quals.includes(q), () => toggleArr('quals', q)))}</div>
 </div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Languages</div>
 {p.langs.length > 0 && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
 {p.langs.map((code: string) => {
 const found = ALL_LANGS.find(([,c]) => c === code)
 return found ? (
 <button key={code} onClick={() => toggleArr('langs', code)} style={{ padding: '5px 11px', borderRadius: 0, border: '1px solid rgba(201,180,138,.5)', background: 'rgba(201,180,138,.15)', color: '#c9b48a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{found[0]} {code} ×</button>
 ) : null
 })}
 </div>
 )}
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Quick add</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
 {commonLangs.filter(([,c]) => !p.langs.includes(c)).map(([flag,code]) => (
 <button key={code} onClick={() => toggleArr('langs', code)} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(201,180,138,.25)', background: 'transparent', color: '#c9b48a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{flag} {code}</button>
 ))}
 </div>
 <input value={langSearch} onChange={e => setLangSearch(e.target.value)} placeholder="Search languages..." style={{ width: '100%', padding: '8px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', boxSizing: 'border-box', marginBottom: langSearch ? '8px' : '0' }} />
 {langSearch && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '120px', overflowY: 'auto', marginTop: '8px' }}>
 {filteredLangs.filter(([,c]) => !p.langs.includes(c)).map(([flag,code,name]) => (
 <button key={code} onClick={() => { toggleArr('langs', code); setLangSearch('') }} style={{ padding: '4px 10px', borderRadius: 0, border: '1px solid rgba(201,180,138,.25)', background: 'transparent', color: '#c9b48a', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{flag} {code} · {name}</button>
 ))}
 {filteredLangs.filter(([,c]) => !p.langs.includes(c)).length === 0 && <span style={{ fontSize: '14px', color: s.muted }}>No results</span>}
 </div>
 )}
 </div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Availability</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>{AVAIL_DAYS.map(d => chip(d, p.availDays.includes(d), () => toggleArr('availDays', d), '#c9c2b6'))}</div>
 <input value={p.availNote} onChange={e => set('availNote', e.target.value)} placeholder="Note (e.g. mornings only, Mon-Fri, etc.)" style={{ width: '100%', padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 </div>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '4px' }}>Profile Photo <span style={{ fontWeight: 400, fontSize: '14px' }}>(WebP 600×600 recommended)</span></div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '8px' }}>
 Prepare your photo at{' '}
 <a href="https://squoosh.app/" target="_blank" rel="noopener noreferrer" style={{ color: s.accent, textDecoration: 'none', fontWeight: 500 }}>squoosh.app</a>
 {' '}— resize to 600×600 and choose <strong style={{ color: s.text }}>WebP</strong> format before uploading. The new photo replaces the existing one automatically.
 </div>
 <label style={{ display: 'block', cursor: 'pointer' }}>
 <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => set('photoUrl', ev.target?.result as string); r.readAsDataURL(f) }} style={{ display: 'none' }} />
 <div style={{ padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.muted, fontSize: '14px', textAlign: 'center', cursor: 'pointer' }}>
 {p.photoUrl ? ' Change photo' : ' Upload photo (WebP / PNG / JPEG)'}
 </div>
 </label>
 {p.photoUrl && <img src={p.photoUrl} alt="" style={{ marginTop: '10px', width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(243,239,230,.3)' }} />}
 </div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Contract</div>
 <label style={{ display: 'block', cursor: 'pointer' }}>
 <input type="file" accept=".pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (!f) return; set('contractFile', f.name) }} style={{ display: 'none' }} />
 <div style={{ padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.muted, fontSize: '14px', textAlign: 'center', cursor: 'pointer' }}>
 {p.contractFile ? p.contractFile : 'Upload contract (PDF / DOC)'}
 </div>
 </label>
 {p.contractFile && <div style={{ marginTop: '6px', fontSize: '14px', color: s.accent }}> {p.contractFile}</div>}
 </div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Notes</div>
 <textarea value={p.notes} onChange={e => set('notes', e.target.value)} rows={4} placeholder="Internal notes..." style={{ width: '100%', padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
 </div>
 {/* SSI Matrix - editable by admin */}
 {(() => {
 const cols = Object.keys(SSI_COL_LABELS)
 const levelColor: Record<string,string> = { ait:'#c9b48a', dmi:'#c9c2b6', owi:'#f3efe6', dg:'#b7c4b0' }
 const matR = p.matrixR || {}
 const matA = p.matrixA || {}
 const toggleR = (k: string) => set('matrixR', { ...matR, [k]: matR[k] ? 0 : 1 })
 const toggleA = (k: string) => set('matrixA', { ...matA, [k]: matA[k] ? 0 : 1 })
 return (
 <div style={{ padding: '14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.18)', background: 'rgba(243,239,230,.03)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '10px' }}>SSI Matrix</div>
 <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
 <input value={p.ssiPro || ''} onChange={e => set('ssiPro', e.target.value)} placeholder="SSI Pro #" style={{ flex: 1, minWidth: '90px', padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none' }} />
 <input value={p.ssiMid || ''} onChange={e => set('ssiMid', e.target.value)} placeholder="MID" style={{ flex: 1, minWidth: '80px', padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none' }} />
 <input value={p.ssiPaidUntil || ''} onChange={e => set('ssiPaidUntil', e.target.value)} placeholder="Paid until" style={{ flex: 1, minWidth: '90px', padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none' }} />
 </div>
 <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
 <select value={p.ssiLevel || ''} onChange={e => set('ssiLevel', e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: p.ssiLevel ? (levelColor[p.ssiLevel] || s.text) : s.muted, fontSize: '14px', fontFamily: s.font, outline: 'none' }}>
 <option value="">— Level —</option>
 <option value="dg">Dive Guide</option>
 <option value="owi">OWI</option>
 <option value="dmi">DMI</option>
 <option value="ait">AIT</option>
 </select>
 <select value={p.ssiTeaching || ''} onChange={e => set('ssiTeaching', e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none' }}>
 <option value="">— Status —</option>
 <option value="active">Active Teaching</option>
 <option value="non">Non-Teaching</option>
 </select>
 </div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#f3efe6', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Can Teach (R) — click to toggle</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
 {cols.map(k => {
 const on = !!matR[k]
 return (
 <button key={k} onClick={() => toggleR(k)} style={{ fontSize: '14px', padding: '3px 8px', borderRadius: 0, fontWeight: 500, cursor: 'pointer', fontFamily: s.font, border: `1px solid ${on ? 'rgba(243,239,230,.4)' : 'rgba(255,255,255,.1)'}`, background: on ? 'rgba(243,239,230,.18)' : 'rgba(255,255,255,.03)', color: on ? '#f3efe6' : 'rgba(255,255,255,.25)', transition: 'all .12s' }}>
 {on ? ' ' : ''}{SSI_COL_LABELS[k]}
 </button>
 )
 })}
 </div>
 {(p.ssiLevel === 'dg' || p.matrixA) && (
 <>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#d4a07a', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: '10px', marginBottom: '6px' }}>Can Assist (A) — Dive Guide row</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
 {cols.map(k => {
 const on = !!matA[k]
 return (
 <button key={k} onClick={() => toggleA(k)} style={{ fontSize: '14px', padding: '3px 8px', borderRadius: 0, fontWeight: 500, cursor: 'pointer', fontFamily: s.font, border: `1px solid ${on ? 'rgba(212,160,122,.4)' : 'rgba(255,255,255,.1)'}`, background: on ? 'rgba(212,160,122,.18)' : 'rgba(255,255,255,.03)', color: on ? '#d4a07a' : 'rgba(255,255,255,.25)', transition: 'all .12s' }}>
 {on ? ' ' : ''}{SSI_COL_LABELS[k]}
 </button>
 )
 })}
 </div>
 </>
 )}
 </div>
 )
 })()}
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Visibility on Team Page</div>
 <button onClick={() => set('isPublic', !p.isPublic)} style={{ padding: '8px 16px', borderRadius: 0, border: `1px solid ${p.isPublic ? 'rgba(183,196,176,.4)' : 'rgba(255,255,255,.15)'}`, background: p.isPublic ? 'rgba(183,196,176,.1)' : 'transparent', color: p.isPublic ? '#b7c4b0' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {p.isPublic ? 'Public' : 'Internal'}
 </button>
 </div>
 {/* Email + Company — sits above invite section */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Email</div>
 <div style={{ display: 'flex', gap: '8px' }}>
 <input value={p.email} onChange={e => set('email', e.target.value)} type="email" placeholder="Email" style={{ flex: 1, padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 <select value={p.company || 'azd'} onChange={e => set('company', e.target.value)} style={{ padding: '7px 10px', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)', background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none' }}>
 <option value="azd">AZD</option>
 <option value="sc">Season Challenge</option>
 <option value="both">Both</option>
 </select>
 </div>
 </div>
 {/* Daten-Zugriff: Sandbox (nur Testdaten) oder Production (folgt dem globalen Sandbox/Production-Schalter wie ein Admin). Aenderung nur durch Admin (DB-Trigger erzwingt das). */}
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Data access</div>
 <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
 {(['sandbox', 'production'] as const).map(m => {
 const on = (p.dataAccess === 'production' ? 'production' : 'sandbox') === m
 return (
 <button key={m} type="button" onClick={() => set('dataAccess', m)} style={{ padding: '8px 16px', borderRadius: 0, border: on ? `1px solid ${m === 'production' ? 'rgba(255,128,128,.7)' : 'rgba(201,180,138,.7)'}` : '1px solid rgba(255,255,255,.15)', background: on ? (m === 'production' ? 'rgba(255,96,96,.14)' : 'rgba(201,180,138,.14)') : 'transparent', color: on ? (m === 'production' ? '#ff9a9a' : '#c9b48a') : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>
 {m === 'production' ? ' Production' : ' Sandbox'}
 </button>
 )
 })}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '6px', lineHeight: 1.5 }}>
 {p.role === 'admin'
 ? 'Admins always see both and follow the global Sandbox/Production switch.'
 : (p.dataAccess === 'production'
 ? 'Sees real bookings, guests and tickets (follows the global Sandbox/Production switch). Can also take live payments, create bookings, approve requests and send payment links. Refunds and the global switch stay admin-only.'
 : 'Sees test data only, whatever the global switch says.')}
 </div>
 </div>
 {profileIsNew && (
 <div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '4px' }}>Initial password <span style={{ opacity: .6 }}>(min. 8 chars — staff changes after first login)</span></div>
 <input type="password" placeholder="Set initial password (optional)" value={initPassword} onChange={e => setInitPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 0, border: `1px solid ${initPassword.length > 0 && initPassword.length < 8 ? 'rgba(201,146,140,.5)' : 'rgba(243,239,230,.2)'}`, background: 'rgba(255,255,255,.04)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', boxSizing: 'border-box' }} />
 {initPassword.length > 0 && initPassword.length < 8 && <div style={{ fontSize: '14px', color: '#c9928c', marginTop: '3px' }}>Password too short</div>}
 {createStatus === 'error' && <div style={{ fontSize: '14px', color: '#c9928c', marginTop: '3px' }}> {createError}</div>}
 </div>
 )}
 </div>
 <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '8px' }}>
 <button onClick={() => saveProfile(p)} style={{ flex: 1, padding: '12px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Save</button>
 {!profileIsNew && p.email && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
 <select value={inviteRole || p.role || 'staff'} onChange={e => setInviteRole(e.target.value)} style={{ padding: '10px 8px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'rgba(255,255,255,.05)', color: s.accent, fontSize: '14px', fontFamily: s.font, outline: 'none', cursor: 'pointer' }}>
 <option value="staff">Staff</option>
 <option value="front_office">Front Office</option>
 <option value="admin">Admin</option>
 </select>
 <input
 type="password"
 value={initPassword}
 onChange={e => { setInitPassword(e.target.value); setInviteStatus('idle'); setInviteError('') }}
 placeholder="Initial password"
 style={{ padding: '10px 12px', borderRadius: 0, border: `1px solid ${inviteStatus === 'error' ? 'rgba(201,146,140,.5)' : 'rgba(243,239,230,.25)'}`, background: 'rgba(255,255,255,.05)', color: s.text, fontSize: '14px', fontFamily: s.font, outline: 'none', width: '140px' }}
 />
 <button onClick={() => { setInviteStatus('idle'); setInviteError(''); sendInvite({ ...p, role: inviteRole || p.role || 'staff' }) }} disabled={inviteStatus === 'sending'} style={{ padding: '12px 14px', borderRadius: 0, border: `1px solid ${inviteStatus === 'sent' ? 'rgba(183,196,176,.4)' : inviteStatus === 'error' ? 'rgba(201,146,140,.4)' : 'rgba(243,239,230,.35)'}`, background: inviteStatus === 'sent' ? 'rgba(183,196,176,.12)' : inviteStatus === 'error' ? 'rgba(201,146,140,.1)' : 'transparent', color: inviteStatus === 'sent' ? '#b7c4b0' : inviteStatus === 'error' ? '#c9928c' : s.accent, fontSize: '14px', fontWeight: 500, cursor: inviteStatus === 'sending' ? 'wait' : 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>
 {inviteStatus === 'sending' ? '…' : inviteStatus === 'sent' ? ' Account + Email gesendet' : inviteStatus === 'error' ? ' Error' : ' Create & Invite'}
 </button>
 </div>
 {inviteStatus === 'error' && inviteError && (
 <div style={{ fontSize: '14px', color: '#c9928c', paddingLeft: '2px' }}>{inviteError}</div>
 )}
 {inviteStatus === 'idle' && (
 <div style={{ fontSize: '14px', color: s.muted, paddingLeft: '2px', opacity: .7 }}>Erstellt Account mit Passwort + sendet Login-Email an Staff</div>
 )}
 </div>
 )}
 <button onClick={() => { setProfileEdit(null); setLangSearch(''); setCertSearch(''); setInviteStatus('idle'); setInviteError(''); setInviteRole(''); setMagicInviteStatus('idle'); setMagicInviteError('') }} style={{ padding: '12px 18px', borderRadius: 0, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>Cancel</button>
 </div>
 </div>
 </div>
 </div>
 </div>
 )
 }

 return (
 <div style={{ background: '#000', minHeight: '100vh', padding: '24px 16px' }}>
 <div style={{ maxWidth: '1320px', margin: '0 auto' }}>
 <div style={{ marginBottom: '24px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Members Area</div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
 <button onClick={() => nav('dashboard')} style={{ padding: '6px 14px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>&#8592; Dashboard</button>
 <h1 style={{ fontSize: '26px', fontWeight: 500, color: s.text, margin: 0 }}>Staff</h1>
 </div>
 <button onClick={() => { setProfileEdit(newProfile()); setProfileIsNew(true) }} style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>+ New Profile</button>
 </div>
 <p style={{ fontSize: '14px', color: s.muted, marginTop: '6px' }}>Qualifications, contact details, availability and contracts for the whole team.</p>
 </div>
 {profiles.length === 0 && (
 <div style={{ textAlign: 'center', padding: '80px 20px', color: s.muted, fontSize: '15px' }}>
 No profiles yet.<br />
 <button onClick={() => { setProfileEdit(newProfile()); setProfileIsNew(true) }} style={{ marginTop: '16px', padding: '10px 22px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'transparent', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Add first profile</button>
 </div>
 )}
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
 {[...profiles].sort((a,b) => (a.name||'').localeCompare(b.name||'')).map((p: any) => (
 <div key={p.id} style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '18px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
 {p.photoUrl ? <img src={p.photoUrl} alt={p.name} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(243,239,230,.3)' }} /> : <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(243,239,230,.1)', border: '2px solid rgba(243,239,230,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>?</div>}
 <div>
 <div style={{ fontSize: '16px', fontWeight: 500, color: s.text }}>{p.name || '(no name)'}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{(p.diveCerts||[]).length > 0 && <span style={{ color: '#f3efe6', marginRight: '6px' }}>{p.diveCerts.join(' · ')}</span>}{p.email}</div>
 </div>
 <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 500, padding: '3px 8px', borderRadius: 0, background: p.isPublic ? 'rgba(183,196,176,.1)' : 'rgba(255,255,255,.07)', color: p.isPublic ? '#b7c4b0' : s.muted, border: `1px solid ${p.isPublic ? 'rgba(183,196,176,.3)' : 'rgba(255,255,255,.12)'}` }}>{p.isPublic ? 'Public' : 'Internal'}</span>
 </div>
 {p.quals.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>{p.quals.map((q: string) => <span key={q} style={{ fontSize: '14px', fontWeight: 500, padding: '2px 8px', borderRadius: 0, background: 'rgba(243,239,230,.1)', color: s.accent, border: '1px solid rgba(243,239,230,.2)' }}>{q}</span>)}</div>}
 {p.langs.length > 0 && <div style={{ fontSize: '14px', marginBottom: '8px' }}>{p.langs.map((l: string) => { const f = ALL_LANGS.find(([,c]) => c === l); return f ? f[0] : '' }).join(' ')}</div>}
 {p.availDays.length > 0 && <div style={{ fontSize: '14px', color: s.muted, marginBottom: '10px' }}>{p.availDays.join(', ')}{p.availNote ? ` - ${p.availNote}` : ''}</div>}
 <div style={{ display: 'flex', gap: '8px' }}>
 <button onClick={() => { setProfileEdit(p); setProfileIsNew(false); setInviteStatus('idle'); setInviteError(''); setInviteRole('') }} style={{ flex: 1, padding: '7px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'transparent', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Edit</button>
 {delConfirm !== null && delConfirm.id === p.id ? (
 <div style={{ display: 'flex', gap: '6px' }}>
 {delConfirm.step === 1 && <button onClick={() => setDelConfirm({ id: p.id, step: 2 })} style={{ padding: '7px 12px', borderRadius: 0, border: '1px solid rgba(201,146,140,.4)', background: 'rgba(201,146,140,.1)', color: '#c9928c', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Sure?</button>}
 {delConfirm.step === 2 && <button onClick={async () => { await supabase.from('profiles').delete().eq('id', p.id); setProfiles((prev: any[]) => prev.filter((x: any) => x.id !== p.id)); setDelConfirm(null) }} style={{ padding: '7px 12px', borderRadius: 0, border: '1px solid rgba(201,146,140,.6)', background: 'rgba(201,146,140,.18)', color: '#c9928c', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Delete permanently</button>}
 <button onClick={() => setDelConfirm(null)} style={{ padding: '7px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer', fontFamily: s.font }}>x</button>
 </div>
 ) : (
 <button onClick={() => setDelConfirm({ id: p.id, step: 1 })} style={{ padding: '7px 12px', borderRadius: 0, border: '1px solid rgba(201,146,140,.25)', background: 'transparent', color: '#c9928c', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Del</button>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 )
}

// ── Members-Theme (hell/dunkel) ───────────────────────────────────────────────
// Die Members-Oberfläche ist komplett inline im Dark-Design gebaut. Der helle Modus invertiert die Seite per CSS-Filter
// (Bilder/Videos werden zurück-invertiert). Gilt für den ganzen Members-Bereich, gespeichert pro Gerät/Browser.
const THEME_KEY = 'azd_members_theme'
const THEME_CLASS = 'azd-members-light'
const THEME_STYLE_ID = 'azd-members-theme-css'
function getMembersTheme(): 'dark' | 'light' {
 try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}
function applyMembersTheme(theme: 'dark' | 'light') {
 if (typeof document === 'undefined') return
 if (!document.getElementById(THEME_STYLE_ID)) {
 const st = document.createElement('style')
 st.id = THEME_STYLE_ID
 st.textContent = `html.${THEME_CLASS}{filter:invert(.94) hue-rotate(180deg) saturate(.5) contrast(1.12) brightness(.97);background:#fff}` +
 `html.${THEME_CLASS} img,html.${THEME_CLASS} video,html.${THEME_CLASS} iframe,html.${THEME_CLASS} canvas,html.${THEME_CLASS} [data-keep-colors]{filter:invert(1) hue-rotate(180deg) saturate(2.2)}`
 document.head.appendChild(st)
 }
 document.documentElement.classList.toggle(THEME_CLASS, theme === 'light')
}
// Textgröße (Seiten-Zoom) für den Members-Bereich, pro Gerät. Standard = Normal (kein Zoom); die kleinen Labels sind separat vergrößert.
const ZOOM_KEY = 'azd_members_zoom'
const ZOOM_CHOICES: { label: string; v: number }[] = [{ label: 'Normal', v: 1 }, { label: 'Large', v: 1.08 }, { label: 'Extra large', v: 1.18 }]
function getMembersZoom(): number {
 try { const v = parseFloat(localStorage.getItem(ZOOM_KEY) ?? ''); return ZOOM_CHOICES.some(c => c.v === v) ? v : 1 } catch { return 1 }
}
function applyMembersZoom(v: number) {
 if (typeof document === 'undefined') return
 ;(document.documentElement.style as any).zoom = v === 1 ? '' : String(v)
}
function setMembersZoom(v: number) {
 try { localStorage.setItem(ZOOM_KEY, String(v)) } catch { /* nur diese Sitzung */ }
 applyMembersZoom(v)
}
function setMembersTheme(theme: 'dark' | 'light') {
 try { localStorage.setItem(THEME_KEY, theme) } catch { /* privater Modus: gilt nur für diese Sitzung */ }
 applyMembersTheme(theme)
}

function PageMyProfile({ session, nav, isRecovery, onRecoveryDone }: { session: any; nav: (p: any) => void; isRecovery?: boolean; onRecoveryDone?: () => void }) {
 const [profile, setProfile] = useState<any>(null)
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [resetSent, setResetSent] = useState(false)
 const [resetError, setResetError] = useState('')
 const [saved, setSaved] = useState(false)
 const [newPassword, setNewPassword] = useState('')
 const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
 const [pwSetStatus, setPwSetStatus] = useState<'idle'|'saving'|'done'|'error'>('idle')
 const [pwSetError, setPwSetError] = useState('')
 const [theme, setTheme] = useState<'dark' | 'light'>(() => getMembersTheme())
 const [zoom, setZoom] = useState<number>(() => getMembersZoom())
 const email = session?.user?.email || ''

 const levelColor: Record<string,string> = { ait:'#c9b48a', dmi:'#c9c2b6', owi:'#f3efe6', dg:'#b7c4b0' }
 const accent = '#f3efe6', muted = '#c9c2b6', text = '#f3efe6', bg = '#090909', font = "var(--font-geist-sans), sans-serif"

 useEffect(() => {
 if (!email) { setLoading(false); return }
 supabase.from('profiles').select('*').eq('email', email).maybeSingle()
 .then(({ data }: any) => {
 if (data) {
 const q = data.qualifications || {}
 setProfile({
 id: data.id, name: data.name || '', email: data.email || '', phone: data.phone || '',
 role: data.role || 'staff', photoUrl: data.avatar_url || '',
 langs: data.langs || [], availDays: data.avail_days || [], availNote: data.avail_note || '',
 diveCerts: data.dive_certs || [],
 ssiPro: q.ssi_pro || '', ssiMid: q.ssi_mid || '',
 ssiLevel: q.ssi_level || '', ssiLevelLabel: q.ssi_level_label || '',
 ssiTeaching: q.ssi_teaching || '', ssiPaidUntil: q.ssi_paid_until || '',
 matrixR: q.matrix_r || null, matrixA: q.matrix_a || null,
 })
 }
 setLoading(false)
 })
 }, [email])

 const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
 const f = e.target.files?.[0]
 if (!f || !profile) return
 const reader = new FileReader()
 reader.onload = async (ev) => {
 const dataUrl = ev.target?.result as string
 setProfile((prev: any) => ({ ...prev, photoUrl: dataUrl }))
 setSaving(true)
 await supabase.from('profiles').update({ avatar_url: dataUrl, updated_at: new Date().toISOString() }).eq('email', email)
 setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
 }
 reader.readAsDataURL(f)
 }

 const handlePasswordReset = async () => {
 setResetError('')
 // Use plain @supabase/supabase-js (implicit flow) — createBrowserClient hardcodes PKCE
 // which stores the verifier in cookies and breaks in incognito or different browsers.
 const plainClient = createRawSupabaseClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 )
 const { error } = await plainClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/dive-os/my-profile?mode=recovery' })
 if (error) { setResetError(error.message); return }
 setResetSent(true)
 }

 const handleSetNewPassword = async () => {
 setPwSetError('')
 if (!newPassword || newPassword.length < 8) { setPwSetError('Password must be at least 8 characters.'); return }
 if (newPassword !== newPasswordConfirm) { setPwSetError('Passwords do not match.'); return }
 setPwSetStatus('saving')
 const { error } = await supabase.auth.updateUser({ password: newPassword })
 if (error) { setPwSetError(error.message); setPwSetStatus('error'); return }
 setPwSetStatus('done')
 setTimeout(() => { onRecoveryDone?.(); nav('home') }, 2000)
 }

 if (isRecovery) return (
 <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: font }}>
 <div style={{ maxWidth: '420px', width: '100%' }}>
 <div style={{ textAlign: 'center', marginBottom: '32px' }}>
 <div style={{ fontSize: '40px', marginBottom: '12px' }}></div>
 <h1 style={{ fontSize: '22px', fontWeight: 500, color: text, margin: 0 }}>Set New Password</h1>
 <p style={{ color: muted, fontSize: '14px', marginTop: '8px' }}>Choose a new password for your account.</p>
 </div>
 {pwSetStatus === 'done' ? (
 <div style={{ textAlign: 'center', padding: '24px', borderRadius: 0, border: '1px solid rgba(183,196,176,.3)', background: 'rgba(183,196,176,.06)', color: '#b7c4b0', fontWeight: 500, fontSize: '15px' }}>
 Password updated — redirecting…
 </div>
 ) : (
 <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(243,239,230,.18)', borderRadius: 0, padding: '28px' }}>
 <div style={{ marginBottom: '16px' }}>
 <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>New Password</label>
 <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="min. 8 characters" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'rgba(243,239,230,.04)', color: text, fontSize: '14px', fontFamily: font, outline: 'none' }} />
 </div>
 <div style={{ marginBottom: '20px' }}>
 <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Confirm Password</label>
 <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} placeholder="repeat password" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)', background: 'rgba(243,239,230,.04)', color: text, fontSize: '14px', fontFamily: font, outline: 'none' }} />
 </div>
 {pwSetError && <div style={{ color: '#c9928c', fontSize: '14px', marginBottom: '14px' }}>{pwSetError}</div>}
 <button onClick={handleSetNewPassword} disabled={pwSetStatus === 'saving'} style={{ width: '100%', padding: '12px', borderRadius: 0, border: 'none', background: accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: font, opacity: pwSetStatus === 'saving' ? 0.7 : 1 }}>
 {pwSetStatus === 'saving' ? 'Saving…' : 'Set New Password'}
 </button>
 </div>
 )}
 </div>
 </div>
 )

 if (loading) return <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, fontFamily: font }}>Loading…</div>

 if (!profile) return (
 <div style={{ background: bg, minHeight: '100vh', padding: '48px 24px', fontFamily: font }}>
 <div style={{ maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
 <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
 <h2 style={{ color: text, fontSize: '20px', fontWeight: 500, marginBottom: '10px' }}>Profile not linked</h2>
 <p style={{ color: muted, fontSize: '14px', lineHeight: 1.6 }}>Your account ({email}) is not yet linked to a staff profile. Ask your admin to add your email address to your profile card.</p>
 <div style={{ marginTop: '24px', padding: '16px', borderRadius: 0, border: '1px solid rgba(243,239,230,.15)', background: 'rgba(243,239,230,.04)' }}>
 {resetSent
 ? <div style={{ color: '#b7c4b0', fontWeight: 500 }}> Reset email sent to {email}</div>
 : <button onClick={handlePasswordReset} style={{ padding: '10px 22px', borderRadius: 0, border: '1px solid rgba(243,239,230,.3)', background: 'transparent', color: accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: font }}>Send password reset email</button>
 }
 </div>
 </div>
 </div>
 )

 const cols = Object.keys(SSI_COL_LABELS)
 const LANG_FLAGS: Record<string,string> = { PT:'\u{1F1F5}\u{1F1F9}',EN:'\u{1F1EC}\u{1F1E7}',DE:'\u{1F1E9}\u{1F1EA}',FR:'\u{1F1EB}\u{1F1F7}',ES:'\u{1F1EA}\u{1F1F8}',IT:'\u{1F1EE}\u{1F1F9}',NL:'\u{1F1F3}\u{1F1F1}',RU:'\u{1F1F7}\u{1F1FA}',ZH:'\u{1F1E8}\u{1F1F3}',AR:'\u{1F1F8}\u{1F1E6}' }

 return (
 <div style={{ background: bg, minHeight: '100vh', padding: '24px 16px', fontFamily: font }}>
 <div style={{ maxWidth: '640px', margin: '0 auto' }}>
 <div style={{ marginBottom: '28px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: muted, marginBottom: '6px' }}>Members Area</div>
 <h1 style={{ fontSize: '24px', fontWeight: 500, color: text, margin: 0 }}>My Profile</h1>
 <div style={{ fontSize: '14px', color: muted, marginTop: '4px' }}>{email}</div>
 </div>

 {/* Appearance — gilt für den gesamten Members-Bereich */}
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.18)', borderRadius: 0, padding: '18px 24px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: text }}>Appearance</div>
 <div style={{ fontSize: '14px', color: muted, marginTop: '3px' }}>Dark or light display for the whole members area. Saved on this device.</div>
 </div>
 <div role="group" aria-label="Theme" style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,.05)', borderRadius: 0, padding: '4px' }}>
 {(['dark', 'light'] as const).map(t => (
 <button key={t} type="button" aria-pressed={theme === t} onClick={() => { setTheme(t); setMembersTheme(t) }}
 style={{ padding: '7px 16px', borderRadius: 0, border: 'none', cursor: 'pointer', fontFamily: font, fontSize: '14px', fontWeight: 500, background: theme === t ? 'rgba(243,239,230,.18)' : 'transparent', color: theme === t ? accent : muted }}>
 {t === 'dark' ? ' Dark' : ' Light'}
 </button>
 ))}
 </div>
 </div>

 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.18)', borderRadius: 0, padding: '18px 24px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: text }}>Text size</div>
 <div style={{ fontSize: '14px', color: muted, marginTop: '3px' }}>Makes everything in the members area bigger. Saved on this device.</div>
 </div>
 <div role="group" aria-label="Text size" style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,.05)', borderRadius: 0, padding: '4px' }}>
 {ZOOM_CHOICES.map(c => (
 <button key={c.v} type="button" aria-pressed={zoom === c.v} onClick={() => { setZoom(c.v); setMembersZoom(c.v) }}
 style={{ padding: '7px 16px', borderRadius: 0, border: 'none', cursor: 'pointer', fontFamily: font, fontSize: '14px', fontWeight: 500, background: zoom === c.v ? 'rgba(243,239,230,.18)' : 'transparent', color: zoom === c.v ? accent : muted }}>
 {c.label}
 </button>
 ))}
 </div>
 </div>

 {/* Profile card */}
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.18)', borderRadius: 0, padding: '24px', marginBottom: '20px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '20px' }}>
 {profile.photoUrl
 ? <img src={profile.photoUrl} alt={profile.name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(243,239,230,.4)', flexShrink: 0 }} />
 : <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(243,239,230,.08)', border: '2px solid rgba(243,239,230,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px', flexShrink: 0 }}></div>
 }
 <div>
 <div style={{ fontSize: '22px', fontWeight: 500, color: text }}>{profile.name}</div>
 {profile.ssiLevel && <span style={{ fontSize: '14px', fontWeight: 500, color: levelColor[profile.ssiLevel] || muted, background: `${levelColor[profile.ssiLevel] || muted}18`, padding: '2px 10px', borderRadius: 0, border: `1px solid ${levelColor[profile.ssiLevel] || muted}33`, display: 'inline-block', marginTop: '4px' }}>{profile.ssiLevelLabel || profile.ssiLevel.toUpperCase()}</span>}
 {profile.ssiTeaching === 'active' && <span style={{ fontSize: '14px', color: '#b7c4b0', fontWeight: 500, marginLeft: '8px' }}> Active</span>}
 {profile.ssiTeaching === 'non' && <span style={{ fontSize: '14px', color: '#c9928c', fontWeight: 500, marginLeft: '8px' }}> Non-Teaching</span>}
 </div>
 </div>
 {profile.langs.length > 0 && <div style={{ fontSize: '14px', marginBottom: '8px' }}>{profile.langs.map((c: string) => (LANG_FLAGS[c] || '') + ' ' + c).join(' ')}</div>}
 {profile.availDays.length > 0 && <div style={{ fontSize: '14px', color: muted, marginBottom: '16px' }}> {profile.availDays.join(', ')}{profile.availNote ? ` — ${profile.availNote}` : ''}</div>}
 {profile.diveCerts.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' }}>{profile.diveCerts.map((c: string) => <span key={c} style={{ fontSize: '14px', fontWeight: 500, padding: '2px 8px', borderRadius: 0, background: 'rgba(243,239,230,.1)', color: accent, border: '1px solid rgba(243,239,230,.2)' }}>{c}</span>)}</div>}

 {/* Photo upload */}
 <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Profile Photo</div>
 <div style={{ fontSize: '14px', color: muted, marginBottom: '10px', lineHeight: 1.6 }}>
 Prepare at <a href="https://squoosh.app/" target="_blank" rel="noopener noreferrer" style={{ color: accent, fontWeight: 500, textDecoration: 'none' }}>squoosh.app</a> — resize to <strong style={{ color: text }}>600×600</strong> and choose <strong style={{ color: text }}>WebP</strong>. Uploading automatically replaces your current photo.
 </div>
 <label style={{ display: 'block', cursor: 'pointer' }}>
 <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handlePhotoUpload} style={{ display: 'none' }} />
 <div style={{ padding: '10px 14px', borderRadius: 0, border: `1px solid rgba(243,239,230,.3)`, background: saving ? 'rgba(243,239,230,.04)' : saved ? 'rgba(183,196,176,.08)' : 'rgba(243,239,230,.06)', color: saved ? '#b7c4b0' : accent, fontSize: '14px', fontWeight: 500, textAlign: 'center', cursor: 'pointer', transition: 'all .2s' }}>
 {saving ? ' Uploading…' : saved ? ' Photo saved!' : ' Upload new profile photo'}
 </div>
 </label>
 </div>
 </div>

 {/* SSI Matrix read-only */}
 {profile.ssiPro && (
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '20px', marginBottom: '20px' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: muted, letterSpacing: '.08em', textTransform: 'uppercase' }}>SSI Professional Matrix</div>
 <div style={{ fontSize: '14px', color: muted }}>Pro #{profile.ssiPro} · MID {profile.ssiMid}{profile.ssiPaidUntil ? ` · Paid ${profile.ssiPaidUntil}` : ''}</div>
 </div>
 {profile.matrixR && (
 <>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#f3efe6', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Can Teach (R)</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
 {cols.map(k => { const on = !!(profile.matrixR||{})[k]; return <span key={k} style={{ fontSize: '14px', padding: '2px 8px', borderRadius: 0, fontWeight: 500, background: on ? 'rgba(243,239,230,.15)' : 'rgba(255,255,255,.04)', color: on ? '#f3efe6' : 'rgba(255,255,255,.18)', border: `1px solid ${on ? 'rgba(243,239,230,.35)' : 'rgba(255,255,255,.07)'}` }}>{on ? ' ' : ''}{SSI_COL_LABELS[k]}</span> })}
 </div>
 </>
 )}
 {profile.matrixA && (
 <>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#d4a07a', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Can Assist (A)</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
 {cols.map(k => { const on = !!(profile.matrixA||{})[k]; return <span key={k} style={{ fontSize: '14px', padding: '2px 8px', borderRadius: 0, fontWeight: 500, background: on ? 'rgba(212,160,122,.15)' : 'rgba(255,255,255,.04)', color: on ? '#d4a07a' : 'rgba(255,255,255,.18)', border: `1px solid ${on ? 'rgba(212,160,122,.35)' : 'rgba(255,255,255,.07)'}` }}>{on ? ' ' : ''}{SSI_COL_LABELS[k]}</span> })}
 </div>
 </>
 )}
 </div>
 )}

 {/* Password reset */}
 <div style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Account Security</div>
 <div style={{ fontSize: '14px', color: muted, marginBottom: '14px' }}>Request a password reset link sent to <strong style={{ color: text }}>{email}</strong></div>
 {resetSent
 ? <div style={{ padding: '12px 18px', borderRadius: 0, background: 'rgba(183,196,176,.1)', border: '1px solid rgba(183,196,176,.3)', color: '#b7c4b0', fontSize: '14px', fontWeight: 500 }}> Reset email sent — check your inbox</div>
 : <>
 <button onClick={handlePasswordReset} style={{ padding: '11px 22px', borderRadius: 0, border: '1px solid rgba(255,255,255,.18)', background: 'transparent', color: text, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: font }}>Request password reset</button>
 {resetError && <div style={{ marginTop: '10px', color: '#c9928c', fontSize: '14px' }}> {resetError}</div>}
 </>
 }
 </div>
 </div>
 </div>
 )
}

function PageKnowledgeBase() {
 const [activeSection, setActiveSection] = useState<'guide' | 'cancellation' | 'sops' | 'insurance' | 'brand' | 'bookings'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('azd_kbSection') as any) || 'guide' : 'guide'))
 const [guideHtml, setGuideHtml] = useState<string>('')
 useEffect(() => { fetch('/ticket-guide.html').then(r => r.text()).then(setGuideHtml).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
 const font = "var(--font-geist-sans), sans-serif"
 const accent = '#f3efe6'
 const muted = '#c9c2b6'
 const text = '#f3efe6'
 const bg = '#090909'
 const surface = '#121210'
 const border = 'rgba(243,239,230,.12)'

 const tabStyle = (active: boolean): React.CSSProperties => ({
 padding: '10px 14px', fontSize: '14px', fontWeight: 500, textAlign: 'left',
 border: 'none', background: active ? 'rgba(243,239,230,.1)' : 'transparent',
 cursor: 'pointer', fontFamily: font, borderRadius: 0,
 color: active ? accent : muted, transition: 'all .15s',
 })

 return (
 <div style={{ padding: '32px 48px 48px', fontFamily: font, color: text, background: bg, minHeight: '80vh', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', columnGap: '28px', alignItems: 'start' }}>
 {/* Header */}
 <div style={{ marginBottom: '28px', gridColumn: '1 / -1' }}>
 <h1 style={{ fontSize: '22px', fontWeight: 500, color: '#f3efe6', margin: 0, letterSpacing: '-0.02em' }}> Knowledge Base</h1>
 <p style={{ fontSize: '14px', color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>
 Team guides, policies, and standard operating procedures.
 </p>
 </div>

 {/* Section tabs */}
 <div style={{ gridColumn: 2, gridRow: '2 / span 40', position: 'sticky', top: '16px', display: 'flex', flexDirection: 'column', gap: '4px', background: surface, borderRadius: 0, padding: '6px', border: `1px solid ${border}` }}>
 <button style={tabStyle(activeSection === 'guide')} onClick={() => { setActiveSection('guide'); localStorage.setItem('azd_kbSection', 'guide') }}> Ticket Workflow Guide</button>
 <button style={tabStyle(activeSection === 'bookings')} onClick={() => { setActiveSection('bookings'); localStorage.setItem('azd_kbSection', 'bookings') }}> Bookings</button>
 <button style={tabStyle(activeSection === 'cancellation')} onClick={() => { setActiveSection('cancellation'); localStorage.setItem('azd_kbSection', 'cancellation') }}> Cancellation Policy</button>
 <button style={tabStyle(activeSection === 'insurance')} onClick={() => { setActiveSection('insurance'); localStorage.setItem('azd_kbSection', 'insurance') }}> DAN Insurance</button>
 <button style={tabStyle(activeSection === 'sops')} onClick={() => { setActiveSection('sops'); localStorage.setItem('azd_kbSection', 'sops') }}> SOPs</button>
 <button style={tabStyle(activeSection === 'brand')} onClick={() => { setActiveSection('brand'); localStorage.setItem('azd_kbSection', 'brand') }}> Brand Guidelines</button>
 </div>

 {/* Ticket Workflow Guide */}
 {activeSection === 'guide' && (
 <div style={{ borderRadius: 0, overflow: 'hidden', border: `1px solid ${border}` }}>
 {guideHtml ? (
 <iframe
 srcDoc={guideHtml}
 style={{ width: '100%', height: '82vh', border: 'none', display: 'block' }}
 title="Ticket Workflow Guide"
 sandbox="allow-scripts allow-same-origin"
 />
 ) : (
 <div style={{ height: '82vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, fontSize: '14px' }}>
 Loading guide…
 </div>
 )}
 </div>
 )}

 {/* Cancellation Policy */}
 {activeSection === 'cancellation' && (
 <div style={{ maxWidth: '760px' }}>
 <div style={{ background: surface, borderRadius: 0, border: `1px solid ${border}`, padding: '36px 40px' }}>
 <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#f3efe6', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Azores Diving — Cancellation Policy</h2>
 <p style={{ fontSize: '14px', color: muted, margin: '0 0 28px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Effective for all bookings</p>

 <Section title="Cancellations by the Customer">
 <PolicyItem label="More than 72 hours before the dive">Full refund or free reschedule.</PolicyItem>
 <PolicyItem label="48–72 hours before the dive">50% refund. Free reschedule subject to availability.</PolicyItem>
 <PolicyItem label="Less than 48 hours / No-show">No refund. Reschedule not guaranteed.</PolicyItem>
 </Section>

 <Section title="Cancellations due to Weather / Safety">
 <PolicyItem label="Cancelled by Azores Diving">Full refund or free reschedule, customer's choice.</PolicyItem>
 <PolicyItem label="Decision authority">The dive guide / boat captain has final authority on safety calls. No penalties apply to weather cancellations initiated by us.</PolicyItem>
 </Section>

 <Section title="Courses">
 <PolicyItem label="Theory / Pool sessions">Cancellation fees as above apply to the full course price.</PolicyItem>
 <PolicyItem label="Equipment & materials">Non-refundable once materials have been issued.</PolicyItem>
 </Section>

 <Section title="How to Cancel">
 <p style={{ fontSize: '14px', color: text, lineHeight: 1.7, margin: '0 0 8px' }}>
 Customers can cancel via: WhatsApp, email, or by opening a support ticket on our website. Cancellations must be confirmed by a staff member to be valid.
 </p>
 <p style={{ fontSize: '14px', color: text, lineHeight: 1.7, margin: 0 }}>
 Refunds are processed within 5–10 business days to the original payment method.
 </p>
 </Section>

 <div style={{ marginTop: '28px', padding: '14px 18px', background: 'rgba(255,208,80,.06)', border: '1px solid rgba(255,208,80,.18)', borderRadius: 0 }}>
 <p style={{ fontSize: '14px', color: 'rgba(255,208,80,.8)', margin: 0, lineHeight: 1.6 }}>
 <strong>Staff note:</strong> When a customer requests a cancellation via ticket, always log the outcome (refund issued / reschedule agreed) in the ticket notes before resolving.
 </p>
 </div>

 <p style={{ fontSize: '14px', color: muted, margin: '20px 0 0', lineHeight: 1.6 }}>
 This is an internal summary. The binding cancellation terms are published in the{' '}
 <a href="/terms" style={{ color: 'rgba(243,239,230,.7)', textDecoration: 'underline' }}>General Terms &amp; Conditions</a>.
 </p>
 </div>
 </div>
 )}

 {/* SOPs */}
 {/* DAN Insurance */}
 {activeSection === 'insurance' && (
 <div style={{ maxWidth: '820px' }}>
 <div style={{ background: surface, borderRadius: 0, border: `1px solid ${border}`, padding: '36px 40px' }}>
 <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#f3efe6', margin: '0 0 6px', letterSpacing: '-0.02em' }}>DAN Dive Insurance — How We Price It</h2>
 <p style={{ fontSize: '14px', color: muted, margin: '0 0 28px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Staff reference · September 2026</p>

 <Section title="Why the price isn't always &quot;days × €10&quot;">
 <p style={{ fontSize: '14px', color: text, lineHeight: 1.7, margin: 0 }}>
 Every diver needs insurance. Guests either bring their own policy or purchase a DAN Short Term policy through us at checkout. DAN offers multi-day plans (3-, 5-, 7-, 10-day) at a discount — but <strong style={{ color: '#f3efe6' }}>multi-day plans are only valid for consecutive calendar days.</strong> A 5-day plan cannot legally cover five scattered days across two weeks. Our system automatically splits the selected dive dates into consecutive blocks and picks the cheapest valid DAN plan for each block separately.
 </p>
 </Section>

 <Section title="How the algorithm works">
 {[
 { step: '1', label: 'Collect unique dive dates', desc: 'AM and PM on the same calendar date count as one dive day for insurance purposes. Duplicates are removed automatically.' },
 { step: '2', label: 'Group into consecutive blocks', desc: 'Dates are sorted and walked in order. Two dates belong to the same block only if they are exactly one calendar day apart. Any gap starts a new block.' },
 { step: '3', label: 'Pick the cheapest plan per block', desc: 'Each block gets the DAN plan that covers N consecutive days at the lowest per-diver cost.' },
 { step: '4', label: 'Sum across all blocks', desc: 'Total per diver = sum of (plan price × units) across all blocks. Multiply by group size for the grand total.' },
 ].map(({ step, label, desc }) => (
 <div key={step} style={{ display: 'flex', gap: '14px', padding: '12px 16px', background: 'rgba(255,255,255,.03)', borderRadius: 0, border: '1px solid rgba(255,255,255,.06)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: accent, minWidth: '20px', flexShrink: 0 }}>{step}</div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#f3efe6', marginBottom: '3px' }}>{label}</div>
 <div style={{ fontSize: '14px', color: '#c9c2b6', lineHeight: 1.6 }}>{desc}</div>
 </div>
 </div>
 ))}
 </Section>

 <Section title="Plan selection table">
 <div style={{ overflowX: 'auto' }}>
 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
 <thead>
 <tr style={{ borderBottom: '1px solid rgba(243,239,230,.2)' }}>
 {['Block size', 'Plan used', 'Guest price pp'].map(h => (
 <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: muted, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {[
 ['1 day', '1-Day × 1', '€10'],
 ['2 days', '1-Day × 2', '€20'],
 ['3 days', '3-Day × 1', '€23'],
 ['4–5 days', '5-Day × 1', '€30'],
 ['6–7 days', '7-Day × 1', '€38'],
 ['8–10 days', '10-Day × 1', '€48'],
 ].map(([size, plan, price]) => (
 <tr key={size} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
 <td style={{ padding: '9px 12px', color: '#f3efe6', fontWeight: 500 }}>{size}</td>
 <td style={{ padding: '9px 12px', color: '#c9c2b6' }}>{plan}</td>
 <td style={{ padding: '9px 12px', color: accent, fontWeight: 500 }}>{price}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </Section>

 <Section title="Example — 5 scattered dates (18, 20, 22, 23, 24 Sept)">
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {[
 { block: 'Block A · 18 Sept', plan: '1-Day × 1', price: '€10' },
 { block: 'Block B · 20 Sept', plan: '1-Day × 1', price: '€10' },
 { block: 'Block C · 22–24 Sept (consecutive)', plan: '3-Day × 1', price: '€23' },
 ].map(({ block, plan, price }) => (
 <div key={block} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 0, border: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap', gap: '8px' }}>
 <div>
 <span style={{ fontSize: '14px', fontWeight: 500, color: '#f3efe6' }}>{block}</span>
 <span style={{ fontSize: '14px', color: muted, marginLeft: '10px' }}>{plan}</span>
 </div>
 <span style={{ fontSize: '14px', fontWeight: 500, color: accent }}>{price}</span>
 </div>
 ))}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(243,239,230,.06)', borderRadius: 0, border: '1px solid rgba(243,239,230,.2)' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: '#f3efe6' }}>Total per diver</span>
 <span style={{ fontSize: '15px', fontWeight: 500, color: accent }}>€43</span>
 </div>
 </div>
 <p style={{ fontSize: '14px', color: muted, margin: '10px 0 0', lineHeight: 1.6 }}>
 The old system would have applied a 5-day plan at €30 — which was both cheaper than correct and non-compliant with DAN terms.
 </p>
 </Section>

 <Section title="If a guest disputes the price">
 {[
 'DAN multi-day plans legally require consecutive calendar days. We cannot issue a 5-day plan for five scattered dates — this would be a policy violation.',
 'Our system picks the cheapest valid option for each consecutive block automatically.',
 'The price shown at checkout is exactly what the server calculates and charges — no markup is added beyond the DAN plan rate.',
 'If the guest wants a lower per-day rate, they should book consecutive days — a 5-day plan at €30 beats 5 separate 1-day plans at €50.',
 'Insurance is non-refundable once issued. This is shown at checkout before payment.',
 ].map((item, i) => (
 <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 0, border: '1px solid rgba(255,255,255,.06)' }}>
 <span style={{ fontSize: '14px', color: accent, fontWeight: 500, flexShrink: 0 }}>•</span>
 <span style={{ fontSize: '14px', color: '#c9c2b6', lineHeight: 1.6 }}>{item}</span>
 </div>
 ))}
 </Section>

 <div style={{ marginTop: '8px', padding: '14px 18px', background: 'rgba(255,208,80,.06)', border: '1px solid rgba(255,208,80,.18)', borderRadius: 0 }}>
 <p style={{ fontSize: '14px', color: 'rgba(255,208,80,.8)', margin: 0, lineHeight: 1.6 }}>
 <strong>Staff note:</strong> The system stores the total insurance amount per booking, not the individual plan IDs. When DAN batch submission is activated, the system will re-run the same algorithm on the booking dates and submit the exact plans chosen (e.g. one 3-Day plan + one 1-Day plan) — not individual 1-Day entries. This ensures our DAN cost matches what was priced at checkout.
 </p>
 </div>
 </div>
 </div>
 )}

 {activeSection === 'brand' && <BrandGuidelines />}
 {activeSection === 'bookings' && <BookingTools />}

 {activeSection === 'sops' && (
 <div style={{ maxWidth: '760px' }}>
 <div style={{ background: surface, borderRadius: 0, border: `1px solid ${border}`, padding: '36px 40px', textAlign: 'center' }}>
 <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
 <h2 style={{ fontSize: '17px', fontWeight: 500, color: '#f3efe6', margin: '0 0 8px' }}>SOPs coming soon</h2>
 <p style={{ fontSize: '14px', color: muted, margin: 0, lineHeight: 1.6 }}>
 Standard operating procedures for front office, dive operations, equipment, and emergency protocols will be published here.
 </p>
 </div>
 </div>
 )}
 </div>
 )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
 return (
 <div style={{ marginBottom: '28px' }}>
 <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#f3efe6', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 14px' }}>{title}</h3>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{children}</div>
 </div>
 )
}

// ── Error Log (admin-only) ─────────────────────────────────────────────────────
const AREA_OPTIONS = ['', 'chk', 'pay', 'mail', 'dash', 'api']
const TIME_OPTIONS: { label: string; hours: number | null }[] = [
 { label: 'Last 7 days', hours: 7 * 24 },
 { label: 'Last 30 days', hours: 30 * 24 },
 { label: 'Last 90 days', hours: 90 * 24 },
 { label: 'All time', hours: null },
]
type ErrorEvent = { id: string; ref: string; area: string; message: string; http_status: number | null; context: Record<string, unknown>; created_at: string; is_test: boolean }

function PageErrorLog({ nav }: { nav: (p: MemberPage) => void }) {
 const isMobile = useIsMobile()
 const [rows, setRows] = useState<ErrorEvent[]>([])
 const [loading, setLoading] = useState(true)
 const [search, setSearch] = useState('')
 const [area, setArea] = useState('')
 const [timeIdx, setTimeIdx] = useState(0)
 const [expanded, setExpanded] = useState<string | null>(null)
 const { sandbox } = useSimulation()
 useEffect(() => {
 if (sandbox === null) return
 setLoading(true)
 let q = supabase.from('error_events').select('id,ref,area,message,http_status,context,created_at,is_test').order('created_at', { ascending: false }).limit(500)
 q = q.eq('is_test', sandbox) // Sandbox = nur Testfehler, Production = nur echte (folgt dem globalen Schalter)
 if (area) q = q.eq('area', area)
 const hours = TIME_OPTIONS[timeIdx]?.hours
 if (hours != null) q = q.gte('created_at', new Date(Date.now() - hours * 3600 * 1000).toISOString())
 q.then(({ data }) => { setRows((data ?? []) as ErrorEvent[]); setLoading(false) })
 }, [area, timeIdx, sandbox])

 const filtered = search.trim()
 ? rows.filter(r => r.ref.toLowerCase().includes(search.trim().toLowerCase()))
 : rows

 return (
 <div style={{ padding: isMobile ? '24px 16px' : '32px 48px', maxWidth: '1100px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
 <button type="button" onClick={() => nav('dashboard')} style={{ fontSize: '14px', color: s.accent, cursor: 'pointer', fontWeight: 500, background: 'none', border: 'none', padding: 0, fontFamily: s.font }}> Dashboard</button>
 <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 500, color: '#f3efe6' }}>Error Log</h2>
 </div>
 <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
 <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ref…" style={{ flex: '1 1 180px', minWidth: '140px', padding: '7px 12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#f3efe6', fontSize: '14px', fontFamily: s.font }} />
 <select value={area} onChange={e => setArea(e.target.value)} style={{ padding: '7px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(9,9,9,.9)', color: '#f3efe6', fontSize: '14px', fontFamily: s.font }}>
 {AREA_OPTIONS.map(a => <option key={a} value={a}>{a || 'All areas'}</option>)}
 </select>
 <select value={timeIdx} onChange={e => setTimeIdx(Number(e.target.value))} style={{ padding: '7px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(9,9,9,.9)', color: '#f3efe6', fontSize: '14px', fontFamily: s.font }}>
 {TIME_OPTIONS.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
 </select>
 </div>
 {loading ? <div style={{ color: s.muted, fontSize: '14px' }}>Loading…</div> : filtered.length === 0 ? <div style={{ color: s.muted, fontSize: '14px' }}>No errors found.</div> : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
 {filtered.map(r => (
 <div key={r.id} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '10px 14px', cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
 <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
 <code style={{ fontSize: '14px', fontWeight: 500, color: s.accent, letterSpacing: '.04em' }}>{r.ref}</code>
 <span style={{ fontSize: '14px', padding: '2px 8px', borderRadius: 0, background: 'rgba(255,255,255,.07)', color: s.muted }}>{r.area}</span>
 {r.http_status && <span style={{ fontSize: '14px', color: r.http_status >= 500 ? '#c9928c' : '#c9b48a' }}>{r.http_status}</span>}
 {r.is_test && <span style={{ fontSize: '14px', padding: '1px 6px', borderRadius: 0, background: 'rgba(201,180,138,.12)', color: '#c9b48a' }}>test</span>}
 <span style={{ fontSize: '14px', color: s.muted, marginLeft: 'auto' }}>{new Date(r.created_at).toLocaleString()}</span>
 </div>
 <div style={{ fontSize: '14px', color: '#c9c2b6', marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{r.message}</div>
 {expanded === r.id && Object.keys(r.context ?? {}).length > 0 && (
 <pre style={{ margin: '8px 0 0', fontSize: '14px', color: s.muted, background: 'rgba(0,0,0,.3)', borderRadius: 0, padding: '8px', overflowX: 'auto' }}>{JSON.stringify(r.context, null, 2)}</pre>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 )
}

// ── Check-in Telemetry (admin-only) ───────────────────────────────────────────
const STEP_NAMES_TEL = ['welcome', 'personal', 'medical', 'waiver', 'experience', 'emergency', 'review']
type StepEvent = { booking_customer_id: string; step: string; entered_at: string; left_at: string | null; is_test: boolean; cohort: string | null }

function median(values: number[]): number | null {
 if (!values.length) return null
 const sorted = [...values].sort((a, b) => a - b)
 const mid = Math.floor(sorted.length / 2)
 return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function fmtDuration(seconds: number): string {
 if (seconds < 60) return `${Math.round(seconds)}s`
 return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

// Workshop-Testing: lädt public/workshop.html im Rahmen und reicht ihr das Login des Mitarbeiters per postMessage.
// Speichern läuft über /api/workshop (Bearer-Token, Service-Role). Abschalten: site_settings.workshop_feedback_open = 'false'.
function PageTesting({ session }: { session: any }) {
 const frameRef = useRef<HTMLIFrameElement>(null)
 useEffect(() => {
 const send = () => {
 frameRef.current?.contentWindow?.postMessage({ type: 'workshop-token', token: session?.access_token, uid: session?.user?.id, email: session?.user?.email }, window.location.origin)
 }
 const onMsg = (e: MessageEvent) => {
 if (e.origin !== window.location.origin) return
 if (e.data && e.data.type === 'workshop-ready') send()
 }
 window.addEventListener('message', onMsg)
 send()
 return () => window.removeEventListener('message', onMsg)
 }, [session])
 return (
 <iframe
 ref={frameRef}
 src="/workshop.html"
 title="Workshop testing"
 style={{ display: 'block', width: '100%', height: 'calc(100vh - 150px)', minHeight: '640px', border: 'none', background: '#000' }}
 />
 )
}

function PageTelemetry({ nav }: { nav: (p: MemberPage) => void }) {
 const isMobile = useIsMobile()
 const [events, setEvents] = useState<StepEvent[]>([])
 const [loading, setLoading] = useState(true)
 const { sandbox } = useSimulation()
 const [cohortSel, setCohortSel] = useState<string | null>(null) // null = automatisch: aktiver Bucket, sonst Standard; '' = Standard
 const [bucket, setBucket] = useState<{ active: boolean; name: string }>({ active: false, name: '' })
 const [bucketMsg, setBucketMsg] = useState<string>('')
 useEffect(() => {
 supabase.from('app_settings').select('value').eq('key', 'telemetry_cohort').maybeSingle().then(({ data }) => {
 const v = data?.value as { active?: boolean; name?: string } | undefined
 if (v) setBucket({ active: !!v.active, name: v.name ?? '' })
 })
 }, [])
 async function saveBucket(next: { active: boolean; name: string }) {
 setBucketMsg('')
 const name = next.name.trim()
 if (next.active && !name) { setBucketMsg('Error: bucket name missing'); return }
 const { data, error } = await supabase.from('app_settings')
 .upsert({ key: 'telemetry_cohort', value: { active: next.active, name }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
 .select('value')
 if (error) { setBucketMsg(`Error: ${error.message} (${error.code ?? 'n/a'}) — admins only`); return }
 if (!data || data.length === 0) { setBucketMsg('Error: not saved (no permission?)'); return }
 setBucket({ active: next.active, name })
 setBucketMsg(next.active ? ` Bucket "${name}" active` : ' Bucket off')
 }

 useEffect(() => {
 setLoading(true)
 supabase.from('checkin_step_events').select('booking_customer_id,step,entered_at,left_at,is_test,cohort').then(({ data }) => {
 setEvents((data ?? []) as StepEvent[])
 setLoading(false)
 })
 }, [])

 const cohorts = Array.from(new Set([...events.map(e => e.cohort), bucket.name || null].filter((c): c is string => !!c))).sort()
 const cohort = cohortSel !== null ? cohortSel : (bucket.active ? bucket.name : '') // aktiver Bucket wird standardmaessig gespiegelt
 const filtered = cohort
 ? events.filter(e => e.step !== 'welcome' && e.cohort === cohort) // Kohorte: unabhaengig von is_test
 : events.filter(e => e.step !== 'welcome' && !e.cohort && e.is_test === (sandbox === true)) // Sandbox = nur Testsitzungen, Production = nur echte; Kohorten-Daten bleiben draussen

 const allBcIds = new Set(filtered.map(e => e.booking_customer_id))
 const totalGuests = allBcIds.size
 const completedGuests = new Set(filtered.filter(e => e.step === 'review').map(e => e.booking_customer_id)).size
 const completionRate = totalGuests ? Math.round((completedGuests / totalGuests) * 100) : null

 const allDurations: number[] = []
 const perStep = STEP_NAMES_TEL.map(step => {
 const stepEvents = filtered.filter(e => e.step === step)
 const enteredCount = stepEvents.length
 const withDuration = stepEvents.filter(e => e.left_at != null)
 const durations = withDuration.map(e => (new Date(e.left_at!).getTime() - new Date(e.entered_at).getTime()) / 1000)
 durations.forEach(d => { if (d >= 0 && d < 7200) allDurations.push(d) })
 const validDurations = durations.filter(d => d >= 0 && d < 7200)
 const dropouts = stepEvents.filter(e => e.left_at == null).length
 return { step, enteredCount, medianSec: median(validDurations), dropouts, dropoutRate: enteredCount ? Math.round((dropouts / enteredCount) * 100) : null }
 })
 const overallMedian = median(allDurations)

 // End-to-end: wall-clock from first entered_at to review left_at (completed guests only)
 const endToEndDurations: number[] = []
 for (const bcId of Array.from(allBcIds)) {
 const guestEvents = filtered.filter(e => e.booking_customer_id === bcId)
 const reviewEvent = guestEvents.find(e => e.step === 'review')
 if (!reviewEvent?.left_at) continue
 const earliestEntry = Math.min(...guestEvents.map(e => new Date(e.entered_at).getTime()))
 const reviewEnd = new Date(reviewEvent.left_at).getTime()
 const duration = (reviewEnd - earliestEntry) / 1000
 if (duration > 0 && duration < 7200) endToEndDurations.push(duration)
 }
 const endToEndMedian = median(endToEndDurations)

 return (
 <div style={{ padding: isMobile ? '24px 16px' : '32px 48px', maxWidth: '900px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
 <button type="button" onClick={() => nav('dashboard')} style={{ fontSize: '14px', color: s.accent, cursor: 'pointer', fontWeight: 500, background: 'none', border: 'none', padding: 0, fontFamily: s.font }}> Dashboard</button>
 <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 500, color: '#f3efe6' }}>Check-in Telemetry</h2>
 {cohorts.length > 0 && (
 <select value={cohort} onChange={e => setCohortSel(e.target.value)} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.06)', color: '#f3efe6', border: '1px solid rgba(255,255,255,.15)', borderRadius: 0, padding: '4px 8px', fontSize: '14px' }}>
 <option value="">Default (Sandbox/Production)</option>
 {cohorts.map(c => <option key={c} value={c}> {c}{bucket.active && c === bucket.name ? ' (active)' : ''}</option>)}
 </select>
 )}
 <span style={{ marginLeft: cohorts.length > 0 ? 0 : 'auto', fontSize: '14px', color: sandbox ? '#c9b48a' : s.muted }}>{cohort ? ` Bucket "${cohort}" — all sessions (test + real)` : sandbox === null ? '' : sandbox ? ' Sandbox — test sessions only' : ' Production — real sessions only'}</span>
 </div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', padding: '10px 14px', background: bucket.active ? 'rgba(183,196,176,.08)' : 'rgba(255,255,255,.04)', border: `1px solid ${bucket.active ? 'rgba(183,196,176,.35)' : 'rgba(255,255,255,.1)'}`, borderRadius: 0, fontSize: '14px', color: '#f3efe6' }}>
 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}>
 <input type="checkbox" checked={bucket.active} onChange={e => saveBucket({ ...bucket, active: e.target.checked })} />
 Measurement bucket active
 </label>
 <input value={bucket.name} onChange={e => setBucket({ ...bucket, name: e.target.value })} onBlur={() => { if (bucket.active) saveBucket(bucket) }} placeholder="e.g. workshop-2026-10-26" style={{ background: 'rgba(255,255,255,.06)', color: '#f3efe6', border: '1px solid rgba(255,255,255,.15)', borderRadius: 0, padding: '4px 8px', fontSize: '14px', minWidth: '200px' }} />
 <span style={{ color: s.muted }}>{bucket.active ? 'New check-in steps are written to this bucket.' : 'Off — new steps go to Sandbox/Production as usual.'}</span>
 {bucketMsg && <span style={{ color: bucketMsg.startsWith('Error') ? '#c9928c' : '#b7c4b0', fontWeight: 500 }}>{bucketMsg}</span>}
 </div>
 {loading ? <div style={{ color: s.muted, fontSize: '14px' }}>Loading…</div> : (
 <>
 <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
 {[
 { label: 'Total guests', value: totalGuests },
 { label: 'Completed', value: completedGuests },
 { label: 'Completion rate', value: completionRate != null ? `${completionRate}%` : '—' },
 { label: 'Overall median', value: overallMedian != null ? fmtDuration(overallMedian) : '—' },
 { label: 'Median total time', value: endToEndMedian != null ? fmtDuration(endToEndMedian) : '—' },
 ].map(({ label, value }) => (
 <div key={label} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '14px 18px', minWidth: '130px' }}>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '4px' }}>{label}</div>
 <div style={{ fontSize: '22px', fontWeight: 500, color: '#f3efe6' }}>{value}</div>
 </div>
 ))}
 </div>
 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
 <thead>
 <tr style={{ borderBottom: '1px solid rgba(255,255,255,.1)' }}>
 {['Step', 'Guests entered', 'Median time', 'Dropped out', 'Dropout rate'].map(h => (
 <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500, color: s.muted, fontSize: '14px' }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {perStep.map(({ step, enteredCount, medianSec, dropouts, dropoutRate }) => (
 <tr key={step} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
 <td style={{ padding: '9px 10px', fontWeight: 500, color: '#f3efe6' }}>{step}</td>
 <td style={{ padding: '9px 10px', color: s.muted }}>{enteredCount}</td>
 <td style={{ padding: '9px 10px', color: '#c9c2b6' }}>{medianSec != null ? fmtDuration(medianSec) : '—'}</td>
 <td style={{ padding: '9px 10px', color: dropouts > 0 ? '#c9928c' : s.muted }}>{dropouts}</td>
 <td style={{ padding: '9px 10px', color: (dropoutRate ?? 0) > 30 ? '#c9928c' : s.muted }}>{dropoutRate != null ? `${dropoutRate}%` : '—'}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </>
 )}
 </div>
 )
}

function PolicyItem({ label, children }: { label: string; children: React.ReactNode }) {
 return (
 <div style={{ display: 'flex', gap: '14px', padding: '12px 16px', background: 'rgba(255,255,255,.03)', borderRadius: 0, border: '1px solid rgba(255,255,255,.06)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#f3efe6', minWidth: '220px', flexShrink: 0, lineHeight: 1.5 }}>{label}</div>
 <div style={{ fontSize: '14px', color: '#c9c2b6', lineHeight: 1.6 }}>{children}</div>
 </div>
 )
}

// ─── Marketing Email Preview ───────────────────────────────────────────────────
const EMAIL_KINDS = [
 { kind: 'booking_confirmation', label: 'Booking Confirmation — paid in full' },
 { kind: 'booking_confirmation_deposit', label: 'Booking Confirmation — deposit paid, balance due' },
 { kind: 'booking_confirmation_group', label: 'Booking Confirmation — group of 3' },
 { kind: 'after_booking', label: 'Check-in Reminder — after booking' },
 { kind: 'week_before', label: 'Check-in Reminder — week before (group)' },
 { kind: 'two_days', label: 'Check-in Reminder — two days before' },
 { kind: 'final', label: 'Check-in Reminder — day before (final)' },
 { kind: 'checkin_invite', label: 'Check-in Invite (co-diver link)' },
 { kind: 'medical', label: 'Medical Clearance Required' },
 { kind: 'session_times', label: 'Start times confirmed (instructor)' },
 { kind: 'post_dive', label: 'Post-Dive — thank you + review' },
 { kind: 'post_dive_wish_granted', label: 'Post-Dive — wish granted' },
 { kind: 'wish_granted', label: 'Wish Granted (favourite site, same day)' },
 { kind: 'booking_request_received', label: 'Booking Request — received (no payment yet)' },
 { kind: 'booking_request_approved', label: 'Booking Request — approved, please confirm (full)' },
 { kind: 'booking_request_approved_deposit', label: 'Booking Request — approved, please confirm (50 % deposit)' },
 { kind: 'booking_request_approved_moved', label: 'Booking Request — approved, dates adjusted by the team' },
 { kind: 'booking_request_approved_shortened', label: 'Booking Request — approved, shortened (fewer dive days, lower price)' },
 { kind: 'booking_request_renewed', label: 'Booking Request — reminder (approval email re-sent)' },
 { kind: 'booking_request_reopened', label: 'Booking Request — guest said the day doesn’t work (“Got it”)' },
 { kind: 'booking_request_declined', label: 'Booking Request — declined' },
 { kind: 'payment_request_link', label: 'Payment Request — Stripe link (50 % deposit)' },
 { kind: 'payment_request_link_full', label: 'Payment Request — Stripe link (full / balance)' },
 { kind: 'payment_request_bank', label: 'Payment Request — Bank transfer (50 % deposit)' },
 { kind: 'payment_request_bank_full', label: 'Payment Request — Bank transfer (full / balance)' },
 { kind: 'payment_request_revolut', label: 'Payment Request — Revolut (50 % deposit)' },
 { kind: 'payment_request_revolut_full', label: 'Payment Request — Revolut (full / balance)' },
 { kind: 'payment_received_partial', label: 'Payment Received — balance still open' },
 { kind: 'payment_received_full', label: 'Payment Received — paid in full' },
 { kind: 'payment_received_full_checkin', label: 'Payment Received — paid in full, check-in open' },
 { kind: 'payment_received_overpaid', label: 'Payment Received — overpaid' },
 { kind: 'cancellation', label: 'Cancellation — no refund' },
 { kind: 'cancellation_with_refund', label: 'Cancellation — refund in progress' },
 { kind: 'refund_full', label: 'Refund — full via Stripe' },
 { kind: 'refund_partial', label: 'Refund — partial via Stripe' },
 { kind: 'refund_cash', label: 'Refund — cash at the centre' },
 { kind: 'refund_bank', label: 'Refund — bank transfer' },
 { kind: 'refund_revolut', label: 'Refund — Revolut' },
] as const

type EmailKind = typeof EMAIL_KINDS[number]['kind']
type EmailPreview = { subject: string; html: string; text: string }

// ── Diagnostics (Error Log + Telemetry zusammen) ──────────────────────────────
function PageDiagnostics({ nav }: { nav: (p: MemberPage) => void }) {
 const [section, setSection] = useState<'errors' | 'checkin' | 'checkout'>('checkout')
 const tabStyle = (active: boolean) => ({
 padding: '7px 18px', borderRadius: 0, border: 'none', cursor: 'pointer',
 fontSize: '14px', fontWeight: 500, fontFamily: s.font,
 background: active ? 'rgba(243,239,230,.15)' : 'transparent',
 color: active ? s.accent : s.muted,
 transition: 'all .15s',
 })
 return (
 <div>
 <div style={{ display: 'flex', gap: '4px', padding: '16px 48px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
 <button style={tabStyle(section === 'checkout')} onClick={() => setSection('checkout')}>Checkout Analytics</button>
 <button style={tabStyle(section === 'checkin')} onClick={() => setSection('checkin')}>Check-in Telemetry</button>
 <button style={tabStyle(section === 'errors')} onClick={() => setSection('errors')}>Error Log</button>
 </div>
 {section === 'errors' ? <PageErrorLog nav={nav} /> : section === 'checkin' ? <PageTelemetry nav={nav} /> : <CheckoutAnalytics />}
 </div>
 )
}

function PageMarketing() {
 const [section, setSection] = useState<'emails' | 'waitlist'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('azd_mktTab') as any) || 'emails' : 'emails'))
 useEffect(() => { try { localStorage.setItem('azd_mktTab', section) } catch {} }, [section])
 const tabStyle = (active: boolean) => ({
 padding: '7px 18px', borderRadius: 0, border: 'none', cursor: 'pointer',
 fontSize: '14px', fontWeight: 500, fontFamily: s.font,
 background: active ? 'rgba(243,239,230,.15)' : 'transparent',
 color: active ? s.accent : s.muted,
 transition: 'all .15s',
 })
 return (
 <div>
 <div style={{ display: 'flex', gap: '4px', padding: '16px 48px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
 <button style={tabStyle(section === 'emails')} onClick={() => setSection('emails')}>Emails</button>
 <button style={tabStyle(section === 'waitlist')} onClick={() => setSection('waitlist')}>Waitlist</button>
 </div>
 {section === 'waitlist' ? <MarketingWaitlist /> : <MarketingEmails />}
 </div>
 )
}

// ── Marketing Waitlist (formigas_waitlist, read-only) ───────────────────────
type WaitlistRow = {
 id: string; email: string; name: string | null; lang: string; party_size: number
 site: string; status: string; notes: string | null; created_at: string; notified_at: string | null
}

function MarketingWaitlist() {
 const [rows, setRows] = useState<WaitlistRow[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [site, setSite] = useState<string>('all')

 async function load() {
 setLoading(true); setError(null)
 const { data, error } = await supabase
 .from('formigas_waitlist')
 .select('id,email,name,lang,party_size,site,status,notes,created_at,notified_at')
 .order('created_at', { ascending: false })
 if (error) setError(`${error.code ? error.code + ' — ' : ''}${error.message}`)
 else setRows((data ?? []) as WaitlistRow[])
 setLoading(false)
 }
 useEffect(() => { load() }, [])

 const sites = Array.from(new Set(rows.map(r => r.site))).sort()
 const visible = site === 'all' ? rows : rows.filter(r => r.site === site)
 const people = visible.reduce((n, r) => n + (r.party_size || 1), 0)
 const th = { textAlign: 'left' as const, padding: '8px 12px', fontSize: '14px', fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: s.muted, borderBottom: '1px solid rgba(255,255,255,.08)', whiteSpace: 'nowrap' as const }
 const td = { padding: '9px 12px', fontSize: '14px', color: '#f3efe6', borderBottom: '1px solid rgba(255,255,255,.05)', verticalAlign: 'top' as const }
 const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

 return (
 <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 24px', fontFamily: s.font }}>
 <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
 <div>
 <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 500, color: '#f3efe6' }}>Waitlist</h2>
 <p style={{ margin: 0, fontSize: '14px', color: s.muted }}>Guests who signed up on the Formigas page. Offshore trips need 6 divers — no deposit is taken.</p>
 </div>
 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
 {sites.length > 1 && (
 <select value={site} onChange={e => setSite(e.target.value)} style={{ padding: '6px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#f3efe6', fontSize: '14px', fontFamily: s.font }}>
 <option value="all">All sites</option>
 {sites.map(x => <option key={x} value={x}>{x}</option>)}
 </select>
 )}
 <span style={{ fontSize: '14px', color: '#a39e94', background: 'rgba(255,255,255,.05)', padding: '4px 10px', borderRadius: 0, whiteSpace: 'nowrap' }}>
 {visible.length} entries · {people} divers
 </span>
 <button onClick={load} disabled={loading} style={{ padding: '5px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.35)', background: 'rgba(243,239,230,.08)', color: '#f3efe6', fontSize: '14px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: s.font, opacity: loading ? .5 : 1 }}>
 {loading ? 'Loading…' : 'Refresh'}
 </button>
 </div>
 </div>

 {error && (
 <div style={{ marginBottom: '12px', padding: '8px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 500, background: 'rgba(201,146,140,.1)', color: '#c9928c', border: '1px solid rgba(201,146,140,.25)' }}>
 Could not load waitlist: {error}
 </div>
 )}

 <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, overflow: 'auto', background: '#000' }}>
 {loading && rows.length === 0 ? (
 <div style={{ padding: '60px', textAlign: 'center', color: s.muted, fontSize: '14px' }}>Loading…</div>
 ) : visible.length === 0 ? (
 <div style={{ padding: '60px', textAlign: 'center', color: s.muted, fontSize: '14px' }}>No one on the waitlist yet.</div>
 ) : (
 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
 <thead><tr>
 <th style={th}>#</th><th style={th}>Signed up</th><th style={th}>Email</th><th style={th}>Name</th>
 <th style={th}>Divers</th><th style={th}>Site</th><th style={th}>Lang</th><th style={th}>Status</th><th style={th}>Notified</th><th style={th}>Notes</th>
 </tr></thead>
 <tbody>
 {visible.map((r, i) => (
 <tr key={r.id}>
 <td style={{ ...td, color: s.muted }}>{i + 1}</td>
 <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
 <td style={td}><a href={`mailto:${r.email}`} style={{ color: s.accent, textDecoration: 'none' }}>{r.email}</a></td>
 <td style={td}>{r.name ?? <span style={{ color: '#a39e94' }}>—</span>}</td>
 <td style={td}>{r.party_size}</td>
 <td style={td}>{r.site}</td>
 <td style={td}>{r.lang}</td>
 <td style={td}>
 <span style={{ fontSize: '14px', fontWeight: 500, padding: '2px 8px', borderRadius: 0, background: r.status === 'waiting' ? 'rgba(201,180,138,.15)' : 'rgba(183,196,176,.12)', color: r.status === 'waiting' ? '#c9b48a' : '#b7c4b0' }}>{r.status}</span>
 </td>
 <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.notified_at ? fmt(r.notified_at) : <span style={{ color: '#a39e94' }}>—</span>}</td>
 <td style={{ ...td, color: '#c9c2b6' }}>{r.notes ?? ''}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>
 </div>
 )
}

// ── Marketing Emails (preview + send test) ─────────────────────────────────
function MarketingEmails() {
 const [token, setToken] = React.useState<string | null>(null)
 const [previews, setPreviews] = React.useState<Partial<Record<EmailKind, EmailPreview>>>({})
 const [loading, setLoading] = React.useState<Partial<Record<EmailKind, boolean>>>({})
 const [showTest, setShowTest] = React.useState(false)
 const [activeKind, setActiveKind] = React.useState<EmailKind>('booking_confirmation')
 const [activeTab, setActiveTab] = React.useState<'preview' | 'text'>('preview')
 const [sendingTest, setSendingTest] = React.useState(false)
 const [sendMsg, setSendMsg] = React.useState<string | null>(null)

 // Get auth token once
 React.useEffect(() => {
 supabase.auth.getSession().then(({ data }) => {
 setToken(data.session?.access_token ?? null)
 })
 }, [])

 // Fetch preview for active kind when it changes
 React.useEffect(() => {
 if (!token) return
 if (previews[activeKind]) return // already loaded
 setLoading(l => ({ ...l, [activeKind]: true }))
 const params = new URLSearchParams({ kind: activeKind, test: showTest ? '1' : '0' })
 fetch(`/api/dashboard/email-preview?${params}`, {
 headers: { Authorization: `Bearer ${token}` },
 })
 .then(r => r.json())
 .then((d: EmailPreview) => setPreviews(p => ({ ...p, [activeKind]: d })))
 .finally(() => setLoading(l => ({ ...l, [activeKind]: false })))
 }, [token, activeKind, showTest]) // eslint-disable-line react-hooks/exhaustive-deps

 // When test toggle changes, refetch current kind
 const handleTestToggle = () => {
 setShowTest(v => {
 const next = !v
 if (!token) return next
 setLoading(l => ({ ...l, [activeKind]: true }))
 const params = new URLSearchParams({ kind: activeKind, test: next ? '1' : '0' })
 fetch(`/api/dashboard/email-preview?${params}`, {
 headers: { Authorization: `Bearer ${token}` },
 })
 .then(r => r.json())
 .then((d: EmailPreview) => setPreviews(p => ({ ...p, [activeKind]: d })))
 .finally(() => setLoading(l => ({ ...l, [activeKind]: false })))
 return next
 })
 }

 const sendTest = async () => {
 if (!token) return
 setSendingTest(true)
 setSendMsg(null)
 try {
 const r = await fetch('/api/dashboard/email-preview', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
 body: JSON.stringify({ kind: activeKind }),
 })
 const d = await r.json()
 if (r.ok) setSendMsg(` Sent to ${d.to}`)
 else setSendMsg(` Error: ${d.error}`)
 } catch (e) {
 setSendMsg(` ${e instanceof Error ? e.message : 'Network error'}`)
 } finally {
 setSendingTest(false)
 setTimeout(() => setSendMsg(null), 4000)
 }
 }

 const current = previews[activeKind]
 const isLoading = loading[activeKind]

 return (
 <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 24px', fontFamily: s.font }}>
 <div style={{ marginBottom: '24px' }}>
 <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 500, color: '#f3efe6' }}>Marketing Emails</h2>
 <p style={{ margin: 0, fontSize: '14px', color: s.muted }}>Customer-facing emails in the order they are received. Rendered with sample data.</p>
 </div>

 <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
 {/* Left sidebar: email list */}
 <div style={{ width: '220px', flexShrink: 0 }}>
 {EMAIL_KINDS.map(({ kind, label }) => (
 <button key={kind} onClick={() => { setActiveKind(kind); setActiveTab('preview') }}
 style={{
 display: 'block', width: '100%', textAlign: 'left',
 padding: '10px 14px', marginBottom: '4px', borderRadius: 0,
 border: activeKind === kind ? '1px solid rgba(243,239,230,.4)' : '1px solid rgba(255,255,255,.06)',
 background: activeKind === kind ? 'rgba(243,239,230,.1)' : 'rgba(255,255,255,.03)',
 color: activeKind === kind ? '#f3efe6' : '#c9c2b6',
 fontSize: '14px', fontWeight: activeKind === kind ? 500 : 400,
 cursor: 'pointer', fontFamily: s.font, transition: 'all .15s',
 lineHeight: 1.4,
 }}>
 {label}
 </button>
 ))}
 </div>

 {/* Right panel: preview */}
 <div style={{ flex: 1, minWidth: 0 }}>
 {/* Toolbar */}
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
 <span style={{ fontSize: '15px', fontWeight: 500, color: '#f3efe6' }}>
 {EMAIL_KINDS.find(k => k.kind === activeKind)?.label}
 </span>
 {current && (
 <span style={{ fontSize: '14px', color: '#a39e94', background: 'rgba(255,255,255,.05)', padding: '3px 10px', borderRadius: 0 }}>
 {current.subject}
 </span>
 )}
 <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
 {/* TEST toggle */}
 <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: showTest ? '#c9b48a' : s.muted, cursor: 'pointer' }}>
 <div onClick={handleTestToggle} style={{
 width: '34px', height: '18px', borderRadius: 0, position: 'relative', cursor: 'pointer', flexShrink: 0,
 background: showTest ? '#c9b48a33' : 'rgba(255,255,255,.08)',
 border: showTest ? '1px solid #c9b48a' : '1px solid rgba(255,255,255,.1)',
 transition: 'all .2s',
 }}>
 <div style={{
 position: 'absolute', top: '2px', left: showTest ? '16px' : '2px',
 width: '12px', height: '12px', borderRadius: '50%',
 background: showTest ? '#c9b48a' : '#a39e94', transition: 'left .2s',
 }} />
 </div>
 TEST banner
 </label>
 {/* Tab toggle */}
 <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,.06)', borderRadius: 0, padding: '2px' }}>
 {(['preview', 'text'] as const).map(tab => (
 <button key={tab} onClick={() => setActiveTab(tab)} style={{
 padding: '4px 12px', borderRadius: 0, border: 'none', cursor: 'pointer',
 fontSize: '14px', fontWeight: 500, fontFamily: s.font,
 background: activeTab === tab ? 'rgba(243,239,230,.2)' : 'transparent',
 color: activeTab === tab ? '#f3efe6' : s.muted,
 transition: 'all .15s',
 }}>{tab === 'preview' ? 'Preview' : 'Text'}</button>
 ))}
 </div>
 {/* Send test */}
 <button onClick={sendTest} disabled={sendingTest}
 style={{
 padding: '5px 14px', borderRadius: 0, border: '1px solid rgba(243,239,230,.35)',
 background: 'rgba(243,239,230,.08)', color: '#f3efe6',
 fontSize: '14px', fontWeight: 500, cursor: sendingTest ? 'not-allowed' : 'pointer',
 fontFamily: s.font, opacity: sendingTest ? .5 : 1, whiteSpace: 'nowrap',
 }}>
 {sendingTest ? 'Sending…' : 'Send test to me'}
 </button>
 </div>
 </div>

 {/* Send confirmation */}
 {sendMsg && (
 <div style={{ marginBottom: '10px', padding: '8px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 500,
 background: sendMsg.startsWith('') ? 'rgba(183,196,176,.1)' : 'rgba(201,146,140,.1)',
 color: sendMsg.startsWith('') ? '#b7c4b0' : '#c9928c',
 border: sendMsg.startsWith('') ? '1px solid rgba(183,196,176,.25)' : '1px solid rgba(201,146,140,.25)',
 }}>
 {sendMsg}
 </div>
 )}

 {/* Email preview area */}
 <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, overflow: 'hidden', background: '#000' }}>
 {isLoading ? (
 <div style={{ padding: '80px', textAlign: 'center', color: s.muted, fontSize: '14px' }}>Loading preview…</div>
 ) : !current ? (
 <div style={{ padding: '80px', textAlign: 'center', color: s.muted, fontSize: '14px' }}>Select an email to preview</div>
 ) : activeTab === 'preview' ? (
 <iframe
 srcDoc={current.html}
 style={{ width: '100%', height: '700px', border: 'none', display: 'block' }}
 title={`Preview: ${activeKind}`}
 sandbox="allow-same-origin"
 />
 ) : (
 <pre style={{
 margin: 0, padding: '24px', fontSize: '14px', lineHeight: 1.7,
 color: '#c9c2b6', background: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
 maxHeight: '700px', overflowY: 'auto',
 }}>{current.text}</pre>
 )}
 </div>
 </div>
 </div>
 </div>
 )
}

// ══════════════════════════════════════════════════════════════════════════════
// BOAT MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
interface Boat {
 id: string
 name: string
 seats: number
 company: string
 sort_order: number
 active: boolean
 created_at: string
}

function slugify(str: string) {
 return str.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ─── Admin Settings: Saison-Modus der Online-Buchung (Lucas 28.10.2026) ────
// Heute: globaler Schalter Open / Request. Geplant an derselben Stelle: Buchungsfenster-Kalender (Zeiträume, Produkte, Schichten).
function PageSettings({ nav }: { nav: (p: MemberPage) => void }) {
 return (
 <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 24px', fontFamily: s.font }}>
 <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 500, color: '#f3efe6' }}>Settings</h2>
 <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: s.muted }}>Season mode for the public booking page. Requests are handled in <button type="button" onClick={() => nav('frontoffice')} style={{ background: 'none', border: 'none', padding: 0, color: s.accent, cursor: 'pointer', fontFamily: s.font, fontSize: '14px', textDecoration: 'underline' }}>Front Office Booking Requests</button>.</p>
 <CentreBrandForm />
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Online booking</div>
 <BookingModeSwitch isAdmin={true} />
 <OnlineDepositSwitch isAdmin={true} />
 <BookingWindowsAdmin />
 </div>
 )
}

// ─── Buchungsfenster: Zeiträume open / request / blocked (Lucas 28.10.2026) ───
type BookingWindowRow = { id: string; from_date: string; to_date: string; mode: 'open' | 'request' | 'blocked'; session: 'am' | 'pm' | 'night' | null; product_id: string | null; reason: string | null; guest_text: string | null; active: boolean; created_by_email: string | null; created_at: string }
function BookingWindowsAdmin() {
 const empty = { id: '', from_date: '', to_date: '', mode: 'request' as 'open' | 'request' | 'blocked', session: '' as '' | 'am' | 'pm' | 'night', product_id: '', reason: '', guest_text: '' }
 const [rows, setRows] = useState<BookingWindowRow[] | null>(null)
 const [defaultMode, setDefaultMode] = useState<string>('open')
 const [products, setProducts] = useState<{ id: string; name: string }[]>([])
 const [form, setForm] = useState(empty)
 const [saving, setSaving] = useState(false)
 const [msg, setMsg] = useState<string | null>(null)
 const [preview, setPreview] = useState({ date: new Date().toISOString().slice(0, 10), session: 'am', product_id: 'daily-double-dive' })

 async function token() { return (await supabase.auth.getSession()).data.session?.access_token ?? '' }
 async function load() {
 try {
 const r = await fetch('/api/booking-windows?all=1', { headers: { Authorization: `Bearer ${await token()}` } })
 const d = await r.json().catch(() => ({}))
 if (!r.ok) throw new Error(`HTTP ${r.status} ${d.error ?? ''}`)
 setRows(d.windows ?? []); setDefaultMode(d.default_mode ?? 'open')
 } catch (e) { setMsg(` Could not load booking windows: ${e instanceof Error ? e.message : String(e)}`); setRows([]) }
 }
 useEffect(() => {
 void load()
 supabase.from('course_prices').select('id,name').eq('bookable_online', true).order('name').then(({ data }) => setProducts((data ?? []) as { id: string; name: string }[]))
 }, []) // eslint-disable-line react-hooks/exhaustive-deps

 async function save() {
 setSaving(true); setMsg(null)
 try {
 if (!form.from_date || !form.to_date) throw new Error('From and To date are required')
 const body = { ...(form.id ? { id: form.id } : {}), from_date: form.from_date, to_date: form.to_date, mode: form.mode, session: form.session || null, product_id: form.product_id || null, reason: form.reason, guest_text: form.guest_text }
 const r = await fetch('/api/booking-windows', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok) throw new Error(`HTTP ${r.status} ${d.error ?? ''}`)
 setMsg(` Window ${form.id ? 'updated' : 'created'}: ${form.from_date} ${form.to_date} · ${form.mode}`)
 setForm(empty); await load()
 } catch (e) { setMsg(` Not saved: ${e instanceof Error ? e.message : String(e)}`) }
 finally { setSaving(false) }
 }
 async function toggleActive(w: BookingWindowRow) {
 setSaving(true); setMsg(null)
 try {
 const r = await fetch('/api/booking-windows', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ id: w.id, from_date: w.from_date, to_date: w.to_date, mode: w.mode, session: w.session, product_id: w.product_id, reason: w.reason, guest_text: w.guest_text, active: !w.active }) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok) throw new Error(`HTTP ${r.status} ${d.error ?? ''}`)
 await load()
 } catch (e) { setMsg(` ${e instanceof Error ? e.message : String(e)}`) }
 finally { setSaving(false) }
 }
 async function remove(w: BookingWindowRow) {
 if (!confirm(`Delete window ${w.from_date} ${w.to_date} (${w.mode})?`)) return
 setSaving(true); setMsg(null)
 try {
 const r = await fetch('/api/booking-windows', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ id: w.id }) })
 const d = await r.json().catch(() => ({}))
 if (!r.ok) throw new Error(`HTTP ${r.status} ${d.error ?? ''}`)
 await load()
 } catch (e) { setMsg(` ${e instanceof Error ? e.message : String(e)}`) }
 finally { setSaving(false) }
 }

 // Vorschau: gleiche Auflösung wie /book und /api/checkout
 const previewResult = (() => {
 const r = resolveWindowMode((rows ?? []).filter(w => w.active), defaultMode === 'request' ? 'request' : 'open', { date: preview.date, session: preview.session, product_id: preview.product_id || null })
 return { mode: r.mode, from: r.rule ? 'window' : 'default', text: r.guest_text }
 })()

 const MODE_CLR: Record<string, string> = { open: '#b7c4b0', request: '#c9b48a', blocked: '#c9928c' }
 const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#f3efe6', fontSize: '14px', fontFamily: s.font }
 const lbl: React.CSSProperties = { fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '4px', display: 'block' }
 const productName = (id: string | null) => id ? (products.find(p => p.id === id)?.name ?? id) : 'All products'

 return (
 <div style={{ marginTop: '26px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>Booking windows</div>
 <p style={{ margin: '0 0 14px', fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
 Date ranges override the default above for the public booking page. <b style={{ color: '#b7c4b0' }}>Open</b> = instant payment · <b style={{ color: '#c9b48a' }}>Request</b> = team approves first · <b style={{ color: '#c9928c' }}>Blocked</b> = not bookable online (guest sees your text, if any). Most specific rule wins (product + session &gt; product &gt; session &gt; dates only); on a tie blocked &gt; request &gt; open. One request day makes the whole booking a request. Front Office / walk-ins are never affected.
 </p>

 {/* Formular */}
 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '14px 16px', marginBottom: '16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '10px' }}>{form.id ? `Edit window ${form.id.slice(0, 8)}` : 'New window'}</div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
 <div><label style={lbl}>From *</label><input type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} /></div>
 <div><label style={lbl}>To *</label><input type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} /></div>
 <div><label style={lbl}>Mode *</label>
 <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value as typeof form.mode }))} style={{ ...inp, width: '100%' }}>
 <option value="open">Open — instant payment</option><option value="request">Request — team approves</option><option value="blocked">Blocked — not bookable</option>
 </select></div>
 <div><label style={lbl}>Session</label>
 <select value={form.session} onChange={e => setForm(f => ({ ...f, session: e.target.value as typeof form.session }))} style={{ ...inp, width: '100%' }}>
 <option value="">All sessions</option><option value="am">AM only</option><option value="pm">PM only</option><option value="night">Night only</option>
 </select></div>
 <div><label style={lbl}>Product</label>
 <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} style={{ ...inp, width: '100%' }}>
 <option value="">All products</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
 </select></div>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
 <div><label style={lbl}>Internal reason (staff only)</label><input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. private charter, boat maintenance" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} /></div>
 {form.mode === 'blocked' ? (
 <div><label style={lbl}>Guest text (optional, replaces “Not bookable online for this date”)</label><input value={form.guest_text} onChange={e => setForm(f => ({ ...f, guest_text: e.target.value }))} placeholder="e.g. Boat in maintenance — we're back on 15 March" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} /></div>
 ) : (
 <div><label style={lbl}>Guest text</label><div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5, paddingTop: '6px' }}>{form.mode === 'request' ? 'Fixed: low-season disclaimer (requests are collected, dive days organised when enough divers come together that week, dates are a preference) + “Send request” button.' : 'Fixed: normal booking page, instant payment.'}</div></div>
 )}
 </div>
 <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
 <button type="button" disabled={saving} onClick={save} style={{ padding: '8px 16px', borderRadius: 0, border: 'none', background: s.accent, color: '#000', fontSize: '14px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: s.font, opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : form.id ? 'Save changes' : '+ Add window'}</button>
 {form.id && <button type="button" onClick={() => setForm(empty)} style={{ padding: '8px 12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Cancel</button>}
 {msg && <span style={{ fontSize: '14px', fontWeight: 500, color: msg.startsWith('') ? '#b7c4b0' : '#c9928c' }}>{msg}</span>}
 </div>
 </div>

 {/* Liste */}
 <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, overflow: 'auto', background: '#000', marginBottom: '16px' }}>
 {rows === null ? <div style={{ padding: '24px', textAlign: 'center', color: s.muted, fontSize: '14px' }}>Loading…</div>
 : rows.length === 0 ? <div style={{ padding: '24px', textAlign: 'center', color: s.muted, fontSize: '14px' }}>No windows yet — the default ({defaultMode}) applies to every date.</div>
 : (
 <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
 <thead><tr>{['Dates', 'Mode', 'Session', 'Product', 'Reason', 'Guest text', 'Active', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '14px', fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase', color: s.muted, borderBottom: '1px solid rgba(255,255,255,.08)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
 <tbody>
 {rows.map(w => (
 <tr key={w.id} style={{ opacity: w.active ? 1 : .45 }}>
 <td style={{ padding: '8px 12px', color: s.text, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,.05)' }}>{w.from_date} {w.to_date}</td>
 <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.05)' }}><span style={{ fontSize: '14px', fontWeight: 500, textTransform: 'uppercase', color: MODE_CLR[w.mode] }}>{w.mode}</span></td>
 <td style={{ padding: '8px 12px', color: s.muted, borderBottom: '1px solid rgba(255,255,255,.05)' }}>{w.session ? w.session.toUpperCase() : 'all'}</td>
 <td style={{ padding: '8px 12px', color: s.muted, borderBottom: '1px solid rgba(255,255,255,.05)' }}>{productName(w.product_id)}</td>
 <td style={{ padding: '8px 12px', color: s.muted, borderBottom: '1px solid rgba(255,255,255,.05)' }}>{w.reason ?? '—'}</td>
 <td style={{ padding: '8px 12px', color: s.muted, borderBottom: '1px solid rgba(255,255,255,.05)', maxWidth: '240px' }}>{w.guest_text ?? '—'}</td>
 <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.05)' }}><button type="button" disabled={saving} onClick={() => toggleActive(w)} style={{ padding: '3px 9px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: w.active ? '#b7c4b0' : s.muted, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{w.active ? 'active' : 'off'}</button></td>
 <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
 <button type="button" onClick={() => setForm({ id: w.id, from_date: w.from_date, to_date: w.to_date, mode: w.mode, session: w.session ?? '', product_id: w.product_id ?? '', reason: w.reason ?? '', guest_text: w.guest_text ?? '' })} style={{ padding: '3px 9px', borderRadius: 0, border: 'none', background: 'rgba(243,239,230,.1)', color: s.accent, fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, marginRight: '6px' }}>Edit</button>
 <button type="button" disabled={saving} onClick={() => remove(w)} style={{ padding: '3px 9px', borderRadius: 0, border: 'none', background: 'rgba(201,146,140,.12)', color: '#c9928c', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>Delete</button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>

 {/* Vorschau */}
 <div style={{ background: 'rgba(243,239,230,.04)', border: '1px solid rgba(243,239,230,.14)', borderRadius: 0, padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
 <div><label style={lbl}>Preview: what does a guest see on</label><input type="date" value={preview.date} onChange={e => setPreview(p => ({ ...p, date: e.target.value }))} style={inp} /></div>
 <div><label style={lbl}>Session</label><select value={preview.session} onChange={e => setPreview(p => ({ ...p, session: e.target.value }))} style={inp}><option value="am">AM</option><option value="pm">PM</option><option value="night">Night</option></select></div>
 <div><label style={lbl}>Product</label><select value={preview.product_id} onChange={e => setPreview(p => ({ ...p, product_id: e.target.value }))} style={inp}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{!products.some(p => p.id === preview.product_id) && <option value={preview.product_id}>{preview.product_id || '—'}</option>}</select></div>
 <div style={{ fontSize: '14px', color: s.text, paddingBottom: '7px' }}> <b style={{ color: MODE_CLR[previewResult.mode] ?? s.text, textTransform: 'uppercase' }}>{previewResult.mode}</b> <span style={{ color: s.muted }}>({previewResult.from === 'window' ? 'from a window' : 'default switch'}{previewResult.text ? ` · guest text: “${previewResult.text}”` : ''}) — {previewResult.mode === 'open' ? 'guest books and pays as usual' : previewResult.mode === 'request' ? 'guest sees the low-season disclaimer and sends a request' : 'day is greyed out in the calendar'}. Capacity and cutoff are checked separately.</span></div>
 </div>
 </div>
 )
}

function PageBoatManagement({ nav }: { nav: (p: MemberPage) => void }) {
 const [boats, setBoats] = useState<Boat[]>([])
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState<Record<string, boolean>>({})
 const [delConfirm, setDelConfirm] = useState<string | null>(null)

 const [addOpen, setAddOpen] = useState(false)
 const [addName, setAddName] = useState('')
 const [addSeats, setAddSeats] = useState('')
 const [addCompany, setAddCompany] = useState('azd')
 const [addLoading, setAddLoading] = useState(false)
 const [addMsg, setAddMsg] = useState<string | null>(null)

 const [editSeats, setEditSeats] = useState<Record<string, string>>({})
 const [editName, setEditName] = useState<Record<string, string>>({})

 const inp = {
 padding: '8px 12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.15)',
 background: 'rgba(255,255,255,.05)', color: s.text, fontSize: '14px',
 fontFamily: s.font, outline: 'none', width: '100%', boxSizing: 'border-box' as const,
 }
 const bm = (accent?: boolean) => ({
 padding: '8px 16px', borderRadius: 0, border: 'none', cursor: 'pointer' as const,
 fontFamily: s.font, fontWeight: 500, fontSize: '14px',
 background: accent ? s.accent : 'rgba(255,255,255,.08)',
 color: accent ? '#090909' : s.text,
 })

 async function load() {
 setLoading(true)
 const { data } = await supabase.from('boats').select('*').order('sort_order').order('name')
 setBoats((data ?? []) as Boat[])
 setLoading(false)
 }

 useEffect(() => { load() }, [])

 async function toggleActive(boat: Boat) {
 setSaving(p => ({ ...p, [boat.id]: true }))
 await supabase.from('boats').update({ active: !boat.active }).eq('id', boat.id)
 setBoats(prev => prev.map(b => b.id === boat.id ? { ...b, active: !b.active } : b))
 setSaving(p => ({ ...p, [boat.id]: false }))
 }

 async function saveSeats(boat: Boat) {
 const val = parseInt(editSeats[boat.id] ?? '', 10)
 if (isNaN(val) || val < 1) return
 setSaving(p => ({ ...p, [boat.id]: true }))
 await supabase.from('boats').update({ seats: val }).eq('id', boat.id)
 setBoats(prev => prev.map(b => b.id === boat.id ? { ...b, seats: val } : b))
 setEditSeats(p => { const n = { ...p }; delete n[boat.id]; return n })
 setSaving(p => ({ ...p, [boat.id]: false }))
 }

 async function saveName(boat: Boat) {
 const val = editName[boat.id]?.trim()
 if (!val) return
 setSaving(p => ({ ...p, [boat.id]: true }))
 await supabase.from('boats').update({ name: val }).eq('id', boat.id)
 setBoats(prev => prev.map(b => b.id === boat.id ? { ...b, name: val } : b))
 setEditName(p => { const n = { ...p }; delete n[boat.id]; return n })
 setSaving(p => ({ ...p, [boat.id]: false }))
 }

 async function deleteBoat(id: string) {
 setSaving(p => ({ ...p, [id]: true }))
 await supabase.from('boats').delete().eq('id', id)
 setBoats(prev => prev.filter(b => b.id !== id))
 setDelConfirm(null)
 setSaving(p => { const n = { ...p }; delete n[id]; return n })
 }

 async function addBoat() {
 if (!addName.trim() || !addSeats) return
 const seats = parseInt(addSeats, 10)
 if (isNaN(seats) || seats < 1) { setAddMsg(' Invalid capacity'); return }
 const id = slugify(addName)
 if (!id) { setAddMsg(' Invalid name'); return }
 setAddLoading(true); setAddMsg(null)
 const maxOrder = boats.reduce((m, b) => Math.max(m, b.sort_order), 0)
 const { error } = await supabase.from('boats').insert({ id, name: addName.trim(), seats, company: addCompany, sort_order: maxOrder + 1, active: true })
 if (error) {
 setAddMsg(` ${error.message}`)
 } else {
 setAddMsg(' Boat added')
 setAddName(''); setAddSeats(''); setAddCompany('azd'); setAddOpen(false)
 await load()
 }
 setAddLoading(false)
 }

 async function moveOrder(boat: Boat, dir: -1 | 1) {
 const sorted = [...boats].sort((a, b) => a.sort_order - b.sort_order)
 const idx = sorted.findIndex(b => b.id === boat.id)
 const swapIdx = idx + dir
 if (swapIdx < 0 || swapIdx >= sorted.length) return
 const other = sorted[swapIdx]
 setSaving(p => ({ ...p, [boat.id]: true, [other.id]: true }))
 await Promise.all([
 supabase.from('boats').update({ sort_order: other.sort_order }).eq('id', boat.id),
 supabase.from('boats').update({ sort_order: boat.sort_order }).eq('id', other.id),
 ])
 setBoats(prev => prev.map(b => {
 if (b.id === boat.id) return { ...b, sort_order: other.sort_order }
 if (b.id === other.id) return { ...b, sort_order: boat.sort_order }
 return b
 }))
 setSaving(p => { const n = { ...p }; delete n[boat.id]; delete n[other.id]; return n })
 }

 const sortedBoats = [...boats].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

 return (
 <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
 <div>
 <div style={{ fontSize: '22px', fontWeight: 500, color: s.text }}> Boat Management</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '4px' }}>Manage boats · Set capacity · toggle active</div>
 </div>
 <button onClick={() => { setAddOpen(v => !v); setAddMsg(null) }} style={bm(true)}>+ Boat</button>
 </div>

 {addOpen && (
 <div style={{ padding: '18px', background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.25)', borderRadius: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.accent }}>New Boat</div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px', gap: '10px' }}>
 <div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '4px', fontWeight: 500 }}>Name</div>
 <input value={addName} onChange={e => setAddName(e.target.value)} placeholder='e.g. Toninha Pintada' style={inp} onKeyDown={e => e.key === 'Enter' && addBoat()} />
 </div>
 <div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '4px', fontWeight: 500 }}>Seats</div>
 <input type='number' min={1} max={99} value={addSeats} onChange={e => setAddSeats(e.target.value)} placeholder='8' style={inp} onKeyDown={e => e.key === 'Enter' && addBoat()} />
 </div>
 <div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '4px', fontWeight: 500 }}>Company</div>
 <select value={addCompany} onChange={e => setAddCompany(e.target.value)} style={inp}>
 <option value='azd'>AZD</option>
 <option value='sc'>Season Challenge</option>
 </select>
 </div>
 </div>
 {addName.trim() && <div style={{ fontSize: '14px', color: s.muted }}>ID: <code style={{ color: s.accent }}>{slugify(addName) || '—'}</code></div>}
 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
 <button onClick={addBoat} disabled={addLoading || !addName.trim() || !addSeats} style={bm(true)}>{addLoading ? 'Saving…' : 'Save'}</button>
 <button onClick={() => { setAddOpen(false); setAddMsg(null) }} style={bm()}>Cancel</button>
 {addMsg && <span style={{ fontSize: '14px', color: addMsg.startsWith('') ? '#b7c4b0' : '#c9928c' }}>{addMsg}</span>}
 </div>
 </div>
 )}

 {loading ? (
 <div style={{ color: s.muted, fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>Loading…</div>
 ) : sortedBoats.length === 0 ? (
 <div style={{ color: s.muted, fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>No boats configured.</div>
 ) : (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
 {sortedBoats.map((boat, idx) => {
 const isSavingThis = !!saving[boat.id]
 const isEditingSeats = boat.id in editSeats
 const isEditingName = boat.id in editName
 return (
 <div key={boat.id} style={{
 padding: '16px 18px', borderRadius: 0,
 background: boat.active ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.02)',
 border: `1px solid ${boat.active ? 'rgba(243,239,230,.2)' : 'rgba(255,255,255,.07)'}`,
 opacity: isSavingThis ? 0.6 : 1, transition: 'opacity .15s',
 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>

 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
 <button onClick={() => moveOrder(boat, -1)} disabled={idx === 0 || isSavingThis}
 style={{ background: 'transparent', border: 'none', color: idx === 0 ? 'rgba(255,255,255,.15)' : s.muted, cursor: idx === 0 ? 'default' : 'pointer', fontSize: '14px', lineHeight: 1, padding: '1px 4px' }}></button>
 <button onClick={() => moveOrder(boat, 1)} disabled={idx === sortedBoats.length - 1 || isSavingThis}
 style={{ background: 'transparent', border: 'none', color: idx === sortedBoats.length - 1 ? 'rgba(255,255,255,.15)' : s.muted, cursor: idx === sortedBoats.length - 1 ? 'default' : 'pointer', fontSize: '14px', lineHeight: 1, padding: '1px 4px' }}></button>
 </div>

 <button onClick={() => toggleActive(boat)} disabled={isSavingThis} title={boat.active ? 'Deactivate' : 'Activate'}
 style={{ width: '36px', height: '20px', borderRadius: 0, border: 'none', cursor: 'pointer', padding: 0, position: 'relative', background: boat.active ? s.accent : 'rgba(255,255,255,.15)', transition: 'background .2s', flexShrink: 0 }}>
 <span style={{ position: 'absolute', top: '3px', left: boat.active ? '19px' : '3px', width: '14px', height: '14px', borderRadius: '50%', background: boat.active ? '#090909' : 'rgba(255,255,255,.6)', transition: 'left .2s' }} />
 </button>

 <div style={{ flex: 1, minWidth: '140px' }}>
 {isEditingName ? (
 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
 <input autoFocus value={editName[boat.id]} onChange={e => setEditName(p => ({ ...p, [boat.id]: e.target.value }))}
 onKeyDown={e => { if (e.key === 'Enter') saveName(boat); if (e.key === 'Escape') setEditName(p => { const n = { ...p }; delete n[boat.id]; return n }) }}
 style={{ ...inp, width: 'auto', flex: 1, padding: '5px 9px', fontSize: '14px' }} />
 <button onClick={() => saveName(boat)} style={{ ...bm(true), padding: '5px 12px', fontSize: '14px' }}></button>
 <button onClick={() => setEditName(p => { const n = { ...p }; delete n[boat.id]; return n })} style={{ ...bm(), padding: '5px 10px', fontSize: '14px' }}></button>
 </div>
 ) : (
 <div>
 <span style={{ fontSize: '14px', fontWeight: 500, color: boat.active ? s.text : s.muted }}>{boat.name}</span>
 <button onClick={() => setEditName(p => ({ ...p, [boat.id]: boat.name }))}
 style={{ background: 'transparent', border: 'none', color: s.muted, cursor: 'pointer', fontSize: '14px', marginLeft: '6px', padding: '0 2px' }} title='Name bearbeiten'></button>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 <code style={{ fontSize: '14px' }}>{boat.id}</code>
 <span style={{ margin: '0 6px', opacity: .4 }}>·</span>
 <span style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>{boat.company}</span>
 </div>
 </div>
 )}
 </div>

 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
 <span style={{ fontSize: '14px', color: s.muted, whiteSpace: 'nowrap' }}> Seats:</span>
 {isEditingSeats ? (
 <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
 <input autoFocus type='number' min={1} max={99} value={editSeats[boat.id]}
 onChange={e => setEditSeats(p => ({ ...p, [boat.id]: e.target.value }))}
 onKeyDown={e => { if (e.key === 'Enter') saveSeats(boat); if (e.key === 'Escape') setEditSeats(p => { const n = { ...p }; delete n[boat.id]; return n }) }}
 style={{ ...inp, width: '64px', padding: '5px 8px', fontSize: '14px', textAlign: 'center' }} />
 <button onClick={() => saveSeats(boat)} style={{ ...bm(true), padding: '5px 10px', fontSize: '14px' }}></button>
 <button onClick={() => setEditSeats(p => { const n = { ...p }; delete n[boat.id]; return n })} style={{ ...bm(), padding: '5px 8px', fontSize: '14px' }}></button>
 </div>
 ) : (
 <button onClick={() => setEditSeats(p => ({ ...p, [boat.id]: String(boat.seats) }))}
 style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 0, padding: '4px 10px', cursor: 'pointer', color: s.text, fontSize: '14px', fontWeight: 500, fontFamily: s.font }}>
 {boat.seats}
 </button>
 )}
 </div>

 <div>
 {delConfirm === boat.id ? (
 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
 <span style={{ fontSize: '14px', color: '#c9928c' }}>Wirklich löschen?</span>
 <button onClick={() => deleteBoat(boat.id)} style={{ ...bm(), background: '#c9928c', color: '#f3efe6', padding: '5px 12px', fontSize: '14px' }}>Ja</button>
 <button onClick={() => setDelConfirm(null)} style={{ ...bm(), padding: '5px 10px', fontSize: '14px' }}>Nein</button>
 </div>
 ) : (
 <button onClick={() => setDelConfirm(boat.id)} disabled={isSavingThis}
 style={{ background: 'transparent', border: '1px solid rgba(201,146,140,.3)', borderRadius: 0, color: '#c9928c', cursor: 'pointer', fontSize: '14px', padding: '5px 10px', fontFamily: s.font }}>
 Delete
 </button>
 )}
 </div>
 </div>
 </div>
 )
 })}
 </div>
 )}
 </div>
 )
}

export function PageMembers({ lang, nav, initialSlug }: { lang: Lang; nav: (p: string) => void; initialSlug: string }) {
 // Gespeicherten Hell/Dunkel-Modus im ganzen Members-Bereich anwenden; beim Verlassen zurücksetzen (öffentliche Seite bleibt dunkel)
 useEffect(() => {
 applyMembersTheme(getMembersTheme())
 applyMembersZoom(getMembersZoom())
 return () => { document.documentElement.classList.remove(THEME_CLASS); applyMembersZoom(1) }
 }, [])
 const sim = useSimulation()
 const { modes: aiModes } = useAiModes()

 const isMobile = useIsMobile()
 const [page, setPage] = useState<MemberPage>(SLUG_TO_PAGE[initialSlug] ?? 'dashboard')

 const memberNav = (newPage: MemberPage) => {
 setPage(newPage)
 window.history.pushState(null, '', '/dive-os/' + PAGE_TO_SLUG[newPage])
 }

 const [session, setSession] = useState<any>(null)
 const [sessionLoaded, setSessionLoaded] = useState(false)
 const [isRecovery, setIsRecovery] = useState(false)
 const [userRole, setUserRole] = useState<string | null>(null)
 const [staffName, setStaffName] = useState('Team')
 useEffect(() => {
 // Detect PKCE recovery redirect (?mode=recovery set by /auth/callback)
 if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'recovery') {
 setIsRecovery(true)
 setPage('myprofile')
 }
 supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionLoaded(true) })
 const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
 setSession((prev: any) => prev?.access_token === s?.access_token ? prev : s)
 if (event === 'PASSWORD_RECOVERY') {
 setIsRecovery(true)
 setPage('myprofile')
 }
 })
 return () => subscription.unsubscribe()
 }, [])
 const userId = session?.user?.id
 useEffect(() => {
 if (!userId) { setUserRole(null); return }
 supabase.from('profiles').select('role').eq('id', userId).single()
 .then(({ data }) => {
 const role = data?.role ?? 'staff'
 setUserRole(role)
 setPage(prev => {
 if (role === 'admin') return prev
 if (role === 'front_office') {
 if (['dashboard', 'finances', 'profiles'].includes(prev)) return 'frontoffice'
 return prev
 }
 if (['dashboard', 'frontoffice', 'aisupport', 'finances', 'profiles'].includes(prev)) return 'myprofile'
 return prev
 })
 })
 }, [userId])

 const DEFAULT_SYSTEM_PROMPT = 'You are Azores Diving Support Bot, the friendly AI customer assistant for Azores Diving (azoresdiving.com). Always introduce yourself as Azores Diving Support Bot. You are an AI assistant — always be transparent about this if asked.\n\nYou help customers with:\n- Dive trips (Double Dive, Basic Diver, Formigas expedition)\n- SSI courses and certifications (from Basic Diver to Divemaster)\n- Prices and bookings\n- Dive sites around São Miguel, Azores\n- Equipment (Mares gear — included in entry-level courses and the Scuba Skills Update, rented separately for fun dives)\n\nOFFICIAL 2026 PRICES (always use these, never guess):\n\nDIVE TRIPS & PACKS:\n- Daily Double Dive (2 dives): €99\n- 4-Dive Pack: €189\n- 6-Dive Pack: €270\n- 8-Dive Pack: €344\n- 10-Dive Pack: €409\n- Night Dive: €75\n- Single Dive: €62 (upon request, not actively marketed)\n\nENTRY LEVEL COURSES:\n- Basic Diver (Pool only): €95\n- Basic Diver (Pool + Sea): €139\n- Basic Diver (Pool + Sea) Private Instructor: €185\n- Scuba Diver: €320 (exists, but do NOT recommend or list by default — beginners always go to Basic Diver or Open Water Diver; mention only if explicitly asked)\n- Scuba Skills Update: €95\n- Open Water Diver: €460\n- Upgrade Scuba Diver to OWD: €300\n- SSI Explorers: upon request\n\nSPECIALTY COURSES:\n- Advanced Open Water Diver: €380\n- Boat Diving: €250\n- Computer Diving: €170\n- Deep Diving: €350\n- Navigation: €260\n- Night & Limited Visibility: €350\n- Perfect Buoyancy: €200\n- Photo & Video: €200\n- Waves, Tides & Currents: €250\n- Wreck Diving: €250\n\nECOLOGY COURSES:\n- Blue Oceans: €150\n- Coral Identification: €150\n- Fish Identification: €170\n- Manta & Ray Ecology: €150\n- Marine Invertebrate Ecology: €150\n- Marine Mammal Ecology: €150\n- Nudibranch Ecology: €150\n\nPRO / LEADERSHIP:\n- React Right: €180\n- Science of Diving: €250\n- Stress & Rescue: €360\n- Dive Guide: €680\n- Divemaster: €950\n\nEQUIPMENT RENTAL (fun dives, specialties, pro courses — entry-level courses and Scuba Skills Update include equipment; torch, 15L tank and gloves are always paid extras):\n- Full Equipment incl. Computer: €30 (1 dive), €35 (2 dives), €40 (3 dives)\n- Wetsuit: €10, Regulator: €10, BCD: €10\n- Fins: €5, Mask: €5, Boots: €4, Gloves: €3\n- Torch: €10, Computer: €20, 15L Tank: €10 (extra air reserve — it does NOT extend the dive: every dive ends at 50 bar or 50 minutes, whichever comes first)\n- Personal Guide: €45 (1 dive), €80 (2 dives)\n\nINSURANCE:\n- €10/day, €23/3 days, €30/5 days\n\nSPECIAL SITES & EXTRAS (upon request):\n- Ilhéu de Vila Franca do Campo (double dive): €120\n- Sabrina e Lourenços (double dive): €160\n- Formigas expedition (2 dives): €255\n- Extra person on boat: €20\n\nCANCELLATION POLICY:\n- >72h before: full refund\n- 48–72h before: 50% refund\n- <48h or no-show: no refund\n\nDIVE SITES — exact depths (never guess, always use these):\n- Dori Wreck: 12–20 m, avg 15 m, max 20 m. WWII Liberty ship, Ponta Delgada bay. Barracuda, trevally, moray, octopus. OWD, beginner friendly.\n- Arco do Espelho: 7–25 m, avg 16 m. Volcanic arch with mirror air pocket. Giant moray Manuela, parrotfish, chromis. OWD.\n- Arco do Cavaco: 3–20 m, avg 16 m. Volcanic arches near Lagoa. Slipper lobster, dusky grouper, stingray. OWD.\n- Arcos da Caloura: 6–17 m, avg 13 m. Twin arches, calm harbour entry. Seahorses, nudibranchs, cuttlefish. OWD.\n- Ponta da Galera: 11–42 m, avg 17 m. Dramatic headland, strong current. Amberjack, banded sea bream. AOW only.\n- Viteleiro: 6–20 m, avg 14 m. Submerged seamount, north coast. Dusky grouper, rays, salema. OWD, beginner friendly.\n- Viteleiro II: 11–25 m, avg 16 m. Deeper section, stronger current. Amberjack, barracuda. AOW.\n- Ancoras de Sao Roque: 9–17 m, avg 12 m. Historic anchors on sand, south coast. OWD, beginner friendly.\n- Ilheu de Vila Franca – Cozinha: 12–20 m, avg 15 m. Marine reserve east face. Dusky grouper, salema. OWD.\n- Ilheu de Vila Franca – West: 12–20 m, avg 15 m. Marine reserve west face, more current. Amberjack, grouper. OWD.\n- Arcos do Cruzeiro 18: 12–25 m, avg 15 m. Shallow arch system, south coast. OWD, beginner friendly.\n- Arcos do Cruzeiro 30: 20–30 m, avg 25 m. Deeper arches, black coral. AOW.\n- Baixa do Ouro: 3–22 m, avg 14 m. Shallow volcanic reef, south coast. All OWD levels.\n- Formigas Banks: offshore 42 nm east, 8–35 m (wall to 80 m). Devil rays, manta, grouper. Advanced. Season July–Sept.\n- Dollabarat: offshore 42 nm east, 12–200 m. Isolated pinnacle. Manta, silky shark, tuna. Advanced.\n\nAlways respond in the same language as the customer. Keep answers under 80 words unless more detail is really needed. Encourage bookings when relevant. If a customer asks to create a support ticket or speak to a team member, tell them a ticket form will pop up now so the team can follow up directly. When summarising an issue for a ticket or staff handover, always write the summary in English.\n\nIMPORTANT — AVAILABILITY & CAPACITY: You do NOT have access to the booking calendar or schedule. If a customer asks about availability, free spots, or capacity for any date, activity or course — even a general "do you have space tomorrow?" — do NOT guess or say you will check. Instead, respond with something like: "I don\'t have live access to our booking calendar, so let me open a support ticket and the team will confirm availability directly with you! " Then the ticket form will appear automatically. This rule applies in any language (German: Platz, verfügbar, frei, Kapazität — Portuguese: disponível, vagas, lugar, amanhã).'

 const [mistralModel, setMistralModel] = useState('mistral-large-latest')
 const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
 const [kbFiles, setKbFiles] = useState<{name: string, content: string}[]>([])
 useEffect(() => {
 if (typeof window === 'undefined') return
 const m = localStorage.getItem('azd_mistral_model') || 'mistral-large-latest'
 const p = localStorage.getItem('azd_mistral_prompt_v2') || ''
 setMistralModel(m)
 if (p) setSystemPrompt(p)
 supabase.from('kb_files').select('name,content').order('created_at', { ascending: true })
 .then(({ data }) => { if (data && data.length > 0) setKbFiles(data.map(f => ({ name: f.name, content: f.content }))) })
 }, [])

 const [profilesKey, setProfilesKey] = useState(0)
 const [dayOffset, setDayOffset] = useState(0)
 const rollDate = (() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d })()
 const rollDateLabel = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : dayOffset === -1 ? 'Yesterday'
 : rollDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' })

 const [tickets, setTickets] = useState<Ticket[]>([])
 const [ticketNewMsgCount, setTicketNewMsgCount] = useState<Record<string, number>>({})
 function dbRowToTicket(row: Record<string, unknown>): Ticket {
 const d = new Date(row.created_at as string)
 const ts = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
 return {
 id: row.id as string, name: row.name as string, email: row.email as string,
 phone: (row.phone as string | null) ?? undefined,
 preferredChannel: (row.preferred_channel === 'form_submission' ? 'form_submission' : row.preferred_channel === 'whatsapp' ? 'whatsapp' : row.preferred_channel === 'internal' ? 'internal' : 'email') as 'email' | 'whatsapp' | 'form_submission' | 'internal',
 sessionId: (row.session_id as string | null) ?? undefined,
 message: (row.message as string) ?? '', conversation: (row.conversation as string) ?? '',
 timestamp: ts, status: (row.status as 'open' | 'in_progress' | 'resolved') ?? 'open',
 archived: (row.archived as boolean) ?? false,
 handlingAgent: (row.handling_agent as string | null) ?? undefined,
 claimedBy: (row.claimed_by as string | null) ?? undefined,
 claimedAt: (row.claimed_at as string | null) ?? undefined,
 unclaimedSince: (row.unclaimed_since as string | null) ?? undefined,
 note: (row.note as string | null) ?? undefined,
 }
 }
 // Tickets: folgen dem globalen Sandbox/Production-Schalter (Sandbox = nur Testtickets, Production = nur echte)
 const fetchTickets = () => sim.sandbox === null ? Promise.resolve() : supabase.from('support_tickets').select('*').eq('is_test', sim.sandbox).order('created_at', { ascending: false })
 .then(({ data }) => { if (data) setTickets(data.map(dbRowToTicket)) })
 const fetchTicketMsgCounts = () => supabase.from('ticket_new_message_counts').select('ticket_id, new_count')
 .then(({ data }) => {
 if (data) {
 const map: Record<string, number> = {}
 data.forEach((r: { ticket_id: string; new_count: number }) => { map[r.ticket_id] = r.new_count })
 setTicketNewMsgCount(map)
 }
 })
 useEffect(() => {
 setTickets([])
 fetchTickets()
 fetchTicketMsgCounts()
 const channel = supabase
 .channel('support_tickets_realtime')
 .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
 fetchTickets()
 })
 .subscribe()
 const msgChannel = supabase
 .channel('ticket_messages_badge')
 .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages' }, () => {
 fetchTicketMsgCounts()
 })
 .subscribe()
 // Polling fallback — picks up new tickets even if Realtime misses them
 const pollInterval = setInterval(() => { fetchTickets() }, 30000)
 return () => { supabase.removeChannel(channel); supabase.removeChannel(msgChannel); clearInterval(pollInterval) }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [sim.sandbox])
 async function addTicket(t: Omit<Ticket, 'id' | 'timestamp' | 'status' | 'archived'>) {
 // Ohne .select(): ein Nicht-Admin darf ein neues Ticket im anderen Modus nicht zurueckLESEN (RLS) — das Insert selbst ist erlaubt.
 const { error } = await supabase.from('support_tickets').insert({
 name: t.name, email: t.email, phone: t.phone ?? null,
 preferred_channel: t.preferredChannel, session_id: t.sessionId ?? null,
 message: t.message, conversation: t.conversation,
 })
 if (error) { alert(`Ticket could not be saved: ${error.message} (${error.code ?? 'n/a'})`); return }
 fetchTickets()
 }
 function resolveTicket(id: string) {
 supabase.from('support_tickets').update({ status: 'resolved' }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, status: 'resolved' } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'status_changed', oldValue: { status: tickets.find(t => t.id === id)?.status }, newValue: { status: 'resolved' } })
 const tkt = tickets.find(t => t.id === id)
 if (tkt?.sessionId) {
 const bc = supabase.channel('staff-reply-' + tkt.sessionId)
 Promise.race([
 new Promise<void>(res => { bc.subscribe(s => { if (s === 'SUBSCRIBED') res() }) }),
 new Promise<void>(res => setTimeout(res, 3000))
 ]).then(() => bc.send({ type: 'broadcast', event: 'ticket_resolved', payload: {} }))
 .then(() => supabase.removeChannel(bc)).catch(() => {})
 }
 }
 function unresolveTicket(id: string) {
 // Wiedereroeffnetes Ticket liegt ab jetzt neu auf dem Stapel -> Alters-Uhr startet neu.
 const now = new Date().toISOString()
 supabase.from('support_tickets').update({ status: 'open', unclaimed_since: now }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, status: 'open', unclaimedSince: now } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'status_changed', oldValue: { status: tickets.find(t => t.id === id)?.status }, newValue: { status: 'open' } })
 }
 function setInProgressTicket(id: string) {
 supabase.from('support_tickets').update({ status: 'in_progress' }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, status: 'in_progress' } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'status_changed', oldValue: { status: tickets.find(t => t.id === id)?.status }, newValue: { status: 'in_progress' } })
 }
 function claimTicket(id: string, name: string) {
 const now = new Date().toISOString()
 supabase.from('support_tickets').update({ status: 'in_progress', claimed_by: name, claimed_at: now }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, status: 'in_progress', claimedBy: name, claimedAt: now } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'status_changed', oldValue: { status: tickets.find(t => t.id === id)?.status }, newValue: { status: 'in_progress', claimed_by: name } })
 }
 function unclaimTicket(id: string) {
 // Freigabe: Ticket ist ab jetzt wieder unbeaufsichtigt -> Alters-Uhr startet neu.
 const now = new Date().toISOString()
 supabase.from('support_tickets').update({ status: 'open', claimed_by: null, claimed_at: null, unclaimed_since: now }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, status: 'open', claimedBy: undefined, claimedAt: undefined, unclaimedSince: now } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'status_changed', oldValue: { status: 'in_progress' }, newValue: { status: 'open', claimed_by: null } })
 }
 function takeoverTicket(id: string, name: string) {
 const now = new Date().toISOString()
 supabase.from('support_tickets').update({ claimed_by: name, claimed_at: now }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, claimedBy: name, claimedAt: now } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'status_changed', oldValue: { claimed_by: tickets.find(t => t.id === id)?.claimedBy }, newValue: { claimed_by: name } })
 }
 function archiveTicket(id: string) {
 supabase.from('support_tickets').update({ archived: true }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, archived: true } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'ticket_archived', newValue: { archived: true } })
 }
 function unarchiveTicket(id: string) {
 supabase.from('support_tickets').update({ archived: false }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, archived: false } : t))
 if (session?.user?.id) logAuditEvent({ ticketId: id, userId: session.user.id, userEmail: session.user.email ?? '', actionType: 'ticket_unarchived', newValue: { archived: false } })
 }
 function saveTicketNote(id: string, note: string) {
 supabase.from('support_tickets').update({ note: note || null }).eq('id', id).then(() => {})
 setTickets(ts => ts.map(t => t.id === id ? { ...t, note: note || undefined } : t))
 }

 return (
 <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh' }}>
 {/* ── MEMBER SUB-NAV ── */}
 {!!session && (
 <div ref={el => {
 if (!el || typeof window === 'undefined') return
 const set = () => document.documentElement.style.setProperty('--member-subnav-h', `${isMobile ? 64 + el.offsetHeight : el.offsetHeight}px`)
 set()
 }} style={{
 position: 'sticky', top: isMobile ? '64px' : 0, zIndex: 99,
 background: 'rgba(9,9,9,.97)', backdropFilter: 'blur(8px)',
 borderBottom: '1px solid rgba(243,239,230,.18)',
 display: 'flex', alignItems: 'stretch', padding: isMobile ? '0 8px' : '0 24px', gap: '2px',
 overflowX: 'auto', scrollbarWidth: 'none',
 }}>
 {([
 ['', 'Dashboard', 'dashboard'],
 ['', 'Front Office', 'frontoffice'],
 ['', 'Finances', 'finances'],
 ['', 'AI Support', 'aisupport'],
 ['', 'Schedule', 'schedule'],
 ['', 'Admin', 'profiles'],
 ['', 'Knowledge Base', 'knowledgebase'],
 ['', 'Testing', 'testing'],
 ['', 'My Profile', 'myprofile'],
 ] as [string, string, MemberPage][])
 .filter(([, , p]) => {
 if (userRole === null) return true
 if (p === 'finances' || p === 'profiles') return userRole === 'admin'
 if (p === 'frontoffice' || p === 'aisupport') return userRole === 'admin' || userRole === 'front_office'
 return true
 })
 .map(([icon, label, p]) => (
 <button key={p} onClick={() => { if (p === 'profiles' && page === 'profiles') setProfilesKey(k => k + 1); else if (p === 'profiles' && (page === 'boatmanagement' || page === 'diagnostics' || page === 'marketing' || page === 'settings')) memberNav('profiles'); else memberNav(p) }} style={{
 padding: isMobile ? '10px 18px' : '10px 14px', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
 border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: s.font,
 display: 'flex', alignItems: 'center', gap: '6px',
 color: (p === 'profiles' ? (page === 'profiles' || page === 'boatmanagement' || page === 'diagnostics' || page === 'marketing' || page === 'settings') : page === p) ? s.accent : s.muted,
 borderBottom: (p === 'profiles' ? (page === 'profiles' || page === 'boatmanagement' || page === 'diagnostics' || page === 'marketing' || page === 'settings') : page === p) ? `2px solid ${s.accent}` : '2px solid transparent',
 transition: 'color .15s',
 }}>
 <span style={{ fontSize: '14px' }}>{icon}</span>
 {label}
 </button>
 ))}
 <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '8px', flexShrink: 0 }}>
 {userRole === 'admin' && sim.sandbox !== null && (
 <button type="button" disabled={sim.busy} onClick={sim.toggle}
 title={sim.error ?? (sim.sandbox ? 'Sandbox: only test data is shown everywhere. Click to switch to Production.' : 'Production: only real data is shown everywhere. Click to switch to Sandbox.')}
 style={{ padding: '5px 12px', borderRadius: 0, fontSize: '14px', fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase', cursor: sim.busy ? 'wait' : 'pointer', fontFamily: s.font, whiteSpace: 'nowrap', opacity: sim.busy ? .6 : 1,
 background: sim.error ? 'rgba(201,146,140,.15)' : sim.sandbox ? 'rgba(201,180,138,.18)' : 'rgba(183,196,176,.10)',
 color: sim.error ? '#c9928c' : sim.sandbox ? '#c9b48a' : '#b7c4b0',
 border: `1px solid ${sim.error ? 'rgba(201,146,140,.5)' : sim.sandbox ? 'rgba(201,180,138,.5)' : 'rgba(183,196,176,.35)'}` }}>
 {sim.busy ? 'Switching…' : sim.error ? ` ${sim.error.slice(0, 60)}` : sim.sandbox ? ' Sandbox' : ' Production'}
 </button>
 )}
 {!isMobile && (
 <>
 <button type="button" onClick={() => { window.location.href = '/dive-os/book' }}
 title="Open the customer booking page"
 style={{ padding: '5px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.45)', background: 'transparent', color: s.accent, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>
 Booking page
 </button>
 <button type="button" onClick={() => { window.location.href = '/' }}
 title="Open the public website"
 style={{ padding: '5px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.45)', background: 'transparent', color: s.accent, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap' }}>
 Public site
 </button>
 </>
 )}
 <span style={{ fontSize: '14px', color: s.muted, opacity: .4 }}></span>
 <button onClick={() => supabase.auth.signOut()} style={{ padding: '5px 12px', borderRadius: 0, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'rgba(255,255,255,.35)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font, whiteSpace: 'nowrap', transition: 'all .15s' }}
 onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(201,146,140,.12)'; (e.currentTarget as HTMLElement).style.color = '#c9928c'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(201,146,140,.3)' }}
 onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.35)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.1)' }}>
 Sign out
 </button>
 </div>
 </div>
 )}

 {/* ── ADMIN SUB-NAV ── */}
 {!!session && (page === 'profiles' || page === 'boatmanagement' || page === 'diagnostics' || page === 'marketing' || page === 'settings') && userRole === 'admin' && (
 <div style={{ display: 'flex', gap: '4px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(0,0,0,.25)' }}>
 {([
 ['', 'Boats', 'boatmanagement'],
 ['', 'Staff', 'profiles'],
 ['', 'Marketing', 'marketing'],
 ['', 'Diagnostics', 'diagnostics'],
 ['', 'Settings', 'settings'],
 ] as [string, string, MemberPage][]).map(([icon, label, p]) => (
 <button key={p}
 onClick={() => memberNav(p)}
 style={{ padding: '5px 14px', fontSize: '14px', fontWeight: 500, border: 'none', borderRadius: 0, cursor: 'pointer', fontFamily: s.font, background: page === p ? 'rgba(243,239,230,.15)' : 'transparent', color: page === p ? s.accent : s.muted, transition: 'all .15s' }}>
 {icon} {label}
 </button>
 ))}
 </div>
 )}

 {/* ── MEMBER PAGES ── */}
 <main>
 {page === 'dashboard' && (!sessionLoaded ? null : session ? <PageDashboard nav={memberNav} dayOffset={dayOffset} setDayOffset={setDayOffset} userRole={userRole} /> : <PageLogin onLogin={() => {}} />)}
 {page === 'frontoffice' && (!sessionLoaded ? null : !session ? <PageLogin onLogin={() => {}} /> : userRole === null ? null : (userRole === 'admin' || userRole === 'front_office' ? <PageFrontOffice nav={memberNav} userRole={userRole} /> : <PageAccessDenied nav={memberNav} />))}
 {page === 'aisupport' && (!sessionLoaded ? null : !session ? <PageLogin onLogin={() => {}} /> : userRole === null ? null : (userRole === 'admin' || userRole === 'front_office' ? <PageAISupport nav={memberNav} tickets={tickets} newMsgCount={ticketNewMsgCount} clearTicketBadge={(id) => setTicketNewMsgCount(prev => ({ ...prev, [id]: 0 }))} onRefresh={fetchTickets} onResolve={resolveTicket} onUnresolve={unresolveTicket} onInProgress={setInProgressTicket} onClaim={claimTicket} onUnclaim={unclaimTicket} onTakeover={takeoverTicket} onArchive={archiveTicket} onUnarchive={unarchiveTicket} onSaveNote={saveTicketNote} mistralModel={mistralModel} setMistralModel={setMistralModel} systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt} kbFiles={kbFiles} setKbFiles={setKbFiles} session={session} userRole={userRole} /> : <PageAccessDenied nav={memberNav} />))}
 {page === 'finances' && (!sessionLoaded ? null : !session ? <PageLogin onLogin={() => {}} /> : userRole === null ? null : (userRole === 'admin' ? <PageFinances nav={memberNav} /> : <PageAccessDenied nav={memberNav} />))}
 {!sessionLoaded || !session ? (page === 'schedule' ? <PageLogin onLogin={() => {}} /> : null) : (
 <div style={{display: page === 'schedule' ? 'block' : 'none'}}>
 <PageSchedule nav={memberNav} session={session} readonly={userRole !== null && userRole !== 'admin'} />
 </div>
 )}
 {!sessionLoaded || !session || userRole === null ? null : userRole !== 'admin' ? (page === 'profiles' ? <PageAccessDenied nav={memberNav} /> : null) : (
 <div style={{display: page === 'profiles' ? 'block' : 'none'}}>
 <PageProfiles key={profilesKey} nav={memberNav} session={session} />
 </div>
 )}
 {page === 'testing' && (!sessionLoaded ? null : session ? <PageTesting session={session} /> : <PageLogin onLogin={() => {}} />)}
 {page === 'myprofile' && ((session || isRecovery) ? <PageMyProfile session={session} nav={memberNav} isRecovery={isRecovery} onRecoveryDone={() => setIsRecovery(false)} /> : sessionLoaded ? <PageLogin onLogin={() => {}} /> : null)}
 {page === 'knowledgebase' && (!sessionLoaded ? null : session ? <PageKnowledgeBase /> : <PageLogin onLogin={() => {}} />)}
 {page === 'diagnostics' && (!sessionLoaded ? null : !session ? <PageLogin onLogin={() => {}} /> : userRole === null ? null : (userRole === 'admin' ? <PageDiagnostics nav={memberNav} /> : <PageAccessDenied nav={memberNav} />))}
 {page === 'marketing' && (!sessionLoaded ? null : !session ? <PageLogin onLogin={() => {}} /> : userRole === null ? null : (userRole === 'admin' ? <PageMarketing /> : <PageAccessDenied nav={memberNav} />))}
 {page === 'boatmanagement' && (!sessionLoaded ? null : !session ? <PageLogin onLogin={() => {}} /> : userRole === null ? null : (userRole === 'admin' ? <PageBoatManagement nav={memberNav} /> : <PageAccessDenied nav={memberNav} />))}
 {page === 'settings' && (!sessionLoaded ? null : !session ? <PageLogin onLogin={() => {}} /> : userRole === null ? null : (userRole === 'admin' ? <PageSettings nav={memberNav} /> : <PageAccessDenied nav={memberNav} />))}
 </main>
 <ToastHost />
 </div>
 )
}
