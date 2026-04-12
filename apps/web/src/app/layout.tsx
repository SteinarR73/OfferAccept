import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/ui/Toast';
import { LegalFooter } from '../components/LegalFooter';

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
      <body className="font-sans antialiased bg-[--color-bg] text-[--color-text-primary]">
        <ToastProvider>
          <div className="min-h-screen flex flex-col">
            {children}
            <LegalFooter />
          </div>
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
