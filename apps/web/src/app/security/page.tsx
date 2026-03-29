import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Security — OfferAccept',
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <span className="w-7 h-7 rounded-lg bg-[--color-accent] flex items-center justify-center text-white text-xs font-bold">
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Security</h1>
        <p className="text-sm text-gray-500 mb-10">
          We take the security of OfferAccept and the data entrusted to us seriously.
        </p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Security overview</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>All data encrypted in transit (TLS) and at rest.</li>
              <li>Acceptance certificates sealed with a SHA-256 hash chain — any alteration is detectable.</li>
              <li>OTP codes hashed before storage; raw codes are never persisted.</li>
              <li>JWT access tokens issued as HttpOnly, SameSite=Strict cookies.</li>
              <li>Sliding-window rate limiting on all authentication and OTP endpoints.</li>
              <li>HSTS with long-duration max-age enforced on all responses.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Responsible disclosure</h2>
            <p className="mb-3">
              If you believe you have found a security vulnerability in OfferAccept, we ask that you
              disclose it to us responsibly before making it public. We commit to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>Acknowledging your report within 2 business days.</li>
              <li>Providing a status update within 10 business days.</li>
              <li>Notifying you when the vulnerability is resolved.</li>
              <li>Not pursuing legal action against researchers acting in good faith.</li>
            </ul>
            <p className="mt-3">
              To report a vulnerability, email{' '}
              <a href="mailto:security@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                security@offeraccept.com
              </a>
              . Please include a description of the issue, steps to reproduce, and the potential impact.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Scope</h2>
            <p className="mb-2">In scope:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
              <li>offeraccept.com and subdomains</li>
              <li>The OfferAccept web application and API</li>
              <li>Authentication and authorisation flows</li>
              <li>Certificate integrity and verification</li>
            </ul>
            <p className="mb-2">Out of scope:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>Denial-of-service attacks</li>
              <li>Social engineering of OfferAccept staff</li>
              <li>Physical security</li>
              <li>Third-party services (email providers, payment processors)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Response commitment</h2>
            <p>
              We aim to resolve critical vulnerabilities within 7 days of a confirmed report and
              high-severity issues within 30 days. We will keep you informed throughout the process.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
