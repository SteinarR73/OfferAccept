import Link from 'next/link';
import type { Metadata } from 'next';
import { Download } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Data Processing Agreement — OfferAccept',
};

export default function DpaPage() {
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
          <Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Privacy Policy
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Data Processing Agreement</h1>
          <a
            href="/legal/dpa?format=pdf"
            download="offeraccept-dpa-v1.0.pdf"
            className="flex items-center gap-1.5 text-xs font-medium text-[--color-accent] hover:text-[--color-accent-hover] border border-[--color-accent] rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download PDF
          </a>
        </div>
        <p className="text-sm text-gray-500 mb-2">DPA Version 1.0 — effective March 2026</p>
        <p className="text-xs text-gray-400 mb-8">
          For a countersigned copy, email{' '}
          <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
            privacy@offeraccept.com
          </a>
        </p>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Parties</h2>
            <p>
              This Data Processing Agreement (&ldquo;DPA&rdquo;) is between OfferAccept, Inc.
              (&ldquo;Processor&rdquo;) and the organisation that has accepted the OfferAccept Terms
              of Service (&ldquo;Controller&rdquo;). Together, the parties are referred to as
              &ldquo;the parties&rdquo;.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Processing purpose</h2>
            <p>
              The Processor processes personal data solely to provide the OfferAccept service as
              described in the Terms of Service: sending deal documents to recipients, verifying
              recipient email via OTP, recording acceptance or decline events, and issuing tamper-evident
              certificates. Processing occurs only on documented instructions from the Controller.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Categories of data</h2>
            <p>
              The Processor processes the following categories of personal data on behalf of the Controller:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Name and email address of deal recipients</li>
              <li>IP address, browser information, and timestamps recorded during signing events</li>
              <li>OTP verification records (hashed codes, not raw values)</li>
              <li>Deal titles and acceptance decisions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Security obligations</h2>
            <p>
              The Processor implements and maintains appropriate technical and organisational measures
              to protect personal data, including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Encryption in transit (TLS) and at rest</li>
              <li>Access controls limiting data access to authorised personnel</li>
              <li>SHA-256 certificate integrity sealing to detect unauthorised alteration</li>
              <li>Rate limiting and monitoring on authentication endpoints</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Data retention</h2>
            <p>
              Acceptance certificates and associated records are retained for the lifetime of the
              Controller&rsquo;s account and for a minimum of 7 years after acceptance to support
              legal and compliance use cases. The Controller may request deletion of non-certificate
              data by contacting{' '}
              <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                privacy@offeraccept.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Sub-processors</h2>
            <p>
              The Processor uses the following categories of sub-processors to deliver the service:
              cloud infrastructure (hosting and database), transactional email delivery, and payment
              processing. The Processor will notify the Controller of material changes to
              sub-processors with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Breach notification</h2>
            <p>
              In the event of a personal data breach, the Processor will notify the Controller without
              undue delay and in any case within 72 hours of becoming aware of the breach. Notification
              will include the nature of the breach, categories and approximate number of data subjects
              affected, likely consequences, and measures taken or proposed.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">International transfers</h2>
            <p>
              The Processor is based in the United States. Transfers of personal data from the EEA
              to the Processor are made under Standard Contractual Clauses (SCCs) as adopted by the
              European Commission. A signed copy of the SCCs is available on request from{' '}
              <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                privacy@offeraccept.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Contact</h2>
            <p>
              For questions about this DPA or to request a countersigned copy, contact{' '}
              <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                privacy@offeraccept.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
