'use client'

/** Footer-Link „Cookie settings" — öffnet den Consent-Dialog (components/analytics/ConsentBanner.tsx) erneut. */
const LABEL: Record<string, string> = {
  EN: 'Cookie settings', PT: 'Definições de cookies', DE: 'Cookie-Einstellungen', ES: 'Configuración de cookies',
}

export default function CookieSettingsButton({ lang }: { lang: string }) {
  return (
    <button
      type="button"
      className="azd-footer-privacy"
      onClick={() => window.dispatchEvent(new Event('azd:open-consent'))}
      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '12px' }}
    >
      {LABEL[lang] ?? LABEL.EN}
    </button>
  )
}
