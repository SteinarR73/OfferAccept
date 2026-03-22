'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToastItems } from '@/lib/toast';

const ICON = { success: CheckCircle, error: XCircle, info: Info } as const;
const STYLE = {
  success: 'bg-white border-green-300 text-green-800',
  error:   'bg-white border-red-300 text-red-700',
  info:    'bg-white border-blue-300 text-blue-800',
} as const;
const ICON_COLOR = {
  success: 'text-green-500',
  error:   'text-red-500',
  info:    'text-blue-500',
} as const;

function ToastItem({ id, variant, message }: { id: string; variant: keyof typeof STYLE; message: string }) {
  const { remove } = useToastItems();
  const Icon = ICON[variant];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border shadow-md px-4 py-3 text-sm',
        'animate-slide-right max-w-sm w-full',
        STYLE[variant],
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', ICON_COLOR[variant])} aria-hidden="true" />
      <p className="flex-1 leading-snug">{message}</p>
      <button
        onClick={() => remove(id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity rounded focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastItems();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem id={t.id} variant={t.variant} message={t.message} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
