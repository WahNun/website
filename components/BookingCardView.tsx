'use client'
import React from 'react'

/** Vom Server (/api/chat) erzeugte Karte mit der vorbereiteten Buchung. Nur Anzeige: der Knopf oeffnet /book, bezahlt wird erst dort nach Bestaetigung. */
export type BookingCardData = {
 kind: 'book' | 'request'
 title: string
 product: string
 date: string | null
 session: 'AM' | 'PM' | null
 /** Alle Tauchtage eines Dive-Packs (nur wenn mehr als einer) */
 days?: { date: string; session: 'AM' | 'PM' }[]
 divers: string[]
 refresher_date: string | null
 equipment: boolean
 insurance: 'own' | 'azd' | null
 button: string
 url: string
}

/** Nur Links auf die /book-Seite akzeptieren (http/https, Pfad /book) — nie ein beliebiges Ziel aus der API-Antwort oeffnen. */
export function safeBookUrl(url: unknown): string | null {
 if (typeof url !== 'string') return null
 try {
 const u = new URL(url)
 if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.pathname !== '/book' && u.pathname !== '/dive-os/book') return null
 const h = u.hostname
 const own = typeof window !== 'undefined' ? window.location.hostname : ''
 if (!(h === 'azoresdiving.com' || h.endsWith('.azoresdiving.com') || h === 'localhost' || (own && h === own))) return null
 return u.toString()
 } catch { return null }
}

export function asBookingCard(v: unknown): BookingCardData | null {
 if (!v || typeof v !== 'object') return null
 const c = v as Partial<BookingCardData>
 if ((c.kind !== 'book' && c.kind !== 'request') || typeof c.product !== 'string' || !safeBookUrl(c.url)) return null
 return {
 kind: c.kind, title: String(c.title ?? ''), product: c.product,
 date: typeof c.date === 'string' ? c.date : null,
 session: c.session === 'AM' || c.session === 'PM' ? c.session : null,
 ...(Array.isArray(c.days) && c.days.length > 1 ? { days: c.days.slice(0, 20).filter(d => d && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && (d.session === 'AM' || d.session === 'PM')).map(d => ({ date: d.date, session: d.session })) } : {}),
 divers: Array.isArray(c.divers) ? c.divers.map(String).slice(0, 20) : [],
 refresher_date: typeof c.refresher_date === 'string' ? c.refresher_date : null,
 equipment: Boolean(c.equipment),
 insurance: c.insurance === 'own' || c.insurance === 'azd' ? c.insurance : null,
 button: String(c.button ?? 'Open'), url: safeBookUrl(c.url)!,
 }
}

export default function BookingCardView({ card }: { card: BookingCardData }) {
 const url = safeBookUrl(card.url)
 if (!url) return null
 const rows: Array<[string, string]> = [
 ['Product', card.product],
 ...(card.days && card.days.length > 1 ? [[card.kind === 'request' ? 'Preferred days' : 'Dive days', card.days.map(d => `${d.date} ${d.session === 'AM' ? 'morning' : 'afternoon'}`).join(' · ')] as [string, string]] : card.date ? [[card.kind === 'request' ? 'Preferred date' : 'Date', card.date + (card.session ? ` · ${card.session === 'AM' ? 'morning' : 'afternoon'}` : '')] as [string, string]] : []),
 ['Divers', card.divers.join(', ')],
 ...(card.refresher_date ? [['Scuba Skills Update', card.refresher_date] as [string, string]] : []),
 ['Equipment', card.equipment ? 'rental included' : 'none'],
 ...(card.insurance ? [['Insurance', card.insurance === 'azd' ? 'via Azores Diving' : 'own'] as [string, string]] : []),
 ]
 return (
 <div style={{ maxWidth: '88%', border: '1px solid rgba(243,239,230,.35)', background: 'rgba(243,239,230,.07)', borderRadius: 14, padding: '12px 14px', fontSize: 13 }}>
 <div style={{ fontWeight: 700, marginBottom: 8 }}>{card.title}</div>
 <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 3, marginBottom: 10 }}>
 {rows.map(([k, v]) => (<React.Fragment key={k}><span style={{ opacity: .65 }}>{k}</span><span>{v}</span></React.Fragment>))}
 </div>
 <a href={url} target="_blank" rel="noopener noreferrer"
 style={{ display: 'inline-block', background: '#f3efe6', color: '#090909', fontWeight: 700, padding: '9px 14px', borderRadius: 10, textDecoration: 'none' }}>
 {card.button} 
 </a>
 <div style={{ fontSize: 11.5, opacity: .65, marginTop: 8 }}>
 {card.kind === 'request' ? 'You check everything on the next page before sending. Nothing is paid now.' : 'You check and correct everything on the next page. Payment only happens there, after you confirm.'}
 </div>
 </div>
 )
}
