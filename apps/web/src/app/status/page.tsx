'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ServiceHealth = 'operational' | 'degraded';
type OverallStatus = 'loading' | 'operational' | 'degraded' | 'outage';

interface ServicesHealthResponse {
  checkedAt: number;
  services: {
    database: ServiceHealth;
    cache: ServiceHealth;
    jobQueue: ServiceHealth;
    signingFlow: ServiceHealth;
    emailDelivery: ServiceHealth;
  };
}

// ── Service display names ──────────────────────────────────────────────────────

const SERVICE_LABELS: Record<keyof ServicesHealthResponse['services'], string> = {
  database:      'Database',
  cache:         'Cache / rate limits',
  jobQueue:      'Job queue',
  signingFlow:   'Signing & certificates',
  emailDelivery: 'Email delivery',
};

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

// ── Health fetch ───────────────────────────────────────────────────────────────

interface FetchResult {
  overall: OverallStatus;
  services: ServicesHealthResponse['services'] | null;
  checkedAt: Date | null;
}

async function fetchHealth(): Promise<FetchResult> {
  try {
    const res = await fetch('/api/v1/health/services', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return { overall: 'degraded', services: null, checkedAt: new Date() };
    }

    const data = await res.json() as ServicesHealthResponse;
    const anyDegraded = Object.values(data.services).some((s) => s === 'degraded');

    return {
      overall: anyDegraded ? 'degraded' : 'operational',
      services: data.services,
      checkedAt: new Date(data.checkedAt),
    };
  } catch {
    return { overall: 'outage', services: null, checkedAt: new Date() };
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ServiceStatusBadge({ status }: { status: ServiceHealth }) {
  if (status === 'operational') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-[--color-success-text]">
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        Operational
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-[--color-warning-text]">
      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
      Degraded
    </span>
  );
}

function BannerIcon({ status }: { status: OverallStatus }) {
  if (status === 'loading')      return <Loader2 className="w-8 h-8 text-gray-400 animate-spin flex-shrink-0" />;
  if (status === 'operational')  return <CheckCircle2 className="w-8 h-8 text-[--color-success] flex-shrink-0" aria-hidden="true" />;
  if (status === 'outage')       return <XCircle className="w-8 h-8 text-[--color-error] flex-shrink-0" aria-hidden="true" />;
  return <AlertTriangle className="w-8 h-8 text-[--color-warning] flex-shrink-0" aria-hidden="true" />;
}

const BANNER_CLASS: Record<OverallStatus, string> = {
  loading:     'bg-[#f8fafc] border-[--color-border]',
  operational: 'bg-[--color-success-light] border-[--color-success-border]',
  degraded:    'bg-[--color-warning-light] border-[--color-warning-border]',
  outage:      'bg-[--color-error-light] border-[--color-error-border]',
};

const BANNER_TITLE: Record<OverallStatus, string> = {
  loading:     'Checking system status…',
  operational: 'All systems operational',
  degraded:    'Some systems are affected',
  outage:      'Service unavailable',
};

const BANNER_BODY: Record<OverallStatus, string> = {
  loading:     'Fetching live health data.',
  operational: 'No incidents reported.',
  degraded:    'One or more dependencies are unhealthy. See individual service status below.',
  outage:      'The API is not responding. Engineers have been notified.',
};

const BANNER_TITLE_CLASS: Record<OverallStatus, string> = {
  loading:     'text-[#0f172a]',
  operational: 'text-[--color-success-text]',
  degraded:    'text-[--color-warning-text]',
  outage:      'text-[--color-error-text]',
};

const BANNER_BODY_CLASS: Record<OverallStatus, string> = {
  loading:     'text-[--color-text-secondary]',
  operational: 'text-[--color-success-text]',
  degraded:    'text-[--color-warning-text]',
  outage:      'text-[--color-error-text]',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [overall, setOverall]   = useState<OverallStatus>('loading');
  const [services, setServices] = useState<ServicesHealthResponse['services'] | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const result = await fetchHealth();
      if (!cancelled) {
        setOverall(result.overall);
        setServices(result.services);
        setCheckedAt(result.checkedAt);
      }
    }

    void check();

    // Refresh every 60 s so the page stays current without a reload.
    const interval = setInterval(() => { void check(); }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Fall back to showing all services as operational/degraded when the
  // /services endpoint isn't yet available (outage or network error).
  const fallbackHealth: ServiceHealth = overall === 'operational' ? 'operational' : 'degraded';

  const displayServices: Record<string, ServiceHealth> = services
    ? (services as Record<string, ServiceHealth>)
    : Object.fromEntries(
        (Object.keys(SERVICE_LABELS) as Array<keyof typeof SERVICE_LABELS>).map((k) => [k, fallbackHealth]),
      );

  return (
    <div className="min-h-screen bg-[--color-surface]">
      <header className="border-b border-[--color-border-subtle]">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-sm text-[--color-text-primary]">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold bg-[--color-accent]">
              OA
            </span>
            OfferAccept
          </Link>
          {checkedAt && (
            <p className="text-xs text-[--color-text-muted]">
              Updated {checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">

        {/* Overall status banner */}
        <div className={`rounded-xl px-6 py-5 mb-10 flex items-center gap-4 border ${BANNER_CLASS[overall]}`}>
          <BannerIcon status={overall} />
          <div>
            <p className={`text-lg font-semibold ${BANNER_TITLE_CLASS[overall]}`}>
              {BANNER_TITLE[overall]}
            </p>
            <p className={`text-sm mt-0.5 ${BANNER_BODY_CLASS[overall]}`}>
              {BANNER_BODY[overall]}
            </p>
          </div>
        </div>

        {/* Per-service status */}
        <h2 className="text-sm font-semibold mb-3 text-[--color-text-primary]">
          Services
        </h2>
        <div className="rounded-xl divide-y divide-[--color-border-subtle] border border-[--color-border] mb-10">
          {(Object.keys(SERVICE_LABELS) as Array<keyof typeof SERVICE_LABELS>).map((key) => (
            <div
              key={key}
              className="flex items-center justify-between px-5 py-3.5"
            >
              <span className="text-sm text-[--color-text-secondary]">
                {SERVICE_LABELS[key]}
              </span>
              {overall === 'loading' ? (
                <span className="text-xs text-[--color-text-muted]">Checking…</span>
              ) : (
                <ServiceStatusBadge status={(displayServices[key] as ServiceHealth) ?? 'operational'} />
              )}
            </div>
          ))}
        </div>

        {/* Incident history */}
        <h2 className="text-sm font-semibold mb-3 text-[--color-text-primary]">
          Incident history
        </h2>
        {INCIDENTS.length === 0 ? (
          <p className="text-sm text-[--color-text-muted]">No incidents in the past 90 days.</p>
        ) : (
          <div className="space-y-4">
            {INCIDENTS.map((inc, i) => (
              <div
                key={i}
                className="rounded-lg px-5 py-4 border border-[--color-border]"
              >
                <div className="flex items-start justify-between gap-4 mb-1.5">
                  <p className="text-sm font-medium text-[--color-text-primary]">{inc.title}</p>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      inc.severity === 'resolved'
                        ? 'bg-[--color-success-light] text-[--color-success-text]'
                        : 'bg-[--color-warning-light] text-[--color-warning-text]'
                    }`}
                  >
                    {inc.severity.charAt(0).toUpperCase() + inc.severity.slice(1)}
                  </span>
                </div>
                <p className="text-xs mb-1 text-[--color-text-muted]">{inc.date}</p>
                <p className="text-sm text-[--color-text-secondary]">{inc.body}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="px-6 py-4 text-center text-xs border-t border-[--color-border-subtle] text-[--color-text-muted]">
        For incidents contact{' '}
        <a
          href="mailto:support@offeraccept.com"
          className="text-[--color-info] transition-colors"
        >
          support@offeraccept.com
        </a>
      </footer>
    </div>
  );
}
