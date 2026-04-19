import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bevismodell og hash-kjede — OfferAccept',
  description:
    'Evidence Model Whitepaper v1.0. Explains the OfferAccept cryptographic evidence model: immutable tables, certificate hash computation, three levels of verification, and what the model proves.',
};

export default function EvidenceModelPage() {
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
          <div className="inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 mb-3">
            <span>Teknisk whitepaper</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Bevismodell og hash-kjede
          </h1>
          <p className="text-sm text-gray-500">Versjon 1.0</p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Formål</h2>
            <p>
              Dette dokumentet forklarer den tekniske bevismodellen i OfferAccept: hvilke data
              som lagres, hvordan de hashes, og hvordan tredjeparter kan verifisere et
              akseptsertifikat uavhengig av OfferAccept som mellomledd. Dokumentet er beregnet
              på juridiske rådgivere, tekniske integratorer og due diligence-gjennomganger.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              De fire uforanderlige tabellene
            </h2>
            <p className="mb-3">
              Tillitten i OfferAccept hviler på fire tabeller som er append-only — ingen del av
              applikasjonskoden utsteder{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">UPDATE</code> eller{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">DELETE</code> mot dem:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Tabell
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Innhold
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['AcceptanceRecord', 'Aksepthandlingen: verifisert e-post, erklæringstekst, tidsstempler, IP, nettleser'],
                    ['OfferSnapshot', 'Det frosne tilbudets innhold på sendingstidspunktet — uendret etter sending'],
                    ['OfferSnapshotDocument', 'SHA-256-hash per vedlegg på sendingstidspunktet'],
                    ['SigningEvent', 'Ordnet hendelseskjede: LINK_OPENED → OTP_ISSUED → OTP_VERIFIED → ACCEPTED'],
                  ].map(([table, content], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200 font-mono text-xs whitespace-nowrap">
                        {table}
                      </td>
                      <td className="py-2 px-3 border border-gray-200">{content}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Siden disse radene aldri endres, skal en hash beregnet i dag mot den levende
              databasen matche hashen beregnet på aksepttidspunktet — med mindre data har blitt
              manipulert.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Hash-beregning trinn for trinn
            </h2>

            <h3 className="font-medium text-gray-800 mb-2">
              Steg 1 — Tilbudet fryses ved sending
            </h3>
            <p className="mb-2">
              Når et tilbud sendes, opprettes en{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">OfferSnapshot</code> med{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">contentHash</code>:
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
              contentHash = SHA-256(canonical JSON av snapshot-feltene)
            </pre>
            <p className="mt-2 text-xs text-gray-500">
              Vedlagte dokumenter får hver sin{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">
                documentHash = SHA-256(filinnhold)
              </code>
              . Dokumenthashene inngår i snapshot-dataene og dermed i{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">contentHash</code>. En
              etterfølgende endring av et vedlegg er detekterbar fordi dokumenthashen ikke
              lenger stemmer.
            </p>

            <h3 className="font-medium text-gray-800 mb-2 mt-5">
              Steg 2 — Mottakeren aksepterer
            </h3>
            <p className="mb-2">
              Ved aksept bygges et{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">CertificatePayload</code> av
              alle felt fra{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">AcceptanceRecord</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">OfferSnapshot</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">OfferSnapshotDocument[]</code>{' '}
              og{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">OfferRecipient</code>.
              Deretter beregnes{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">certificateHash</code>:
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre">
{`function deepSortKeys(value) {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort()
        .map(k => [k, deepSortKeys(value[k])])
    );
  }
  return value;
}

const canonical = JSON.stringify(deepSortKeys(payload));
certificateHash = SHA-256(canonical, encoding='utf-8') // lowercase hex`}
            </pre>
            <ul className="mt-2 text-xs text-gray-500 space-y-1 list-disc pl-4">
              <li>Alle nøkler sorteres alfabetisk — rekursivt på alle nivåer</li>
              <li>
                Arrays beholder elementrekkefølge — dokumenter sorteres etter{' '}
                <code className="bg-gray-100 px-0.5 rounded">storageKey</code> før payload
                bygges
              </li>
              <li>Ingen whitespace i serialiseringen</li>
              <li>
                <code className="bg-gray-100 px-0.5 rounded">null</code>-verdier inkluderes —
                utelates aldri
              </li>
              <li>UTF-8-encoding</li>
            </ul>

            <h3 className="font-medium text-gray-800 mb-2 mt-5">
              Steg 3 — Canonical hash (lett fingeravtrykk)
            </h3>
            <p className="mb-2">
              I tillegg til{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">certificateHash</code>{' '}
              lagres en{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">canonicalHash</code> — et
              kompakt femfelts fingeravtrykk av selve aksepthandlingen:
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
{`SHA-256( JSON.stringify(deepSortKeys({
  acceptedAt,
  dealId,
  ipAddress,
  recipientEmail,
  userAgent
})) )`}
            </pre>
            <p className="mt-2 text-xs text-gray-500">
              En tredjepart som kun har disse fem verdiene kan verifisere aksepten uten tilgang
              til det fulle sertifikatet eller autentisert API-tilgang.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Verifisering — tre nivåer
            </h2>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                    Nivå 1
                  </span>
                  <span className="font-medium text-gray-800">
                    Offentlig verifisering (ingen autentisering)
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  <code className="bg-gray-100 px-1 rounded">GET /certificates/:id/verify</code>{' '}
                  returnerer kun hashes og booleans — ingen personopplysninger.
                </p>
                <pre className="bg-gray-50 rounded p-3 text-xs font-mono overflow-x-auto">
{`{
  "valid": true,
  "certificateHashMatch": true,
  "reconstructedHash": "a3f2...",
  "storedHash": "a3f2...",
  "snapshotIntegrity": true,
  "eventChainIntegrity": true,
  "anomaliesDetected": []
}`}
                </pre>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                    Nivå 2
                  </span>
                  <span className="font-medium text-gray-800">
                    Uavhengig lokal verifisering
                  </span>
                </div>
                <ol className="text-xs text-gray-600 space-y-1 list-decimal pl-4">
                  <li>
                    Kall{' '}
                    <code className="bg-gray-100 px-0.5 rounded">
                      GET /certificates/:id/export
                    </code>{' '}
                    (krever autentisering)
                  </li>
                  <li>
                    Motta <code className="bg-gray-100 px-0.5 rounded">payload</code> og{' '}
                    <code className="bg-gray-100 px-0.5 rounded">canonicalJson</code>
                  </li>
                  <li>
                    Beregn{' '}
                    <code className="bg-gray-100 px-0.5 rounded">SHA-256(canonicalJson)</code>{' '}
                    lokalt
                  </li>
                  <li>
                    Sammenlign med{' '}
                    <code className="bg-gray-100 px-0.5 rounded">certificateHash</code> i
                    responsen
                  </li>
                </ol>
                <p className="text-xs text-gray-500 mt-2">
                  Ingen avhengighet av OfferAccepts beregningslogikk.
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">
                    Nivå 3
                  </span>
                  <span className="font-medium text-gray-800">
                    Full rekonstruksjon fra rådata
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  En part med direkte databasetilgang kan rekonstruere{' '}
                  <code className="bg-gray-100 px-0.5 rounded">certificateHash</code> fra
                  bunnen ved å hente radene, kjøre{' '}
                  <code className="bg-gray-100 px-0.5 rounded">deepSortKeys</code>,
                  serialisere og hashe. Referanseimplementasjoner finnes i JavaScript og Python.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Hendelseskjede-validering
            </h2>
            <p className="mb-3">
              <code className="bg-gray-100 px-1 rounded text-xs">
                CertificateService.verify()
              </code>{' '}
              validerer den ordnede hendelseskjeden ved hvert verifiseringskall:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center font-mono text-xs">
              LINK_OPENED → OTP_ISSUED → OTP_VERIFIED → ACCEPTED
            </div>
            <ul className="mt-3 text-xs text-gray-600 space-y-1 list-disc pl-4">
              <li>LINK_OPENED eksisterer og er tidligst</li>
              <li>OTP_ISSUED etter LINK_OPENED</li>
              <li>OTP_VERIFIED etter OTP_ISSUED</li>
              <li>ACCEPTED etter OTP_VERIFIED</li>
              <li>Ingen ugyldige tilstandsoverganger</li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              Aksept uten forutgående OTP_VERIFIED flagges som ANOMALY i
              verifikasjonsresponsen.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Hva bevismodellen beviser — og ikke beviser
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h3 className="font-medium text-green-800 mb-2">✅ Beviser</h3>
                <ul className="text-xs text-green-700 space-y-1.5 list-disc pl-3">
                  <li>
                    En e-postadresse som mottok signeringslinken mottok og oppga en gyldig OTP
                  </li>
                  <li>OTP-verifisering fant sted før aksepthandlingen i hendelseskjeden</li>
                  <li>
                    Aksepten ble foretatt mot et spesifikt fryst tilbudsinnhold (ved
                    contentHash)
                  </li>
                  <li>
                    Erklæringsteksten mottakeren så er nøyaktig den teksten som er lagret i
                    sertifikatet
                  </li>
                  <li>Ingen modifikasjon av noe bevisfelt har funnet sted siden utstedelse</li>
                </ul>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="font-medium text-red-800 mb-2">❌ Beviser ikke</h3>
                <ul className="text-xs text-red-700 space-y-1.5 list-disc pl-3">
                  <li>
                    At den navngitte personen fysisk kontrollerte enheten — kun at noen med
                    tilgang til e-postkontoen gjennomførte aksepten
                  </li>
                  <li>At mottakeren leste eller forstod dokumentinnholdet</li>
                  <li>
                    At aksepten oppfyller kravene til et bindende rettsforhold i en bestemt
                    jurisdiksjon
                  </li>
                  <li>
                    Identitet utover «kontroll over e-postinnboksen på
                    OTP-verifiseringstidspunktet»
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <div className="pt-4 border-t border-gray-100 space-y-1">
            <p className="text-xs text-gray-500">
              Se også:{' '}
              <Link href="/legal/acceptance-statement" className="text-blue-600 hover:text-blue-700">
                Aksepterklæring
              </Link>{' '}
              ·{' '}
              <Link href="/legal/otp-verification" className="text-blue-600 hover:text-blue-700">
                OTP-identitetsverifisering
              </Link>
            </p>
            <p className="text-xs text-gray-400">
              Spørsmål om bevismodellen:{' '}
              <a href="mailto:legal@offeraccept.com" className="underline">
                legal@offeraccept.com
              </a>{' '}
              · Tekniske spørsmål:{' '}
              <a href="mailto:security@offeraccept.com" className="underline">
                security@offeraccept.com
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
