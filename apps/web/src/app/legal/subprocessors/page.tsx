import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sub-processors — OfferAccept',
  description:
    'List of third-party sub-processors used by OfferAccept to deliver the service, including purpose, data category, and transfer mechanism.',
};

const CONFIRMED: {
  name: string;
  purpose: string;
  data: string;
  location: string;
  transfer: string;
}[] = [
  {
    name: 'Resend',
    purpose: 'Transactional email delivery (OTP codes, acceptance notifications)',
    data: 'Recipient email address, email content',
    location: 'United States',
    transfer: 'Standard Contractual Clauses (SCCs)',
  },
  {
    name: 'Stripe',
    purpose: 'Payment processing and subscription management',
    data: 'Billing contact name, email, payment card data (handled directly by Stripe)',
    location: 'United States',
    transfer: 'Standard Contractual Clauses (SCCs)',
  },
  {
    name: 'Sentry',
    purpose: 'Application error monitoring and diagnostics',
    data: 'Stack traces, anonymised request metadata (no document content)',
    location: 'United States',
    transfer: 'Standard Contractual Clauses (SCCs)',
  },
];

export default function SubprocessorsPage() {
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
          <Link href="/legal/dpa" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Data Processing Agreement
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Sub-processors</h1>
          <p className="text-sm text-gray-500">
            Last updated: May 2026 · OfferAccept, Inc.
          </p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <p>
            OfferAccept (Processor) uses the following third-party sub-processors to deliver the
            service. All sub-processors are bound by data processing agreements and, where personal
            data is transferred outside the EEA, by Standard Contractual Clauses (SCCs) as adopted
            by the European Commission.
          </p>

          <p>
            We will notify Controllers of material changes to this list with at least 14 days&rsquo;
            notice, giving Controllers the opportunity to object. Notification is sent to the
            account email address on file.
          </p>

          {/* Confirmed sub-processors */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Confirmed sub-processors</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700 whitespace-nowrap">
                      Sub-processor
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Purpose
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Personal data processed
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700 whitespace-nowrap">
                      Location
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700 whitespace-nowrap">
                      Transfer mechanism
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CONFIRMED.map((sp, i) => (
                    <tr key={sp.name} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200 font-medium whitespace-nowrap">
                        {sp.name}
                      </td>
                      <td className="py-2 px-3 border border-gray-200">{sp.purpose}</td>
                      <td className="py-2 px-3 border border-gray-200">{sp.data}</td>
                      <td className="py-2 px-3 border border-gray-200 whitespace-nowrap">
                        {sp.location}
                      </td>
                      <td className="py-2 px-3 border border-gray-200 whitespace-nowrap">
                        {sp.transfer}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Infrastructure note */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Infrastructure</h2>
            <p>
              OfferAccept uses cloud infrastructure for hosting, database, object storage, and
              caching. Details of specific providers will be added to this page when finalised. In
              the interim, please contact{' '}
              <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                privacy@offeraccept.com
              </a>{' '}
              for the current infrastructure sub-processor list.
            </p>
          </section>

          {/* Object to new sub-processors */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Objecting to a new sub-processor
            </h2>
            <p>
              If you receive notice of a new sub-processor and wish to object, contact{' '}
              <a href="mailto:privacy@offeraccept.com" className="text-blue-600 hover:text-blue-700">
                privacy@offeraccept.com
              </a>{' '}
              within 14 days of the notice. We will work with you to find a resolution. If we are
              unable to accommodate the objection without affecting the service, you may terminate
              your subscription pursuant to the{' '}
              <Link href="/legal/dpa" className="text-blue-600 hover:text-blue-700">
                Data Processing Agreement
              </Link>
              .
            </p>
          </section>

          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              See also:{' '}
              <Link href="/legal/dpa" className="text-blue-600 hover:text-blue-700">
                Data Processing Agreement
              </Link>{' '}
              ·{' '}
              <Link href="/privacy" className="text-blue-600 hover:text-blue-700">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
