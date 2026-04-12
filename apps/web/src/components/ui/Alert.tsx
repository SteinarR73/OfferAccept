'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

const STYLE = {
  info:    { wrapper: 'bg-[--color-info-light] border-[--color-info-border] text-[--color-info-text]',       Icon: Info },
  success: { wrapper: 'bg-[--color-success-light] border-[--color-success-border] text-[--color-success-text]', Icon: CheckCircle },
  warning: { wrapper: 'bg-[--color-warning-light] border-[--color-warning-border] text-[--color-warning-text]', Icon: AlertTriangle },
  error:   { wrapper: 'bg-[--color-error-light] border-[--color-error-border] text-[--color-error-text]',    Icon: XCircle },
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
            'flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current',
          )}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
