const STATUS_LABELS = {
  pending: 'معلق',
  approved: 'موافق عليه',
  rejected: 'مرفوض',
  in_review: 'قيد المراجعة',
  active: 'نشط',
  on_hold: 'موقوف',
  under_review: 'تحت التدقيق',
  blocked: 'محظور',
  new: 'جديد',
  open: 'مفتوح',
  in_progress: 'قيد التنفيذ',
  resolved: 'تم الحل',
  closed: 'مغلق'
};

const ROLE_LABELS = {
  user: 'مستخدم عادي',
  content_admin: 'مدير المحتوى',
  support_admin: 'مدير الدعم',
  finance_admin: 'مدير المالية',
  admin_manager: 'مدير إداري',
  admin: 'مدير',
  super_admin: 'المدير العام'
};

const VALID_ROLES = ['user', 'content_admin', 'support_admin', 'finance_admin', 'admin_manager', 'admin', 'super_admin'];
const VALID_USER_STATUSES = ['active', 'on_hold', 'under_review', 'blocked'];
const VALID_LISTING_STATUSES = ['pending', 'approved', 'rejected', 'in_review', 'hidden'];

const CACHE_KEYS = {
  PENDING_COUNTS: 'admin:pending-counts',
  USER_STATS: 'admin:users-stats'
};

const CACHE_TTL = {
  SHORT: 15000,
  MEDIUM: 30000,
  LONG: 60000
};

module.exports = {
  STATUS_LABELS,
  ROLE_LABELS,
  VALID_ROLES,
  VALID_USER_STATUSES,
  VALID_LISTING_STATUSES,
  CACHE_KEYS,
  CACHE_TTL
};
