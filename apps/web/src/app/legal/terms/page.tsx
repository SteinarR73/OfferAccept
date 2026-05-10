import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — OfferAccept',
  description:
    'OfferAccept Terms of Service (v1.1). Describes what OfferAccept does and does not do, customer obligations, acceptance statement, liability, and governing law.',
};

// ─── Layout helper ────────────────────────────────────────────────────────────

function LegalPageShell({
  title,
  version,
  effectiveLabel,
  children,
}: {
  title: string;
  version: string;
  effectiveLabel: string;
  children: React.ReactNode;
}) {
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
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
          <p className="text-sm text-gray-500">
            Version {version} · {effectiveLabel}
          </p>
        </div>
        <div className="prose prose-sm prose-gray max-w-none leading-relaxed">
          {children}
        </div>
      </main>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      version="1.1"
      effectiveLabel="Effective from launch"
    >
      <section>
        <h2>1. Parties and scope</h2>
        <p>
          These Terms (&ldquo;Terms&rdquo;) are a binding agreement between OfferAccept
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;the service&rdquo;) and the organisation or
          person that creates an account and uses the service (&ldquo;Customer&rdquo;). The Terms
          apply to all use of the OfferAccept platform, including the website, API, and associated
          services.
        </p>
        <p>
          By creating an account, the Customer confirms that they have read, understood, and
          accepted these Terms. If you are entering into the agreement on behalf of an organisation,
          you confirm that you have authority to bind the organisation legally.
        </p>
      </section>

      <section>
        <h2>2. What OfferAccept is — and what it is not</h2>
        <h3>2.1 What the service does</h3>
        <p>OfferAccept is a SaaS tool that enables the Customer to:</p>
        <ul>
          <li>Send documents digitally to named recipients via acceptance links</li>
          <li>
            Verify that the recipient controls the stated email address via a one-time passcode
            (OTP)
          </li>
          <li>Record acceptance or decline events with a tamper-evident evidence log</li>
          <li>
            Generate a certificate with a SHA-256 fingerprint as documentation of the acceptance
            action
          </li>
        </ul>

        <h3>2.2 What the service does not do</h3>
        <p>OfferAccept does not provide:</p>
        <ul>
          <li>
            <strong>Qualified Electronic Signature (QES)</strong> under the eIDAS Regulation.
            OfferAccept is not a Qualified Trust Service Provider (QTSP).
          </li>
          <li>
            <strong>Personal identity verification.</strong> OTP verification confirms that the
            recipient controls the stated email address at the time of acceptance — not who that
            person is.
          </li>
          <li>
            <strong>Legal advice.</strong> OfferAccept is not a law firm and does not provide legal
            advice.
          </li>
          <li>
            Services for regulated instruments such as securities, real estate, wills, powers of
            attorney, or document types that under applicable law require notarisation, witnesses,
            or stronger identity proofing.
          </li>
          <li>
            <strong>Control over document content.</strong> OfferAccept has no control over or
            responsibility for the content of documents sent through the service. The Customer bears
            full responsibility for the content of documents distributed via the platform.
          </li>
        </ul>
        <p>
          The Customer is responsible for assessing whether OfferAccept is legally sufficient for
          their particular use case in their jurisdiction.
        </p>
      </section>

      <section>
        <h2>3. Customer obligations</h2>
        <h3>3.1 Lawful use</h3>
        <p>
          The Customer agrees to use the service exclusively for lawful purposes and not to:
        </p>
        <ul>
          <li>Send misleading, fraudulent, or coercive material to recipients</li>
          <li>Use the service for document types expressly excluded in section 2.2</li>
          <li>Attempt to circumvent, manipulate, or abuse the platform&rsquo;s security controls</li>
          <li>Send volume spam or unsolicited commercial communications to recipients</li>
        </ul>

        <h3>3.2 Responsibility for recipient identity</h3>
        <p>
          The Customer is responsible for inviting the correct recipient to the acceptance flow.
          OfferAccept verifies only control of the stated email address, not the identity of the
          person using that address. If the Customer sends an acceptance link to the wrong email
          address, this is solely the Customer&rsquo;s responsibility.
        </p>

        <h3>3.3 Accuracy of data</h3>
        <p>
          The Customer is responsible for ensuring that recipient name, email address, and other
          recipient information is correct. Errors in recipient data do not relieve the Customer of
          responsibility towards their recipient.
        </p>

        <h3>3.4 Data protection responsibility</h3>
        <p>
          The Customer is the data controller under the GDPR for personal data processed through
          the service. OfferAccept acts as data processor under a signed Data Processing Agreement
          (DPA). The Customer is responsible for having a valid lawful basis for processing
          recipient personal data.
        </p>
      </section>

      <section>
        <h2>4. Acceptance statement and evidentiary value</h2>
        <h3>4.1 Wording</h3>
        <p>
          The acceptance statement shown to the recipient and stored in the certificate is generated
          server-side and takes the following form:
        </p>
        <blockquote>
          <em>
            &ldquo;I, [Recipient Name], confirm that I have reviewed and accept the offer
            &ldquo;[Document Title]&rdquo; presented by [Sender Name] ([Sender Email]). By
            confirming this acceptance, I acknowledge this action as my binding agreement to the
            terms presented.&rdquo;
          </em>
        </blockquote>
        <p>
          See{' '}
          <Link href="/legal/acceptance-statement" className="text-blue-600 hover:text-blue-700">
            Acceptance Statement — technical and legal specification
          </Link>{' '}
          for a detailed description of the wording, technical integrity, and eIDAS positioning.
        </p>

        <h3>4.2 Evidentiary value</h3>
        <p>
          The acceptance certificate documents that an OTP-verified email address actively accepted
          a frozen document at a specific timestamp. OfferAccept does not guarantee that the
          certificate will be considered sufficient evidence in any legal dispute. Evidentiary value
          depends on applicable law in the relevant jurisdiction.
        </p>
      </section>

      <section>
        <h2>5. Payment and subscription</h2>
        <p>
          The service is provided under the pricing plan current at the time of order. Subscriptions
          renew automatically unless cancelled before the renewal date. All prices are exclusive of
          applicable taxes. Billing is handled via Stripe.
        </p>
      </section>

      <section>
        <h2>6. Availability and downtime</h2>
        <p>
          OfferAccept aims for high uptime but provides no guarantee of uninterrupted access.
          Planned maintenance is announced on the status page. Unplanned outages are communicated
          as quickly as possible.
        </p>
      </section>

      <section>
        <h2>7. Force majeure</h2>
        <p>
          OfferAccept is not liable for delays or failures caused by circumstances beyond our
          reasonable control, including but not limited to natural disasters, power outages, network
          failures, government orders, third-party attacks, or sub-processor failures.
        </p>
      </section>

      <section>
        <h2>8. Intellectual property</h2>
        <p>
          OfferAccept owns all rights to the platform, code, design, and brand. The Customer owns
          their own data, including documents and acceptance records. OfferAccept is granted a
          limited licence to process that data solely to deliver the service.
        </p>
      </section>

      <section>
        <h2>9. Limitation of liability</h2>
        <p>To the extent permitted by applicable law:</p>
        <ul>
          <li>
            OfferAccept acts as a neutral technical platform and is not a party to agreements
            entered into between the Customer and recipient. All rights and obligations arising from
            accepted documents are solely between the Customer and the recipient.
          </li>
          <li>
            OfferAccept&rsquo;s total liability to the Customer is limited to the amount the
            Customer has paid for the service in the 12 months preceding the claim.
          </li>
          <li>
            OfferAccept is not liable for indirect loss, lost profits, or consequential damages.
          </li>
          <li>
            OfferAccept is not liable for the content of documents the Customer sends via the
            service.
          </li>
          <li>
            OfferAccept is not liable if an acceptance certificate is not recognised as sufficient
            evidence by a court or authority.
          </li>
          <li>
            OfferAccept is not liable for consequences arising from incorrect recipient information
            provided by the Customer.
          </li>
        </ul>
      </section>

      <section>
        <h2>10. Termination</h2>
        <p>
          The Customer may cancel their subscription at any time. OfferAccept may terminate or
          suspend access with 30 days&rsquo; written notice, or immediately in the event of
          material breach of these Terms.
        </p>
      </section>

      <section>
        <h2>11. Governing law and jurisdiction</h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, United States. Disputes
          that cannot be resolved amicably shall be submitted to the competent courts of Delaware.
          For customers established in the EU, mandatory EU consumer protection law applies in
          addition to these Terms where relevant.
        </p>
      </section>

      <section>
        <h2>12. Changes</h2>
        <p>
          OfferAccept may amend these Terms with 30 days&rsquo; written notice. Continued use after
          the notice period constitutes acceptance of the amended Terms.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <ul>
          <li>
            Legal enquiries:{' '}
            <a href="mailto:legal@offeraccept.com" className="text-blue-600 hover:text-blue-700">
              legal@offeraccept.com
            </a>
          </li>
          <li>
            Privacy enquiries:{' '}
            <a
              href="mailto:privacy@offeraccept.com"
              className="text-blue-600 hover:text-blue-700"
            >
              privacy@offeraccept.com
            </a>
          </li>
          <li>
            Security:{' '}
            <a
              href="mailto:security@offeraccept.com"
              className="text-blue-600 hover:text-blue-700"
            >
              security@offeraccept.com
            </a>
          </li>
        </ul>
      </section>

      <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400">
        Canonical version of Terms of Service v1.1. Stable URL:{' '}
        <Link href="/legal/terms/v1.1" className="underline hover:text-gray-600">
          /legal/terms/v1.1
        </Link>
      </div>
    </LegalPageShell>
  );
}
