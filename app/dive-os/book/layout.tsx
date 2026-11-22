import type { Metadata } from 'next'
import { CentreChrome, CentreIntro } from '@/components/booking/CentreChrome'

// Not linked from anywhere public while the booking system is in testing.
// Keep it out of search results so no real guest lands on a booking that,
// in sandbox mode, nobody would honour.
export const metadata: Metadata = {
  title: 'Book your dive — your dive centre',
  robots: { index: false, follow: false },
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CentreChrome />
      <div style={{ padding: '28px 24px 0' }}>
        <CentreIntro />
      </div>
      {children}
    </>
  )
}
