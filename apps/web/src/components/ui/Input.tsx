import { cn } from '@/lib/cn';

const BASE_INPUT =
  'w-full rounded-lg border bg-(--color-surface) px-3 py-2 text-sm text-(--color-text-primary) ' +
  'placeholder:text-(--color-text-muted) transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:border-transparent ' +
  'disabled:bg-(--color-bg) disabled:text-(--color-text-muted) disabled:cursor-not-allowed read-only:bg-(--color-bg)';

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
  wrapperClassName?: string;
}

export function Input({
  label,
  error,
  hint,
  leftAddon,
  id,
  className,
  wrapperClassName,
  required,
  ...rest
}: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1', wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-(--color-text-primary)">
          {label}
          {required && <span className="ml-0.5 text-(--color-error)" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leftAddon && (
          <span className="absolute left-3 flex items-center text-(--color-text-muted) pointer-events-none">
            {leftAddon}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          required={required}
          className={cn(
            BASE_INPUT,
            error ? 'border-(--color-error-border) focus:ring-(--color-error)' : 'border-(--color-border)',
            leftAddon != null ? 'pl-9' : undefined,
            className,
          )}
        />
      </div>
      {error && <p className="text-xs text-(--color-error) mt-0.5">{error}</p>}
      {!error && hint && <p className="text-xs text-(--color-text-muted) mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export function Textarea({
  label,
  error,
  hint,
  id,
  className,
  wrapperClassName,
  required,
  ...rest
}: TextareaProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col gap-1', wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-(--color-text-primary)">
          {label}
          {required && <span className="ml-0.5 text-(--color-error)" aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        {...rest}
        id={inputId}
        required={required}
        className={cn(
          BASE_INPUT,
          'resize-y min-h-[80px]',
          error ? 'border-(--color-error-border) focus:ring-(--color-error)' : 'border-(--color-border)',
          className,
        )}
      />
      {error && <p className="text-xs text-(--color-error) mt-0.5">{error}</p>}
      {!error && hint && <p className="text-xs text-(--color-text-muted) mt-0.5">{hint}</p>}
    </div>
  );
}
