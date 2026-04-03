import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Certificate Hash Specification — OfferAccept',
  description:
    'Technical specification for independently reproducing OfferAccept certificate hashes.',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-base font-semibold text-gray-900 mt-10 mb-3 scroll-mt-6">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-900 mt-6 mb-2">{children}</h3>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-gray-950 text-gray-100 rounded-lg p-5 text-xs font-mono leading-relaxed overflow-x-auto my-4 whitespace-pre">
      {children}
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-blue-300 bg-blue-50 px-4 py-3 rounded-r-lg my-4 text-sm text-blue-900">
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CertificateHashSpecPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <span className="w-7 h-7 rounded-lg bg-[--color-accent] flex items-center justify-center text-white text-xs font-bold">
              OA
            </span>
            OfferAccept
          </Link>
          <Link href="/verify" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            Verify a certificate →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-[--color-accent] uppercase tracking-wide mb-2">
            Technical Specification
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Certificate Hash Specification
          </h1>
          <p className="text-sm text-gray-500">
            Version 1.0 — effective from initial release
          </p>
          <p className="text-sm text-gray-700 mt-4 leading-relaxed">
            This document describes how OfferAccept computes certificate hashes, enabling any
            third party to independently reproduce and verify a certificate hash without access
            to OfferAccept infrastructure.
          </p>
        </div>

        {/* Table of contents */}
        <nav className="rounded-xl border border-gray-200 px-5 py-4 mb-10">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Contents
          </p>
          <ol className="space-y-1.5 text-sm text-blue-700">
            {[
              ['#purpose', '1. Purpose'],
              ['#payload-structure', '2. Canonical payload structure'],
              ['#serialization', '3. Serialization rules'],
              ['#hash-algorithm', '4. Hash algorithm'],
              ['#verification-procedure', '5. Verification procedure'],
              ['#canonical-acceptance-hash', '6. Canonical acceptance hash'],
              ['#independence', '7. Independence guarantee'],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="hover:underline">{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1. Purpose */}
        <H2 id="purpose">1. Purpose</H2>
        <p className="text-sm text-gray-700 leading-relaxed">
          OfferAccept acceptance certificates are sealed with a SHA-256 hash computed over a
          deterministic canonical JSON representation of the acceptance evidence. This hash is
          stored in the <Code>AcceptanceCertificate</Code> record and included in confirmation
          emails and PDF exports.
        </p>
        <p className="text-sm text-gray-700 leading-relaxed mt-3">
          Because the hash algorithm and field structure are fully specified here, any party in
          possession of a certificate payload can reproduce the hash independently — without
          calling OfferAccept APIs — and confirm that the evidence has not been altered since
          issuance.
        </p>

        {/* 2. Payload structure */}
        <H2 id="payload-structure">2. Canonical payload structure</H2>
        <p className="text-sm text-gray-700 leading-relaxed">
          The certificate payload is a JSON object with the following fields. All fields are
          present in every certificate; nullable fields appear as <Code>null</Code> rather than
          being omitted.
        </p>
        <Pre>{`{
  "acceptance": {
    "acceptedAt": "<ISO 8601 UTC timestamp>",
    "emailVerifiedAt": "<ISO 8601 UTC timestamp>",
    "ipAddress": "<IPv4 or IPv6 string, or null>",
    "locale": "<BCP 47 locale string, or null>",
    "statement": "<verbatim acceptance statement text>",
    "timezone": "<IANA timezone string, or null>",
    "userAgent": "<HTTP User-Agent string, or null>",
    "verifiedEmail": "<recipient email verified by OTP>"
  },
  "certificateId": "<UUID v4>",
  "documents": [
    {
      "filename": "<original filename>",
      "mimeType": "<MIME type>",
      "sha256Hash": "<hex SHA-256 of file content>",
      "sizeBytes": <integer>
    }
  ],
  "issuedAt": "<ISO 8601 UTC timestamp>",
  "issuer": "OfferAccept",
  "issuerVersion": "1.0",
  "offer": {
    "expiresAt": "<ISO 8601 UTC timestamp, or null>",
    "message": "<offer message text, or null>",
    "sentAt": "<ISO 8601 UTC timestamp when offer was frozen>",
    "snapshotContentHash": "<hex SHA-256 of frozen offer content>",
    "title": "<offer title>"
  },
  "recipient": {
    "name": "<recipient display name>",
    "verifiedEmail": "<recipient email verified by OTP>"
  },
  "sender": {
    "email": "<sender email address>",
    "name": "<sender display name>"
  }
}`}</Pre>

        <Note>
          <strong>Document ordering:</strong> elements in the <Code>documents</Code> array
          are sorted by their <Code>storageKey</Code> (an internal object-storage key) using
          lexicographic order before hashing. The <Code>storageKey</Code> itself is{' '}
          <em>not</em> included in the hash. The sort order is deterministic: the same set of
          documents always produces the same array order.
        </Note>

        {/* 3. Serialization */}
        <H2 id="serialization">3. Serialization rules</H2>
        <p className="text-sm text-gray-700 leading-relaxed">
          The canonical JSON string is produced by applying the following rules:
        </p>
        <ol className="mt-3 space-y-3 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="font-semibold text-gray-400 flex-shrink-0">1.</span>
            <span>
              <strong>Deep key sort:</strong> All object keys at every nesting level are sorted
              alphabetically (Unicode code-point order, equivalent to JavaScript&rsquo;s default
              string comparison). Arrays preserve element order — only object keys are sorted.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-gray-400 flex-shrink-0">2.</span>
            <span>
              <strong>No whitespace:</strong> <Code>JSON.stringify</Code> is called without a
              replacer or space argument. No newlines, no indentation.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-gray-400 flex-shrink-0">3.</span>
            <span>
              <strong>UTF-8 encoding:</strong> The string is hashed as UTF-8 bytes.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-gray-400 flex-shrink-0">4.</span>
            <span>
              <strong>Null preservation:</strong> Fields with <Code>null</Code> values are
              serialized as <Code>null</Code> — they are not omitted from the JSON.
            </span>
          </li>
        </ol>

        <H3>Reference implementation — deepSortKeys</H3>
        <p className="text-sm text-gray-700 mb-2">
          The following function reproduces the exact key-sorting logic used by OfferAccept:
        </p>
        <Pre>{`function deepSortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, deepSortKeys(value[k])])
    );
  }
  return value;
}

// Produce canonical JSON
const canonicalJson = JSON.stringify(deepSortKeys(payload));`}</Pre>

        {/* 4. Hash algorithm */}
        <H2 id="hash-algorithm">4. Hash algorithm</H2>
        <p className="text-sm text-gray-700 leading-relaxed">
          The certificate hash is computed as:
        </p>
        <Pre>{`SHA-256(canonical_json_utf8_bytes)`}</Pre>
        <p className="text-sm text-gray-700 leading-relaxed">
          The result is encoded as a lowercase hexadecimal string (64 characters).
        </p>

        <H3>Node.js</H3>
        <Pre>{`const crypto = require('crypto');

const canonicalJson = JSON.stringify(deepSortKeys(payload));
const hash = crypto
  .createHash('sha256')
  .update(canonicalJson, 'utf8')
  .digest('hex');

console.log(hash); // 64-character hex string`}</Pre>

        <H3>Python</H3>
        <Pre>{`import hashlib
import json

def deep_sort_keys(value):
    if isinstance(value, list):
        return [deep_sort_keys(v) for v in value]
    if isinstance(value, dict):
        return {k: deep_sort_keys(value[k]) for k in sorted(value)}
    return value

canonical_json = json.dumps(deep_sort_keys(payload), separators=(',', ':'))
hash_hex = hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()

print(hash_hex)  # 64-character hex string`}</Pre>

        {/* 5. Verification procedure */}
        <H2 id="verification-procedure">5. Verification procedure</H2>
        <p className="text-sm text-gray-700 leading-relaxed mb-4">
          To independently verify a certificate:
        </p>
        <ol className="space-y-4 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[--color-accent] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <div>
              <strong>Obtain the certificate payload.</strong> Call{' '}
              <Code>GET /api/v1/certificates/{'{certificateId}'}/export</Code> (authenticated)
              to retrieve the full payload and the <Code>canonicalJson</Code> string that was
              hashed at issuance.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[--color-accent] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
            <div>
              <strong>Reconstruct canonical JSON.</strong> Apply <Code>deepSortKeys</Code> to
              the <Code>payload</Code> field of the response and call{' '}
              <Code>JSON.stringify</Code> without spacing. The result must match the
              <Code>canonicalJson</Code> field returned by the API exactly.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[--color-accent] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
            <div>
              <strong>Compute SHA-256.</strong> Hash the canonical JSON string as UTF-8 bytes
              and encode the result as lowercase hex.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[--color-accent] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
            <div>
              <strong>Compare.</strong> The computed hash must equal the{' '}
              <Code>certificateHash</Code> returned by the API and displayed on the
              verification page. A mismatch indicates the evidence has been altered since
              issuance.
            </div>
          </li>
        </ol>

        <Note>
          You can also use the public{' '}
          <Code>GET /api/v1/certificates/{'{certificateId}'}/verify</Code> endpoint to have
          OfferAccept perform this check server-side. That endpoint returns{' '}
          <Code>certificateHashMatch</Code>, <Code>snapshotIntegrity</Code>, and{' '}
          <Code>eventChainIntegrity</Code> — three independent checks. It does not require
          authentication.
        </Note>

        {/* 6. Canonical acceptance hash */}
        <H2 id="canonical-acceptance-hash">6. Canonical acceptance hash</H2>
        <p className="text-sm text-gray-700 leading-relaxed">
          In addition to the full certificate hash, OfferAccept computes a lightweight
          5-field acceptance fingerprint called the <strong>canonical acceptance hash</strong>.
          This allows a third party who knows only the core acceptance facts — without the full
          certificate payload — to verify authenticity.
        </p>

        <H3>Input fields (alphabetical order)</H3>
        <Pre>{`{
  "acceptedAt":     "<ISO 8601 UTC — AcceptanceRecord.acceptedAt>",
  "dealId":         "<Offer ID — AcceptanceCertificate.offerId>",
  "ipAddress":      "<IPv4 or IPv6, or null>",
  "recipientEmail": "<AcceptanceRecord.verifiedEmail>",
  "userAgent":      "<HTTP User-Agent string, or null>"
}`}</Pre>

        <p className="text-sm text-gray-700 leading-relaxed mt-3">
          The five keys sort alphabetically as:{' '}
          <Code>acceptedAt</Code> → <Code>dealId</Code> → <Code>ipAddress</Code> → <Code>recipientEmail</Code> → <Code>userAgent</Code>.
          Null values are included (not omitted). The same <Code>deepSortKeys</Code> +{' '}
          <Code>JSON.stringify</Code> + SHA-256 procedure applies.
        </p>

        <p className="text-sm text-gray-700 leading-relaxed mt-3">
          This hash is stored as <Code>AcceptanceCertificate.canonicalHash</Code> and is
          verified independently from the full certificate hash as check B in the server-side
          verification flow. Certificates issued before this field was introduced have a{' '}
          <Code>null</Code> canonical hash; the check is skipped for those certificates.
        </p>

        {/* 7. Independence */}
        <H2 id="independence">7. Independence guarantee</H2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Certificate hash verification is designed to be fully reproducible without OfferAccept
          infrastructure:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
          <li>
            The algorithm is standard SHA-256 — available in every major programming language
            and cryptographic library.
          </li>
          <li>
            The canonical form (sorted keys, no whitespace, UTF-8, null-preserving) is fully
            specified above and requires no OfferAccept libraries.
          </li>
          <li>
            The payload fields are self-describing — each value can be verified against
            the original deal documents, sender communications, and email timestamps.
          </li>
          <li>
            The acceptance confirmation email sent to both parties at the time of acceptance
            includes the <Code>certificateId</Code>, the <Code>certificateHash</Code>, and a
            verification URL. These values are sufficient to re-verify at any future point,
            including if OfferAccept is unavailable.
          </li>
        </ul>

        <div className="mt-10 rounded-xl bg-gray-50 border border-gray-200 px-5 py-4 text-sm text-gray-600">
          <p>
            Questions about this specification?{' '}
            <a href="mailto:security@offeraccept.com" className="text-blue-600 hover:text-blue-700">
              security@offeraccept.com
            </a>
          </p>
        </div>
      </main>

      <footer className="border-t border-gray-100 px-6 py-4 text-center text-xs text-gray-400">
        OfferAccept Certificate Hash Specification — Version 1.0
      </footer>
    </div>
  );
}
