'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CheckCircle, Send, Shield } from 'lucide-react';
import { createOffer } from '../../../../lib/offers-api';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Card, CardHeader, CardSection, CardFooter } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Alert } from '../../../../components/ui/Alert';

// ─── NewOfferPage ─────────────────────────────────────────────────────────────

export default function NewOfferPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { offerId } = await createOffer({
        title,
        recipient: recipientEmail ? { email: recipientEmail, name: recipientName } : undefined,
      });
      router.push(`/dashboard/offers/${offerId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create deal.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="New deal"
        description="Create a draft deal to send to your customer."
        backHref="/dashboard/offers"
        backLabel="All deals"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Form ─────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} noValidate>
            {error && <Alert variant="error" dismissible className="mb-4">{error}</Alert>}

            <Card className="mb-4">
              <CardHeader title="Deal details" border />
              <CardSection>
                <Input
                  label="Deal name"
                  placeholder="e.g. Senior Software Engineer — Q2 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  hint="This title will appear in the deal email and acceptance certificate."
                  autoFocus
                />
              </CardSection>
            </Card>

            <Card className="mb-6">
              <CardHeader title="Customer" description="Who will receive this deal?" border />
              <CardSection>
                <div className="space-y-4">
                  <Input
                    label="Full name"
                    placeholder="Jane Smith"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    required
                  />
                  <Input
                    label="Email address"
                    type="email"
                    placeholder="jane.smith@company.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    required
                    hint="A secure signing link will be sent to this address."
                  />
                </div>
              </CardSection>
            </Card>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={loading}
                leftIcon={<FileText className="w-4 h-4" aria-hidden="true" />}
              >
                Create draft
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => router.back()}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>

        {/* ── Info sidebar ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader title="What happens next?" border />
            <CardSection>
              <ol className="space-y-4">
                {[
                  {
                    icon: <FileText className="w-4 h-4 text-blue-600" aria-hidden="true" />,
                    title: 'Draft created',
                    body: 'Your deal is saved as a draft. Add terms and upload documents before sending.',
                  },
                  {
                    icon: <Send className="w-4 h-4 text-blue-600" aria-hidden="true" />,
                    title: 'Send to customer',
                    body: 'When ready, send the deal. The customer gets a secure email with a signing link.',
                  },
                  {
                    icon: <CheckCircle className="w-4 h-4 text-green-600" aria-hidden="true" />,
                    title: 'Accepted & certified',
                    body: 'Once accepted via OTP verification, a tamper-proof certificate is generated instantly.',
                  },
                  {
                    icon: <Shield className="w-4 h-4 text-purple-600" aria-hidden="true" />,
                    title: 'Audit trail secured',
                    body: 'Every action is logged with a timestamp and SHA-256 hash for legal compliance.',
                  },
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-gray-500 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{step.title}</p>
                      <p className="text-[11px] text-[--color-text-muted] mt-0.5">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardSection>
          </Card>
        </div>
      </div>
    </div>
  );
}
