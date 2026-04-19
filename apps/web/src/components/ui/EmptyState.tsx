import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  /** Primary description — should be 1–2 sentences, 14px */
  description?: string;
  /** Secondary hint — shown below the CTA in muted text, 12px */
  hint?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, hint, action, secondaryAction, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-12 text-center', className)}>
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-(--color-neutral-surface) flex items-center justify-center text-(--color-text-muted)">
          {icon}
        </div>
      )}
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-(--color-text-primary)">{title}</p>
        {description && (
          <p className="mt-1.5 text-sm text-(--color-text-secondary) leading-relaxed">{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
          {action && (
            action.href ? (
              <Link href={action.href}>
                <Button variant="primary" size="sm">{action.label}</Button>
              </Link>
            ) : (
              <Button variant="primary" size="sm" onClick={action.onClick}>{action.label}</Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Link href={secondaryAction.href}>
                <Button variant="secondary" size="sm">{secondaryAction.label}</Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
            )
          )}
        </div>
      )}
      {hint && (
        <p className="text-xs text-(--color-text-muted) max-w-xs leading-relaxed -mt-1">{hint}</p>
      )}
    </div>
  );
}
