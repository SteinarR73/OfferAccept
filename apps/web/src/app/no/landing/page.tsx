import Link from 'next/link';
import type { Metadata } from 'next';
import { OfferAcceptLogo } from '@/components/brand/OfferAcceptLogo';

export const metadata: Metadata = {
  title: 'OfferAccept — Verifiserbart bevis på aksept',
  description:
    'OfferAccept beviser at en bestemt person aksepterte et bestemt dokument på et bestemt tidspunkt — tidsstemplet, e-postverifisert og uavhengig verifiserbart.',
};

const DEMO_HREF = '/login?mode=signup';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NoLandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-(--color-surface) text-(--color-text-primary)">
      <NoLandingNav />
      <main>
        <NoHero />
        <NoTrustStrip />
        <NoNotEsignature />
        <NoBeforeAfter />
        <NoHowItWorks />
        <NoCertificateSection />
        <NoIndependentVerification />
        <NoWhoItsFor />
        <NoRecipientFriction />
        <NoSelfTestSection />
        <NoPricing />
        <NoFaq />
        <NoFinalCta />
        <NoLegalClarification />
      </main>
      <NoLandingFooter />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function NoLandingNav() {
  return (
    <header className="sticky top-0 z-30 bg-(--color-surface)/90 backdrop-blur border-b border-(--color-border-subtle)">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/no" className="rounded focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2">
          <OfferAcceptLogo size="sm" priority />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded px-1"
          >
            Logg inn
          </Link>
          <Link
            href={DEMO_HREF}
            className="text-sm font-medium text-white bg-(--color-accent) hover:bg-(--color-accent-hover) transition-colors px-3 py-1.5 rounded-lg focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
          >
            Prøv gratis →
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function NoHero() {
  return (
    <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-(--color-text-primary) leading-tight mb-5">
        Når noen sier «jeg godtar» på e-post,
        <br className="hidden sm:block" />
        <span className="text-(--color-accent)"> har du ingenting.</span>
      </h1>

      <p className="text-lg text-(--color-text-muted) max-w-2xl mx-auto mb-8 leading-relaxed">
        OfferAccept gir deg bevis — en tidsstemplet, e-postverifisert aksept
        knyttet til det nøyaktige dokumentet de godtok.
      </p>

      <div className="flex items-center justify-center gap-3 flex-wrap mb-6">
        <Link
          href={DEMO_HREF}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-medium hover:bg-(--color-accent-hover) transition-colors shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          Send deg selv en test — få ditt første sertifikat på 60 sekunder
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center gap-1 px-5 py-2.5 rounded-lg border border-(--color-border) text-sm font-medium text-(--color-text-secondary) hover:bg-(--color-bg) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          Se hvordan det fungerer
        </a>
      </div>

      <div className="flex items-center justify-center gap-5 flex-wrap text-xs text-(--color-text-muted)">
        {[
          'Mottaker trenger ingen konto',
          'Tar under 60 sekunder',
          'Uavhengig verifisering inkludert',
        ].map((item) => (
          <span key={item} className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-(--color-accent)" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </span>
        ))}
      </div>

      <div
        className="mt-14 max-w-2xl mx-auto rounded-xl border border-(--color-border) shadow-md overflow-hidden"
        aria-hidden="true"
      >
        <div className="bg-(--color-neutral-surface) flex items-center gap-1.5 px-4 py-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="flex-1 ml-2 h-5 bg-(--color-surface) rounded text-[10px] text-(--color-text-muted) flex items-center px-3">
            offeraccept.com/accept/oa_abc123…
          </span>
        </div>
        <div className="bg-(--color-surface) px-6 py-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              OA
            </div>
            <div>
              <p className="text-xs font-semibold text-(--color-text-primary)">Acme AS har sendt deg et tilbud</p>
              <p className="text-xs text-(--color-text-muted) mt-0.5">Senioringeniør — Q1 2026</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            {['Tilbudssammendrag.pdf', 'Kompensasjonssammendrag.pdf'].map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--color-bg) border border-(--color-border-subtle)"
              >
                <span className="w-6 h-6 rounded bg-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">
                  PDF
                </span>
                <span className="text-xs text-(--color-text-secondary)">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-9 rounded-lg bg-(--color-accent) flex items-center justify-center text-xs text-white font-medium">
              Les gjennom og godta
            </div>
            <div className="flex-1 h-9 rounded-lg border border-(--color-border) flex items-center justify-center text-xs text-(--color-text-muted)">
              Avslå
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ──────────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  { label: 'OTP-verifisert identitet', desc: 'Mottakers e-post bekreftet før aksept' },
  { label: 'Manipuleringssikre sertifikater', desc: 'SHA-256 hash-kjede' },
  { label: 'Tredjeparts verifiserbar', desc: 'Alle kan verifisere — ingen konto nødvendig' },
  { label: 'Tidsbegrensede lenker', desc: 'Akseptlenker utløper automatisk' },
];

function NoTrustStrip() {
  return (
    <section aria-label="Tillitsindikatorer" className="border-y border-(--color-border-subtle) bg-(--color-bg)">
      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TRUST_ITEMS.map((t) => (
          <div key={t.label} className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-(--color-accent) flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-(--color-text-primary)">{t.label}</p>
              <p className="text-[11px] text-(--color-text-muted)">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Not e-signature ──────────────────────────────────────────────────────────

function NoNotEsignature() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-6">
        Dette er ikke e-signaturprogramvare
      </h2>
      <p className="text-base text-(--color-text-muted) mb-5 leading-relaxed">
        OfferAccept gjør én ting:
      </p>
      <p className="text-lg font-medium text-(--color-text-primary) mb-8 max-w-xl mx-auto leading-relaxed">
        Det beviser at en bestemt person, med en bestemt e-postadresse, aksepterte et
        bestemt dokument — på et bestemt tidspunkt.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
        {[
          'Ikke en kontraktplattform',
          'Ikke en kvalifisert elektronisk signatur',
          'Ikke juridisk automatisering',
        ].map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-bg) px-3.5 py-1.5 text-sm text-(--color-text-secondary)"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {item}
          </span>
        ))}
      </div>
      <p className="text-sm font-medium text-(--color-text-secondary) border-l-4 border-(--color-accent) pl-4 text-left max-w-lg mx-auto leading-relaxed">
        Det er bevis på aksept — bygget for situasjoner der e-post ikke er nok.
      </p>
    </section>
  );
}

// ─── Before / After ───────────────────────────────────────────────────────────

function NoBeforeAfter() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">Hva som faktisk endrer seg</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-red-500 mb-4">Før: e-postaksept</p>
            <ul className="space-y-3">
              {[
                'Kunden svarer «ser bra ut»',
                'E-posttråden videresendes, redigeres eller går tapt',
                'Ingen bevis på hvilken versjon de så',
                'Tvister blir ditt problem',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-red-700">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-4">Etter: OfferAccept</p>
            <ul className="space-y-3">
              {[
                'Du sender én lenke',
                'De bekrefter e-posten med en engangskode',
                'De klikker Godta',
                'Du får et sertifikat med tidsstempel, verifisert e-post, dokumenthash og revisjonsspor',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-emerald-700">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 text-center text-sm font-medium text-(--color-text-secondary) max-w-lg mx-auto leading-relaxed">
          Hvis noen senere sier «det var ikke det jeg godtok» — har du bevis.
        </p>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const HOW_STEPS = [
  { n: '1', title: 'Send', desc: 'Last opp dokumentet ditt og send en sikker lenke.' },
  { n: '2', title: 'Bekreft', desc: 'Mottakeren bekrefter e-posten og klikker Godta.' },
  { n: '3', title: 'Få bevis', desc: 'Et sertifikat genereres automatisk — nedlastbart og verifiserbart.' },
];

function NoHowItWorks() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">Slik fungerer det</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        {HOW_STEPS.map((step) => (
          <div key={step.n} className="flex flex-col items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-(--color-accent) flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {step.n}
            </div>
            <h3 className="font-semibold text-(--color-text-primary)">{step.title}</h3>
            <p className="text-sm text-(--color-text-muted) leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-(--color-text-muted)">
        Ingen innlogging. Ingen app. Ingen friksjon for mottakeren din.
      </p>
    </section>
  );
}

// ─── Certificate section ──────────────────────────────────────────────────────

const CERT_ITEMS = [
  'Mottakers e-post, verifisert med engangskode',
  'Nøyaktig aksepttidsstempel',
  'IP-adresse og enhetsinformasjon',
  'Nøyaktig dokumentversjon, SHA-256-hashet',
  'Aksepterklæringen vist på tidspunktet',
  'Full kryptografisk hash av hele posten',
];

function NoCertificateSection() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-4">
              Et sertifikat du kan stole på
            </h2>
            <p className="text-sm text-(--color-text-muted) mb-6 leading-relaxed">
              Hver aksept produserer en post som inneholder:
            </p>
            <ul className="space-y-3 mb-8">
              {CERT_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-(--color-text-secondary)">
                  <svg className="w-4 h-4 text-(--color-accent) flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold text-(--color-text-primary)">
              Alle kan verifisere det — selv uten OfferAccept.
            </p>
          </div>

          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) shadow-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-(--color-border-subtle) bg-(--color-success-light)">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-(--color-success) flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-(--color-success-text)">Akseptsertifikat</span>
              </div>
              <span className="text-[10px] text-(--color-text-muted)">OfferAccept</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: 'Avtale', value: 'Senioringeniør — Q1 2026' },
                { label: 'Akseptert', value: '22. mars 2026 kl. 14:32 UTC' },
                { label: 'Av', value: '████████@bedrift.no' },
                { label: 'Metode', value: 'OTP-verifisert e-post' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4">
                  <span className="text-xs text-(--color-text-muted) w-20 flex-shrink-0 pt-0.5">{label}</span>
                  <span className="text-xs text-(--color-text-primary) font-medium">{value}</span>
                </div>
              ))}
              <div className="border-t border-(--color-border-subtle) pt-3 space-y-2">
                {[
                  { label: 'Sertifikat-ID', value: 'cert_01HX2K9A…' },
                  { label: 'SHA-256', value: 'a3f1b9c2d4e5f6a7…' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-4">
                    <span className="text-xs text-(--color-text-muted) w-20 flex-shrink-0 pt-0.5">{label}</span>
                    <code className="text-[11px] text-(--color-text-secondary) font-mono">{value}</code>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-(--color-border-subtle) bg-(--color-bg)">
              <Link href="/verify" className="text-xs text-(--color-accent) font-medium hover:text-(--color-accent-hover) transition-colors">
                Verifiser et sertifikat →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Independent verification ──────────────────────────────────────────────────

function NoIndependentVerification() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-5">
        Uavhengig verifisering — online eller offline
      </h2>
      <p className="text-base text-(--color-text-muted) mb-8 leading-relaxed max-w-xl mx-auto">
        Hvert sertifikat inneholder en SHA-256-hash. Den fullstendige posten er innebygd som JSON
        i PDF-en, slik at alle kan beregne hashen på nytt og verifisere integriteten.
      </p>
      <p className="text-base font-semibold text-(--color-text-primary) border-l-4 border-(--color-accent) pl-4 text-left max-w-lg mx-auto leading-relaxed">
        Du trenger ikke å «stole på oss.» Matematikken beviser det.
      </p>
    </section>
  );
}

// ─── Who it's for ─────────────────────────────────────────────────────────────

const GOOD_FIT = [
  'Tilbud, pristilbud og arbeidsomfang',
  'Kundegodkjenninger',
  'Tilbudsbrev der akseptbevis er tilstrekkelig',
  'Policy- eller dokumentbekreftelser',
];

const NOT_FIT = [
  'Regulerte kontrakter som krever formelle signaturer',
  'Innkjøpsprosesser i store selskaper som krever godkjente e-signaturleverandører',
  'Situasjoner som krever kvalifiserte e-signaturer',
  'Juridisk automatisering eller kontraktshåndtering',
];

function NoWhoItsFor() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">Hvem OfferAccept er for</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-4">Godt egnet</p>
            <ul className="space-y-3">
              {GOOD_FIT.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-emerald-700">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-4">Ikke egnet</p>
            <ul className="space-y-3">
              {NOT_FIT.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Recipient friction ───────────────────────────────────────────────────────

function NoRecipientFriction() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-5">
        Mottakeren din trenger ingen konto
      </h2>
      <p className="text-base text-(--color-text-muted) mb-8 leading-relaxed">
        De åpner en lenke, bekrefter e-posten og klikker Godta. Det er alt.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {[
          'Ingen konto',
          'Ingen app',
          'Ingen nedlasting',
          'De fleste prosesser er ferdig på under ett minutt',
        ].map((item) => (
          <span
            key={item}
            className="rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm text-(--color-text-secondary) font-medium"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Self-test section ────────────────────────────────────────────────────────

function NoSelfTestSection() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-4">
          Prøv det selv — før du sender til noen andre
        </h2>
        <p className="text-base text-(--color-text-muted) mb-8 leading-relaxed">
          Send en test til din egen e-post og opplev nøyaktig hva mottakeren din ser.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Link
            href={DEMO_HREF}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-(--color-accent) text-white font-semibold text-sm hover:bg-(--color-accent-hover) transition-colors shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
          >
            Send en testavtale nå
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <p className="text-xs text-(--color-text-muted)">Inget kredittkort. Tar 30–60 sekunder.</p>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: 'Gratis',
    price: 'Gratis',
    sub: '',
    items: [
      '3 avtaler per måned',
      'Fullstendige akseptsertifikater',
      'Verifisering inkludert',
    ],
    cta: 'Start gratis',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '149 NOK',
    sub: '/mnd, fakturert årlig',
    items: [
      '20 avtaler per måned',
      'Purringer til mottaker',
      'For frilansere og små bedrifter',
    ],
    cta: 'Start Starter',
    highlight: true,
  },
  {
    name: 'Team',
    price: '399 NOK',
    sub: '/mnd, fakturert årlig',
    items: [
      '75 avtaler per måned',
      'For små team',
      'Prioritetssupport',
    ],
    cta: 'Start Team',
    highlight: false,
  },
  {
    name: 'Business',
    price: '899 NOK',
    sub: '/mnd, fakturert årlig',
    items: [
      '250 avtaler per måned',
      'API + webhooks',
      'DPA-støtte',
    ],
    cta: 'Start Business',
    highlight: false,
  },
] as const;

function NoPricing() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">
          Start gratis. Oppgrader når du trenger mer.
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-xl border p-5 flex flex-col gap-4 ${
              plan.highlight
                ? 'border-(--color-accent) bg-(--color-surface) shadow-md ring-1 ring-(--color-accent)'
                : 'border-(--color-border) bg-(--color-surface)'
            }`}
          >
            {plan.highlight && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-(--color-accent)">
                Mest populær
              </span>
            )}
            <div>
              <p className="font-semibold text-(--color-text-primary) mb-1">{plan.name}</p>
              <p className="text-2xl font-bold text-(--color-text-primary)">{plan.price}</p>
              {plan.sub && (
                <p className="text-xs text-(--color-text-muted) mt-0.5">{plan.sub}</p>
              )}
            </div>
            <ul className="space-y-2 flex-1">
              {plan.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-(--color-text-secondary)">
                  <svg
                    className="w-4 h-4 text-(--color-accent) flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href={DEMO_HREF}
              className={`text-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                plan.highlight
                  ? 'bg-(--color-accent) text-white hover:bg-(--color-accent-hover)'
                  : 'border border-(--color-border) text-(--color-text-secondary) hover:bg-(--color-bg)'
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-(--color-text-muted) mb-3">
        Gratis plan tilgjengelig — oppgrader når du trenger mer.
      </p>
      <p className="text-center">
        <Link
          href="/no/pricing"
          className="text-sm text-(--color-accent) font-medium hover:text-(--color-accent-hover) transition-colors"
        >
          Se full prisliste →
        </Link>
      </p>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'Er dette juridisk bindende?',
    a: 'OfferAccept registrerer akseptbevis. Den juridiske virkningen avhenger av jurisdiksjon, dokumenttype og brukstilfelle.',
  },
  {
    q: 'Er dette det samme som DocuSign?',
    a: 'Nei. DocuSign er for signaturer. OfferAccept er for å bevise aksept når e-post ikke er nok.',
  },
  {
    q: 'Hva er det egentlig som verifiseres?',
    a: 'OfferAccept verifiserer kontroll over mottakerens e-postadresse på aksepttidspunktet ved hjelp av en engangskode.',
  },
  {
    q: 'Kan noen forfalske dette?',
    a: 'De ville trenge tilgang til mottakerens e-post på aksepttidspunktet. Hendelseskjeden, dokumenthashen og sertifikatdataene er registrert og verifiserbare.',
  },
] as const;

function NoFaq() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) text-center mb-12">
          Vanlige spørsmål
        </h2>
        <dl className="space-y-4">
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-(--color-border) bg-(--color-surface) p-6"
            >
              <dt className="font-semibold text-(--color-text-primary) mb-2">{item.q}</dt>
              <dd className="text-sm text-(--color-text-muted) leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function NoFinalCta() {
  return (
    <section className="bg-(--color-accent) py-20">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-3">
          Slutt å stole på «jeg godtar»-e-poster
        </h2>
        <p className="text-white/80 text-base mb-8">Få bevis i stedet.</p>
        <Link
          href={DEMO_HREF}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-(--color-accent) font-semibold text-sm hover:bg-(--color-accent-light) transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-accent)"
        >
          Send din første test nå
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </section>
  );
}

// ─── Legal clarification ──────────────────────────────────────────────────────

function NoLegalClarification() {
  return (
    <section aria-label="Juridisk informasjon" className="border-t border-(--color-border-subtle) bg-(--color-bg)">
      <div className="max-w-3xl mx-auto px-6 py-10 text-center">
        <p className="text-sm text-(--color-text-secondary) leading-relaxed mb-2">
          OfferAccept registrerer verifiserbart bevis på at et dokument ble akseptert.
        </p>
        <p className="text-sm text-(--color-text-secondary) leading-relaxed mb-4">
          Det er ikke en kvalifisert elektronisk signaturtjeneste under EU-forordning 910/2014 (eIDAS).
          Den juridiske virkningen av en akseptpost avhenger av loven som regulerer avtalen mellom partene.
        </p>
        <p className="text-xs text-(--color-text-muted)">
          Mottakere som har spørsmål om den juridiske statusen til en akseptpost bør søke uavhengig juridisk rådgivning.
        </p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function NoLandingFooter() {
  return (
    <footer className="border-t border-(--color-border-subtle) py-8">
      <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-(--color-text-muted)">© 2026 OfferAccept. Alle rettigheter forbeholdt.</p>
        <nav className="flex items-center gap-4" aria-label="Bunntekstnavigasjon">
          {[
            { label: 'Priser', href: '/no/pricing' },
            { label: 'Personvern', href: '/privacy' },
            { label: 'Vilkår', href: '/terms' },
            { label: 'Kontakt', href: '/contact' },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
