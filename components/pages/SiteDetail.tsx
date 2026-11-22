'use client'
import React, { useState } from 'react'
import { T, s, bookBtnStyle, fireEvent, useIsMobile, type Lang } from './_shared'
import { FULL_SPOTS, FISH_DB } from './Sites'

export function PageSiteDetail({ slug, lang, nav: _nav }: { slug: string; lang: Lang; nav?: (p: string) => void }) {
 const t = (key: keyof typeof T) => T[key][lang]
 const isMobile = useIsMobile()
 const [fishPopup, setFishPopup] = useState<string | null>(null)

 const spot = FULL_SPOTS.find(x => x.id === slug)

 if (!spot) {
 return (
 <div style={{ padding: isMobile ? '32px 20px' : '60px 48px' }}>
 <button type="button" onClick={() => { window.location.href = '/sites' }} style={{ fontSize: '14px', color: s.muted, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>
 {t('sites_back')}
 </button>
 <p style={{ color: s.muted, marginTop: '24px' }}>Site not found.</p>
 </div>
 )
 }

 return (
 <>
 {fishPopup && (() => {
 const fd = FISH_DB[fishPopup]
 return (
 <div onClick={() => setFishPopup(null)} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setFishPopup(null)} aria-label="Close dialog" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
 <div onClick={e => e.stopPropagation()} style={{ background: '#121210', border: '1px solid rgba(243,239,230,0.20)', borderRadius: 0, maxWidth: '360px', width: '100%', overflow: 'hidden', boxShadow: 'none' }}>
 {fd?.img && <img
 src={fd.img}
 alt={fishPopup}
 onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = document.createElement('div'); p.style.cssText = 'width:100%;height:200px;background:linear-gradient(160deg,#121210,#121210);display:flex;align-items:center;justify-content:center;font-size:56px'; p.textContent = ''; el.parentNode?.insertBefore(p, el) }}
 style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block', background: '#121210' }} />}
 <div style={{ padding: '22px 24px 26px' }}>
 <div style={{ fontSize: '18px', fontWeight: 500, color: '#f3efe6', marginBottom: '2px' }}>{fishPopup}</div>
 {fd ? (
 <>
 <div style={{ fontSize: '14px', color: '#c9c2b6', fontStyle: 'italic', marginBottom: '16px' }}>{fd.latin}</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
 <div><span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c9c2b6' }}>{t('sites_fish_habitat')}</span><p style={{ margin: '3px 0 0', fontSize: '14px', color: '#f3efe6', lineHeight: 1.5 }}>{fd.habitat}</p></div>
 <div><span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c9c2b6' }}>{t('sites_fish_diet')}</span><p style={{ margin: '3px 0 0', fontSize: '14px', color: '#f3efe6', lineHeight: 1.5 }}>{fd.diet}</p></div>
 </div>
 </>
 ) : (
 <p style={{ fontSize: '14px', color: '#f3efe6', margin: 0 }}>{t('sites_fish_no_details')}</p>
 )}
 <button onClick={() => setFishPopup(null)} style={{ marginTop: '20px', width: '100%', padding: '10px', borderRadius: 0, border: '1px solid rgba(243,239,230,0.20)', background: 'rgba(243,239,230,0.07)', color: '#c9c2b6', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: s.font }}>{t('sites_fish_close')}</button>
 </div>
 </div>
 </div>
 )
 })()}

 {(spot as any).hero && (
 <div style={{ position: 'relative', width: '100%', height: isMobile ? '220px' : '340px', overflow: 'hidden' }}>
 <img src={(spot as any).hero} alt={(spot as any).heroAlt || spot.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
 <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(255,255,255,.045) 0%, rgba(0,0,0,0.65) 100%)' }} />
 <div style={{ position: 'absolute', bottom: isMobile ? '16px' : '24px', left: isMobile ? '20px' : '48px' }}>
 <h1 style={{ fontSize: isMobile ? '26px' : '38px', fontWeight: 500, letterSpacing: '-0.02em', margin: 0, textShadow: '0 2px 12px rgba(0,0,0,.7)' }}>
 {spot.name}<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ fontSize: '14px', color: 'rgba(255,255,255,.7)', margin: '4px 0 0', fontStyle: 'italic', textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>{(spot.tagline as any)[lang]}</p>
 </div>
 </div>
 )}

 <div style={{ padding: isMobile ? '24px 20px 32px' : '40px 48px 60px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
 <button type="button" onClick={() => { window.location.href = '/sites' }} style={{ fontSize: '14px', color: s.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>
 {t('sites_back')}
 </button>
 <span style={{ color: '#121210', fontSize: '14px' }}>/</span>
 <span style={{ fontSize: '14px', color: s.text }}>{spot.name}</span>
 </div>

 {!(spot as any).hero && (
 <>
 <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '8px' }}>
 {spot.name}<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ fontSize: '15px', color: s.muted, marginBottom: '24px', fontStyle: 'italic' }}>{(spot.tagline as any)[lang]}</p>
 </>
 )}

 <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: s.accent, background: 'rgba(243,239,230,.1)', padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,.25)' }}>{spot.depth}</span>
 <span style={{ fontSize: '14px', fontWeight: 500, color: '#c9c2b6', background: 'rgba(243,239,230,0.08)', padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,0.20)' }}>{spot.type}</span>
 <span style={{ fontSize: '14px', fontWeight: 500, color: '#b7c4b0', background: 'rgba(183,196,176,.08)', padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(183,196,176,.2)' }}>{spot.level} {t('sites_level_req')}</span>
 {(spot as any).beginner && (
 <span style={{ fontSize: '14px', fontWeight: 500, color: '#c9b48a', background: 'rgba(201,180,138,.08)', padding: '4px 12px', borderRadius: 0, border: '1px solid rgba(201,180,138,.25)' }}>{t('sites_beginner_friendly')}</span>
 )}
 <span style={{ fontSize: '14px', color: s.muted, padding: '4px 12px' }}> {(spot.loc as any)[lang]}</span>
 </div>

 <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: (spot as any).images?.length ? '1fr 300px' : '1fr', gap: '40px', alignItems: 'start' }}>
 <div>
 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '10px', maxWidth: '620px', marginBottom: '14px' }}>
 {[
 { label: t('sites_max_depth'), value: (spot as any).maxDepth ?? '—' },
 { label: t('sites_avg_depth'), value: (spot as any).avgDepth ?? '—' },
 { label: t('sites_water_temp'), value: (spot as any).tempRange ?? '—' },
 { label: t('sites_visibility'), value: '7–30 m *' },
 ].map(({ label, value }) => (
 <div key={label} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: isMobile ? '12px 8px' : '14px 12px', textAlign: 'center' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>{label}</div>
 <div style={{ fontSize: isMobile ? '15px' : '17px', fontWeight: 500, color: s.text }}>{value}</div>
 </div>
 ))}
 </div>
 <p style={{ fontSize: '14px', color: '#a39e94', fontStyle: 'italic', marginBottom: '28px', maxWidth: '600px', lineHeight: 1.6 }}>
 {t('sites_vis_note')}
 </p>
 <p style={{ color: '#f3efe6', fontSize: '16.5px', lineHeight: 1.75, maxWidth: '680px', marginBottom: '32px' }}>{(spot.long as any)[lang]}</p>

 <div style={{ background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.15)', borderRadius: 0, padding: '22px 26px', maxWidth: '480px', marginBottom: '32px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '14px' }}>{t('sites_species')}</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
 {spot.fish.map(f => {
 const fishKey = typeof f === 'string' ? f : (f as any).EN
 const fishLabel = typeof f === 'string' ? f : (f as any)[lang]
 return (
 <button key={fishKey} onClick={() => setFishPopup(fishKey)} style={{ fontSize: '14px', color: '#c9c2b6', background: 'rgba(243,239,230,0.08)', padding: '5px 12px', borderRadius: 0, border: '1px solid rgba(243,239,230,0.25)', cursor: 'pointer', fontFamily: s.font }}>{fishLabel}</button>
 )
 })}
 </div>
 </div>

 {(spot as any).review && (
 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '22px 26px', maxWidth: '620px', marginBottom: '32px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '12px' }}>{(spot as any).review.source}</div>
 <p style={{ fontSize: '15px', color: '#f3efe6', lineHeight: 1.7, fontStyle: 'italic', margin: '0 0 12px' }}>&ldquo;{typeof (spot as any).review.quote === 'string' ? (spot as any).review.quote : (spot as any).review.quote[lang]}&rdquo;</p>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.muted }}>— {(spot as any).review.author}</div>
 </div>
 )}

 <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
 {(spot as any).offshore ? (
 // Offshore-Spots (Formigas, Dollabarat) laufen nur in Wetterfenstern und
 // sind nicht direkt buchbar. Ein FareHarbor-Buchungslink wuerde hier einen
 // Platz verkaufen, den es so nicht gibt — stattdessen auf die Warteliste.
 <button type="button" onClick={() => { window.location.href = '/offshore' }} style={bookBtnStyle}>{t('card_cta_join')}</button>
 ) : (
 <a href='/book' onClick={() => fireEvent('booking_click')} style={bookBtnStyle}>{t('sites_book')}</a>
 )}
 <button type="button" onClick={() => { window.location.href = '/sites' }} style={{ ...bookBtnStyle, background: 'transparent', border: '1px solid rgba(243,239,230,.3)', color: s.accent }}>{t('sites_back_all')}</button>
 </div>
 <p style={{ fontSize: '14px', color: '#a39e94', fontStyle: 'italic', marginTop: '16px', maxWidth: '600px', lineHeight: 1.6 }}>
 {t('sites_dynamic_note')}
 </p>
 </div>

 {(spot as any).images?.length > 0 && (
 <div style={isMobile ? { display: 'flex', gap: '8px', overflowX: 'auto', margin: '24px 0 0', paddingBottom: '4px' } : { display: 'flex', flexDirection: 'column', gap: '10px', position: 'sticky', top: '20px' }}>
 {(spot as any).images.map((src: string, i: number) => (
 <div key={i} style={isMobile
 ? { flex: '0 0 72vw', height: '180px', borderRadius: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }
 : { borderRadius: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', aspectRatio: '4/3' }}>
 <img src={src} alt={(spot as any).imagesAlt?.[i] ?? `${spot.name} ${i + 2}`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </>
 )
}
