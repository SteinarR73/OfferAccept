import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy — OfferAccept',
  description:
    'OfferAccept Cookie Policy (v1.0). Documents every cookie the service sets, its purpose, type, and duration.',
};

// ─── Layout helper ────────────────────────────────────────────────────────────

function LegalPageShell({
  title,
  version,
  effectiveLabel,
  children,
}: {
  title: string;
  version: string;
  effectiveLabel: string;
  children: React.ReactNode;
}) {
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
          <p className="text-sm text-gray-500">
            Version {version} · {effectiveLabel}
          </p>
        </div>
        <div className="prose prose-sm prose-gray max-w-none leading-relaxed">
          {children}
        </div>
      </main>
    </div>
  );
}

// ─── Cookie table ─────────────────────────────────────────────────────────────

function CookieTable({
  rows,
}: {
  rows: { name: string; type: string; purpose: string; duration: string; provider: string }[];
}) {
  return (
    <div className="overflow-x-auto not-prose my-6">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <th className="py-2 pr-4 w-40">Name</th>
            <th className="py-2 pr-4 w-28">Type</th>
            <th className="py-2 pr-4">Purpose</th>
            <th className="py-2 pr-4 w-32">Duration</th>
            <th className="py-2 w-28">Provider</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.name} className="align-top">
              <td className="py-3 pr-4 font-mono text-xs text-gray-800 whitespace-nowrap">{r.name}</td>
              <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{r.type}</td>
              <td className="py-3 pr-4 text-gray-600">{r.purpose}</td>
              <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{r.duration}</td>
              <td className="py-3 text-gray-600">{r.provider}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CookiePolicyPage() {
  return (
    <LegalPageShell
      title="Cookie Policy"
      version="1.0"
      effectiveLabel="Effective from launch"
    >
      <section>
        <h2>1. What are cookies?</h2>
        <p>
          Cookies are small text files that a website stores in your browser when you visit it.
          They allow the site to remember information about your visit across page loads and
          sessions. The ePrivacy Directive (2009/136/EC) and the General Data Protection
          Regulation (GDPR) require us to tell you which cookies we set and why.
        </p>
      </section>

      <section>
        <h2>2. How OfferAccept uses cookies</h2>
        <p>
          OfferAccept uses only a small number of first-party cookies. We do{' '}
          <strong>not</strong> use third-party advertising cookies, cross-site tracking, or
          fingerprinting. We do not share cookie data with advertisers.
        </p>
        <p>
          Because all cookies we set are either strictly necessary for the service to function
          or used to remember a preference you explicitly set, they are exempt from opt-in
          consent requirements under the ePrivacy Directive. You can still configure or clear
          them through your browser settings at any time.
        </p>
      </section>

      <section>
        <h2>3. Cookies we set</h2>

        <h3>3.1 Strictly necessary cookies</h3>
        <p>
          These cookies are required to operate the service. The site cannot authenticate you or
          protect against forgery without them. They are set only when you sign in.
        </p>
        <CookieTable
          rows={[
            {
              name: 'oa_access',
              type: 'Strictly necessary',
              purpose:
                'Carries your encrypted access token. Used to verify your identity on each authenticated request. HttpOnly, SameSite=Strict.',
              duration: '15 minutes',
              provider: 'OfferAccept',
            },
            {
              name: 'oa_refresh',
              type: 'Strictly necessary',
              purpose:
                'Carries your encrypted refresh token. Used to silently renew your access token without re-entering your password. HttpOnly, SameSite=Strict.',
              duration: '7 days',
              provider: 'OfferAccept',
            },
            {
              name: 'oa_sess',
              type: 'Strictly necessary',
              purpose:
                'A non-secret, non-HttpOnly flag that tells the browser JavaScript whether a session is active. Contains no authentication credential — used to decide whether to show the login or dashboard view without a round-trip.',
              duration: 'Session (until browser closes)',
              provider: 'OfferAccept',
            },
          ]}
        />

        <h3>3.2 Functional cookies</h3>
        <p>
          These cookies remember a preference you have set. They are not strictly required for
          the service to work, but removing them means you will need to re-select your
          preference on every visit.
        </p>
        <CookieTable
          rows={[
            {
              name: 'oa_locale',
              type: 'Functional',
              purpose:
                'Stores your display language preference (en or no). Set automatically based on your browser language or when you switch language. Not tied to your identity.',
              duration: '1 year',
              provider: 'OfferAccept',
            },
          ]}
        />

        <h3>3.3 Analytics and advertising cookies</h3>
        <p>
          We do not set analytics or advertising cookies at this time. If this changes in the
          future, we will update this policy, notify logged-in users, and obtain consent where
          required by law.
        </p>
      </section>

      <section>
        <h2>4. Recipient sessions</h2>
        <p>
          When a recipient accesses a document via a secure link, the acceptance flow stores a
          temporary, one-time signing session in a strictly necessary cookie for the duration of
          that flow only. This cookie contains no personal data beyond the opaque session
          identifier. It expires when the browser tab closes or after the signing flow completes.
        </p>
      </section>

      <section>
        <h2>5. How to manage cookies</h2>
        <p>
          You can view, block, or delete cookies through your browser settings. Links to
          instructions for common browsers:
        </p>
        <ul>
          <li>
            <a
              href="https://support.google.com/chrome/answer/95647"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Chrome
            </a>
          </li>
          <li>
            <a
              href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox"
              target="_blank"
              rel="noopener noreferrer"
            >
              Mozilla Firefox
            </a>
          </li>
          <li>
            <a
              href="https://support.apple.com/en-gb/guide/safari/sfri11471/mac"
              target="_blank"
              rel="noopener noreferrer"
            >
              Apple Safari
            </a>
          </li>
          <li>
            <a
              href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge"
              target="_blank"
              rel="noopener noreferrer"
            >
              Microsoft Edge
            </a>
          </li>
        </ul>
        <p>
          Blocking the strictly necessary cookies listed in §3.1 will prevent you from signing
          in. Blocking <code>oa_locale</code> will not affect core functionality, but your
          language preference will reset on each visit.
        </p>
      </section>

      <section>
        <h2>6. Changes to this policy</h2>
        <p>
          If we introduce new cookies — particularly any that require consent — we will update
          this page and notify signed-in users by email at least 14 days before the change takes
          effect.
        </p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>
          Questions about our cookie use can be sent to{' '}
          <a href="mailto:privacy@offeraccept.com">privacy@offeraccept.com</a>.
        </p>
        <p>
          See also our{' '}
          <Link href="/legal/gdpr">Privacy &amp; GDPR statement</Link> and{' '}
          <Link href="/legal/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalPageShell>
  );
}
