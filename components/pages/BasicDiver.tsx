'use client'
import React from 'react'
import { T, s, bookBtnStyle, fireEvent, useIsMobile, type Lang } from './_shared'

export function PageBasicDiver({ nav, lang, onBookClick }: { nav: (p: string) => void; lang: Lang; onBookClick?: () => void }) {
 const t = (key: keyof typeof T) => T[key][lang]
 const isMobile = useIsMobile()
 return (
 <div>
 {/* Hero with image */}
 <div style={{
 minHeight: '260px', position: 'relative', overflow: 'hidden',
 background: 'linear-gradient(180deg,color-mix(in srgb, var(--bg) 25%, transparent) 0%,color-mix(in srgb, var(--bg) 82%, transparent) 65%,var(--bg) 100%), url(\'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/try-scuba-hero.webp\') center 15%/cover',
 display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
 padding: isMobile ? '32px 20px 28px' : '48px 48px 40px',
 }}>
 <div style={{ color: s.muted, marginBottom: '16px', fontSize: '14px' }}>
 <button type="button" onClick={() => nav('home')} style={{ color: s.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>{t('bc_home')}</button> / {t('bc_basicdiver')}
 </div>
 <div style={{ color: 'var(--text)', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: '14px', marginBottom: '10px' }}>
 {t('bd_hero_tag')}
 </div>
 <h1 style={{ fontSize: 'clamp(32px,5vw,56px)', fontWeight: 500, letterSpacing: '-.02em', marginBottom: '10px', lineHeight: 1.05 }}>
 Basic Diver<span style={{ color: 'var(--text)' }}>.</span>
 </h1>
 <p style={{ fontSize: '19px', fontWeight: 500, color: 'var(--text)', margin: 0, maxWidth: '540px', lineHeight: 1.4 }}>
 {t('bd_hero_sub')}
 </p>
 </div>

 <div style={{ padding: isMobile ? '0 20px 48px' : '0 48px 60px' }}>
 {/* Stats */}
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '28px 0 36px' }}>
 {[[t('bd_duration'), t('bd_duration_val')], [t('bd_setup'), t('bd_setup_val')], [t('bd_depth'), t('bd_depth_val')], [t('bd_price_label'), '€139']].map(([label, value]) => (
 <div key={label} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 'var(--radius-card)', padding: '12px 16px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '5px' }}>{label}</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{value}</div>
 </div>
 ))}
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: isMobile ? '32px' : '48px', alignItems: 'start' }}>
 <div>
 <p style={{ fontSize: '17px', color: 'var(--text)', lineHeight: 1.7, marginBottom: '20px', fontWeight: 500 }}>
 {t('bd_intro_p1')}
 </p>
 <p style={{ fontSize: '15px', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '16px' }}>
 {t('bd_p2')}
 </p>
 <p style={{ fontSize: '15px', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '32px' }}>
 {t('bd_p3')}
 </p>

 {/* What happens step by step */}
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '16px' }}>{t('bd_what_expect')}</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
 {([
 ['bd_step1_name', 'bd_step1_desc'],
 ['bd_step2_name', 'bd_step2_desc'],
 ['bd_step3_name', 'bd_step3_desc'],
 ['bd_step4_name', 'bd_step4_desc'],
 ['bd_step5_name', 'bd_step5_desc'],
 ['bd_step6_name', 'bd_step6_desc'],
 ] as const).map(([stepKey, descKey], i) => (
 <div key={stepKey} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
 <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'transparent', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>{i + 1}</div>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text, marginBottom: '3px' }}>{t(stepKey)}</div>
 <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.5 }}>{t(descKey)}</div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Sidebar */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
 <div style={{ background: 'color-mix(in srgb, var(--text) 8%, transparent)', border: '1px solid var(--line)', borderRadius: 'var(--radius-card)', padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '12px' }}>{t('bd_requirements_title')}</div>
 <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
 {t('bd_requirements_body')}
 </p>
 </div>

 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 'var(--radius-card)', padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '12px' }}>{t('bd_included_title')}</div>
 {(['bd_incl1', 'bd_incl2', 'bd_incl3', 'bd_incl4', 'bd_incl5', 'bd_incl6'] as const).map(key => (
 <div key={key} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
 <span style={{ color: 'var(--text)', fontSize: '14px', lineHeight: 1.4, flexShrink: 0 }}>—</span>
 <span style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.45 }}>{t(key)}</span>
 </div>
 ))}
 </div>

 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 'var(--radius-control)', padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '16px' }}>{t('bd_pricing_title')}</div>
 {([
 [t('bd_price_pool'), '€95', null],
 [t('bd_price_group'), '€139', t('bd_price_group_note')],
 [t('bd_price_private'), '€185', t('bd_price_private_note')],
 ] as [string, string, string|null][]).map(([label, price, note], i, arr) => (
 <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
 <div>
 <div style={{ fontSize: '14px', color: 'var(--text)' }}>{label}</div>
 {note && <div style={{ fontSize: '14px', color: s.muted, marginTop: '2px' }}>{note}</div>}
 </div>
 <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text)', marginLeft: '12px', flexShrink: 0 }}>{price}</div>
 </div>
 ))}
 </div>

 <div style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 15%, transparent)', borderRadius: 'var(--radius-card)', padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent, marginBottom: '8px' }}>{t('bd_go_further_title')}</div>
 <p style={{ fontSize: '14px', color: s.text, margin: '0 0 12px', lineHeight: 1.5 }}>{t('bd_go_further_body')}</p>
 <button type="button" onClick={() => nav('courses')} style={{ fontSize: '14px', color: s.accent, cursor: 'pointer', fontWeight: 500, background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>{t('bd_see_courses')}</button>
 </div>

 <a href='/book?product=basic-diver-sea' onClick={() => fireEvent('booking_click')} style={{ ...bookBtnStyle, display: 'block', textAlign: 'center', fontSize: '15px', padding: '14px 24px' }}>
 {t('nav_book_now')} — €139
 </a>
 </div>
 </div>
 </div>
 </div>
 )
}
