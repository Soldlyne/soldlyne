import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { publicUrl } from '@/lib/public-url'
import './globals.css'

const sans = Schibsted_Grotesk({ variable: '--font-brand-sans', subsets: ['latin'] })
const mono = IBM_Plex_Mono({ variable: '--font-brand-mono', subsets: ['latin'], weight: ['400', '500'] })

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl()),
  title: { default: 'Soldlyne', template: '%s · Soldlyne' },
  description: 'The CRM that takes over once someone answers: companies, people, deals, pipelines and quotes.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdf9f9' },
    { media: '(prefers-color-scheme: dark)', color: '#110a0b' },
  ],
  colorScheme: 'light dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
