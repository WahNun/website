import type { Metadata } from 'next'
import { CentreChrome } from '@/components/booking/CentreChrome'

// Check-in pages are reached by a personal token link. They must never appear
// in search results.
export const metadata: Metadata = {
  title: 'Online check-in — your dive centre',
  robots: { index: false, follow: false },
}

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CentreChrome />
      {children}
    </>
  )
}
