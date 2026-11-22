'use client'
import React, { useState } from 'react'
import { T, s, bookBtnStyle, inputStyle, Breadcrumb, fireEvent, useIsMobile, supabase, type Lang } from './_shared'


export function PageFormigas({ nav, lang }: { nav: (p: string) => void; lang: Lang }) {
  const t = (key: keyof typeof T) => T[key][lang]
  const isMobile = useIsMobile()
  const [waitEmail, setWaitEmail] = useState('')
  const [waitLoading, setWaitLoading] = useState(false)
  const [waitDone, setWaitDone] = useState(false)
  const [waitError, setWaitError] = useState('')
  const handleWaitlist = async () => {
    if (!waitEmail.trim() || waitLoading) return
    setWaitLoading(true)
    setWaitError('')
    const { error } = await supabase.from('formigas_waitlist').insert({ email: waitEmail.trim(), lang })
    setWaitLoading(false)
    if (error) { setWaitError(error.message) } else { setWaitDone(true); fireEvent('formigas_waitlist') }
  }
  return (
    <div style={{ padding: isMobile ? '32px 20px' : '60px 48px' }}>
      <Breadcrumb label={t('bc_formigas')} homeLabel={t('bc_home')} goHome={() => nav('home')} />
      <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 900, letterSpacing: '-.01em', marginBottom: '20px' }}>
        {t('formigas_h1')}<span style={{ color: s.accent }}>.</span>
      </h1>
      <p style={{ color: '#cfe2f4', fontSize: '17px', maxWidth: '620px', lineHeight: 1.65, marginBottom: '28px' }}>
        {t('formigas_intro')}
      </p>

      {/* Photo grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '5px', borderRadius: '14px', overflow: 'hidden', margin: '0 0 28px', height: isMobile ? 'auto' : '240px' }}>
        {[
          { url: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/Mobula.webp', latin: 'Mobula birostris', name: 'Giant Devil Ray' },
          { url: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/Dusky_Grouper.webp', latin: 'Epinephelus marginatus', name: 'Dusky Grouper' },
          { url: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/greater-amberjack.webp', latin: 'Seriola dumerili', name: 'Greater Amberjack' },
        ].map(fish => (
          <div key={fish.name} style={{ backgroundImage: `url('${fish.url}')`, backgroundSize: 'cover', backgroundPosition: 'center 40%', position: 'relative', height: isMobile ? '160px' : '100%' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 38%, rgba(2,8,22,.82))' }} />
            <div style={{ position: 'absolute', bottom: '13px', left: '14px', right: '14px', color: '#fff' }}>
              <div style={{ fontSize: '9px', letterSpacing: '.2em', textTransform: 'uppercase', opacity: .7, fontWeight: 600, marginBottom: '3px' }}>{fish.latin}</div>
              <div style={{ fontSize: '14px', fontWeight: 800, textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>{fish.name}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '10px', marginBottom: '40px' }}>
        {[
          { label: t('formigas_price_label'), value: '€255', sub: t('formigas_stat_price_sub') },
          { label: t('formigas_stat_crossing'), value: t('formigas_stat_crossing_val'), sub: t('formigas_stat_crossing_sub') },
          { label: t('formigas_stat_distance'), value: '42 nm', sub: t('formigas_stat_distance_sub') },
          { label: t('formigas_stat_season'), value: t('formigas_stat_season_val'), sub: t('formigas_stat_season_sub') },
          { label: t('formigas_stat_level'), value: t('formigas_stat_level_val'), sub: t('formigas_stat_level_sub') },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: 'rgba(10,33,61,.6)', border: '1px solid rgba(53,208,255,.15)', borderRadius: '12px', padding: '16px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: s.muted, textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: '6px', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '11px', color: s.muted, marginTop: '5px' }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? '32px' : '48px', alignItems: 'start' }}>
        {/* Left: main content */}
        <div>
          <p style={{ color: '#b9cde3', fontSize: '14.5px', lineHeight: 1.75, marginBottom: '32px' }}>
            {t('formigas_conditions_p')}
          </p>

          <div style={{ marginBottom: '32px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: s.accent, marginBottom: '14px' }}>{t('formigas_exp_title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(['formigas_exp1', 'formigas_exp2', 'formigas_exp3', 'formigas_exp4'] as const).map(key => (
                <div key={key} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ color: s.accent, fontWeight: 900, fontSize: '16px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>✓</span>
                  <span style={{ fontSize: '14.5px', color: '#cfe2f4', lineHeight: 1.5 }}>{t(key)}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '12.5px', color: s.muted, fontStyle: 'italic', marginTop: '12px', lineHeight: 1.6 }}>
              {t('formigas_exp_note')}
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px', padding: '22px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: s.muted, marginBottom: '16px' }}>{t('formigas_path_title')}</div>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '16px' : '0', alignItems: isMobile ? 'stretch' : 'center' }}>
              {[
                { step: t('formigas_path1_step'), desc: t('formigas_path1_desc'), hasLink: false },
                { step: t('formigas_path2_step'), desc: t('formigas_path2_desc'), hasLink: true },
                { step: t('formigas_path3_step'), desc: t('formigas_path3_desc'), hasLink: true },
              ].map(({ step, desc, hasLink }, i) => (
                <div key={step} style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: '12px', flex: 1 }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(53,208,255,.08)', border: '1px solid rgba(53,208,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: s.accent, flexShrink: 0, textAlign: 'center', lineHeight: 1.3, padding: '8px' }}>{step}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: '#9fc4da', lineHeight: 1.55 }}>{desc}</div>
                    {hasLink && (
                      <button onClick={() => nav('courses')} style={{ marginTop: '5px', color: s.accent, background: 'none', border: 'none', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: s.font, textDecoration: 'underline' }}>
                        → Offshore Prep course details
                      </button>
                    )}
                  </div>
                  {i < 2 && !isMobile && <div style={{ fontSize: '18px', color: 'rgba(53,208,255,.2)', margin: '0 8px', flexShrink: 0 }}>→</div>}
                </div>
              ))}
            </div>
            <p style={{ fontSize: '12.5px', color: s.muted, fontStyle: 'italic', marginTop: '14px', lineHeight: 1.6 }}>
              {t('formigas_path_note')}
            </p>
          </div>

          <div style={{ marginTop: '36px', borderLeft: '3px solid rgba(53,208,255,.5)', paddingLeft: '20px' }}>
            <p style={{ fontSize: '15px', color: '#cfe2f4', lineHeight: 1.7, margin: '0 0 10px', fontStyle: 'italic' }}>
              &ldquo;{t('formigas_review_q')}&rdquo;
            </p>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: s.accent }}>{t('formigas_review_author')}</div>
              <div style={{ fontSize: '11.5px', color: s.muted }}>Google Reviews ★★★★★</div>
            </div>
          </div>
        </div>

        {/* Right: sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'rgba(255,200,80,.07)', border: '1px solid rgba(255,200,80,.2)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: '#ffd080', marginBottom: '14px' }}>{t('formigas_requirements_title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#e8d9a0', marginBottom: '5px' }}>{t('formigas_req_label1')}</div>
                <p style={{ fontSize: '13px', color: '#c8b97a', lineHeight: 1.6, margin: 0 }}>{t('formigas_req_p1')}</p>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,200,80,.15)', paddingTop: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#e8d9a0', marginBottom: '5px' }}>{t('formigas_req_label2')}</div>
                <p style={{ fontSize: '13px', color: '#c8b97a', lineHeight: 1.6, margin: 0 }}>{t('formigas_req_p2')}</p>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: s.muted, marginBottom: '12px' }}>{t('formigas_incl_title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(['formigas_incl1', 'formigas_incl2', 'formigas_incl3', 'formigas_incl4'] as const).map(key => (
                <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ color: s.accent, fontSize: '13px', lineHeight: 1.4, flexShrink: 0 }}>—</span>
                  <span style={{ fontSize: '13.5px', color: '#9fc4da', lineHeight: 1.45 }}>{t(key)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: s.muted, marginBottom: '12px' }}>{t('formigas_notincl_title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(['formigas_notincl1', 'formigas_notincl2'] as const).map(key => (
                <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ color: s.muted, fontSize: '13px', lineHeight: 1.4, flexShrink: 0 }}>—</span>
                  <span style={{ fontSize: '13.5px', color: '#9fc4da', lineHeight: 1.45 }}>{t(key)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(53,208,255,.04)', border: '1px solid rgba(53,208,255,.15)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#e8f4ff', marginBottom: '6px' }}>{t('formigas_join')}</div>
            <p style={{ color: s.muted, fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}>{t('formigas_waitlist_sub')}</p>
            {waitDone ? (
              <div style={{ background: 'rgba(45,212,160,.08)', border: '1px solid rgba(45,212,160,.3)', borderRadius: '8px', padding: '12px 14px', color: '#2dd4a0', fontSize: '13.5px', fontWeight: 600 }}>
                ✓ You&rsquo;re on the list — we&rsquo;ll notify you when a window opens.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="email"
                  value={waitEmail}
                  onChange={e => setWaitEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleWaitlist()}
                  placeholder="you@email.com"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                />
                {waitError && <div style={{ color: '#ff8080', fontSize: '11.5px' }}>{waitError}</div>}
                <button
                  type="button"
                  onClick={handleWaitlist}
                  disabled={waitLoading}
                  style={{ ...bookBtnStyle, display: 'block', textAlign: 'center', opacity: waitLoading ? 0.7 : 1, cursor: waitLoading ? 'wait' : 'pointer' }}
                >
                  {waitLoading ? '…' : t('formigas_join')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
