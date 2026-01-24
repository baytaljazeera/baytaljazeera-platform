export type SeverityLevel = 'critical' | 'warning' | 'success' | 'neutral';

export interface StatusTheme {
  severity: SeverityLevel;
  bg: string;
  text: string;
  border: string;
  label: string;
  icon?: string;
}

export const SEVERITY_COLORS = {
  critical: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    badgeBg: 'bg-red-500',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
  warning: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
    badgeBg: 'bg-amber-500',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  success: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    badgeBg: 'bg-green-500',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
  neutral: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    badgeBg: 'bg-slate-400',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
  },
};

export const LISTINGS_STATUS: Record<string, StatusTheme> = {
  pending: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'جديد' },
  in_review: { severity: 'warning', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', label: 'قيد المراجعة' },
  active: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'نشط' },
  approved: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'مقبول' },
  rejected: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'مرفوض' },
  hidden: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'مخفي' },
  expired: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'منتهي' },
};

export const REPORTS_STATUS: Record<string, StatusTheme> = {
  new: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'جديد' },
  pending: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'جديد' },
  in_review: { severity: 'warning', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', label: 'قيد المراجعة' },
  accepted: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'تم الحل' },
  resolved: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'تم الحل' },
  closed: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'تم الحل' },
  rejected: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'غير مقبول' },
  dismissed: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'غير مقبول' },
};

export const COMPLAINTS_STATUS: Record<string, StatusTheme> = {
  new: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'جديد' },
  in_review: { severity: 'warning', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', label: 'قيد المراجعة' },
  closed: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'تم الحل' },
  dismissed: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'غير مقبول' },
};

export const SUPPORT_STATUS: Record<string, StatusTheme> = {
  new: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'جديد' },
  open: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'مفتوح' },
  in_progress: { severity: 'warning', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', label: 'قيد المعالجة' },
  resolved: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'تم الحل' },
  closed: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'مغلق' },
};

export const REFUNDS_STATUS: Record<string, StatusTheme> = {
  pending: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'جديد' },
  approved: { severity: 'warning', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', label: 'تمت الموافقة - بانتظار التحويل' },
  refunded: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'تم التحويل' },
  rejected: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'مرفوض' },
};

export const ELITE_STATUS: Record<string, StatusTheme> = {
  pending_payment: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'بانتظار الدفع' },
  pending_approval: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'بانتظار الموافقة' },
  active: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'نشط' },
  expired: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'منتهي' },
  cancelled: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'ملغي' },
};

export const MEMBERSHIP_STATUS: Record<string, StatusTheme> = {
  pending: { severity: 'critical', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'جديد' },
  approved: { severity: 'success', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: 'مقبول' },
  rejected: { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'مرفوض' },
};

export function getStatusTheme(statusMap: Record<string, StatusTheme>, status: string): StatusTheme {
  return statusMap[status] || { severity: 'neutral', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: status };
}
