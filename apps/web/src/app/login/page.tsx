'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { login, signup } from '../../lib/offers-api';
import { markAuthenticated } from '../../lib/auth';
import { Card, CardSection } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';

// Current Terms of Service version — must match the version in docs/legal/terms-of-service.md
const CURRENT_TERMS_VERSION = '1.1';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  const isSignup = mode === 'signup';
  const passwordReset = searchParams.get('reset') === '1';

  // ── Login state ──────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ── Signup state ─────────────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
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

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (signupPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!termsAccepted) {
      setError('You must accept the Terms of Service to create an account.');
      return;
    }

    setLoading(true);
    try {
      await signup({
        orgName,
        name,
        email: signupEmail,
        password: signupPassword,
        termsVersion: CURRENT_TERMS_VERSION,
      });
      setSignupDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Signup success ────────────────────────────────────────────────────────────
  if (isSignup && signupDone) {
    return (
      <main className="min-h-screen bg-(--color-bg) flex flex-col items-center justify-start pt-20 px-4">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-8 h-8 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-sm font-bold select-none">
            OA
          </span>
          <span className="font-semibold text-(--color-text-primary)">OfferAccept</span>
        </div>
        <Card className="w-full max-w-sm text-center px-6 py-8">
          <div className="w-12 h-12 rounded-full bg-(--color-success-light) flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-(--color-success)" />
          </div>
          <h1 className="text-lg font-semibold text-(--color-text-primary) mb-2">Check your inbox</h1>
          <p className="text-sm text-(--color-text-muted)">
            We sent a verification link to <strong>{signupEmail}</strong>. Click the link
            to activate your account.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm text-(--color-accent) hover:text-(--color-accent-hover) font-medium"
          >
            Go to sign in →
          </Link>
        </Card>
      </main>
    );
  }

  // ── Signup form ───────────────────────────────────────────────────────────────
  if (isSignup) {
    return (
      <main className="min-h-screen bg-(--color-bg) flex flex-col items-center justify-start pt-16 px-4 pb-16">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-8 h-8 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-sm font-bold select-none">
            OA
          </span>
          <span className="font-semibold text-(--color-text-primary)">OfferAccept</span>
        </div>

        <Card className="w-full max-w-sm">
          <div className="px-6 pt-6 pb-2 text-center">
            <h1 className="text-lg font-semibold text-(--color-text-primary)">Create your account</h1>
            <p className="mt-1 text-sm text-(--color-text-muted)">
              Secure deal management with tamper-proof certificates
            </p>
          </div>

          <CardSection border={false} className="px-6 pb-2">
            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <form onSubmit={handleSignup} className="flex flex-col gap-3.5">
              <Input
                label="Organisation name"
                type="text"
                autoComplete="organization"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                maxLength={100}
                placeholder="Acme AS"
              />
              <Input
                label="Your name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="Ola Nordmann"
              />
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
                placeholder="you@company.com"
              />
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                placeholder="At least 8 characters"
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repeat password"
              />

              {/* ToS acceptance — required; version captured at submit time */}
              <label className="flex items-start gap-2.5 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-(--color-border) text-(--color-accent) accent-(--color-accent) flex-shrink-0"
                  required
                />
                <span className="text-xs text-(--color-text-secondary) leading-relaxed">
                  I have read and accept the{' '}
                  <Link
                    href="/legal/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--color-accent) hover:text-(--color-accent-hover) font-medium underline"
                  >
                    Terms of Service
                  </Link>{' '}
                  (v{CURRENT_TERMS_VERSION}) and{' '}
                  <Link
                    href="/legal/gdpr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--color-accent) hover:text-(--color-accent-hover) font-medium underline"
                  >
                    Privacy & GDPR Statement
                  </Link>
                  .
                </span>
              </label>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-1"
              >
                Create account
              </Button>
            </form>
          </CardSection>

          <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-[11px] text-(--color-text-muted)">
            <Lock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            Acceptance of Terms v{CURRENT_TERMS_VERSION} is recorded at signup.
          </div>
        </Card>

        <p className="mt-5 text-xs text-(--color-text-muted)">
          Already have an account?{' '}
          <Link href="/login" className="text-(--color-accent) hover:text-(--color-accent-hover) font-medium">
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  // ── Login form ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-(--color-bg) flex flex-col items-center justify-start pt-20 px-4">
      {/* Brand */}
      <div className="flex items-center gap-2 mb-8">
        <span className="w-8 h-8 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-sm font-bold select-none">
          OA
        </span>
        <span className="font-semibold text-(--color-text-primary)">OfferAccept</span>
      </div>

      <Card className="w-full max-w-sm">
        <div className="px-6 pt-6 pb-2 text-center">
          <h1 className="text-lg font-semibold text-(--color-text-primary)">Welcome back</h1>
          <p className="mt-1 text-sm text-(--color-text-muted)">Secure deal management</p>
        </div>

        <CardSection border={false} className="px-6 pb-2">
          {passwordReset && (
            <Alert variant="success" className="mb-4">Password updated. Sign in with your new password.</Alert>
          )}
          {error && (
            <Alert variant="error" className="mb-4">{error}</Alert>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
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
                <Link href="/forgot-password" className="text-xs text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-1">
              Sign in
            </Button>
          </form>
        </CardSection>

        <div className="px-6 pb-5 pt-1 flex items-center justify-center gap-1.5 text-[11px] text-(--color-text-muted)">
          <Lock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
          Secure offer acceptance with verifiable audit trails.
        </div>
      </Card>

      <p className="mt-5 text-xs text-(--color-text-muted)">
        Don&apos;t have an account?{' '}
        <Link href="/login?mode=signup" className="text-(--color-accent) hover:text-(--color-accent-hover) font-medium">
          Create one
        </Link>
      </p>
    </main>
  );
}
