'use client'
import { useState, useEffect } from 'react'
type Lang = 'EN' | 'PT' | 'DE' | 'ES'
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>('EN')
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/)
    const v = (m?.[1] ?? '').toUpperCase()
    if (['EN','PT','DE','ES'].includes(v)) setLang(v as Lang)
  }, [])
  return lang
}
