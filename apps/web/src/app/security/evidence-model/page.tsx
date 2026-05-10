import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Evidence Model — OfferAccept',
  description:
    'How OfferAccept constructs tamper-evident acceptance records: immutable tables, SHA-256 hash chain, three verification levels, and offline verification instructions.',
};

// ─── Evidence Model ───────────────────────────────────────────────────────────
// Audience: lawyers, auditors, compliance reviewers, skeptical SMB owners.
// Tone: technical but readable. No blockchain language. No security buzzwords.

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
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 mb-3">
            Technical reference — v1.0
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Evidence Model</h1>
          <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
            This document explains how OfferAccept builds tamper-evident acceptance records: which
            data is stored, how it is fingerprinted, and how any third party can verify a
            certificate independently — without contacting OfferAccept. Written for legal advisors,
            technical integrators, and due-diligence reviewers.
          </p>
        </div>

        <div className="space-y-10 text-sm text-gray-700 leading-relaxed">

          {/* ── Identity claim ───────────────────────────────────────────────── */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="font-semibold text-amber-900 mb-1">Important scope statement</p>
            <p className="text-amber-800">
              OfferAccept verifies control of an email inbox — not legal identity. The acceptance
              record proves that someone who could receive and read email at a given address
              completed the acceptance flow. It does not prove who that person is in the legal sense.
            </p>
          </div>

          {/* ── Four immutable tables ─────────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              The four immutable tables
            </h2>
            <p className="mb-3">
              The trust foundation of OfferAccept rests on four database tables that are
              append-only. No application code issues{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">UPDATE</code> or{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">DELETE</code> statements
              against them:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Table
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      What it stores
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['AcceptanceRecord', 'The acceptance event: verified email, acceptance statement text, timestamps, IP address, browser/device string'],
                    ['OfferSnapshot', 'A frozen copy of the document content at the time it was sent — unchanged after dispatch'],
                    ['OfferSnapshotDocument', 'SHA-256 hash of each file attachment at the time of sending'],
                    ['SigningEvent', 'Ordered event chain: LINK_OPENED → OTP_ISSUED → OTP_VERIFIED → ACCEPTED'],
                  ].map(([table, content], i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3 border border-gray-200 font-mono text-xs whitespace-nowrap">
                        {table}
                      </td>
                      <td className="py-2 px-3 border border-gray-200 text-xs">{content}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Because these rows are never modified, a hash computed today against the live
              database should match the hash computed at the time of acceptance — unless the data
              has been tampered with.
            </p>
          </section>

          {/* ── OTP verification ─────────────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              OTP email verification
            </h2>
            <p className="mb-3">
              Before a recipient can accept, they must complete a one-time-code (OTP) step:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 mb-3">
              <li>The recipient opens the acceptance link and requests the document.</li>
              <li>
                A 6-digit code is generated, hashed with SHA-256, and stored. The raw code is
                sent to the recipient&apos;s email address and is never stored in plain text.
              </li>
              <li>
                The recipient enters the code. The system hashes the submitted value and compares
                it against the stored hash. On match, an{' '}
                <code className="bg-gray-100 px-0.5 rounded text-xs">OTP_VERIFIED</code> signing
                event is recorded.
              </li>
              <li>Only after OTP_VERIFIED can the acceptance step be reached.</li>
            </ol>
            <p className="text-xs text-gray-500">
              The OTP step proves that someone who could receive and read email at the recipient
              address was present at the time of acceptance. It does not prove legal identity.
            </p>
          </section>

          {/* ── Hash computation ─────────────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              How the certificate hash is computed
            </h2>

            <h3 className="font-medium text-gray-800 mb-2">Step 1 — Document snapshot frozen at sending</h3>
            <p className="mb-2">
              When a document is sent, an{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">OfferSnapshot</code> is created
              with a <code className="bg-gray-100 px-1 rounded text-xs">contentHash</code>:
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
              contentHash = SHA-256(canonical JSON of snapshot fields)
            </pre>
            <p className="mt-2 text-xs text-gray-500">
              Each attached file receives its own{' '}
              <code className="bg-gray-100 px-0.5 rounded">documentHash = SHA-256(file contents)</code>.
              Those document hashes feed into the snapshot and therefore into the{' '}
              <code className="bg-gray-100 px-0.5 rounded">contentHash</code>. Any subsequent
              change to an attachment is detectable because the document hash no longer matches.
            </p>

            <h3 className="font-medium text-gray-800 mb-2 mt-5">Step 2 — Recipient accepts</h3>
            <p className="mb-2">
              On acceptance, a{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">CertificatePayload</code> is
              assembled from all fields in{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">AcceptanceRecord</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">OfferSnapshot</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">OfferSnapshotDocument[]</code>,
              and <code className="bg-gray-100 px-1 rounded text-xs">OfferRecipient</code>. The
              certificate hash is then computed:
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
              <li>All keys are sorted alphabetically — recursively at every level</li>
              <li>Arrays preserve element order; documents are sorted by <code className="bg-gray-100 px-0.5 rounded">storageKey</code> before the payload is built</li>
              <li>No whitespace in the serialised string</li>
              <li><code className="bg-gray-100 px-0.5 rounded">null</code> values are included — never omitted</li>
              <li>UTF-8 encoding</li>
            </ul>

            <h3 className="font-medium text-gray-800 mb-2 mt-5">Step 3 — Canonical fingerprint (lightweight)</h3>
            <p className="mb-2">
              In addition to <code className="bg-gray-100 px-1 rounded text-xs">certificateHash</code>,
              a <code className="bg-gray-100 px-1 rounded text-xs">canonicalHash</code> is stored —
              a compact five-field fingerprint of the acceptance event itself:
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
              A third party with only these five values can verify the acceptance without access to
              the full certificate or any authenticated API.
            </p>
          </section>

          {/* ── Verification levels ───────────────────────────────────────────── */}
          <section id="independent-verification">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Verification — three levels
            </h2>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                    Level 1
                  </span>
                  <span className="font-medium text-gray-800">
                    Public verification (no authentication required)
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Any third party can call{' '}
                  <code className="bg-gray-100 px-1 rounded">GET /certificates/:id/verify</code>.
                  The response contains only hashes and boolean flags — no personal data.
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
                <p className="text-xs text-gray-500 mt-2">
                  The verification UI at{' '}
                  <Link href="/verify" className="text-blue-600 hover:text-blue-700">
                    offeraccept.com/verify
                  </Link>{' '}
                  calls this endpoint. No account needed.
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                    Level 2
                  </span>
                  <span className="font-medium text-gray-800">
                    Local independent verification (offline-capable)
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  The acceptance certificate PDF embeds the full canonical JSON payload. To verify
                  without contacting OfferAccept:
                </p>
                <ol className="text-xs text-gray-600 space-y-1.5 list-decimal pl-4">
                  <li>Open the PDF and extract the embedded JSON (visible in the evidence annex section)</li>
                  <li>Apply the <code className="bg-gray-100 px-0.5 rounded">deepSortKeys</code> function described above</li>
                  <li>Serialise with <code className="bg-gray-100 px-0.5 rounded">JSON.stringify</code> (no whitespace)</li>
                  <li>Compute <code className="bg-gray-100 px-0.5 rounded">SHA-256</code> of the UTF-8 string using any standard tool</li>
                  <li>Compare the result against the <code className="bg-gray-100 px-0.5 rounded">certificateHash</code> printed on the certificate</li>
                </ol>
                <p className="text-xs text-gray-500 mt-2">
                  A match confirms the record has not been altered since issuance. This verification
                  requires no internet connection and no OfferAccept account.
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">
                    Level 3
                  </span>
                  <span className="font-medium text-gray-800">
                    Full reconstruction from source data
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  A party with direct database access can reconstruct{' '}
                  <code className="bg-gray-100 px-0.5 rounded">certificateHash</code> from scratch
                  by fetching the raw rows, running{' '}
                  <code className="bg-gray-100 px-0.5 rounded">deepSortKeys</code>, serialising, and
                  hashing. This provides the strongest possible guarantee against infrastructure-level
                  tampering.
                </p>
              </div>
            </div>
          </section>

          {/* ── Event chain validation ────────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Event chain validation
            </h2>
            <p className="mb-3">
              Every verification call validates the ordered signing event chain:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center font-mono text-xs tracking-wide">
              LINK_OPENED → OTP_ISSUED → OTP_VERIFIED → ACCEPTED
            </div>
            <ul className="mt-3 text-xs text-gray-600 space-y-1 list-disc pl-4">
              <li>LINK_OPENED exists and is the earliest event</li>
              <li>OTP_ISSUED occurs after LINK_OPENED</li>
              <li>OTP_VERIFIED occurs after OTP_ISSUED</li>
              <li>ACCEPTED occurs after OTP_VERIFIED</li>
              <li>No invalid state transitions are present</li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              An acceptance without a preceding OTP_VERIFIED event is flagged as an ANOMALY in
              the verification response. This indicates a data integrity issue that warrants
              investigation.
            </p>
          </section>

          {/* ── What it proves / doesn't prove ───────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              What the evidence model proves — and does not prove
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h3 className="font-semibold text-green-800 mb-2">What it proves</h3>
                <ul className="text-xs text-green-700 space-y-1.5 list-disc pl-3">
                  <li>An email address that received the acceptance link also provided a valid OTP — confirming inbox access at that moment</li>
                  <li>OTP verification occurred before the acceptance event in the signing chain</li>
                  <li>The acceptance was made against a specific frozen document snapshot (identified by its content hash)</li>
                  <li>The acceptance statement text shown to the recipient is exactly the text stored in the certificate</li>
                  <li>No field in the evidence record has been modified since the certificate was issued</li>
                </ul>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="font-semibold text-red-800 mb-2">What it does not prove</h3>
                <ul className="text-xs text-red-700 space-y-1.5 list-disc pl-3">
                  <li>That the named recipient physically controlled the device — only that someone with access to the email account completed the flow</li>
                  <li>That the recipient read or understood the document content</li>
                  <li>That the acceptance satisfies the requirements for a legally binding agreement in any particular jurisdiction</li>
                  <li>Identity beyond "control of the email inbox at the time of OTP verification"</li>
                </ul>
              </div>
            </div>
          </section>

          {/* ── Footer links ──────────────────────────────────────────────────── */}
          <div className="pt-4 border-t border-gray-100 space-y-1.5">
            <p className="text-xs text-gray-500">
              See also:{' '}
              <Link href="/legal/acceptance-statement" className="text-blue-600 hover:text-blue-700">
                Acceptance statement specification
              </Link>{' '}
              ·{' '}
              <Link href="/legal/otp-verification" className="text-blue-600 hover:text-blue-700">
                OTP verification specification
              </Link>{' '}
              ·{' '}
              <Link href="/verify" className="text-blue-600 hover:text-blue-700">
                Verify a certificate
              </Link>
            </p>
            <p className="text-xs text-gray-400">
              Questions about the evidence model:{' '}
              <a href="mailto:legal@offeraccept.com" className="underline">
                legal@offeraccept.com
              </a>{' '}
              · Technical questions:{' '}
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
