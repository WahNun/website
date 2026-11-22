'use client'
import React from 'react'
import { T, s, bookBtnStyle, fireEvent, useIsMobile, type Lang } from './_shared'

export function PageDives({ nav, lang }: { nav: (p: string) => void; lang: Lang }) {
 const t = (key: keyof typeof T) => T[key][lang]
 const isMobile = useIsMobile()
 return (
 <div>
 {/* Hero */}
 <div style={{
 minHeight: '260px', position: 'relative', overflow: 'hidden',
 background: `linear-gradient(180deg,rgba(9,9,9,.35) 0%,rgba(9,9,9,.82) 65%,#090909 100%), url('/dives/dives-hero.webp') ${isMobile ? 'center center' : '30% center'}/cover`,
 display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
 padding: isMobile ? '32px 20px 28px' : '48px 48px 40px',
 }}>
 <div style={{ color: s.muted, marginBottom: '16px', fontSize: '14px' }}>
 <button type="button" onClick={() => nav('home')} style={{ color: s.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>{t('bc_home')}</button> / {t('bc_dives')}
 </div>
 <div style={{ color: s.accent, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', fontSize: '14px', marginBottom: '10px' }}>
 {t('dives_hero_tag')}
 </div>
 <h1 style={{ fontSize: 'clamp(32px,5vw,56px)', fontWeight: 900, letterSpacing: '-.02em', marginBottom: '10px', lineHeight: 1.05 }}>
 {t('dives_page_h2')}<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ fontSize: '19px', fontWeight: 600, color: '#f3efe6', margin: 0, maxWidth: '560px', lineHeight: 1.4 }}>
 {t('dives_hero_sub')}
 </p>
 </div>

 <div style={{ padding: isMobile ? '0 20px 48px' : '0 48px 60px' }}>
 {/* Stats */}
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '28px 0 36px' }}>
 {([['dives_stat_session', 'dives_stat_session_val'], ['dives_stat_group', 'dives_stat_group_val'], ['dives_stat_dives', 'dives_stat_dives_val'], ['dives_stat_incl', 'dives_stat_incl_val']] as const).map(([labelKey, valueKey]) => (
 <div key={labelKey} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '12px 16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: s.muted, marginBottom: '5px' }}>{t(labelKey)}</div>
 <div style={{ fontSize: '14px', fontWeight: 800, color: s.text }}>{t(valueKey)}</div>
 </div>
 ))}
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: isMobile ? '32px' : '48px', alignItems: 'start' }}>
 <div>
 <p style={{ fontSize: '17px', color: '#f3efe6', lineHeight: 1.7, marginBottom: '20px', fontWeight: 500 }}>
 {t('dives_p1')}
 </p>
 <p style={{ fontSize: '15px', color: '#c9c2b6', lineHeight: 1.75, marginBottom: '16px' }}>
 {t('dives_p2')}
 </p>
 <p style={{ fontSize: '15px', color: '#c9c2b6', lineHeight: 1.75, marginBottom: '32px' }}>
 {t('dives_p3')}
 </p>
 <p style={{ marginTop: '14px' }}><a href="/sites" style={{ color: s.accent, fontWeight: 700, textDecoration: 'none' }}>{t('link_sites_sm')}</a></p>

 {/* What's included */}
 <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: s.accent, marginBottom: '14px' }}>{t('dives_what_incl')}</div>
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '32px' }}>
 {(['dives_incl_tank', 'dives_incl_guide', 'dives_incl_boat', 'dives_incl_interval', 'dives_incl_brief'] as const).map(key => (
 <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
 <span style={{ color: s.accent, fontSize: '14px', fontWeight: 800 }}></span>
 <span style={{ fontSize: '14px', color: '#c9c2b6' }}>{t(key)}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Pricing sidebar */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
 <div style={{ background: 'rgba(255,200,80,.07)', border: '1px solid rgba(255,200,80,.2)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: '#c9b48a', marginBottom: '12px' }}>{t('dives_requirements')}</div>
 <p style={{ fontSize: '14px', color: '#c9b48a', lineHeight: 1.6, margin: 0 }}>
 {t('dives_req_text')}
 </p>
 </div>

 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: s.muted, marginBottom: '16px' }}>{t('dives_pricing')}</div>
 {([
 [t('dives_pkg_double'), '€99'],
 [t('dives_pkg_4'), '€189', '€47 / dive'],
 [t('dives_pkg_6'), '€270', '€45 / dive'],
 [t('dives_pkg_8'), '€344', '€43 / dive'],
 [t('dives_pkg_10'), '€409', '€41 / dive'],
 ] as [string,string,string?][]).map(([label, price, perDive], i, arr) => (
 <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
 <div>
 <div style={{ fontSize: '14px', color: '#f3efe6' }}>{label}</div>
 {perDive && <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>{perDive}</div>}
 </div>
 <div style={{ fontSize: '16px', fontWeight: 800, color: '#f3efe6' }}>{price}</div>
 </div>
 ))}
 </div>

 <a href='/book' onClick={() => fireEvent('booking_click')} style={{ ...bookBtnStyle, display: 'block', textAlign: 'center', fontSize: '15px', padding: '14px 24px' }}>
 {t('dives_book_btn')}
 </a>
 </div>
 </div>
 </div>
 </div>
 )
}
