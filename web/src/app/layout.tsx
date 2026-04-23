import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Otto Dashboard',
  description: 'Manage OpenCode and Kimaki agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
