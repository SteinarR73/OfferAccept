'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SystemStatus = 'loading' | 'operational' | 'degraded' | 'outage';

interface HealthResponse {
  status: string;
}

// ── Incidents ─────────────────────────────────────────────────────────────────
// Add entries here (most recent first) as incidents occur.

const INCIDENTS: Array<{
  date: string;
  title: string;
  severity: 'resolved' | 'investigating' | 'identified';
  body: string;
}> = [
  // Example:
  // {
  //   date: '2026-03-29',
  //   title: 'Email delivery delays',
  //   severity: 'resolved',
  //   body: 'Transient delays in acceptance confirmation email delivery. Resolved at 14:30 UTC.',
  // },
];

// ── Health fetch ──────────────────────────────────────────────────────────────

async function fetchHealth(): Promise<SystemStatus> {
  try {
    const res = await fetch('/api/v1/health/z', {
      // Skip cache so the status page always shows current state
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) return 'operational';
    // 503 → degraded; anything else unexpected → treat as degraded
    return 'degraded';
  } catch {
    // Network error or timeout → can't reach the API
    return 'outage';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Exclude<SystemStatus, 'loading'> }) {
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

function BannerIcon({ status }: { status: SystemStatus }) {
  if (status === 'loading') return <Loader2 className="w-8 h-8 text-gray-400 animate-spin flex-shrink-0" />;
  if (status === 'operational') return <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" aria-hidden="true" />;
  if (status === 'outage') return <XCircle className="w-8 h-8 text-red-600 flex-shrink-0" aria-hidden="true" />;
  return <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0" aria-hidden="true" />;
}

const BANNER_STYLE: Record<SystemStatus, string> = {
  loading:     'bg-gray-50 border-gray-200',
  operational: 'bg-green-50 border-green-200',
  degraded:    'bg-amber-50 border-amber-200',
  outage:      'bg-red-50 border-red-200',
};

const BANNER_TITLE: Record<SystemStatus, string> = {
  loading:     'Checking system status…',
  operational: 'All systems operational',
  degraded:    'Some systems are affected',
  outage:      'Service unavailable',
};

const BANNER_BODY: Record<SystemStatus, string> = {
  loading:     'Fetching live health data.',
  operational: 'No incidents reported.',
  degraded:    'One or more dependencies are unhealthy. See below for details.',
  outage:      'The API is not responding. Engineers have been notified.',
};

const BANNER_TEXT: Record<SystemStatus, string> = {
  loading:     'text-gray-700',
  operational: 'text-green-800',
  degraded:    'text-amber-800',
  outage:      'text-red-800',
};

const BANNER_SUBTEXT: Record<SystemStatus, string> = {
  loading:     'text-gray-500',
  operational: 'text-green-700',
  degraded:    'text-amber-700',
  outage:      'text-red-700',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [status, setStatus] = useState<SystemStatus>('loading');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const result = await fetchHealth();
      if (!cancelled) {
        setStatus(result);
        setLastChecked(new Date());
      }
    }

    void check();

    // Refresh every 60 seconds so the page stays current without a reload
    const interval = setInterval(() => { void check(); }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Derive per-service status from the top-level health response.
  // When the API is reachable and healthy all services show operational.
  // When it's degraded or unreachable all services reflect that state.
  const serviceStatus: Exclude<SystemStatus, 'loading'> =
    status === 'loading' ? 'operational' : status;

  const SERVICES = [
    { name: 'Signing flow' },
    { name: 'Certificate issuance' },
    { name: 'Certificate verification' },
    { name: 'Email delivery' },
    { name: 'Dashboard' },
    { name: 'API' },
  ];

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
          {lastChecked && (
            <p className="text-xs text-gray-400">
              Last checked {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">

        {/* Overall status banner */}
        <div className={`rounded-xl px-6 py-5 mb-10 flex items-center gap-4 border ${BANNER_STYLE[status]}`}>
          <BannerIcon status={status} />
          <div>
            <p className={`text-lg font-semibold ${BANNER_TEXT[status]}`}>
              {BANNER_TITLE[status]}
            </p>
            <p className={`text-sm mt-0.5 ${BANNER_SUBTEXT[status]}`}>
              {BANNER_BODY[status]}
            </p>
          </div>
        </div>

        {/* Service list */}
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Services</h2>
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 mb-10">
          {SERVICES.map((s) => (
            <div key={s.name} className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-gray-700">{s.name}</span>
              {status === 'loading' ? (
                <span className="text-xs text-gray-400">Checking…</span>
              ) : (
                <StatusBadge status={serviceStatus} />
              )}
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
