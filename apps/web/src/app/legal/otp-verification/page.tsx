import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OTP-identitetsverifisering — OfferAccept',
  description:
    'OTP Identity Verification Specification v1.1. Technical process, security parameters, what OTP verification proves, and eIDAS positioning.',
};

export default function OtpVerificationPage() {
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
            ← Tilbake
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            OTP-identitetsverifisering
          </h1>
          <p className="text-sm text-gray-500">
            Versjon 1.1 · Hva OTP-verifiseringen bekrefter og ikke bekrefter
          </p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              4.1 Hva er OTP-verifisering?
            </h2>
            <p>
              Før en mottaker kan akseptere et tilbud, gjennomfører systemet en obligatorisk
              e-post OTP-verifisering (engangspassord). Denne prosessen kan ikke omgås av
              mottakeren eller avsenderen.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              4.2 Teknisk prosess
            </h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Kode genereres med kryptografisk tilfeldig funksjon (
                <code className="bg-gray-100 px-1 rounded text-xs">crypto.randomInt</code>) —
                jevn sannsynlighetsfordeling over 900 000 mulige verdier
              </li>
              <li>
                Råkoden sendes til mottakerens e-postadresse via transaksjonell leverandør
              </li>
              <li>
                Kun SHA-256-hash lagres i databasen — råkoden eksisterer kun i minne og i
                e-postleveransen og lagres aldri i klartekst
              </li>
              <li>Mottakeren oppgir koden i grensesnittet</li>
              <li>
                Systemet beregner SHA-256 av oppgitt kode og sammenligner med lagret hash via
                timing-safe sammenligning (
                <code className="bg-gray-100 px-1 rounded text-xs">
                  crypto.timingSafeEqual
                </code>
                ) — forhindrer timing-angrep
              </li>
            </ol>

            <h3 className="font-medium text-gray-800 mt-5 mb-3">Sikkerhetsparametere</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Parameter
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Verdi
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Beskyttelse
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['OTP gyldighetstid', '10 minutter', 'Koden utløper automatisk'],
                    ['Maks forsøk per kode', '5 forsøk', 'Låses etter 5 feil'],
                    ['Skyvevindu for kumulativ låsing', '30 minutter', 'Telles på tvers av sesjoner'],
                    ['Kumulativ låsegrense', '10 feil', 'Mottakeren låses 30 minutter'],
                    ['Koderom', '100 000–999 999 (6 sifre)', 'Uniform fordeling'],
                    ['Lagringsformat', 'SHA-256-hash', 'Råkode aldri i database'],
                  ].map(([param, val, prot], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200 font-medium">{param}</td>
                      <td className="py-2 px-3 border border-gray-200">{val}</td>
                      <td className="py-2 px-3 border border-gray-200">{prot}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Ny OTP-forespørsel ugyldiggjør eksisterende ventende koder for samme sesjon — to
              aktive koder kan aldri eksistere simultaneously for samme akseptflyt.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              4.3 Hva OTP-verifiseringen bekrefter
            </h2>
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="font-medium text-green-800">
                OTP-verifiseringen bekrefter ett og bare ett faktum:
              </p>
              <p className="mt-1 text-green-700">
                At den personen som fullførte akseptflyten hadde{' '}
                <strong>kontroll over den oppgitte e-postadressen</strong> på det tidspunktet
                aksepten fant sted.
              </p>
            </div>
            <p className="mt-3">Dette understøttes av hendelsesloggen:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Tidsstempel for OTP-utsteding og OTP-verifisering</li>
              <li>IP-adresse og nettleserinformasjon på verifikasjonstidspunktet</li>
              <li>
                Den fullstendige hendelseskjeden (SigningEvent) med SHA-256-kjedeintegritet
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              4.4 Hva OTP-verifiseringen ikke bekrefter
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Det er ikke
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Forklaring
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Personidentitetsverifisering', 'Systemet verifiserer ikke at e-postinnehaveren er den oppgitte personen'],
                    ['BankID / eIDAS', 'Ingen kobling til nasjonale identitetsregistre'],
                    ['Kvalifisert elektronisk signatur', 'OfferAccept er ikke et QTSP'],
                    ['Sikker mot delt innboks', 'Hvem som helst med tilgang til e-postkontoen kan fullføre aksept'],
                  ].map(([what, why], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200 font-medium">{what}</td>
                      <td className="py-2 px-3 border border-gray-200">{why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              4.5 Juridisk posisjonering (eIDAS)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Nivå
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Krav
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      OfferAccept
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">SES</td>
                    <td className="py-2 px-3 border border-gray-200">
                      Ingen spesifikke tekniske krav
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-green-700">
                      ✅ Leverer dokumentasjon som kan utgjøre SES
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-3 border border-gray-200 font-medium">AdES</td>
                    <td className="py-2 px-3 border border-gray-200">
                      Knyttet til signereren, egnet til å identifisere
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-amber-700">
                      ⚠️ E-postbinding dokumentert — ikke identitetsproofing
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">QES</td>
                    <td className="py-2 px-3 border border-gray-200">
                      Krever QTSP og godkjent sertifikat
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-red-700">
                      ❌ Leveres ikke
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Etter norsk avtalelov § 1 kreves ikke spesifikk form for at avtaler er bindende
              med mindre det er særskilt bestemt i lov. E-post OTP-basert aksept vil i de
              fleste ordinære kommersielle avtaler og arbeidsavtaler anses som tilstrekkelig.
              For høyverdi-kontrakter anbefales supplerende BankID-verifisering.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              4.6 Revisjonslogg og etterprøvbarhet
            </h2>
            <p className="mb-3">
              Alle hendelser loggføres i{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">SigningEvent</code>-tabellen
              med kjedeintegritet:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Hendelsestype
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Hva logges
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['OTP_ISSUED', 'Tidsstempel, kanal, maskert leveringsadresse'],
                    ['OTP_ATTEMPT_FAILED', 'Forsøksteller'],
                    ['OTP_MAX_ATTEMPTS', 'Utlåst etter 5 feil'],
                    ['OTP_VERIFIED', 'Tidsstempel, IP, nettleser, challenge-ID'],
                  ].map(([event, logged], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200 font-mono text-xs">
                        {event}
                      </td>
                      <td className="py-2 px-3 border border-gray-200">{logged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              CertificateService.verify() validerer hendelseskjeden ved hvert
              verifiseringskall — aksept uten forutgående OTP_VERIFIED flagges som anomali.
            </p>
          </section>

          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Se også:{' '}
              <Link href="/security/evidence-model" className="text-blue-600 hover:text-blue-700">
                Bevismodell og hash-kjede
              </Link>{' '}
              ·{' '}
              <Link
                href="/legal/acceptance-statement"
                className="text-blue-600 hover:text-blue-700"
              >
                Aksepterklæring
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
