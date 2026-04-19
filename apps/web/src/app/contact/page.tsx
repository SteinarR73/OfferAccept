import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — OfferAccept',
};

const CONTACTS = [
  {
    label: 'General enquiries',
    email: 'hello@offeraccept.com',
    desc: 'Product questions, feedback, or partnership enquiries.',
  },
  {
    label: 'Support',
    email: 'support@offeraccept.com',
    desc: 'Help with your account or a specific deal.',
  },
  {
    label: 'Enterprise sales',
    email: 'sales@offeraccept.com',
    desc: 'Custom plans, volume pricing, and onboarding.',
  },
  {
    label: 'Privacy & legal',
    email: 'privacy@offeraccept.com',
    desc: 'Data requests, privacy questions, or legal notices.',
  },
  {
    label: 'Security',
    email: 'security@offeraccept.com',
    desc: 'Responsible disclosure of vulnerabilities or security concerns.',
  },
];

export default function ContactPage() {
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Contact us</h1>
        <p className="text-sm text-gray-500 mb-10">We typically respond within one business day.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {CONTACTS.map((c) => (
            <a
              key={c.email}
              href={`mailto:${c.email}`}
              className="flex flex-col gap-1 rounded-xl border border-gray-200 px-5 py-4 hover:border-(--color-accent) hover:bg-emerald-50 transition-colors group"
            >
              <span className="text-xs font-semibold text-gray-900 group-hover:text-(--color-accent)">
                {c.label}
              </span>
              <span className="text-xs text-blue-600 font-medium">{c.email}</span>
              <span className="text-xs text-gray-500 mt-0.5">{c.desc}</span>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
