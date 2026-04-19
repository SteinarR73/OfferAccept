import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — OfferAccept',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <span className="w-7 h-7 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold">
              OA
            </span>
            OfferAccept
          </Link>
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>

        <div className="prose prose-sm prose-gray max-w-none space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">What we collect</h2>
            <p>
              OfferAccept collects the information you provide when creating an account (name, email,
              password), the deal content you upload (titles, messages, attached documents), and
              recipient information entered for each deal. We also collect standard server logs
              (IP address, browser, timestamps) for security and debugging purposes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">How we use it</h2>
            <p>
              We use your data exclusively to operate the OfferAccept service: sending deal links,
              verifying recipient identity via OTP, generating acceptance certificates, and
              providing you with a record of your deals. We do not sell your data or use it for
              advertising.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Data retention</h2>
            <p>
              Deal records and acceptance certificates are retained for the lifetime of your account
              and for a minimum of 7 years after acceptance to support legal and compliance use cases.
              You may request deletion of your account and associated data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Security</h2>
            <p>
              All data is encrypted in transit (TLS) and at rest. Acceptance tokens are short-lived
              and hashed before storage. Certificates are cryptographically sealed with a SHA-256
              hash chain.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">GDPR (EEA residents)</h2>
            <p className="mb-2">
              <strong>Data Controller:</strong> OfferAccept, Inc., incorporated in Delaware, United States.
              Contact: <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">privacy@offeraccept.com</a>.
            </p>
            <p className="mb-2">
              <strong>Legal Basis:</strong> We process your personal data on the basis of contract
              performance (operating your account and delivering the service) and legitimate interests
              (security, fraud prevention, service improvement). Where required by law, we will seek
              your consent.
            </p>
            <p className="mb-2">
              <strong>Your rights:</strong> Under the GDPR you have the right to access, rectify, or
              erase your personal data; to restrict or object to processing; and to data portability.
              You also have the right to lodge a complaint with your local supervisory authority.
              Submit requests to{' '}
              <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                privacy@offeraccept.com
              </a>
              . We will respond within 30 days.
            </p>
            <p>
              <strong>International transfers:</strong> OfferAccept operates from the United States.
              If you are in the EEA, your data is transferred to and processed in the US. We rely on
              Standard Contractual Clauses (SCCs) as the transfer mechanism. A Data Processing
              Agreement (DPA) is available on request — see our{' '}
              <a href="/legal/dpa" className="text-blue-600 hover:text-blue-700">DPA page</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Contact</h2>
            <p>
              For privacy questions or data requests, email{' '}
              <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                privacy@offeraccept.com
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
