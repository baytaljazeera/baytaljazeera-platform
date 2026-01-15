'use client';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  variant?: 'default' | 'compact' | 'card';
}

const defaultIcons = {
  search: (
    <svg className="w-16 h-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  document: (
    <svg className="w-16 h-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  inbox: (
    <svg className="w-16 h-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = 'default',
}: EmptyStateProps) {
  const variantStyles = {
    default: 'py-16 px-8',
    compact: 'py-8 px-4',
    card: 'py-12 px-6 bg-white rounded-xl border border-slate-100 shadow-sm',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        variantStyles[variant],
        className
      )}
    >
      <div className="mb-4 opacity-80">{icon || defaultIcons.inbox}</div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">{title}</h3>
      {description && (
        <p className="text-slate-500 text-sm max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold to-lightgold text-navy font-semibold rounded-lg hover:shadow-lg hover:shadow-gold/25 transition-all duration-200 hover:scale-[1.02]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function NoSearchResults({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={defaultIcons.search}
      title="لا توجد نتائج"
      description="لم نتمكن من العثور على ما تبحث عنه. جرّب تغيير معايير البحث"
      action={onClear ? { label: 'مسح الفلاتر', onClick: onClear } : undefined}
      variant="card"
    />
  );
}

export function NoDataFound({ message = 'لا توجد بيانات' }: { message?: string }) {
  return (
    <EmptyState
      icon={defaultIcons.document}
      title={message}
      description="لم يتم العثور على أي بيانات حالياً"
      variant="compact"
    />
  );
}

export function EmptyInbox({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={defaultIcons.inbox}
      title="صندوق الوارد فارغ"
      description="لا توجد رسائل جديدة حالياً"
      action={onAction ? { label: 'إرسال رسالة', onClick: onAction } : undefined}
      variant="card"
    />
  );
}
