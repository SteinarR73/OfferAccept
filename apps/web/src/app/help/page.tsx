import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help & FAQ — OfferAccept',
  description:
    'Answers to common questions about OfferAccept — how the acceptance flow works, what the certificate proves, security, and pricing.',
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'basics',
    heading: 'The basics',
    items: [
      {
        q: 'What is OfferAccept?',
        a: (
          <>
            OfferAccept is a document acceptance service. You upload a document, enter your
            recipient&rsquo;s email, and send a secure link. When the recipient accepts, the
            platform issues a tamper-evident certificate that records who accepted, when, from
            which device, and which version of the document — all in an immutable audit trail.
          </>
        ),
      },
      {
        q: 'What kinds of documents can I use it for?',
        a: (
          <>
            Any document where you need a clear record that the right person received and
            acknowledged the right content: job offers, supplier proposals, price confirmations,
            policy updates, terms of service acceptance, internal approvals, and similar.
            <br />
            <br />
            It is <strong>not</strong> a replacement for qualified electronic signatures under
            eIDAS or equivalent regulation. See the{' '}
            <Link href="/legal/acceptance-statement">Acceptance Statement</Link> for a detailed
            scope description.
          </>
        ),
      },
      {
        q: 'Do recipients need an account?',
        a: (
          <>
            No. Recipients receive a secure link by email and confirm their identity with a
            one-time code sent to the same address. No account, app download, or signing
            software is required on their end.
          </>
        ),
      },
      {
        q: 'How long does the recipient flow take?',
        a: 'Under a minute in typical cases. The recipient opens the email, clicks the link, enters a one-time code, reviews the document, and confirms. That is it.',
      },
    ],
  },
  {
    id: 'sending',
    heading: 'Sending documents',
    items: [
      {
        q: 'What file formats are supported?',
        a: 'PDF is the recommended format and produces the highest-quality certificate. The service accepts PDF files up to 10 MB.',
      },
      {
        q: 'Can I send the same document to multiple recipients?',
        a: (
          <>
            Each deal is sent to one designated recipient. If you need separate acceptance from
            multiple people, create one deal per recipient. Each certificate then individually
            records that specific person&rsquo;s acceptance.
          </>
        ),
      },
      {
        q: 'Can I edit a document after sending it?',
        a: (
          <>
            No. Once a deal is sent, the document content is locked and its SHA-256 hash is
            recorded in the acceptance certificate. Editing would break the chain. If you need
            to correct a document, send a new deal — the old one can be marked cancelled.
          </>
        ),
      },
      {
        q: 'What happens if the recipient declines?',
        a: (
          <>
            The decline is recorded in the audit trail with a timestamp. You will be notified
            by email. No certificate is issued. The deal stays visible in your dashboard with
            a &ldquo;Declined&rdquo; status.
          </>
        ),
      },
      {
        q: 'How long does the recipient have to respond?',
        a: 'By default, links expire after 30 days. You can see the expiry date on the deal card. Expired deals are not automatically deleted — they remain in your dashboard as a record.',
      },
      {
        q: 'Can I resend the link or OTP code?',
        a: 'Yes. From the deal detail page you can resend the acceptance link and, if the recipient is stuck on the verification step, resend their one-time code.',
      },
    ],
  },
  {
    id: 'certificate',
    heading: 'The acceptance certificate',
    items: [
      {
        q: 'What does the certificate prove?',
        a: (
          <>
            The certificate is evidence that a person with access to the email address you
            specified opened the acceptance page, passed one-time code verification, reviewed the
            document, and clicked &ldquo;I accept&rdquo; — all within a single authenticated
            session. It records:
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>The recipient&rsquo;s email address</li>
              <li>The SHA-256 hash of the exact document version presented</li>
              <li>The IP address and user-agent of the device used</li>
              <li>The precise UTC timestamp of acceptance</li>
              <li>The verbatim acceptance statement shown at the time</li>
            </ul>
            It does <strong>not</strong> prove the identity of the physical person behind the
            keyboard — only that someone with access to that email address completed the flow.
          </>
        ),
      },
      {
        q: 'Is it legally binding?',
        a: (
          <>
            In most commercial contexts — yes, email-confirmed acceptance with a documented
            audit trail is legally valid evidence of agreement in Norway and many other
            jurisdictions. However, whether a specific acceptance is binding depends on the
            type of document, the parties, and the applicable law.
            <br />
            <br />
            OfferAccept is not a law firm and cannot provide legal advice. If you are unsure
            whether the certificate is sufficient for your use case, consult a solicitor.
          </>
        ),
      },
      {
        q: 'How do I verify a certificate I received?',
        a: (
          <>
            Go to{' '}
            <Link href="/verify">offeraccept.com/verify</Link> and enter the certificate ID
            printed on the PDF. The platform re-hashes the stored document and confirms the
            hash still matches the certificate record. You can also verify offline by hashing
            the original PDF with SHA-256 and comparing it to the value on the certificate —
            see the <Link href="/security/evidence-model">Evidence Model</Link> for
            instructions.
          </>
        ),
      },
      {
        q: 'Can I download the certificate as a PDF?',
        a: 'Yes. From the deal detail page, click "Download certificate". The PDF includes all evidence fields, the document hash, the acceptance statement, and a QR code linking to the online verification page.',
      },
      {
        q: 'What happens if OfferAccept shuts down — can I still verify old certificates?',
        a: (
          <>
            Yes. The certificate PDF contains all the data needed to verify offline: the SHA-256
            hash of the document, the acceptance timestamp, and the verbatim acceptance
            statement. As long as you keep the original document and the certificate PDF, you
            can verify the match with any SHA-256 tool — no internet connection or OfferAccept
            service required. See the{' '}
            <Link href="/security/evidence-model">Evidence Model</Link> for the exact procedure.
          </>
        ),
      },
    ],
  },
  {
    id: 'security',
    heading: 'Security and privacy',
    items: [
      {
        q: 'How does identity verification work?',
        a: (
          <>
            The recipient&rsquo;s identity is verified via a one-time code (OTP) sent to the
            email address you provided when creating the deal. The code is single-use, expires
            after 10 minutes, and the session is locked to the browser that requested it.
            <br />
            <br />
            This is email-based identity verification — it proves control of the inbox, not a
            national ID or passport. For higher-assurance requirements, OfferAccept is not the
            right tool.
          </>
        ),
      },
      {
        q: 'Where is my data stored?',
        a: 'Documents and data are stored on servers in the European Economic Area (EEA). We use Resend (US, Standard Contractual Clauses apply) for email delivery and Stripe (US, SCC) for payments. The full sub-processor list is at /legal/subprocessors.',
      },
      {
        q: 'How long do you retain my documents?',
        a: (
          <>
            Documents and acceptance records are retained for the duration of your subscription
            and for 90 days after account closure, after which they are permanently deleted.
            You can export your data at any time from the dashboard. See the{' '}
            <Link href="/legal/dpa">Data Processing Agreement</Link> for full retention details.
          </>
        ),
      },
      {
        q: 'How do I report a security vulnerability?',
        a: (
          <>
            Email <a href="mailto:security@offeraccept.com">security@offeraccept.com</a> with
            a description of the issue. We aim to acknowledge within 24 hours and to produce
            a fix or mitigation within 72 hours for critical findings. We do not currently
            operate a paid bug bounty programme, but we publicly credit researchers who report
            valid findings (with their permission). See the{' '}
            <Link href="/security">Security page</Link> for our full disclosure policy.
          </>
        ),
      },
    ],
  },
  {
    id: 'billing',
    heading: 'Plans and billing',
    items: [
      {
        q: 'Is there a free plan?',
        a: 'Yes. The free plan includes 3 documents per month at no cost, with no credit card required to start.',
      },
      {
        q: 'What happens when I reach my monthly limit?',
        a: "Your dashboard shows how many documents you have remaining. When you reach your limit, you'll be prompted to upgrade. Existing deals and certificates are never affected — only new sends are paused.",
      },
      {
        q: 'How does billing work?',
        a: 'Paid plans are billed monthly in advance. You can upgrade, downgrade, or cancel at any time from the Billing section of your dashboard. Downgrades take effect at the end of the current billing period.',
      },
      {
        q: 'Do you offer annual billing or volume discounts?',
        a: (
          <>
            Annual billing with a discount is planned. For volume or enterprise pricing, contact{' '}
            <a href="mailto:sales@offeraccept.com">sales@offeraccept.com</a>.
          </>
        ),
      },
      {
        q: 'What payment methods do you accept?',
        a: 'We accept all major credit and debit cards via Stripe. We do not store card details — Stripe handles all payment processing.',
      },
    ],
  },
  {
    id: 'account',
    heading: 'Account and team',
    items: [
      {
        q: 'Can I invite team members?',
        a: 'Team management is available on paid plans. You can invite members, assign roles (Owner, Admin, Member), and control who can send deals.',
      },
      {
        q: 'How do I delete my account?',
        a: (
          <>
            You can close your account from the Settings page. This will schedule deletion of
            all your data after a 90-day grace period. If you change your mind, contact{' '}
            <a href="mailto:support@offeraccept.com">support@offeraccept.com</a> before the
            grace period ends.
          </>
        ),
      },
      {
        q: 'Can I export my data?',
        a: 'Yes. You can download all your deals, acceptance records, and certificates in bulk from the Settings page. We provide data in JSON and PDF formats.',
      },
    ],
  },
] as const;

// ─── Components ───────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div className="py-5 border-b border-gray-100 last:border-0">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{q}</h3>
      <div className="text-sm text-gray-600 leading-relaxed [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-blue-800 [&_ul]:mt-2 [&_ul]:space-y-1 [&_li]:text-sm [&_strong]:font-semibold [&_strong]:text-gray-800">
        {a}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12 max-w-2xl">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Help &amp; FAQ</h1>
          <p className="text-gray-500 leading-relaxed">
            Answers to the most common questions about OfferAccept. If you can&rsquo;t find
            what you&rsquo;re looking for, email{' '}
            <a
              href="mailto:support@offeraccept.com"
              className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
            >
              support@offeraccept.com
            </a>{' '}
            — we usually respond within one business day.
          </p>
        </div>

        {/* Section nav */}
        <nav
          className="flex flex-wrap gap-2 mb-12"
          aria-label="Jump to section"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              {s.heading}
            </a>
          ))}
        </nav>

        {/* Sections */}
        <div className="space-y-14">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
              <h2
                id={`${section.id}-heading`}
                className="text-base font-bold text-gray-900 uppercase tracking-wide mb-1 pb-3 border-b border-gray-200"
              >
                {section.heading}
              </h2>
              <div>
                {section.items.map((item) => (
                  <FaqItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-16 p-6 rounded-xl border border-gray-200 bg-gray-50">
          <h2 className="text-sm font-bold text-gray-900 mb-1">Still have questions?</h2>
          <p className="text-sm text-gray-600 mb-4">
            Email us at{' '}
            <a
              href="mailto:support@offeraccept.com"
              className="text-blue-600 underline underline-offset-2"
            >
              support@offeraccept.com
            </a>
            {' '}or browse the detailed technical documentation below.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/security/evidence-model"
              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
            >
              Evidence model →
            </Link>
            <Link
              href="/legal/acceptance-statement"
              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
            >
              Acceptance statement →
            </Link>
            <Link
              href="/legal/dpa"
              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
            >
              Data Processing Agreement →
            </Link>
            <Link
              href="/docs/certificate-hash-spec"
              className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
            >
              Certificate hash specification →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
