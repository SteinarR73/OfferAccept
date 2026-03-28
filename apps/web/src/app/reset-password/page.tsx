'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPassword } from '../../../lib/offers-api';
import { Card, CardSection } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <main className="min-h-screen bg-[--color-bg] flex flex-col items-center justify-start pt-20 px-4">
        <Card className="w-full max-w-sm">
          <div className="px-6 py-8 text-center">
            <p className="text-sm font-semibold text-gray-900 mb-1">Invalid reset link</p>
            <p className="text-sm text-[--color-text-muted]">
              This link is missing or has expired.{' '}
              <Link href="/forgot-password" className="text-blue-600 hover:text-blue-700 font-medium">
                Request a new one
              </Link>
            </p>
          </div>
        </Card>
      </main>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      router.replace('/login?reset=1');
    } catch {
      setError('This reset link is invalid or has expired. Please request a new one.');
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
          <h1 className="text-lg font-semibold text-gray-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-[--color-text-muted]">Must be at least 8 characters</p>
        </div>

        <CardSection border={false} className="px-6 pb-6">
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
            />
            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
              Set new password
            </Button>
          </form>
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
