import { cn } from '@/lib/cn';

const PADDING = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
} as const;

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  as?: 'div' | 'section' | 'article';
  className?: string;
  padding?: keyof typeof PADDING;
  children: React.ReactNode;
}

export function Card({ as: Tag = 'div', className, padding = 'none', children }: CardProps) {
  return (
    <Tag
      className={cn(
        'bg-white rounded-xl border border-gray-200 shadow-[var(--shadow-card)]',
        PADDING[padding],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

// ── CardHeader ────────────────────────────────────────────────────────────────

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  border?: boolean;
  className?: string;
}

export function CardHeader({ title, description, action, border = false, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 py-4',
        border && 'border-b border-gray-100',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900 leading-snug">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-[--color-text-muted] leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

// ── CardSection ───────────────────────────────────────────────────────────────

interface CardSectionProps {
  className?: string;
  border?: boolean;
  children: React.ReactNode;
}

export function CardSection({ className, border = true, children }: CardSectionProps) {
  return (
    <div className={cn('px-5 py-4', border && 'border-t border-gray-100', className)}>
      {children}
    </div>
  );
}

// ── CardFooter ────────────────────────────────────────────────────────────────

interface CardFooterProps {
  className?: string;
  children: React.ReactNode;
}

export function CardFooter({ className, children }: CardFooterProps) {
  return (
    <div className={cn('px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl', className)}>
      {children}
    </div>
  );
}
