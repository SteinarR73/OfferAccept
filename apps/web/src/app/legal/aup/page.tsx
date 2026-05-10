import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy — OfferAccept',
  description:
    'OfferAccept Acceptable Use Policy (v1.0). Sets the boundaries for how the service may be used and what conduct is prohibited.',
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

export default function AcceptableUsePolicyPage() {
  return (
    <LegalPageShell
      title="Acceptable Use Policy"
      version="1.0"
      effectiveLabel="Effective from launch"
    >
      <section>
        <h2>1. Purpose</h2>
        <p>
          This Acceptable Use Policy (&ldquo;AUP&rdquo;) sets the boundaries for how
          OfferAccept may be used. It supplements the{' '}
          <Link href="/legal/terms">Terms of Service</Link> and applies to every Customer,
          user, and recipient who interacts with the platform, directly or via the API. Violating
          this AUP is grounds for suspension or termination under the Terms.
        </p>
      </section>

      <section>
        <h2>2. Permitted use</h2>
        <p>
          OfferAccept is designed to provide documented, tamper-evident evidence that a specific
          person received and accepted a specific document. Permitted use includes:
        </p>
        <ul>
          <li>Sending offers, proposals, contracts, and confirmations for genuine business purposes</li>
          <li>Collecting acceptance on internal policies, price lists, terms updates, and similar documents</li>
          <li>Using the API to integrate acceptance flows into your own systems under the same restrictions listed here</li>
          <li>Exporting certificates for your own records, audits, or dispute resolution</li>
        </ul>
      </section>

      <section>
        <h2>3. Prohibited conduct</h2>

        <h3>3.1 Fraudulent and deceptive use</h3>
        <p>You must not use OfferAccept to:</p>
        <ul>
          <li>Collect acceptance on documents that misrepresent the sender&rsquo;s identity, affiliation, or authority</li>
          <li>Use forged or impersonated sender names or domains</li>
          <li>
            Present a document for acceptance that differs materially from what the recipient
            believes they are accepting (e.g., embedding hidden terms not visible in the
            attached file)
          </li>
          <li>Create certificates that falsely imply acceptance occurred when it did not</li>
          <li>Conduct phishing, social engineering, or identity theft via acceptance flows</li>
        </ul>

        <h3>3.2 Illegal content and purposes</h3>
        <p>You must not use OfferAccept to distribute, process, or obtain acceptance on:</p>
        <ul>
          <li>Content that is unlawful in the recipient&rsquo;s or sender&rsquo;s jurisdiction</li>
          <li>Documents that facilitate money laundering, bribery, or corruption</li>
          <li>Agreements that circumvent consumer protection law in a manner that is not permitted by applicable law</li>
          <li>Content involving child sexual abuse material (CSAM) — such use will be immediately reported to law enforcement</li>
          <li>Sanctions evasion or dealings with persons or entities on applicable sanctions lists</li>
        </ul>

        <h3>3.3 Abuse of the platform</h3>
        <p>You must not:</p>
        <ul>
          <li>Attempt to reverse-engineer, bypass, or tamper with the evidence chain, certificate hashes, or signing flow</li>
          <li>Probe or test for security vulnerabilities without prior written permission (see{' '}<Link href="/security">responsible disclosure</Link>)</li>
          <li>Automate document sending at scale in a way that constitutes spam or harassment</li>
          <li>Use the service to send unsolicited commercial communications where prohibited by applicable anti-spam law</li>
          <li>Resell or sublicense access to the service without prior written agreement</li>
          <li>Scrape, mirror, or index the platform in a manner that disrupts service for other users</li>
          <li>Introduce malware, ransomware, or malicious code through uploaded documents or attachments</li>
        </ul>

        <h3>3.4 Interference with recipients</h3>
        <p>You must not:</p>
        <ul>
          <li>
            Send documents to recipients who have not consented to receive commercial
            communications from you, where such consent is required by law
          </li>
          <li>Harass, threaten, or coerce recipients into accepting documents</li>
          <li>
            Collect acceptance on behalf of a third party without explicit authority to do so
          </li>
        </ul>

        <h3>3.5 High-risk regulated transactions</h3>
        <p>
          OfferAccept is an acceptance-confirmation tool, not a qualified electronic signature
          service under eIDAS or equivalent regulation. You must not use it as the sole or
          primary authentication mechanism for:
        </p>
        <ul>
          <li>Real estate conveyancing, notarial acts, or court filings requiring a qualified signature</li>
          <li>Medical consent where a regulated signature standard is legally required</li>
          <li>Consumer credit agreements where specific e-signature standards apply in your jurisdiction</li>
          <li>Any transaction where applicable law requires a stronger identity verification than email OTP</li>
        </ul>
        <p>
          See the <Link href="/legal/acceptance-statement">Acceptance Statement</Link> for a
          full description of what the certificate does and does not certify.
        </p>
      </section>

      <section>
        <h2>4. Uploaded documents</h2>
        <p>
          You are solely responsible for the content of documents you upload and share via the
          platform. OfferAccept does not review document content before delivery. We reserve the
          right to remove documents and suspend accounts if prohibited content is discovered or
          reported.
        </p>
        <p>
          Uploaded documents are stored encrypted at rest and in transit. They are accessible
          only to the sending account and the designated recipient during the acceptance window.
          Refer to the <Link href="/legal/dpa">Data Processing Agreement</Link> for retention and
          deletion terms.
        </p>
      </section>

      <section>
        <h2>5. Enforcement</h2>
        <p>
          If we determine — at our sole discretion — that a Customer or user has violated this
          AUP, we may take any of the following actions without prior notice:
        </p>
        <ul>
          <li>Warn the account holder</li>
          <li>Suspend sending access while we investigate</li>
          <li>Terminate the account and cancel any subscription, without refund</li>
          <li>Report conduct to law enforcement or regulatory authorities where required</li>
          <li>Preserve evidence relevant to the violation and cooperate with legal process</li>
        </ul>
        <p>
          We will endeavour to notify the account holder of enforcement action unless doing so
          would compromise a legal investigation or a third party&rsquo;s safety.
        </p>
      </section>

      <section>
        <h2>6. Reporting violations</h2>
        <p>
          If you believe OfferAccept is being used in a way that violates this AUP, please
          report it to{' '}
          <a href="mailto:abuse@offeraccept.com">abuse@offeraccept.com</a>. Include as much
          detail as possible. We investigate all credible reports.
        </p>
      </section>

      <section>
        <h2>7. Changes</h2>
        <p>
          We may update this AUP from time to time. Material changes will be communicated to
          active Customers by email at least 14 days before they take effect. Continued use of
          the service after the effective date constitutes acceptance of the revised AUP.
        </p>
      </section>

      <section>
        <h2>8. Questions</h2>
        <p>
          For questions about this policy, contact{' '}
          <a href="mailto:legal@offeraccept.com">legal@offeraccept.com</a>.
        </p>
      </section>
    </LegalPageShell>
  );
}
