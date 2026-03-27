import { cn } from '@/lib/cn';

const BASE_INPUT =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-[--color-accent] focus:border-transparent ' +
  'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed read-only:bg-gray-50';

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
        <label htmlFor={inputId} className="text-xs font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leftAddon && (
          <span className="absolute left-3 flex items-center text-gray-400 pointer-events-none">
            {leftAddon}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          required={required}
          className={cn(
            BASE_INPUT,
            error ? 'border-red-400 focus:ring-red-500' : 'border-gray-200',
            leftAddon != null ? 'pl-9' : undefined,
            className,
          )}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      {!error && hint && <p className="text-xs text-[--color-text-muted] mt-0.5">{hint}</p>}
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
        <label htmlFor={inputId} className="text-xs font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        {...rest}
        id={inputId}
        required={required}
        className={cn(
          BASE_INPUT,
          'resize-y min-h-[80px]',
          error ? 'border-red-400 focus:ring-red-500' : 'border-gray-200',
          className,
        )}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      {!error && hint && <p className="text-xs text-[--color-text-muted] mt-0.5">{hint}</p>}
    </div>
  );
}
