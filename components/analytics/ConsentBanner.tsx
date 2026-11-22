'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Globaler Consent-Dialog (in app/layout.tsx eingebunden).
 *  - Erscheint automatisch NUR auf /book (dort gibt es den Banner aus app/client.tsx nicht — wer /book per Mail/Link öffnet,
 *    muss zustimmen können). Auf allen anderen Seiten übernimmt beim ersten Besuch weiter der Banner aus app/client.tsx.
 *  - Öffnet sich zusätzlich überall, wenn im Footer „Cookie settings" geklickt wird (Event `azd:open-consent`) →
 *    Entscheidung jederzeit änderbar (DSGVO Art. 7 Abs. 3: Widerruf so einfach wie die Einwilligung).
 *  - Gleicher localStorage-Key wie app/client.tsx (`azd_cookie_consent`); feuert nach jeder Entscheidung `azd:consent`
 *    (GA4 + Clarity laden daraufhin sofort).
 *  - Widerruf nach vorheriger Zustimmung: GA-/Clarity-Cookies werden gelöscht und die Seite neu geladen,
 *    damit die bereits geladenen Skripte nicht weiterlaufen.
 */
type Lang = 'EN' | 'PT' | 'DE' | 'ES'
const KEY = 'azd_cookie_consent'

const TXT: Record<Lang, { title: string; desc: string; more: string; reject: string; accept: string; current: string; on: string; off: string }> = {
  EN: {
    title: 'We use cookies',
    desc: 'We use Google Analytics and Microsoft Clarity to understand how visitors use our site. Analytics cookies are only set after you accept. You can change your choice at any time.',
    more: 'Privacy Policy', reject: 'Reject non-essential', accept: 'Accept all',
    current: 'Your current choice:', on: 'accepted', off: 'rejected',
  },
  PT: {
    title: 'Utilizamos cookies',
    desc: 'Utilizamos o Google Analytics e o Microsoft Clarity para compreender como os visitantes usam o nosso site. Os cookies de análise só são ativados após a sua aceitação. Pode alterar a sua escolha a qualquer momento.',
    more: 'Política de Privacidade', reject: 'Rejeitar não essenciais', accept: 'Aceitar tudo',
    current: 'A sua escolha atual:', on: 'aceites', off: 'rejeitados',
  },
  DE: {
    title: 'Wir verwenden Cookies',
    desc: 'Wir verwenden Google Analytics und Microsoft Clarity, um zu verstehen, wie Besucher unsere Website nutzen. Analytics-Cookies werden nur nach deiner Zustimmung gesetzt. Du kannst deine Entscheidung jederzeit ändern.',
    more: 'Datenschutzerklärung', reject: 'Nicht notwendige ablehnen', accept: 'Alle akzeptieren',
    current: 'Deine aktuelle Auswahl:', on: 'akzeptiert', off: 'abgelehnt',
  },
  ES: {
    title: 'Usamos cookies',
    desc: 'Utilizamos Google Analytics y Microsoft Clarity para entender cómo los visitantes usan nuestro sitio. Las cookies de análisis solo se activan tras su aceptación. Puede cambiar su elección en cualquier momento.',
    more: 'Política de Privacidad', reject: 'Rechazar no esenciales', accept: 'Aceptar todo',
    current: 'Su elección actual:', on: 'aceptadas', off: 'rechazadas',
  },
}

const FONT = `var(--font-geist-sans), sans-serif`

function readLang(): Lang {
  const m = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/)
  const v = (m?.[1] ?? 'EN').toUpperCase()
  return v === 'PT' || v === 'DE' || v === 'ES' ? v : 'EN'
}

// GA4 + Clarity Cookies löschen (alle üblichen Domain-Varianten)
function clearTrackingCookies() {
  const names = document.cookie.split(';').map(c => c.split('=')[0].trim())
    .filter(n => /^(_ga|_ga_.+|_gid|_gat.*|_clck|_clsk|CLID|ANONCHK|MR|MUID|SM)$/.test(n))
  const host = location.hostname
  const parts = host.split('.')
  const root = parts.length > 2 ? parts.slice(-2).join('.') : host
  const domains = [undefined, host, '.' + host, root, '.' + root]
  for (const n of names) for (const d of domains) {
    document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ''}`
  }
}

export default function ConsentBanner() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [lang, setLang] = useState<Lang>('EN')
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY)
      setCurrent(stored)
      // Ohne Zustimmung dürfen keine Tracking-Cookies stehen (Reste von früher oder vom Widerruf-Reload) → löschen
      if (stored !== 'accepted') clearTrackingCookies()
      if (!stored && pathname?.startsWith('/book')) { setLang(readLang()); setShow(true) }
    } catch { /* localStorage gesperrt → kein Banner, kein Tracking */ }
  }, [pathname])

  useEffect(() => {
    const open = () => {
      try { setCurrent(localStorage.getItem(KEY)) } catch { setCurrent(null) }
      setLang(readLang())
      setShow(true)
    }
    window.addEventListener('azd:open-consent', open)
    return () => window.removeEventListener('azd:open-consent', open)
  }, [])

  function choose(value: 'accepted' | 'rejected') {
    let prev: string | null = null
    try {
      prev = localStorage.getItem(KEY)
      localStorage.setItem(KEY, value)
      window.dispatchEvent(new Event('azd:consent'))
    } catch { /* ignore */ }
    setShow(false)
    if (value === 'rejected' && prev === 'accepted') {
      // GA schreibt sein _ga_<id>-Cookie beim Verlassen der Seite neu → vorher abschalten; nach dem Reload räumt der Mount-Effekt nach
      ;(window as unknown as Record<string, unknown>)['ga-disable-G-343HZE66Z7'] = true
      clearTrackingCookies()
      window.location.reload()
    }
  }

  if (!show) return null
  const t = TXT[lang]
  return (
    <div role="dialog" aria-label={t.title} style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999,
      background: 'linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(0,0,0,.88) 100%)', borderTop: '1px solid rgba(255,255,255,.14)',
      backdropFilter: 'blur(16px)', padding: '18px 24px',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', fontFamily: FONT,
    }}>
      <div style={{ flex: 1, minWidth: '260px' }}>
        <span style={{ fontWeight: 500, color: '#f3efe6', fontSize: '14px' }}>{t.title} </span>
        <span style={{ color: '#c9c2b6', fontSize: '14px', lineHeight: 1.55 }}>{t.desc} </span>
        <a href="/privacy" style={{ color: '#f3efe6', fontSize: '14px', textDecoration: 'underline' }}>{t.more}</a>
        {current && (
          <div style={{ color: '#c9c2b6', fontSize: '13px', marginTop: '6px' }}>
            {t.current} <strong style={{ color: '#f3efe6' }}>{current === 'accepted' ? t.on : t.off}</strong>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
        <button type="button" onClick={() => choose('rejected')} style={{
          padding: '10px 18px', borderRadius: 0, border: '1px solid rgba(255,255,255,.2)',
          background: 'transparent', color: '#c9c2b6', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: FONT,
        }}>{t.reject}</button>
        <button type="button" onClick={() => choose('accepted')} style={{
          padding: '10px 20px', borderRadius: 0, border: '1px solid #f3efe6',
          background: '#f3efe6', color: '#000',
          fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: FONT,
        }}>{t.accept}</button>
      </div>
    </div>
  )
}
