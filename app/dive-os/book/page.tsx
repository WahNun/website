'use client'

import { closePicker } from '@/lib/scrollBack'
import React, { useEffect, useState, Suspense } from 'react'
import { POLICY_VERSION, CANCELLATION_SUMMARY, CANCELLATION_BY_US, INSURANCE_NON_REFUNDABLE, TERMS_PATH } from '@/lib/policy'
import { SITE_META, DAY_BOAT_SLUGS } from '@/lib/siteMeta'
import { useSearchParams } from 'next/navigation'
import { supabase, s } from '@/components/pages/_shared'
import SessionPicker, { type Picked } from '@/components/booking/SessionPicker'
import CourseStartPicker from '@/components/booking/CourseStartPicker'
import DatePicker from '@/components/booking/DatePicker'
import { computeInsuranceBlocks, needsRefresher } from '@/lib/insurance'
import { requiresLastDive, asksLastDive, isSkillsUpdate, isProgramProduct, REFRESHER_PRODUCT_ID } from '@/lib/productType'
import { isSandboxBooking } from '@/lib/sandboxClient'
import { ONLINE_DEPOSIT_THRESHOLD_CENTS, asOnlineDepositMode, depositUnitCents, type OnlineDepositMode } from '@/lib/onlineDeposit'
import SplitGuestCard, { divesPerSession, type GuestSpec } from '@/components/booking/SplitGuestCard'
import { useCheckoutTelemetry, track as trackCheckout } from '@/lib/telemetry/checkout'
import { resolveBookingMode, resolveWindowMode, type WindowRule, type WindowMode } from '@/lib/bookingWindows'
import { isNightProduct } from '@/lib/availability'

/**
 * Kundenseitige Buchungsstrecke.
 *
 * Produkt Datum Session Gäste Add-ons Stripe Checkout. Die Preise kommen aus
 * course_prices, der Server rechnet sie noch einmal selbst nach — was hier im
 * Browser steht, ist reine Anzeige.
 */

type Price = { id: string; name: string; price_cents: number; category: string; sessions_included: number | null; duration_days_min: number | null; duration_days_usual?: number | null; boat_days: number | null; request_only: boolean; equipment_included?: boolean; computer_included?: boolean; insurance_included?: boolean }
type AddonPrice = { id: string; name: string; price_cents: number; category: string; addon_scope: string }

const CATEGORY_LABEL: Record<string, string> = {
 dives: 'Dives & Packs',
 entry: 'Entry level',
 specialty: 'Specialty courses',
 ecology: 'Ecology',
 pro: 'Pro & Leadership',
 excursion: 'Excursions',
}

function BookInner() {
 // Vorbelegung per Query-Parameter — so kann der Front-Office-Simulator die
 // Seite mit dem Stand aus dem Formular oeffnen und zeigt dem Team genau das,
 // was der Gast sehen wuerde.
 const qp = useSearchParams()
 const sandboxUi = qp.get('sandbox') === '1'
 const [prices, setPrices] = useState<Price[]>([])
 const [equipmentAddons, setEquipmentAddons] = useState<AddonPrice[]>([])
 // Vorbelegung vom Chatbot-Link: addons=id1,id2
 const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(() => new Set((qp.get('addons') || '').split(',').map(x => x.trim()).filter(x => /^[a-z0-9-]{3,40}$/.test(x))))
 const [productId, setProductId] = useState(qp.get('product') || 'daily-double-dive')
 const [picked, setPicked] = useState<Picked[]>(() => {
 // dates=YYYY-MM-DD:am,YYYY-MM-DD:pm (Chatbot-Link mit allen Tauchtagen)
 const parsed: Picked[] = []
 for (const x of (qp.get('dates') || '').split(',').slice(0, 20)) {
 const m = /^(\d{4}-\d{2}-\d{2}):(am|pm)$/.exec(x.trim())
 if (m && !parsed.some(pp => pp.date === m[1] && pp.session === m[2])) parsed.push({ date: m[1], session: m[2] as 'am' | 'pm' })
 }
 if (parsed.length > 0) return parsed
 const d = qp.get('date')
 return d && /^\d{4}-\d{2}-\d{2}$/.test(d)
 ? [{ date: d, session: qp.get('session') === 'pm' ? 'pm' : 'am' }]
 : []
 })
 const [capReqKeys] = useState<Set<string> | null>(() => qp.get('capreq') === '1' ? new Set(picked.map(x => `${x.date}_${x.session}`)) : null)
 const [guests, setGuests] = useState(Math.min(20, Math.max(1, parseInt(qp.get('guests') || '1', 10) || 1)))
 // Höchste Gästezahl, die alle gewählten Tage noch hergeben. Kommt aus dem
 // Kalender, damit Anzeige und Wirklichkeit nicht auseinanderlaufen.
 const [maxSeats, setMaxSeats] = useState<number | null>(null)
 const [email, setEmail] = useState(qp.get('email') || '')
 const draftId = qp.get('draft_id')
 // Herkunft für Auswertung: Chatbot-Link (?src=chatbot oder Draft) vs. Website-CTA
 const bookingOrigin: 'chatbot' | 'website' = qp.get('src') === 'chatbot' || draftId ? 'chatbot' : 'website'
 const [agreed, setAgreed] = useState(false)
 const [termsAgreed, setTermsAgreed] = useState(false)
 /** '' = noch nichts gewaehlt, 'own' = eigene Police, 'auto' = wir wählen automatisch */
 const [insuranceChoice, setInsuranceChoice] = useState<'' | 'own' | 'auto'>(() => { const v = qp.get('insurance'); return v === 'own' || v === 'auto' ? v : '' })
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState<string | null>(null)
 // Request-Modus (Lucas 28.10., Low Season): site_settings.booking_mode = 'request' kein Stripe, Anfrage ans Team.
 // Der Server entscheidet verbindlich (/api/checkout antwortet mit { request: true }); hier nur Anzeige/Label.
 const [bookingMode, setBookingMode] = useState<WindowMode | null>(null)
 const [windows, setWindows] = useState<WindowRule[]>([])
 const [honeypot, setHoneypot] = useState('')
 // Name/Handy aus dem Chatbot-Link (?name=First Last&phone=…) vorbelegen — keine doppelten Fragen
 const [guestFirst, setGuestFirst] = useState(() => { const n = (qp.get('name') || '').trim().split(/\s+/); return n.length > 1 ? n.slice(0, -1).join(' ') : (n[0] || '') })
 const [guestLast, setGuestLast] = useState(() => { const n = (qp.get('name') || '').trim().split(/\s+/); return n.length > 1 ? n[n.length - 1] : '' })
 const [guestPhone, setGuestPhone] = useState(() => (qp.get('phone') || '').slice(0, 30))
 // Weitere Gäste (Request-Modus): nur Vor-/Nachname, Index 0 = Gast 2
 const [otherGuests, setOtherGuests] = useState<{ first: string; last: string }[]>(() => {
 // Chatbot-Link: ?names=First Last|First Last|… (Taucher 1 = Bucher, steht schon in first/last)
 const raw = (qp.get('names') || '').split('|').map(x => x.trim()).filter(Boolean).slice(1, 20)
 return raw.map(n => { const p = n.split(/\s+/); return p.length > 1 ? { first: p.slice(0, -1).join(' '), last: p[p.length - 1] } : { first: p[0] || '', last: '' } })
 })
 const guestName = `${guestFirst.trim()} ${guestLast.trim()}`.trim()
 const [requestDone, setRequestDone] = useState<{ reference: string; mailError?: string } | null>(null)
 // 50 %-Deposit (Lucas 30.10.): site_settings.online_deposit_mode off | sandbox | live. Der Server prüft verbindlich
 // (Modus + Warenkorb ≥ 350 €); hier nur Anzeige. Ladefehler Option bleibt weg, Grund sichtbar.
 const [depositMode, setDepositMode] = useState<OnlineDepositMode | null>(null)
 const [depositLoadError, setDepositLoadError] = useState<string | null>(null)
 const [depositWanted, setDepositWanted] = useState(false)
 useEffect(() => {
 fetch('/api/site-settings?key=online_deposit_mode').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
 .then(d => setDepositMode(asOnlineDepositMode(d?.value)))
 .catch(e => { setDepositMode('off'); setDepositLoadError(e instanceof Error ? e.message : String(e)); console.warn('[book] online_deposit_mode load failed:', e) })
 }, [])
 useEffect(() => {
 fetch('/api/booking-windows').then(r => r.json())
 .then(d => { setBookingMode(d?.default_mode === 'request' ? 'request' : 'open'); setWindows(Array.isArray(d?.windows) ? d.windows : []) })
 .catch(() => setBookingMode('open'))
 }, [])
 const [favouriteSpot, setFavouriteSpot] = useState(() => { const v = qp.get('spot') || ''; return v in SITE_META ? v : '' })
 // Kursbuchung: Startdatum + Session
 const [courseStart, setCourseStart] = useState<{ date: string } | null>(() => { const d = qp.get('date'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? { date: d } : null })
 // Warenkorb-Zeilen: welcher Date-Picker ist gerade aufgeklappt
 const [openPicker, setOpenPicker] = useState<'refresher' | 'product' | null>(null)

 // Mobile: geöffneten Picker komplett in den Viewport holen (sonst muss man nach „Select dates“ erst selbst runterscrollen)
 useEffect(() => {
 if (!openPicker) return
 const t = setTimeout(() => {
 try { document.querySelector('[data-pickrow][data-open="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch (e) { console.warn('[picker] scroll failed', e) }
 }, 80)
 return () => clearTimeout(t)
 }, [openPicker])
 const [todayStr] = useState(() => new Date().toISOString().slice(0, 10))
 // Welcher Last-dive-Kalender ist aufgeklappt (Index des Tauchers)
 const [openLastDive, setOpenLastDive] = useState<number | null>(null)
 // Tag für den automatischen Scuba Skills Update (vor dem ersten Tauchtag)
 const [refresherDate, setRefresherDate] = useState(() => { const d = qp.get('refresher_date'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '' })
 // Chatbot-Link bringt den Refresher-Tag schon mit: die automatische Uebernahme des ersten Tauchtags darf ihn nicht ueberschreiben
 const prefilledRefresher = React.useRef(Boolean(qp.get('refresher_date')))
 // Bot-Link bringt Termin/Equipment/Versicherung mit: beim Wechsel in die Per-Gast-Ansicht (mehrere Gaeste) uebernehmen die Gast-Karten diese Werte
 const [linkPrefill] = useState(() => Boolean(qp.get('date') || qp.get('dates')))
 // B-9: Letzter Tag auf der Insel
 const [lastDayOnIsland, setLastDayOnIsland] = useState(() => { const d = qp.get('lastday'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '' })
 // Online-Split (Lucas 24.10.): pro Person eigenes Produkt/eigene Tage — Opt-in ab 2 Gästen, eine Zahlung, ein Check-in-Link pro Person
 const [split, setSplit] = useState(false)
 const [guestSpecs, setGuestSpecs] = useState<Record<string, GuestSpec>>({})
 // Zusatzprodukte je Person (Online-Split): { id, person (1-basiert) }
 const [extras, setExtras] = useState<{ id: number; person: number }[]>([])
 const [extraSeq, setExtraSeq] = useState(1)
 // Letzter Tauchgang pro Gast — Pflicht bei Produkten mit Vorzertifikat (siehe requiresLastDive)
 const [lastDiveDates, setLastDiveDates] = useState<string[]>(() => (qp.get('lastdive') || '').split(',').map(x => x.trim()).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))
 // Scuba Skills Update ist nicht selbst online buchbar (bookable_online=false), wird aber
 // automatisch beigelegt — Preis deshalb separat laden.
 const [refresherProduct, setRefresherProduct] = useState<{ id: string; name: string; price_cents: number } | null>(null)
 useEffect(() => {
 supabase.from('course_prices').select('id,name,price_cents').eq('id', REFRESHER_PRODUCT_ID).maybeSingle()
 .then(({ data }) => { if (data?.price_cents) setRefresherProduct(data) })
 }, [])

 useEffect(() => {
 supabase.from('course_prices')
 .select('id,name,price_cents,category,sessions_included,duration_days_min,duration_days_usual,boat_days,request_only,equipment_included,computer_included,insurance_included')
 .eq('bookable_online', true)
 .gt('price_cents', 0)
 .order('category').order('price_cents')
 .then(({ data }) => {
 const rows = (data ?? []).filter(p => !('is_placeholder' in p) || !p.is_placeholder) as Price[]
 setPrices(rows)
 setProductId(prev => rows.some(p => p.id === prev) ? prev : (rows.some(p => p.id === 'daily-double-dive') ? 'daily-double-dive' : (rows[0]?.id ?? prev)))
 })
 }, [])

 useEffect(() => {
 supabase.from('course_prices')
 .select('id,name,price_cents,category,addon_scope')
 .eq('bookable_online', true)
 .eq('kind', 'addon')
 .eq('category', 'equipment')
 .gt('price_cents', 0)
 .order('price_cents')
 .then(({ data }) => {
 setEquipmentAddons((data ?? []) as AddonPrice[])
 })
 }, [])

 // Kurse nutzen duration_days_min (aufeinanderfolgende Tage);
 // Dive-Packs nutzen sessions_included (beliebig wählbare Tage).
 const COURSE_CATS = ['entry', 'specialty', 'ecology', 'pro']
 const currentProduct = prices.find(p => p.id === productId)
 const isCourse = COURSE_CATS.includes(currentProduct?.category ?? '')
 // Divemaster / Dive Guide: immer Anfrage, nur Wunsch-Starttag + letzter Tag auf der Insel (Pflicht) — das Team plant die Wochen
 const programProduct = isProgramProduct(currentProduct?.id)
 const required = programProduct ? 1 : isCourse
 ? (currentProduct?.duration_days_min ?? 1)
 : (currentProduct?.sessions_included ?? 1)

 // Wenn Kurs gewählt + Startdatum gesetzt N aufeinanderfolgende Sessions generieren
 useEffect(() => {
 if (!isCourse) return
 if (!courseStart) { setPicked([]); return }
 const sessions: Picked[] = []
 const base = new Date(courseStart.date + 'T12:00:00')
 for (let i = 0; i < required; i++) {
 const d = new Date(base)
 d.setDate(d.getDate() + i)
 // Kurse: kein AM/PM — Zeitfenster legt der Instructor fest
 sessions.push({ date: d.toISOString().slice(0, 10), session: 'tbd' })
 }
 setPicked(sessions)
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [isCourse, courseStart?.date, required])

 const product = prices.find(p => p.id === productId)
 const productTotal = product ? (product.price_cents * guests) / 100 : 0
 // Kein willkürlicher Deckel mehr: was auf ein Boot passt, ist die Grenze.
 // Vor der Tageswahl steht die Zahl noch nicht fest — dann bleibt es bei 20,
 // und der Kalender sperrt die Tage, die nicht reichen.
 // Offshore-Fahrten hängen an Wetter, Mindestteilnehmerzahl und einem eigenen
 // Boot. Die gehören ins Gespräch, nicht in einen Sofortkauf.
 // Single Dive + Night Dive laufen ueber den normalen Request-Ablauf (Datum waehlen -> Anfrage -> Freigabe -> Bestaetigen & Bezahlen).
 // Offshore-Ausfluege bleiben bei "Send an enquiry" (eigener Anfrage-Planer ist geplant).
 const productRequest = programProduct || (Boolean(product?.request_only) && (product?.id === 'single-dive' || product?.id === 'night-dive'))
 const requestOnly = Boolean(product?.request_only) && !productRequest
 // Buchungsfenster: Default (Schalter) oder Fenster-Regel für die gewählten Tage; ohne Auswahl zählt der heutige Tag als Vorschau
 const fallbackMode: WindowMode = bookingMode === 'request' ? 'request' : 'open'
 // Im Split liegen die Tage in den Gast-Karten (nicht in `picked`) — sonst sieht die Seite den Request-Tag nicht, der Server aber schon
 const splitDays = Object.values(guestSpecs).flatMap(g => [
 ...g.sessions.map(x => ({ date: x.date, session: x.session as string | null, product_id: g.product_id })),
 ...(g.refresher_date ? [{ date: g.refresher_date, session: null as string | null, product_id: g.product_id }] : []),
 ])
 const windowDays = picked.length > 0 ? picked.map(x => ({ date: x.date, session: x.session as string | null, product_id: productId })) : splitDays
 const windowDecision = resolveBookingMode(windows, fallbackMode,
 windowDays.length > 0 ? windowDays : [{ date: todayStr, session: null, product_id: productId }])
 // Bot-Link mit capreq=1: die vorbelegten Sessions sind ausgebucht und gehen als Anfrage raus (der Server prueft das erneut). Aendert der Gast die Tage, gilt der normale Weg.
 const dayKeys = windowDays.filter(x => x.session).map(x => `${x.date}_${x.session}`)
 const capacityRequest = capReqKeys !== null && dayKeys.length > 0 && dayKeys.every(k => capReqKeys.has(k)) && windowDecision.mode !== 'blocked'
 const capOnly = capacityRequest && windowDecision.mode !== 'request'
 const requestMode = windowDecision.mode === 'request' || capacityRequest || (productRequest && windowDecision.mode !== 'blocked')
 const guestCeiling = capacityRequest ? 20 : (maxSeats ?? 20)
 // Heute schon Low Season? Dann steht der Disclaimer dauerhaft über dem Formular (kein Popup). In der High Season
 // greift das Popup erst, wenn der Gast einen Low-Season-Tag wählt.
 const todayRequest = resolveWindowMode(windows, fallbackMode, { date: todayStr, session: null, product_id: productId }).mode === 'request'
 // Low-Season-Spanne für den Disclaimer: aus dem greifenden Fenster (Default-Schalter kennt keine Spanne)
 const requestSpan = (() => {
 if (!requestMode) return null
 const slots = picked.length > 0 ? picked.map(x => ({ date: x.date, session: x.session as string | null, product_id: productId })) : [{ date: todayStr, session: null as string | null, product_id: productId }]
 const rule = slots.map(sl => resolveWindowMode(windows, fallbackMode, sl)).find(r => r.mode === 'request' && r.rule)?.rule ?? null
 if (!rule) return 'November – April'
 const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
 return `${f(rule.from_date)} – ${f(rule.to_date)}`
 })()
 // Request-Disclaimer als Modal (Lucas 28.10.): einmal pro Sitzung bestätigen, sobald ein gewählter Tag im Request-Modus liegt
 // Einmal pro Seitenaufruf (nicht pro Browser-Sitzung — sonst sieht ein zweiter Test das Popup nie wieder)
 const [requestAck, setRequestAck] = useState<boolean>(false)
 const showRequestModal = requestMode && (!todayRequest || productRequest) && !requestAck && !requestDone
 // Request-Tag wieder entfernt Bestätigung zurücksetzen, damit der Hinweis bei erneuter Wahl wieder kommt
 useEffect(() => { if (!requestMode && requestAck) setRequestAck(false) }, [requestMode, requestAck])
 const ackRequest = () => setRequestAck(true)
 const windowBlockedFor = (date: string, session: string, pid: string) => {
 const r = resolveWindowMode(windows, fallbackMode, { date, session, product_id: pid })
 return r.mode === 'blocked' ? (r.guest_text || 'Not bookable online for this date') : null
 }
 const windowBlockedReason = (date: string, session: string) => windowBlockedFor(date, session, productId)
 // Low Season: Tag liegt in einem Anfrage-Fenster (gleiche Regel wie der Server in /api/checkout)
 const windowRequestFor = (date: string, pid: string) => resolveWindowMode(windows, fallbackMode, { date, session: 'tbd', product_id: pid }).mode === 'request'
 const torchAddon = equipmentAddons.find(a => a.id === 'rental-torch' || a.name.toLowerCase().includes('torch'))
 const tankAddon = equipmentAddons.find(a => a.id === 'rental-tank-15l' || a.name.toLowerCase().includes('15l'))
 const glovesAddon = equipmentAddons.find(a => a.id === 'rental-gloves' || a.name.toLowerCase().includes('glove'))
 const upsellIds = new Set([torchAddon?.id, tankAddon?.id, glovesAddon?.id].filter((id): id is string => Boolean(id)))
 const fullEquipAddon = equipmentAddons.find(a => a.id === 'rental-full-double') ?? equipmentAddons.find(a => /full.?equip/i.test(a.name))
 /** Zahlbare Extras, die das Full Equipment nicht abdeckt */
 const EXTRA_IDS = new Set(['rental-torch', 'rental-tank-15l', 'rental-gloves'])
 /** Tauchtage der Buchung (Miete gilt pro Taucher und Tag) */
 const diveDays = Math.max(1, new Set(picked.map(x => x.date)).size)
 // Equipment-Inklusiv-Regel (course_prices.equipment_included): keine Mietteile anbieten,
 // nur zahlbare Extras (Torch, 15L Tank, Gloves — Computer, wenn nicht inkludiert).
 const equipmentIncluded = Boolean(product?.equipment_included)
 const EXTRA_NAMES = ['torch', '15l tank', 'gloves']
 const isEntryCourse = currentProduct?.category === 'entry'
 const regularAddons = equipmentAddons.filter(a => !upsellIds.has(a.id)).filter(a => {
 if (isEntryCourse) return false
 if (!equipmentIncluded) return true
 const n = a.name.toLowerCase()
 return EXTRA_NAMES.some(x => n.includes(x)) || (n.includes('computer') && !product?.computer_included)
 })
 const isNightDive = currentProduct?.name.toLowerCase().includes('night') ?? false

 // Tagesversicherungen stehen als eigene Produkte in course_prices.
 const insurancePlans = prices.filter(p => p.category === 'insurance')

 // Unikate Tauchtage aus der Auswahl
 const uniqueDates = [...new Set(picked.map(p => p.date))]

 /**
 * Berechnet die optimalen DAN-Blöcke für die gewählten Tauchtage.
 * Gibt nur Blöcke zurück, für die ein Preisobjekt in insurancePlans existiert.
 */
 type PriceBlock = { plan: Price; units: number; days: number }

 function getAutoInsuranceBlocks(): PriceBlock[] {
 // Der Tag des Scuba Skills Update ist ein Wassertag mitversichern (vorher nur die Tauchtage)
 const insDates = refresherDate ? [...new Set([...uniqueDates, refresherDate])] : uniqueDates
 if (insurancePlans.length === 0 || insDates.length === 0) return []
 const blocks = computeInsuranceBlocks(insDates)
 const result: PriceBlock[] = []
 for (const b of blocks) {
 const plan = insurancePlans.find(p => p.id === b.planId)
 if (plan) result.push({ plan, units: b.units, days: b.days })
 }
 return result
 }

 // Versicherung im Kurspreis enthalten (course_prices.insurance_included) keine Abfrage, kein DAN-Posten
 const insuranceIncluded = Boolean(product?.insurance_included)
 const autoInsBlocks = insuranceChoice === 'auto' && !insuranceIncluded && !programProduct ? getAutoInsuranceBlocks() : []
 // Gesamtbetrag pro Taucher (Summe aller Blöcke)
 const insuranceTotalPerDiver = autoInsBlocks.reduce((sum, b) => sum + b.plan.price_cents * b.units, 0)
 const insuranceTotal = (insuranceTotalPerDiver * guests) / 100

 const addonQty = guests * diveDays
 const addonTotal = [...selectedAddonIds].reduce((sum, id) => {
 const addon = equipmentAddons.find(a => a.id === id)
 return sum + (addon ? addon.price_cents * addonQty : 0)
 }, 0) / 100

 // Letzter Tauchgang: Pflicht pro Gast; > 12 Monate Scuba Skills Update automatisch (Server rechnet erneut).
 const lastDiveRequired = asksLastDive(currentProduct?.name, currentProduct?.category)
 const isSsuProduct = isSkillsUpdate(currentProduct?.name) // freiwilliges SSU: Last dive ja, zweites SSU nie
 const lastDiveList = Array.from({ length: guests }, (_, i) => lastDiveDates[i] ?? '')
 const lastDiveReady = !lastDiveRequired || lastDiveList.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
 // Refresher-Pflicht gegen den ersten Tauchtag (bzw. den schon gewaehlten Refresher-Tag), nicht gegen heute
 // Regel (Lucas 25.10.): wer > 12 Monate nicht im Wasser war, braucht den Refresher — egal wie viele Tage
 // und für wann er bucht. Geprüft wird gegen den SPÄTESTEN gebuchten Tauchtag; der zuletzt gewählte spätere
 // Tag bleibt gemerkt, auch wenn die Tauchtage nach der Refresher-Wahl geleert werden.
 const [stickyLatestDive, setStickyLatestDive] = useState('')
 const latestPicked = picked.length > 0 ? [...picked].map(x => x.date).sort().slice(-1)[0] : ''
 useEffect(() => { if (latestPicked) setStickyLatestDive(latestPicked) }, [latestPicked])
 const refresherRef = latestPicked || stickyLatestDive || (refresherDate || null)
 const refresherCount = lastDiveRequired && !isSsuProduct && !programProduct ? lastDiveList.filter(d => d && needsRefresher(d, refresherRef)).length : 0
 const refresherTotal = refresherProduct ? (refresherProduct.price_cents * refresherCount) / 100 : 0

 const total = productTotal + insuranceTotal + addonTotal + refresherTotal

 // Taucht der Refresher auf (letzter Tauchgang > 12 Monate), übernimmt er das bereits gewählte erste Datum:
 // der Gast hatte diesen Tag frei — das ist der Tag für den Scuba Skills Update. Die Tauchtage des
 // Produkts werden geleert und danach neu gewählt (müssen nach dem Refresher liegen).
 const prevRefresherCount = React.useRef(0)
 useEffect(() => {
 const was = prevRefresherCount.current
 prevRefresherCount.current = refresherCount
 if (was === 0 && refresherCount > 0 && prefilledRefresher.current) {
 prefilledRefresher.current = false // Refresher-Tag und Tauchtage kamen fertig aus dem Link
 } else if (was === 0 && refresherCount > 0 && picked.length > 0) {
 const first = [...picked].map(x => x.date).sort()[0]
 setRefresherDate(first)
 setPicked([])
 setCourseStart(null)
 setOpenPicker('product')
 }
 if (refresherCount === 0 && refresherDate && prices.length > 0 && !prefilledRefresher.current) setRefresherDate('')
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [refresherCount])


 /** Lesbare Zusammenfassung der Blöcke für den Gast, z.B. "3-day + 2× 1-day" */
 function insuranceBlockLabel(blocks: PriceBlock[]): string {
 return blocks.map(b =>
 b.units > 1 ? `${b.units}× ${b.plan.name}` : b.plan.name
 ).join(' + ')
 }

 function toggleAddon(id: string) {
 setSelectedAddonIds(prev => {
 const next = new Set(prev)
 if (next.has(id)) { next.delete(id) } else { next.add(id) }
 // Full Equipment deckt alle Einzelteile außer den Extras ab
 if (fullEquipAddon && id === fullEquipAddon.id && next.has(id)) {
 for (const x of [...next]) if (x !== id && !EXTRA_IDS.has(x)) next.delete(x)
 }
 return next
 })
 }

 // Insurance-Kategorie aus Hauptprodukt-Dropdown entfernen
 // Reihenfolge „Dives & Packs“ (Lucas 24.10.): Double Dive zuerst (Default), dann Packs aufsteigend, dann Night Dive, zuletzt Single Dive.
 // Andere Kategorien bleiben nach Preis sortiert (wie geladen).
 const DIVES_ORDER = ['daily-double-dive', 'dive-pack-4', 'dive-pack-6', 'dive-pack-8', 'dive-pack-10', 'night-dive', 'single-dive']
 const divesRank = (p: Price) => { const i = DIVES_ORDER.indexOf(p.id); return i >= 0 ? i : (p.name.includes('Pack') ? 50 + p.price_cents / 100 : 90) }
 // Gruppen-Reihenfolge (Lucas 24.10.): Tauchpakete, Entry, Specialty, Pro, Ecology, Excursion.
 // Equipment ist ein Relikt im Dropdown (Miete läuft über die Equipment-Checkbox) raus.
 const CATEGORY_ORDER = ['dives', 'entry', 'specialty', 'pro', 'ecology', 'excursion']
 const grouped = prices
 .filter(p => CATEGORY_ORDER.includes(p.category))
 .reduce<Record<string, Price[]>>((acc, p) => {
 (acc[p.category] ??= []).push(p); return acc
 }, {})
 if (grouped.dives) grouped.dives = [...grouped.dives].sort((a, b) => divesRank(a) - divesRank(b))
 const groupedEntries = CATEGORY_ORDER.filter(c => grouped[c]?.length).map(c => [c, grouped[c]] as const)

 // Braucht jemand in der Gruppe ein Scuba Skills Update, gibt es nur noch die Split-Ansicht (eine Gruppenbuchung würde alle auf Tage nach dem SSU zwingen)
 const splitForced = guests > 1 && refresherCount > 0
 const splitActive = !requestOnly && ((split && (guests > 1 || extras.length > 0)) || splitForced)
 // Nach dem Umschalten zählen die Karten: haben alle Hauptkarten gemeldet und keine braucht mehr ein SSU (z. B. Tippfehler korrigiert), darf man zurück zur Gruppenbuchung
 const cardsClear = splitForced && Array.from({ length: guests }, (_, i) => guestSpecs[`m${i}`]).every(g => g && g.refresher_count === 0)
 // Positionen: je Person die Hauptkarte (m<i>) + deren Zusatzprodukte (x<id>)
 const positions: { key: string; person: number; extra: boolean; extraId?: number }[] = splitActive
 ? Array.from({ length: guests }, (_, i) => [
 { key: `m${i}`, person: i + 1, extra: false },
 ...extras.filter(e => e.person === i + 1).map(e => ({ key: `x${e.id}`, person: i + 1, extra: true, extraId: e.id })),
 ]).flat()
 : []
 const splitList = positions.map(ps => guestSpecs[ps.key] ?? null)
 const personName = (person: number) => person <= 1 ? `${guestFirst.trim()} ${guestLast.trim()}`.trim() : `${(otherGuests[person - 2]?.first ?? '').trim()} ${(otherGuests[person - 2]?.last ?? '').trim()}`.trim()
 const posLabel = (k: number) => `Guest ${positions[k].person}${personName(positions[k].person) ? ` · ${personName(positions[k].person)}` : ''}${positions[k].extra ? ' (additional product)' : ''}`
 const splitTotal = splitList.reduce((a, g) => a + (g?.total_cents ?? 0), 0) / 100
 const splitMissing = splitActive ? splitList.map((g, i) => g ? (g.ready ? null : `${posLabel(i)}: ${g.missing}`) : `${posLabel(i)}: choose a product`).find(Boolean) ?? null : null

 async function startCheckout() {
 setLoading(true); setError(null)
 trackCheckout('payment_started', { step: 'payment_started', payload: { product_id: productId, guests, split: splitActive, total_cents: Math.round(grandTotal * 100), ...(payingDeposit ? { deposit_cents: depositCents } : {}) } })
 try {
 // /book?sandbox=1 (Mitarbeiter): Token mitschicken, der Server wählt daraufhin das Stripe-Testkonto
 const sandboxMode = isSandboxBooking()
 const staffToken = sandboxMode ? (await supabase.auth.getSession()).data.session?.access_token : undefined
 if (sandboxMode && !staffToken) { setError('Sandbox mode needs a staff login — sign in to the Members area first, then reopen this page.'); trackCheckout('validation_failed', { step: 'payment_started', payload: { code: 'sandbox_no_token' } }); setLoading(false); return }
 const res = await fetch('/api/checkout', {
 method: 'POST',
 headers: { 'content-type': 'application/json', ...(staffToken ? { authorization: `Bearer ${staffToken}` } : {}) },
 body: JSON.stringify(splitActive ? {
 channel: 'book', origin: bookingOrigin, website: honeypot, customer_name: guestName, customer_first_name: guestFirst.trim(), customer_last_name: guestLast.trim(), customer_phone: guestPhone.trim(), guest_names: positions.slice(1).map(ps => personName(ps.person)),
 guests: splitList.map((g, k) => ({
 person: positions[k].person,
 guest_name: positions[k].person >= 2 ? `${(otherGuests[positions[k].person - 2]?.first ?? '').trim()} ${(otherGuests[positions[k].person - 2]?.last ?? '').trim()}`.trim() : '',
 ...(g!.skip_refresher ? { skip_refresher: true } : {}),
 product_id: g!.product_id,
 sessions: g!.sessions,
 ...(g!.last_dive_date ? { last_dive_date: g!.last_dive_date } : {}),
 ...(g!.refresher_date ? { refresher_date: g!.refresher_date } : {}),
 addons: g!.addons,
 insurance_requested: g!.insurance_requested,
 ...(g!.insurance_choice ? { insurance_choice: g!.insurance_choice } : {}),
 })),
 customer_email: email.trim(),
 terms_accepted: true,
 terms_version: POLICY_VERSION,
 ...(sandboxMode ? { is_test: true } : {}),
 ...(favouriteSpot ? { favourite_spot: favouriteSpot } : {}),
 ...(payingDeposit ? { deposit: true } : {}),
 ...(capacityRequest ? { capacity_request: true } : {}),
 } : {
 channel: 'book', origin: bookingOrigin, website: honeypot, customer_name: guestName, customer_first_name: guestFirst.trim(), customer_last_name: guestLast.trim(), customer_phone: guestPhone.trim(), guest_names: Array.from({ length: Math.max(0, guests - 1) }, (_, i) => `${(otherGuests[i]?.first ?? '').trim()} ${(otherGuests[i]?.last ?? '').trim()}`.trim()),
 product_id: productId,
 sessions: picked,
 group_size: guests,
 customer_email: email.trim(),
 terms_accepted: true,
 terms_version: POLICY_VERSION,
 ...(sandboxMode ? { is_test: true } : {}),
 ...(payingDeposit ? { deposit: true } : {}),
 ...(capacityRequest ? { capacity_request: true } : {}),
 insurance_requested: !insuranceIncluded && insuranceChoice === 'auto' && autoInsBlocks.length > 0,
 ...(insuranceIncluded || programProduct ? {} : { insurance_choice: insuranceChoice === 'auto' ? 'azd' : 'own' }),
 addons: [...selectedAddonIds].map(id => ({
 product_id: id,
 quantity: addonQty,
 })),
 ...(favouriteSpot ? { favourite_spot: favouriteSpot } : {}),
 ...(isCourse && lastDayOnIsland ? { last_day_on_island: lastDayOnIsland } : {}),
 ...(lastDiveRequired ? { last_dive_dates: lastDiveList } : {}),
 ...(refresherCount > 0 && refresherDate ? { refresher_date: refresherDate } : {}),
 ...(draftId ? { draft_id: draftId } : {}),
 }),
 })
 const data = await res.json()
 // Request-Modus: keine Stripe-Weiterleitung, Anfrage liegt beim Team
 if (res.ok && data.request) {
 trackCheckout('stripe_redirect', { step: 'stripe_redirect', payload: { product_id: productId, guests, split: splitActive, request: true } })
 setRequestDone({ reference: data.reference ?? String(data.booking_id ?? '').slice(0, 8).toUpperCase(), ...(data.mail_error ? { mailError: String(data.mail_error) } : {}) })
 setLoading(false)
 window.scrollTo({ top: 0, behavior: 'smooth' })
 return
 }
 if (!res.ok || !data.url) {
 trackCheckout('api_error', { step: 'payment_started', payload: { endpoint: '/api/checkout', http_status: res.status, code: data.retry_in_minutes ? 'seats_on_hold' : (data.ref ? 'server_ref' : 'checkout_error'), message: String(data.error ?? '').slice(0, 200) } })
 // 409 mit retry_in_minutes: Plätze sind gerade bei jemand anderem im Checkout — Hinweis statt nacktem „ausgebucht“
 setError(data.retry_in_minutes
 ? ` ${data.error ?? 'Those seats are on hold for another guest.'} Your selection stays — just click Pay again later.`
 : (data.error ?? 'Checkout could not be started.'))
 setLoading(false)
 return
 }
 trackCheckout('stripe_redirect', { step: 'stripe_redirect', payload: { product_id: productId, guests, split: splitActive } })
 window.location.href = data.url
 } catch {
 trackCheckout('api_error', { step: 'payment_started', payload: { endpoint: '/api/checkout', code: 'network_error' } })
 setError('Network error — please try again.')
 setLoading(false)
 }
 }

 // Die Mail traegt alles, was nach der Zahlung kommt: Bestaetigung, Check-in-Link,
 // Erinnerungen und das Prefill im Check-in.
 const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
 const insuranceReady = insuranceIncluded || programProduct || insuranceChoice === 'own' || (insuranceChoice === 'auto' && insuranceTotalPerDiver > 0)

 // Für Kurse: lastDayOnIsland-Konflikt client-seitig sperren (server prüft nochmals)
 const lastDayConflict = isCourse && lastDayOnIsland.length > 0 && picked.length > 0
 && picked[picked.length - 1].date > lastDayOnIsland
 // Pro-Programme: letzter Tag auf der Insel ist Pflicht (das Team plant die Wochen bis dahin)
 const lastDayMissing = programProduct && !lastDayOnIsland
 const firstDiveDate = picked.length > 0 ? [...picked].map(x => x.date).sort()[0] : null
 const refresherReady = refresherCount === 0 || (Boolean(refresherDate) && (!firstDiveDate || refresherDate < firstDiveDate))
 // Name: Pflicht nur im Request-Modus (sonst Conversion-Killer); bei Sofortzahlung optional, spart Tippen im Check-in
 const otherNamesReady = (!requestMode && !splitActive) || guests <= 1 || Array.from({ length: guests - 1 }, (_, i) => otherGuests[i]).every(g => g && g.first.trim() && g.last.trim())
 const mainNameReady = guestFirst.trim().length >= 1 && guestLast.trim().length >= 1
 const nameReady = mainNameReady && otherNamesReady
 // Request-Felder (Name, Handy, weitere Gäste) — im Popup (High Season) und im Formular (Low Season / nach Bestätigung)
 const requestFields = (compact: boolean) => (
 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
 <div>
 <div style={label}>First name *</div>
 <input type="text" value={guestFirst} onChange={e => setGuestFirst(e.target.value)} placeholder="Maria" autoComplete="given-name" maxLength={40} style={field} data-clarity-mask="true" />
 </div>
 <div>
 <div style={label}>Last name *</div>
 <input type="text" value={guestLast} onChange={e => setGuestLast(e.target.value)} placeholder="Costa" autoComplete="family-name" maxLength={40} style={field} data-clarity-mask="true" />
 </div>
 </div>
 <div>
 <div style={label}>Mobile / WhatsApp <span style={{ display: 'block', marginTop: '3px', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: s.muted }}>(optional — for short-notice changes, e.g. weather)</span></div>
 <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="+351 …" autoComplete="tel" maxLength={30} style={field} data-clarity-mask="true" />
 </div>
 {guests > 1 && !splitActive && (
 <div>
 <div style={label}>Other guests *{compact ? '' : ''}</div>
 {Array.from({ length: guests - 1 }, (_, i) => (
 <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: i === 0 ? 0 : '10px' }}>
 <input type="text" value={otherGuests[i]?.first ?? ''} onChange={e => setOtherGuests(prev => { const n = [...prev]; n[i] = { first: e.target.value, last: n[i]?.last ?? '' }; return n })} placeholder={`Guest ${i + 2} — first name`} maxLength={40} style={field} data-clarity-mask="true" />
 <input type="text" value={otherGuests[i]?.last ?? ''} onChange={e => setOtherGuests(prev => { const n = [...prev]; n[i] = { first: n[i]?.first ?? '', last: e.target.value }; return n })} placeholder="Last name" maxLength={40} style={field} data-clarity-mask="true" />
 </div>
 ))}
 </div>
 )}
 </div>
 )
 const canBook = splitActive
 ? !splitMissing && agreed && termsAgreed && emailValid && nameReady && !loading
 : Boolean(product) && !requestOnly && picked.length === required && agreed && termsAgreed && insuranceReady && emailValid && nameReady && !loading && !lastDayConflict && !lastDayMissing && lastDiveReady && refresherReady
 const grandTotal = splitActive ? splitTotal : total

 // ── 50 %-Deposit: Anzeige-Betrag mit DERSELBEN Regel wie der Server (Ceil je Position, Versicherung voll) ──
 const depositModeOk = depositMode === 'live' || (depositMode === 'sandbox' && isSandboxBooking())
 // Im Request-Modus (Low Season) ist die Checkbox ein Wunsch: kein Geld jetzt, das Team wählt beim Approve full/deposit (vorbelegt)
 const depositAvailable = depositModeOk && Math.round(grandTotal * 100) >= ONLINE_DEPOSIT_THRESHOLD_CENTS
 const depositCents = splitActive
 ? splitList.reduce((a, g) => a + (g ? g.lines.reduce((b, l) => b + (/insurance/i.test(l.label) ? l.cents : depositUnitCents(l.cents)), 0) : 0), 0)
 : (product ? depositUnitCents(product.price_cents) * guests : 0)
 + Math.round(insuranceTotal * 100)
 + [...selectedAddonIds].reduce((sum, id) => { const a = equipmentAddons.find(x => x.id === id); return sum + (a ? depositUnitCents(a.price_cents) * addonQty : 0) }, 0)
 + (refresherProduct ? depositUnitCents(refresherProduct.price_cents) * refresherCount : 0)
 const depositEur = depositCents / 100
 const depositRestEur = Math.max(0, grandTotal - depositEur)
 // Kein Reset-Effekt nötig: fällt die Summe unter 350 € oder greift der Request-Modus, zählt nur `payingDeposit` (Checkbox verschwindet)
 const payingDeposit = depositAvailable && depositWanted

 // Text des Pay-Buttons — bei !canBook ist das zugleich der Blocker, den die Telemetrie meldet
 const ctaLabel = loading ? (requestMode ? 'Sending your request…' : 'Opening secure checkout…')
 : splitActive ? (splitMissing ? `${splitMissing}` : !emailValid ? 'Enter your email address' : !nameReady ? (guestFirst.trim() && guestLast.trim() ? 'Enter the names of all guests' : 'Enter your first and last name') : requestMode ? `Send request — €${grandTotal.toFixed(2)}, no payment now${payingDeposit ? ' (50% deposit requested)' : ''}` : payingDeposit ? `Pay €${depositEur.toFixed(2)} deposit now (total €${grandTotal.toFixed(2)})` : `Pay €${grandTotal.toFixed(2)}${guests > 1 ? ` for ${guests} guests` : ''}`)
 : requestOnly ? `${product?.name ?? 'This product'} is on request — send an enquiry`
 : picked.length < required
 ? (isCourse ? 'Pick a start date above' : `Pick ${required - picked.length} more dive day${required - picked.length === 1 ? '' : 's'}`)
 : lastDayMissing ? 'Pick your last day on the island'
 : !refresherReady ? 'Pick a date for the Scuba Skills Update'
 : lastDayConflict ? 'Course ends after your last day — change start date'
 : !insuranceReady ? 'Choose an insurance option'
 : !emailValid ? 'Enter your email address'
 : !nameReady ? (guestFirst.trim() && guestLast.trim() ? 'Enter the names of all guests' : 'Enter your first and last name')
 : requestMode ? `Send request — €${total.toFixed(2)}, no payment now${payingDeposit ? ' (50% deposit requested)' : ''}`
 : payingDeposit ? `Pay €${depositEur.toFixed(2)} deposit now (total €${total.toFixed(2)})`
 : `Pay €${total.toFixed(2)} and ${isCourse ? 'book course' : 'check in'}`
 const ctaBlocker = !canBook && !loading ? ctaLabel : (!agreed || !termsAgreed ? 'Terms / cancellation policy not accepted' : null)
 useCheckoutTelemetry({
 product_id: product?.id ?? null,
 request_only: requestOnly,
 email_entered: emailValid,
 dates_selected: splitActive ? !splitMissing : (picked.length >= required && required > 0 && refresherReady && !lastDayConflict && !lastDayMissing && lastDiveReady),
 insurance_selected: splitActive ? !splitMissing : insuranceReady,
 terms_accepted: agreed && termsAgreed,
 guests,
 split: splitActive,
 blocker: ctaBlocker,
 })

 const field: React.CSSProperties = {
 width: '100%', background: 'var(--bg)', border: '1px solid rgba(255,255,255,.12)',
 borderRadius: 0, padding: '12px 14px', fontSize: '16px', color: s.text,
 fontFamily: s.font, outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
 }
 const label: React.CSSProperties = {
 fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase',
 color: s.muted, marginBottom: '8px',
 }
 const cartLine = (open: boolean, done: boolean): React.CSSProperties => ({
 border: `1px solid ${open ? 'color-mix(in srgb, var(--text) 50%, transparent)' : done ? 'var(--text)' : 'var(--text)'}`,
 background: open ? 'color-mix(in srgb, var(--text) 6%, transparent)' : 'rgba(255,255,255,.03)',
 borderRadius: 0, padding: '12px 14px', marginBottom: '10px',
 })
 const pickBtn = (done: boolean): React.CSSProperties => ({
 padding: '8px 14px', borderRadius: 0, fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
 border: `1px solid ${done ? 'rgba(255,255,255,.15)' : 'color-mix(in srgb, var(--text) 50%, transparent)'}`,
 background: done ? 'transparent' : 'color-mix(in srgb, var(--text) 15%, transparent)', color: done ? s.sub : 'var(--accent)', whiteSpace: 'nowrap',
 })
 const warnBox: React.CSSProperties = { marginTop: '8px', padding: '10px 12px', borderRadius: 0, background: 'transparent', border: '1px solid var(--line)', fontSize: '14px', color: 'var(--text)', lineHeight: 1.5 }
 const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })

 /** Produkt-Dropdown — oben, oder in der Produktzeile, sobald der Scuba Skills Update die erste Zeile belegt */
 const productSelect = (compact: boolean) => (
 <select
 value={productId}
 onChange={e => {
 const next = e.target.value
 setProductId(next)
 const nextProd = prices.find(p => p.id === next)
 const nextIsCourse = COURSE_CATS.includes(nextProd?.category ?? '')
 if (nextIsCourse) {
 setCourseStart(null)
 setPicked([])
 } else if (isNightProduct(nextProd) !== isNightProduct(product)) {
 // Wechsel Night Dive <-> Tagestauchgang: NIGHT- und AM/PM-Slots passen nicht zueinander
 setPicked([])
 } else {
 const nextRequired = nextProd?.sessions_included ?? 1
 setPicked(prev => prev.length > nextRequired ? prev.slice(0, nextRequired) : prev)
 }
 }}
 style={compact ? { ...field, padding: '8px 10px', fontSize: '14px', fontWeight: 500 } : field}>
 {groupedEntries.map(([cat, allRows]) => {
 // Sobald ein Refresher fällig ist (>12 Monate nicht im Wasser), gibt es nur noch Produkte für Zertifizierte —
 // ein Einsteigerprodukt (Basic Diver, Open Water …) würde Letzter-Tauchgang und Refresher stillschweigend verwerfen.
 const rows = refresherCount > 0 ? allRows.filter(p => requiresLastDive(p.name, p.category)) : allRows
 if (rows.length === 0) return null
 return (
 <optgroup key={cat} label={CATEGORY_LABEL[cat] ?? cat}>
 {rows.map(p => (
 <option key={p.id} value={p.id}>{p.name} — €{(p.price_cents / 100).toFixed(0)}</option>
 ))}
 </optgroup>
 )
 })}
 </select>
 )

 return (
 <div style={{ background: s.bgDark, minHeight: '100vh', fontFamily: s.font }}>
 <div style={{ maxWidth: '620px', margin: '0 auto', padding: '48px 20px 80px' }}>

 {sandboxUi && (
 <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: 0, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.5 }}>
 <strong> SANDBOX</strong> — staff test booking. Pays with the Stripe test card <code>4242 4242 4242 4242</code> (any future expiry, any CVC). No real money, the booking is flagged as test data and never invoiced.
 </div>
 )}

 <h1 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 500, color: s.text, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
 Book your dive<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ color: s.sub, fontSize: '15px', margin: '0 0 36px', lineHeight: 1.6 }}>
 {requestMode
 ? (capOnly ? 'Direct booking — no booking fee. This day is fully booked at the moment: you send a request and we come back to you by email.' : 'Direct booking — no booking fee. Low season: you send a request, we organise dive days around the requests we get, then you pay.')
 : 'Direct booking — no booking fee. Online check-in follows right after payment.'}
 </p>

 {showRequestModal && (
 <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'color-mix(in srgb, var(--bg) 78%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
 <div style={{ maxWidth: '560px', width: '100%', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 0, padding: '26px 24px', boxShadow: 'none' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '8px' }}>{capacityRequest && windowDecision.mode !== 'request' ? 'Popular day · booking on request' : productRequest ? `${product?.name} · on request` : `Low season${requestSpan ? ` (${requestSpan})` : ''} · booking on request`}</div>
 <div style={{ fontSize: '20px', fontWeight: 500, color: s.text, marginBottom: '12px', lineHeight: 1.25 }}>{capacityRequest && windowDecision.mode !== 'request' ? 'This day is currently fully booked — you can send it as a request.' : productRequest ? `${product?.name} runs on request — your date is a request, not a confirmed booking.` : 'Your dates are a request — we build dive days around the requests we get.'}</div>
 <p style={{ color: s.sub, fontSize: '14.5px', lineHeight: 1.7, margin: '0 0 10px' }}>
 {capacityRequest && windowDecision.mode !== 'request'
 ? 'The boat for your chosen day is fully booked at the moment, so we cannot promise this day. If you send it as a request, we check whether something frees up or works out and come back to you by email — with a confirmation or a suggestion for another day. Nothing is charged and no seat is reserved until you pay.'
 : productRequest
 ? (programProduct
 ? `${product?.name} is a programme of several weeks that we plan individually with you — instructor, dive days and insurance. Pick the day you would like to start and your last day on the island; we check what is possible and come back to you with a plan.`
 : product?.id === 'night-dive'
 ? 'Night dives run as their own evening trip, and the meeting time depends on sunset, tide and the group. Pick the evening you would like — we check it and come back to you, possibly with a nearby day.'
 : 'Our boats go out for two dives per trip, and in high season every seat is planned around that. A single dive fits in when there is a seat to spare. Pick the day you would like — we check it and come back to you, possibly with a nearby day.')
 : `In the low season (${requestSpan}) we collect requests and run the boat when enough divers come together in the same week and conditions allow. Your chosen dates are a preference — we may come back with a day close to them.`}
 </p>
 <ul style={{ color: s.sub, fontSize: '14px', lineHeight: 1.7, margin: '0 0 18px', paddingLeft: '18px' }}>
 <li>Fill in everything as usual — dates, guests, experience, insurance.</li>
 <li><b style={{ color: s.text }}>Nothing is charged now.</b></li>
 <li>{capOnly ? 'If a seat works out, we email you a payment link — for your day or a nearby one.' : programProduct ? 'Once your programme is planned, we email you the plan and a payment link.' : productRequest ? 'Once we have confirmed a seat for your date, we email you a payment link — for your date or a nearby one.' : 'Once we can organise a dive day for your week, we email you a payment link — for your date or a nearby one.'}</li>
 <li>A spot is only reserved once you pay.</li>
 </ul>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '10px' }}>Who is diving?</div>
 <div style={{ marginBottom: '18px' }}>{requestFields(true)}</div>
 <button type="button" disabled={!mainNameReady || !otherNamesReady} onClick={ackRequest} style={{ width: '100%', padding: '14px', borderRadius: 0, border: 'none', background: mainNameReady && otherNamesReady ? s.accent : 'rgba(255,255,255,.08)', color: mainNameReady && otherNamesReady ? 'var(--bg)' : s.muted, fontSize: '15px', fontWeight: 500, fontFamily: s.font, cursor: mainNameReady && otherNamesReady ? 'pointer' : 'default' }}>
 {mainNameReady && otherNamesReady ? 'Continue as a request' : guests > 1 && mainNameReady ? 'Enter the names of all guests' : 'Enter your name to continue'}
 </button>
 <button type="button" onClick={() => { setPicked([]); setCourseStart(null); if (productRequest) { setProductId('daily-double-dive'); setRequestAck(false) } }} style={{ width: '100%', marginTop: '8px', background: 'none', border: 'none', color: s.muted, fontSize: '14px', fontFamily: s.font, cursor: 'pointer', textDecoration: 'underline' }}>
 {programProduct ? 'Choose another product instead' : productRequest ? 'Choose Daily Double Dive instead — book instantly' : 'Pick a different date instead'}
 </button>
 </div>
 </div>
 )}

 {requestDone ? (
 <div style={{ background: 'var(--glass)', border: '1px solid var(--line)', borderRadius: 0, padding: '30px 26px', textAlign: 'center' }}>
 <div style={{ fontSize: '40px', marginBottom: '10px' }}></div>
 <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)', marginBottom: '10px' }}>Request received</div>
 <p style={{ color: s.sub, fontSize: '14.5px', lineHeight: 1.7, margin: '0 0 14px' }}>
 No payment has been taken. Your dates are noted as a preference. We organise dive days once enough divers have requested the same week and conditions allow, and get back to you at <strong style={{ color: s.text }}>{email.trim()}</strong> — with a payment link for your date or a nearby one, or with alternatives. A spot is only held once you pay.
 </p>
 <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 0, background: 'rgba(255,255,255,.06)', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: '14px', color: s.text, marginBottom: '14px' }}>Reference {requestDone.reference}</div>
 {requestDone.mailError && (
 <div style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 0, padding: '10px 12px', fontSize: '14px', color: 'var(--text)', lineHeight: 1.5 }}>
 Your request is saved, but the confirmation email could not be sent ({requestDone.mailError}). Keep the reference above — the team will still get back to you.
 </div>
 )}
 <p style={{ color: s.muted, fontSize: '14px', margin: '14px 0 0', lineHeight: 1.6 }}>
 Questions or changes? <a href="/contact" style={{ color: s.accent }}>Get in touch</a> and quote the reference.
 </p>
 </div>
 ) : (
 <div style={{ background: 'var(--glass)', border: '1px solid color-mix(in srgb, var(--text) 20%, transparent)', borderRadius: 0, padding: '26px' }}>

 {(requestMode || todayRequest) && (
 <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: 0, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.55 }}>
 {productRequest ? (
 <>
 <strong>{product?.name} runs on request — your dates are a request, not a confirmed booking.</strong>{' '}
 {programProduct
 ? 'It runs over several weeks and we plan it individually with you. '
 : product?.id === 'night-dive'
 ? 'Night dives run as their own evening trip and the meeting time depends on sunset, tide and the group. '
 : 'Our boats go out for two dives per trip, so a single dive fits in when there is a seat to spare. '}
 Pick the day you would like, fill in everything below as usual; nothing is charged now. If it works we email you a payment link — for your date or a nearby one. A spot is only reserved once you pay.
 </>
 ) : todayRequest ? (
 <>
 <strong>Low season{requestSpan ? ` (${requestSpan})` : ''} — bookings are requests, not confirmations.</strong> We collect requests and organise dive days when enough divers come together in the same week and conditions allow. Your chosen dates are a preference — we may suggest a nearby day. Fill in everything below as usual; nothing is charged now. Once a dive day comes together for your week, we email you a payment link. A spot is only reserved once you pay.
 </>
 ) : (
 <>
 {capOnly
 ? <><strong>This day is currently fully booked — your dates are a request, not a confirmed booking.</strong> We check whether something works out and may suggest another day; nothing is charged now and no seat is reserved.</>
 : <><strong>Low season{requestSpan ? ` (${requestSpan})` : ''} — your dates are a request, not a confirmed booking.</strong> We organise dive days once enough requests come together that week and may suggest a nearby day; nothing is charged now.</>} <button type="button" onClick={() => setRequestAck(false)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Read again</button>
 </>
 )}
 </div>
 )}

 <div style={{ marginBottom: '22px' }}>
 <div style={label}>Email *</div>
 <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={field} data-clarity-mask="true" />
 {requestMode ? (
 <div style={{ marginTop: '14px' }}>{requestFields(false)}</div>
 ) : (
 <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
 <div>
 <div style={label}>First name *</div>
 <input type="text" value={guestFirst} onChange={e => setGuestFirst(e.target.value)} placeholder="Maria" autoComplete="given-name" maxLength={40} style={field} data-clarity-mask="true" />
 </div>
 <div>
 <div style={label}>Last name *</div>
 <input type="text" value={guestLast} onChange={e => setGuestLast(e.target.value)} placeholder="Costa" autoComplete="family-name" maxLength={40} style={field} data-clarity-mask="true" />
 </div>
 <div style={{ gridColumn: '1 / -1' }}>
 <div style={label}>Mobile / WhatsApp <span style={{ display: 'block', marginTop: '3px', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: s.muted }}>(optional — for short-notice changes, e.g. weather)</span></div>
 <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="+351 …" autoComplete="tel" maxLength={30} style={field} data-clarity-mask="true" />
 </div>
 </div>
 )}
 {/* Honeypot gegen Bot-Anfragen im Request-Modus: unsichtbar, echte Browser lassen es leer */}
 <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
 <label>Leave empty<input type="text" name="azd_extra" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} /></label>
 </div>
 </div>

 {refresherCount === 0 && !splitActive && (
 <div style={{ marginBottom: '20px' }}>
 <div style={label}>What would you like to book?</div>
 {productSelect(false)}
 </div>
 )}

 <div style={{ marginBottom: '22px' }}>
 <div style={label}>Guests</div>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <button type="button" onClick={() => setGuests(g => Math.max(1, g - 1))} style={stepBtn(true)}>−</button>
 <span style={{ flex: 1, textAlign: 'center', fontSize: '18px', fontWeight: 500, color: s.text }}>{guests}</span>
 <button
 type="button"
 disabled={guests >= guestCeiling}
 title={guests >= guestCeiling && maxSeats !== null
 ? `Room for ${maxSeats} on one boat for the days you picked`
 : undefined}
 onClick={() => setGuests(g => Math.min(guestCeiling, g + 1))}
 style={stepBtn(guests < guestCeiling)}>+</button>
 </div>
 {!capacityRequest && maxSeats !== null && guests >= maxSeats && (
 <div style={{ fontSize: '14px', color: 'var(--text)', marginTop: '7px', lineHeight: 1.5 }}>
 That fills the boat on your tightest day. Larger groups we arrange by
 hand — <a href="/contact" style={{ color: s.accent }}>get in touch</a> and we
 will sort it out.
 </div>
 )}
 {guests > 1 && !requestOnly && !splitForced && !programProduct && (
 <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '12px', cursor: 'pointer' }}>
 <input type="checkbox" checked={split} onChange={e => { setSplit(e.target.checked); setOpenPicker(null) }}
 style={{ marginTop: '2px', width: '16px', height: '16px', accentColor: s.accent, cursor: 'pointer', flexShrink: 0 }} />
 <span style={{ color: s.sub, fontSize: '14px', lineHeight: 1.5 }}>
 <b style={{ color: s.text }}>Different products or dates per person</b> — each guest picks their own product and dive days. One payment, one check-in link per guest.
 </span>
 </label>
 )}
 </div>

 {/* Request-only ohne Skills Update: kein Last-Dive-Feld (Test 3b). Steht schon ein Datum >12 Monate (SSU), bleibt es sichtbar, damit man es ändern kann. */}
 {lastDiveRequired && !splitActive && (!requestOnly || refresherCount > 0) && (
 <div style={{ marginBottom: '22px' }}>
 <div style={label}>Date of last dive{guests > 1 ? ' — per diver' : ''}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '8px', lineHeight: 1.5 }}>
 {isSsuProduct ? 'Certified divers only. Your instructor uses this to plan the session — no additional Scuba Skills Update is added.' : null}
 {isSsuProduct ? null : <>Certified divers only. If your last dive is more than 12 months before your first dive day, we add a Scuba Skills Update
 {refresherProduct ? ` (€${(refresherProduct.price_cents / 100).toFixed(0)})` : ''} before your first dive: a short pool-and-shallow-water session to bring buoyancy, mask and regulator skills back to automatic. The North Atlantic is cold, often with swell and current — we want every diver in the water with sharp skills, and this is how we make sure of it.</>}
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
 {lastDiveList.map((d, i) => {
 const old = !isSsuProduct && Boolean(d) && needsRefresher(d, refresherRef)
 const open = openLastDive === i
 return (
 <div key={i} style={{ border: `1px solid ${open ? 'color-mix(in srgb, var(--text) 50%, transparent)' : !d ? 'var(--text)' : old ? 'var(--text)' : 'rgba(255,255,255,.12)'}`, borderRadius: 0, padding: '10px 12px', background: open ? 'color-mix(in srgb, var(--text) 6%, transparent)' : 'rgba(255,255,255,.02)' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 {guests > 1 && <span style={{ fontSize: '14px', color: s.muted, minWidth: '58px', flexShrink: 0 }}>Diver {i + 1}</span>}
 <span style={{ flex: 1, fontSize: '14px', color: d ? s.text : s.muted, fontWeight: d ? 500 : 400 }}>
 {d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}
 </span>
 {old && <span style={{ fontSize: '14px', color: 'var(--text)', flexShrink: 0 }}> refresher</span>}
 <button type="button" onClick={() => setOpenLastDive(open ? null : i)} style={pickBtn(Boolean(d))}>
 {d ? 'Change' : 'Select date'}
 </button>
 </div>
 {open && (
 <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 <DatePicker
 value={d || null}
 max={todayStr}
 onChange={v => { setLastDiveDates(prev => Array.from({ length: guests }, (_, k) => k === i ? (v ?? '') : (prev[k] ?? ''))); if (v) setOpenLastDive(null) }}
 />
 </div>
 )}
 </div>
 )
 })}
 </div>
 </div>
 )}

 {(!isCourse || splitActive) && !requestOnly && <details className="fav-site" style={{ marginBottom: '22px' }}>
 <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '14px', color: favouriteSpot ? s.accent : s.sub, fontWeight: favouriteSpot ? 500 : 400, userSelect: 'none', listStyle: 'none' }}>
 <span>
 {favouriteSpot
 ? `Favourite site: ${SITE_META[favouriteSpot].name} · change`
 : 'Got a favourite dive site? (optional)'}
 </span>
 <svg className="fav-site-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, transition: 'transform .18s' }}><polyline points="6 9 12 15 18 9" /></svg>
 </summary>
 <style>{`.fav-site[open] .fav-site-chevron{transform:rotate(180deg)} .fav-site summary::-webkit-details-marker{display:none}`}</style>
 <div style={{ marginTop: '12px' }}>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px', lineHeight: 1.55 }}>
 No guarantees. Our staff decides on the day, based on sea conditions and the group on
 board — but if it fits, we&apos;ll get you there.
 </div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
 {DAY_BOAT_SLUGS.map(slug => (
 <button
 key={slug}
 type="button"
 onClick={() => setFavouriteSpot(prev => prev === slug ? '' : slug)}
 style={{
 padding: '7px 14px',
 borderRadius: 0,
 border: favouriteSpot === slug
 ? `2px solid ${s.accent}`
 : '2px solid color-mix(in srgb, var(--text) 25%, transparent)',
 background: favouriteSpot === slug ? 'color-mix(in srgb, var(--text) 15%, transparent)' : 'transparent',
 color: favouriteSpot === slug ? s.accent : s.sub,
 fontSize: '14px',
 fontWeight: favouriteSpot === slug ? 500 : 400,
 cursor: 'pointer',
 transition: 'all .15s',
 }}
 >
 {SITE_META[slug].name}
 </button>
 ))}
 </div>
 </div>
 </details>}

 {splitActive ? (
 <div style={{ marginBottom: '22px' }}>
 <div style={label}>Your booking — per guest</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '10px', lineHeight: 1.55 }}>
 {guests === 1 ? 'Each product is its own booking with its own check-in link.' : 'Each guest gets their own booking and check-in link.'} You pay everything together.{' '}
 {(!splitForced || cardsClear) && <button type="button" onClick={() => { if (splitForced) setLastDiveDates(Array.from({ length: guests }, (_, i) => guestSpecs[`m${i}`]?.last_dive_date ?? lastDiveDates[i] ?? '')); setSplit(false); setExtras([]) }} style={{ background: 'none', border: 'none', padding: 0, color: s.accent, fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>{guests === 1 ? 'Back to a single product' : 'Back to one group booking'}</button>}
 </div>
 {cardsClear && (
 <div style={{ fontSize: '14px', color: s.sub, lineHeight: 1.55, marginBottom: '12px' }}>Nobody needs a Scuba Skills Update any more — you can stay with separate bookings or go back to one group booking.</div>
 )}
 {splitForced && !cardsClear && (() => {
 const who = lastDiveList.map((d, i) => (d && needsRefresher(d, refresherRef) ? i + 1 : 0)).filter(Boolean)
 return (
 <div style={{ fontSize: '14px', color: s.sub, lineHeight: 1.55, marginBottom: '12px', padding: '10px 12px', borderRadius: 0, background: 'color-mix(in srgb, var(--text) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 28%, transparent)' }}>
 <b style={{ color: s.text }}>Why each guest has their own booking:</b> {who.length > 0 ? `guest ${who.join(' and ')} ${who.length === 1 ? 'needs' : 'need'}` : 'a guest needs'} a Scuba Skills Update (last dive over 12 months ago), and that comes before the first dive. So nobody else has to wait, everyone picks their own dates — you still pay once.
 </div>
 )
 })()}
 {positions.map(ps => { const i = ps.person - 1; const main = guestSpecs[`m${i}`]; return (
 <React.Fragment key={ps.key}>
 <SplitGuestCard
 key={ps.key} index={i} total={guests} windowBlocked={windowBlockedFor} windowRequest={windowRequestFor}
 {...(!ps.extra && i >= 1 ? { nameField: { first: otherGuests[i - 1]?.first ?? '', last: otherGuests[i - 1]?.last ?? '', onChange: (first: string, last: string) => setOtherGuests(prev => { const n = [...prev]; while (n.length < i - 1) n.push({ first: '', last: '' }); n[i - 1] = { first, last }; return n }) } } : {})}
 {...(ps.extra ? { extraOf: ps.person, inheritLastDive: main?.last_dive_date ?? null, notBeforeDate: main?.refresher_date ?? null, inheritAddonIds: main?.equipment_asked ? main.addons.map(a => a.product_id) : null, inheritInsurance: main?.insurance_choice === 'azd' ? 'auto' : main?.insurance_choice === 'own' ? 'own' : null, onRemove: () => { if (guests === 1 && extras.length === 1) setSplit(false); setExtras(prev => prev.filter(e => e.id !== ps.extraId)) } } : {})}
 prices={prices} groupedEntries={groupedEntries} categoryLabel={CATEGORY_LABEL}
 equipmentAddons={equipmentAddons} refresherProduct={refresherProduct}
 laterCards={positions.slice(positions.findIndex(x => x.key === ps.key) + 1).filter(x => x.person === ps.person).flatMap(x => { const g = guestSpecs[x.key]; return g ? [{ dates: g.sessions.map(z => z.date), insuranceAzd: g.insurance_choice === 'azd', insuranceCovered: g.insurance_included === true, refresherDate: g.refresher_date }] : [] })}
 earlierCards={positions.slice(0, positions.findIndex(x => x.key === ps.key)).filter(x => x.person === ps.person).flatMap(x => { const g = guestSpecs[x.key]; return g ? [{ dates: g.sessions.map(z => z.date), addonIds: g.addons.map(a => a.product_id), insuranceAzd: g.insurance_choice === 'azd', insuranceCovered: g.insurance_included === true, refresherDate: g.refresher_date }] : [] })}
 samePersonPicks={positions.filter(x => x.person === ps.person && x.key !== ps.key).flatMap(x => { const g = guestSpecs[x.key]; return g ? g.sessions.filter(z => z.session !== 'tbd').map(z => ({ date: z.date, dives: divesPerSession(g.product_id) })) : [] })}
 initialProductId={productId} initialLastDive={ps.extra ? '' : (lastDiveDates[i] ?? '')}
 {...(ps.key === 'm0' && guests === 1 ? { initial: { picked, courseStart, refresherDate, addonIds: [...selectedAddonIds], insuranceChoice, collapsed: Boolean(product) && picked.length === required && refresherReady && insuranceReady && lastDiveReady } } : {})}
 {...(!ps.extra && guests > 1 && linkPrefill ? { initial: { picked, courseStart, refresherDate: lastDiveDates[i] && needsRefresher(lastDiveDates[i], refresherRef) ? refresherDate : '', addonIds: [...selectedAddonIds], insuranceChoice, collapsed: false } } : {})}
 onChange={spec => setGuestSpecs(prev => (prev[ps.key] && JSON.stringify(prev[ps.key]) === JSON.stringify(spec)) ? prev : { ...prev, [ps.key]: spec })}
 />
 {positions[positions.findLastIndex(x => x.person === ps.person)].key === ps.key && positions.length < 20 && (
 <button type="button" data-addproduct onClick={() => { setExtras(prev => [...prev, { id: extraSeq, person: ps.person }]); setExtraSeq(n => n + 1) }}
 style={{ scrollMarginTop: '88px', display: 'block', width: '100%', margin: '-4px 0 14px', padding: '10px', borderRadius: 0, border: '1px dashed color-mix(in srgb, var(--text) 45%, transparent)', background: 'transparent', color: s.accent, fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
 + Add another product for guest {ps.person}
 </button>
 )}
 </React.Fragment>
 ) })}
 </div>
 ) : requestOnly && refresherCount === 0 ? (
 <div style={{
 marginBottom: '22px', padding: '20px 22px', borderRadius: 0,
 background: 'color-mix(in srgb, var(--text) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 28%, transparent)',
 }}>
 <div style={{ fontSize: '15px', fontWeight: 500, color: s.text, marginBottom: '8px' }}>
 {product?.name} runs on request
 </div>
 <div style={{ fontSize: '14px', color: s.sub, lineHeight: 1.65, marginBottom: '16px' }}>
 {product?.id === 'single-dive'
 ? 'Our boats go out for two dives per trip, and in high season every seat is planned around that. A single dive fits in when there is a seat to spare — so we arrange it with you personally rather than selling a fixed slot. Tell us your dates and we will find the right day.'
 : product?.id === 'night-dive'
 ? 'Night dives run as their own evening trip and the meeting time depends on sunset, tide and the group. We arrange the date and time with you personally. Tell us when you are on the island and we will come back with what is possible.'
 : 'This one depends on weather, sea state and a minimum group size, so we confirm dates with you personally rather than selling a fixed slot. Tell us roughly when you are on the island and we will come back with what is possible.'}
 </div>
 <a href="/contact" style={{
 display: 'inline-block', padding: '12px 26px', borderRadius: 0,
 background: s.accent, color: 'var(--on-accent)', fontWeight: 500, fontSize: '14px',
 textDecoration: 'none',
 }}>Send an enquiry</a>
 </div>
 ) : (
 <div style={{ marginBottom: '22px' }}>
 <div style={label}>Your booking</div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '10px', lineHeight: 1.55 }}>
 Pick the dates for each item. {isCourse ? 'Courses need a start date only — your instructor confirms the start time (morning or afternoon) after booking.' : isNightProduct(product) ? 'Night dives: pick the evening — the team confirms the meeting time.' : 'For dives choose morning or afternoon per day.'}
 </div>

 {/* Gruppe + SSU: Hinweis mit Split-Knopf direkt hier, wo der Gast nach dem Date-Pick hinschaut (Lucas 24.10.) */}
 {/* Zeile 1 (nur wenn nötig): Scuba Skills Update — eigener Tag VOR dem ersten Tauchtag */}
 {refresherCount > 0 && refresherProduct && (
 <div data-pickrow data-open={openPicker === 'refresher' ? '1' : undefined} style={{ scrollMarginTop: '88px', ...cartLine(openPicker === 'refresher', Boolean(refresherDate)) }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
 <div style={{ flex: 1, minWidth: '160px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}> {refresherProduct.name} × {refresherCount}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {refresherDate
 ? `${fmtDay(refresherDate)} · start time confirmed by your instructor`
 : 'Half-day skills refresher before your first dive — we ask this of every diver after 12+ months out of the water'}
 <span style={{ display: 'block', marginTop: '3px', color: 'var(--text)' }}> Full equipment is included for this session.</span>
 </div>
 </div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.sub, fontVariantNumeric: 'tabular-nums' }}>€{refresherTotal.toFixed(2)}</div>
 <button type="button" onClick={() => setOpenPicker(openPicker === 'refresher' ? null : 'refresher')} style={pickBtn(Boolean(refresherDate))}>
 {refresherDate ? 'Change date' : 'Select date'}
 </button>
 </div>
 {openPicker === 'refresher' && (
 <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 {picked.length === 0 && (
 <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '8px' }}>Pick your dive dates first — the refresher has to happen before your first dive.</div>
 )}
 <CourseStartPicker
 productId={REFRESHER_PRODUCT_ID}
 days={1}
 guests={refresherCount}
 boatDays={0}
 blockedDays={d => windowBlockedFor(d, 'tbd', productId)}
 requestDay={d => windowRequestFor(d, productId)}
 beforeDate={firstDiveDate}
 value={refresherDate || null}
 onChange={d => setRefresherDate(d ?? '')}
 />
 <button type="button" onClick={e => closePicker(e, () => setOpenPicker(null))}
 style={{ width: '100%', marginTop: '12px', padding: '12px', borderRadius: 0, border: 'none', background: refresherDate ? s.accent : 'rgba(255,255,255,.08)', color: refresherDate ? 'var(--bg)' : s.muted, fontWeight: 500, fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer' }}>
 {refresherDate ? 'Confirm' : 'Pick a date'}
 </button>
 </div>
 )}
 </div>
 )}

 {/* Zeile 2: das gewählte Produkt */}
 <div data-pickrow data-open={openPicker === 'product' ? '1' : undefined} style={{ scrollMarginTop: '88px', ...cartLine(openPicker === 'product', picked.length === required) }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
 <div style={{ flex: 1, minWidth: '160px' }}>
 {refresherCount > 0
 ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
 <div style={{ flex: 1 }}>{productSelect(true)}</div>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.text, whiteSpace: 'nowrap' }}>× {guests}</span>
 </div>
 : <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{product?.name ?? '—'} × {guests}</div>}
 {requestOnly ? (
 <div style={{ fontSize: '14px', color: 'var(--text)', marginTop: '6px', lineHeight: 1.5 }}>{product?.name} runs on request — <a href="/contact" style={{ color: s.accent }}>send an enquiry</a> or pick another product.</div>
 ) : (
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>
 {picked.length === 0
 ? (programProduct
 ? `Programme of ${currentProduct?.duration_days_min ?? 21}${currentProduct?.duration_days_usual && currentProduct.duration_days_usual > (currentProduct.duration_days_min ?? 0) ? `–${currentProduct.duration_days_usual}` : ''} days — choose your preferred start day and your last day on the island`
 : isCourse
 ? `${required} consecutive day${required === 1 ? '' : 's'} — choose a start date${refresherCount > 0 && refresherDate ? ` after ${fmtDay(refresherDate)}` : ''}`
 : isNightProduct(product)
 ? `${required} night dive${required === 1 ? '' : 's'} — choose the evening${required === 1 ? '' : 's'}${refresherCount > 0 && refresherDate ? ` after ${fmtDay(refresherDate)}` : ''}`
 : `${required} boat session${required === 1 ? '' : 's'} — choose day${required === 1 ? '' : 's'} and AM/PM${refresherCount > 0 && refresherDate ? ` after ${fmtDay(refresherDate)}` : ''}`)
 : programProduct
 ? `Preferred start ${fmtDay(picked[0].date)}${lastDayOnIsland ? ` · last day on the island ${fmtDay(lastDayOnIsland)}` : ' · last day on the island still missing'} · we plan the programme with you`
 : isCourse
 ? `${fmtDay(picked[0].date)}${required > 1 ? ` ${fmtDay(picked[picked.length - 1].date)}` : ''} · start time confirmed by your instructor`
 : picked.map(x => `${fmtDay(x.date)} ${x.session.toUpperCase()}`).join(' · ')}
 </div>
 )}
 </div>
 {!requestOnly && <div style={{ fontSize: '14px', fontWeight: 500, color: s.sub, fontVariantNumeric: 'tabular-nums' }}>€{productTotal.toFixed(2)}</div>}
 {!requestOnly && <button type="button" onClick={() => setOpenPicker(openPicker === 'product' ? null : 'product')} style={pickBtn(picked.length === required)}>
 {picked.length === required ? 'Change dates' : isCourse ? 'Select start date' : 'Select dates'}
 </button>}
 </div>
 {openPicker === 'product' && !requestOnly && (
 <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
 {isCourse ? (
 <>
 <CourseStartPicker
 productId={productId}
 days={required}
 guests={guests}
 boatDays={programProduct ? 0 : product?.boat_days ?? null}
 skipCapacity={programProduct}
 blockedDays={d => windowBlockedFor(d, 'tbd', productId)}
 requestDay={d => windowRequestFor(d, productId)}
 afterDate={refresherCount > 0 && refresherDate ? refresherDate : null}
 value={courseStart?.date ?? null}
 onChange={d => {
 setCourseStart(d ? { date: d } : null)
 // Letzter Tag auf der Insel vor dem neuen Kursstart ist unmöglich zurücksetzen (z. B. Start auf Juni 2027 verschoben, letzter Tag stand noch im Nov 2026)
 if (d && lastDayOnIsland && lastDayOnIsland < d) setLastDayOnIsland('')
 }}
 />
 {/* B-9: Letzter Tag auf der Insel — erst nach dem Kursstart sichtbar, sonst verwechselt man ihn mit dem Start-Kalender.
 key = Startdatum: der Kalender öffnet im Monat des Kursstarts */}
 {courseStart?.date && (
 <div style={{ marginTop: '14px' }}>
 <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
 <div style={label}>Your last day on the island {programProduct ? '*' : '(optional)'}</div>
 {lastDayOnIsland && <button type="button" onClick={() => setLastDayOnIsland('')} style={{ background: 'none', border: 'none', padding: 0, color: s.accent, fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>}
 </div>
 <DatePicker key={courseStart.date} value={lastDayOnIsland || null} min={courseStart.date} onChange={v => setLastDayOnIsland(v ?? '')} />
 {programProduct && lastDayOnIsland && (() => {
 // Hinweis (kein Block): weniger Zeit als die Mindestdauer des Programms
 const span = Math.round((new Date(lastDayOnIsland + 'T12:00:00').getTime() - new Date(courseStart.date + 'T12:00:00').getTime()) / 86400000) + 1
 const min = currentProduct?.duration_days_min ?? 0
 return span < min
 ? <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text)', lineHeight: 1.5 }}>{product?.name} usually takes at least {min} days — you have {span}. Send the request anyway and we will see what is possible.</div>
 : null
 })()}
 </div>
 )}
 </>
 ) : (
 <SessionPicker
 mode={isNightProduct(product) ? 'night' : 'boat'}
 required={required} seats={guests} picked={picked}
 notBefore={refresherCount > 0 && refresherDate ? refresherDate : undefined}
 blockedSlots={windowBlockedReason}
 onChange={next => setPicked(next)}
 onCapacityChange={setMaxSeats}
 />
 )}
 <button type="button" onClick={e => closePicker(e, () => setOpenPicker(null))}
 style={{ width: '100%', marginTop: '12px', padding: '12px', borderRadius: 0, border: 'none', background: picked.length === required ? s.accent : 'rgba(255,255,255,.08)', color: picked.length === required ? 'var(--bg)' : s.muted, fontWeight: 500, fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer' }}>
 {picked.length === required ? (lastDayMissing ? 'Confirm — then pick your last day above' : 'Confirm') : isCourse ? 'Pick a start date' : `Pick ${required - picked.length} more day${required - picked.length === 1 ? '' : 's'}`}
 </button>
 </div>
 )}
 {lastDayOnIsland && picked.length > 0 && picked[picked.length - 1].date > lastDayOnIsland && (
 <div style={warnBox}> The course would end on {fmtDay(picked[picked.length - 1].date)}, after your last day on the island. Pick an earlier start date.</div>
 )}
 </div>
 </div>
 )}

 {/* Equipment — Miete pro Taucher und Tauchtag. Bei Kursen mit inkludiertem Equipment entfällt die Miete,
 nur die Extras bleiben (Torch, 15L Tank, Gloves — Computer, wenn nicht inkludiert).
 Torch / 15L als hervorgehobene Extras direkt hier — kein Popup vor dem Bezahlen (Entscheidung Lucas 21.10.). */}
 {!requestOnly && !splitActive && !programProduct && equipmentAddons.length > 0 && (
 <div data-step style={{ marginBottom: '22px', scrollMarginTop: '88px' }}>
 <div style={label}>Equipment</div>
 {equipmentIncluded ? (
 <div style={{ border: '1px solid var(--line)', borderRadius: 0, padding: '12px 16px', background: 'transparent', fontSize: '14px', color: 'var(--text)', fontWeight: 500, marginBottom: '10px' }}>
 Full equipment is included in {product?.name ?? 'this course'}.
 </div>
 ) : (
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '10px', lineHeight: 1.55 }}>
 Bring your own or rent ours (Mares). Prices per diver and dive day{diveDays > 1 ? ` — your booking has ${diveDays} dive days` : ''}.
 </div>
 )}

 <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '14px' }}>
 {!equipmentIncluded && fullEquipAddon && (
 <button type="button" onClick={() => toggleAddon(fullEquipAddon.id)} style={addonOpt(selectedAddonIds.has(fullEquipAddon.id))}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
 <span> Full equipment incl. computer</span>
 <span style={{ fontSize: '14px', color: s.muted, fontWeight: 400 }}>Wetsuit, BCD, regulator, mask, fins, boots, computer</span>
 </div>
 <span style={{ fontSize: '14px', fontWeight: selectedAddonIds.has(fullEquipAddon.id) ? 500 : 400, whiteSpace: 'nowrap' }}>
 €{(fullEquipAddon.price_cents / 100).toFixed(0)}/diver/day
 </span>
 </button>
 )}
 {/* Einzelteile: eingeklappt; sobald Full Equipment gewählt ist, ganz ausgeblendet (statt ausgegraut — mobil sonst eine lange tote Liste) */}
 {(() => {
 const singlesMain = regularAddons.filter(a => a.id !== fullEquipAddon?.id && !upsellIds.has(a.id))
 const fullOn = Boolean(!equipmentIncluded && fullEquipAddon && selectedAddonIds.has(fullEquipAddon.id))
 if (singlesMain.length === 0 || fullOn) return null
 return (
 <details open={singlesMain.some(a => selectedAddonIds.has(a.id))} style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 0, padding: '2px 12px' }}>
 <summary style={{ fontSize: '14px', color: s.accent, cursor: 'pointer', padding: '10px 0' }}>Rent single pieces instead</summary>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '10px' }}>
 {singlesMain.map(addon => {
 const active = selectedAddonIds.has(addon.id)
 return (
 <button key={addon.id} type="button" onClick={() => toggleAddon(addon.id)} style={addonOpt(active)}>
 <span>{addon.name}</span>
 <span style={{ fontSize: '14px', fontWeight: active ? 500 : 400, whiteSpace: 'nowrap' }}>€{(addon.price_cents / 100).toFixed(0)}/diver/day</span>
 </button>
 )
 })}
 </div>
 </details>
 )
 })()}
 </div>

 {/* Einsteigerkurse (entry): keine Extras — Torch/15L/Gloves ergeben für Schüler keinen Sinn (Lucas 24.10.) */}
 {!isEntryCourse && (torchAddon || tankAddon || glovesAddon) && (
 <div style={{ border: '1px solid var(--line)', borderRadius: 0, padding: '12px 14px', marginBottom: '10px', background: 'transparent' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '8px' }}>Popular extras</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
 {torchAddon && (
 <button type="button" onClick={() => toggleAddon(torchAddon.id)} style={addonOpt(selectedAddonIds.has(torchAddon.id))}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
 <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
 <span> Torch</span>
 {isNightDive && <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', padding: '2px 7px', borderRadius: 0, background: 'color-mix(in srgb, var(--text) 20%, transparent)', color: s.accent, border: '1px solid color-mix(in srgb, var(--text) 40%, transparent)' }}>Recommended for night dives</span>}
 </span>
 <span style={{ fontSize: '14px', color: s.muted, fontWeight: 400 }}>See what others miss in cracks and caves</span>
 </div>
 <span style={{ fontSize: '14px', fontWeight: selectedAddonIds.has(torchAddon.id) ? 500 : 400, whiteSpace: 'nowrap' }}>€{(torchAddon.price_cents / 100).toFixed(0)}/diver/day</span>
 </button>
 )}
 {tankAddon && (
 <button type="button" onClick={() => toggleAddon(tankAddon.id)} style={addonOpt(selectedAddonIds.has(tankAddon.id))}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
 <span> 15L tank</span>
 <span style={{ fontSize: '14px', color: s.muted, fontWeight: 400 }}>Extra air reserve for heavier breathers — dives end at 50 bar or 50 minutes, whichever comes first</span>
 </div>
 <span style={{ fontSize: '14px', fontWeight: selectedAddonIds.has(tankAddon.id) ? 500 : 400, whiteSpace: 'nowrap' }}>€{(tankAddon.price_cents / 100).toFixed(0)}/diver/day</span>
 </button>
 )}
 {glovesAddon && (
 <button type="button" onClick={() => toggleAddon(glovesAddon.id)} style={addonOpt(selectedAddonIds.has(glovesAddon.id))}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
 <span> Gloves</span>
 <span style={{ fontSize: '14px', color: s.muted, fontWeight: 400 }}>Keep your hands warm</span>
 </div>
 <span style={{ fontSize: '14px', fontWeight: selectedAddonIds.has(glovesAddon.id) ? 500 : 400, whiteSpace: 'nowrap' }}>€{(glovesAddon.price_cents / 100).toFixed(0)}/diver/day</span>
 </button>
 )}
 </div>
 </div>
 )}
 </div>
 )}


 {/* Versicherung gleich unter Produkt/Equipment — die Entscheidung gehört zum Tauchprodukt, nicht hinter die Summe */}
 {splitActive || requestOnly ? null : programProduct ? (
 <div style={{ border: '1px solid color-mix(in srgb, var(--text) 30%, transparent)', borderRadius: 0, padding: '12px 16px', marginBottom: '18px', background: 'color-mix(in srgb, var(--text) 6%, transparent)', fontSize: '14px', color: s.sub, lineHeight: 1.55 }}>
 Dive insurance for {product?.name ?? 'the programme'} is arranged with you when we plan it — nothing to choose now.
 </div>
 ) : insuranceIncluded ? (
 <div style={{ border: '1px solid var(--line)', borderRadius: 0, padding: '12px 16px', marginBottom: '18px', background: 'transparent', fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>
 Dive insurance is included in {product?.name ?? 'this course'} — nothing to add.
 </div>
 ) : (
 /* Versicherung — 2 Optionen: eigene Police oder wir wählen automatisch. */
 <div data-step style={{ scrollMarginTop: '88px', border: '1px solid color-mix(in srgb, var(--text) 30%, transparent)', borderRadius: 0, padding: '14px 16px', marginBottom: '16px', background: 'color-mix(in srgb, var(--text) 6%, transparent)' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent, marginBottom: '6px' }}>
 Dive Insurance
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px', lineHeight: 1.55 }}>
 Cover for hyperbaric treatment and evacuation. Every diver on this booking
 needs it — policy details are collected at check-in.
 </div>

 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
 <button type="button" onClick={() => setInsuranceChoice('auto')} style={insuranceOpt(insuranceChoice === 'auto')}>
 <span> I need diving insurance</span>
 {insuranceChoice === 'auto' && insuranceTotalPerDiver > 0
 ? <span style={{ color: s.accent, fontWeight: 500, fontSize: '14px' }}>
 €{(insuranceTotalPerDiver / 100).toFixed(2)} pp
 </span>
 : <span style={{ color: s.muted, fontSize: '14px' }}>DAN day policy — best plan for your dates</span>
 }
 </button>
 <button type="button" onClick={() => setInsuranceChoice('own')} style={insuranceOpt(insuranceChoice === 'own')}>
 <span> I have my own diving insurance</span>
 <span style={{ color: s.muted, fontSize: '14px' }}>Policy required at check-in</span>
 </button>
 </div>

 {insuranceChoice === 'auto' && autoInsBlocks.length > 0 && (
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '10px', lineHeight: 1.5 }}>
 {insuranceBlockLabel(autoInsBlocks)}
 {' '}— added for all {guests} {guests === 1 ? 'diver' : 'divers'} (€{insuranceTotal.toFixed(2)} total). Non-refundable once issued.
 </div>
 )}
 {insuranceChoice === 'auto' && autoInsBlocks.length === 0 && (
 <div style={{ fontSize: '14px', color: 'var(--text)', marginTop: '10px', lineHeight: 1.5 }}>
 Select your dive dates above — we&apos;ll show the right policy and price.
 </div>
 )}
 </div>
 )}

 {/* Pro-Programme (Divemaster/Dive Guide) bleiben eine eigene Anfrage — kein Kombinieren mit weiteren Produkten */}
 {guests === 1 && !splitActive && !requestOnly && !programProduct && (
 <button type="button" onClick={() => { setSplit(true); setOpenPicker(null); setExtras([{ id: extraSeq, person: 1 }]); setExtraSeq(n => n + 1) }}
 style={{ display: 'block', width: '100%', margin: '0 0 20px', padding: '11px', borderRadius: 0, border: '1px dashed color-mix(in srgb, var(--text) 45%, transparent)', background: 'transparent', color: s.accent, fontSize: '14px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>
 + Add product <span style={{ fontWeight: 400, color: s.muted }}>{refresherCount > 0 ? '— e.g. a dive pack after your Skills Update' : '— e.g. an extra course or dive pack'}</span>
 </button>
 )}

 {(!requestOnly || splitActive) && (
 <>
 <div style={{ background: 'rgba(0,0,0,.3)', borderRadius: 0, padding: '16px 18px', marginBottom: '20px' }}>
 {splitActive ? splitList.map((g, i) => (
 <div key={i} style={{ marginBottom: '10px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent, marginBottom: '4px' }}>{posLabel(i)}</div>
 {(g?.lines ?? [{ label: '—', cents: 0 }]).map((l, k) => (
 <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: s.sub, fontSize: '14px', marginBottom: '4px' }}>
 <span>{l.label}</span><span>€{(l.cents / 100).toFixed(2)}</span>
 </div>
 ))}
 {g && g.sessions.length > 0 && (
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
 {g.refresher_date ? ` ${fmtDay(g.refresher_date)} · ` : ''}{g.sessions.map(x => `${fmtDay(x.date)}${x.session !== 'tbd' ? ` ${x.session.toUpperCase()}` : ''}`).join(' · ')}
 </div>
 )}
 </div>
 )) : (
 <div style={{ display: 'flex', justifyContent: 'space-between', color: s.sub, fontSize: '14px', marginBottom: '8px' }}>
 <span>{product?.name ?? '—'} × {guests}</span>
 <span>€{productTotal.toFixed(2)}</span>
 </div>
 )}
 {!splitActive && autoInsBlocks.length > 0 && (
 <div style={{ display: 'flex', justifyContent: 'space-between', color: s.sub, fontSize: '14px', marginBottom: '8px' }}>
 <span>DAN Insurance × {guests}</span>
 <span>€{insuranceTotal.toFixed(2)}</span>
 </div>
 )}
 {!splitActive && refresherCount > 0 && refresherProduct && (
 <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text)', fontSize: '14px', marginBottom: '8px' }}>
 <span> {refresherProduct.name} × {refresherCount}</span>
 <span>€{refresherTotal.toFixed(2)}</span>
 </div>
 )}
 {!splitActive && [...selectedAddonIds].map(id => {
 const addon = equipmentAddons.find(a => a.id === id)
 if (!addon) return null
 return (
 <div key={id} style={{ display: 'flex', justifyContent: 'space-between', color: s.sub, fontSize: '14px', marginBottom: '8px' }}>
 <span>{addon.name} × {addonQty}{diveDays > 1 ? ` (${guests} × ${diveDays} days)` : ''}</span>
 <span>€{((addon.price_cents * addonQty) / 100).toFixed(2)}</span>
 </div>
 )
 })}
 {!splitActive && picked.length > 0 && (
 <div style={{ fontSize: '14px', color: s.muted, marginBottom: '10px', lineHeight: 1.6 }}>
 {picked.map(p => `${new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${p.session.toUpperCase()}`).join(' · ')}
 </div>
 )}
 <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '19px', fontWeight: 500, color: s.text }}>
 <span>Total</span><span style={{ color: s.accent }}>€{grandTotal.toFixed(2)}</span>
 </div>
 {/* 50 %-Deposit (Lucas 30.10.): ab 350 € Warenkorb, Versicherung immer voll. Server prüft verbindlich. */}
 {depositAvailable && (
 <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: 0, border: `1px solid ${payingDeposit ? 'color-mix(in srgb, var(--text) 40%, transparent)' : 'rgba(255,255,255,.12)'}`, background: payingDeposit ? 'color-mix(in srgb, var(--text) 6%, transparent)' : 'rgba(255,255,255,.02)' }}>
 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: s.text }}>
 <input type="checkbox" checked={depositWanted} onChange={e => setDepositWanted(e.target.checked)} style={{ accentColor: s.accent, width: '16px', height: '16px', marginTop: '2px', flexShrink: 0 }} />
 <span>{requestMode ? 'Request a 50% deposit, the rest on arrival' : 'Pay a 50% deposit now, the rest on arrival'}</span>
 </label>
 <div style={{ marginTop: '6px', paddingLeft: '26px', fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
 {requestMode
 ? <>No payment now. If the team approves your request, the payment link is for the deposit: <b style={{ color: s.text }}>€{depositEur.toFixed(2)}</b> · <b style={{ color: s.text }}>€{depositRestEur.toFixed(2)}</b> due on arrival (cash, card or MB Way at the centre, or a secure payment link by email).</>
 : <>Deposit: <b style={{ color: s.text }}>€{depositEur.toFixed(2)}</b> now · <b style={{ color: s.text }}>€{depositRestEur.toFixed(2)}</b> due on arrival (cash, card or MB Way at the centre, or a secure payment link by email).</>}
 {Math.round(insuranceTotal * 100) > 0 || (splitActive && splitList.some(g => g?.lines.some(l => /insurance/i.test(l.label)))) ? ' Dive insurance is always charged in full: the policy is issued for you at booking and cannot be refunded.' : ''}
 </div>
 </div>
 )}
 {depositLoadError && Math.round(grandTotal * 100) >= ONLINE_DEPOSIT_THRESHOLD_CENTS && (
 <div style={{ marginTop: '8px', fontSize: '14px', color: s.muted }}>Deposit option could not be loaded ({depositLoadError}) — full payment only.</div>
 )}

 </div>

 <div style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 0, padding: '14px 16px', marginBottom: '20px', fontSize: '14px', color: 'var(--text)', lineHeight: 1.6 }}>
 <b style={{ display: 'block', marginBottom: '6px', color: 'var(--text)' }}>After payment</b>
 {(splitActive ? splitList.some(g => g && prices.find(x => x.id === g.product_id)?.category === 'entry') && splitList.every(g => !g || prices.find(x => x.id === g.product_id)?.category === 'entry') : isEntryCourse) ? (
 <>You go straight to the online check-in: a short medical form, your sizes and the e-signed
 waiver — no certification needed, this is your first course. <b>Your instructor confirms the start time by email.</b></>
 ) : (
 <>You go straight to the online check-in: certification, medical form, gear sizes,
 e-signed waiver. <b>Your boat seat is guaranteed once check-in is complete.</b></>
 )}
 </div>


 {/* Der Vertrag entsteht hier, nicht beim Check-in. */}
 <div style={{ border: '1px solid var(--line)', borderRadius: 0, padding: '14px 16px', marginBottom: '16px', background: 'transparent' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '10px' }}>
 Cancellation Policy
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
 {CANCELLATION_SUMMARY.map(row => (
 <div key={row.window} style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', fontSize: '14px', lineHeight: 1.5 }}>
 <span style={{ color: s.sub }}>{row.window}</span>
 <span style={{ color: s.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{row.outcome}</span>
 </div>
 ))}
 </div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '10px', lineHeight: 1.5 }}>{CANCELLATION_BY_US}</div>
 <div style={{ fontSize: '14px', color: s.muted, marginTop: '6px', lineHeight: 1.5 }}>{INSURANCE_NON_REFUNDABLE}</div>
 </div>

 <label style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', marginBottom: '14px', cursor: 'pointer' }}>
 <input type="checkbox" checked={termsAgreed} onChange={e => setTermsAgreed(e.target.checked)}
 style={{ marginTop: '3px', width: '17px', height: '17px', accentColor: s.accent, cursor: 'pointer', flexShrink: 0 }} />
 <span style={{ color: s.sub, fontSize: '14px', lineHeight: 1.6 }}>
 I have read and accept the{' '}
 <a href={TERMS_PATH} target="_blank" rel="noopener noreferrer" style={{ color: s.accent, textDecoration: 'underline' }}>
 Terms &amp; Conditions
 </a>{' '}
 including the cancellation policy above.
 </span>
 </label>

 <label style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', marginBottom: '20px', cursor: 'pointer' }}>
 <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
 style={{ marginTop: '3px', width: '17px', height: '17px', accentColor: s.accent, cursor: 'pointer', flexShrink: 0 }} />
 <span style={{ color: s.sub, fontSize: '14px', lineHeight: 1.6 }}>
 {!splitActive && isEntryCourse
 ? <>I understand I will complete the online check-in (medical form and waiver) before the course starts, and that my place is only confirmed once it is done.</>
 : <>I understand I will complete the online check-in before my dive, that my
 seat is only guaranteed once it is done, and that valid dive insurance —
 whether my own policy or one purchased through us — must be confirmed for every diver before boarding.</>}
 </span>
 </label>

 {error && (
 <div style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 0, padding: '12px 14px', marginBottom: '16px', fontSize: '14px', color: 'var(--text)' }}>
 {error.split(/(send us an inquiry|please get in touch)/).map((part, i) =>
 /^(send us an inquiry|please get in touch)$/.test(part)
 ? <a key={i} href="/contact" style={{ color: 'var(--text)', textDecoration: 'underline', fontWeight: 500 }}>{part}</a>
 : <span key={i}>{part}</span>)}
 </div>
 )}

 <button type="button" onClick={startCheckout} disabled={!canBook} style={{
 width: '100%', padding: '15px', borderRadius: 0, border: 'none',
 fontSize: '16px', fontWeight: 500, fontFamily: s.font,
 cursor: canBook ? 'pointer' : 'default',
 background: canBook ? s.accent : 'rgba(255,255,255,.08)',
 color: canBook ? 'var(--on-accent)' : s.muted,
 }}>
 {ctaLabel}
 </button>

 <p style={{ textAlign: 'center', fontSize: '14px', color: s.muted, marginTop: '14px', marginBottom: 0, lineHeight: 1.6 }}>
 {requestMode ? 'No payment now — a secure Stripe link follows only if your dates work out · Free cancellation up to 72 h before your dive' : 'Secure payment via Stripe · Free cancellation up to 72 h before your dive'}
 </p>
 </>
 )}
 </div>
 )}
 </div>
 </div>
 )
}

export default function BookPage() {
 return (
 <Suspense fallback={<div style={{ minHeight: '100vh', background: s.bgDark }} />}>
 <BookInner />
 </Suspense>
 )
}

function insuranceOpt(active: boolean): React.CSSProperties {
 return {
 display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
 width: '100%', textAlign: 'left', padding: '11px 13px', borderRadius: 0,
 border: `1px solid ${active ? 'color-mix(in srgb, var(--text) 50%, transparent)' : 'rgba(255,255,255,.1)'}`,
 background: active ? 'color-mix(in srgb, var(--text) 10%, transparent)' : 'transparent',
 color: active ? 'var(--text)' : 'var(--accent)',
 fontWeight: active ? 500 : 400, fontSize: '14px',
 cursor: 'pointer', fontFamily: 'inherit',
 }
}

function addonOpt(active: boolean): React.CSSProperties {
 return {
 display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
 width: '100%', textAlign: 'left', padding: '11px 13px', borderRadius: 0,
 border: `1px solid ${active ? 'color-mix(in srgb, var(--text) 50%, transparent)' : 'rgba(255,255,255,.1)'}`,
 background: active ? 'color-mix(in srgb, var(--text) 10%, transparent)' : 'transparent',
 color: active ? 'var(--text)' : 'var(--accent)',
 fontWeight: active ? 500 : 400, fontSize: '14px',
 cursor: 'pointer', fontFamily: 'inherit',
 }
}

function stepBtn(enabled: boolean): React.CSSProperties {
 return {
 width: '44px', height: '46px', borderRadius: 0,
 cursor: enabled ? 'pointer' : 'default', fontSize: '20px',
 background: enabled ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)',
 color: enabled ? 'var(--text)' : 'rgba(255,255,255,.2)',
 border: '1px solid rgba(255,255,255,.12)',
 fontFamily: 'inherit',
 }
}
