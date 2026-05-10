import Link from 'next/link';
import type { Metadata } from 'next';
import { NoPricingPlansClient } from './PricingPlansClient';
import { OfferAcceptLogo } from '@/components/brand/OfferAcceptLogo';

export const metadata: Metadata = {
  title: 'Priser — OfferAccept',
  description:
    'Enkel, transparent prising i NOK. Start gratis med 3 avtaler per måned. Oppgrader når du vokser.',
};

export default function NoPricingPage() {
  return (
    <div className="min-h-screen bg-(--color-surface) text-(--color-text-primary) flex flex-col">
      <NoPricingNav />
      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Enkel, ærlig prising</h1>
          <p className="text-(--color-text-muted) text-base max-w-md mx-auto leading-relaxed">
            Start gratis. Inget kredittkort nødvendig. Oppgrader når volumet øker.
          </p>
        </div>

        <NoPricingPlansClient />
        <NoUsageGuidance />
        <NoFeatureTable />
        <NoFaq />
        <NoLegal />
      </main>
      <NoPricingFooter />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function NoPricingNav() {
  return (
    <header className="sticky top-0 z-30 bg-(--color-surface)/90 backdrop-blur border-b border-(--color-border-subtle)">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/no" className="rounded focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2">
          <OfferAcceptLogo size="sm" priority />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
          >
            Logg inn
          </Link>
          <Link
            href="/login?mode=signup"
            className="text-sm font-medium text-white bg-(--color-accent) hover:bg-(--color-accent-hover) transition-colors px-3 py-1.5 rounded-lg"
          >
            Kom i gang →
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Usage guidance ───────────────────────────────────────────────────────────

function NoUsageGuidance() {
  return (
    <div className="mb-12 max-w-2xl mx-auto rounded-xl border border-(--color-border) bg-(--color-surface) px-8 py-6">
      <h3 className="text-sm font-bold text-(--color-text-primary) uppercase tracking-wide mb-5 text-center">
        Når bør du bruke OfferAccept?
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-semibold text-(--color-success-text) uppercase tracking-wide mb-3">
            Passer til
          </p>
          <ul className="space-y-2">
            {['Tilbud og pristilbud', 'Kundegodkjenninger', 'Tilbudsbrevaksept', 'Dokumentbekreftelser'].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
                <span className="text-(--color-success) font-bold" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-3">
            Ikke laget for
          </p>
          <ul className="space-y-2">
            {[
              'Formelle juridiske signaturer',
              'Regulerte avtaler som krever e-signatur',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-(--color-text-secondary)">
                <span className="text-red-400 font-bold flex-shrink-0 mt-0.5" aria-hidden="true">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Feature table ────────────────────────────────────────────────────────────

const FEATURES = [
  { label: 'Avtaler per måned',            free: '3',       starter: '20',      pro: '75',       ent: '250'       },
  { label: 'Akseptsertifikater',           free: '✓',       starter: '✓',       pro: '✓',        ent: '✓'         },
  { label: 'SHA-256 revisjonsspor',        free: '✓',       starter: '✓',       pro: '✓',        ent: '✓'         },
  { label: 'Last ned PDF-sertifikat',      free: '✓',       starter: '✓',       pro: '✓',        ent: '✓'         },
  { label: 'Tredjeparts verifisering',     free: '✓',       starter: '✓',       pro: '✓',        ent: '✓'         },
  { label: 'Dokumentvedlegg',             free: '✓',       starter: '✓',       pro: '✓',        ent: '✓'         },
  { label: 'Purringer til mottaker',      free: '—',       starter: '✓',       pro: '✓',        ent: '✓'         },
  { label: 'API-tilgang',                 free: '—',       starter: '—',       pro: '✓',        ent: '✓'         },
  { label: 'Webhooks',                    free: '—',       starter: '—',       pro: '✓',        ent: '✓'         },
  { label: 'Teammedlemmer',               free: '1',       starter: '3',       pro: '10',       ent: 'Ubegrenset' },
  { label: 'Databehandleravtale (DPA)',    free: '—',       starter: '—',       pro: '✓',        ent: '✓'         },
  { label: 'Support',                     free: 'E-post',  starter: 'E-post',  pro: 'Prioritet', ent: 'Prioritet' },
];

const COL_HEADERS = ['Funksjon', 'Gratis', 'Starter', 'Team', 'Business'];

function NoFeatureTable() {
  return (
    <div className="mb-16">
      <h2 className="text-xl font-bold mb-6 text-center text-(--color-text-primary)">
        Fullstendig funksjonssammenligning
      </h2>
      <div className="overflow-x-auto rounded-xl border border-(--color-border) shadow-sm">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="bg-(--color-bg) border-b border-(--color-border-subtle)">
              {COL_HEADERS.map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide ${
                    i === 0
                      ? 'text-left text-(--color-text-muted) w-1/3'
                      : 'text-center text-(--color-text-secondary)'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((row, i) => (
              <tr
                key={row.label}
                className={i % 2 === 0 ? 'bg-(--color-surface)' : 'bg-(--color-bg)'}
              >
                <td className="px-5 py-3 text-(--color-text-secondary) font-medium">
                  {row.label}
                </td>
                {([row.free, row.starter, row.pro, row.ent] as string[]).map((val, j) => (
                  <td key={j} className="px-5 py-3 text-center">
                    <span
                      className={
                        val === '✓' || (!val.includes('—') && val !== '')
                          ? 'text-(--color-success-text) font-medium'
                          : 'text-(--color-text-muted)'
                      }
                    >
                      {val}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'Er OfferAccept en juridisk e-signaturplattform?',
    a: 'Nei. OfferAccept registrerer verifiserbart bevis på at en mottaker aksepterte et dokument — det er ikke en kvalifisert elektronisk signaturtjeneste under EU-forordning 910/2014 (eIDAS). For situasjoner som krever en juridisk bindende signatur, bruk en kvalifisert e-signaturleverandør.',
  },
  {
    q: 'Hva skjer når jeg når den månedlige avtalekvoten?',
    a: 'Nye avtaler kan ikke sendes før neste faktureringssyklus nullstiller tellingen din, eller du oppgraderer. Eksisterende avtaler og sertifikater er fortsatt tilgjengelige uavhengig av plan.',
  },
  {
    q: 'Trenger mottakerne en konto?',
    a: 'Nei. Mottakere får en sikker e-postlenke. De går gjennom dokumentet, bekrefter e-posten via en engangskode og bekrefter — ingen konto, ingen app, inget passord.',
  },
  {
    q: 'Hvor lenge oppbevares akseptsertifikater?',
    a: 'Sertifikater og underliggende bevisdata oppbevares i minst 10 år etter aksept. Uforanderlige bevistabeller slettes aldri.',
  },
  {
    q: 'Kan jeg eksportere dataene mine?',
    a: 'Ja. Hvert sertifikat kan eksporteres som et frittstående JSON-objekt med det kryptografiske beviset. SHA-256-hashen lar enhver tredjepart verifisere posten uavhengig, uten å kontakte OfferAccept.',
  },
  {
    q: 'Finnes det en databehandleravtale (DPA)?',
    a: 'En DPA er tilgjengelig på Team- og Business-planene. Kontakt oss på privacy@offeraccept.com for å be om en.',
  },
];

function NoFaq() {
  return (
    <div className="mb-16">
      <h2 className="text-xl font-bold mb-8 text-center text-(--color-text-primary)">
        Ofte stilte spørsmål
      </h2>
      <div className="max-w-2xl mx-auto space-y-6">
        {FAQ_ITEMS.map((item) => (
          <div key={item.q} className="border-b border-(--color-border-subtle) pb-6 last:border-0">
            <p className="text-sm font-semibold text-(--color-text-primary) mb-2">{item.q}</p>
            <p className="text-sm text-(--color-text-secondary) leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Legal footnote ───────────────────────────────────────────────────────────

function NoLegal() {
  return (
    <div className="text-center border-t border-(--color-border-subtle) pt-10">
      <p className="text-xs text-(--color-text-muted) max-w-lg mx-auto leading-relaxed mb-2">
        OfferAccept er ikke en kvalifisert elektronisk signaturtjeneste under EU-forordning 910/2014 (eIDAS).
        Den juridiske virkningen av en akseptpost avhenger av loven som regulerer den underliggende avtalen.
      </p>
      <div className="flex items-center justify-center gap-4 mt-3">
        <Link href="/privacy" className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors">
          Personvernerklæring
        </Link>
        <Link href="/terms" className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors">
          Vilkår for bruk
        </Link>
        <Link href="/contact" className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors">
          Kontakt
        </Link>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function NoPricingFooter() {
  return (
    <footer className="border-t border-(--color-border-subtle) py-6 mt-8">
      <p className="text-center text-xs text-(--color-text-muted)">
        © 2026 OfferAccept. Alle rettigheter forbeholdt.
      </p>
    </footer>
  );
}
