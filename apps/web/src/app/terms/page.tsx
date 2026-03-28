import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — OfferAccept',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <span className="w-7 h-7 rounded-lg bg-[--color-accent] flex items-center justify-center text-white text-xs font-bold">
              OA
            </span>
            OfferAccept
          </Link>
          <Link href="/landing" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Service description</h2>
            <p>
              OfferAccept provides a platform for organisations to send deal documents to recipients,
              collect OTP-verified acceptance, and receive tamper-proof acceptance certificates.
              OfferAccept is not an e-signature platform and does not create legally binding
              electronic signatures under e-signature legislation.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Acceptable use</h2>
            <p>
              You may not use OfferAccept to send fraudulent, deceptive, or unlawful content.
              You are responsible for ensuring you have the right to share any documents uploaded
              to the service. Abuse of the platform may result in immediate account termination.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Account responsibility</h2>
            <p>
              You are responsible for maintaining the security of your account credentials and for
              all activity that occurs under your account. Notify us immediately at{' '}
              <a href="mailto:support@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                support@offeraccept.com
              </a>{' '}
              if you suspect unauthorised access.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Limitation of liability</h2>
            <p>
              OfferAccept is provided "as is". We are not liable for any indirect, incidental, or
              consequential damages arising from your use of the service. Our liability is limited
              to the fees you paid in the 12 months preceding any claim.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Changes to these terms</h2>
            <p>
              We may update these terms from time to time. Continued use of the service after
              notice of changes constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Contact</h2>
            <p>
              For questions about these terms, email{' '}
              <a href="mailto:legal@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                legal@offeraccept.com
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
