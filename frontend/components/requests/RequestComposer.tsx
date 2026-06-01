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

// Listing lookup result shape returned by GET /api/listings/lookup —
// used by the property-report picker when the composer is opened
// without a preselected listing context.
interface ListingLookupRow {
  id: number;
  title: string;
  city: string | null;
  price: number | string | null;
  cover_url: string | null;
}

// Customer's own invoice — surfaced as a picker for financial /
// billing_complaint / refund_claim types so the finance accountant
// later sees exactly which invoice the dispute is about.
interface InvoiceRow {
  id: number;
  invoice_number: string;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
  plan_name?: string | null;
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

  const [step, setStep] = useState<"type" | "pick-property" | "pick-invoice" | "details">("type");
  const [selectedType, setSelectedType] = useState<TypeConfig | null>(null);
  const [selectedSubcat, setSelectedSubcat] = useState<Subcategory | null>(null);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: number; ticketNumber?: string } | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  // ─── Property picker state (only used when ticket_type=property_report
  // and no preselected listing) ───────────────────────────────────────
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<ListingLookupRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickedProperty, setPickedProperty] = useState<{ id: string; title: string } | null>(null);

  // ─── Invoice picker state (only used when ticket_type=financial /
  // billing_complaint / refund_claim and no preselected invoice) ─
  const [invoiceList, setInvoiceList] = useState<InvoiceRow[]>([]);
  const [invoiceListLoading, setInvoiceListLoading] = useState(false);
  const [pickedInvoice, setPickedInvoice] = useState<{ id: number; label: string } | null>(null);
  const [skipInvoiceLink, setSkipInvoiceLink] = useState(false); // "ليس عن فاتورة محددة"

  // Reset on open + apply initial type if provided.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setSubmitting(false);
    setPickerQuery("");
    setPickerResults([]);
    setPickedProperty(null);
    setInvoiceList([]);
    setPickedInvoice(null);
    setSkipInvoiceLink(false);

    if (initialTicketType) {
      const t = TYPES.find((x) => x.key === initialTicketType) || null;
      setSelectedType(t);
      // property_report without a pre-selected listing → picker step
      if (t && t.key === "property_report" && !initialContext?.relatedPropertyId) {
        setStep("pick-property");
      } else {
        setStep(t ? "details" : "type");
      }
      if (t && initialContext?.propertyTitle) {
        setSubject(`بلاغ على إعلان: ${initialContext.propertyTitle}`);
      }
      if (initialContext?.relatedPropertyId && initialContext?.propertyTitle) {
        setPickedProperty({
          id: initialContext.relatedPropertyId,
          title: initialContext.propertyTitle,
        });
      }
    } else {
      setStep("type");
      setSelectedType(null);
      setSubject("");
      setDescription("");
    }
    setSelectedSubcat(null);
    setPriority("medium");
  }, [open, initialTicketType, initialContext?.propertyTitle, initialContext?.relatedPropertyId]);

  // Debounced lookup against /api/listings/lookup. Fires when the
  // user types ≥ 2 chars; cancelled if a newer keystroke arrives
  // within 250ms.
  useEffect(() => {
    if (step !== "pick-property") return;
    const q = pickerQuery.trim();
    if (q.length < 2) {
      setPickerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const r = await fetch(`${API_URL}/api/listings/lookup?q=${encodeURIComponent(q)}`);
        if (r.ok) {
          const d = await r.json();
          setPickerResults(d.results || []);
        }
      } catch {
        /* silent — keep last results */
      } finally {
        setPickerLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [pickerQuery, step]);

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
    // Property reports without preselected listing must pick the
    // target ad first — without it the report has no anchor.
    if (t.key === "property_report" && !pickedProperty) {
      setStep("pick-property");
      return;
    }
    // Financial-flavored tickets benefit from being tied to a
    // specific invoice (the accountant later uses it to compute
    // the smart refund suggestion). If the user already has at
    // least one invoice we offer the picker; otherwise skip.
    if (t.key === "financial" && !initialContext?.invoiceId && !pickedInvoice) {
      setStep("pick-invoice");
      return;
    }
    setStep("details");
  };

  const confirmPickedProperty = (row: ListingLookupRow) => {
    setPickedProperty({ id: String(row.id), title: row.title });
    // Pre-fill the subject as a courtesy; user can edit.
    if (!subject) setSubject(`بلاغ على إعلان: ${row.title}`);
    setStep("details");
  };

  const confirmPickedInvoice = (row: InvoiceRow) => {
    setPickedInvoice({
      id: row.id,
      label: `${row.invoice_number} — ${row.total} ${row.currency || ""}`.trim(),
    });
    setSkipInvoiceLink(false);
    setStep("details");
  };

  // Fetch the customer's invoices once the invoice picker step opens.
  useEffect(() => {
    if (step !== "pick-invoice") return;
    if (invoiceList.length > 0) return;
    setInvoiceListLoading(true);
    fetch(`${API_URL}/api/payments/invoices`, {
      credentials: "include",
      headers: getAuthHeaders(),
    })
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d) => setInvoiceList(d.invoices || []))
      .catch(() => setInvoiceList([]))
      .finally(() => setInvoiceListLoading(false));
  }, [step, invoiceList.length]);

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
      // Prefer the explicitly picked property (user picked it from
      // the search step); fall back to initialContext (came from a
      // listing page that pre-set it).
      const propertyId = pickedProperty?.id || initialContext?.relatedPropertyId;
      if (propertyId) {
        body.related_property_id = propertyId;
      }
      // Invoice link: user-picked invoice wins; falls back to
       // initialContext (e.g. came from /invoices/:id "تقديم استرداد").
      const invoiceLinkId = pickedInvoice?.id || initialContext?.invoiceId;
      if (invoiceLinkId) {
        body.invoice_id = invoiceLinkId;
      }
      // Hard guard: property_report MUST have a listing anchor.
      if (selectedType.key === "property_report" && !propertyId) {
        setError("يجب اختيار الإعلان أولاً");
        setSubmitting(false);
        setStep("pick-property");
        return;
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
              {(step === "details" || step === "pick-property" || step === "pick-invoice") && selectedType && !initialTicketType && (
                <button
                  type="button"
                  onClick={() => {
                    if (step === "details" && selectedType.key === "property_report" && !initialContext?.relatedPropertyId) {
                      setStep("pick-property");
                    } else if (step === "details" && selectedType.key === "financial" && !initialContext?.invoiceId) {
                      setStep("pick-invoice");
                    } else {
                      setStep("type");
                      setSelectedType(null);
                      setPickedProperty(null);
                      setPickedInvoice(null);
                      setSkipInvoiceLink(false);
                    }
                  }}
                  className="shrink-0 w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
                  aria-label="رجوع"
                >
                  <ChevronLeft className="w-5 h-5 rotate-180" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-extrabold text-[#002845] truncate">
                  {success
                    ? "تم إرسال الطلب"
                    : step === "type"
                      ? "طلب أو شكوى جديدة"
                      : step === "pick-property"
                        ? "اختر الإعلان المُبلَّغ عنه"
                        : step === "pick-invoice"
                          ? "اختر الفاتورة المتعلّقة"
                          : selectedType?.label}
                </h2>
                {!success && (
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {step === "type"
                      ? "اختر نوع الطلب — كل المتابعة تتم في صفحة واحدة"
                      : step === "pick-property"
                        ? "اكتب رقم الإعلان أو جزء من عنوانه — اخترنا له ٨ نتائج"
                        : step === "pick-invoice"
                          ? "اختر الفاتورة لتسريع معالجة الاسترداد، أو تابع بدون فاتورة محددة"
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
            ) : step === "pick-property" ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-800 leading-relaxed">
                  <strong>🚩 بلاغ ضد إعلان</strong> — حدد الإعلان المُبلَّغ عنه. ابحث برقم الإعلان (مثل <span dir="ltr" className="font-mono">12345</span>) أو بجزء من العنوان.
                </div>
                <input
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="رقم الإعلان أو كلمة من العنوان…"
                  autoFocus
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37]"
                />
                <div className="min-h-[180px]">
                  {pickerQuery.trim().length < 2 ? (
                    <div className="text-center text-[12px] text-slate-400 py-8">
                      ابدأ بكتابة حرفين على الأقل…
                    </div>
                  ) : pickerLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : pickerResults.length === 0 ? (
                    <div className="text-center text-[12px] text-slate-500 py-8">
                      لا توجد نتائج مطابقة. جرّب رقم الإعلان مباشرة، أو افتح صفحة الإعلان من{" "}
                      <a href="/search" className="font-bold text-[#9A7D28] underline" target="_blank" rel="noreferrer">
                        البحث
                      </a>
                      {" "}واضغط "الإبلاغ عن الإعلان" من داخل الصفحة.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {pickerResults.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => confirmPickedProperty(row)}
                            className="w-full text-right flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-[#D4AF37] hover:bg-[#FFFCEE] transition group"
                          >
                            <div className="shrink-0 w-14 h-14 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                              {row.cover_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={row.cover_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-slate-400 text-xs">لا صورة</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-[13px] text-[#002845] truncate group-hover:text-[#9A7D28]">
                                {row.title}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                                <span className="font-mono text-slate-400">#{row.id}</span>
                                {row.city && <span>• {row.city}</span>}
                                {row.price != null && (
                                  <span>• {Number(row.price).toLocaleString()} ر.س</span>
                                )}
                              </div>
                            </div>
                            <span className="self-center text-[#9A7D28] opacity-0 group-hover:opacity-100 transition text-[12px] font-bold">
                              اختر ←
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : step === "pick-invoice" ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-800 leading-relaxed">
                  <strong>💳 طلب مالي</strong> — ربط الفاتورة يساعد المحاسب على حساب المبلغ المستحق بدقّة (تناسبياً مع مدة الاشتراك المستخدمة). يمكنك المتابعة بدون فاتورة لو لا ينطبق.
                </div>
                {invoiceListLoading ? (
                  <div className="flex items-center justify-center py-8 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : invoiceList.length === 0 ? (
                  <div className="text-center text-[12px] text-slate-500 py-6 bg-slate-50 rounded-xl border border-slate-200">
                    لا توجد لديك فواتير بعد. تابع بدون ربط فاتورة.
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-[260px] overflow-y-auto">
                    {invoiceList.map((inv) => (
                      <li key={inv.id}>
                        <button
                          type="button"
                          onClick={() => confirmPickedInvoice(inv)}
                          className="w-full text-right flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-[#D4AF37] hover:bg-[#FFFCEE] transition group"
                        >
                          <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                            🧾
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[13px] text-[#002845] truncate">
                              فاتورة {inv.invoice_number}
                              {inv.plan_name && (
                                <span className="font-normal text-slate-500 ms-1.5">— {inv.plan_name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span className="font-bold text-[#9A7D28]">
                                {Number(inv.total).toLocaleString()} {inv.currency || "ر.س"}
                              </span>
                              <span>•</span>
                              <span>{new Date(inv.created_at).toLocaleDateString("ar-SA")}</span>
                              {inv.status && (
                                <>
                                  <span>•</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    inv.status === "paid" || inv.status === "issued"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-100 text-slate-600"
                                  }`}>
                                    {inv.status}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="self-center text-[#9A7D28] opacity-0 group-hover:opacity-100 transition text-[12px] font-bold">
                            اختر ←
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => { setSkipInvoiceLink(true); setStep("details"); }}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50 text-[12px] font-bold transition"
                >
                  متابعة بدون ربط فاتورة
                </button>
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
                  {/* Invoice link context — surfaces for financial
                      types when an invoice was picked. */}
                  {selectedType.key === "financial" && pickedInvoice && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <strong>🧾 الفاتورة المرتبطة:</strong>{" "}
                        <span className="truncate inline-block max-w-full align-middle">
                          {pickedInvoice.label}
                        </span>
                      </div>
                      {!initialContext?.invoiceId && (
                        <button
                          type="button"
                          onClick={() => { setPickedInvoice(null); setStep("pick-invoice"); }}
                          className="shrink-0 text-emerald-700 underline text-[11px] font-bold hover:text-emerald-900"
                        >
                          غيّر
                        </button>
                      )}
                    </div>
                  )}
                  {selectedType.key === "financial" && skipInvoiceLink && !pickedInvoice && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-600">
                      لم يتم ربط فاتورة. <button type="button" className="font-bold underline text-[#9A7D28]" onClick={() => setStep("pick-invoice")}>اربط فاتورة الآن</button>
                    </div>
                  )}

                  {/* Property-report context — title from picker OR
                      from initialContext (came from listing page) */}
                  {selectedType.key === "property_report" && (pickedProperty?.title || initialContext?.propertyTitle) && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <strong>🚩 الإعلان المُبلَّغ عنه:</strong>{" "}
                        <span className="truncate inline-block max-w-full align-middle">
                          {pickedProperty?.title || initialContext?.propertyTitle}
                        </span>
                        {pickedProperty?.id && (
                          <span className="text-rose-600 font-mono text-[10px] ms-1">#{pickedProperty.id}</span>
                        )}
                      </div>
                      {!initialContext?.relatedPropertyId && (
                        <button
                          type="button"
                          onClick={() => { setPickedProperty(null); setStep("pick-property"); }}
                          className="shrink-0 text-rose-700 underline text-[11px] font-bold hover:text-rose-900"
                        >
                          غيّر
                        </button>
                      )}
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
