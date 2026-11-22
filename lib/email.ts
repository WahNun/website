import { createClient } from '@supabase/supabase-js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ─── Medical topic labels ────────────────────────────────────────────────────

const MEDICAL_TOPIC_MAP: Record<string, string> = {
 A: 'lungs, heart and blood',
 B: 'cardiovascular risk factors (over 45)',
 C: 'ears, sinuses or eyes — equalisation',
 D: 'neurological, loss of consciousness',
 E: 'mental health or ongoing medication',
 F: 'back, hernia or diabetes',
 G: 'stomach or intestines',
 Q3: 'physical fitness / exercise tolerance',
 Q5: 'surgery within the last 12 months',
 Q10: 'prescription medication',
}

/**
 * Derives readable topics from raw medical_answers stored in the DB.
 * Box keys (a1, b2, …) are mapped to their box letter; q3/q5/q10 directly.
 * All other keys (q1, q2, q4, q6–q9) never trigger on their own.
 */
export function topicsFromAnswers(answers: Record<string, boolean>): string[] {
 const hits = new Set<string>()
 if (answers.q3) hits.add('Q3')
 if (answers.q5) hits.add('Q5')
 if (answers.q10) hits.add('Q10')
 for (const [k, v] of Object.entries(answers)) {
 if (!v) continue
 const letter = k[0]?.toUpperCase()
 if (letter && letter >= 'A' && letter <= 'G') hits.add(letter)
 }
 return [...hits].map(k => MEDICAL_TOPIC_MAP[k]).filter(Boolean) as string[]
}

function readMedicalFormPdf(): Buffer | null {
 try {
 return readFileSync(resolve(process.cwd(), 'public', 'dan-medical-examiner-form.pdf'))
 } catch {
 // PDF not yet placed in public/ — attach when file is available
 return null
 }
}

/**
 * Mailversand über das bestehende Gmail-OAuth-Konto (azoresdiving@gmail.com),
 * dasselbe, über das die Ticket-Antworten laufen.
 *
 * Jeder Versuch wird in system_logs protokolliert — auch der gescheiterte.
 * Eine Mail, die niemand erreicht und von der niemand weiss, ist schlimmer als
 * gar keine: der Gast wartet auf einen Check-in-Link, das Team ahnt nichts.
 */

function serviceClient() {
 return createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.SUPABASE_SERVICE_ROLE_KEY!,
 { auth: { persistSession: false } }
 )
}

async function getAccessToken(): Promise<string> {
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
 if (!res.ok) throw new Error(`Gmail token request failed: ${res.status} ${await res.text()}`)
 const data = await res.json() as { access_token?: string }
 if (!data.access_token) throw new Error('Gmail token response had no access_token')
 return data.access_token
}

function encodeHeader(v: string) {
 // RFC 2047 für Umlaute und Akzente in Betreff und Namen
 return /^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString('base64')}?=`
}

function buildMime(opts: { to: string; subject: string; text: string; html: string; replyTo?: string; attachments?: MailOptions['attachments'] }) {
 const inner = 'azd_alt_' + Date.now().toString(36)
 const altParts = [
 `--${inner}`,
 `Content-Type: text/plain; charset=utf-8`,
 ``,
 opts.text,
 ``,
 `--${inner}`,
 `Content-Type: text/html; charset=utf-8`,
 ``,
 opts.html,
 ``,
 `--${inner}--`,
 ]

 let mime: string
 if (opts.attachments?.length) {
 const outer = 'azd_mix_' + (Date.now() + 1).toString(36)
 const attachParts: string[] = []
 for (const att of opts.attachments) {
 attachParts.push(
 `--${outer}`,
 `Content-Type: ${att.contentType}`,
 `Content-Transfer-Encoding: base64`,
 `Content-Disposition: attachment; filename="${att.filename}"`,
 ``,
 att.data.toString('base64').replace(/(.{76})/g, '$1\r\n').trimEnd(),
 ``,
 )
 }
 mime = [
 `From: "Azores Diving" <azoresdiving@gmail.com>`,
 `To: ${opts.to}`,
 `Reply-To: ${opts.replyTo ?? replyToAddress()}`,
 `Subject: ${encodeHeader(opts.subject)}`,
 `MIME-Version: 1.0`,
 `Content-Type: multipart/mixed; boundary="${outer}"`,
 ``,
 `--${outer}`,
 `Content-Type: multipart/alternative; boundary="${inner}"`,
 ``,
 ...altParts,
 ``,
 ...attachParts,
 `--${outer}--`,
 ].join('\r\n')
 } else {
 mime = [
 `From: "Azores Diving" <azoresdiving@gmail.com>`,
 `To: ${opts.to}`,
 `Reply-To: ${opts.replyTo ?? replyToAddress()}`,
 `Subject: ${encodeHeader(opts.subject)}`,
 `MIME-Version: 1.0`,
 `Content-Type: multipart/alternative; boundary="${inner}"`,
 ``,
 ...altParts,
 ].join('\r\n')
 }

 return Buffer.from(mime).toString('base64')
 .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export type MailOptions = {
 to: string
 subject: string
 text: string
 html: string
 /** Wofür wurde gesendet — landet im Log */
 kind: string
 entityId?: string
 replyTo?: string
 attachments?: Array<{ filename: string; contentType: string; data: Buffer }>
}

/**
 * Anbieter steckt hinter einer Weiche: heute Gmail (läuft bereits), später
 * Resend über die eigene Domain. RESEND_API_KEY gesetzt Resend, sonst Gmail.
 * So blockiert der Wechsel nichts und kostet später eine Umgebungsvariable.
 */
/**
 * Wohin Antworten gehen. Bewusst KEIN noreply: die Bestätigung fordert den Gast
 * ausdrücklich auf zu antworten, wenn er eine Vorerkrankung hat oder unsicher
 * ist — genau diese Mails wollen wir. Der Absender läuft über die eigene Domain
 * (Zustellbarkeit), die Antwort landet im Postfach, das das Team ohnehin liest.
 * Beim Wechsel auf Google Workspace nur diese Variable umstellen.
 */
export function replyToAddress() {
 return process.env.REPLY_TO_EMAIL?.trim() || 'azoresdiving@gmail.com'
}

async function deliver(opts: MailOptions): Promise<void> {
 const resendKey = process.env.RESEND_API_KEY?.trim()

 if (resendKey) {
 const body: Record<string, unknown> = {
 from: process.env.RESEND_FROM?.trim() || 'Azoresdiving <bookings@azoresdiving.com>',
 to: [opts.to],
 subject: opts.subject,
 text: opts.text,
 html: opts.html,
 reply_to: opts.replyTo ?? replyToAddress(),
 }
 if (opts.attachments?.length) {
 body.attachments = opts.attachments.map(a => ({
 filename: a.filename,
 content: a.data.toString('base64'),
 }))
 }
 const res = await fetch('https://api.resend.com/emails', {
 method: 'POST',
 headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 })
 if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`)
 return
 }

 if (!process.env.GMAIL_REFRESH_TOKEN) {
 throw new Error('Email sending is not set up on this server (no RESEND_API_KEY and no GMAIL_REFRESH_TOKEN)')
 }
 const token = await getAccessToken()
 const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
 method: 'POST',
 headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
 body: JSON.stringify({ raw: buildMime(opts) }),
 })
 if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`)
}

/**
 * Vorschau-Modus (Marketing-Tab): Innerhalb von capturePreview() sendet sendMail NICHT, sondern
 * sammelt die fertig gerenderte Mail. So zeigt die Vorschau exakt das, was die echten Funktionen
 * erzeugen — kein zweiter, nachgebauter Template-Satz mehr. AsyncLocalStorage, damit parallele
 * Requests derselben Function-Instanz sich nicht gegenseitig den Versand abfangen.
 */
export type CapturedMail = { to: string; subject: string; text: string; html: string; kind: string }
const previewStore = new AsyncLocalStorage<{ captured: CapturedMail[] }>()
export async function capturePreview(fn: () => Promise<unknown>): Promise<CapturedMail[]> {
 const ctx = { captured: [] as CapturedMail[] }
 await previewStore.run(ctx, fn)
 return ctx.captured
}

export async function sendMail(opts: MailOptions): Promise<{ ok: boolean; error?: string }> {
 const preview = previewStore.getStore()
 if (preview) {
 preview.captured.push({ to: opts.to, subject: opts.subject, text: opts.text, html: opts.html, kind: opts.kind })
 return { ok: true }
 }
 if (!process.env.RESEND_API_KEY?.trim() && !process.env.GMAIL_REFRESH_TOKEN?.trim()) {
 console.info(`[email] skipped, no provider configured: "${opts.subject}" to ${opts.to}`)
 return { ok: false, error: 'Email is not configured. Nothing was sent.' }
 }
 const db = serviceClient()
 const provider = process.env.RESEND_API_KEY?.trim() ? 'resend' : 'gmail'

 const log = async (status: 'sent' | 'failed', note?: string) => {
 try {
 await db.from('system_logs').insert({
 action: `email_${status}`,
 entity_type: 'email',
 entity_id: opts.entityId ?? null,
 source: 'azd',
 notes: note ?? null,
 payload_after: { to: opts.to, subject: opts.subject, kind: opts.kind, provider },
 })
 } catch (e) {
 // Wenn selbst das Log scheitert, wenigstens in die Serverlogs
 console.error('[email] log write failed:', e)
 }
 }

 try {
 await deliver(opts)
 await log('sent')
 console.log(`[email] sent via ${provider}: "${opts.subject}" to ${opts.to}`)
 return { ok: true }
 } catch (e) {
 const msg = e instanceof Error ? e.message : String(e)
 await log('failed', msg)
 console.error(`[email] FAILED "${opts.subject}" to ${opts.to}:`, msg)
 return { ok: false, error: msg }
 }
}

// ─── Buchungsbestätigung mit Check-in-Link ───────────────────────────────────

export type BookingMailData = {
 to: string
 customerName: string | null
 productName: string
 sessions: { date: string; session: string }[]
 checkinUrl: string
 groupSize: number
 amountCents: number | null
 hasOwnInsurance: boolean
 isTest: boolean
 bookingId: string
 favouriteSpot?: { slug: string; name: string }
 /** Offener Rest bei Deposit-Zahlung (Cent) — null/0 = voll bezahlt, kein Hinweis */
 balanceDueCents?: number | null
 /** true = fuer den offenen Rest geht eine eigene Mail mit Zahlungsdaten (Transfer / Revolut) raus, also nicht "due on arrival" */
 balanceByRequest?: boolean
 /**
 * Online-Split (Lucas 24.10.): eine Zahlung, eine Buchung pro Person. Gesetzt die Mail listet jede Person mit
 * Produkt, Tagen, Betrag und EIGENEM Check-in-Link; productName/sessions/checkinUrl oben gelten dann nur als Fallback.
 */
 splitGuests?: { label: string; productName: string; sessions: { date: string; session: string }[]; checkinUrl: string; amountCents: number | null; ownInsurance: boolean }[]
}

function fmtDate(d: string) {
 return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
 weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
 })
}

function displayFirstName(name: string): string {
 const t = name.trim()
 return t.charAt(0).toUpperCase() + t.slice(1)
}

export async function sendBookingConfirmation(d: BookingMailData) {
 const greeting = d.customerName ? `Hi ${displayFirstName(d.customerName.split(' ')[0])},` : 'Hi,'
 const days = d.sessions.map(x =>
 `${fmtDate(x.date)} — ${x.session === 'am' ? 'Morning (be at the centre by 08:00)' : x.session === 'pm' ? 'Afternoon' : x.session === 'night' ? 'Night Dive (evening — meeting time confirmed by our team)' : 'Start time confirmed by your instructor'}`
 )
 const amount = d.amountCents != null ? `€${(d.amountCents / 100).toFixed(2)}` : null
 // Der Betreff sagt es sofort, damit eine Testmail nie für echt gehalten wird
 const subject = `${d.isTest ? '[TEST] ' : ''}Your dive is booked — one step left`

 const sessLine = (x: { date: string; session: string }) =>
 `${fmtDate(x.date)} — ${x.session === 'am' ? 'Morning (be at the centre by 08:00)' : x.session === 'pm' ? 'Afternoon' : x.session === 'night' ? 'Night Dive (evening — meeting time confirmed by our team)' : 'Start time confirmed by your instructor'}`
 const split = d.splitGuests && d.splitGuests.length > 0 ? d.splitGuests : null
 // Produkte mit inkludierter Versicherung (Kurse wie Basic Diver / Open Water): kein „own insurance“-Hinweis, Kurs-Check-in-Text
 const insIncluded = async (name: string) => {
 try { const { data } = await serviceClient().from('course_prices').select('insurance_included').eq('name', name).maybeSingle(); return Boolean(data?.insurance_included) } catch { return false }
 }
 const courseMail = !split && await insIncluded(d.productName)
 const splitOwn = split ? (await Promise.all(split.map(async g => g.ownInsurance && !(await insIncluded(g.productName))))).some(Boolean) : false
 const hasOwn = split ? splitOwn : d.hasOwnInsurance && !courseMail
 const text = [
 greeting,
 ``,
 `Your booking is confirmed. Thank you for choosing to dive with us.`,
 ``,
 ...(split
 ? split.flatMap(g => [
 `${g.label}: ${g.productName}${g.amountCents != null ? ` · €${(g.amountCents / 100).toFixed(2)}` : ''}`,
 ...g.sessions.map(x => ` ${sessLine(x)}`),
 ``,
 ])
 : [
 `${d.productName}${d.groupSize > 1 ? ` · ${d.groupSize} guests` : ''}${amount ? ` · ${amount}` : ''}`,
 ``,
 ...days.map(x => ` ${x}`),
 ]),
 ...(d.favouriteSpot ? [
 ``,
 `Your favourite site: ${d.favouriteSpot.name}. Our staff picks the site each day based on sea conditions and the group on board — no promises, but if it fits, we'll get you there.`,
 ] : []),
 ...(d.balanceDueCents && d.balanceDueCents > 0 ? [
 ``,
 `PAYMENT`,
 ``,
 `Deposit received: ${amount ?? '—'}`,
 ...(d.balanceByRequest
 ? [`Still open: €${(d.balanceDueCents / 100).toFixed(2)}`, `We are sending you the payment details in a separate email.`]
 : [`Balance due on arrival: €${(d.balanceDueCents / 100).toFixed(2)}`, `Pay at the centre (cash, card or Revolut) — or reply to this email and we send you a secure payment link.`]),
 ] : []),
 ``,
 `ONE STEP LEFT — ONLINE CHECK-IN`,
 ``,
 ...(courseMail ? [
 `Please complete your check-in before your course. It takes about five`,
 `minutes: a short medical form, gear sizes and a signed waiver. Doing it`,
 `now saves you time at the centre.`,
 ] : [
 `Please complete your check-in before your first dive. It takes about five`,
 `minutes: certification level, a short medical form, gear sizes and a signed`,
 `waiver. Doing it now means you can walk straight onto the boat.`,
 ]),
 ``,
 ...(split
 ? [
 `Each guest has their own booking and their own check-in link — forward each link to the right person:`,
 ``,
 ...split.flatMap(g => [` ${g.label} (${g.productName}):`, ` ${g.checkinUrl}`, ``]),
 ]
 : [` ${d.checkinUrl}`, ``]),
 !split && d.groupSize > 1
 ? `The link covers all ${d.groupSize} guests — each person fills in their own part. You can forward it.`
 : ``,
 ...(courseMail ? [] : [`Your seat is confirmed once check-in is complete.`]),
 ``,
 ...(hasOwn ? [`DIVE INSURANCE`, ``, `You indicated you have your own dive insurance. Please bring proof with you on the day — we may need to verify it before boarding.`, ``] : []),
 ...(courseMail ? [`DIVE INSURANCE`, ``, `SSI dive insurance is included in your course — nothing to arrange or bring.`, ``] : []),
 `Anything to tell us beforehand — a medical condition, nerves, a question you`,
 `are not sure how to ask? Just reply to this email. There is nothing too`,
 `small, and we would rather know in advance.`,
 ``,
 `See you underwater,`,
 `Azoresdiving Team`,
 ``,
 `Marina Pêro de Teive, Quiosque A · 9500-771 Ponta Delgada, São Miguel, Azores`,
 `+351 927 382 023 · azoresdiving@gmail.com · Daily 8:00–20:00`,
 `azoresdiving.com`,
 d.isTest ? `\n---\nTEST BOOKING — created in the Stripe sandbox, no money moved.` : ``,
 ].filter(l => l !== '').join('\n')

 const daysRows = days.map(x =>
 `<tr><td style="padding:3px 0;font-size:15px;color:#f3efe6;line-height:1.6;">${x}</td></tr>`
 ).join('')

 const html = `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <meta name="color-scheme" content="dark">
 <meta name="supported-color-schemes" content="dark">
 <title>Azoresdiving</title>
</head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210">
 <tr>
 <td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${d.isTest ? `<tr><td bgcolor="#2A2312" style="border-radius:10px;padding:14px 18px;margin-bottom:16px;">
 <p style="margin:0;font-size:13px;color:#FFD080;line-height:1.6;">
 <strong>Test booking</strong> &middot; created in the Stripe sandbox. No money moved and no seat is reserved.
 </p>
 </td></tr><tr><td style="height:16px;"></td></tr>` : ''}
 <tr>
 <td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">

 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#f3efe6;">Booking confirmed</p>
 <h1 style="margin:0 0 24px 0;font-size:28px;font-weight:900;color:#f3efe6;line-height:1.2;">Your dive is booked<span style="color:#f3efe6;">.</span></h1>

 <p style="margin:0 0 24px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>
 <p style="margin:0 0 28px 0;font-size:17px;line-height:1.7;color:#f3efe6;">Thank you for choosing to dive with us. Here is what you booked.</p>

 ${split
 ? split.map(g => `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-radius:10px;margin-bottom:12px;">
 <tr><td style="padding:16px 20px;">
 <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#f3efe6;">${escHtml(g.label)}</p>
 <p style="margin:0 0 10px 0;font-size:16px;font-weight:800;color:#f3efe6;">${g.productName}${g.amountCents != null ? ` &middot; &euro;${(g.amountCents / 100).toFixed(2)}` : ''}</p>
 <table width="100%" cellpadding="0" cellspacing="0">${g.sessions.map(x => `<tr><td style="padding:3px 0;font-size:15px;color:#f3efe6;line-height:1.6;">${sessLine(x)}</td></tr>`).join('')}</table>
 </td></tr>
 </table>`).join('') + `<p style="margin:0 0 28px 0;font-size:14px;color:#c9c2b6;">Paid together${amount ? `: <strong style="color:#f3efe6;">${amount}</strong>` : ''}.</p>`
 : `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-radius:10px;margin-bottom:28px;">
 <tr><td style="padding:18px 20px;">
 <p style="margin:0 0 12px 0;font-size:16px;font-weight:800;color:#f3efe6;">${d.productName}${d.groupSize > 1 ? ` &middot; ${d.groupSize} guests` : ''}${amount ? ` &middot; ${amount}` : ''}</p>
 <table width="100%" cellpadding="0" cellspacing="0">${daysRows}</table>
 </td></tr>
 </table>`}

 ${d.favouriteSpot ? `
 <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-radius:10px;margin-bottom:20px;">
 <tr><td style="padding:14px 20px;">
 <p style="margin:0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Your favourite site: <strong>${d.favouriteSpot.name}</strong>. Our staff picks the site each day based on sea conditions and the group on board &mdash; no promises, but if it fits, we&rsquo;ll get you there.
 </p>
 </td></tr>
 </table>` : ''}

 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#FFD080;">One step left</p>
 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">
 ${courseMail
 ? 'Please complete your online check-in before your course. About five minutes: a short medical form, gear sizes and a signed waiver. Doing it now saves you time at the centre.'
 : 'Please complete your online check-in before your first dive. About five minutes: certification level, a short medical form, gear sizes and a signed waiver. Doing it now means you can walk straight onto the boat.'}
 </p>

 ${split
 ? split.map(g => `<table cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;">
 <tr><td style="padding:0 0 6px 0;font-size:13px;color:#f3efe6;">${escHtml(g.label)} &middot; ${g.productName}</td></tr>
 <tr><td bgcolor="#f3efe6" style="border-radius:999px;background-color:#f3efe6;background-image:linear-gradient(135deg,#f3efe6,#f3efe6);">
 <a href="${g.checkinUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:800;color:#121210;text-decoration:none;">Check-in ${escHtml(g.label)}</a>
 </td></tr>
 </table>`).join('')
 : `<table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
 <tr><td bgcolor="#f3efe6" style="border-radius:999px;background-color:#f3efe6;background-image:linear-gradient(135deg,#f3efe6,#f3efe6);">
 <a href="${d.checkinUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;color:#121210;text-decoration:none;">Complete check-in</a>
 </td></tr>
 </table>`}

 <p style="margin:0 0 24px 0;font-size:14px;color:#c9c2b6;line-height:1.7;">
 ${split ? `Each guest has their own booking and their own check-in link &mdash; forward each link to the right person.<br>` : d.groupSize > 1 ? `This link covers all ${d.groupSize} guests &mdash; each person fills in their own part, so feel free to forward it.<br>` : ''}
 ${courseMail ? '' : 'Your seat is confirmed once check-in is complete.'}
 </p>

 ${d.balanceDueCents && d.balanceDueCents > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#2A2312;border-left:3px solid #FFD080;border-radius:0 8px 8px 0;margin-bottom:28px;"><tr><td style="padding:16px 20px;"><p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#FFD080;">Payment</p><p style="margin:0;font-size:14px;line-height:1.7;color:#f3efe6;">Deposit received: <strong style="color:#f3efe6;">${amount ?? '&mdash;'}</strong><br>${d.balanceByRequest ? 'Still open' : 'Balance due on arrival'}: <strong style="color:#f3efe6;">&euro;${(d.balanceDueCents / 100).toFixed(2)}</strong><br>${d.balanceByRequest ? 'We are sending you the payment details in a separate email.' : 'Pay at the centre (cash, card or Revolut) &mdash; or reply to this email and we send you a secure payment link.'}</p></td></tr></table>` : ''}
 ${courseMail ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D2010;border-left:3px solid #4CAF50;border-radius:0 8px 8px 0;margin-bottom:28px;"><tr><td style="padding:16px 20px;"><p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#81C784;">Dive Insurance</p><p style="margin:0;font-size:14px;line-height:1.7;color:#f3efe6;">SSI dive insurance is included in your course &mdash; nothing to arrange or bring.</p></td></tr></table>` : ''}
 ${hasOwn ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D2010;border-left:3px solid #4CAF50;border-radius:0 8px 8px 0;margin-bottom:28px;"><tr><td style="padding:16px 20px;"><p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#81C784;">Dive Insurance</p><p style="margin:0;font-size:14px;line-height:1.7;color:#f3efe6;">You indicated you have your own dive insurance. Please bring proof with you on the day &mdash; we may need to verify it before boarding.</p></td></tr></table>` : ''}

 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">

 <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#f3efe6;">
 Anything to tell us beforehand &mdash; a medical condition, nerves, a question you are
 not sure how to ask? Just reply to this email. There is nothing too small, and we
 would rather know in advance.
 </p>

 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>

 </td>
 </tr>
 <tr>
 <td align="center" style="padding-top:32px;">
 <img src="https://www.azoresdiving.com/logo.png" alt="Azoresdiving" width="110" style="display:block;max-width:110px;margin:0 auto 16px;">
 <p style="margin:0;font-size:11px;color:#a39e94;line-height:1.9;letter-spacing:0.03em;">
 Marina P&ecirc;ro de Teive, Quiosque A &middot; 9500-771 Ponta Delgada, S&atilde;o Miguel, Azores<br>
 +351 927 382 023 &middot; azoresdiving@gmail.com<br>
 Daily 8:00&ndash;20:00
 </p>
 </td>
 </tr>
 <tr>
 <td align="center" style="padding-top:20px;">
 <p style="margin:0;font-size:11px;color:#a39e94;line-height:1.7;max-width:480px;">Make the most of your stay! You can book activities with us such as whale watching, swimming with dolphins, van or jeep tours, hiking trails, and much more. For car rentals, we recommend getting in touch with our partners at <a href="https://primeazores.pt/" style="color:#a39e94;text-decoration:none;">primeazores</a>.</p>
 </td>
 </tr>
 </table>
 </td>
 </tr>
 </table>
</body>
</html>`

 return sendMail({
 to: d.to,
 subject,
 text,
 html,
 kind: 'booking_confirmation',
 entityId: d.bookingId,
 replyTo: replyToAddress(),
 })
}

/**
 * Aufforderung zur aerztlichen Tauchtauglichkeit.
 *
 * Geht raus, sobald jemand im Check-in eine medizinische Frage mit Ja
 * beantwortet hat. Der Dialog im Formular klaert im Moment auf; diese Mail ist
 * das, was der Gast am Morgen der Fahrt noch findet — mit dem Datum, damit er
 * weiss, bis wann er beim Arzt gewesen sein muss.
 */
export async function sendMedicalClearanceRequired(d: {
 to: string
 customerName: string | null
 reasons: string[]
 medical_answers: Record<string, boolean>
 firstDiveDate: string | null
 isTest: boolean
 bookingId: string
}) {
 const greeting = d.customerName ? `Hi ${displayFirstName(d.customerName.split(' ')[0])},` : 'Hi,'
 const when = d.firstDiveDate ? fmtDate(d.firstDiveDate) : 'your dive'
 const subject = `${d.isTest ? '[TEST] ' : ''}Before your dive: medical clearance needed`

 // Derive topics server-side from the stored answers — not from the client-supplied reasons array.
 const topics = topicsFromAnswers(d.medical_answers)
 const topicsText = topics.map(t => ` – ${t}`).join('\n')
 const topicsHtml = topics.map(t =>
 `<li style="margin:0 0 4px 0;font-size:15px;line-height:1.7;color:#f3efe6;">${t}</li>`
 ).join('')

 const text = [
 greeting,
 ``,
 `During your health declaration, you flagged the following:`,
 ``,
 topicsText,
 ``,
 `That is not a problem and it does not exclude you from diving — most conditions are`,
 `cleared without difficulty. But diving with compressed air puts a specific load`,
 `on the body, so the decision belongs to a physician rather than to us.`,
 ``,
 `WHAT TO BRING ON ${when.toUpperCase()}`,
 ``,
 ` A written statement from a physician confirming you are fit to dive, dated`,
 ` within the last 12 months. A diving medical (SSI, PADI or the standard`,
 ` European form) is ideal; a signed letter from your own doctor referring to`,
 ` recreational scuba diving also works. Paper or on your phone, both fine.`,
 ` We have attached the official DAN Medical Examiner's Evaluation Form for`,
 ` your doctor's use.`,
 ``,
 `Without it we cannot take you in the water. That is a safety rule, not`,
 `paperwork, and the crew cannot waive it at the pontoon.`,
 ``,
 `Not sure whether your condition is even relevant? Reply to this email and ask`,
 `us first. It is far easier to sort out now than on the morning of the dive.`,
 ``,
 `See you underwater,`,
 `Azoresdiving Team`,
 ``,
 `Marina Pêro de Teive, Quiosque A · 9500-771 Ponta Delgada, São Miguel, Azores`,
 `+351 927 382 023 · azoresdiving@gmail.com · Daily 8:00–20:00`,
 d.isTest ? `\n---\nTEST — no real booking.` : ``,
 ].filter(l => l !== '').join('\n')

 const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${d.isTest ? `<tr><td bgcolor="#2A2312" style="border-radius:10px;padding:14px 18px;">
 <p style="margin:0;font-size:13px;color:#FFD080;line-height:1.6;"><strong>Test</strong> &middot; not a real booking.</p>
 </td></tr><tr><td style="height:16px;"></td></tr>` : ''}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">

 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#FFD080;">Before you dive</p>
 <h1 style="margin:0 0 24px 0;font-size:28px;font-weight:900;color:#f3efe6;line-height:1.2;">A doctor needs to sign you off<span style="color:#f3efe6;">.</span></h1>

 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>

 <p style="margin:0 0 10px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 During your health declaration, you flagged the following:
 </p>
 <ul style="margin:0 0 20px 24px;padding:0;">${topicsHtml}</ul>

 <p style="margin:0 0 24px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 That is not a problem and it does not exclude you from diving &mdash; most conditions are
 cleared without difficulty. But diving with compressed air puts a specific load on the
 body, so the decision belongs to a physician rather than to us.
 </p>

 <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-radius:10px;margin-bottom:26px;">
 <tr><td style="padding:18px 20px;">
 <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#FFD080;">What to bring on ${when}</p>
 <p style="margin:0 0 12px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 A written statement from a physician confirming you are fit to dive, dated within the
 last 12 months. A diving medical (SSI, PADI or the standard European form) is ideal;
 a signed letter from your own doctor referring to recreational scuba diving also
 works. Paper or on your phone, both fine.
 </p>
 <p style="margin:0;font-size:15px;line-height:1.75;color:#f3efe6;">
 We have attached the official DAN Medical Examiner&rsquo;s Evaluation Form for your
 doctor&rsquo;s use.
 </p>
 </td></tr>
 </table>

 <p style="margin:0 0 24px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 Without it we cannot take you in the water. That is a safety rule, not paperwork, and the
 crew cannot waive it at the pontoon.
 </p>

 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">

 <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#f3efe6;">
 Not sure whether your condition is even relevant? Just reply to this email and ask us
 first &mdash; it is far easier to sort out now than on the morning of the dive.
 </p>

 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>

 </td></tr>
 <tr><td align="center" style="padding-top:32px;">
 <img src="https://www.azoresdiving.com/logo.png" alt="Azoresdiving" width="110" style="display:block;max-width:110px;margin:0 auto 16px;">
 <p style="margin:0;font-size:11px;color:#a39e94;line-height:1.9;letter-spacing:0.03em;">
 Marina P&ecirc;ro de Teive, Quiosque A &middot; 9500-771 Ponta Delgada, S&atilde;o Miguel, Azores<br>
 +351 927 382 023 &middot; azoresdiving@gmail.com<br>Daily 8:00&ndash;20:00
 </p>
 </td></tr>
 </table>
 </td></tr></table>
</body>
</html>`

 const pdfBuffer = readMedicalFormPdf()
 const attachments: MailOptions['attachments'] = pdfBuffer
 ? [{ filename: 'DAN-Medical-Examiner-Form.pdf', contentType: 'application/pdf', data: pdfBuffer }]
 : []

 return sendMail({
 to: d.to,
 subject,
 text,
 html,
 kind: 'medical_clearance_required',
 entityId: d.bookingId,
 replyTo: replyToAddress(),
 attachments,
 })
}

// ─── Check-in Erinnerungen ────────────────────────────────────────────────────
//
// Vier Stufen, jeweils als eigenstaendige Funktion damit sie einzeln testbar
// sind. Alle teilen denselben Aufbau wie sendBookingConfirmation (Text + HTML).
//
// CheckinReminderMailData.divers:
// - name: null wenn Gast noch keinen Check-in angefangen hat
// - slotIndex: fuer das Fallback-Label "Guest 1", "Guest 2" …
// - checkinUrl: Slot-spezifischer oder Buchungs-Token

export type CheckinReminderMailData = {
 to: string
 divers: Array<{ name: string | null; slotIndex: number; checkinUrl: string }>
 firstDiveDate: string
 productName: string
 isTest: boolean
 bookingId: string
 favouriteSpot?: { slug: string; name: string }
}

function diverLabel(d: { name: string | null; slotIndex: number }): string {
 return d.name?.trim() || `Guest ${d.slotIndex + 1}`
}

function reminderFooterText(isTest: boolean) {
 return [
 `See you underwater,`,
 `Azoresdiving Team`,
 ``,
 `Marina Pêro de Teive, Quiosque A · 9500-771 Ponta Delgada, São Miguel, Azores`,
 `+351 927 382 023 · azoresdiving@gmail.com · Daily 8:00–20:00`,
 isTest ? `\n---\nTEST — no real booking.` : ``,
 ].join('\n')
}

function reminderFooterHtml() {
 return `
 <tr>
 <td align="center" style="padding-top:32px;">
 <img src="https://www.azoresdiving.com/logo.png" alt="Azoresdiving" width="110"
 style="display:block;max-width:110px;margin:0 auto 16px;">
 <p style="margin:0;font-size:11px;color:#a39e94;line-height:1.9;letter-spacing:0.03em;">
 Marina P&ecirc;ro de Teive, Quiosque A &middot; 9500-771 Ponta Delgada, S&atilde;o Miguel, Azores<br>
 +351 927 382 023 &middot; azoresdiving@gmail.com<br>Daily 8:00&ndash;20:00
 </p>
 </td>
 </tr>`
}

function reminderTestBannerHtml(isTest: boolean) {
 if (!isTest) return ''
 return `<tr><td bgcolor="#2A2312" style="border-radius:10px;padding:14px 18px;">
 <p style="margin:0;font-size:13px;color:#FFD080;line-height:1.6;"><strong>Test</strong> &middot; no real booking.</p>
 </td></tr><tr><td style="height:16px;"></td></tr>`
}

export function renderEmailShell(opts: {
 isTest: boolean
 eyebrow: string
 eyebrowColor: string
 title: string
 bodyHtml: string
}): string {
 return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${reminderTestBannerHtml(opts.isTest)}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">
 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${opts.eyebrowColor};">${opts.eyebrow}</p>
 <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#f3efe6;line-height:1.2;">${opts.title}</h1>
 ${opts.bodyHtml}
 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">
 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>
 </td></tr>
 ${reminderFooterHtml()}
 </table>
 </td></tr></table>
</body>
</html>`
}

function reminderDiversText(divers: CheckinReminderMailData['divers']): string[] {
 if (divers.length === 1) {
 return [` ${divers[0].checkinUrl}`]
 }
 return divers.map(d => ` ${diverLabel(d)}: ${d.checkinUrl}`)
}

function reminderDiversHtml(divers: CheckinReminderMailData['divers']): string {
 if (divers.length === 1) {
 return `
 <table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
 <tr><td bgcolor="#f3efe6" style="border-radius:999px;background-image:linear-gradient(135deg,#f3efe6,#f3efe6);">
 <a href="${divers[0].checkinUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;color:#121210;text-decoration:none;">Complete check-in</a>
 </td></tr>
 </table>`
 }
 const rows = divers.map(d => `
 <tr>
 <td style="padding:8px 0;border-bottom:1px solid rgba(243,239,230,0.08);">
 <span style="font-size:15px;color:#f3efe6;">${diverLabel(d)}</span>
 &nbsp;&mdash;&nbsp;
 <a href="${d.checkinUrl}" style="font-size:14px;color:#f3efe6;text-decoration:none;">Check in</a>
 </td>
 </tr>`).join('')
 return `
 <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-radius:10px;margin:0 0 20px 0;">
 <tr><td style="padding:14px 20px;">
 <table width="100%">${rows}</table>
 </td></tr>
 </table>`
}

// ── Week before ──────────────────────────────────────────────────────────────

export async function sendCheckinReminderWeekBefore(d: CheckinReminderMailData) {
 const multi = d.divers.length > 1
 const subject = `${d.isTest ? '[TEST] ' : ''}Your dive is coming up — check-in still needed`
 const greeting = !multi && d.divers[0].name ? `Hi ${displayFirstName(d.divers[0].name.split(' ')[0])},` : 'Hi,'
 const diveDate = fmtDate(d.firstDiveDate)

 const text = [
 greeting,
 ``,
 multi
 ? `${d.divers.length} guests still need to check in for ${d.productName} on ${diveDate}.`
 : `Your dive for ${d.productName} is coming up on ${diveDate}.`,
 ``,
 multi
 ? `You have a week to go. Each guest should complete their own check-in — about five minutes: certification level, a short medical form, gear sizes and a signed waiver.`
 : `You have about a week. It takes five minutes: certification level, a short medical form, gear sizes and a signed waiver. Doing it now means you can walk straight onto the boat.`,
 ``,
 ...reminderDiversText(d.divers),
 ...(d.favouriteSpot ? [
 ``,
 `Your favourite site: ${d.favouriteSpot.name}. Our staff picks the site each day based on sea conditions and the group on board — no promises, but if it fits, we'll get you there.`,
 ] : []),
 ``,
 multi ? `Seats are confirmed once each check-in is complete.` : `Your seat is confirmed once the check-in is complete.`,
 ``,
 reminderFooterText(d.isTest),
 ].filter(l => l !== undefined).join('\n')

 const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${reminderTestBannerHtml(d.isTest)}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">
 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#f3efe6;">One week to go</p>
 <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#f3efe6;line-height:1.2;">Check-in still needed<span style="color:#f3efe6;">.</span></h1>
 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>
 <p style="margin:0 0 24px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 ${multi
 ? `<strong>${d.divers.length} guests</strong> still need to check in for <strong>${d.productName}</strong> on ${diveDate}.`
 : `Your dive for <strong>${d.productName}</strong> is on ${diveDate} &mdash; about a week away.`}
 </p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 ${multi
 ? `Each guest completes their own part: certification level, a short medical form, gear sizes and a signed waiver. About five minutes each.`
 : `Please complete your online check-in before your dive. About five minutes: certification level, a short medical form, gear sizes and a signed waiver. Doing it now means you can walk straight onto the boat.`}
 </p>
 ${reminderDiversHtml(d.divers)}
 ${d.favouriteSpot ? `
 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Your favourite site: <strong>${d.favouriteSpot.name}</strong>. Our staff picks the site each day based on sea conditions and the group on board &mdash; no promises, but if it fits, we&rsquo;ll get you there.
 </p>` : ''}
 <p style="margin:0 0 24px 0;font-size:14px;color:#c9c2b6;line-height:1.7;">
 ${multi ? 'Seats are confirmed once each check-in is complete.' : 'Your seat is confirmed once the check-in is complete.'}
 </p>
 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">
 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>
 </td></tr>
 ${reminderFooterHtml()}
 </table>
 </td></tr></table>
</body>
</html>`

 return sendMail({ to: d.to, subject, text, html, kind: 'checkin_reminder_week_before', entityId: d.bookingId, replyTo: replyToAddress() })
}

// ── Two days before ──────────────────────────────────────────────────────────

export async function sendCheckinReminderTwoDays(d: CheckinReminderMailData) {
 const multi = d.divers.length > 1
 const subject = `${d.isTest ? '[TEST] ' : ''}Two days to your dive — check-in required`
 const greeting = !multi && d.divers[0].name ? `Hi ${displayFirstName(d.divers[0].name.split(' ')[0])},` : 'Hi,'
 const diveDate = fmtDate(d.firstDiveDate)

 const text = [
 greeting,
 ``,
 multi
 ? `${d.divers.length} guests still need to check in for ${d.productName} on ${diveDate}.`
 : `Your dive for ${d.productName} is on ${diveDate} — just two days away.`,
 ``,
 `Please complete your check-in before you arrive. Without it we cannot board you.`,
 ``,
 ...reminderDiversText(d.divers),
 ...(d.favouriteSpot ? [
 ``,
 `Your favourite site: ${d.favouriteSpot.name}. Our staff picks the site each day based on sea conditions and the group on board — no promises, but if it fits, we'll get you there.`,
 ] : []),
 ``,
 multi ? `Seats are confirmed once each check-in is complete.` : `Your seat is confirmed once the check-in is complete.`,
 ``,
 reminderFooterText(d.isTest),
 ].filter(l => l !== undefined).join('\n')

 const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${reminderTestBannerHtml(d.isTest)}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">
 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#FFD080;">Two days to go</p>
 <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#f3efe6;line-height:1.2;">Check-in required<span style="color:#f3efe6;">.</span></h1>
 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>
 <p style="margin:0 0 24px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 ${multi
 ? `<strong>${d.divers.length} guests</strong> still need to check in for <strong>${d.productName}</strong> on ${diveDate}.`
 : `Your dive for <strong>${d.productName}</strong> is on ${diveDate} &mdash; two days away.`}
 </p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 Please complete your check-in before you arrive. Without it we cannot board you.
 </p>
 ${reminderDiversHtml(d.divers)}
 ${d.favouriteSpot ? `
 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Your favourite site: <strong>${d.favouriteSpot.name}</strong>. Our staff picks the site each day based on sea conditions and the group on board &mdash; no promises, but if it fits, we&rsquo;ll get you there.
 </p>` : ''}
 <p style="margin:0 0 24px 0;font-size:14px;color:#c9c2b6;line-height:1.7;">
 ${multi ? 'Seats are confirmed once each check-in is complete.' : 'Your seat is confirmed once the check-in is complete.'}
 </p>
 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">
 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>
 </td></tr>
 ${reminderFooterHtml()}
 </table>
 </td></tr></table>
</body>
</html>`

 return sendMail({ to: d.to, subject, text, html, kind: 'checkin_reminder_two_days', entityId: d.bookingId, replyTo: replyToAddress() })
}

// ── After booking ─────────────────────────────────────────────────────────────
// Feuert wenn: Buchung mindestens 1 Tag alt UND keine datumsbas. Stufe faellig.
// Freundlicher Hinweis, was der Check-in ist und wie lange er dauert.

export async function sendCheckinReminderAfterBooking(d: CheckinReminderMailData) {
 const multi = d.divers.length > 1
 const subject = `${d.isTest ? '[TEST] ' : ''}Your booking is confirmed — one step left`
 const greeting = !multi && d.divers[0].name ? `Hi ${displayFirstName(d.divers[0].name.split(' ')[0])},` : 'Hi,'
 const diveDate = fmtDate(d.firstDiveDate)

 const text = [
 greeting,
 ``,
 `Just a quick reminder: your check-in for ${d.productName} on ${diveDate} is still open.`,
 ``,
 multi
 ? `${d.divers.length} guests still need to complete their part. It takes about five minutes each:`
 : `It takes about five minutes:`,
 `certification level, a short medical form, gear sizes and a signed waiver.`,
 `Doing it now means you can walk straight onto the boat.`,
 ``,
 ...reminderDiversText(d.divers),
 ...(d.favouriteSpot ? [
 ``,
 `Your favourite site: ${d.favouriteSpot.name}. Our staff picks the site each day based on sea conditions and the group on board — no promises, but if it fits, we'll get you there.`,
 ] : []),
 ``,
 multi ? `Seats are confirmed once each check-in is complete.` : `Your seat is confirmed once the check-in is complete.`,
 ``,
 reminderFooterText(d.isTest),
 ].filter(l => l !== undefined).join('\n')

 const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${reminderTestBannerHtml(d.isTest)}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">
 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#f3efe6;">One step left</p>
 <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#f3efe6;line-height:1.2;">Complete your check-in<span style="color:#f3efe6;">.</span></h1>
 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>
 <p style="margin:0 0 24px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 Just a quick reminder: your check-in for <strong>${d.productName}</strong> on ${diveDate} is still open.
 </p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 ${multi
 ? `<strong>${d.divers.length} guests</strong> still need to complete their part. It takes about five minutes each: certification level, a short medical form, gear sizes and a signed waiver.`
 : `It takes about five minutes: certification level, a short medical form, gear sizes and a signed waiver.`}
 Doing it now means you can walk straight onto the boat.
 </p>
 ${reminderDiversHtml(d.divers)}
 ${d.favouriteSpot ? `
 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Your favourite site: <strong>${d.favouriteSpot.name}</strong>. Our staff picks the site each day based on sea conditions and the group on board &mdash; no promises, but if it fits, we&rsquo;ll get you there.
 </p>` : ''}
 <p style="margin:0 0 24px 0;font-size:14px;color:#c9c2b6;line-height:1.7;">
 ${multi ? 'Seats are confirmed once each check-in is complete.' : 'Your seat is confirmed once the check-in is complete.'}
 </p>
 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">
 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>
 </td></tr>
 ${reminderFooterHtml()}
 </table>
 </td></tr></table>
</body>
</html>`

 return sendMail({ to: d.to, subject, text, html, kind: 'checkin_reminder_after_booking', entityId: d.bookingId, replyTo: replyToAddress() })
}

// ─── Check-in Einladung für Mitreisende ───────────────────────────────────────
//
// Der Bucher hat nach seinem eigenen Check-in die E-Mail-Adresse eines
// Mitreisenden eingetragen. Diese Mail sendet dem Eingeladenen seinen
// persönlichen Link — nur für genau seinen Slot.

export type CheckinInviteMailData = {
 to: string
 /** E-Mail-Adresse des Einladenden — dient als lesbarer Hinweis, kein Reply-To */
 inviterEmail: string | null
 productName: string
 diveDate: string | null
 checkinUrl: string
 isTest: boolean
 bookingId: string
}

export async function sendCheckinInvite(d: CheckinInviteMailData) {
 const diveLabel = d.diveDate ? fmtDate(d.diveDate) : 'your upcoming dive'
 const inviterLabel = d.inviterEmail ?? 'the group organiser'
 const subject = `${d.isTest ? '[TEST] ' : ''}Your personal check-in link — ${d.productName}`

 const text = [
 `Hi,`,
 ``,
 `${inviterLabel} has added you to a group booking with Azores Diving.`,
 `To secure your spot, please complete your personal check-in before the day.`,
 ``,
 ` ${d.productName}${d.diveDate ? ` — ${diveLabel}` : ''}`,
 ``,
 `YOUR PERSONAL CHECK-IN LINK`,
 ``,
 ` ${d.checkinUrl}`,
 ``,
 `It takes about five minutes: certification level, a short medical form,`,
 `gear sizes and a signed waiver. This link is yours alone — it opens only`,
 `your part of the check-in, and your details stay private.`,
 ``,
 `Any questions? Reply to this email or reach us on WhatsApp: +351 927 382 023`,
 ``,
 `See you underwater,`,
 `Azoresdiving Team`,
 ``,
 `Marina Pêro de Teive, Quiosque A · 9500-771 Ponta Delgada, São Miguel, Azores`,
 `+351 927 382 023 · azoresdiving@gmail.com · Daily 8:00–20:00`,
 d.isTest ? `\n---\nTEST — no real booking.` : ``,
 ].filter(l => l !== '').join('\n')

 const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${d.isTest ? `<tr><td bgcolor="#2A2312" style="border-radius:10px;padding:14px 18px;">
 <p style="margin:0;font-size:13px;color:#FFD080;line-height:1.6;"><strong>Test</strong> &middot; no real booking.</p>
 </td></tr><tr><td style="height:16px;"></td></tr>` : ''}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">

 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#f3efe6;">Group booking</p>
 <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#f3efe6;line-height:1.2;">Your personal check-in link<span style="color:#f3efe6;">.</span></h1>

 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">Hi,</p>
 <p style="margin:0 0 24px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 <strong>${inviterLabel}</strong> has added you to a group booking with Azores Diving.
 To secure your spot, please complete your personal check-in before the day.
 </p>

 <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-radius:10px;margin-bottom:24px;">
 <tr><td style="padding:18px 20px;">
 <p style="margin:0 0 4px 0;font-size:16px;font-weight:800;color:#f3efe6;">${d.productName}</p>
 ${d.diveDate ? `<p style="margin:0;font-size:15px;color:#f3efe6;">${diveLabel}</p>` : ''}
 </td></tr>
 </table>

 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#FFD080;">One step left</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 About five minutes: certification level, a short medical form, gear sizes and a signed waiver.
 This link opens <strong>only your part</strong> of the check-in &mdash; your details stay private.
 </p>

 <table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
 <tr><td bgcolor="#f3efe6" style="border-radius:999px;background-image:linear-gradient(135deg,#f3efe6,#f3efe6);">
 <a href="${d.checkinUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;color:#121210;text-decoration:none;">Complete my check-in</a>
 </td></tr>
 </table>

 <p style="margin:0 0 24px 0;font-size:13px;color:#c9c2b6;line-height:1.7;">
 Or copy this link: <a href="${d.checkinUrl}" style="color:#f3efe6;text-decoration:none;word-break:break-all;">${d.checkinUrl}</a>
 </p>

 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">

 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.7;color:#f3efe6;">
 Any questions? Reply to this email or reach us on WhatsApp at
 <a href="https://wa.me/351927382023" style="color:#f3efe6;text-decoration:none;">+351 927 382 023</a>.
 </p>

 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>

 </td></tr>
 <tr><td align="center" style="padding-top:32px;">
 <img src="https://www.azoresdiving.com/logo.png" alt="Azoresdiving" width="110" style="display:block;max-width:110px;margin:0 auto 16px;">
 <p style="margin:0;font-size:11px;color:#a39e94;line-height:1.9;letter-spacing:0.03em;">
 Marina P&ecirc;ro de Teive, Quiosque A &middot; 9500-771 Ponta Delgada, S&atilde;o Miguel, Azores<br>
 +351 927 382 023 &middot; azoresdiving@gmail.com<br>Daily 8:00&ndash;20:00
 </p>
 </td></tr>
 </table>
 </td></tr></table>
</body>
</html>`

 return sendMail({
 to: d.to,
 subject,
 text,
 html,
 kind: 'checkin_invite',
 entityId: d.bookingId,
 replyTo: replyToAddress(),
 })
}

// ── Final (1 Tag vorher — letzter Hinweis vor Buchungsschluss 18:00 Azoren) ──

export async function sendCheckinReminderFinal(d: CheckinReminderMailData) {
 const multi = d.divers.length > 1
 const subject = `${d.isTest ? '[TEST] ' : ''}Tomorrow is your dive — last chance to check in`
 const greeting = !multi && d.divers[0].name ? `Hi ${displayFirstName(d.divers[0].name.split(' ')[0])},` : 'Hi,'
 const diveDate = fmtDate(d.firstDiveDate)

 const text = [
 greeting,
 ``,
 multi
 ? `${d.divers.length} guests still haven't checked in for ${d.productName} tomorrow (${diveDate}).`
 : `Your dive for ${d.productName} is tomorrow, ${diveDate}, and your check-in is still open.`,
 ``,
 `Please complete it today. Per our terms (section 6): your seat is confirmed once the`,
 `check-in is complete.`,
 ``,
 ...reminderDiversText(d.divers),
 ...(d.favouriteSpot ? [
 ``,
 `Your favourite site: ${d.favouriteSpot.name}. Our staff picks the site each day based on sea conditions and the group on board — no promises, but if it fits, we'll get you there.`,
 ] : []),
 ``,
 `Any questions? Just reply to this email — we are happy to help.`,
 ``,
 reminderFooterText(d.isTest),
 ].filter(l => l !== undefined).join('\n')

 const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${reminderTestBannerHtml(d.isTest)}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">
 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#FFD080;">Tomorrow is your dive</p>
 <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#f3efe6;line-height:1.2;">Last chance to check in<span style="color:#f3efe6;">.</span></h1>
 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>
 <p style="margin:0 0 24px 0;font-size:16px;line-height:1.75;color:#f3efe6;">
 ${multi
 ? `<strong>${d.divers.length} guests</strong> still haven&rsquo;t checked in for <strong>${d.productName}</strong> tomorrow, ${diveDate}.`
 : `Your dive for <strong>${d.productName}</strong> is tomorrow, ${diveDate}, and your check-in is still open.`}
 </p>
 <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-radius:10px;margin-bottom:24px;">
 <tr><td style="padding:18px 20px;">
 <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#FFD080;">Per our terms, section 6</p>
 <p style="margin:0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Your seat is confirmed once the check-in is complete.
 Please complete it today.
 </p>
 </td></tr>
 </table>
 ${reminderDiversHtml(d.divers)}
 ${d.favouriteSpot ? `
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Your favourite site: <strong>${d.favouriteSpot.name}</strong>. Our staff picks the site each day based on sea conditions and the group on board &mdash; no promises, but if it fits, we&rsquo;ll get you there.
</p>` : ''}
 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">
 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.7;color:#f3efe6;">
 Any questions? Just reply to this email &mdash; we are happy to help.
 </p>
 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>
 </td></tr>
 ${reminderFooterHtml()}
 </table>
 </td></tr></table>
</body>
</html>`

 return sendMail({ to: d.to, subject, text, html, kind: 'checkin_reminder_final', entityId: d.bookingId, replyTo: replyToAddress() })
}

export async function sendPostDive(d: {
 to: string
 firstName: string | null
 spots: string[]
 wishGranted: boolean
 wishSpotName: string | null
 bookingId: string
 isTest: boolean
}): Promise<{ ok: boolean; error?: string }> {
 const name = d.firstName ? displayFirstName(d.firstName) : null
 const greeting = name ? `Hi ${name},` : 'Hi there,'
 const reviewUrl = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL?.trim() || null

 const subject = d.isTest
 ? `[TEST] ${d.wishGranted && d.wishSpotName ? `Wish granted — you dived ${d.wishSpotName} today ` : 'Thank you for diving with us today '}`
 : d.wishGranted && d.wishSpotName
 ? `Wish granted — you dived ${d.wishSpotName} today `
 : 'Thank you for diving with us today '

 const reviewTextBlock = reviewUrl
 ? [
 ``,
 `If you have a minute, a Google review helps a small dive centre more than you'd think:`,
 reviewUrl,
 `Already left one? Then just ignore this and thank you!!`,
 ]
 : []

 const text = [
 greeting,
 ``,
 `Thank you for diving with us today — it was a pleasure to have you on board.`,
 ...(d.wishGranted ? [`That was the spot you asked for when booking — we hope it lived up to it.`] : []),
 ...reviewTextBlock,
 ``,
 `Want to keep developing your diving? Take a look at our courses: https://www.azoresdiving.com/courses`,
 ``,
 `See you underwater,`,
 `The Azoresdiving team`,
 ``,
 `Marina Pêro de Teive, Quiosque A · 9500-771 Ponta Delgada, São Miguel, Azores`,
 `+351 927 382 023 · azoresdiving@gmail.com · Daily 8:00–20:00`,
 ...(d.isTest ? [``, `---`, `TEST — no real booking.`] : []),
 ].join('\n')

 const reviewHtml = reviewUrl
 ? `
 <p style="margin:0 0 16px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 If you have a minute, a Google review helps a small dive centre more than you&rsquo;d think.
 </p>
 <table cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;">
 <tr>
 <td style="border-radius:999px;background:linear-gradient(135deg,#f3efe6,#f3efe6);box-shadow:0 4px 24px rgba(243,239,230,.35);">
 <a href="${reviewUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:800;color:#121210;text-decoration:none;letter-spacing:0.01em;">Leave a review </a>
 </td>
 </tr>
 </table>
 <p style="margin:0 0 20px 0;font-size:14px;line-height:1.75;color:#c9c2b6;">
 Already left one? Then just ignore this and thank you!!
 </p>`
 : ''

 const eyebrow = d.wishGranted ? 'Wish granted' : 'See you again soon'
 const eyebrowColor = d.wishGranted ? '#FFD080' : '#f3efe6'
 const titleHtml = d.wishGranted && d.wishSpotName
 ? `You dived ${d.wishSpotName} today<span style="color:#f3efe6;"> </span>`
 : `Thank you for diving with us today<span style="color:#f3efe6;"> </span>`

 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>
 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Thank you for diving with us today — it was a pleasure to have you on board.
 </p>
 ${d.wishGranted ? `<p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">That was the spot you asked for when booking &mdash; we hope it lived up to it.</p>` : ''}
 ${reviewHtml}
 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Want to keep developing your diving? Take a look at our <a href="https://www.azoresdiving.com/courses" style="color:#f3efe6;text-decoration:none;">courses</a>.
 </p>`

 const html = renderEmailShell({ isTest: d.isTest, eyebrow, eyebrowColor, title: titleHtml, bodyHtml })

 return sendMail({ to: d.to, subject, text, html, kind: 'post_dive', entityId: d.bookingId, replyTo: replyToAddress() })
}

export async function sendWishGranted(d: {
 to: string
 firstName: string | null
 spotName: string
 bookingId: string
 isTest: boolean
}): Promise<{ ok: boolean; error?: string }> {
 const greeting = d.firstName ? `Hi ${displayFirstName(d.firstName)},` : 'Hi there,'
 const reviewUrl = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL?.trim() || null
 const subject = `${d.isTest ? '[TEST] ' : ''}Wish granted — you dived ${d.spotName} today `

 const reviewTextPart = reviewUrl
 ? [``, `If you have a minute, a Google review helps a small dive centre more than you'd think: ${reviewUrl}`]
 : []
 const reviewHtmlPart = reviewUrl
 ? `<p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">If you have a minute, a Google review helps a small dive centre more than you&rsquo;d think: <a href="${reviewUrl}" style="color:#f3efe6;text-decoration:none;">${reviewUrl}</a></p>`
 : ''

 const text = [
 greeting, ``,
 `Today the boat went to ${d.spotName} — the spot you asked for when booking. We hope it lived up to it.`,
 ...reviewTextPart, ``,
 `See you underwater,`, `The Azoresdiving team`, ``,
 `Marina Pêro de Teive, Quiosque A · 9500-771 Ponta Delgada, São Miguel, Azores`,
 `+351 927 382 023 · azoresdiving@gmail.com · Daily 8:00–20:00`,
 ...(d.isTest ? [``, `---`, `TEST — no real booking.`] : []),
 ].join('\n')

 const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Azoresdiving</title></head>
<body bgcolor="#121210" style="margin:0;padding:0;background-color:#121210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#121210"><tr><td align="center" style="padding:40px 16px;">
 <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
 ${d.isTest ? `<tr><td style="padding:0 0 12px 0;"><div style="background:#FFD080;color:#121210;font-size:12px;font-weight:700;text-align:center;padding:8px 16px;border-radius:6px;">TEST MODE — not a real booking</div></td></tr>` : ''}
 <tr><td bgcolor="#121210" style="border-radius:12px;padding:40px 36px;">
 <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#FFD080;">Wish granted</p>
 <h1 style="margin:0 0 24px 0;font-size:26px;font-weight:900;color:#f3efe6;line-height:1.2;">You dived ${d.spotName} today<span style="color:#f3efe6;"> </span></h1>
 <p style="margin:0 0 20px 0;font-size:17px;line-height:1.7;color:#f3efe6;">${greeting}</p>
 <p style="margin:0 0 20px 0;font-size:15px;line-height:1.75;color:#f3efe6;">
 Today the boat went to <strong>${d.spotName}</strong> &mdash; the spot you asked for when booking. We hope it lived up to it.
 </p>
 ${reviewHtmlPart}
 <hr style="border:none;border-top:1px solid rgba(243,239,230,0.15);margin:28px 0;">
 <p style="margin:0;font-size:14px;color:#c9c2b6;line-height:1.8;">
 See you underwater,<br>
 <strong style="color:#f3efe6;">Azoresdiving Team</strong><br>
 <a href="https://www.azoresdiving.com" style="color:#f3efe6;text-decoration:none;">azoresdiving.com</a>
 </p>
 </td></tr>
 <tr><td style="padding:24px 0 0 0;text-align:center;">
 <p style="margin:0;font-size:12px;color:#a39e94;line-height:1.7;">
 Marina Pêro de Teive, Quiosque A &middot; 9500-771 Ponta Delgada, São Miguel, Azores<br>
 +351 927 382 023 &middot; azoresdiving@gmail.com &middot; Daily 8:00&ndash;20:00
 </p>
 </td></tr>
 </table>
 </td></tr></table>
</body>
</html>`

 return sendMail({ to: d.to, subject, text, html, kind: 'wish_granted', entityId: d.bookingId, replyTo: replyToAddress() })
}

// ─── Payment request ─────────────────────────────────────────────────────────

function fmtEurCents(cents: number): string {
 return `€${(cents / 100).toFixed(2).replace('.', ',')}`
}

export async function sendPaymentRequestEmail(d: {
 to: string
 guestName: string | null
 productName: string
 sessions?: Array<{ date: string; session: string }> | null
 amountCents: number
 totalAmountCents?: number
 /** bereits bezahlt (Teilzahlung): die Mail zeigt dann Gesamtbetrag, bezahlt und offen */
 paidCents?: number
 isDeposit: boolean
 checkoutUrl?: string | null
 paymentMethod: string // 'link' | 'revolut' | 'bank'
 isTest: boolean
 bookingId: string
}) {
 const firstName = d.guestName ? displayFirstName(d.guestName.split(' ')[0]) : 'there'
 // Teilzahlung: Gast hat schon etwas bezahlt -> klar sagen, was bezahlt ist und was noch offen ist (Lucas 06.11.2026)
 const partPaid = !d.isDeposit && (d.paidCents ?? 0) > 0 && (d.totalAmountCents ?? 0) > 0
 const eyebrow = d.isDeposit ? 'Payment request · 50% deposit' : partPaid ? 'Payment request · remaining balance' : 'Payment request · full amount'
 const sessionLines = d.sessions?.length
 ? d.sessions.map(s => `${fmtDate(s.date)} (${s.session === 'night' ? 'night dive' : s.session + ' session'})`).join(', ')
 : null

 let subject: string
 let title: string
 let bodyHtml: string
 let text: string

 const iban = process.env.BANK_IBAN ?? 'PT50 0000 0000 0000 0000 0000 0'
 const accountName = process.env.BANK_ACCOUNT_NAME ?? 'Azoresdiving Lda'
 const bic = process.env.BANK_BIC ?? ''
 const revolutLink = process.env.REVOLUT_LINK ?? 'https://revolut.me/azoresdiving'

 const introLine = sessionLines
 ? `your upcoming <strong style="color:#f3efe6;">${d.productName}</strong> on <strong style="color:#f3efe6;">${sessionLines}</strong>`
 : `your upcoming <strong style="color:#f3efe6;">${d.productName}</strong>`

 const depositOnlyHtml = d.isDeposit && d.totalAmountCents
 ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#121210;border-radius:10px;margin:0 0 20px 0;">
 <tr><td style="padding:14px 20px;">
 <p style="margin:0;font-size:13px;color:#f3efe6;line-height:1.8;">
 Deposit due now: <strong style="color:#f3efe6;">${fmtEurCents(d.amountCents)}</strong> (50% of ${fmtEurCents(d.totalAmountCents)})<br>
 Remainder due on arrival: <strong style="color:#f3efe6;">${fmtEurCents(d.totalAmountCents - d.amountCents)}</strong>
 </p>
 </td></tr>
 </table>`
 : ''
 const paidBannerHtml = partPaid
 ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#121210;border-radius:10px;margin:0 0 20px 0;">
 <tr><td style="padding:14px 20px;">
 <p style="margin:0;font-size:13px;color:#f3efe6;line-height:1.8;">
 Total for your booking: <strong style="color:#f3efe6;">${fmtEurCents(d.totalAmountCents!)}</strong><br>
 Already paid: <strong style="color:#4FE3C8;">${fmtEurCents(d.paidCents!)}</strong><br>
 Still open: <strong style="color:#f3efe6;">${fmtEurCents(d.amountCents)}</strong>
 </p>
 </td></tr>
 </table>`
 : ''
 const depositBannerHtml = depositOnlyHtml + paidBannerHtml
 const paidText = partPaid ? `Total for your booking: ${fmtEurCents(d.totalAmountCents!)}\nAlready paid: ${fmtEurCents(d.paidCents!)}\nStill open: ${fmtEurCents(d.amountCents)}` : ''

 if (d.paymentMethod === 'link' && d.checkoutUrl) {
 subject = `${d.isTest ? '[TEST] ' : ''}Your payment link — ${d.productName}`
 title = 'Your payment link is ready'
 bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Here is your secure payment link for ${introLine}.</p>
 ${depositBannerHtml}
 <table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
 <tr><td style="border-radius:999px;background:linear-gradient(135deg,#f3efe6,#f3efe6);box-shadow:0 4px 24px rgba(243,239,230,.35);">
 <a href="${d.checkoutUrl}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:800;color:#121210;text-decoration:none;">Pay ${fmtEurCents(d.amountCents)} securely</a>
 </td></tr>
 </table>
 <p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Booking reference: <strong style="color:#f3efe6;">${d.bookingId.slice(0, 8).toUpperCase()}</strong> · Link expires in 24 hours. Questions? Just reply to this email.</p>`
 text = `Hi ${firstName},\n\nHere is your payment link for ${d.productName}${sessionLines ? ` on ${sessionLines}` : ''}.\n\n${d.isDeposit && d.totalAmountCents ? `Deposit due now: ${fmtEurCents(d.amountCents)} (50% of ${fmtEurCents(d.totalAmountCents)})\nRemainder due on arrival: ${fmtEurCents(d.totalAmountCents - d.amountCents)}\n` : `Amount: ${fmtEurCents(d.amountCents)}\n`}Booking reference: ${d.bookingId.slice(0, 8).toUpperCase()}\n\nPay here: ${d.checkoutUrl}\n\nSee you underwater,\nAzoresdiving Team`
 } else if (d.paymentMethod === 'revolut') {
 subject = `${d.isTest ? '[TEST] ' : ''}Payment via Revolut — ${d.productName}`
 title = 'Pay via Revolut'
 bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Please send your ${d.isDeposit ? 'deposit' : 'payment'} for ${introLine} via Revolut.</p>
 ${depositBannerHtml}
 <table width="100%" cellpadding="0" cellspacing="0" style="background:#121210;border-radius:10px;margin:0 0 24px 0;">
 <tr><td style="padding:16px 20px;">
 <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#f3efe6;">Payment details</p>
 <p style="margin:0;font-size:14px;color:#f3efe6;line-height:1.8;">Amount: <strong style="color:#f3efe6;">${fmtEurCents(d.amountCents)}</strong><br>Reference: <strong style="color:#f3efe6;">${d.bookingId.slice(0, 8).toUpperCase()}</strong></p>
 </td></tr>
 </table>
 <table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
 <tr><td style="border-radius:999px;background:linear-gradient(135deg,#f3efe6,#f3efe6);box-shadow:0 4px 24px rgba(243,239,230,.35);">
 <a href="${revolutLink}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:800;color:#121210;text-decoration:none;">Send via Revolut</a>
 </td></tr>
 </table>
 <p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Please include the reference <strong style="color:#f3efe6;">${d.bookingId.slice(0, 8).toUpperCase()}</strong> in the Revolut note. Questions? Just reply to this email.</p>`
 text = `Hi ${firstName},\n\nPlease send your ${d.isDeposit ? 'deposit' : 'payment'} for ${d.productName}${sessionLines ? ` on ${sessionLines}` : ''} via Revolut.\n\nAmount: ${fmtEurCents(d.amountCents)}\nReference: ${d.bookingId.slice(0, 8).toUpperCase()}\nRevolut: ${revolutLink}\n\nSee you underwater,\nAzoresdiving Team`
 } else {
 // bank transfer (default fallback)
 subject = `${d.isTest ? '[TEST] ' : ''}Bank transfer details — ${d.productName}`
 title = 'Bank transfer details'
 bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Please transfer your ${d.isDeposit ? 'deposit' : 'payment'} for ${introLine} using the bank details below.</p>
 ${depositBannerHtml}
 <table width="100%" cellpadding="0" cellspacing="0" style="background:#121210;border-radius:10px;margin:0 0 24px 0;">
 <tr><td style="padding:20px;">
 <p style="margin:0 0 12px 0;font-size:13px;font-weight:700;color:#f3efe6;letter-spacing:.05em;">Bank transfer details</p>
 <table width="100%" cellpadding="4" cellspacing="0">
 <tr><td style="font-size:13px;color:#c9c2b6;width:120px;vertical-align:top;">Account name</td><td style="font-size:13px;color:#f3efe6;font-weight:600;">${accountName}</td></tr>
 <tr><td style="font-size:13px;color:#c9c2b6;vertical-align:top;">IBAN</td><td style="font-size:13px;color:#f3efe6;font-weight:600;font-family:monospace;">${iban}</td></tr>
 ${bic ? `<tr><td style="font-size:13px;color:#c9c2b6;vertical-align:top;">BIC / SWIFT</td><td style="font-size:13px;color:#f3efe6;font-weight:600;font-family:monospace;">${bic}</td></tr>` : ''}
 <tr><td style="font-size:13px;color:#c9c2b6;vertical-align:top;">Amount</td><td style="font-size:13px;color:#f3efe6;font-weight:600;">${fmtEurCents(d.amountCents)}</td></tr>
 <tr><td style="font-size:13px;color:#c9c2b6;vertical-align:top;">Reference</td><td style="font-size:13px;color:#f3efe6;font-weight:700;">${d.bookingId.slice(0, 8).toUpperCase()}</td></tr>
 </table>
 </td></tr>
 </table>
 <p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Please include the reference <strong style="color:#f3efe6;">${d.bookingId.slice(0, 8).toUpperCase()}</strong> so we can match your payment. Questions? Just reply to this email.</p>`
 text = `Hi ${firstName},\n\nPlease transfer your ${d.isDeposit ? 'deposit' : 'payment'} for ${d.productName}${sessionLines ? ` on ${sessionLines}` : ''}.\n\nAccount name: ${accountName}\nIBAN: ${iban}${bic ? `\nBIC / SWIFT: ${bic}` : ''}\nAmount: ${fmtEurCents(d.amountCents)}\nReference: ${d.bookingId.slice(0, 8).toUpperCase()}\n\nSee you underwater,\nAzoresdiving Team`
 }

 if (paidText) text = text.replace(`Hi ${firstName},\n\n`, `Hi ${firstName},\n\n${paidText}\n\n`)
 const html = renderEmailShell({ isTest: d.isTest, eyebrow, eyebrowColor: '#f3efe6', title, bodyHtml })
 return sendMail({ to: d.to, subject, text, html, kind: 'payment_request', entityId: d.bookingId, replyTo: replyToAddress() })
}

// ─── Cancellation email ──────────────────────────────────────────────────────

export async function sendCancellationEmail(d: {
 customerName: string
 customerEmail: string
 productName: string
 sessions?: string | null // comma-separated "2026-10-29:pm,2026-10-30:am"
 amountCents: number
 isTest: boolean
 refunded?: boolean
}) {
 const firstName = d.customerName ? displayFirstName(d.customerName.split(' ')[0]) : 'there'
 const subject = `${d.isTest ? '[TEST] ' : ''}Your booking has been cancelled — ${d.productName}`

 // Parse sessions string
 const sessionLines = d.sessions
 ? d.sessions.split(',').map(s => {
 const [date, sess] = s.trim().split(':')
 return date ? `${fmtDate(date)}${sess ? ` (${sess === 'night' ? 'night dive' : sess + ' session'})` : ''}` : ''
 }).filter(Boolean).join(', ')
 : null

 const refundHtml = d.refunded
 ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D3A20;border:1px solid rgba(74,188,130,.3);border-radius:10px;margin:24px 0;">
 <tr><td style="padding:16px 20px;">
 <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#4ABC82;"> Full refund in progress</p>
 <p style="margin:0;font-size:14px;color:#f3efe6;">A refund of <strong style="color:#f3efe6;">${fmtEurCents(d.amountCents)}</strong> is being processed. You will receive a separate confirmation as soon as it has been issued.</p>
 </td></tr>
 </table>`
 : `<p style="margin:16px 0 0 0;font-size:14px;line-height:1.7;color:#f3efe6;">If you have any questions or would like to rebook, please reply to this email or contact us directly.</p>`

 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">
 We're writing to confirm that your booking for <strong style="color:#f3efe6;">${d.productName}</strong>${sessionLines ? ` on <strong style="color:#f3efe6;">${sessionLines}</strong>` : ''} has been cancelled.
 </p>
 ${refundHtml}`

 const text = [
 `Hi ${firstName},`,
 ``,
 `Your booking for ${d.productName}${sessionLines ? ` on ${sessionLines}` : ''} has been cancelled.`,
 d.refunded
 ? `\nA full refund of ${fmtEurCents(d.amountCents)} is being processed — you will receive a separate confirmation as soon as it has been issued.`
 : `\nIf you have questions or would like to rebook, please reply to this email.`,
 ``,
 `See you underwater,`,
 `Azoresdiving Team`,
 ...(d.isTest ? [``, `---`, `TEST — not a real booking.`] : []),
 ].join('\n')

 const html = renderEmailShell({
 isTest: d.isTest,
 eyebrow: 'Booking update',
 eyebrowColor: '#FF6464',
 title: 'Your booking has been cancelled',
 bodyHtml,
 })

 return sendMail({ to: d.customerEmail, subject, text, html, kind: 'cancellation', replyTo: replyToAddress() })
}

// ─── Payment received (Folgezahlungen: Rest, Teilzahlung, manuell erfasst) ──────

export async function sendPaymentReceived(d: {
 to: string
 customerName: string | null
 productName: string
 sessions: { date: string; session: string }[]
 bookingId: string
 /** diese Zahlung */
 amountCents: number
 /** Summe aller bezahlten Zahlungen inkl. dieser */
 paidTotalCents: number
 totalCents: number
 methodLabel: string
 /** null = Check-in erledigt, kein Block */
 checkinUrl: string | null
 isTest: boolean
 /** true = fuer den offenen Rest geht eine eigene Mail mit Zahlungsdaten (Transfer / Revolut) raus */
 restByRequest?: boolean
}) {
 const firstName = d.customerName ? displayFirstName(d.customerName.split(' ')[0]) : 'there'
 const open = Math.max(0, d.totalCents - d.paidTotalCents)
 const over = Math.max(0, d.paidTotalCents - d.totalCents)
 const paidInFull = open === 0
 const subject = `${d.isTest ? '[TEST] ' : ''}${paidInFull ? 'Payment received — your booking is paid in full' : 'Payment received'} — ${d.productName}`
 // Labels aus dem Front Office können Emojis tragen ( Cash) — in der Mail nur Text
 const methodLabel = d.methodLabel.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').trim()
 const days = d.sessions.map(x => `${fmtDate(x.date)} — ${x.session === 'am' ? 'Morning' : x.session === 'pm' ? 'Afternoon' : x.session === 'night' ? 'Night Dive (evening)' : 'Start time confirmed by your instructor'}`)
 const ref = d.bookingId.slice(0, 8).toUpperCase()

 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">
 Thank you — we have received your payment of <strong style="color:#f3efe6;">${fmtEurCents(d.amountCents)}</strong> (${methodLabel}) for <strong style="color:#f3efe6;">${d.productName}</strong>.
 </p>
 <table width="100%" cellpadding="0" cellspacing="0" style="background:${paidInFull ? '#0D3A20' : '#2A2312'};border:1px solid ${paidInFull ? 'rgba(74,188,130,.3)' : 'rgba(201,180,138,.3)'};border-radius:10px;margin:0 0 20px 0;">
 <tr><td style="padding:16px 20px;">
 <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:${paidInFull ? '#4ABC82' : '#FFD080'};">${paidInFull ? ' Paid in full' : 'Balance still open'}</p>
 <p style="margin:0;font-size:14px;color:#f3efe6;line-height:1.7;">
 Paid so far: <strong style="color:#f3efe6;">${fmtEurCents(d.paidTotalCents)}</strong> of ${fmtEurCents(d.totalCents)}<br>
 ${over > 0 ? `Overpaid by <strong style="color:#f3efe6;">${fmtEurCents(over)}</strong> &mdash; we will refund the difference at the centre.` : paidInFull ? 'Nothing more to pay — see you at the centre.' : d.restByRequest ? `Still open: <strong style="color:#f3efe6;">${fmtEurCents(open)}</strong> &mdash; we are sending you the payment details in a separate email.` : `Balance due on arrival: <strong style="color:#f3efe6;">${fmtEurCents(open)}</strong> &mdash; pay at the centre (cash, card or Revolut) or reply to this email for a payment link.`}<br>
 Reference: <strong style="color:#f3efe6;">${ref}</strong>
 </p>
 </td></tr>
 </table>
 ${days.length ? `<p style="margin:0 0 20px 0;font-size:14px;line-height:1.8;color:#f3efe6;">${days.join('<br>')}</p>` : ''}
 ${d.checkinUrl ? `
 <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#121210;border-left:3px solid #f3efe6;border-radius:0 8px 8px 0;margin:0 0 20px 0;"><tr><td style="padding:16px 20px;">
 <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#f3efe6;">Check-in still open</p>
 <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#f3efe6;">Please complete your online check-in before your first dive — about five minutes.</p>
 <a href="${d.checkinUrl}" style="display:inline-block;padding:11px 22px;background:#f3efe6;border-radius:8px;font-size:14px;font-weight:800;color:#121210;text-decoration:none;">Complete check-in</a>
 </td></tr></table>` : ''}
 <p style="margin:0;font-size:14px;line-height:1.7;color:#f3efe6;">Any questions? Just reply to this email.</p>`

 const text = [
 `Hi ${firstName},`,
 ``,
 `Thank you — we have received your payment of ${fmtEurCents(d.amountCents)} (${methodLabel}) for ${d.productName}.`,
 ``,
 `Paid so far: ${fmtEurCents(d.paidTotalCents)} of ${fmtEurCents(d.totalCents)}`,
 over > 0 ? `Overpaid by ${fmtEurCents(over)} — we will refund the difference at the centre.` : paidInFull ? `Paid in full — nothing more to pay.` : d.restByRequest ? `Still open: ${fmtEurCents(open)} — we are sending you the payment details in a separate email.` : `Balance due on arrival: ${fmtEurCents(open)} — pay at the centre (cash, card or Revolut) or reply to this email for a payment link.`,
 `Reference: ${ref}`,
 ``,
 ...days.map(x => ` ${x}`),
 ...(d.checkinUrl ? [``, `CHECK-IN STILL OPEN`, `Please complete your online check-in before your first dive:`, ` ${d.checkinUrl}`] : []),
 ``,
 `See you underwater,`,
 `Azoresdiving Team`,
 ...(d.isTest ? [``, `---`, `TEST — not a real booking.`] : []),
 ].join('\n')

 const html = renderEmailShell({
 isTest: d.isTest,
 eyebrow: 'Payment received',
 eyebrowColor: paidInFull ? '#4ABC82' : '#FFD080',
 title: paidInFull ? 'Your booking is paid in full' : 'Thanks, payment received',
 bodyHtml,
 })

 return sendMail({ to: d.to, subject, text, html, kind: 'payment_received', entityId: d.bookingId, replyTo: replyToAddress() })
}

// ─── Refund email ────────────────────────────────────────────────────────────

/** Wie das Geld zurückfließt — bestimmt den Satz in der Mail. */
export function refundMethodSentence(method: string | null | undefined): string {
 const m = (method ?? 'stripe').toLowerCase()
 if (m === 'stripe' || m === 'card') return 'This will appear on your original payment method within 5–10 business days.'
 if (m === 'cash') return 'The amount was refunded in cash at the dive centre.'
 if (m === 'bank' || m === 'bank_transfer') return 'We have sent it by bank transfer — please allow a few business days for it to arrive.'
 if (m === 'revolut') return 'We have sent it via Revolut — it should arrive shortly.'
 if (m === 'mb_way') return 'We have sent it via MB WAY — it should arrive shortly.'
 return 'The refund has been issued — please allow a few business days for it to arrive.'
}

export async function sendRefundEmail(d: {
 customerName: string
 customerEmail: string
 productName: string
 amountCents: number
 isPartial: boolean
 isTest: boolean
 /** stripe (default) | cash | bank | revolut | mb_way */
 method?: string | null
 bookingId?: string
 /** wofür (aus dem Refund-Antrag) */
 description?: string | null
}) {
 const firstName = d.customerName ? displayFirstName(d.customerName.split(' ')[0]) : 'there'
 const subject = `${d.isTest ? '[TEST] ' : ''}Your refund is on the way — ${d.productName}`
 const howSentence = refundMethodSentence(d.method)

 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">
 We have processed ${d.isPartial ? 'a partial refund' : 'a full refund'} for your booking of <strong style="color:#f3efe6;">${d.productName}</strong>.
 </p>
 <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D3A20;border:1px solid rgba(74,188,130,.3);border-radius:10px;margin:0 0 20px 0;">
 <tr><td style="padding:16px 20px;">
 <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#4ABC82;"> Refund confirmed</p>
 <p style="margin:0;font-size:14px;color:#f3efe6;">
 Amount: <strong style="color:#f3efe6;">${fmtEurCents(d.amountCents)}</strong><br>
 ${d.description ? `For: <strong style="color:#f3efe6;">${d.description}</strong><br>` : ''}
 ${howSentence}
 </p>
 </td></tr>
 </table>
 <p style="margin:0;font-size:14px;line-height:1.7;color:#f3efe6;">If you have any questions, please reply to this email and we will be happy to help.</p>`

 const text = [
 `Hi ${firstName},`,
 ``,
 `We have processed ${d.isPartial ? 'a partial refund' : 'a full refund'} for your ${d.productName} booking.`,
 ``,
 `Refund amount: ${fmtEurCents(d.amountCents)}`,
 ...(d.description ? [`For: ${d.description}`] : []),
 howSentence,
 ``,
 `If you have any questions, please reply to this email.`,
 ``,
 `See you underwater,`,
 `Azoresdiving Team`,
 ...(d.isTest ? [``, `---`, `TEST — not a real booking.`] : []),
 ].join('\n')

 const html = renderEmailShell({
 isTest: d.isTest,
 eyebrow: 'Refund processed',
 eyebrowColor: '#4ABC82',
 title: `${d.isPartial ? 'Partial refund' : 'Full refund'} on its way`,
 bodyHtml,
 })

 return sendMail({ to: d.customerEmail, subject, text, html, kind: 'refund', ...(d.bookingId ? { entityId: d.bookingId } : {}), replyTo: replyToAddress() })
}


// ─── Session times confirmed (instructor set AM/PM) ──────────────────────────

export async function sendSessionTimesEmail(d: {
 to: string
 customerName: string | null
 productName: string
 /** Alle Sessions der Buchung, chronologisch */
 sessions: { date: string; session: string; notes?: string | null; startTime?: string | null }[]
 isTest: boolean
 bookingId: string
 /** true = noch Tage offen („to be confirmed“) — Betreff/Intro als Update statt Bestätigung */
 partial?: boolean
 /** Was sich gerade geändert hat (Changelog-Zeilen) — steht oben in der Mail */
 changes?: string[]
}) {
 const firstName = d.customerName ? displayFirstName(d.customerName.split(' ')[0]) : 'there'
 const isSsu = (x: { notes?: string | null }) => /skills update/i.test(x.notes ?? '')
 const hasSsu = d.sessions.some(isSsu)
 const ssuNote = hasSsu ? ' and your Scuba Skills Update (a separate refresher day, not part of the pack)' : ''
 const subject = `${d.isTest ? '[TEST] ' : ''}${d.partial ? 'Schedule update' : 'Your start times'} — ${d.productName}${hasSsu ? ' + Scuba Skills Update' : ''}`
 // Konkrete Startzeit (vom Instructor gesetzt) schlägt die Standardzeit der Schicht
 const label = (x: { session: string; notes?: string | null; startTime?: string | null }) => {
 const t = x.startTime ? x.startTime.slice(0, 5) : null
 const base = t
 ? `${x.session === 'am' ? 'Morning' : x.session === 'pm' ? 'Afternoon' : x.session === 'night' ? 'Night Dive' : 'Session'} — start ${t} (please be at the centre 15 minutes earlier)`
 : x.session === 'am' ? 'Morning (be at the centre by 08:00)' : x.session === 'pm' ? 'Afternoon (be at the centre by 13:00)' : x.session === 'night' ? 'Night Dive (evening — meeting time confirmed by our team)' : 'Time to be confirmed — we will email you'
 // Scuba Skills Update ist ein eigener Auffrischungstag VOR dem Paket, nicht Teil des Produkts eigene Zeile, klar benannt
 if (isSsu(x)) return `Scuba Skills Update (refresher) — ${base}`
 return `${base}${x.notes ? ` · ${x.notes}` : ''}`
 }
 const rowsHtml = d.sessions.map(x =>
 `<tr><td style="padding:6px 0;font-size:14px;color:#f3efe6;">${fmtDate(x.date)}</td><td style="padding:6px 0 6px 16px;font-size:14px;color:#f3efe6;font-weight:700;">${label(x)}</td></tr>`
 ).join('')
 const bodyHtml = `
 <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;color:#f3efe6;">${d.partial ? `Your instructor has updated the schedule for <strong style="color:#f3efe6;">${d.productName}</strong>${ssuNote}. Days marked “to be confirmed” will follow in another email.` : `Your instructor has set the start times for <strong style="color:#f3efe6;">${d.productName}</strong>${ssuNote}:`}</p>
 ${d.changes && d.changes.length ? `<p style="margin:0 0 14px 0;font-size:13px;line-height:1.7;color:#c9c2b6;">What changed: ${d.changes.map(c => c.replace(/</g, '&lt;')).join(' · ')}</p>` : ''}
 <table cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">${rowsHtml}</table>
 <p style="margin:0 0 8px 0;font-size:14px;line-height:1.7;color:#c9c2b6;">Booking reference: <strong style="color:#f3efe6;">${d.bookingId.slice(0, 8).toUpperCase()}</strong>. If a time does not work for you, just reply to this email.</p>`
 const text = `Hi ${firstName},\n\n${d.partial ? `Your instructor has updated the schedule for ${d.productName}${ssuNote}. Days marked "to be confirmed" will follow in another email.` : `Your instructor has set the start times for ${d.productName}${ssuNote}:`}\n${d.changes && d.changes.length ? `\nWhat changed: ${d.changes.join(' · ')}\n` : ''}\n${d.sessions.map(x => `${fmtDate(x.date)} — ${label(x)}`).join('\n')}\n\nBooking reference: ${d.bookingId.slice(0, 8).toUpperCase()}\nIf a time does not work for you, just reply to this email.\n\nSee you underwater,\nAzoresdiving Team`
 const html = renderEmailShell({ isTest: d.isTest, eyebrow: d.partial ? 'SCHEDULE UPDATE' : 'START TIMES CONFIRMED', eyebrowColor: '#4FE3C8', title: d.partial ? 'Schedule update' : 'Your start times', bodyHtml })
 return sendMail({ to: d.to, subject, text, html, kind: 'session_times', entityId: d.bookingId, replyTo: replyToAddress() })
}

// ─── Booking requests (Low Season, Lucas 28.10.2026) ─────────────────────────
// Drei Mails: Request received (Gast, sofort) · Request approved (Zahlungslink) · Request declined.
// Design wie Payment Request. Alle Texte Englisch.

export type RequestMailBase = {
 to: string
 guestName: string | null
 productName: string
 sessions: Array<{ date: string; session: string }>
 groupSize: number
 totalCents: number
 isTest: boolean
 bookingId: string
}

function requestSessionLines(sessions: Array<{ date: string; session: string }>): string {
 return sessions.map(s => `${fmtDate(s.date)}${s.session === 'tbd' ? '' : ` (${s.session === 'night' ? 'night dive' : s.session.toUpperCase() + ' session'})`}`).join(', ')
}

function requestSummaryHtml(d: RequestMailBase, extraRows: Array<[string, string]> = []): string {
 const rows: Array<[string, string]> = [
 ['Product', d.productName],
 ['Dates', requestSessionLines(d.sessions) || '—'],
 ['Guests', String(d.groupSize)],
 ['Total', fmtEurCents(d.totalCents)],
 ...extraRows,
 ['Reference', d.bookingId.slice(0, 8).toUpperCase()],
 ]
 return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#121210;border-radius:10px;margin:0 0 24px 0;">
 <tr><td style="padding:16px 20px;">
 <table width="100%" cellpadding="4" cellspacing="0">
 ${rows.map(([k, v]) => `<tr><td style="font-size:13px;color:#c9c2b6;width:110px;vertical-align:top;">${k}</td><td style="font-size:13px;color:#f3efe6;font-weight:600;">${v}</td></tr>`).join('')}
 </table>
 </td></tr>
 </table>`
}

export async function sendBookingRequestReceived(d: RequestMailBase) {
 const firstName = d.guestName ? displayFirstName(d.guestName.split(' ')[0]) : 'there'
 const subject = `${d.isTest ? '[TEST] ' : ''}Request received — ${d.productName}`
 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Thanks for your request. <strong style="color:#f3efe6;">No payment has been taken and nothing is confirmed yet.</strong> In the low season we collect requests and organise dive days when enough divers come together in the same week and conditions allow. Your dates are noted as a preference — we may come back with a day close to them. Once a dive day comes together for your week, we email you a payment link; otherwise we suggest alternatives. A spot is only held once you pay.</p>
 ${requestSummaryHtml(d)}
 <p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Changed your mind or have a question? Just reply to this email.</p>`
 const text = `Hi ${firstName},\n\nThanks for your request. No payment has been taken and nothing is confirmed yet. In the low season we collect requests and organise dive days when enough divers come together in the same week and conditions allow. Your dates are noted as a preference — we may come back with a day close to them. Once a dive day comes together for your week, we email you a payment link; otherwise we suggest alternatives. A spot is only held once you pay.\n\nProduct: ${d.productName}\nDates: ${requestSessionLines(d.sessions) || '—'}\nGuests: ${d.groupSize}\nTotal: ${fmtEurCents(d.totalCents)}\nReference: ${d.bookingId.slice(0, 8).toUpperCase()}\n\nQuestions? Just reply to this email.\n\nSee you underwater,\nAzoresdiving Team`
 const html = renderEmailShell({ isTest: d.isTest, eyebrow: 'Booking request · received, not confirmed', eyebrowColor: '#FFD080', title: 'We got your request', bodyHtml })
 return sendMail({ to: d.to, subject, text, html, kind: 'booking_request_received', entityId: d.bookingId, replyTo: replyToAddress() })
}

export async function sendBookingRequestApproved(d: RequestMailBase & {
 amountCents: number
 isDeposit: boolean
 /** Gastseite: Klick = bestätigen dort entsteht die Stripe-Session */
 confirmUrl: string
 /** Gastseite mit offenem Antwortfeld („doesn't work for me") */
 declineUrl: string
 approvedUntil: string | null
 /** true = Mail wurde erneut geschickt (Resend) */
 renewed?: boolean
 /** Vom Gast ursprünglich angefragte Tage — gesetzt, wenn das Team andere Tage freigegeben hat */
 requestedSessions?: Array<{ date: string; session: string }>
 /** Anfrage wurde gekürzt (z. B. 4-Dive Pack Daily Double Dive): ursprüngliches Produkt + Betrag */
 shortenedFrom?: { productName: string; amountCents: number }
}) {
 const firstName = d.guestName ? displayFirstName(d.guestName.split(' ')[0]) : 'there'
 const subject = `${d.isTest ? '[TEST] ' : ''}${d.renewed ? 'Reminder: please confirm your dive day' : 'Your dive day is set — please confirm'} — ${d.productName}`
 const untilLine = d.approvedUntil
 ? new Date(d.approvedUntil).toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
 : null
 const depositRows: Array<[string, string]> = d.isDeposit
 ? [['Due now', `${fmtEurCents(d.amountCents)} (50 % deposit)`], ['On arrival', fmtEurCents(Math.max(0, d.totalCents - d.amountCents))]]
 : []
 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">${d.renewed ? 'A quick reminder about your dive day.' : 'Good news — we can run your dive.'} Please confirm below; the payment page opens right after. Your spot is reserved as soon as the payment is made.</p>
 ${d.shortenedFrom ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,180,138,.08);border:1px solid rgba(201,180,138,.35);border-radius:10px;margin:0 0 20px 0;"><tr><td style="padding:12px 16px;font-size:13px;line-height:1.6;color:#FFD080;"><strong>We adjusted your booking.</strong> Not enough divers came together for all the days you asked for (${d.shortenedFrom.productName}${d.requestedSessions?.length ? `, ${requestSessionLines(d.requestedSessions)}` : ''}, ${fmtEurCents(d.shortenedFrom.amountCents)}). We can run ${d.productName} on ${requestSessionLines(d.sessions)} for ${fmtEurCents(d.totalCents)} — that is what the link below charges. If you would rather wait for more days, just reply to this email before paying.</td></tr></table>`
 : d.requestedSessions?.length ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,180,138,.08);border:1px solid rgba(201,180,138,.35);border-radius:10px;margin:0 0 20px 0;"><tr><td style="padding:12px 16px;font-size:13px;line-height:1.6;color:#FFD080;"><strong>We adjusted your dates.</strong> You asked for ${requestSessionLines(d.requestedSessions)} — the dive day we can run for your week is listed above. If that does not work for you, just reply to this email before paying.</td></tr></table>` : ''}
 ${requestSummaryHtml(d, depositRows)}
 <table cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;">
 <tr><td style="border-radius:999px;background:linear-gradient(135deg,#f3efe6,#f3efe6);box-shadow:0 4px 24px rgba(243,239,230,.35);">
 <a href="${d.confirmUrl}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:800;color:#121210;text-decoration:none;">Confirm &amp; pay ${fmtEurCents(d.amountCents)}</a>
 </td></tr>
 </table>
 <p style="margin:0 0 20px 0;font-size:13px;line-height:1.6;color:#c9c2b6;">Doesn't work for you? <a href="${d.declineUrl}" style="color:#f3efe6;font-weight:700;">Tell us what would</a> — we'll look for another day. Nothing is charged until you confirm.</p>
 ${untilLine ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Please confirm by <strong style="color:#f3efe6;">${untilLine}</strong> — after that we may offer the day to other divers. Questions? Just reply to this email.</p>` : `<p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Questions? Just reply to this email.</p>`}`
 const text = `Hi ${firstName},\n\n${d.renewed ? 'A quick reminder about your dive day.' : 'Good news — we can run your dive.'} Please confirm; the payment page opens right after. Your spot is reserved as soon as the payment is made.\n${d.shortenedFrom ? `\nWe adjusted your booking: not enough divers for all the days you asked for (${d.shortenedFrom.productName}, ${fmtEurCents(d.shortenedFrom.amountCents)}). We can run ${d.productName} on ${requestSessionLines(d.sessions)} for ${fmtEurCents(d.totalCents)} — that is what the link charges. Rather wait? Reply before paying.\n` : d.requestedSessions?.length ? `\nWe adjusted your dates: you asked for ${requestSessionLines(d.requestedSessions)} — the dive day we can run is listed below. If that does not work, reply before paying.\n` : ''}\nProduct: ${d.productName}\nDates: ${requestSessionLines(d.sessions) || '—'}\nGuests: ${d.groupSize}\nTotal: ${fmtEurCents(d.totalCents)}\n${d.isDeposit ? `Due now: ${fmtEurCents(d.amountCents)} (50 % deposit)\nOn arrival: ${fmtEurCents(Math.max(0, d.totalCents - d.amountCents))}\n` : ''}Reference: ${d.bookingId.slice(0, 8).toUpperCase()}\n\nConfirm & pay: ${d.confirmUrl}\nDoesn't work? Tell us what would: ${d.declineUrl}\n${untilLine ? `Please confirm by ${untilLine}.\n` : ''}\nSee you underwater,\nAzoresdiving Team`
 const html = renderEmailShell({ isTest: d.isTest, eyebrow: d.renewed ? 'Booking request · reminder' : 'Booking request · please confirm', eyebrowColor: '#4FE3C8', title: d.renewed ? 'Still up for it?' : 'Your dive day is set', bodyHtml })
 return sendMail({ to: d.to, subject, text, html, kind: 'booking_request_approved', entityId: d.bookingId, replyTo: replyToAddress() })
}

export async function sendBookingRequestDeclined(d: RequestMailBase & { reason: string }) {
 const firstName = d.guestName ? displayFirstName(d.guestName.split(' ')[0]) : 'there'
 const subject = `${d.isTest ? '[TEST] ' : ''}About your request — ${d.productName}`
 const reasonHtml = d.reason.trim().split(/\n+/).map(l => `<p style="margin:0 0 10px 0;font-size:15px;line-height:1.7;color:#f3efe6;">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')
 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Unfortunately we can't confirm your request as it stands. No payment was taken. Here is what the team wrote:</p>
 <table width="100%" cellpadding="0" cellspacing="0" style="background:#121210;border-radius:10px;margin:0 0 24px 0;"><tr><td style="padding:16px 20px;">${reasonHtml}</td></tr></table>
 ${requestSummaryHtml(d)}
 <p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Want to try other dates? Reply to this email or book again at <a href="https://azoresdiving.com/book" style="color:#f3efe6;">azoresdiving.com/book</a>.</p>`
 const text = `Hi ${firstName},\n\nUnfortunately we can't confirm your request as it stands. No payment was taken.\n\n${d.reason.trim()}\n\nProduct: ${d.productName}\nDates: ${requestSessionLines(d.sessions) || '—'}\nGuests: ${d.groupSize}\nReference: ${d.bookingId.slice(0, 8).toUpperCase()}\n\nWant to try other dates? Reply to this email or book again at https://azoresdiving.com/book\n\nAzoresdiving Team`
 const html = renderEmailShell({ isTest: d.isTest, eyebrow: 'Booking request · not confirmed', eyebrowColor: '#FF9090', title: 'About your request', bodyHtml })
 return sendMail({ to: d.to, subject, text, html, kind: 'booking_request_declined', entityId: d.bookingId, replyTo: replyToAddress() })
}

export async function sendBookingRequestReopened(d: { to: string; guestName: string | null; productName: string; isTest: boolean; bookingId: string; message: string }) {
 const firstName = d.guestName ? displayFirstName(d.guestName.split(' ')[0]) : 'there'
 const subject = `${d.isTest ? '[TEST] ' : ''}Got it — we'll look for another day — ${d.productName}`
 const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
 const bodyHtml = `
 <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Hi ${firstName},</p>
 <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#f3efe6;">Thanks for letting us know — nothing has been charged, and the proposed day is off the table. We'll look at the other requests for your dates and come back to you as soon as another day comes together.</p>
 ${d.message.trim() ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#121210;border-radius:10px;margin:0 0 20px 0;"><tr><td style="padding:14px 18px;font-size:13px;line-height:1.7;color:#f3efe6;"><span style="color:#c9c2b6;">Your note:</span><br>${esc(d.message.trim())}</td></tr></table>` : ''}
 <p style="margin:0;font-size:13px;line-height:1.6;color:#c9c2b6;">Reference: <strong style="color:#f3efe6;">${d.bookingId.slice(0, 8).toUpperCase()}</strong>. Anything else? Just reply to this email.</p>`
 const text = `Hi ${firstName},\n\nThanks for letting us know — nothing has been charged, and the proposed day is off the table. We'll look at the other requests for your dates and come back to you as soon as another day comes together.\n${d.message.trim() ? `\nYour note: ${d.message.trim()}\n` : ''}\nReference: ${d.bookingId.slice(0, 8).toUpperCase()}\n\nAzoresdiving Team`
 const html = renderEmailShell({ isTest: d.isTest, eyebrow: 'Booking request · noted', eyebrowColor: '#FFD080', title: "Got it — we'll look for another day", bodyHtml })
 return sendMail({ to: d.to, subject, text, html, kind: 'booking_request_reopened', entityId: d.bookingId, replyTo: replyToAddress() })
}
