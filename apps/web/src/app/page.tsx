'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';
import { SpinnerPage } from '../components/ui/Spinner';

// Smart router: authenticated → /dashboard, unauthenticated → /landing
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    } else {
      router.replace('/landing');
    }
  }, [router]);

  return <SpinnerPage />;
}
