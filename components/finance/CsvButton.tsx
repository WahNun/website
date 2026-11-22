'use client'
import { useState } from 'react'
import { s } from '@/components/pages/_shared'
import { toCsv, type Table } from '@/lib/financeReports'

/** CSV im Browser speichern. BOM, damit Excel Umlaute und das Euro-Zeichen richtig liest. */
export function downloadCsv(fileName: string, table: Table) {
  const blob = new Blob(['﻿' + toCsv(table)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Download-Knopf fuer eine Tabelle. `table` = fertige Daten; `load` = Daten erst beim Klick holen
 * (z. B. alle Seiten einer Liste). Fehler stehen sichtbar neben dem Knopf.
 */
export default function CsvButton({ fileName, table, load, label = 'Download CSV', disabled }: {
  fileName: string
  table?: Table | null
  load?: () => Promise<Table>
  label?: string
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const off = disabled || busy || (!load && (!table || table.rows.length === 0))
  const run = async () => {
    setError(null)
    try {
      if (load) { setBusy(true); downloadCsv(fileName, await load()) }
      else if (table) downloadCsv(fileName, table)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <button type="button" onClick={run} disabled={off} title={off && !busy ? 'Nothing to download' : `Save as ${fileName}`}
        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: off ? 'rgba(127,166,201,.45)' : s.muted, borderRadius: '8px', padding: '6px 12px', cursor: off ? 'default' : 'pointer', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        {busy ? 'Preparing…' : label}
      </button>
      {error && <span style={{ fontSize: '12px', color: '#ff6040' }}>Download failed: {error}</span>}
    </span>
  )
}
