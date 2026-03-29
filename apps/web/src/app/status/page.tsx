import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Status — OfferAccept',
};

// Static status page. Update SYSTEM_STATUS and INCIDENTS manually during incidents.
// Automated monitoring integration is a future improvement.

const SYSTEM_STATUS: 'operational' | 'degraded' | 'outage' = 'operational';

const SERVICES = [
  { name: 'Signing flow',        status: 'operational' as const },
  { name: 'Certificate issuance', status: 'operational' as const },
  { name: 'Certificate verification', status: 'operational' as const },
  { name: 'Email delivery',      status: 'operational' as const },
  { name: 'Dashboard',           status: 'operational' as const },
  { name: 'API',                 status: 'operational' as const },
];

const INCIDENTS: Array<{
  date: string;
  title: string;
  severity: 'resolved' | 'investigating' | 'identified';
  body: string;
}> = [
  // Add incidents here as they occur. Most recent first.
  // Example:
  // {
  //   date: '2026-03-29',
  //   title: 'Email delivery delays',
  //   severity: 'resolved',
  //   body: 'Transient delays in acceptance confirmation email delivery. Resolved at 14:30 UTC.',
  // },
];

function StatusBadge({ status }: { status: typeof SERVICES[0]['status'] }) {
  if (status === 'operational') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        Operational
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
      {status === 'degraded' ? 'Degraded' : 'Outage'}
    </span>
  );
}

export default function StatusPage() {
  const isAllOperational = SYSTEM_STATUS === 'operational';

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
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Overall status banner */}
        <div
          className={`rounded-xl px-6 py-5 mb-10 flex items-center gap-4 ${
            isAllOperational
              ? 'bg-green-50 border border-green-200'
              : 'bg-amber-50 border border-amber-200'
          }`}
        >
          {isAllOperational ? (
            <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className={`text-lg font-semibold ${isAllOperational ? 'text-green-800' : 'text-amber-800'}`}>
              {isAllOperational ? 'All systems operational' : 'Some systems are affected'}
            </p>
            <p className={`text-sm mt-0.5 ${isAllOperational ? 'text-green-700' : 'text-amber-700'}`}>
              {isAllOperational
                ? 'No incidents reported.'
                : 'See the incident log below for details.'}
            </p>
          </div>
        </div>

        {/* Service list */}
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Services</h2>
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 mb-10">
          {SERVICES.map((s) => (
            <div key={s.name} className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-gray-700">{s.name}</span>
              <StatusBadge status={s.status} />
            </div>
          ))}
        </div>

        {/* Incident history */}
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Incident history</h2>
        {INCIDENTS.length === 0 ? (
          <p className="text-sm text-gray-500">No incidents in the past 90 days.</p>
        ) : (
          <div className="space-y-4">
            {INCIDENTS.map((inc, i) => (
              <div key={i} className="rounded-lg border border-gray-200 px-5 py-4">
                <div className="flex items-start justify-between gap-4 mb-1.5">
                  <p className="text-sm font-medium text-gray-900">{inc.title}</p>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      inc.severity === 'resolved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {inc.severity.charAt(0).toUpperCase() + inc.severity.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-1">{inc.date}</p>
                <p className="text-sm text-gray-700">{inc.body}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 px-6 py-4 text-center text-xs text-gray-400">
        For incidents contact{' '}
        <a href="mailto:support@offeraccept.com" className="text-blue-600 hover:text-blue-700">
          support@offeraccept.com
        </a>
      </footer>
    </div>
  );
}
