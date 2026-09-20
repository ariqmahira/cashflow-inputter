import type { Metadata, Viewport } from 'next';
import { Fredoka, Plus_Jakarta_Sans } from 'next/font/google';

import { BottomNav } from '@/components/bottom-nav';
import { AuthGate } from '@/components/auth-gate';
import './globals.css';

// Plus Jakarta Sans was commissioned for the city this money is spent in. Fredoka carries
// the warmth, used only for the balance and screen titles.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fredoka',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kas',
  description: 'Shared kas for Ariq & Ika',
  applicationName: 'Kas',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f0' },
    { media: '(prefers-color-scheme: dark)', color: '#151b14' },
  ],
  width: 'device-width',
  initialScale: 1,
  // The app is a native shell; pinch-zooming the chrome is not wanted.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fredoka.variable}`}>
      <body className="min-h-dvh">
        <AuthGate>
          {/* Bottom padding clears the nav plus the home indicator. */}
          <main className="mx-auto w-full max-w-lg px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
            {children}
          </main>
          <BottomNav />
        </AuthGate>
      </body>
    </html>
  );
}
