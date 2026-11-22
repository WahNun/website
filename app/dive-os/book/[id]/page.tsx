'use client'


import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { s } from '@/components/pages/_shared'

export default function BookDraftPage() {
 const router = useRouter()
 const params = useParams<{ id: string }>()

 useEffect(() => {
 const id = params.id
 if (!id) { router.replace('/dive-os/book'); return }

 fetch(`/api/draft?id=${encodeURIComponent(id)}`)
 .then(async res => {
 if (!res.ok) { router.replace('/dive-os/book'); return }
 const draft = await res.json()
 if (!draft || draft.status !== 'active') { router.replace('/dive-os/book'); return }
 if (new Date(draft.expires_at) <= new Date()) { router.replace('/dive-os/book'); return }

 const qp = new URLSearchParams()
 if (draft.product_id) qp.set('product', draft.product_id)
 if (draft.date) qp.set('date', draft.date.toLowerCase())
 if (draft.session) qp.set('session', draft.session.toLowerCase())
 if (draft.num_divers) qp.set('guests', String(draft.num_divers))
 if (draft.customer_email) qp.set('email', draft.customer_email)
 qp.set('draft_id', draft.id)
 router.replace(`/dive-os/book?${qp.toString()}`)
 })
 .catch(() => router.replace('/dive-os/book'))
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [])

 return <div style={{ minHeight: '100vh', background: s.bgDark }} />
}
