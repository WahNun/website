'use client'
import { useState } from 'react'

/* Knowledge Base Bookings. Sub-tabs: Online (/book) and Front Office. Every block = what / where / why. */

const FONT = 'Inter, system-ui, sans-serif'
const ACCENT = '#f3efe6'
const MUTED = '#c9c2b6'
const TEXT = '#f3efe6'
const SURFACE = '#121210'
const BORDER = 'rgba(243,239,230,.12)'
const AMBER = '#c9b48a'

type Shot = { src: string; caption: string; phone?: boolean }
type Item = { title: string; how: string[]; why: string; shots?: Shot[]; numbered?: boolean }
type Group = { heading: string; items: Item[] }

const ONLINE_TUTORIAL: Group[] = [
 {
 heading: 'Tutorial — a guest books a dive (what the guest sees)',
 items: [
 {
 title: 'Step 1 · E-mail, product, guests, last dive',
 numbered: true,
 how: [
 'Open /book. Enter the e-mail (the check-in link and receipt go there).',
 'Choose the product (here: Daily Double Dive) and the number of guests.',
 'Certified divers: enter the date of the last dive. If it is more than 12 months before the first dive day, a Scuba Skills Update (€95) is added automatically.',
 ],
 why: 'The e-mail comes first because the booking, the receipt and the check-in link all depend on it. The last-dive date decides the refresher, so it has to be known before the price is shown.',
 shots: [{ src: '/kb/book-1-form.jpg', caption: 'The top of /book: e-mail, product, guests and date of last dive.', phone: true }],
 },
 {
 title: 'Step 2 · Choose the dates',
 numbered: true,
 how: [
 'Press "Select dates" next to the product. For dives pick day and AM / PM.',
 'A greyed shift does not fit the group on one boat. The number under a day is the largest group that still fits on one boat.',
 'Press Confirm when the dates are set.',
 ],
 why: 'The calendar shows what still fits on one boat (not total seats) because a group wants to dive together.',
 shots: [
 { src: '/kb/book-2-dates.jpg', caption: 'Each product has its own "Select dates" button.', phone: true },
 { src: '/kb/book-3-picker.jpg', caption: 'The calendar: pick a day, then AM or PM.', phone: true },
 ],
 },
 {
 title: 'Step 3 · Equipment, extras, terms and pay',
 numbered: true,
 how: [
 'Pick full equipment or single pieces, and extras such as torch, tank or gloves. Prices are per diver and dive day.',
 'Choose insurance: the AZD day policy or your own policy (a self-declaration).',
 'Read the cancellation policy, tick both boxes and press the pay button. Payment runs through Stripe.',
 ],
 why: 'Terms and cancellation policy sit right above the button so the guest agrees to exactly what is shown at the moment of payment. The button stays disabled until insurance is chosen and both boxes are ticked.',
 shots: [{ src: '/kb/book-4-pay.jpg', caption: 'Total, "After payment" note, cancellation policy, two consent boxes and the pay button.', phone: true }],
 },
 ],
 },
]

const ONLINE: Group[] = [
 {
 heading: 'The guest flow (/book)',
 items: [
 {
 title: '1 · Pick a product and dates',
 how: [
 'Two kinds of products: capacity items (dives, courses — they take a seat on a boat) and add-ons (equipment, insurance, guide — they do not).',
 'Dive days are chosen in the calendar. Each day shows AM / PM; a shift is greyed out when the group does not fit on one boat.',
 'The number under a day is the largest group that still fits on ONE boat for that shift.',
 ],
 why: 'The calendar shows max party per boat, not total seats left, because a group wants to dive together. Total seats would suggest room that a group cannot actually use.',
 },
 {
 title: '2 · Guests, equipment, insurance',
 how: [
 'Group size is set up front; each guest can get their own equipment and insurance choice.',
 'Insurance: buy the AZD day policy (DAN) or declare an own policy. Own policy is a self-declaration only — never proof.',
 'Refresher: if the last dive is more than 12 months before the LATEST booked dive day, a Scuba Skills Update (€95) is added automatically.',
 ],
 why: 'We cannot verify third-party insurance online, so the flag stays open until staff see the policy at check-in. The refresher is automatic because it is a safety rule, not a sales offer.',
 },
 {
 title: '3 · Terms and payment',
 how: [
 'The cancellation policy and terms are written out above the Pay button and must be ticked. The server rejects a checkout without consent.',
 'Payment runs through Stripe Checkout. The Stripe session is valid for 30 minutes.',
 'Online always charges the full amount; there is no deposit option on /book. (Deposits exist only at the Front Office — see there.)',
 'Deposit rule (online and desk alike): at least 50 % paid = confirmed, 100 % = fully paid, below 50 % stays pending.',
 ],
 why: 'The contract is formed at checkout, so terms shown only afterwards would not reliably bind the guest. One rule for every payment channel, so a booking means the same thing whether it came from the website or the desk.',
 },
 {
 title: '4 · After payment: check-in link',
 how: [
 'The confirmation e-mail contains the check-in link (/checkin?token=…): personal data, medical questionnaire, waiver, experience, emergency contact.',
 'Every guest has their own token, so the buyer can delegate. The buyer does not have to dive themselves (agent, parent, team lead).',
 'There is no "check-in complete" e-mail to the guest. When all guests are done the booking only gets a changelog entry and the check-in indicator in the Front Office. Guests do get reminder e-mails before the dive, and a medical-clearance e-mail if a medical answer is flagged.',
 ],
 why: 'The payer is often not the diver, and every diver must see and sign the conditions personally.',
 },
 ],
 },
 {
 heading: 'Split booking (different products or dates per person)',
 items: [
 {
 title: 'How it works',
 how: [
 'From 2 guests, /book offers the checkbox "Different products or dates per person". Without it the whole group dives the same days with the same product.',
 'It is switched on automatically when a guest in the group needs a Scuba Skills Update (last dive over 12 months ago), because that guest dives on a different day.',
 'The buyer still pays ONCE. The system creates one parent booking and one child booking per guest, and each guest gets their own check-in link. The buyer receives one confirmation e-mail with all links.',
 'A refund for one person only touches that person\'s booking. Staff can also do this in the Front Office with "Split per guest".',
 ],
 why: 'A group usually pays together, but people differ in product, days and refresher. One booking per person keeps check-in, boat seats, insurance and refunds correct for each diver without making the guests pay separately.',
 },
 ],
 },
]

const ONLINE_WHY: Group[] = [
 {
 heading: 'Why it works this way — online',
 items: [
 {
 title: 'Seats are held before payment (capacity hold)',
 how: ['When the guest presses Pay, seats for ALL dive days of ALL guests are held for 15 minutes, just before Stripe is called. Once the Stripe session exists the hold is extended to 30 minutes. If nobody pays, the seats free up automatically.', 'If the last seats are held by someone else, the guest sees "try again in 15 minutes". Staff bookings in the Front Office do not create holds.'],
 why: 'Without a hold two guests can pay for the last seat at the same time and we would have to refund one. Without expiry an abandoned cart would block a boat.',
 },
 {
 title: 'Cutoff 18:00 (Azores time) the day before — online only',
 how: ['After the cutoff a day cannot be booked on /book. The Front Office can still book it.'],
 why: 'Crew, boat and gear are planned the evening before. Walk-ins on the morning are normal business, so staff may override; guests may not.',
 },
 {
 title: 'Pending bookings hold no seat (decision 25.10.)',
 how: ['Only confirmed bookings count as seats on the boat. Pending ones are a waiting list.'],
 why: 'Unpaid bookings used to block seats and make the boat look full. Seats should mean paid or deliberately confirmed by staff.',
 },
 {
 title: 'Own insurance is a self-declaration',
 how: ['Flag "Insurance proof to check" stays until staff resolve it on the boat card.'],
 why: 'Diving without valid insurance is not allowed. We would rather ask once at check-in than have a guest stand at the dock without cover.',
 },
 {
 title: 'Request-only products',
 how: ['Some products cannot be paid online; they appear as requests and staff finish them.'],
 why: 'Availability depends on instructor or boat decisions (e.g. Formigas, some courses) that the system cannot check.',
 },
 {
 title: 'Night dives: 8 seats',
 how: ['Night dives have their own, smaller capacity.'],
 why: 'Fewer divers per boat at night for safety.',
 },
 ],
 },
]

const FO_TUTORIAL: Group[] = [
 {
 heading: 'Tutorial — book a walk-in at the desk (Front Office New Booking)',
 items: [
 {
 title: 'Step 1 · Product, dates, insurance, equipment',
 numbered: true,
 how: [
 'Front Office New Booking. Choose the product, then press the date field to pick day and AM / PM.',
 'Choose insurance (own policy or add DAN). Choose full equipment or single pieces. Parts already included in the product are crossed out.',
 'The Summary on the right shows price, DAN, equipment, payment mode and total, and lists what is still missing.',
 ],
 why: 'Same rules as online, but the desk can book any day (no 18:00 cutoff). "Missing: …" tells you exactly what blocks the booking, so nothing is guessed.',
 shots: [{ src: '/kb/fo-1-booking-form.jpg', caption: 'Insurance, equipment and add-ons, with the Summary and the "Missing" box on the right.' }],
 },
 {
 title: 'Step 2 · The date picker',
 numbered: true,
 how: [
 'The calendar shows booked / capacity per shift (for example 0/8 booked).',
 'Pick a day and AM or PM (several days for packages). The picked shifts appear as chips below; the cross removes one.',
 'Press Confirm. The page scrolls so the whole calendar is visible, and Confirm stays reachable.',
 ],
 why: 'The desk sees real numbers instead of only "fits / does not fit", because staff decide about overbooking and walk-ins.',
 shots: [{ src: '/kb/fo-3-date-picker.jpg', caption: 'The calendar in the Front Office: booked/capacity per shift, picked shifts as chips, Confirm at the bottom.' }],
 },
 {
 title: 'Step 3 · Guests, contact, last dive, payment',
 numbered: true,
 how: [
 'Set the number of guests and the guest or group name. E-mail and phone are required.',
 'Enter the last dive date for each certified diver. Over 12 months a Scuba Skills Update is added; with several guests the booking switches to "Split per guest" and explains why.',
 'Choose the payment mode (cash, transfer, Revolut, or Stripe payment link). Optionally charge a 50 % deposit now. Then create the booking.',
 ],
 why: 'Cash, transfer and Revolut stay pending until you record the money in the booking (that confirms it). The Stripe link lets the guest pay by card.',
 shots: [{ src: '/kb/fo-2-last-dive-payment.jpg', caption: 'Guests, e-mail, phone, last dive, residential discount and payment method with the deposit option.' }],
 },
 ],
 },
]

const FO: Group[] = [
 {
 heading: 'Where to do what (Front Office)',
 items: [
 {
 title: 'New Booking',
 how: [
 'Choose product, date and shift, enter guest data, pick a payment mode, submit.',
 'It uses the same calendar and rules as /book, but shows seats as numbers, allows overriding the 18:00 cutoff, and allows groups larger than one boat with a warning.',
 'Tick "Charge 50% deposit now" to take only half; unticked = full amount. Until a payment is recorded the booking is pending and holds no seat (waiting list).',
 ],
 why: 'Same components as online on purpose: one set of rules, no second booking engine that drifts apart. Only what truly differs at the desk is switched on.',
 },
 {
 title: 'Payment modes',
 how: [
 ' Cash · Transfer · Revolut — booking stays pending until you record the payment in the booking\'s Payments tab. Only then it becomes confirmed (paid_at is set). Cash sends confirmation + check-in link immediately.',
 ' Stripe Payment Link — Create Link generates a Stripe checkout for the guest (card, or per guest when splitting). Deposit-only option charges 50 %.',
 ' Card — disabled until a card terminal exists. Use the Payment Link for card payments.',
 ],
 why: 'Most of our revenue arrives as cash, transfer, Revolut or MB Way, so the desk must handle them. Nothing is "confirmed" just because someone clicked cash — money counted is what confirms, otherwise the books and the boat would disagree.',
 },
 {
 title: 'Booking History',
 how: [
 'Open a booking to see Overview, Sessions, Payments, Info and the change log (with staff e-mail).',
 'Payments tab: record cash / transfer / Revolut payments, see deposit vs. balance.',
 'Cancel or request a refund from here.',
 ],
 why: 'One place per booking, with an audit trail, so two people at the desk cannot silently overwrite each other.',
 },
 {
 title: 'Cancel and refund (two steps)',
 how: [
 'Step 1: staff request the refund (/api/cancel, /api/refund). Nothing is paid out, the guest is not mailed.',
 'Step 2: an authorized person approves under Refunds Awaiting Authorization. Stripe refunds execute on approval; for cash / bank / Revolut / MB WAY approve once the money was handed over.',
 'Policy: more than 72 h before = 100 %, 48–72 h = 50 %, under 48 h or no-show = 0 %. The AZD day insurance is never refunded. If AZD cancels (weather etc.): new date or full refund.',
 ],
 why: 'Four-eyes principle: money out is irreversible and tied to accounting, so the person who clicks cancel is not the person who releases the payout.',
 },
 {
 title: 'Invoices (KeyInvoice)',
 how: ['Paid bookings are invoiced in KeyInvoice. Same day cancellation = void the invoice; later = credit note.'],
 why: 'Voiding after the day closes would alter a closed accounting day. Open question for the accountant — confirm before relying on it.',
 },
 {
 title: 'DAN Export',
 how: ['Exports the days that need the AZD day insurance as a batch for DAN.'],
 why: 'DAN has no API. The export is the only digital touchpoint; the purchase stays manual at the desk (we buy for €4, sell for €10).',
 },
 ],
 },
]

const FO_WHY: Group[] = [
 {
 heading: 'How checkout and check-in create the flags on the boat card',
 items: [
 {
 title: '1 · Booking decides: waiting list or seat',
 numbered: true,
 how: [
 'A booking that is paid (at least 50 %) is confirmed and takes a seat on the boat. An unpaid or "pay later" booking stays pending and sits on the Waiting list card. It holds no seat.',
 'When the booking is confirmed, the guest gets the check-in link (online: in the confirmation mail; cash: immediately). Every diver of the booking has their own link.',
 'Until a diver finishes check-in, the seat shows a red dot and the Alerts card lists "Check-in not completed".',
 ],
 why: 'The crew should see problems at 8:00 on the dock, not after leaving the harbour. Only paid seats count, so the boat never looks full because of unpaid bookings.',
 shots: [{ src: '/kb/dash-1-boat-alerts.jpg', caption: 'Dashboard: boat diagram with one marker per seat, the Waiting list and the Alerts card. The symbol on a seat is the same symbol as in the Alerts and in the legend.' }],
 },
 {
 title: '2 · Check-in: which step creates which flag',
 numbered: true,
 how: [
 'Personal details: the date of birth. Under 18 flag "18 Under 18" with age and depth limit. Staff press Acknowledge once they have dealt with it (guardian consent is collected in the check-in).',
 'Medical self-declaration: one single "Yes" flag "! Medical clearance required" and the guest gets an e-mail explaining that a doctor must clear them. The seat stays flagged until staff resolve it in the diver file.',
 'Insurance: own policy " Insurance proof to check" until staff have seen the proof. No insurance " No insurance — sell day cover". If the guest buys DAN day cover from us, no proof is needed, but "# DAN policy no. missing" stays until staff type in the DAN number, and the cover is an open payment at the desk.',
 'Last dive date (asked at booking): more than 12 months before the dive day a Scuba Skills Update is part of the booking, and " Refresher required" stays until the refresher is done.',
 'After the last step (review and signature) the seat turns green: checked in.',
 ],
 why: 'Each flag has exactly one owner and one cause, so nothing is double-checked and nothing is forgotten. Staff decide about medicals, insurance and minors because the system must not decide about safety by itself.',
 shots: [
 { src: '/kb/checkin-1-start.jpg', caption: 'Check-in start page (7 steps: Welcome, Personal, Medical, Waiver, Experience, Emergency, Review).', phone: true },
 { src: '/kb/checkin-2-medical.jpg', caption: 'Step 3, medical self-declaration. Any "Yes" creates the medical flag.', phone: true },
 ],
 },
 {
 title: '3 · At the desk and on the boat: what you do with a flag',
 numbered: true,
 how: [
 'Click a name in the Alerts card (or a seat) to open the diver file. Everything the guest entered is there.',
 'Fix it where the flag comes from: record the DAN number, mark the insurance proof as checked, resolve the medical after the doctor\'s clearance, acknowledge a minor, or complete the refresher. The flag disappears from the boat card and the Alerts.',
 'A diver without completed check-in stays on the boat as a red seat. Their check-in link can be sent again from the dashboard (a seat with an open check-in shows an e-mail field and a Send button in the Alerts card).',
 'At the end of the day, every booking without a check-in opens an Attendance ticket (Was there / Trip cancelled / No-show), so nobody becomes a no-show by accident.',
 ],
 why: 'The flags show what is open, the diver file shows why, and the booking history shows what was done. Checkout and check-in only collect facts; staff resolve them.',
 },
 ],
 },
]


/* ── Booking Requests (Low Season) ─────────────────────────────────────────────
 Screenshots live in /public/kb/req-*.jpg. A missing file shows a grey placeholder with the filename, so the text
 is useful before the pictures exist. Shot list: see REQUEST_SHOTS at the bottom of this file. */

const REQ_GUEST: Group[] = [
 {
 heading: 'Tutorial — what the guest sees (low season)',
 items: [
 {
 title: 'Step 1 · The guest picks a date and gets the request popup',
 numbered: true,
 how: [
 'On /book the guest picks dates as usual. If a chosen day falls into a request period (Admin Settings), a popup opens: "Your dates are a request — we build dive days around the requests we get."',
 'The popup asks for first and last name, an optional mobile number and — for groups — the names of the other guests. "Continue as a request" only works once the names are in.',
 'Once the low season has actually started, there is no popup: the same text sits above the form from the start and the name fields are shown directly under the e-mail.',
 'The button at the bottom reads "Send request — €99.00, no payment now". Nothing is charged.',
 ],
 why: 'The guest must understand two things before typing anything: the chosen date is a wish, not a confirmation, and no money moves now. Asking for the names in the same popup means nothing appears later outside the viewport.',
 shots: [
 { src: '/kb/req-1-popup.jpg', caption: 'High season: the request popup after picking a low-season date — explanation, name fields, "Continue as a request".', phone: true },
 { src: '/kb/req-2-form.jpg', caption: 'Low season: disclaimer above the form, name fields under the e-mail, button "Send request".', phone: true },
 ],
 },
 {
 title: 'Step 2 · Request received',
 numbered: true,
 how: [
 'After sending, the guest sees "Request received" with a reference and gets the e-mail "We got your request" (eyebrow: received, not confirmed).',
 'The text says: we collect requests, run the boat when enough divers come together in the same week and conditions allow; the dates are a preference and we may come back with a nearby day.',
 'In the system this is a pending booking with request_state = requested. It holds NO seat on the boat and sends no money anywhere.',
 ],
 why: 'A request that held a seat would block the boat for people who never pay. A request that charged money would promise a day we cannot promise in winter.',
 shots: [{ src: '/kb/req-3-received.jpg', caption: 'The "Request received" screen and the e-mail with the same wording.', phone: true }],
 },
 {
 title: 'Step 3 · "Your dive day is set — please confirm"',
 numbered: true,
 how: [
 'When staff approve, the guest gets an e-mail with the dive day, the amount and two buttons: "Confirm & pay €…" and "Tell us what would (work)".',
 'If staff moved the date or shortened a pack, the e-mail says so in a yellow box: what was asked, what we can run, what the link will charge.',
 '"Confirm & pay" opens the request page; the Stripe payment page is created only in that moment. Paying = confirming. A spot is reserved once the payment is in.',
 '"This day doesn\'t work for me" opens a text box ("What would work for you?"). Sending it takes the proposed day off the table — the request goes back to the team, nothing is charged, the guest gets "Got it — we\'ll look for another day".',
 ],
 why: 'There is no payment link in the e-mail that could expire or be paid by mistake after a reply. The link only exists after the guest said yes. A "no" is one click plus a sentence, and it lands as a ticket with the guest\'s words.',
 shots: [
 { src: '/kb/req-4-approved-mail.jpg', caption: 'The approval e-mail: summary, optional "we adjusted" box, "Confirm & pay" and "Tell us what would".', phone: true },
 { src: '/kb/req-5-confirm-page.jpg', caption: 'The request page: Confirm & pay, or "This day doesn\'t work for me" with a text box.', phone: true },
 ],
 },
 ],
 },
]

const REQ_STAFF: Group[] = [
 {
 heading: 'Tutorial — what staff do',
 items: [
 {
 title: 'Step 1 · Switch on request mode (Admin Settings)',
 numbered: true,
 how: [
 'Default booking mode: Open (instant payment) or Request. Request makes every date a request.',
 'Booking windows: a date range open / request / blocked, optionally only one session (AM / PM / Night) or one product. The most specific rule wins; on a tie blocked beats request beats open. Outside all windows the default applies.',
 'Typical low season: one window 1 Nov – 30 Apr = Request, plus a blocked window over Christmas. The preview at the bottom shows what a guest gets on any date.',
 'Walk-ins and Front Office bookings are never affected — only the public /book page.',
 ],
 why: 'One switch for "now", windows for "the season", so nobody has to remember to flip a switch on 1 April. Blocked days need no e-mail traffic at all: the guest simply cannot pick them.',
 shots: [{ src: '/kb/req-6-settings.jpg', caption: 'Admin Settings: default mode, booking windows, preview.' }],
 },
 {
 title: 'Step 2 · Front Office Booking Requests',
 numbered: true,
 how: [
 'New requests appear in the tab "Booking Requests (n)" — the number is the count waiting for approval — and as a ticket in AI Support. They are NOT in Booking History until paid.',
 'Left: open requests grouped by week, each with requested day, product, reference chip, name, e-mail and divers. The week header shows how many divers asked for which day.',
 'Click a row to tick it. Click the reference chip to open the booking (Overview, Sessions, Payments, Changelog) — the Overview has the request card with Approve / Decline for a single request.',
 'Right: the sticky summary of what you ticked — "asked: …" per guest, total divers and total amount.',
 ],
 why: 'Planning a dive day is a group decision across requests, so the list and the summary sit next to each other; single-request actions stay in the booking card where all the other booking tools are.',
 shots: [{ src: '/kb/req-7-planner.jpg', caption: 'Booking Requests: weeks on the left, selected requests on the right.' }],
 },
 {
 title: 'Step 3 · Pick the dive day(s) — the calendar helps you choose',
 numbered: true,
 how: [
 'Press "Pick dive day(s)". The calendar opens in the month of the requests. Above it: the checkbox "Never earlier than asked" (on by default — it changes which days count as possible, and therefore the colours). Day tiles are coloured relative to your selection: the greenest day is the one where everyone moves the least, orange is where people move the most. The three best days have a bright outline.',
 'Above the calendar: the three fairest days as round chips (click = pick). If the revenue would differ between days (only when a pack gets shortened or a night dive cannot run), square chips show the days with the highest revenue; otherwise one line says the revenue is the same everywhere.',
 'Hold the mouse over an AM or PM button to see the exact score (0–100), the average shift in days, how many packs would be shortened and how many divers fit.',
 'Pick one day if you run one dive day, or several days if you run more. Press Done.',
 ],
 why: 'The score is a decision aid, not a decision: it shows who has to move how far, and what a shortened pack costs. Colours are relative because in winter every option moves somebody — what matters is which option moves people the least.',
 shots: [{ src: '/kb/req-8-picker.jpg', caption: 'The picker: tinted day tiles, outlined suggestions, tooltip on AM/PM.' }],
 },
 {
 title: 'Step 3b · How guests are placed on the days you picked',
 numbered: true,
 how: [
 'Each request goes to the picked day CLOSEST to its wish — not to the first day. Asked for 20 Nov, you run 4/5/6 Nov they get 6 Nov. A 2-day pack takes the two closest consecutive picked days.',
 '"Never earlier than asked" — the checkbox above the calendar (and again under the picked days) — is ON by default: a guest who asked for 20 Nov is not placed on 6 Nov, because they may not have arrived yet. Such a request shows "gets: —" and is skipped. Untick it only if you know it is fine; it resets to on next time.',
 'The boat is not endless: bigger groups are placed first; if the closest day is full (already booked seats plus the ones you are placing), the request takes the next closest day. If it fits nowhere, it reads "boat full, will be skipped" in red.',
 'Under the picked days you see the load: "04.11 AM: 5 divers (0 already booked, 8 seats) · ok". Red = more divers than seats. Yellow = fewer than 4 divers (a day that is hardly worth running) or nobody at all ("drop this day?") — then simply remove that day.',
 ],
 why: 'You asked for consolidation, so the system never silently sends one diver out alone, never overbooks the boat and never moves someone before their arrival. Everything it decides is shown as "gets" per guest before you approve.',
 shots: [{ src: '/kb/req-8b-loads.jpg', caption: 'Summary after picking days: "gets" per guest, divers per day with seats, the "never earlier" box.' }],
 },
 {
 title: 'Step 4 · Check "gets", then approve',
 numbered: true,
 how: [
 'Back in the summary every ticked request now shows "asked: …" and "gets: …". A shortened pack reads "gets: Daily Double Dive · 05.11.26 AM · €99.00 (shortened from 4-Dive Pack)" with the old price struck through. A request that cannot be moved (course, split, night dive on a day slot) reads "stays as asked — reason".',
 'Check the load line per day (divers vs. seats, yellow below 4, red over capacity) and the "never earlier than asked" box. Tick "50 % deposit" if you only want a deposit now (courses). Press "Approve n on 05.11.26 AM & ask to confirm".',
 'What happens: dates are moved (and products shortened) exactly as shown, the boat capacity is checked again for each day, and every guest gets the "please confirm" e-mail. Requests that do not fit are skipped with the reason.',
 'The request now reads "approved · awaiting guest" in the list. It stays there, not selectable, until the guest confirms or replies.',
 ],
 why: 'You see the consequence for every single guest before anything is sent. Moving and approving are one step because an approval without the moved date would be meaningless.',
 shots: [{ src: '/kb/req-9-summary.jpg', caption: 'Summary with asked / gets per guest, score of the picked day, the approve button.' }],
 },
 {
 title: 'Step 5 · After the e-mail: confirm, reply, overdue',
 numbered: true,
 how: [
 'Guest confirms and pays the booking becomes a normal confirmed booking: Booking History, boat card, check-in link, invoice — like any online booking. Changelog shows the whole chain.',
 'Guest says "doesn\'t work" the request is back in the planner as "requested", with a ticket containing the guest\'s text. Plan again, approve again.',
 'No reaction the list shows "overdue" after the deadline (72 h). Open the booking: "Resend email", "Reopen" (back to the planner), "Restore original & reopen" (undo a shortening) or "Decline" (cancel with a reason, guest is e-mailed).',
 'A payment page a guest opened but did not pay expires after 24 h at Stripe — the guest just presses Confirm again; nobody has to do anything.',
 ],
 why: 'Every outcome has exactly one next step for staff, and none of them involves hunting for an old link.',
 shots: [{ src: '/kb/req-10-card.jpg', caption: 'The request card in the booking: Resend email, Reopen, Restore original, Decline.' }],
 },
 ],
 },
]

const REQ_WHY: Group[] = [
 {
 heading: 'The logic in one page',
 items: [
 {
 title: 'States of a request',
 how: [
 'requested the guest asked. Pending booking, no seat, no money.',
 'approved staff set a day and asked the guest to confirm ("awaiting guest"). Still no seat, no money.',
 'confirmed by guest the Stripe page is created; after payment the booking is confirmed and the request is "converted" — from here on it is a regular booking.',
 'declined staff said no (with a reason), booking cancelled. reopened guest or staff sent it back to "requested".',
 ],
 why: 'A seat is only ever taken by money. Every earlier state is just a conversation.',
 },
 {
 title: 'The fairness score',
 how: [
 'For each candidate day and session, each ticked request costs points: 1 per day of shift from its wish, 0.5 if the session (AM/PM) differs, 2 per dive day a pack would lose, 4 if it cannot run at all (night dive on a day slot). Weighted by number of divers.',
 'Score = 100 − 15 × average cost. Example: three single-day requests on 03., 04. and 06.11., candidate 04.11. shifts 1, 0, 2 average 1 score 85. With several picked days each request counts the shift to the day it would actually get.',
 'Colours in the calendar are RELATIVE to your selection (greenest = best of these options). The number in the tooltip is absolute (0–100), so you can compare weeks.',
 'Revenue per day = sum of what the ticked guests would pay; a shortened pack counts pro rata. It is identical on every day unless a pack is shortened or a night dive drops out — only then does the picker show revenue separately.',
 ],
 why: 'Numbers you can argue with. The weights are visible (and changeable), so "fair" is not a feeling but the same rule for every week.',
 },
 {
 title: 'The placement rules (who ends up on which day)',
 how: [
 '1 · Closest picked day to the wish; packs take the closest consecutive picked days.',
 '2 · Never earlier than asked — checkbox in the picker, ON by default, resets each time — arrival dates are unknown.',
 '3 · Capacity: bigger groups first; full day next closest day; fits nowhere skipped with a red note.',
 '4 · A picked day with fewer than 4 divers is flagged yellow, with 0 divers "drop this day?". Nothing is blocked — it is a hint.',
 '5 · Courses and split requests are never moved by the planner; night dives only go to night slots.',
 ],
 why: 'The same function runs on the server, in the preview and in the score, so what you see under "gets" is exactly what approve does.',
 },
 {
 title: 'Shortening a pack',
 how: [
 'Each request is placed on the picked day(s) closest to its wish. If you pick fewer days than a request has, it is shortened to the product of the same category with that many days (4-Dive Pack Daily Double Dive). Price, equipment quantities and insurance are recalculated the same way the checkout does.',
 'The guest sees old vs. new in the e-mail and on the confirm page and only pays the new amount. "Restore original & reopen" undoes it.',
 'Courses are never shortened or moved by the planner (instructor days) — use the Sessions tab in the booking.',
 ],
 why: 'A paid booking means every day in it is a promise. If the second day will not run, it must not be sold — better one real dive day than a refund later.',
 },
 {
 title: 'Money and invoices',
 how: [
 'Payment: the Stripe page is created when the guest confirms and uses the same path as a Front Office payment link — the webhook records the payment, applies the deposit rule, sends confirmation and check-in.',
 'Invoice: created from the stored line items (product, equipment, DAN) with the booking reference — the same mapping as instant online payments.',
 'Refund, cancel, DAN export: identical to any other booking once it is paid.',
 ],
 why: 'The request flow only changes WHEN the money is asked for, never HOW it is booked.',
 },
 ],
 },
]

export default function BookingTools() {
 const [sub, setSub] = useState<'online' | 'fo' | 'requests'>(() => {
 try { const v = localStorage.getItem('azd_kbBookingsSub'); return v === 'fo' || v === 'requests' ? v : 'online' } catch { return 'online' }
 })
 const pick = (v: 'online' | 'fo' | 'requests') => { setSub(v); try { localStorage.setItem('azd_kbBookingsSub', v) } catch {} }
 const groups = sub === 'online' ? [...ONLINE_TUTORIAL, ...ONLINE, ...ONLINE_WHY] : sub === 'fo' ? [...FO_TUTORIAL, ...FO, ...FO_WHY] : [...REQ_GUEST, ...REQ_STAFF, ...REQ_WHY]

 const subStyle = (a: boolean): React.CSSProperties => ({
 padding: '8px 18px', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: FONT,
 borderRadius: 8, background: a ? 'rgba(243,239,230,.1)' : 'transparent', color: a ? ACCENT : MUTED,
 })

 return (
 <div style={{ fontFamily: FONT, color: TEXT }}>
 <div style={{ display: 'flex', gap: 6, background: SURFACE, borderRadius: 12, padding: 6, border: `1px solid ${BORDER}`, width: 'fit-content', marginBottom: 20 }}>
 <button style={subStyle(sub === 'online')} onClick={() => pick('online')}> Online booking</button>
 <button style={subStyle(sub === 'fo')} onClick={() => pick('fo')}> Front Office</button>
 <button style={subStyle(sub === 'requests')} onClick={() => pick('requests')}> Booking Requests</button>
 </div>
 <p style={{ fontSize: 13, color: MUTED, margin: '0 0 22px', lineHeight: 1.6 }}>
 {sub === 'online'
 ? 'What a guest sees on /book, what the system does in the background, and why it is built this way.'
 : sub === 'fo'
 ? 'How staff book, take payments, change and refund at the desk — and why the rules differ from online.'
 : 'Low season: guests send requests, staff plan dive days around them, the guest confirms, then pays. What both sides see, and the logic behind the fairness score.'}
 </p>
 {groups.map(g => (
 <div key={g.heading} style={{ marginBottom: 28 }}>
 <h2 style={{ fontSize: 15, fontWeight: 800, color: '#f3efe6', margin: '0 0 12px' }}>{g.heading}</h2>
 <div style={{ display: 'grid', gap: 10 }}>
 {g.items.map(it => (
 <div key={it.title} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
 <div style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>{it.title}</div>
 {it.numbered
 ? <ol style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>{it.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
 : <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>{it.how.map((h, i) => <li key={i}>{h}</li>)}</ul>}
 {it.shots && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '4px 0 14px' }}>
 {it.shots.map(sh => (
 <figure key={sh.src} style={{ margin: 0, maxWidth: sh.phone ? 300 : '100%', flex: sh.phone ? '0 1 300px' : '1 1 100%' }}>
 <a href={sh.src} target="_blank" rel="noopener noreferrer" title="Open full size">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={sh.src} alt={sh.caption} loading="lazy" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10, border: `1px solid ${BORDER}` }}
 onError={e => { const el = e.currentTarget; el.style.display = 'none'; const ph = el.parentElement?.nextElementSibling as HTMLElement | null; if (ph) ph.style.display = 'block' }} />
 </a>
 <div style={{ display: 'none', padding: '26px 14px', borderRadius: 10, border: `1px dashed ${BORDER}`, background: 'rgba(255,255,255,.02)', fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>Screenshot not added yet<br /><code style={{ fontSize: 11 }}>{sh.src.replace('/kb/', 'public/kb/')}</code></div>
 <figcaption style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>{sh.caption}</figcaption>
 </figure>
 ))}
 </div>
 )}
 <div style={{ fontSize: 12.5, lineHeight: 1.6, color: MUTED, borderLeft: `3px solid ${AMBER}`, paddingLeft: 10 }}>
 <strong style={{ color: AMBER }}>Why: </strong>{it.why}
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 )
}
