'use client'
import React, { useEffect, useRef, useState } from 'react'

const TOAST_EVENT = 'show-toast'

export function showToast(message: string) {
 if (typeof window !== 'undefined') {
 window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }))
 }
}

export function ToastHost() {
 const [msg, setMsg] = useState<string | null>(null)
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

 useEffect(() => {
 function handler(e: Event) {
 const message = (e as CustomEvent<string>).detail
 if (timer.current) clearTimeout(timer.current)
 setMsg(message)
 timer.current = setTimeout(() => setMsg(null), 2000)
 }
 window.addEventListener(TOAST_EVENT, handler)
 return () => window.removeEventListener(TOAST_EVENT, handler)
 }, [])

 if (!msg) return null
 return (
 <div style={{
 position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
 background: '#121210', border: '1px solid rgba(243,239,230,.35)', borderRadius: 0,
 padding: '13px 22px', fontSize: '14px', fontWeight: 700, color: '#f3efe6',
 boxShadow: 'none', zIndex: 10000, whiteSpace: 'nowrap',
 animation: 'fadeInUp .2s ease',
 }}>
 {msg}
 </div>
 )
}
