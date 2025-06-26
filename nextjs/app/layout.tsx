import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Attraction',
  description: 'SYMUA',
  generator: 'SYMUA',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
