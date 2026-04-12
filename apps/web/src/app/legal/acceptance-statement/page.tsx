import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aksepterklæring — OfferAccept',
  description:
    'Acceptance Statement Specification v1.1. Exact wording, technical integrity guarantees, and eIDAS positioning for the OfferAccept acceptance statement.',
};

export default function AcceptanceStatementPage() {
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
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Aksepterklæring</h1>
          <p className="text-sm text-gray-500">
            Versjon 1.1 · Teknisk og juridisk spesifikasjon
          </p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              2.1 Den eksakte erklæringsteksten
            </h2>
            <p className="mb-3">
              Følgende tekst genereres av{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">buildAcceptanceStatement()</code>{' '}
              på serveren og er identisk i visningsflaten og i det lagrede sertifikatet:
            </p>
            <blockquote className="border-l-4 border-[--color-accent] pl-4 py-2 bg-gray-50 rounded-r-lg italic text-gray-800">
              «I, [Recipient Name], confirm that I have reviewed and accept the offer
              &quot;[Offer Title]&quot; presented by [Sender Name] ([Sender Email]). By
              confirming this acceptance, I acknowledge this action as my binding agreement to
              the terms presented.»
            </blockquote>
            <p className="mt-4 text-xs text-gray-500">
              <strong>Eksempel:</strong> «I, Kari Nordmann, confirm that I have reviewed and
              accept the offer &quot;Ansettelsestilbud – Seniorutvikler&quot; presented by
              Steinar Reilstad (steinar@bedrift.no). By confirming this acceptance, I
              acknowledge this action as my binding agreement to the terms presented.»
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              2.2 Hva mottakeren bekrefter
            </h2>
            <p>Ved å fullføre akseptflyten bekrefter mottakeren tre ting:</p>
            <ol className="list-decimal pl-5 space-y-1 mt-2">
              <li>
                At de har <strong>gjennomgått tilbudet</strong> slik det ble presentert i
                akseptgrensesnittet
              </li>
              <li>
                At de <strong>aksepterer tilbudet</strong> med den angitte tittelen fra den
                angitte avsenderen
              </li>
              <li>
                At handlingen er <strong>bindende</strong> — mottakeren anerkjenner dette som
                en bindende avtale
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              2.3 Hva erklæringen ikke bekrefter
            </h2>
            <p>Aksepterklæringen dokumenterer <strong>ikke</strong>:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>
                At mottakeren er den personen de hevder å være (kun at de kontrollerte den
                angitte e-postadressen på aksepttidspunktet)
              </li>
              <li>At mottakeren hadde rettslig handleevne</li>
              <li>At mottakeren handlet uten press eller tvang</li>
              <li>
                At innholdet i tilbudsdokumentet er juridisk bindende i alle jurisdiksjoner
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              2.4 Teknisk integritet
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Egenskap
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Implementasjon
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Serverside-generert', 'Klienten kontrollerer ingen del av erklæringsteksten'],
                    ['Visning = lagring', 'Samme funksjon brukes på begge steder; tester verifiserer byte-for-byte likhet'],
                    ['Frysing ved sending', 'Teksten bygges fra OfferSnapshot — fryst på sendingstidspunkt, ikke ved aksept'],
                    ['SHA-256-fingeravtrykk', 'Akseptposten hashes og lagres i sertifikatet — enhver endring er detekterbar'],
                    ['Tidsstempel separat', 'acceptedAt lagres separat i AcceptanceRecord — ikke innbakt i erklæringsteksten'],
                    ['OTP-koder', 'Lagres aldri i klartekst — kun kryptografisk SHA-256-hash av koden lagres'],
                  ].map(([prop, impl], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200 font-medium whitespace-nowrap">
                        {prop}
                      </td>
                      <td className="py-2 px-3 border border-gray-200">{impl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              2.5 Juridisk posisjonering (eIDAS)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Signaturnivå
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Krav
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      OfferAccept-status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">
                      SES — Enkel elektronisk signatur
                    </td>
                    <td className="py-2 px-3 border border-gray-200">
                      Ingen spesifikke tekniske krav
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-green-700">
                      ✅ Leverer bevis som kan utgjøre en SES
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-3 border border-gray-200 font-medium">
                      AdES — Avansert elektronisk signatur
                    </td>
                    <td className="py-2 px-3 border border-gray-200">
                      Knyttet til signereren, egnet til å identifisere
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-amber-700">
                      ⚠️ E-postbinding dokumentert, men ikke identitetsproofing
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">
                      QES — Kvalifisert elektronisk signatur
                    </td>
                    <td className="py-2 px-3 border border-gray-200">
                      Krever QTSP og godkjent sertifikat
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-red-700">
                      ❌ Leveres ikke av OfferAccept
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Se også:{' '}
              <Link href="/legal/otp-verification" className="text-blue-600 hover:text-blue-700">
                OTP-identitetsverifisering
              </Link>{' '}
              og{' '}
              <Link href="/security/evidence-model" className="text-blue-600 hover:text-blue-700">
                bevismodell og hash-kjede
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
