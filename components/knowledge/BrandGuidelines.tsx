'use client'
import { useState } from 'react'
import { supabase } from '@/components/pages/_shared'

/* Brand Guide 2026 — Inhalt aus AZD_Brandbook.pdf, plus PDF-Download (nur für eingeloggte Mitarbeiter). */

const FONT = 'Inter, system-ui, sans-serif'
const ACCENT = '#35d0ff'
const MUTED = '#5e80a0'
const TEXT = '#d7e7f7'
const SURFACE = '#0d1826'
const BORDER = 'rgba(53,208,255,.12)'
const STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

type Sw = { name: string; hex: string; use: string }
const CORE: Sw[] = [
  { name: 'Electric Ocean', hex: '#35D0FF', use: 'Primary accent · CTAs · links · active states · tags' },
  { name: 'Deep Atlantic', hex: '#04101F', use: 'Page background · all dark surfaces' },
  { name: 'Abyss', hex: '#020A14', use: 'Darkest background · hero · CTA sections' },
  { name: 'Night Ocean', hex: '#0A1F3D', use: 'Navbar · card surfaces · raised UI elements' },
]
const TEXTC: Sw[] = [
  { name: 'Surface', hex: '#E8F1FB', use: 'Primary headings & body text' },
  { name: 'Ocean Light', hex: '#CFE2F4', use: 'Secondary body text · descriptions' },
  { name: 'Fog Blue', hex: '#7FA6C9', use: 'Muted / metadata text' },
  { name: 'Mist Blue', hex: '#93AECB', use: 'Subtitles · taglines' },
  { name: 'Pale Cyan', hex: '#9FD9F2', use: 'Species tags · secondary pill labels' },
]
const FUNC: Sw[] = [
  { name: 'Reef Teal', hex: '#4FE3C8', use: 'Success · available · course level badges' },
  { name: 'Amber', hex: '#FFD080', use: 'Requirements labels · ADMIN badge · star ratings' },
  { name: 'Lavender', hex: '#C8B4FF', use: 'Pro & safety courses · specialty badge accent' },
  { name: 'Status Orange', hex: '#FFA040', use: 'Pending · partial availability · warnings' },
  { name: 'Alert Red', hex: '#FF6040', use: 'OUT status · errors · delete actions' },
]
const WEIGHTS: [string, number, string][] = [['Black', 900, 'Headlines'], ['ExtraBold', 800, 'Subheadings'], ['Bold', 700, 'Labels / CTAs'], ['SemiBold', 600, 'UI elements'], ['Medium', 500, 'FAQ questions'], ['Regular', 400, 'Body copy']]
const SCALE: [string, number, number, string][] = [
  ['Hero / 72px / 900', 56, 900, 'The ocean.'],
  ['H1 / 44px / 900', 44, 900, 'Where we dive.'],
  ['H2 / 32px / 800', 32, 800, 'Daily Double Dive'],
  ['Body / 17px / 400', 17, 400, 'Two guided boat dives — morning or afternoon — with refreshments between.'],
]
const PRINCIPLES: [string, string, string][] = [
  ['01', 'Depth over noise', 'Dark backgrounds command focus. We do not compete for attention with brightness — we reward it with depth. Whitespace is not waste; it is the water between subjects.'],
  ['02', 'One accent, used precisely', '#35D0FF appears on CTAs, active states, and punctuation marks. Its power is scarcity. When everything is electric, nothing is. Use it once per composition.'],
  ['03', 'Heavy type, light touch', 'Headlines at weight 900 create presence. Body copy stays light (400–500). The contrast between the two creates hierarchy without needing size alone to do the work.'],
  ['04', 'Honest confidence', 'Formigas is never guaranteed. Conditions are always real. Our copy is direct, specific and never oversells. The ocean decides — we facilitate the encounter.'],
]
const VOICE: [string, string][] = [
  ['Direct', 'No hedging. No fluff. "2 dives, 8:00–13:00, €96." Specifics over generalities.'],
  ['Expert but warm', 'Marine biologists on staff — we know the science and share it without showing off. Every guest learns something.'],
  ['The ocean first', 'We are a vehicle. The stars are the Mola mola, the Dori, the Formigas banks. We step back.'],
]
const BADGE_USE = ['Dark background (#04101f or darker)', 'White background for print', 'Minimum badge height: 40px screen / 14mm print', 'Always with clear space equal to badge height ÷ 4']
const BADGE_AVOID = ['Coloured or patterned backgrounds', 'Scaling below minimum size', 'Changing SSI red or Mares colours', 'Using badge without brand context']
const SOCIAL_DO = ['Dark backgrounds from the brand palette', 'Real underwater or marina photography', 'White or accent-blue type on dark', 'Strong leading headline — one idea per post', 'SSI / Mares badge in corner when relevant', 'Punctuate key words with the accent dot .']
const SOCIAL_DONT = ['Bright or white backgrounds', 'Stock photography or generic ocean shots', 'More than two colours in one graphic', 'Helvetica or bold-italic novelty fonts', 'Overcrowd with text — less is more', 'Alter SSI red or Mares brand colours']

function H({ n, title, intro }: { n: string; title: string; intro?: string }) {
  return (
    <div style={{ margin: '40px 0 16px' }}>
      <div style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '.2em', color: ACCENT, textTransform: 'uppercase', marginBottom: '6px' }}>{n}</div>
      <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-.01em' }}>{title}</h2>
      {intro && <p style={{ fontSize: '13.5px', color: MUTED, lineHeight: 1.65, margin: '8px 0 0', maxWidth: '680px' }}>{intro}</p>}
    </div>
  )
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED, margin: '22px 0 10px' }}>{children}</div>
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
          style={{ textAlign: 'left', cursor: 'pointer', fontFamily: FONT, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: 0, overflow: 'hidden', color: TEXT }}>
          <div style={{ height: '64px', background: c.hex, borderBottom: `1px solid ${BORDER}` }} />
          <div style={{ padding: '10px 12px 12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>{c.name}</div>
            <div style={{ fontSize: '12px', fontFamily: 'ui-monospace, Menlo, monospace', color: ACCENT, margin: '2px 0 6px' }}>{copied === c.hex ? 'Copied ✓' : copied?.startsWith('error') ? 'Copy blocked' : c.hex}</div>
            <div style={{ fontSize: '12.5px', color: MUTED, lineHeight: 1.5 }}>{c.use}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function DoDont({ doList, dontList, doTitle = 'Use', dontTitle = 'Avoid' }: { doList: string[]; dontList: string[]; doTitle?: string; dontTitle?: string }) {
  const col = (title: string, items: string[], color: string, mark: string) => (
    <div style={{ flex: '1 1 280px', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
      <div style={{ fontSize: '12.5px', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color, marginBottom: '10px' }}>{title}</div>
      {items.map(i => <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '13px', color: TEXT, lineHeight: 1.6, padding: '3px 0' }}><span style={{ color, fontWeight: 800 }}>{mark}</span><span>{i}</span></div>)}
    </div>
  )
  return <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>{col(doTitle, doList, '#4fe3c8', '✓')}{col(dontTitle, dontList, '#ff6040', '✕')}</div>
}

const tag: React.CSSProperties = { display: 'inline-block', fontSize: '11.5px', fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: '999px', border: '1px solid rgba(53,208,255,.35)', color: ACCENT, background: 'rgba(53,208,255,.08)' }
const mono: React.CSSProperties = { fontSize: '12.5px', color: MUTED, fontFamily: 'ui-monospace, Menlo, monospace' }

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
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '28px 32px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 360px' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '.2em', color: ACCENT, textTransform: 'uppercase', marginBottom: '8px' }}>Azores Diving · Visual Identity System · 2026</div>
          <h2 style={{ fontSize: '34px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-.02em' }}>Brand Guide<span style={{ color: ACCENT }}>.</span></h2>
          <p style={{ fontSize: '13px', color: MUTED, lineHeight: 1.6, margin: '8px 0 0' }}>Colours, type, logo, components and voice. Internal use only — please do not share outside the team.</p>
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
          <button type="button" onClick={download} disabled={busy}
            style={{ padding: '12px 26px', borderRadius: '999px', border: 'none', cursor: busy ? 'wait' : 'pointer', background: 'linear-gradient(135deg, #35d0ff, #1a8fe0)', color: '#04101f', fontWeight: 800, fontSize: '14px', fontFamily: FONT, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Preparing…' : '⬇ Download PDF'}
          </button>
          <div style={{ fontSize: '12.5px', color: MUTED, marginTop: '6px' }}>AZD_Brand_Guide_2026.pdf · 8 pages · 0.8 MB</div>
        </div>
      </div>
      {err && <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,96,64,.1)', border: '1px solid rgba(255,96,64,.4)', color: '#ff8b70', fontSize: '12.5px' }}>⚠ {err}</div>}

      <H n="02 — Colors" title="Color System." intro="Our palette is built on deep Atlantic blues and a single electric accent — the colour of sunlight hitting clear water at depth. Click a swatch to copy its hex code." />
      <Sub>Core — background &amp; accent</Sub><Swatches list={CORE} />
      <Sub>Text colours</Sub><Swatches list={TEXTC} />
      <Sub>Functional — status &amp; highlight</Sub><Swatches list={FUNC} />
      <p style={{ fontSize: '12px', color: MUTED, lineHeight: 1.6, margin: '12px 0 0' }}>Note: SSI red (#E2231A) and Mares red are used exclusively inside the partner badge SVGs — they are SSI/Mares brand colours, not AZD brand colours.</p>
      <Sub>Gradients</Sub>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ height: '56px', borderRadius: '12px', background: 'linear-gradient(135deg, #35d0ff, #1a8fe0)' }} />
          <div style={{ fontSize: '12px', color: MUTED, marginTop: '6px' }}>CTA button gradient — linear-gradient(135deg, #35d0ff → #1a8fe0)</div>
        </div>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ height: '56px', borderRadius: '12px', background: 'radial-gradient(ellipse at 50% 0%, rgba(53,208,255,.45), rgba(53,208,255,0) 70%), #04101f', border: `1px solid ${BORDER}` }} />
          <div style={{ fontSize: '12px', color: MUTED, marginTop: '6px' }}>Hero glow — radial accent from top, dissolves to transparent</div>
        </div>
      </div>

      <H n="03 — Typography" title="Type System." intro="We use the system UI font stack for the website — it renders crisply on every device with no load overhead. For social media and print, Inter (Google Fonts) is the closest match and the recommended choice." />
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '24px 28px' }}>
        <div style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '.16em', color: MUTED, textTransform: 'uppercase' }}>Primary font — Inter / system UI</div>
        <div style={{ fontFamily: STACK, fontSize: '56px', fontWeight: 900, color: '#fff', margin: '6px 0 4px' }}>AaBbCc</div>
        <div style={{ fontFamily: STACK, fontSize: '15px', color: TEXT, lineHeight: 1.7 }}>The ocean covers 71% of the earth&apos;s surface.<br />ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />abcdefghijklmnopqrstuvwxyz<br />0123456789.,–€%</div>
        <code style={{ display: 'block', marginTop: '12px', fontSize: '12.5px', color: ACCENT, fontFamily: 'ui-monospace, Menlo, monospace', overflowWrap: 'anywhere' }}>font-family: {STACK}</code>
      </div>
      <Sub>Weights in use</Sub>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
        {WEIGHTS.map(([n, w, u]) => (
          <div key={w} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontFamily: STACK, fontSize: '28px', fontWeight: w, color: '#fff' }}>Aa</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: TEXT }}>{w} · {n}</div>
            <div style={{ fontSize: '12.5px', color: MUTED }}>{u}</div>
          </div>
        ))}
      </div>
      <Sub>Type scale</Sub>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '8px 24px' }}>
        {SCALE.map(([label, size, w, sample]) => (
          <div key={label} style={{ display: 'flex', gap: '20px', alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.05)', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 150px', ...mono }}>{label}</div>
            <div style={{ flex: '1 1 300px', fontFamily: STACK, fontSize: `${size}px`, fontWeight: w, color: '#fff', lineHeight: 1.1 }}>{sample}</div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.05)', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 150px', ...mono }}>Label / 11px / 700</div>
          <div style={{ flex: '1 1 300px', fontSize: '12.5px', fontWeight: 700, letterSpacing: '.28em', color: '#7FA6C9' }}>SSI · MARES DIVE CENTER · PONTA DELGADA</div>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'baseline', padding: '12px 0', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 150px', ...mono }}>Micro / 10px / 700</div>
          <div style={{ flex: '1 1 300px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '.28em', color: '#7FA6C9' }}>CERTIFIED DIVERS · SSI / PADI / CMAS ACCEPTED</div>
        </div>
      </div>

      <H n="04 — Identity" title="Logo & Identity." intro="The AZD logo combines the brand wordmark with a diving flag and wave motif. The same full-colour version (red flag, blue waves) is used on both light and dark backgrounds — no colour inversion is applied. The SSI Dive Center badge confirms our official partner status." />
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', background: '#ffffff', borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="AZD logo on white" style={{ maxWidth: '180px', maxHeight: '90px', objectFit: 'contain' }} />
          <div style={{ fontSize: '12px', color: '#5b6b7b', marginTop: '10px', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 }}>On white / light backgrounds</div>
        </div>
        <div style={{ flex: '1 1 300px', background: '#04101f', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="AZD logo on dark" style={{ maxWidth: '180px', maxHeight: '90px', objectFit: 'contain' }} />
          <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '.28em', color: '#7FA6C9', marginTop: '10px' }}>SSI · MARES DIVE CENTER · PONTA DELGADA</div>
          <div style={{ fontSize: '12px', color: MUTED, marginTop: '6px', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700 }}>On dark — same full-colour logo</div>
        </div>
      </div>
      <p style={{ fontSize: '12.5px', color: MUTED, lineHeight: 1.6, margin: '10px 0 0' }}>No colour inversion or filter is applied. The tagline is set in Fog Blue (#7FA6C9) at 7pt / tracking 0.28em.</p>
      <Sub>Logo files — download</Sub>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        {[
          { file: '/brand/AZD_Logo_dark-background.png', name: 'AZD_Logo_dark-background.png', title: 'Logo on dark background', meta: 'PNG · 525 × 525 px · navy #04101F background', bg: '#04101f' },
          { file: '/brand/AZD_Logo_white-lettering.png', name: 'AZD_Logo_white-lettering.png', title: 'Logo with white lettering', meta: 'PNG · 300 × 300 px · for use on dark backgrounds', bg: '#04101f' },
        ].map(l => (
          <div key={l.file} style={{ flex: '1 1 260px', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: l.bg, padding: '16px', textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.file} alt={l.title} style={{ height: '130px', objectFit: 'contain', background: l.bg }} />
            </div>
            <div style={{ padding: '12px 16px 14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>{l.title}</div>
              <div style={{ fontSize: '12.5px', color: MUTED, margin: '2px 0 10px' }}>{l.meta}</div>
              <a href={l.file} download={l.name} style={{ display: 'inline-block', padding: '8px 18px', borderRadius: '999px', background: 'rgba(53,208,255,.08)', border: '1px solid rgba(53,208,255,.35)', color: ACCENT, fontWeight: 700, fontSize: '12.5px', textDecoration: 'none' }}>⬇ Download PNG</a>
            </div>
          </div>
        ))}
      </div>
      <Sub>Partner badges</Sub>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', background: '#04101f', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '18px 22px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badges/ssi.png" alt="SSI Dive Center" style={{ height: '56px', objectFit: 'contain' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badges/mares.png" alt="Mares Dive Center" style={{ height: '56px', objectFit: 'contain' }} />
        <p style={{ flex: '1 1 260px', fontSize: '12.5px', color: MUTED, lineHeight: 1.6, margin: 0 }}>These badges confirm our official partner status with SSI and Mares. Always use on a dark or white background. Never distort, recolour, or separate from the wordmark context.</p>
      </div>
      <div style={{ marginTop: '14px' }}><DoDont doList={BADGE_USE} dontList={BADGE_AVOID} /></div>

      <H n="05 — Components" title="UI Elements." intro="Buttons, tags, and cards form the visual vocabulary of the interface. Each element follows the same logic: dark surfaces, electric accent, generous whitespace, and rounded corners." />
      <Sub>Buttons</Sub>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', background: '#04101f', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '22px' }}>
        <div style={{ flex: '1 1 220px' }}>
          <span style={{ display: 'inline-block', padding: '11px 26px', borderRadius: '999px', background: 'linear-gradient(135deg, #35d0ff, #1a8fe0)', color: '#04101f', fontWeight: 800, fontSize: '14px' }}>Book now</span>
          <div style={{ fontSize: '12.5px', color: MUTED, lineHeight: 1.6, marginTop: '10px' }}><b style={{ color: TEXT }}>Primary</b><br />Gradient: #35D0FF → #1A8FE0<br />Text: #04101f (dark)<br />Weight: 800 · Radius: 999px</div>
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <span style={{ display: 'inline-block', padding: '10px 26px', borderRadius: '999px', background: 'transparent', border: '1px solid rgba(53,208,255,.35)', color: ACCENT, fontWeight: 700, fontSize: '14px' }}>Learn more</span>
          <div style={{ fontSize: '12.5px', color: MUTED, lineHeight: 1.6, marginTop: '10px' }}><b style={{ color: TEXT }}>Secondary</b><br />Background: transparent<br />Border: rgba(#35D0FF, 35%)<br />Text: #35D0FF</div>
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <span style={{ display: 'inline-block', padding: '10px 26px', borderRadius: '999px', background: 'rgba(53,208,255,.08)', border: '1px solid rgba(255,255,255,.08)', color: '#e8f1fb', fontWeight: 700, fontSize: '14px' }}>View all sites</span>
          <div style={{ fontSize: '12.5px', color: MUTED, lineHeight: 1.6, marginTop: '10px' }}><b style={{ color: TEXT }}>Ghost</b><br />Background: rgba(accent, 8%)<br />Border: rgba(white, 8%)<br />Text: #e8f1fb</div>
        </div>
      </div>
      <Sub>Tags &amp; badges</Sub>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {['Most popular', 'OWD req.', 'Wreck', 'Weather-dependent', 'Advanced only'].map(t => <span key={t} style={tag}>{t}</span>)}
      </div>
      <p style={{ fontSize: '12px', color: MUTED, margin: '8px 0 0' }}>All tags: 7–8pt · 700 weight · letter-spacing .18–.22em · ALL CAPS · radius 999px</p>
      <Sub>Cards</Sub>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        {[{ t: 'Most popular', h: 'Daily Double Dive', d: 'Two guided boat dives · morning or afternoon · refreshments included', p: '€96 / 2 dives' }, { t: 'Expedition', h: 'Formigas & Dollabarat', d: '42 nm offshore · mantas · devil rays · Advanced only', p: '€255 / 2 dives' }].map(c => (
          <div key={c.h} style={{ flex: '1 1 300px', background: '#0a1f3d', border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px 22px' }}>
            <span style={tag}>{c.t}</span>
            <div style={{ fontSize: '19px', fontWeight: 800, color: '#fff', margin: '12px 0 6px' }}>{c.h}</div>
            <div style={{ fontSize: '12.5px', color: '#93aecb', lineHeight: 1.6 }}>{c.d}</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: ACCENT, marginTop: '12px' }}>{c.p}</div>
          </div>
        ))}
      </div>

      <H n="06 — Social" title="Social Media." intro="Dark backgrounds, electric accent, strong type. Photography should feel cinematic — deep blues, dramatic light, real subjects. Never stock. Never bright or washed-out." />
      <DoDont doList={SOCIAL_DO} dontList={SOCIAL_DONT} doTitle="Do" dontTitle="Don't" />

      <H n="07 — Principles" title="Design Language." intro={'"Atlantic Deep" — our visual language is named after the feeling of descending into clear, dark water. Everything references that experience: depth, clarity, and the rare electric light that breaks through.'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        {PRINCIPLES.map(([n, t, d]) => (
          <div key={n} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: ACCENT, letterSpacing: '.14em' }}>{n}</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: '6px 0' }}>{t}</div>
            <div style={{ fontSize: '13px', color: '#8aaec8', lineHeight: 1.65 }}>{d}</div>
          </div>
        ))}
      </div>
      <Sub>Brand voice — quick reference</Sub>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
        {VOICE.map(([t, d]) => (
          <div key={t} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: ACCENT, marginBottom: '6px' }}>{t}</div>
            <div style={{ fontSize: '13px', color: TEXT, lineHeight: 1.65 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
