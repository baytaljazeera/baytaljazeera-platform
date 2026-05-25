"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { 
  AlertCircle, Send, CheckCircle, User, Mail, Phone,
  MessageSquare, FileText, ChevronRight, ArrowRight, Home, CreditCard
} from "lucide-react";

const categories = [
  { value: "billing", label: "شكوى مالية", icon: CreditCard, description: "استرداد مبلغ، مشاكل الدفع، الفواتير" },
  { value: "technical", label: "شكوى تقنية", icon: AlertCircle, description: "الخريطة، العرض، الإعلانات، مشاكل فنية" },
  { value: "account_issue", label: "مشكلة في الحساب", icon: User, description: "تسجيل الدخول، استعادة كلمة السر، تفعيل الحساب" },
];

// Maps the user-facing category to the canonical complaint_type stored on
// account_complaints. This is what the backend role-scope rules use to route:
//   billing       → finance_admin queue (matches "billing" in scope rules)
//   technical     → content_admin queue (matches "technical")
//   account_issue → content_admin queue (matches "service")
const CATEGORY_TO_COMPLAINT_TYPE: Record<string, string> = {
  billing: "billing",
  technical: "technical",
  account_issue: "service",
};

type UserInvoice = {
  id: number;
  invoice_number?: string;
  total?: number;
  plan_name?: string | null;
  created_at?: string;
};

function ComplaintPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeFromUrl = searchParams.get("type");
  
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [user, setUser] = useState<{ name?: string; email?: string; phone?: string } | null>(null);

  const [category, setCategory] = useState(typeFromUrl || "");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");

  // For billing complaints we let the user link the offending invoice so the
  // backend can route the ticket to the accountant (finance_admin) — the
  // scope rule keys off invoice_id being present.
  const [invoices, setInvoices] = useState<UserInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | "">("");

  // Customer-visible urgency. Default "medium"; "urgent" is intentionally
  // dramatic so it stays a deliberate choice.
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  useEffect(() => {
    if (typeFromUrl && categories.some(c => c.value === typeFromUrl)) {
      setCategory(typeFromUrl);
    }
  }, [typeFromUrl]);

  useEffect(() => {
    fetchUser();
  }, []);

  // Lazy-load the user's invoices the first time they pick "شكوى مالية".
  useEffect(() => {
    if (category !== "billing" || invoices.length > 0 || invoicesLoading) return;
    let cancelled = false;
    (async () => {
      setInvoicesLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/payments/invoices`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        const list: UserInvoice[] = Array.isArray(data) ? data : (data.invoices || []);
        if (!cancelled) setInvoices(list);
      } catch (_) {
        // silent — invoice picker is optional
      } finally {
        if (!cancelled) setInvoicesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [category, invoices.length, invoicesLoading]);

  async function fetchUser() {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const userData = data.user || data;
        setUser(userData);
        setUserName(userData.name || "");
        setUserEmail(userData.email || "");
        setUserPhone(userData.phone || "");
      }
    } catch (e) {
      // Not logged in
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!category || !subject || !details) {
      toast.warning("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    const complaintType = CATEGORY_TO_COMPLAINT_TYPE[category];
    if (!complaintType) {
      toast.error("نوع الشكوى غير صالح");
      return;
    }

    setLoading(true);

    try {
      // Login required so /my-complaints can track it back to the user and
      // the scope rules can resolve assignment cleanly.
      const me = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!me.ok) {
        toast.error("يجب تسجيل الدخول قبل إرسال الشكوى");
        router.push("/login?redirect=/complaint");
        return;
      }

      const res = await fetch(`${API_URL}/api/account-complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          category,
          complaint_type: complaintType,
          priority,
          subject: subject.trim(),
          details: details.trim(),
          userName,
          userEmail,
          userPhone,
          // invoice_id only sent for billing complaints; backend validates
          // ownership and silently drops if invalid.
          ...(category === "billing" && selectedInvoiceId ? { invoice_id: Number(selectedInvoiceId) } : {}),
        }),
      });

      if (res.ok) {
        setSent(true);
        toast.success("تم إرسال شكواك — يمكنك متابعتها من صفحة شكاواي");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { errorAr?: string; error?: string }).errorAr || (data as { error?: string }).error || "حدث خطأ في إرسال الشكوى");
      }
    } catch (error) {
      console.error("Error submitting complaint:", error);
      toast.error("حدث خطأ في الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4" dir="rtl">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#002845] mb-3">تم استلام شكواك</h1>
            <p className="text-slate-600 mb-6">
              شكراً لتواصلك معنا. تم تسجيل شكواك ووُجِّهت تلقائياً للفريق المختص ({category === "billing" ? "المحاسب" : "فريق الدعم"}). تستطيع متابعة الحالة من صفحة شكاواي.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/my-complaints"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#002845] text-white rounded-xl hover:bg-[#003d66] transition font-medium"
              >
                <FileText className="w-5 h-5" />
                متابعة شكاواي
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium"
              >
                <Home className="w-5 h-5" />
                الرئيسية
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/" className="hover:text-[#002845] transition">الرئيسية</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#002845] font-medium">تقديم شكوى</span>
        </nav>

        {/* Header */}
        <div className="bg-gradient-to-l from-[#002845] to-[#003d66] rounded-3xl p-6 mb-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">تقديم شكوى</h1>
              <p className="text-white/70 text-sm mt-1">نحن هنا لمساعدتك في حل أي مشكلة تواجهها</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-lg p-6 space-y-6">
          {/* معلومات المستخدم */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#002845] mb-2">
                <User className="w-4 h-4 inline ml-1" />
                الاسم
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="اسمك الكامل"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#002845] mb-2">
                <Mail className="w-4 h-4 inline ml-1" />
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#002845] mb-2">
                <Phone className="w-4 h-4 inline ml-1" />
                رقم الجوال
              </label>
              <input
                type="tel"
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
                dir="ltr"
              />
            </div>
          </div>

          {/* نوع الشكوى */}
          <div>
            <label className="block text-sm font-medium text-[#002845] mb-3">
              نوع الشكوى <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition text-right ${
                      category === cat.value
                        ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#002845]"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${category === cat.value ? "text-[#D4AF37]" : "text-slate-400"}`} />
                    <span className="text-sm font-medium">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* الأولوية — أربع درجات تتدرّج لونياً */}
          <div>
            <label className="block text-sm font-medium text-[#002845] mb-3">
              مدى استعجال شكواك
            </label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { value: "low",    label: "منخفض",  cls: "border-slate-200 text-slate-600",          active: "border-slate-500 bg-slate-100 text-slate-800" },
                { value: "medium", label: "متوسط",  cls: "border-slate-200 text-slate-600",          active: "border-amber-400 bg-amber-50 text-amber-800" },
                { value: "high",   label: "عالٍ",   cls: "border-slate-200 text-slate-600",          active: "border-orange-400 bg-orange-50 text-orange-800" },
                { value: "urgent", label: "عاجل",   cls: "border-slate-200 text-slate-600",          active: "border-red-400 bg-red-50 text-red-800" },
              ] as const).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition ${priority === p.value ? p.active : p.cls + " hover:border-slate-300"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* اختياري — ربط الفاتورة (للشكاوى المالية فقط) */}
          {category === "billing" && (
            <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4">
              <label className="block text-sm font-medium text-[#002845] mb-2 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-600" />
                ربط الفاتورة <span className="text-slate-400 text-xs font-normal">(اختياري — يسرّع توجيه شكواك للمحاسب)</span>
              </label>
              {invoicesLoading ? (
                <div className="text-xs text-slate-500 py-2">جاري تحميل فواتيرك...</div>
              ) : invoices.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">لا توجد فواتير مرتبطة بحسابك. يمكنك المتابعة بدون ربط فاتورة.</div>
              ) : (
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm bg-white"
                >
                  <option value="">— لا أربط فاتورة —</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number || `#${inv.id}`}
                      {inv.plan_name ? ` — ${inv.plan_name}` : ""}
                      {inv.total != null ? ` — ${Number(inv.total).toLocaleString("en-US")} ر.س` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* عنوان الشكوى */}
          <div>
            <label className="block text-sm font-medium text-[#002845] mb-2">
              عنوان الشكوى <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="اكتب عنوان مختصر للشكوى"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              required
            />
          </div>

          {/* تفاصيل الشكوى */}
          <div>
            <label className="block text-sm font-medium text-[#002845] mb-2">
              تفاصيل الشكوى <span className="text-red-500">*</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="اشرح المشكلة بالتفصيل..."
              rows={5}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] resize-none"
              required
            />
          </div>

          {/* زر الإرسال */}
          <button
            type="submit"
            disabled={loading || !category || !subject || !details}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-l from-[#D4AF37] to-[#B8962E] text-[#002845] rounded-xl hover:from-[#e5c868] hover:to-[#D4AF37] transition font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-[#002845] border-t-transparent rounded-full animate-spin"></div>
                جاري الإرسال...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                إرسال الشكوى
              </>
            )}
          </button>

          <p className="text-xs text-slate-500 text-center">
            يتطلب الإرسال تسجيل الدخول. تُوجَّه شكواك تلقائياً للقسم المختص (المحاسب للشكاوى المالية، فريق الدعم للباقي) ويمكنك متابعتها من صفحة شكاواي.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ComplaintPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <ComplaintPageContent />
    </Suspense>
  );
}
