'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

type Lang = 'EN' | 'PT' | 'DE' | 'ES'

const T = {
 nav_home: { EN: 'Home', PT: 'Início', DE: 'Start', ES: 'Inicio' },
 nav_diving: { EN: 'Diving', PT: 'Mergulho', DE: 'Tauchen', ES: 'Buceo' },
 nav_beginners: { EN: 'Beginners', PT: 'Iniciantes', DE: 'Anfänger', ES: 'Principiantes' },
 nav_courses: { EN: 'Courses', PT: 'Cursos', DE: 'Kurse', ES: 'Cursos' },
 nav_sites: { EN: 'Dive Sites', PT: 'Pontos de Mergulho', DE: 'Tauchplätze', ES: 'Puntos de Buceo' },
 nav_offshore: { EN: 'Offshore', PT: 'Offshore', DE: 'Offshore', ES: 'Offshore' },
 nav_team: { EN: 'Team', PT: 'Equipa', DE: 'Team', ES: 'Equipo' },
 nav_contact: { EN: 'Contact', PT: 'Contacto', DE: 'Kontakt', ES: 'Contacto' },
 nav_book_now: { EN: 'Book now', PT: 'Reservar', DE: 'Jetzt buchen', ES: 'Reservar' },
 nav_member_area: { EN: 'Member Area', PT: 'Área Privada', DE: 'Mitgliederbereich', ES: 'Área de miembros' },
}

const accent = 'var(--text)'
const mutedColor = 'var(--muted)'
const font = `var(--font-geist-sans), sans-serif`

const bookBtnStyle: React.CSSProperties = {
 display: 'inline-block',
 background: 'linear-gradient(135deg,var(--text),var(--text))',
 color: 'var(--on-accent)',
 fontWeight: 500,
 fontSize: '14px',
 padding: '12px 24px',
 borderRadius: 0,
 boxShadow: 'none',
 textDecoration: 'none',
 cursor: 'pointer',
 border: 'none',
 fontFamily: font,
}

interface NavBarProps {
 lang: string
}

export default function NavBar({ lang: initialLang }: NavBarProps) {
 const [lang, setLang] = useState<Lang>((initialLang as Lang) || 'EN')
 const [isMobile, setIsMobile] = useState(false)
 const [menuOpen, setMenuOpen] = useState(false)
 const pathname = usePathname()
 // Member Area (Desktop): Website-Header eingeklappt, erscheint am oberen Bildschirmrand per Maus (Lucas 30.10.)
 const [peek, setPeek] = useState(false)
 const collapsed = pathname.startsWith('/members') && !isMobile

 useEffect(() => {
 const mq = window.matchMedia('(max-width: 1000px)')
 setIsMobile(mq.matches)
 const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
 mq.addEventListener('change', handler)
 return () => mq.removeEventListener('change', handler)
 }, [])

 useEffect(() => {
 if (!collapsed) { setPeek(false); return }
 // Der „Website"-Knopf in der Member-Tab-Leiste (neben Sign out) öffnet den Header über dieses Event
 const open = () => setPeek(true)
 window.addEventListener('azd-show-site-nav', open)
 return () => window.removeEventListener('azd-show-site-nav', open)
 }, [collapsed])

 const handleLangChange = (l: Lang) => {
 document.cookie = `lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}`
 setLang(l)
 window.location.reload()
 }

 const navLinks: Array<{ label: string; href: string }> = [
 { label: T.nav_home[lang], href: '/' },
 { label: T.nav_diving[lang], href: '/dives' },
 { label: T.nav_beginners[lang], href: '/basicdiver'},
 { label: T.nav_courses[lang], href: '/courses' },
 { label: T.nav_sites[lang], href: '/sites' },
 { label: T.nav_offshore[lang], href: '/offshore' },
 { label: T.nav_team[lang], href: '/team' },
 { label: T.nav_contact[lang], href: '/contact' },
 ]

 const isActive = (href: string) =>
 href === '/' ? pathname === '/' : pathname.startsWith(href)

 const isMembersActive = pathname.startsWith('/members')

 return (
 <>
 <a
 href="#main-content"
 style={{
 position: 'absolute', top: '-120px', left: 0, zIndex: 9999,
 background: accent, color: 'var(--on-accent)', padding: '8px 16px',
 fontWeight: 500, fontFamily: font, textDecoration: 'none',
 transition: 'top .15s',
 }}
 onFocus={e => (e.currentTarget.style.top = '0')}
 onBlur={e => (e.currentTarget.style.top = '-120px')}
 >
 Skip to content
 </a>

 <nav
 onMouseLeave={collapsed ? () => setPeek(false) : undefined}
 onFocus={collapsed ? () => setPeek(true) : undefined}
 style={{
 display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '28px',
 padding: isMobile ? '14px 18px' : '18px 48px',
 ...(collapsed
 ? { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, transform: peek ? 'translateY(0)' : 'translateY(-100%)', transition: 'transform .18s ease', boxShadow: peek ? '0 8px 30px rgba(0,0,0,.45)' : 'none' }
 : { position: 'sticky', top: 0, zIndex: 100 }),
 background: 'color-mix(in srgb, var(--bg) 92%, transparent)', backdropFilter: 'blur(12px)',
 borderBottom: '1px solid rgba(255,255,255,.06)',
 }}
 >
 {/* Logo */}
 <a href="/" style={{ cursor: 'pointer', flexShrink: 0, textDecoration: 'none' }}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img
 src="/logo.png"
 alt="Azoresdiving"
 style={{
 height: isMobile ? '36px' : '46px',
 width: 'auto',
 display: 'block',
 marginBottom: isMobile ? 0 : '3px',
 }}
 />
 {!isMobile && (
 <small style={{
 display: 'block', fontSize: '14px', fontWeight: 500,
 letterSpacing: '.08em', color: mutedColor, textTransform: 'uppercase',
 }}>
 SSI · Mares Dive Center · Ponta Delgada
 </small>
 )}
 </a>

 {isMobile ? (
 /* ── MOBILE top bar ── */
 <>
 <a
 href="/book"
 style={{ ...bookBtnStyle, marginLeft: 'auto', flexShrink: 0, fontSize: '14px', padding: '10px 18px' }}
 >
 {T.nav_book_now[lang]}
 </a>
 <button
 onClick={() => setMenuOpen(o => !o)}
 style={{
 background: 'transparent', border: '1px solid rgba(255,255,255,.15)',
 borderRadius: 0, color: 'var(--text)', fontSize: '20px',
 cursor: 'pointer', padding: '6px 10px', lineHeight: 1, flexShrink: 0,
 }}
 aria-label={menuOpen ? 'Close menu' : 'Open menu'}
 >
 {menuOpen ? '' : ''}
 </button>
 </>
 ) : (
 /* ── DESKTOP nav ── */
 <>
 <div style={{ display: 'flex', gap: '22px', marginLeft: '24px', flexWrap: 'wrap' }}>
 {navLinks.map(({ label, href }) => (
 <a
 key={href}
 href={href}
 style={{
 color: isActive(href) ? accent : 'var(--accent)',
 fontSize: '14px',
 fontWeight: 500,
 cursor: 'pointer',
 whiteSpace: 'nowrap',
 textDecoration: 'none',
 fontFamily: font,
 }}
 >
 {label}
 </a>
 ))}
 </div>

 {/* Language switcher */}
 <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
 <select
 value={lang}
 onChange={e => handleLangChange(e.target.value as Lang)}
 style={{
 background: 'var(--surface)', color: accent,
 border: '1px solid color-mix(in srgb, var(--text) 25%, transparent)',
 borderRadius: 0, padding: '6px 10px',
 fontSize: '14px', fontWeight: 500,
 cursor: 'pointer', fontFamily: font, outline: 'none',
 }}
 >
 {(['EN', 'PT', 'DE', 'ES'] as const).map(l => (
 <option key={l} value={l}>{l}</option>
 ))}
 </select>
 </div>

 <a
 href="/book"
 style={{ ...bookBtnStyle, flexShrink: 0, fontSize: '14px', padding: '11px 24px' }}
 >
 {T.nav_book_now[lang]}
 </a>

 <a
 href="/members"
 style={{
 fontSize: '14px', fontWeight: 500, padding: '8px 14px',
 borderRadius: 0, cursor: 'pointer',
 color: isMembersActive ? accent : mutedColor,
 background: isMembersActive ? 'color-mix(in srgb, var(--text) 10%, transparent)' : 'rgba(255,255,255,.04)',
 border: `1px solid ${isMembersActive ? 'color-mix(in srgb, var(--text) 35%, transparent)' : 'rgba(255,255,255,.08)'}`,
 flexShrink: 0, whiteSpace: 'nowrap',
 textDecoration: 'none', fontFamily: font,
 display: 'inline-block',
 }}
 >
 {T.nav_member_area[lang]}
 </a>
 </>
 )}
 </nav>

 {/* ── MOBILE MENU DRAWER ── */}
 {isMobile && menuOpen && (
 <div style={{
 position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
 background: 'color-mix(in srgb, var(--bg) 97%, transparent)', backdropFilter: 'blur(14px)',
 display: 'flex', flexDirection: 'column', padding: '20px 24px 40px',
 overflowY: 'auto',
 }}>
 {/* Close row */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
 <a href="/" onClick={() => setMenuOpen(false)}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/logo.png" alt="Azoresdiving" style={{ height: '36px', width: 'auto', display: 'block' }} />
 </a>
 <button
 onClick={() => setMenuOpen(false)}
 style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '26px', cursor: 'pointer', lineHeight: 1 }}
 aria-label="Close menu"
 >
 
 </button>
 </div>

 {/* Nav links */}
 {navLinks.map(({ label, href }) => (
 <a
 key={href}
 href={href}
 onClick={() => setMenuOpen(false)}
 style={{
 fontSize: '26px', fontWeight: 500, letterSpacing: '-0.02em',
 padding: '16px 0', color: isActive(href) ? accent : 'var(--accent)',
 textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,.06)',
 width: '100%', display: 'block', fontFamily: font,
 }}
 >
 {label}
 </a>
 ))}

 {/* Language switcher */}
 <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
 {(['EN', 'PT', 'DE', 'ES'] as const).map(l => (
 <button
 key={l}
 onClick={() => handleLangChange(l)}
 style={{
 padding: '8px 18px', borderRadius: 0,
 border: `1px solid ${lang === l ? accent : 'rgba(255,255,255,.15)'}`,
 background: lang === l ? 'color-mix(in srgb, var(--text) 15%, transparent)' : 'transparent',
 color: lang === l ? accent : 'var(--accent)',
 fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: font,
 }}
 >
 {l}
 </button>
 ))}
 </div>

 {/* CTA buttons */}
 <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
 <a
 href="/book"
 style={{ ...bookBtnStyle, fontSize: '16px', padding: '16px 28px', textAlign: 'center', display: 'block' }}
 >
 {T.nav_book_now[lang]}
 </a>
 <a
 href="/members"
 onClick={() => setMenuOpen(false)}
 style={{
 fontSize: '14px', color: mutedColor, textAlign: 'center',
 padding: '12px 8px', fontFamily: font, textDecoration: 'none', display: 'block',
 }}
 >
 {T.nav_member_area[lang]} 
 </a>
 </div>
 </div>
 )}
 </>
 )
}
