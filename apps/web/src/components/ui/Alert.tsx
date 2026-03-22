'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

const STYLE = {
  info:    { wrapper: 'bg-blue-50 border-blue-200 text-blue-800',  Icon: Info },
  success: { wrapper: 'bg-green-50 border-green-200 text-green-800', Icon: CheckCircle },
  warning: { wrapper: 'bg-amber-50 border-amber-200 text-amber-800', Icon: AlertTriangle },
  error:   { wrapper: 'bg-red-50 border-red-200 text-red-700',     Icon: XCircle },
} as const;

interface AlertProps {
  variant: keyof typeof STYLE;
  title?: string;
  children?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({ variant, title, children, dismissible, onDismiss, className }: AlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const { wrapper, Icon } = STYLE[variant];

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn('flex gap-3 rounded-lg border p-3.5 text-sm', wrapper, className)}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold leading-snug">{title}</p>}
        {children && <div className={cn('leading-relaxed', title && 'mt-0.5 opacity-90')}>{children}</div>}
      </div>
      {dismissible && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className={cn(
            'flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current',
          )}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
