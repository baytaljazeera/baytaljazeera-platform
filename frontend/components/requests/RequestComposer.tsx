"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Wallet, User, Wrench, Flag, MessageSquareWarning, ChevronLeft,
  Loader2, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────
// Premium unified request composer for بيت الجزيرة
// ─────────────────────────────────────────────────────────────────
// Replaces the old separate /complaint form + /account/my-tickets
// "تذكرة جديدة" form. ANY customer request flows through this:
//   - Financial (refund, invoice, failed payment, subscription, pricing)
//   - Account (profile, access, deletion, listing issue)
//   - Technical (bug, slowness, map, media upload, AI)
//   - Property report (per-listing flag, opened from /listing/[id])
//   - General complaint (against an advertiser, escalation)
//
// Single backend call: POST /api/support with ticket_type + the right
// subcategory/priority/auto-routed role.
//
// Props:
//   open                 — visibility
//   onClose              — close handler
//   onCreated(ticket)    — fires after successful POST with the created row
//   initialTicketType    — if set, skips type-picker (e.g. "property_report"
//                          when opened from a listing page)
//   initialContext       — { relatedPropertyId, propertyTitle, invoiceId, ... }
//   triggerLabel         — copy hint for buttons that opened the composer
// ─────────────────────────────────────────────────────────────────

export type TicketTypeKey =
  | "financial"
  | "account"
  | "technical"
  | "property_report"
  | "general_complaint";

interface RequestComposerProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (ticket: { id: number; ticket_number?: string }) => void;
  initialTicketType?: TicketTypeKey;
  initialContext?: {
    relatedPropertyId?: string;
    propertyTitle?: string;
    invoiceId?: number | string;
  };
}

interface Subcategory {
  code: string;
  label: string;
  priority?: "low" | "medium" | "high" | "urgent";
}

interface TypeConfig {
  key: TicketTypeKey;
  label: string;
  tagline: string;
  Icon: typeof Wallet;
  iconBg: string;
  iconColor: string;
  ringClass: string;
  apiTicketType: string;
  defaultDepartment?: "financial" | "account" | "technical";
  subcategories: Subcategory[];
}

const TYPES: TypeConfig[] = [
  {
    key: "financial",
    label: "مالية",
    tagline: "فاتورة، اشتراك، استرداد، دفع",
    Icon: Wallet,
    iconBg: "bg-gradient-to-br from-emerald-50 to-emerald-100",
    iconColor: "text-emerald-700",
    ringClass: "hover:border-emerald-300 hover:ring-emerald-100",
    apiTicketType: "financial",
    defaultDepartment: "financial",
    subcategories: [
      { code: "refund", label: "استرداد مبلغ", priority: "high" },
      { code: "invoice", label: "فاتورة أو إيصال", priority: "medium" },
      { code: "failed_payment", label: "دفع فاشل", priority: "high" },
      { code: "subscription", label: "اشتراك أو تجديد", priority: "medium" },
      { code: "pricing_inquiry", label: "استفسار عن الأسعار", priority: "low" },
    ],
  },
  {
    key: "account",
    label: "حسابي / إداري",
    tagline: "بيانات، صلاحيات، توثيق، إعلانات",
    Icon: User,
    iconBg: "bg-gradient-to-br from-blue-50 to-blue-100",
    iconColor: "text-blue-700",
    ringClass: "hover:border-blue-300 hover:ring-blue-100",
    apiTicketType: "account",
    defaultDepartment: "account",
    subcategories: [
      { code: "profile_edit", label: "تعديل بيانات الحساب", priority: "low" },
      { code: "access", label: "صلاحيات أو وصول", priority: "medium" },
      { code: "verify", label: "توثيق الحساب", priority: "medium" },
      { code: "delete_account", label: "حذف الحساب", priority: "medium" },
      { code: "listing_issue", label: "مشكلة في إعلان", priority: "medium" },
    ],
  },
  {
    key: "technical",
    label: "تقنية",
    tagline: "خطأ، بطء، خرائط، صور، AI",
    Icon: Wrench,
    iconBg: "bg-gradient-to-br from-purple-50 to-purple-100",
    iconColor: "text-purple-700",
    ringClass: "hover:border-purple-300 hover:ring-purple-100",
    apiTicketType: "technical",
    defaultDepartment: "technical",
    subcategories: [
      { code: "site_bug", label: "خطأ في الموقع", priority: "medium" },
      { code: "performance", label: "بطء في الأداء", priority: "low" },
      { code: "map", label: "مشكلة في الخريطة", priority: "low" },
      { code: "media", label: "رفع الصور/الفيديو", priority: "medium" },
      { code: "ai", label: "مشكلة في الذكاء الاصطناعي", priority: "low" },
    ],
  },
  {
    key: "property_report",
    label: "بلاغ ضد إعلان",
    tagline: "إعلان مخالف، مكرر، احتيال، محتوى غير لائق",
    Icon: Flag,
    iconBg: "bg-gradient-to-br from-rose-50 to-rose-100",
    iconColor: "text-rose-700",
    ringClass: "hover:border-rose-300 hover:ring-rose-100",
    apiTicketType: "property_report",
    subcategories: [
      { code: "expired", label: "إعلان منتهي", priority: "medium" },
      { code: "duplicate", label: "إعلان مكرر", priority: "medium" },
      { code: "wrong_info", label: "معلومات غير صحيحة", priority: "medium" },
      { code: "bad_photos", label: "صور غير مناسبة", priority: "high" },
      { code: "misleading_price", label: "سعر مضلل", priority: "high" },
      { code: "unavailable", label: "العقار غير متاح", priority: "medium" },
      { code: "scam", label: "إعلان احتيالي أو مشبوه", priority: "urgent" },
      { code: "inappropriate", label: "محتوى مخالف للآداب أو القيم الإسلامية", priority: "urgent" },
      { code: "off_topic", label: "إعلان لا علاقة له بالعقار", priority: "medium" },
      { code: "wrong_contact", label: "رقم تواصل غير صحيح", priority: "medium" },
      { code: "other", label: "سبب آخر", priority: "medium" },
    ],
  },
  {
    key: "general_complaint",
    label: "شكوى عامة",
    tagline: "تجربة سيئة، تصعيد للإدارة",
    Icon: MessageSquareWarning,
    iconBg: "bg-gradient-to-br from-amber-50 to-amber-100",
    iconColor: "text-amber-700",
    ringClass: "hover:border-amber-300 hover:ring-amber-100",
    apiTicketType: "general_complaint",
    defaultDepartment: "account",
    subcategories: [
      { code: "against_advertiser", label: "شكوى ضد معلن", priority: "high" },
      { code: "against_service", label: "شكوى ضد خدمة", priority: "medium" },
      { code: "bad_experience", label: "تجربة سيئة", priority: "medium" },
      { code: "escalation", label: "تصعيد للإدارة", priority: "high" },
    ],
  },
];

const PRIORITY_LABELS: Record<string, { label: string; tone: string }> = {
  low:    { label: "منخفض",  tone: "bg-slate-100 text-slate-600" },
  medium: { label: "متوسط",  tone: "bg-blue-50 text-blue-700" },
  high:   { label: "عالٍ",   tone: "bg-amber-50 text-amber-700" },
  urgent: { label: "عاجل",   tone: "bg-red-50 text-red-700" },
};

export default function RequestComposer({
  open,
  onClose,
  onCreated,
  initialTicketType,
  initialContext,
}: RequestComposerProps) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);

  const [step, setStep] = useState<"type" | "details">("type");
  const [selectedType, setSelectedType] = useState<TypeConfig | null>(null);
  const [selectedSubcat, setSelectedSubcat] = useState<Subcategory | null>(null);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: number; ticketNumber?: string } | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  // Reset on open + apply initial type if provided.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setSubmitting(false);
    if (initialTicketType) {
      const t = TYPES.find((x) => x.key === initialTicketType) || null;
      setSelectedType(t);
      setStep(t ? "details" : "type");
      if (t && initialContext?.propertyTitle) {
        setSubject(`بلاغ على إعلان: ${initialContext.propertyTitle}`);
      }
    } else {
      setStep("type");
      setSelectedType(null);
      setSubject("");
      setDescription("");
    }
    setSelectedSubcat(null);
    setPriority("medium");
  }, [open, initialTicketType, initialContext?.propertyTitle]);

  // Auto-focus subject when entering details step
  useEffect(() => {
    if (step === "details" && subjectRef.current && !success) {
      setTimeout(() => subjectRef.current?.focus(), 50);
    }
  }, [step, success]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const goToDetails = (t: TypeConfig) => {
    setSelectedType(t);
    setStep("details");
  };

  const pickSubcat = (s: Subcategory) => {
    setSelectedSubcat(s);
    if (s.priority) setPriority(s.priority);
    // Auto-prefill subject hint when none yet
    if (!subject && selectedType?.key === "property_report" && initialContext?.propertyTitle) {
      setSubject(`بلاغ على إعلان: ${initialContext.propertyTitle} — ${s.label}`);
    } else if (!subject) {
      setSubject(s.label);
    }
  };

  const submit = async () => {
    if (!selectedType) return;
    if (!subject.trim() || !description.trim()) {
      setError("الموضوع والوصف مطلوبان");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        ticket_type: selectedType.apiTicketType,
        department: selectedType.defaultDepartment,
        subcategory: selectedSubcat?.code || null,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        source: initialTicketType === "property_report" ? "property_report" : "unified_composer",
        report_reason_code: selectedType.key === "property_report" ? selectedSubcat?.code : null,
      };
      if (initialContext?.relatedPropertyId) {
        body.related_property_id = initialContext.relatedPropertyId;
      }
      if (initialContext?.invoiceId) {
        body.invoice_id = initialContext.invoiceId;
      }

      const res = await fetch(`${API_URL}/api/support`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) throw new Error("يجب تسجيل الدخول لإرسال الطلب");
        throw new Error(data.error || `فشل الإنشاء (HTTP ${res.status})`);
      }
      const ticket = data.ticket || data;
      setSuccess({
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notificationsUpdated"));
      }
      if (onCreated) onCreated(ticket);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في الإرسال");
    } finally {
      setSubmitting(false);
    }
  };

  if (!portalReady || typeof document === "undefined" || !open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-[#002845]/65 backdrop-blur-md"
        style={{ zIndex: 99998 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        key="panel"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="fixed inset-0 flex items-center justify-center p-3 pointer-events-none"
        style={{ zIndex: 99999 }}
        dir="rtl"
      >
        <div
          className="pointer-events-auto w-full max-w-[640px] max-h-[92dvh] bg-white rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,40,69,0.45)] overflow-hidden border border-white flex flex-col"
        >
          {/* Gold→royal brand strip */}
          <div className="h-1.5 bg-gradient-to-l from-[#D4AF37] via-[#B8860B] to-[#002845]" />

          {/* Header */}
          <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              {step === "details" && selectedType && !initialTicketType && (
                <button
                  type="button"
                  onClick={() => { setStep("type"); setSelectedType(null); }}
                  className="shrink-0 w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
                  aria-label="رجوع"
                >
                  <ChevronLeft className="w-5 h-5 rotate-180" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-extrabold text-[#002845] truncate">
                  {success ? "تم إرسال الطلب" : step === "type" ? "طلب أو شكوى جديدة" : selectedType?.label}
                </h2>
                {!success && (
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {step === "type"
                      ? "اختر نوع الطلب — كل المتابعة تتم في صفحة واحدة"
                      : "اختر الموضوع وأضف التفاصيل، وسنوجّه طلبك للقسم المختص فوراً"}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {success ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                </div>
                <h3 className="text-xl font-extrabold text-[#002845]">تم استلام طلبك</h3>
                <p className="text-sm text-slate-600 mt-2">
                  رقم الطلب: <span className="font-mono font-bold text-[#9A7D28]">{success.ticketNumber || `#${success.id}`}</span>
                </p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-md mx-auto">
                  سيتم الرد عليك من خلال صفحة "طلباتي وشكاواي". ستصلك إشعارات فور رد فريق المختصين.
                </p>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <a
                    href="/account/my-tickets"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold text-sm shadow-[0_8px_20px_-6px_rgba(212,175,55,0.4)] hover:opacity-90 transition"
                  >
                    افتح طلباتي
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            ) : step === "type" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TYPES.map((t) => {
                  const Icon = t.Icon;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => goToDetails(t)}
                      className={`group text-right p-4 rounded-2xl border-2 border-slate-200 bg-white transition-all hover:shadow-lg hover:ring-2 ${t.ringClass} hover:-translate-y-0.5`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`shrink-0 w-12 h-12 rounded-xl ${t.iconBg} flex items-center justify-center`}>
                          <Icon className={`w-6 h-6 ${t.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-[#002845] text-[15px]">{t.label}</div>
                          <div className="text-[11.5px] text-slate-500 mt-0.5 leading-snug">{t.tagline}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              selectedType && (
                <div className="space-y-5">
                  {/* Optional context badge — property report shows the listing title */}
                  {selectedType.key === "property_report" && initialContext?.propertyTitle && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-800">
                      <strong>🚩 الإعلان المُبلَّغ عنه:</strong> {initialContext.propertyTitle}
                    </div>
                  )}

                  {/* Subcategories */}
                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 mb-2">
                      اختر الموضوع
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {selectedType.subcategories.map((s) => {
                        const active = selectedSubcat?.code === s.code;
                        return (
                          <button
                            key={s.code}
                            type="button"
                            onClick={() => pickSubcat(s)}
                            className={`px-3 py-2 rounded-xl text-[12px] font-bold border-2 transition text-right ${
                              active
                                ? "bg-[#FFFCEE] border-[#D4AF37] text-[#9A7D28] shadow-[0_4px_12px_-4px_rgba(212,175,55,0.45)]"
                                : "bg-white border-slate-200 text-slate-700 hover:border-[#D4AF37]/60"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 mb-2">
                      الأولوية
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(["low", "medium", "high", "urgent"] as const).map((p) => {
                        const active = priority === p;
                        const cfg = PRIORITY_LABELS[p];
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPriority(p)}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                              active
                                ? "border-[#D4AF37] bg-[#FFFCEE] text-[#9A7D28]"
                                : `border-slate-200 ${cfg.tone} hover:border-slate-300`
                            }`}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 mb-1">
                      عنوان مختصر <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={subjectRef}
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="مثال: لم تظهر فاتورتي بعد الترقية"
                      maxLength={150}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37]"
                    />
                  </div>

                  {/* Details */}
                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 mb-1">
                      التفاصيل <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="اشرح الموضوع بوضوح ليتمكّن فريقنا من مساعدتك بسرعة. كلما كانت التفاصيل أدق، كانت الاستجابة أسرع وأدق."
                      rows={5}
                      maxLength={4000}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] resize-y"
                    />
                    <div className="text-[10px] text-slate-400 text-left mt-1">{description.length} / 4000</div>
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-[12px] text-red-700 font-medium">{error}</p>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {/* Footer (only on details step, before success) */}
          {step === "details" && !success && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                ستصلك الردود في <strong className="text-[#002845]">صفحة طلباتي</strong> + إشعار على الجرس.
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !subject.trim() || !description.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold text-sm shadow-[0_8px_20px_-6px_rgba(212,175,55,0.5)] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                إرسال الطلب
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
