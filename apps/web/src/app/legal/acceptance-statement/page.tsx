import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acceptance Statement — OfferAccept',
  description:
    'Acceptance Statement Specification v1.1. Exact wording, use-case examples, technical integrity guarantees, and eIDAS positioning for the OfferAccept acceptance statement.',
};

export default function AcceptanceStatementPage() {
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
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Acceptance Statement</h1>
          <p className="text-sm text-gray-500">Version 1.1 · Technical and legal specification</p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

          {/* ── Scope note ─────────────────────────────────────────────────── */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <strong>Scope:</strong> OfferAccept verifies control of an email inbox — not legal
            identity. The acceptance statement records that the person who controlled the email
            address at the time of acceptance clicked "I accept." It does not record who that
            person is in the physical world.
          </div>

          {/* ── 1. Exact statement text ──────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              1. The exact statement text
            </h2>
            <p className="mb-3">
              The following text is generated server-side by{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">buildAcceptanceStatement()</code>{' '}
              and is identical in the acceptance interface and in the stored certificate:
            </p>
            <blockquote className="border-l-4 border-(--color-accent) pl-4 py-2 bg-gray-50 rounded-r-lg italic text-gray-800">
              &ldquo;I, [Recipient Name], confirm that I have reviewed and accept the offer
              &ldquo;[Document Title]&rdquo; presented by [Sender Name] ([Sender Email]). By
              confirming this acceptance, I acknowledge this action as my binding agreement to the
              terms presented.&rdquo;
            </blockquote>
          </section>

          {/* ── 2. Use-case examples ─────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              2. What this looks like in practice
            </h2>
            <p className="mb-4 text-gray-600">
              The statement is plain language, not legal boilerplate. Here are three common
              scenarios showing exactly what your recipient sees.
            </p>

            <div className="space-y-4">
              {/* Freelancer */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Freelancer / Consultant
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    A client accepting a project proposal or Statement of Work
                  </p>
                </div>
                <div className="px-4 py-3 bg-white">
                  <blockquote className="italic text-gray-800 text-sm border-l-4 border-blue-200 pl-3">
                    &ldquo;I, Sarah Chen, confirm that I have reviewed and accept the offer
                    &ldquo;Website Redesign Proposal — Q2 2026&rdquo; presented by Alex Rivera
                    (alex@designstudio.co). By confirming this acceptance, I acknowledge this
                    action as my binding agreement to the terms presented.&rdquo;
                  </blockquote>
                  <p className="text-xs text-gray-500 mt-2">
                    What this records: Sarah, using the email sarah@clientco.com, confirmed
                    acceptance of the proposal as presented at 14:22 UTC on 3 May 2026.
                  </p>
                </div>
              </div>

              {/* HR / Employment */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    HR / Employment Offer
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    A candidate accepting a job offer letter
                  </p>
                </div>
                <div className="px-4 py-3 bg-white">
                  <blockquote className="italic text-gray-800 text-sm border-l-4 border-blue-200 pl-3">
                    &ldquo;I, Marcus Johnson, confirm that I have reviewed and accept the offer
                    &ldquo;Offer of Employment — Senior Engineer&rdquo; presented by Acme Corp
                    (talent@acmecorp.com). By confirming this acceptance, I acknowledge this
                    action as my binding agreement to the terms presented.&rdquo;
                  </blockquote>
                  <p className="text-xs text-gray-500 mt-2">
                    What this records: Marcus, using marcus.johnson@gmail.com, confirmed acceptance
                    of the offer letter and attached documents at a specific timestamp. The
                    certificate provides evidence the candidate received and accepted the stated
                    terms.
                  </p>
                </div>
              </div>

              {/* Business proposal */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Business Proposal / Commercial Contract
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    A procurement manager accepting a vendor proposal
                  </p>
                </div>
                <div className="px-4 py-3 bg-white">
                  <blockquote className="italic text-gray-800 text-sm border-l-4 border-blue-200 pl-3">
                    &ldquo;I, Priya Sharma, confirm that I have reviewed and accept the offer
                    &ldquo;Annual Software Maintenance Agreement 2026–2027&rdquo; presented by
                    TechSolutions Ltd (contracts@techsolutions.io). By confirming this acceptance,
                    I acknowledge this action as my binding agreement to the terms presented.&rdquo;
                  </blockquote>
                  <p className="text-xs text-gray-500 mt-2">
                    What this records: Priya, using priya.sharma@enterprise.com, confirmed
                    acceptance of the maintenance agreement and all attached schedules. The
                    immutable certificate can be shared with legal, finance, or auditors.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-800">
              <strong>Note for senders:</strong> You don&apos;t need to adjust the statement
              wording — it is generated automatically from the document title and your account
              name. What makes the certificate meaningful is the timestamp, the email OTP
              verification, and the SHA-256 hash of the document and certificate. Those are
              recorded regardless of document type.
            </div>
          </section>

          {/* ── 3. What the recipient confirms ───────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              3. What the recipient confirms
            </h2>
            <p>By completing the acceptance flow, the recipient confirms three things:</p>
            <ol className="list-decimal pl-5 space-y-1 mt-2">
              <li>
                That they have <strong>reviewed the document</strong> as presented in the
                acceptance interface
              </li>
              <li>
                That they <strong>accept the document</strong> with the stated title from the
                stated sender
              </li>
              <li>
                That the action is <strong>binding</strong> — the recipient acknowledges this as
                their binding agreement to the terms presented
              </li>
            </ol>
          </section>

          {/* ── 4. What it does not confirm ──────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              4. What the statement does not confirm
            </h2>
            <p>The acceptance statement does <strong>not</strong> document:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>
                That the recipient is the person they claim to be (only that they controlled the
                stated email address at the time of acceptance)
              </li>
              <li>That the recipient had legal capacity to contract</li>
              <li>That the recipient acted without duress or coercion</li>
              <li>
                That the content of the document is legally enforceable in all jurisdictions
              </li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              If strong identity verification is required (e.g. financial services, regulated
              contracts), combine OfferAccept with a qualified identity provider or use a Qualified
              Electronic Signature (QES) solution. See the eIDAS table below.
            </p>
          </section>

          {/* ── 5. Technical integrity ────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              5. Technical integrity
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Property
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Implementation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      'Server-side generated',
                      'The client controls no part of the statement text — it is built on the server from immutable snapshot data.',
                    ],
                    [
                      'Display = stored',
                      'The same function is used in both places; tests verify byte-for-byte equality between what is shown and what is stored.',
                    ],
                    [
                      'Frozen at send time',
                      'The statement is built from an OfferSnapshot — frozen at the time the document was sent, not at acceptance.',
                    ],
                    [
                      'SHA-256 fingerprint',
                      'The acceptance record is hashed and the fingerprint is stored in the certificate — any alteration is detectable.',
                    ],
                    [
                      'Timestamp stored separately',
                      'acceptedAt is stored separately in AcceptanceRecord — not embedded in the statement text itself.',
                    ],
                    [
                      'OTP codes',
                      'Never stored in plain text — only a cryptographic SHA-256 hash of the code is stored.',
                    ],
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

          {/* ── 6. eIDAS positioning ─────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              6. Legal positioning (eIDAS)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Signature level
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      Requirements
                    </th>
                    <th className="text-left py-2 px-3 border border-gray-200 font-medium text-gray-700">
                      OfferAccept status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">
                      SES — Simple Electronic Signature
                    </td>
                    <td className="py-2 px-3 border border-gray-200">
                      No specific technical requirements
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-green-700">
                      Provides evidence that may constitute a SES
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-2 px-3 border border-gray-200 font-medium">
                      AdES — Advanced Electronic Signature
                    </td>
                    <td className="py-2 px-3 border border-gray-200">
                      Uniquely linked to the signatory; capable of identifying the signatory
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-amber-700">
                      Email binding documented; identity proofing not provided
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 border border-gray-200 font-medium">
                      QES — Qualified Electronic Signature
                    </td>
                    <td className="py-2 px-3 border border-gray-200">
                      Requires a Qualified Trust Service Provider (QTSP) and approved certificate
                    </td>
                    <td className="py-2 px-3 border border-gray-200 text-red-700">
                      Not provided by OfferAccept
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              See also:{' '}
              <Link href="/legal/otp-verification" className="text-blue-600 hover:text-blue-700">
                OTP identity verification
              </Link>{' '}
              and{' '}
              <Link href="/security/evidence-model" className="text-blue-600 hover:text-blue-700">
                evidence model and hash chain
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
