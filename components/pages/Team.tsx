'use client'
import React, { useState, useEffect } from 'react'
import { T, s, Breadcrumb, useIsMobile, supabase, TEAM, LANG_FLAG, type Lang } from './_shared'

const WORK_WITH_US = {
  title: { EN: 'Work with us', PT: 'Trabalhe connosco', DE: 'Arbeite mit uns', ES: 'Trabaja con nosotros' },
  body:  { EN: 'Internships, placements and season jobs — see Careers & Opportunities.', PT: 'Estágios, colocações e empregos sazonais — consulte Carreiras & Oportunidades.', DE: 'Praktika, Stellen und Saisonjobs — siehe Karriere & Möglichkeiten.', ES: 'Prácticas, colocaciones y empleos de temporada — consulta Carreras y Oportunidades.' },
  link:  { EN: 'Careers & Opportunities →', PT: 'Carreiras & Oportunidades →', DE: 'Karriere & Möglichkeiten →', ES: 'Carreras y Oportunidades →' },
}

export function PageTeam({ nav, lang }: { nav: (p: string) => void; lang: Lang }) {
  const t = (key: keyof typeof T) => T[key][lang]
  const isMobile = useIsMobile()
  const [profileLangs, setProfileLangs] = useState<Record<string, string[]>>({})

  useEffect(() => {
    supabase.from('profiles').select('name, langs').eq('is_public', true)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, string[]> = {}
        for (const row of data) {
          if (row.name && Array.isArray(row.langs) && row.langs.length > 0) {
            map[row.name] = row.langs.map((c: string) => LANG_FLAG[c] || '').filter(Boolean)
          }
        }
        setProfileLangs(map)
      })
  }, [])

  return (
    <div style={{ padding: isMobile ? '32px 20px' : '60px 48px' }}>
      <Breadcrumb label={t('bc_team')} homeLabel={t('bc_home')} goHome={() => nav('home')} />
      <h1 style={{ fontSize: 'clamp(28px,4vw,48px)', fontWeight: 900, letterSpacing: '-.01em', marginBottom: '14px' }}>
        {t('team_h1')}<span style={{ color: s.accent }}>.</span>
      </h1>
      <p style={{ color: s.accent, fontSize: 'clamp(16px,2vw,20px)', fontWeight: 600, lineHeight: 1.5, marginBottom: '20px' }}>
        {t('team_intro')}
      </p>
      <p style={{ color: '#cfe2f4', fontSize: '16px', lineHeight: 1.8, marginBottom: '16px' }}>
        {t('team_p1')}
      </p>
      <p style={{ color: '#cfe2f4', fontSize: '16px', lineHeight: 1.8, marginBottom: '16px' }}>
        {t('team_p2')}
      </p>
      <p style={{ color: '#cfe2f4', fontSize: '16px', lineHeight: 1.8, marginBottom: '28px' }}>
        {t('team_p3')}
      </p>

      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: s.muted, marginBottom: '12px' }}>{t('team_languages')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '40px' }}>
        {[['🇬🇧','English'],['🇵🇹','Português'],['🇩🇪','Deutsch'],['🇪🇸','Español'],['🇫🇷','Français'],['🇨🇿','Čeština']].map(([flag, spokenLang]) => (
          <div key={spokenLang} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(243,239,230,.08)', border: '1px solid rgba(243,239,230,.18)', borderRadius: '999px', padding: '6px 14px' }}>
            <span style={{ fontSize: '18px', lineHeight: 1 }}>{flag}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#d0eaff' }}>{spokenLang}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '16px' }}>
        {TEAM.map((member, i) => (
          <div key={`${member.name}-${i}`} style={{ background: 'rgba(10,33,61,.5)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '100%' }}>
              <img
                src={member.photo}
                alt={member.name}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
              />
            </div>
            <div style={{ padding: '14px 16px' }}>
              <b>{member.name}</b>
              <div style={{ fontSize: '12px', color: s.muted, marginBottom: '6px' }}>{member.role}</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {(profileLangs[member.name] && profileLangs[member.name].length > 0 ? profileLangs[member.name] : member.langs).map((flag, j) => (
                  <span key={j} style={{ fontSize: '16px', lineHeight: 1 }}>{flag}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Work with us */}
      <div style={{ marginTop: '48px', background: 'rgba(243,239,230,.06)', border: '1px solid rgba(243,239,230,.15)', borderRadius: '14px', padding: '24px 28px' }}>
        <b style={{ color: '#f3efe6', fontSize: '17px', display: 'block', marginBottom: '8px' }}>
          {WORK_WITH_US.title[lang]}
        </b>
        <p style={{ color: s.muted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 12px' }}>
          {WORK_WITH_US.body[lang]}
        </p>
        <a href="/careers" style={{ color: s.accent, fontSize: '14px', fontWeight: 600, textDecoration: 'none', fontFamily: s.font }}>
          {WORK_WITH_US.link[lang]}
        </a>
      </div>
    </div>
  )
}
