'use client';

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'gold' | 'navy' | 'white' | 'gradient';
  className?: string;
}

export function LoadingSpinner({
  size = 'md',
  variant = 'gold',
  className,
}: LoadingSpinnerProps) {
  const sizeStyles = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
    xl: 'w-12 h-12 border-4',
  };

  const variantStyles = {
    gold: 'border-gold/20 border-t-gold',
    navy: 'border-navy/20 border-t-navy',
    white: 'border-white/20 border-t-white',
    gradient: 'border-transparent border-t-gold border-r-navy',
  };

  return (
    <div
      className={cn(
        'rounded-full animate-spin',
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
    />
  );
}

interface LoadingOverlayProps {
  message?: string;
  variant?: 'light' | 'dark' | 'blur';
}

export function LoadingOverlay({
  message = 'جاري التحميل...',
  variant = 'light',
}: LoadingOverlayProps) {
  const bgStyles = {
    light: 'bg-white/80',
    dark: 'bg-navy/80',
    blur: 'bg-white/60 backdrop-blur-sm',
  };

  const textColor = variant === 'dark' ? 'text-white' : 'text-navy';

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center z-50 rounded-inherit',
        bgStyles[variant]
      )}
    >
      <LoadingSpinner size="xl" variant={variant === 'dark' ? 'white' : 'gold'} />
      {message && (
        <p className={cn('mt-4 font-medium', textColor)}>{message}</p>
      )}
    </div>
  );
}

interface PageLoadingProps {
  message?: string;
}

export function PageLoading({ message = 'جاري تحميل الصفحة...' }: PageLoadingProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-gold/20 animate-pulse" />
        <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-gold animate-spin" />
      </div>
      <p className="mt-6 text-navy font-medium">{message}</p>
    </div>
  );
}

export function ButtonLoading({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LoadingSpinner size="sm" variant="white" />
      <span>جاري التحميل...</span>
    </span>
  );
}
