'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DealsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[deals error]', error);
  }, [error]);

  return (
    <div className="max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]">
      <EmptyState
        icon={<AlertTriangle className="w-6 h-6" aria-hidden="true" />}
        title="Something went wrong"
        description="Could not load deal data. Your deals are safe — this is a temporary display error."
        action={{ label: 'Try again', onClick: reset }}
        secondaryAction={{ label: 'Back to dashboard', href: '/dashboard' }}
      />
    </div>
  );
}
