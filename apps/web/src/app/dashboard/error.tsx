'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
      <AlertTriangle className="w-10 h-10 text-amber-400 mb-4" aria-hidden="true" />
      <h2 className="text-base font-semibold text-gray-900 mb-1">Something went wrong</h2>
      <p className="text-sm text-[--color-text-muted] mb-6 max-w-sm">
        An unexpected error occurred. Your data is safe — try refreshing.
      </p>
      <Button variant="primary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
