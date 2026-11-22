import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Book your dive — your dive centre',
  robots: { index: false, follow: false },
}

export default function BookIdLayout({ children }: { children: React.ReactNode }) {
  return children
}
