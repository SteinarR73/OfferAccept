'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

export default function OffersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[OffersError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
      <AlertTriangle className="w-10 h-10 text-amber-400 mb-4" aria-hidden="true" />
      <h2 className="text-base font-semibold text-gray-900 mb-1">Could not load deals</h2>
      <p className="text-sm text-(--color-text-muted) mb-6 max-w-sm">
        There was a problem fetching your deals. Please try again.
      </p>
      <Button variant="primary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
