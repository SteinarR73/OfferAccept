'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '../../../lib/offers-api';
import { Card, CardSection } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[--color-bg] flex flex-col items-center justify-start pt-20 px-4">
      {/* Brand */}
      <div className="flex items-center gap-2 mb-8">
        <span className="w-8 h-8 rounded-lg bg-[--color-accent] flex items-center justify-center text-white text-sm font-bold select-none">
          OA
        </span>
        <span className="font-semibold text-gray-900">OfferAccept</span>
      </div>

      <Card className="w-full max-w-sm">
        <div className="px-6 pt-6 pb-2 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Reset your password</h1>
          <p className="mt-1 text-sm text-[--color-text-muted]">
            {submitted
              ? 'Check your inbox'
              : "Enter your email and we'll send a reset link"}
          </p>
        </div>

        <CardSection border={false} className="px-6 pb-6">
          {submitted ? (
            <div className="text-sm text-gray-600 text-center py-2">
              If that email is registered, a password reset link has been sent.
              Check your spam folder if it doesn&apos;t arrive within a few minutes.
            </div>
          ) : (
            <>
              {error && <Alert variant="error" className="mb-4">{error}</Alert>}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                />
                <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                  Send reset link
                </Button>
              </form>
            </>
          )}
        </CardSection>
      </Card>

      <p className="mt-5 text-xs text-[--color-text-muted]">
        <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          ← Back to sign in
        </Link>
      </p>
    </main>
  );
}
