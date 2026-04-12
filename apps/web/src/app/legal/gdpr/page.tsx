import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Personvern og GDPR — OfferAccept',
  description:
    'OfferAccept GDPR Processing Statement (v1.1). Roles, legal bases, categories of personal data, retention periods, sub-processors, and data subject rights.',
};

export default function GdprPage() {
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
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Tilbake
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Personvern og GDPR</h1>
          <p className="text-sm text-gray-500">
            Versjon 1.1 · GDPR behandlingsgrunnlag og behandleroversikt
          </p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              3.1 Roller etter GDPR
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Rolle
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Part
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">
                      Behandlingsansvarlig
                    </td>
                    <td className="py-2 px-3 border border-gray-200">
                      Kunden — organisasjonen som sender tilbud via OfferAccept
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-3 border border-gray-200 font-medium">Databehandler</td>
                    <td className="py-2 px-3 border border-gray-200">
                      OfferAccept — behandler data utelukkende etter instruks fra
                      behandlingsansvarlig
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">Underbehandlere</td>
                    <td className="py-2 px-3 border border-gray-200">
                      Se punkt 3.5 — godkjent skriftlig, endringer varsles
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">3.2 Behandlingsgrunnlag</h2>
            <h3 className="font-medium text-gray-800 mb-1 mt-3">
              For behandlingsansvarlig (Kunden)
            </h3>
            <p>
              Kunden behandler mottakernes personopplysninger primært med hjemmel i{' '}
              <strong>GDPR artikkel 6 nr. 1 bokstav b</strong> — behandlingen er nødvendig for
              å oppfylle en avtale som mottakeren er part i, eller for å gjennomføre tiltak på
              mottakerens forespørsel før avtaleinngåelse. For rene B2B-tilbud kan{' '}
              <strong>artikkel 6 nr. 1 bokstav f</strong> (berettiget interesse i å dokumentere
              avtaleinngåelse) også være aktuelt. Kunden er ansvarlig for å kartlegge og
              dokumentere sitt eget grunnlag og informere mottakerne etter artikkel 13/14.
            </p>
            <h3 className="font-medium text-gray-800 mb-1 mt-3">
              For OfferAccept som databehandler
            </h3>
            <p>
              OfferAccept behandler personopplysninger utelukkende på instruks fra
              behandlingsansvarlig, jf. GDPR artikkel 28, undergitt databehandleravtalen (DPA).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              3.3 Kategorier av personopplysninger og formål
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Kategori
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Formål
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Grunnlag
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Mottakers navn og e-post', 'Levering, OTP-verifisering, sertifikat', 'Art. 28-instruks'],
                    ['IP-adresse og nettleserdata', 'Bevislogg, sikkerhet og misbruksvern', 'Berettiget interesse (bevisintegritet)'],
                    ['OTP-verifiseringspost (kun hash — aldri råkode)', 'Bevis for e-postkontroll', 'Art. 28-instruks'],
                    ['Tidsstempel for aksept (UTC)', 'Sertifikatinnhold, bevislogg', 'Art. 28-instruks'],
                    ['Tilbudstittel og akseptbeslutning', 'Sertifikatinnhold', 'Art. 28-instruks'],
                  ].map(([cat, purpose, basis], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200">{cat}</td>
                      <td className="py-2 px-3 border border-gray-200">{purpose}</td>
                      <td className="py-2 px-3 border border-gray-200 whitespace-nowrap">
                        {basis}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              OTP-koder lagres aldri i klartekst. Kun en kryptografisk SHA-256-hash av koden
              lagres i databasen.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              3.4 Datalagring, sletting og begrensning
            </h2>
            <div className="overflow-x-auto mb-4">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Datatype
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Oppbevaringstid
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Begrunnelse
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Akseptsertifikat og akseptpost', 'Min. 7 år etter aksept', 'Dokumentasjonsformål, potensielle rettslige tvister'],
                    ['Signeringslogger og hendelseslogg', '18 måneder aktiv, deretter arkiv', 'Operasjonell integritet og revisjon'],
                    ['Sesjonsinformasjon og OTP-data', 'Slettes etter fullført flyt / utløp', 'Minimumsprinsippet (GDPR art. 5(1)(e))'],
                    ['Kontodata', 'Aktiv kontoperiode + 30 dager etter oppsigelse', 'Nødvendig for tjenestens drift'],
                  ].map(([type, period, reason], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200">{type}</td>
                      <td className="py-2 px-3 border border-gray-200 whitespace-nowrap">
                        {period}
                      </td>
                      <td className="py-2 px-3 border border-gray-200">{reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="font-medium text-gray-800 mb-1">
              Rett til sletting — GDPR artikkel 17
            </h3>
            <p>
              Registrerte kan sende slettingsforespørsel via{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">
                POST /api/v1/account/erasure-request
              </code>
              . Der sletting er uforenlig med rettslige forpliktelser eller
              dokumentasjonsformål, vil behandlingen begrenses i stedet for at data slettes,
              jf. GDPR artikkel 17 nr. 3 bokstav b og e. Akseptsertifikater faller inn under
              denne kategorien — sletting ville ugyldiggjøre sertifikatets SHA-256-fingeravtrykk
              og ødelegge bevisintegriteten.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3.5 Underbehandlere</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Underbehandler
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Tjeneste
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Overføringsgrunnlag
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Skyinfrastruktur (hosting/database)', 'Applikasjons- og databasehosting', 'EØS eller under SCCs'],
                    ['Transaksjonell e-post (Resend)', 'OTP-levering og varsler', 'EØS eller under SCCs'],
                    ['Betalingsprosessering (Stripe)', 'Abonnementsfakturering', 'SCCs'],
                  ].map(([proc, svc, basis], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200">{proc}</td>
                      <td className="py-2 px-3 border border-gray-200">{svc}</td>
                      <td className="py-2 px-3 border border-gray-200">{basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              3.6 Internasjonale overføringer
            </h2>
            <p>
              Overføringer av personopplysninger fra EØS skjer under
              Standardkontraktsklausuler (SCCs) vedtatt av EU-kommisjonen
              (Kommisjonsbeslutning 2021/914). En signert kopi av SCC-ene er tilgjengelig på
              forespørsel fra{' '}
              <a
                href="mailto:privacy@offeraccept.com"
                className="text-blue-600 hover:text-blue-700"
              >
                privacy@offeraccept.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              3.7 Den registrertes rettigheter
            </h2>
            <p>
              Mottakere kan utøve følgende rettigheter overfor behandlingsansvarlig (Kunden):
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>
                <strong>Innsyn</strong> (art. 15) — hvilke opplysninger behandles
              </li>
              <li>
                <strong>Retting</strong> (art. 16) — korrigere uriktige opplysninger
              </li>
              <li>
                <strong>Sletting</strong> (art. 17) — der dette ikke er i konflikt med
                bevissikringsformål
              </li>
              <li>
                <strong>Begrensning</strong> (art. 18) — begrenset behandling der sletting
                ikke er mulig
              </li>
              <li>
                <strong>Dataportabilitet</strong> (art. 20) — eksport via{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">
                  GET /api/v1/account/export
                </code>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              3.8 Datatilsyn og klagerett
            </h2>
            <p>
              Registrerte har rett til å klage til{' '}
              <a
                href="https://www.datatilsynet.no"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700"
              >
                Datatilsynet
              </a>{' '}
              i Norge, eller til nasjonal datatilsynsmyndighet i sitt eget EU/EØS-land.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
