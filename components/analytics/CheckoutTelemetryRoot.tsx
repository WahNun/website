'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { track, flushTelemetry, resetCheckoutSession } from '@/lib/telemetry/checkout'

/**
 * Sitzt im Root-Layout und erledigt zwei Dinge:
 *  1. Microsoft Clarity (Heatmaps / Session Recordings) — nur mit Cookie-Consent
 *     (localStorage `azd_cookie_consent` = 'accepted'), nie im Members-Bereich
 *     und nie im Check-in (Gesundheitsdaten).
 *  2. Rückkehr von Stripe: /checkin/start?session_id=… → payment_succeeded,
 *     /?checkout=cancelled → payment_cancelled. Beide an die Checkout-Session
 *     aus sessionStorage gekoppelt.
 */
export default function CheckoutTelemetryRoot() {
  const pathname = usePathname()
  const search = useSearchParams()
  const clarityLoaded = useRef(false)

  // ── 1. Clarity ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
    if (!id || !/^[a-z0-9]{6,20}$/i.test(id)) return
    const blocked = (p: string | null) => !p || p.startsWith('/members') || p.startsWith('/checkin') || p.startsWith('/auth')

    const tryLoad = () => {
      try {
        if (clarityLoaded.current) return true
        if (blocked(pathname)) return false
        if (localStorage.getItem('azd_cookie_consent') !== 'accepted') return false
        const w = window as unknown as { clarity?: unknown }
        if (w.clarity) { clarityLoaded.current = true; try { (w.clarity as (...a: unknown[]) => void)('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }) } catch { /* ignore */ } return true }
        // Offizieller Clarity-Snippet
        const s = document.createElement('script')
        s.async = true
        s.src = `https://www.clarity.ms/tag/${id}`
        s.onerror = () => console.warn('[clarity] script failed to load')
        ;(window as unknown as { clarity: (...a: unknown[]) => void }).clarity = function (...args: unknown[]) {
          const c = (window as unknown as { clarity: { q?: unknown[] } }).clarity
          ;(c.q = c.q || []).push(args)
        }
        // Seit 31.10.2025 verlangt Clarity für Besucher aus EWR/UK/CH ein Consent-Signal (Standard: denied → keine Cookies,
        // nur eingeschränkte Daten). Der Besucher hat im Banner „accepted" gewählt → Analytics erlaubt, Werbung nicht.
        // Wird in die Queue gelegt, bevor das Skript lädt.
        ;(window as unknown as { clarity: (...a: unknown[]) => void }).clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' })
        document.head.appendChild(s)
        clarityLoaded.current = true
        return true
      } catch (e) { console.warn('[clarity] init failed', e); return false }
    }
    if (tryLoad()) return
    // Banner auf /book (components/analytics/ConsentBanner.tsx) feuert `azd:consent` → sofort laden, auch nach >2 Min
    const onConsent = () => { tryLoad() }
    window.addEventListener('azd:consent', onConsent)
    // Consent kann nach dem ersten Render kommen (Banner) — kurz nachsehen, dann aufhören
    const t = setInterval(() => { if (tryLoad()) clearInterval(t) }, 2000)
    const stop = setTimeout(() => clearInterval(t), 120_000)
    return () => { clearInterval(t); clearTimeout(stop); window.removeEventListener('azd:consent', onConsent) }
  }, [pathname])

  // ── 2. Rückkehr von Stripe ────────────────────────────────────────────
  useEffect(() => {
    try {
      if (pathname === '/checkin/start') {
        const stripeSession = search.get('session_id')
        if (!stripeSession) return
        const key = `azd_ct_done_${stripeSession}`
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
        track('payment_succeeded', { step: 'payment_succeeded', payload: { stripe_session_id: stripeSession.slice(0, 120), ...(search.get('src') === 'fo' ? { channel: 'front_office' } : {}) } })
        flushTelemetry(false)
        resetCheckoutSession()
      } else if (pathname === '/' && search.get('checkout') === 'cancelled') {
        const key = 'azd_ct_cancelled'
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
        track('payment_cancelled', { payload: {} })
        flushTelemetry(false)
        try { sessionStorage.removeItem('azd_ct_redirected') } catch { /* ignore */ }
      } else {
        try { sessionStorage.removeItem('azd_ct_cancelled') } catch { /* ignore */ }
      }
    } catch (e) { console.warn('[telemetry] return tracking failed', e) }
  }, [pathname, search])

  return null
}
