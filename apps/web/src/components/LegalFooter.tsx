import Link from 'next/link';

// ─── LegalFooter ──────────────────────────────────────────────────────────────
// Global trust and legal links shown on all public-facing pages.
// Keeps legal/security documents discoverable from every page.

const DOT = (
  <span className="text-(--color-border) select-none" aria-hidden="true">
    ·
  </span>
);

export function LegalFooter() {
  return (
    <footer className="border-t border-(--color-border) bg-white px-6 py-6 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col gap-4 text-xs text-(--color-text-muted)">
        {/* Top row: product links */}
        <nav
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          aria-label="Product links"
        >
          <Link href="/help" className="hover:text-gray-700 transition-colors">
            Help &amp; FAQ
          </Link>
          {DOT}
          <Link href="/pricing" className="hover:text-gray-700 transition-colors">
            Pricing
          </Link>
          {DOT}
          <Link href="/changelog" className="hover:text-gray-700 transition-colors">
            Changelog
          </Link>
          {DOT}
          <Link href="/contact" className="hover:text-gray-700 transition-colors">
            Contact
          </Link>
          {DOT}
          <Link href="/security" className="hover:text-gray-700 transition-colors">
            Security
          </Link>
        </nav>

        {/* Bottom row: legal links */}
        <nav
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          aria-label="Legal links"
        >
          <Link href="/legal/terms" className="hover:text-gray-700 transition-colors">
            Terms of service
          </Link>
          {DOT}
          <Link href="/legal/gdpr" className="hover:text-gray-700 transition-colors">
            Privacy &amp; GDPR
          </Link>
          {DOT}
          <Link href="/legal/cookies" className="hover:text-gray-700 transition-colors">
            Cookie policy
          </Link>
          {DOT}
          <Link href="/legal/aup" className="hover:text-gray-700 transition-colors">
            Acceptable use
          </Link>
          {DOT}
          <Link href="/legal/dpa" className="hover:text-gray-700 transition-colors">
            DPA
          </Link>
          {DOT}
          <Link href="/legal/subprocessors" className="hover:text-gray-700 transition-colors">
            Sub-processors
          </Link>
          {DOT}
          <Link href="/security/evidence-model" className="hover:text-gray-700 transition-colors">
            Evidence model
          </Link>
          {DOT}
          <Link href="/legal/acceptance-statement" className="hover:text-gray-700 transition-colors">
            Acceptance statement
          </Link>
        </nav>

        <p className="text-center font-medium text-gray-400">
          © {new Date().getFullYear()} OfferAccept
        </p>
      </div>
    </footer>
  );
}
