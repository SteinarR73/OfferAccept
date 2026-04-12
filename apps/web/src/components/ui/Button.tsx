import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

const VARIANT = {
  primary:   'bg-[--color-accent] text-white hover:bg-[--color-accent-hover] focus-visible:ring-[--color-accent] shadow-sm hover:shadow-md',
  secondary: 'bg-white text-[--color-text-secondary] border border-[--color-border] hover:bg-[--color-bg] focus-visible:ring-[--color-accent] shadow-sm',
  ghost:     'text-[--color-text-secondary] hover:bg-[--color-surface] hover:text-[--color-text-primary] focus-visible:ring-[--color-accent]',
  danger:    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm',
} as const;

const SIZE = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
} as const;

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors cursor-pointer ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed select-none btn-lift';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const spinnerSize = size === 'lg' ? 'sm' : 'xs';
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
    >
      {loading ? <Spinner size={spinnerSize} /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
