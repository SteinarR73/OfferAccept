import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/ui/Toast';

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

export const metadata: Metadata = {
  title: { default: 'OfferAccept', template: '%s | OfferAccept' },
  description: 'Secure deal management with tamper-proof acceptance certificates.',
  openGraph: {
    siteName: 'OfferAccept',
    type: 'website',
  },
  themeColor: '#059669',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakartaSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased bg-[--color-bg] text-[--color-text-primary]">
        <ToastProvider>
          {children}
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
