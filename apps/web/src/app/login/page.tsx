'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { login } from '../../lib/offers-api';
import { markAuthenticated } from '../../lib/auth';
import { Card, CardSection } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordReset = searchParams.get('reset') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      markAuthenticated();
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect email or password.');
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
          <h1 className="text-lg font-semibold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-[--color-text-muted]">Secure deal management</p>
        </div>

        <CardSection border={false} className="px-6 pb-2">
          {passwordReset && (
            <Alert variant="success" className="mb-4">Password updated. Sign in with your new password.</Alert>
          )}
          {error && (
            <Alert variant="error" className="mb-4">{error}</Alert>
          )}

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
            <div className="flex flex-col gap-1">
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-xs text-[--color-text-muted] hover:text-gray-700 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-1">
              Sign in
            </Button>
          </form>
        </CardSection>

        <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-[11px] text-[--color-text-muted]">
          <Lock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
          Secure offer acceptance with verifiable audit trails.
        </div>
      </Card>

      <p className="mt-5 text-xs text-[--color-text-muted]">
        Don&apos;t have an account?{' '}
        <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium">
          Learn more
        </Link>
      </p>
    </main>
  );
}
