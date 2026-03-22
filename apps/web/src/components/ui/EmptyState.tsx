import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
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

export function EmptyState({ icon, title, description, action, secondaryAction, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-12 text-center', className)}>
      {icon && (
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
          {icon}
        </div>
      )}
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {description && <p className="mt-1 text-xs text-[--color-text-muted] leading-relaxed">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
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
    </div>
  );
}
