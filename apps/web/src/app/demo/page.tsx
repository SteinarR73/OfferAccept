import type { Metadata } from 'next';
import { DemoClient } from './DemoClient';

export const metadata: Metadata = {
  title: 'Live Demo — OfferAccept',
  description:
    'Experience the full acceptance flow — see exactly what your recipients see. No account required.',
  robots: 'noindex',
};

export default function DemoPage() {
  return <DemoClient />;
}
