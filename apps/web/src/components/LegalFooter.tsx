import Link from 'next/link';

// ─── LegalFooter ──────────────────────────────────────────────────────────────
// Global trust and legal links shown on all public-facing pages.
// Keeps legal/security documents discoverable from every page.

export function LegalFooter() {
  return (
    <footer className="border-t border-[--color-border] bg-white px-6 py-5 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[--color-text-muted]">
        <span className="font-medium text-gray-500">
          © {new Date().getFullYear()} OfferAccept
        </span>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          aria-label="Legal and security links"
        >
          <Link
            href="/legal/terms"
            className="hover:text-gray-700 transition-colors"
          >
            Terms of service
          </Link>
          <span className="text-[--color-border] select-none" aria-hidden="true">·</span>
          <Link
            href="/legal/gdpr"
            className="hover:text-gray-700 transition-colors"
          >
            Privacy & GDPR
          </Link>
          <span className="text-[--color-border] select-none" aria-hidden="true">·</span>
          <Link
            href="/security/evidence-model"
            className="hover:text-gray-700 transition-colors"
          >
            Evidence model
          </Link>
          <span className="text-[--color-border] select-none" aria-hidden="true">·</span>
          <Link
            href="/legal/acceptance-statement"
            className="hover:text-gray-700 transition-colors"
          >
            Acceptance statement
          </Link>
          <span className="text-[--color-border] select-none" aria-hidden="true">·</span>
          <a
            href="mailto:legal@offeraccept.com"
            className="hover:text-gray-700 transition-colors"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
