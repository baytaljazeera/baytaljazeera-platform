'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'premium' | 'glass' | 'bordered';
  hover?: 'lift' | 'glow' | 'scale' | 'border' | 'none';
  onClick?: () => void;
}

export function AnimatedCard({
  children,
  className,
  variant = 'default',
  hover = 'lift',
  onClick,
}: AnimatedCardProps) {
  const variantStyles = {
    default: 'bg-white border border-slate-100',
    premium: 'bg-gradient-to-br from-white to-cream border border-gold/20',
    glass: 'bg-white/80 backdrop-blur-sm border border-white/20',
    bordered: 'bg-white border-2 border-slate-200',
  };

  const hoverStyles = {
    lift: 'hover:-translate-y-1 hover:shadow-lg',
    glow: 'hover:shadow-gold hover:border-gold/30',
    scale: 'hover:scale-[1.02]',
    border: 'hover:border-gold',
    none: '',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl transition-all duration-300 ease-out',
        variantStyles[variant],
        hoverStyles[hover],
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

interface PremiumBadgeProps {
  children: ReactNode;
  variant?: 'gold' | 'navy' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

export function PremiumBadge({
  children,
  variant = 'gold',
  size = 'md',
  pulse = false,
  className,
}: PremiumBadgeProps) {
  const variantStyles = {
    gold: 'bg-gradient-to-r from-gold to-lightgold text-navy',
    navy: 'bg-gradient-to-r from-navy to-royalblue text-white',
    success: 'bg-gradient-to-r from-emerald-500 to-green-400 text-white',
    warning: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-navy',
    danger: 'bg-gradient-to-r from-red-500 to-rose-400 text-white',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold rounded-full shadow-sm',
        variantStyles[variant],
        sizeStyles[size],
        pulse && 'animate-pulse',
        className
      )}
    >
      {children}
    </span>
  );
}

interface RibbonProps {
  children: ReactNode;
  position?: 'top-right' | 'top-left';
  variant?: 'gold' | 'navy' | 'red';
}

export function Ribbon({
  children,
  position = 'top-right',
  variant = 'gold',
}: RibbonProps) {
  const positionStyles = {
    'top-right': 'top-4 -right-8 rotate-45',
    'top-left': 'top-4 -left-8 -rotate-45',
  };

  const variantStyles = {
    gold: 'bg-gradient-to-r from-gold to-lightgold text-navy',
    navy: 'bg-gradient-to-r from-navy to-royalblue text-white',
    red: 'bg-gradient-to-r from-red-600 to-red-500 text-white',
  };

  return (
    <div
      className={cn(
        'absolute px-10 py-1 text-xs font-bold shadow-md',
        positionStyles[position],
        variantStyles[variant]
      )}
    >
      {children}
    </div>
  );
}
