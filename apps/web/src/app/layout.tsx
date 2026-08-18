import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/ui/Toast';
import { RouteProgressBar } from '../components/ui/RouteProgressBar';
import { ConditionalFooter } from '../components/ConditionalFooter';

// Required for the nonce-based CSP in middleware.ts to work at all: a nonce
// only exists once a request exists, so every page must render per-request
// rather than being statically generated at build time (which would bake in
// HTML with no nonce, permanently mismatched against each request's fresh
// CSP header). This applies to every route under this layout — i.e. all of
// them. Trade-off: no static generation or CDN caching for any page,
// including marketing/legal pages that would otherwise be static-friendly.
// Accepted deliberately — this app's product is built on trust/tamper-
// evidence, so a consistently strict CSP (not weakened to 'unsafe-inline',
// not a partial/mixed strategy that risks misclassifying a sensitive route
// as "safe to leave static") outweighs the SSR/hosting cost at current scale.
export const dynamic = 'force-dynamic';

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-serif',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const viewport: Viewport = {
  themeColor: '#059669',
};

export const metadata: Metadata = {
  title: { default: 'OfferAccept', template: '%s | OfferAccept' },
  description: 'Secure deal management with tamper-proof acceptance certificates.',
  openGraph: {
    siteName: 'OfferAccept',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakartaSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased bg-(--color-bg) text-(--color-text-primary)">
        <ToastProvider>
          <RouteProgressBar />
          <div className="min-h-screen flex flex-col">
            {children}
            <ConditionalFooter />
          </div>
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
