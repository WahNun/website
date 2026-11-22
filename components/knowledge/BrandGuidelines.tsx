'use client'
import { useState } from 'react'
import { supabase } from '@/components/pages/_shared'

/* Brand Guide 2026 — Inhalt aus AZD_Brandbook.pdf, plus PDF-Download (nur für eingeloggte Mitarbeiter). */

const FONT = 'var(--font-geist-sans), sans-serif'
const ACCENT = '#f3efe6'
const MUTED = '#c9c2b6'
const TEXT = '#f3efe6'
const SURFACE = '#121210'
const BORDER = 'rgba(243,239,230,.12)'
const STACK = 'var(--font-geist-sans), sans-serif'

type Sw = { name: string; hex: string; use: string }
const CORE: Sw[] = [
 { name: 'Electric Ocean', hex: '#f3efe6', use: 'Primary accent · CTAs · links · active states · tags' },
 { name: 'Deep Atlantic', hex: '#121210', use: 'Page background · all dark surfaces' },
 { name: 'Abyss', hex: '#020A14', use: 'Darkest background · hero · CTA sections' },
 { name: 'Night Ocean', hex: '#121210', use: 'Navbar · card surfaces · raised UI elements' },
]
const TEXTC: Sw[] = [
 { name: 'Surface', hex: '#f3efe6', use: 'Primary headings & body text' },
 { name: 'Ocean Light', hex: '#f3efe6', use: 'Secondary body text · descriptions' },
 { name: 'Fog Blue', hex: '#c9c2b6', use: 'Muted / metadata text' },
 { name: 'Mist Blue', hex: '#c9c2b6', use: 'Subtitles · taglines' },
 { name: 'Pale Cyan', hex: '#f3efe6', use: 'Species tags · secondary pill labels' },
]
const FUNC: Sw[] = [
 { name: 'Reef Teal', hex: '#4FE3C8', use: 'Success · available · course level badges' },
 { name: 'Amber', hex: '#FFD080', use: 'Requirements labels · ADMIN badge · star ratings' },
 { name: 'Lavender', hex: '#f3efe6', use: 'Pro & safety courses · specialty badge accent' },
 { name: 'Status Orange', hex: '#FFA040', use: 'Pending · partial availability · warnings' },
 { name: 'Alert Red', hex: '#FF6040', use: 'OUT status · errors · delete actions' },
]
const WEIGHTS: [string, number, string][] = [['Medium', 500, 'Headings and labels'], ['Regular', 400, 'Body copy']]
const SCALE: [string, number, number, string][] = [
 ['Hero / 56px / 500', 56, 500, 'The ocean.'],
 ['H1 / 44px / 500', 44, 500, 'Where we dive.'],
 ['H2 / 32px / 500', 32, 500, 'Daily Double Dive'],
 ['Body / 17px / 400', 17, 400, 'Two guided boat dives — morning or afternoon — with refreshments between.'],
]
const PRINCIPLES: [string, string, string][] = [
 ['01', 'Depth over noise', 'Dark backgrounds command focus. We do not compete for attention with brightness — we reward it with depth. Whitespace is not waste; it is the water between subjects.'],
 ['02', 'One accent, used precisely', '#f3efe6 appears on CTAs, active states, and punctuation marks. Its power is scarcity. When everything is electric, nothing is. Use it once per composition.'],
 ['03', 'Light type, clear touch', 'Headlines stay at weight 500. Body copy stays at 400. Hierarchy comes from size and spacing, not from heavy type.'],
 ['04', 'Honest confidence', 'Formigas is never guaranteed. Conditions are always real. Our copy is direct, specific and never oversells. The ocean decides — we facilitate the encounter.'],
]
const VOICE: [string, string][] = [
 ['Direct', 'No hedging. No fluff. "2 dives, 8:00–13:00, €96." Specifics over generalities.'],
 ['Expert but warm', 'Marine biologists on staff — we know the science and share it without showing off. Every guest learns something.'],
 ['The ocean first', 'We are a vehicle. The stars are the Mola mola, the Dori, the Formigas banks. We step back.'],
]
const BADGE_USE = ['Dark background (#090909 or darker)', 'White background for print', 'Minimum badge height: 40px screen / 14mm print', 'Always with clear space equal to badge height ÷ 4']
const BADGE_AVOID = ['Coloured or patterned backgrounds', 'Scaling below minimum size', 'Changing SSI red or Mares colours', 'Using badge without brand context']
const SOCIAL_DO = ['Dark backgrounds from the brand palette', 'Real underwater or marina photography', 'White or accent-blue type on dark', 'Strong leading headline — one idea per post', 'SSI / Mares badge in corner when relevant', 'Punctuate key words with the accent dot .']
const SOCIAL_DONT = ['Bright or white backgrounds', 'Stock photography or generic ocean shots', 'More than two colours in one graphic', 'Helvetica or bold-italic novelty fonts', 'Overcrowd with text — less is more', 'Alter SSI red or Mares brand colours']

function H({ n, title, intro }: { n: string; title: string; intro?: string }) {
 return (
 <div style={{ margin: '40px 0 16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', color: ACCENT, textTransform: 'uppercase', marginBottom: '6px' }}>{n}</div>
 <h2 style={{ fontSize: '22px', fontWeight: 500, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
 {intro && <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.65, margin: '8px 0 0', maxWidth: '680px' }}>{intro}</p>}
 </div>
 )
}
function Sub({ children }: { children: React.ReactNode }) {
 return <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, margin: '22px 0 10px' }}>{children}</div>
}

function Swatches({ list }: { list: Sw[] }) {
 const [copied, setCopied] = useState<string | null>(null)
 const copy = async (hex: string) => {
 try { await navigator.clipboard.writeText(hex); setCopied(hex); setTimeout(() => setCopied(c => (c === hex ? null : c)), 1500) }
 catch (e) { setCopied(`error: ${e instanceof Error ? e.message : 'clipboard blocked'}`) }
 }
 return (
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
 {list.map(c => (
 <button key={c.hex} type="button" onClick={() => copy(c.hex)} title="Click to copy the hex code"
 style={{ textAlign: 'left', cursor: 'pointer', fontFamily: FONT, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: 0, overflow: 'hidden', color: TEXT }}>
 <div style={{ height: '64px', background: c.hex, borderBottom: `1px solid ${BORDER}` }} />
 <div style={{ padding: '10px 12px 12px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>{c.name}</div>
 <div style={{ fontSize: '14px', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: ACCENT, margin: '2px 0 6px' }}>{copied === c.hex ? 'Copied ' : copied?.startsWith('error') ? 'Copy blocked' : c.hex}</div>
 <div style={{ fontSize: '14px', color: MUTED, lineHeight: 1.5 }}>{c.use}</div>
 </div>
 </button>
 ))}
 </div>
 )
}

function DoDont({ doList, dontList, doTitle = 'Use', dontTitle = 'Avoid' }: { doList: string[]; dontList: string[]; doTitle?: string; dontTitle?: string }) {
 const col = (title: string, items: string[], color: string, mark: string) => (
 <div style={{ flex: '1 1 280px', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: '16px 18px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color, marginBottom: '10px' }}>{title}</div>
 {items.map(i => <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '14px', color: TEXT, lineHeight: 1.6, padding: '3px 0' }}><span style={{ color, fontWeight: 500 }}>{mark}</span><span>{i}</span></div>)}
 </div>
 )
 return <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>{col(doTitle, doList, '#b7c4b0', '')}{col(dontTitle, dontList, '#c9928c', '')}</div>
}

const tag: React.CSSProperties = { display: 'inline-block', fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.35)', color: ACCENT, background: 'rgba(243,239,230,.08)' }
const mono: React.CSSProperties = { fontSize: '14px', color: MUTED, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }

export default function BrandGuidelines() {
 const [busy, setBusy] = useState(false)
 const [err, setErr] = useState<string | null>(null)

 const download = async () => {
 setBusy(true); setErr(null)
 try {
 const token = (await supabase.auth.getSession()).data.session?.access_token
 if (!token) { setErr('Not signed in — no session token. Please reload and sign in again.'); return }
 const res = await fetch('/api/staff/brandbook', { headers: { authorization: `Bearer ${token}` } })
 if (!res.ok) {
 const body = await res.json().catch(() => ({} as { error?: string }))
 setErr(`HTTP ${res.status} — ${body.error ?? res.statusText}`)
 return
 }
 const url = URL.createObjectURL(await res.blob())
 const a = document.createElement('a')
 a.href = url; a.download = 'AZD_Brand_Guide_2026.pdf'
 document.body.appendChild(a); a.click(); a.remove()
 setTimeout(() => URL.revokeObjectURL(url), 10_000)
 } catch (e) {
 setErr(`Download failed — ${e instanceof Error ? e.message : String(e)}`)
 } finally { setBusy(false) }
 }

 return (
 <div style={{ maxWidth: '960px', fontFamily: FONT, color: TEXT }}>
 <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: '28px 32px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
 <div style={{ flex: '1 1 360px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', color: ACCENT, textTransform: 'uppercase', marginBottom: '8px' }}>Azores Diving · Visual Identity System · 2026</div>
 <h2 style={{ fontSize: '34px', fontWeight: 500, color: '#fff', margin: 0, letterSpacing: '-.02em' }}>Brand Guide<span style={{ color: ACCENT }}>.</span></h2>
 <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: '8px 0 0' }}>Colours, type, logo, components and voice. Internal use only — please do not share outside the team.</p>
 </div>
 <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
 <button type="button" onClick={download} disabled={busy}
 style={{ padding: '12px 26px', borderRadius: 0, border: 'none', cursor: busy ? 'wait' : 'pointer', background: 'linear-gradient(135deg, #f3efe6, #f3efe6)', color: '#090909', fontWeight: 500, fontSize: '14px', fontFamily: FONT, opacity: busy ? 0.7 : 1 }}>
 {busy ? 'Preparing…' : ' Download PDF'}
 </button>
 <div style={{ fontSize: '14px', color: MUTED, marginTop: '6px' }}>AZD_Brand_Guide_2026.pdf · 8 pages · 0.8 MB</div>
 </div>
 </div>
 {err && <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: 0, background: 'rgba(201,146,140,.1)', border: '1px solid rgba(201,146,140,.4)', color: '#c9928c', fontSize: '14px' }}> {err}</div>}

 <H n="02 — Colors" title="Color System." intro="Our palette is built on deep Atlantic blues and a single electric accent — the colour of sunlight hitting clear water at depth. Click a swatch to copy its hex code." />
 <Sub>Core — background &amp; accent</Sub><Swatches list={CORE} />
 <Sub>Text colours</Sub><Swatches list={TEXTC} />
 <Sub>Functional — status &amp; highlight</Sub><Swatches list={FUNC} />
 <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: '12px 0 0' }}>Note: SSI red (#E2231A) and Mares red are used exclusively inside the partner badge SVGs — they are SSI/Mares brand colours, not AZD brand colours.</p>
 <Sub>Gradients</Sub>
 <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
 <div style={{ flex: '1 1 300px' }}>
 <div style={{ height: '56px', borderRadius: 0, background: 'linear-gradient(135deg, #f3efe6, #f3efe6)' }} />
 <div style={{ fontSize: '14px', color: MUTED, marginTop: '6px' }}>CTA button gradient — linear-gradient(135deg, #f3efe6 #f3efe6)</div>
 </div>
 <div style={{ flex: '1 1 300px' }}>
 <div style={{ height: '56px', borderRadius: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(243,239,230,.45), rgba(243,239,230,0) 70%), #090909', border: `1px solid ${BORDER}` }} />
 <div style={{ fontSize: '14px', color: MUTED, marginTop: '6px' }}>Hero glow — radial accent from top, dissolves to transparent</div>
 </div>
 </div>

 <H n="03 — Typography" title="Type System." intro="The site is set in Geist. Headings stay at weight 500 and body copy at 400." />
 <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: '24px 28px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', color: MUTED, textTransform: 'uppercase' }}>Primary font — Geist</div>
 <div style={{ fontFamily: STACK, fontSize: '56px', fontWeight: 500, color: '#fff', margin: '6px 0 4px' }}>AaBbCc</div>
 <div style={{ fontFamily: STACK, fontSize: '15px', color: TEXT, lineHeight: 1.7 }}>The ocean covers 71% of the earth&apos;s surface.<br />ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />abcdefghijklmnopqrstuvwxyz<br />0123456789.,–€%</div>
 <code style={{ display: 'block', marginTop: '12px', fontSize: '14px', color: ACCENT, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', overflowWrap: 'anywhere' }}>font-family: {STACK}</code>
 </div>
 <Sub>Weights in use</Sub>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
 {WEIGHTS.map(([n, w, u]) => (
 <div key={n} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: '12px 14px' }}>
 <div style={{ fontFamily: STACK, fontSize: '28px', fontWeight: w, color: '#fff' }}>Aa</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: TEXT }}>{w} · {n}</div>
 <div style={{ fontSize: '14px', color: MUTED }}>{u}</div>
 </div>
 ))}
 </div>
 <Sub>Type scale</Sub>
 <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: '8px 24px' }}>
 {SCALE.map(([label, size, w, sample]) => (
 <div key={label} style={{ display: 'flex', gap: '20px', alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.05)', flexWrap: 'wrap' }}>
 <div style={{ flex: '0 0 150px', ...mono }}>{label}</div>
 <div style={{ flex: '1 1 300px', fontFamily: STACK, fontSize: `${size}px`, fontWeight: w, color: '#fff', lineHeight: 1.1 }}>{sample}</div>
 </div>
 ))}
 <div style={{ display: 'flex', gap: '20px', alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.05)', flexWrap: 'wrap' }}>
 <div style={{ flex: '0 0 150px', ...mono }}>Label / 14px / 500</div>
 <div style={{ flex: '1 1 300px', fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', color: '#c9c2b6' }}>SSI · MARES DIVE CENTER · PONTA DELGADA</div>
 </div>
 <div style={{ display: 'flex', gap: '20px', alignItems: 'baseline', padding: '12px 0', flexWrap: 'wrap' }}>
 <div style={{ flex: '0 0 150px', ...mono }}>Label / 14px / 500</div>
 <div style={{ flex: '1 1 300px', fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', color: '#c9c2b6' }}>CERTIFIED DIVERS · SSI / PADI / CMAS ACCEPTED</div>
 </div>
 </div>

 <H n="04 — Identity" title="Logo & Identity." intro="The AZD logo combines the brand wordmark with a diving flag and wave motif. The same full-colour version (red flag, blue waves) is used on both light and dark backgrounds — no colour inversion is applied. The SSI Dive Center badge confirms our official partner status." />
 <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
 <div style={{ flex: '1 1 300px', background: '#ffffff', borderRadius: 0, padding: '28px', textAlign: 'center' }}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/logo.png" alt="AZD logo on white" style={{ maxWidth: '180px', maxHeight: '90px', objectFit: 'contain' }} />
 <div style={{ fontSize: '14px', color: '#a39e94', marginTop: '10px', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>On white / light backgrounds</div>
 </div>
 <div style={{ flex: '1 1 300px', background: '#090909', border: `1px solid ${BORDER}`, borderRadius: 0, padding: '28px', textAlign: 'center' }}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/logo.png" alt="AZD logo on dark" style={{ maxWidth: '180px', maxHeight: '90px', objectFit: 'contain' }} />
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', color: '#c9c2b6', marginTop: '10px' }}>SSI · MARES DIVE CENTER · PONTA DELGADA</div>
 <div style={{ fontSize: '14px', color: MUTED, marginTop: '6px', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>On dark — same full-colour logo</div>
 </div>
 </div>
 <p style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: '10px 0 0' }}>No colour inversion or filter is applied. The tagline is set in Fog Blue (#c9c2b6) at 7pt / tracking 0.28em.</p>
 <Sub>Logo files — download</Sub>
 <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
 {[
 { file: '/brand/AZD_Logo_dark-background.png', name: 'AZD_Logo_dark-background.png', title: 'Logo on dark background', meta: 'PNG · 525 × 525 px · navy #121210 background', bg: '#090909' },
 { file: '/brand/AZD_Logo_white-lettering.png', name: 'AZD_Logo_white-lettering.png', title: 'Logo with white lettering', meta: 'PNG · 300 × 300 px · for use on dark backgrounds', bg: '#090909' },
 ].map(l => (
 <div key={l.file} style={{ flex: '1 1 260px', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, overflow: 'hidden' }}>
 <div style={{ background: l.bg, padding: '16px', textAlign: 'center' }}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={l.file} alt={l.title} style={{ height: '130px', objectFit: 'contain', background: l.bg }} />
 </div>
 <div style={{ padding: '12px 16px 14px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>{l.title}</div>
 <div style={{ fontSize: '14px', color: MUTED, margin: '2px 0 10px' }}>{l.meta}</div>
 <a href={l.file} download={l.name} style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 0, background: 'rgba(243,239,230,.08)', border: '1px solid rgba(243,239,230,.35)', color: ACCENT, fontWeight: 500, fontSize: '14px', textDecoration: 'none' }}> Download PNG</a>
 </div>
 </div>
 ))}
 </div>
 <Sub>Partner badges</Sub>
 <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', background: '#090909', border: `1px solid ${BORDER}`, borderRadius: 0, padding: '18px 22px' }}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/badges/ssi.png" alt="SSI Dive Center" style={{ height: '56px', objectFit: 'contain' }} />
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/badges/mares.png" alt="Mares Dive Center" style={{ height: '56px', objectFit: 'contain' }} />
 <p style={{ flex: '1 1 260px', fontSize: '14px', color: MUTED, lineHeight: 1.6, margin: 0 }}>These badges confirm our official partner status with SSI and Mares. Always use on a dark or white background. Never distort, recolour, or separate from the wordmark context.</p>
 </div>
 <div style={{ marginTop: '14px' }}><DoDont doList={BADGE_USE} dontList={BADGE_AVOID} /></div>

 <H n="05 — Components" title="UI Elements." intro="Buttons, tags, and cards form the visual vocabulary of the interface. Each element follows the same logic: dark surfaces, electric accent, generous whitespace, and rounded corners." />
 <Sub>Buttons</Sub>
 <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', background: '#090909', border: `1px solid ${BORDER}`, borderRadius: 0, padding: '22px' }}>
 <div style={{ flex: '1 1 220px' }}>
 <span style={{ display: 'inline-block', padding: '11px 26px', borderRadius: 0, background: 'linear-gradient(135deg, #f3efe6, #f3efe6)', color: '#090909', fontWeight: 500, fontSize: '14px' }}>Book now</span>
 <div style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, marginTop: '10px' }}><b style={{ color: TEXT }}>Primary</b><br />Gradient: #f3efe6 #f3efe6<br />Text: #090909 (dark)<br />Weight: 800 · Radius: 999px</div>
 </div>
 <div style={{ flex: '1 1 220px' }}>
 <span style={{ display: 'inline-block', padding: '10px 26px', borderRadius: 0, background: 'transparent', border: '1px solid rgba(243,239,230,.35)', color: ACCENT, fontWeight: 500, fontSize: '14px' }}>Learn more</span>
 <div style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, marginTop: '10px' }}><b style={{ color: TEXT }}>Secondary</b><br />Background: transparent<br />Border: rgba(#f3efe6, 35%)<br />Text: #f3efe6</div>
 </div>
 <div style={{ flex: '1 1 220px' }}>
 <span style={{ display: 'inline-block', padding: '10px 26px', borderRadius: 0, background: 'rgba(243,239,230,.08)', border: '1px solid rgba(255,255,255,.08)', color: '#f3efe6', fontWeight: 500, fontSize: '14px' }}>View all sites</span>
 <div style={{ fontSize: '14px', color: MUTED, lineHeight: 1.6, marginTop: '10px' }}><b style={{ color: TEXT }}>Ghost</b><br />Background: rgba(accent, 8%)<br />Border: rgba(white, 8%)<br />Text: #f3efe6</div>
 </div>
 </div>
 <Sub>Tags &amp; badges</Sub>
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
 {['Most popular', 'OWD req.', 'Wreck', 'Weather-dependent', 'Advanced only'].map(t => <span key={t} style={tag}>{t}</span>)}
 </div>
 <p style={{ fontSize: '14px', color: MUTED, margin: '8px 0 0' }}>All tags: 7–8pt · 700 weight · letter-spacing .18–.22em · ALL CAPS · radius 999px</p>
 <Sub>Cards</Sub>
 <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
 {[{ t: 'Most popular', h: 'Daily Double Dive', d: 'Two guided boat dives · morning or afternoon · refreshments included', p: '€96 / 2 dives' }, { t: 'Expedition', h: 'Formigas & Dollabarat', d: '42 nm offshore · mantas · devil rays · Advanced only', p: '€255 / 2 dives' }].map(c => (
 <div key={c.h} style={{ flex: '1 1 300px', background: '#121210', border: `1px solid ${BORDER}`, borderRadius: 0, padding: '20px 22px' }}>
 <span style={tag}>{c.t}</span>
 <div style={{ fontSize: '19px', fontWeight: 500, color: '#fff', margin: '12px 0 6px' }}>{c.h}</div>
 <div style={{ fontSize: '14px', color: '#c9c2b6', lineHeight: 1.6 }}>{c.d}</div>
 <div style={{ fontSize: '17px', fontWeight: 500, color: ACCENT, marginTop: '12px' }}>{c.p}</div>
 </div>
 ))}
 </div>

 <H n="06 — Social" title="Social Media." intro="Dark backgrounds, electric accent, strong type. Photography should feel cinematic — deep blues, dramatic light, real subjects. Never stock. Never bright or washed-out." />
 <DoDont doList={SOCIAL_DO} dontList={SOCIAL_DONT} doTitle="Do" dontTitle="Don't" />

 <H n="07 — Principles" title="Design Language." intro={'"Atlantic Deep" — our visual language is named after the feeling of descending into clear, dark water. Everything references that experience: depth, clarity, and the rare electric light that breaks through.'} />
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
 {PRINCIPLES.map(([n, t, d]) => (
 <div key={n} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: '18px 20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: ACCENT, letterSpacing: '.08em' }}>{n}</div>
 <div style={{ fontSize: '16px', fontWeight: 500, color: '#fff', margin: '6px 0' }}>{t}</div>
 <div style={{ fontSize: '14px', color: '#c9c2b6', lineHeight: 1.65 }}>{d}</div>
 </div>
 ))}
 </div>
 <Sub>Brand voice — quick reference</Sub>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
 {VOICE.map(([t, d]) => (
 <div key={t} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 0, padding: '16px 18px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, color: ACCENT, marginBottom: '6px' }}>{t}</div>
 <div style={{ fontSize: '14px', color: TEXT, lineHeight: 1.65 }}>{d}</div>
 </div>
 ))}
 </div>
 </div>
 )
}
