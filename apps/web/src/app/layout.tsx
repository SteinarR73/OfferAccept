import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '../lib/toast';
import { ToastContainer } from '../components/ui/Toast';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: { default: 'OfferAccept', template: '%s | OfferAccept' },
  description: 'Secure deal management with tamper-proof acceptance certificates.',
  openGraph: {
    siteName: 'OfferAccept',
    type: 'website',
  },
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-[--color-bg] text-[--color-text-primary]">
        <ToastProvider>
          {children}
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
