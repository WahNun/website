'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Google Analytics 4 — lädt erst NACH Zustimmung (localStorage `azd_cookie_consent` = 'accepted').
 * Vorher: kein gtag.js, kein Request an Google, keine Cookies.
 * Consent kommt vom Banner in app/client.tsx bzw. components/analytics/ConsentBanner.tsx (/book);
 * beide feuern nach der Entscheidung das Event `azd:consent`.
 * `window.gtag` existiert erst nach Zustimmung — die Helfer in client.tsx / _shared.tsx rufen es mit `?.()` auf.
 */
const GA_ID = 'G-343HZE66Z7'

export default function GoogleAnalyticsConsent() {
  const pathname = usePathname()
  const loaded = useRef(false)

  useEffect(() => {
    const tryLoad = () => {
      try {
        if (loaded.current) return
        if (localStorage.getItem('azd_cookie_consent') !== 'accepted') return
        loaded.current = true
        const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void }
        w.dataLayer = w.dataLayer || []
        w.gtag = function () { (w.dataLayer as unknown[]).push(arguments) }
        const s = document.createElement('script')
        s.async = true
        s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
        document.head.appendChild(s)
        w.gtag('js', new Date())
        // Back-Office (/members): keine automatischen Seitenaufrufe, nur Events — wie bisher
        if (window.location.pathname.startsWith('/members')) w.gtag('config', GA_ID, { send_page_view: false })
        else w.gtag('config', GA_ID)
      } catch (e) { console.warn('[ga4] init failed', e) }
    }
    tryLoad()
    window.addEventListener('azd:consent', tryLoad)
    return () => window.removeEventListener('azd:consent', tryLoad)
  }, [pathname])

  return null
}
