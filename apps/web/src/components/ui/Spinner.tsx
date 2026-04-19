import { cn } from '@/lib/cn';

const SIZE = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-8 h-8 border-2',
} as const;

interface SpinnerProps {
  size?: keyof typeof SIZE;
  className?: string;
  label?: string;
}

export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <span
        className={cn(
          'rounded-full border-(--color-accent-light) border-t-(--color-accent) animate-spin',
          SIZE[size],
          className,
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function SpinnerPage({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-(--color-bg)">
      <Spinner size="lg" label={label} />
      {label !== 'Loading' && (
        <p className="text-sm text-(--color-text-muted)">{label}</p>
      )}
    </div>
  );
}
