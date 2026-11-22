'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase, s } from './_shared'
import CsvButton from '@/components/finance/CsvButton'
import { csvFileName, methodKey, METHOD_LABEL, type Table } from '@/lib/financeReports'

// Finances → History: alle Geldbewegungen (eingegangene Zahlungen, Refunds, Umbuchungen), neueste zuerst.
// view: 'all' = alles, 'payments' = nur eingegangene Zahlungen, 'cash' = nur Bargeld (rein und raus).
type Row = {
  key: string; ts: string; kind: 'in' | 'out' | 'move'; amount: number; method: string
  booking_id: string; customer: string | null; product: string | null; is_test: boolean
  by: string | null; byIsEmail: boolean; note: string | null; label: string
}
const PAGE = 25
const ML: Record<string, string> = { cash: '💵 Cash', bank_transfer: '🏦 Bank transfer', bank: '🏦 Bank transfer', card: '💳 Card', stripe: '💳 Stripe', revolut: '⚡ Revolut', mb_way: '📱 MB WAY', on_arrival: '🛬 On arrival', transfer: '↔ Moved', other: '📋 Other' }
const eur = (c: number) => `€${(Math.abs(c) / 100).toFixed(2)}`

export default function FinanceMovements({ view, simulationMode, who, onOpenBooking }: {
  view: 'all' | 'payments' | 'cash'
  simulationMode: boolean | null
  who: ((e: string | null | undefined) => string) & { id: (id: string | null | undefined) => string | null }
  onOpenBooking: (id: string) => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [page, setPage] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (simulationMode === null) return
    let cancelled = false
    setLoading(true); setError(null)
    ;(async () => {
      let pq = supabase.from('booking_payments')
        .select('id, booking_id, amount, status, method, paid_at, created_at, notes, recorded_by, bookings!inner(customer_name, product_name, is_test)')
        .eq('status', 'paid').eq('bookings.is_test', simulationMode)
        .order('paid_at', { ascending: false, nullsFirst: false }).limit(1000)
      let rq = supabase.from('booking_refunds')
        .select('id, booking_id, amount, method, status, description, requested_at, requested_by_email, authorized_by_email, paid_at, is_test, bookings(customer_name, product_name)')
        .neq('status', 'requested').eq('is_test', simulationMode)
        .order('paid_at', { ascending: false, nullsFirst: false }).limit(1000)
      if (month) {
        const [y, m] = month.split('-').map(Number)
        const a = new Date(Date.UTC(y, m - 1, 1)).toISOString(), b = new Date(Date.UTC(y, m, 1)).toISOString()
        pq = pq.gte('paid_at', a).lt('paid_at', b); rq = rq.gte('paid_at', a).lt('paid_at', b)
      }
      const [pr, rr] = await Promise.all([view === 'all' || view === 'payments' || view === 'cash' ? pq : Promise.resolve({ data: [], error: null } as never), view === 'payments' ? Promise.resolve({ data: [], error: null } as never) : rq])
      if (cancelled) return
      const pErr = (pr as { error: { message: string } | null }).error, rErr = (rr as { error: { message: string } | null }).error
      if (pErr || rErr) { setError([pErr && `Payments: ${pErr.message}`, rErr && `Refunds: ${rErr.message}`].filter(Boolean).join(' · ')); setLoading(false); return }
      const out: Row[] = []
      for (const p of ((pr as { data: any[] }).data ?? [])) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const isMove = p.method === 'transfer'
        if (view === 'payments' && isMove) continue
        if (view === 'cash' && p.method !== 'cash') continue
        out.push({ key: `p${p.id}`, ts: p.paid_at ?? p.created_at, kind: isMove ? 'move' : p.amount < 0 ? 'out' : 'in', amount: p.amount, method: p.method,
          booking_id: p.booking_id, customer: p.bookings?.customer_name ?? null, product: p.bookings?.product_name ?? null, is_test: !!p.bookings?.is_test,
          by: p.recorded_by, byIsEmail: false, note: p.notes, label: isMove ? (p.amount < 0 ? 'Moved to linked booking' : 'Moved from linked booking') : 'Payment received' })
      }
      for (const r of ((rr as { data: any[] }).data ?? [])) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (view === 'cash' && r.method !== 'cash') continue
        out.push({ key: `r${r.id}`, ts: r.paid_at ?? r.requested_at, kind: 'out', amount: r.amount, method: r.method,
          booking_id: r.booking_id, customer: r.bookings?.customer_name ?? null, product: r.bookings?.product_name ?? null, is_test: !!r.is_test,
          by: r.authorized_by_email ?? r.requested_by_email, byIsEmail: true, note: r.description, label: 'Refund' })
      }
      out.sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))
      setRows(out); setLoading(false)
    })()
    return () => { cancelled = true }
  }, [view, simulationMode, month, tick])

  useEffect(() => { setPage(0) }, [view, search, month])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => `${r.customer ?? ''} ${r.product ?? ''} ${r.booking_id.slice(0, 8)} ${r.note ?? ''} ${r.method}`.toLowerCase().includes(q))
  }, [rows, search])

  const sumIn = filtered.filter(r => r.kind === 'in').reduce((a, r) => a + r.amount, 0)
  const sumOut = filtered.filter(r => r.kind === 'out').reduce((a, r) => a + Math.abs(r.amount), 0)
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE)
  // CSV-Download (Lucas 05.11.): alle gefilterten Zeilen, nicht nur die aktuelle Seite
  const p2 = (n: number) => String(n).padStart(2, '0')
  const csv: Table = {
    headers: ['Date', 'Time', 'Type', 'Customer', 'Product', 'Booking', 'Method', 'Recorded by', 'Note', 'Amount'], align: ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'r'],
    rows: filtered.map(r => {
      const d = new Date(r.ts), nm = r.by ? (r.byIsEmail ? who(r.by) : who.id(r.by)) : null
      return [`${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`, `${p2(d.getHours())}:${p2(d.getMinutes())}`, r.label, r.customer ?? '', r.product ?? '', r.booking_id.slice(0, 8).toUpperCase(),
        r.method === 'transfer' ? 'Move between bookings' : METHOD_LABEL[methodKey(r.method)] ?? r.method, nm ?? 'by system', r.note ?? '', { cents: r.kind === 'out' ? -Math.abs(r.amount) : r.amount }]
    }),
  }
  const csvName = csvFileName(`history-${view === 'all' ? 'all-movements' : view === 'payments' ? 'payments-in' : 'cash'}${month ? `-${month}` : ''}`, null, Boolean(simulationMode))
  const inp = { background: '#030d1c', border: '1px solid rgba(255,255,255,.12)', borderRadius: '8px', color: s.text, fontSize: '12.5px', fontFamily: 'inherit' } as const

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: s.muted }}>
          {view === 'all' ? 'All money movements: payments received, refunds paid out and moves between linked bookings.' : view === 'payments' ? 'Payments received (paid), newest first.' : 'Cash in and cash out (cash payments and cash refunds), newest first.'}{simulationMode ? ' (Test data)' : ''}
        </div>
        <div style={{ fontSize: '12px', color: s.muted }}>
          {filtered.length} item{filtered.length === 1 ? '' : 's'} · in <span style={{ color: '#4fe3c8', fontWeight: 700 }}>{eur(sumIn)}</span>
          {view !== 'payments' && <> · out <span style={{ color: '#ffa040', fontWeight: 700 }}>{eur(sumOut)}</span></>}
          {view === 'cash' && <> · net <span style={{ color: s.text, fontWeight: 700 }}>{sumIn - sumOut < 0 ? '−' : ''}{eur(sumIn - sumOut)}</span></>}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, product, booking no. or note…" style={{ ...inp, flex: '1 1 240px', minWidth: 0, padding: '8px 12px' }} />
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} title="Month" style={{ ...inp, padding: '7px 10px', colorScheme: 'dark' }} />
        {(search || month) && <button type="button" onClick={() => { setSearch(''); setMonth('') }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Clear filters</button>}
        <button type="button" onClick={() => setTick(n => n + 1)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: s.muted, borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>↻ Refresh</button>
        <CsvButton fileName={csvName} table={csv} />
      </div>
      {loading && <div style={{ color: s.muted, fontSize: '13px', padding: '10px 0' }}>Loading...</div>}
      {error && <div style={{ color: '#ff6040', fontSize: '12.5px', padding: '8px 0' }}>❌ Could not load history: {error}</div>}
      {!loading && !error && filtered.length === 0 && <div style={{ fontSize: '13px', color: s.muted, padding: '14px 0' }}>{(search || month) ? 'Nothing matches these filters.' : 'No movements yet.'}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {pageRows.map(r => {
          const col = r.kind === 'in' ? '#4fe3c8' : r.kind === 'out' ? '#ffa040' : s.muted
          const sign = r.kind === 'in' ? '+' : r.kind === 'out' ? '−' : (r.amount < 0 ? '−' : '+')
          const nm = r.by ? (r.byIsEmail ? who(r.by) : who.id(r.by)) : null
          return (
            <div key={r.key} style={{ background: 'rgba(255,255,255,.025)', border: r.kind === 'move' ? '1px dashed rgba(255,255,255,.14)' : '1px solid rgba(255,255,255,.07)', borderRadius: '10px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: s.text }}>
                  {r.label}
                  <span style={{ marginLeft: '8px', fontWeight: 400, color: s.muted, fontSize: '12.5px' }}>{r.customer ?? '—'}{r.product ? ` · ${r.product}` : ''}</span>
                  {r.is_test && <span style={{ marginLeft: '8px', fontSize: '11.5px', color: '#FFD080' }}>TEST</span>}
                </div>
                <div style={{ fontSize: '12px', color: s.muted, marginTop: '2px' }}>
                  Booking <button type="button" onClick={() => onOpenBooking(r.booking_id)} title="Open booking" style={{ fontFamily: 'monospace', color: '#f3efe6', fontWeight: 700, background: 'transparent', border: '1px solid rgba(243,239,230,.35)', borderRadius: '5px', padding: '0 6px', cursor: 'pointer' }}>{r.booking_id.slice(0, 8).toUpperCase()}</button>
                  {' · '}{ML[r.method] ?? r.method}{' · '}{nm ? `👤 ${nm}` : '⚙️ by system (automatic)'}
                </div>
                {r.note && <div style={{ fontSize: '12px', color: s.muted, marginTop: '4px' }}>{r.note}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: col }}>{sign}{eur(r.amount)}</div>
                <div style={{ fontSize: '12.5px', color: s.muted, marginTop: '2px' }}>{new Date(r.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date(r.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length > PAGE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '14px', fontSize: '12.5px', color: s.muted }}>
          <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: page === 0 ? s.muted : s.text, borderRadius: '8px', padding: '6px 14px', cursor: page === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>← Previous</button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / PAGE))}</span>
          <button type="button" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(p => p + 1)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: (page + 1) * PAGE >= filtered.length ? s.muted : s.text, borderRadius: '8px', padding: '6px 14px', cursor: (page + 1) * PAGE >= filtered.length ? 'default' : 'pointer', fontFamily: 'inherit' }}>Next →</button>
        </div>
      )}
    </div>
  )
}
