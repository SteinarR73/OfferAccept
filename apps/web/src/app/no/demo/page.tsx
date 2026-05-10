import type { Metadata } from 'next';
import { DemoNoClient } from './DemoNoClient';

export const metadata: Metadata = {
  title: 'Live demo — OfferAccept',
  description:
    'Se nøyaktig hva mottakeren din opplever. Gå gjennom hele akseptprosessen — ingen konto nødvendig.',
  robots: 'noindex',
};

export default function NoDemoPage() {
  return <DemoNoClient />;
}
