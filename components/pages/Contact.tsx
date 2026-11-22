'use client'
import React, { useState } from 'react'
import { T, s, bookBtnStyle, inputStyle, Breadcrumb, fireEvent, useIsMobile, supabase, type Lang } from './_shared'

export function PageContact({ nav, lang }: { nav: (p: string) => void; lang: Lang }) {
 const t = (key: keyof typeof T) => T[key][lang]
 const isMobile = useIsMobile()
 const [cName, setCName] = useState('')
 const [cEmail, setCEmail] = useState('')
 const [cPhone, setCPhone] = useState('')
 const [cMessage, setCMessage] = useState('')
 const [cAgree, setCAgree] = useState(false)
 const [cTried, setCTried] = useState(false)
 const [cSending, setCSending] = useState(false)
 const [cDone, setCDone] = useState(false)
 const [cSendError, setCSendError] = useState('')
 const emailMissing = cTried && !cEmail.trim()
 const phoneMissing = cTried && !cPhone.trim()
 const agreeMissing = cTried && !cAgree
 const handleContactSend = async () => {
 setCTried(true)
 if (!cEmail.trim() || !cPhone.trim() || !cAgree) return
 setCSending(true)
 setCSendError('')
 const { error } = await supabase.from('support_tickets').insert({
 name: cName.trim() || 'Website visitor',
 email: cEmail.trim(),
 phone: cPhone.trim(),
 message: cMessage.trim(),
 preferred_channel: 'form_submission',
 })
 setCSending(false)
 if (error) { setCSendError(error.message) } else { setCDone(true); fireEvent('contact_submit') }
 }
 return (
 <div style={{ padding: isMobile ? '32px 20px' : '60px 48px', maxWidth: '1000px' }}>
 <Breadcrumb label={t('bc_contact')} homeLabel={t('bc_home')} goHome={() => nav('home')} />
 <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '20px' }}>
 {t('contact_h1')}<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ color: 'var(--text)', fontSize: '16px', lineHeight: 1.7, marginBottom: '16px' }}>
 Marina Pêro de Teive, Quiosque A, 9500-771 Ponta Delgada, São Miguel<br />
 {t('contact_hours')}
 </p>
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
 <a href="https://wa.me/351927382023" target="_blank" rel="noopener noreferrer"
 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#25D366', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '14px', padding: '10px 18px', borderRadius: 0 }}>
 <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
 +351 927 382 023
 </a>
 <a href="mailto:azoresdiving@gmail.com"
 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'color-mix(in srgb, var(--text) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 30%, transparent)', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '14px', padding: '10px 18px', borderRadius: 0 }}>
 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
 azoresdiving@gmail.com
 </a>
 </div>

 <div
 role="note"
 style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'color-mix(in srgb, var(--text) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 15%, transparent)', borderRadius: 0, padding: '13px 18px', marginBottom: '20px', flexWrap: 'wrap' }}
 >
 <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
 {{ EN: 'Want to work with us?', PT: 'Quer trabalhar connosco?', DE: 'Du möchtest bei uns arbeiten?', ES: '¿Quieres trabajar con nosotros?' }[lang]}
 </span>
 <button
 type="button"
 onClick={() => nav('careers')}
 style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: s.accent, fontSize: '14px', fontWeight: 500, fontFamily: s.font, textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, var(--text) 40%, transparent)' }}
 >
 {{ EN: 'Careers & Opportunities ', PT: 'Carreiras & Oportunidades ', DE: 'Karriere & Möglichkeiten ', ES: 'Carreras y Oportunidades ' }[lang]}
 </button>
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '24px' : '28px', alignItems: 'stretch' }}>
 {/* Contact form */}
 <div style={{ background: 'var(--glass)', border: '1px solid color-mix(in srgb, var(--text) 20%, transparent)', borderRadius: 0, padding: '26px' }}>
 <label htmlFor="contact-name" style={{ display: 'block', color: 'var(--text)', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>{t('contact_name')}</label>
 <input id="contact-name" value={cName} onChange={e => setCName(e.target.value)} placeholder={t('contact_name_placeholder')} style={{ ...inputStyle, marginBottom: '14px' }} />
 <label htmlFor="contact-email" style={{ display: 'block', color: 'var(--text)', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>{t('contact_email')}</label>
 <input id="contact-email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="you@email.com"
 style={{ ...inputStyle, marginBottom: emailMissing ? '4px' : '14px', borderColor: emailMissing ? 'var(--text)' : undefined }} />
 {emailMissing && <div role="alert" style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '10px' }}>{t('contact_err_email')}</div>}
 <label htmlFor="contact-phone" style={{ display: 'block', color: 'var(--text)', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>{t('contact_phone')}</label>
 <input id="contact-phone" type="tel" value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder={t('contact_phone_placeholder')}
 style={{ ...inputStyle, marginBottom: phoneMissing ? '4px' : '14px', borderColor: phoneMissing ? 'var(--text)' : undefined }} />
 {phoneMissing && <div role="alert" style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '10px' }}>{t('contact_err_phone')}</div>}
 <label htmlFor="contact-message" style={{ display: 'block', color: 'var(--text)', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>{t('contact_message')}</label>
 <textarea id="contact-message" rows={4} value={cMessage} onChange={e => setCMessage(e.target.value)} placeholder={t('contact_msg_placeholder')} style={{ ...inputStyle, marginBottom: '16px', resize: 'vertical' }} />
 <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: agreeMissing ? '4px' : '18px', userSelect: 'none' }}>
 <input type="checkbox" checked={cAgree} onChange={e => setCAgree(e.target.checked)}
 style={{ marginTop: '2px', accentColor: s.accent, width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }} />
 <span style={{ fontSize: '14px', color: agreeMissing ? 'var(--text)' : 'var(--muted)', lineHeight: 1.5 }}>
 {t('contact_agree_data')}
 <button type="button" onClick={() => nav('privacy')} style={{ color: s.accent, cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, fontFamily: s.font, fontSize: 'inherit' }}>{t('contact_data_policy')}</button>.
 </span>
 </label>
 {agreeMissing && <div style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '14px' }}>{t('contact_err_agree')}</div>}
 {cDone ? (
 <div style={{ background: 'rgba(45,212,160,.08)', border: '1px solid rgba(45,212,160,.3)', borderRadius: 0, padding: '12px 14px', color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}>
 Message received — we&rsquo;ll get back to you shortly.
 </div>
 ) : (
 <>
 {cSendError && <div style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '10px' }}>{cSendError}</div>}
 <button type="button" onClick={handleContactSend} disabled={cSending} style={{ ...bookBtnStyle, cursor: cSending ? 'wait' : 'pointer', opacity: cSending ? 0.7 : 1 }}>
 {cSending ? '…' : t('contact_send')}
 </button>
 </>
 )}
 </div>

 {/* Right column */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
 <div style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--text) 12%, transparent), rgba(188,24,136,.18))', border: '1px solid color-mix(in srgb, var(--text) 30%, transparent)', borderRadius: 0, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
 <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-cta2)" strokeWidth="1.8"/>
 <circle cx="12" cy="12" r="4" stroke="url(#ig-cta2)" strokeWidth="1.8"/>
 <circle cx="17.5" cy="6.5" r="1.2" fill="url(#ig-cta2)"/>
 <defs>
 <linearGradient id="ig-cta2" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
 <stop stopColor="#f09433"/>
 <stop offset="0.25" stopColor="#e6683c"/>
 <stop offset="0.5" stopColor="#dc2743"/>
 <stop offset="0.75" stopColor="#a39e94"/>
 <stop offset="1" stopColor="#a39e94"/>
 </linearGradient>
 </defs>
 </svg>
 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <rect x="2" y="2" width="20" height="20" rx="5" fill="#a39e94"/>
 <path d="M13.5 8.5H12C11.7 8.5 11.5 8.7 11.5 9V10.5H13.5L13.2 12.5H11.5V19H9.5V12.5H8V10.5H9.5V9C9.5 7.3 10.8 6 12.5 6H13.5V8.5Z" fill="var(--text)"/>
 </svg>
 <div style={{ marginLeft: '4px' }}>
 <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text)', lineHeight: 1.3 }}>{t('contact_social_title')}</div>
 <div style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5, marginTop: '2px' }}>{t('contact_social_sub')}</div>
 </div>
 </div>
 <div style={{ display: 'flex', gap: '10px' }}>
 <a href="https://www.instagram.com/azoresdiving_divecenter/" target="_blank" rel="noopener noreferrer"
 style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#a39e94,#a39e94)', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '14px', padding: '10px 14px', borderRadius: 0, whiteSpace: 'nowrap' }}>
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5" stroke="#fff" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1" fill="#fff"/></svg>
 Instagram
 </a>
 <a href="https://www.facebook.com/azoresdiving" target="_blank" rel="noopener noreferrer"
 style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', background: '#a39e94', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '14px', padding: '10px 14px', borderRadius: 0, whiteSpace: 'nowrap' }}>
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5" fill="#a39e94"/><path d="M13.5 8.5H12C11.7 8.5 11.5 8.7 11.5 9V10.5H13.5L13.2 12.5H11.5V19H9.5V12.5H8V10.5H9.5V9C9.5 7.3 10.8 6 12.5 6H13.5V8.5Z" fill="var(--text)"/></svg>
 Facebook
 </a>
 </div>
 </div>

 <div style={{ borderRadius: 0, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--text) 15%, transparent)', flex: 1, minHeight: isMobile ? '200px' : '0' }}>
 <iframe
 src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3155.0857567446237!2d-25.662222424115402!3d37.74113231409725!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xb5cd54af647f69f%3A0xc384e3c9df5f1882!2sAzoresdiving%2FA%C3%A7ordiving%20SSI%2FMares%20Dive%20Center!5e0!3m2!1sen!2spt!4v1787421883500!5m2!1sen!2spt"
 width="100%" height="100%" style={{ border: 0, display: 'block', minHeight: isMobile ? '200px' : '220px' }}
 allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
 />
 </div>
 </div>
 </div>
 </div>
 )
}
