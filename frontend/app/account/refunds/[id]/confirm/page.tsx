"use client";

// ─────────────────────────────────────────────────────────────────
// /account/refunds/[id]/confirm — customer's refund confirmation.
//
// Reached from the "لديك معاملة استرداد بانتظار تأكيدك" notification
// after finance presses "فتح معاملة استرداد" inside the finance inbox.
//
// What the customer does here:
//   1. Reviews the case number, amount, and remaining time.
//   2. Picks refund method: Credit Card (refund to original card) or
//      Bank (refund to their IBAN).
//   3. If Bank, fills bank name + IBAN + account holder name.
//   4. Confirms → the refund moves to 'awaiting_bank_transfer' and
//      the accountant takes over.
//   OR
//   5. Declines → refund moves to 'rejected'.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  Loader2, CheckCircle2, CreditCard, Building2, AlertTriangle,
  Clock, XCircle, ArrowRight,
} from "lucide-react";

type Refund = {
  id: number;
  case_number: string | null;
  status: string;
  amount: number;
  original_amount: number | null;
  refund_method: "credit_card" | "bank" | null;
  bank_name: string | null;
  bank_account_iban: string | null;
  account_holder_name: string | null;
  customer_confirmation_deadline: string | null;
  customer_confirmed_at: string | null;
  customer_declined_at: string | null;
  invoice_number: string | null;
  created_at: string;
};

function arabicCurrency(n: number): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
  }).format(n);
}

function timeRemaining(deadline: string | null): { label: string; tone: string } {
  if (!deadline) return { label: "—", tone: "text-slate-500" };
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { label: "انتهت المهلة", tone: "text-rose-700 font-black" };
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return { label: `${days} يوم ${hours % 24} ساعة`, tone: "text-emerald-700" };
  if (hours >= 1) return { label: `${hours} ساعة متبقية`, tone: "text-amber-700" };
  return { label: "أقل من ساعة!", tone: "text-rose-700 font-black animate-pulse" };
}

export default function CustomerRefundConfirmPage() {
  const params = useParams();
  const router = useRouter();
  const refundId = params?.id as string;

  const [refund, setRefund] = useState<Refund | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<"credit_card" | "bank" | "">("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [holder, setHolder] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/refunds/customer/${refundId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "تعذّر تحميل المعاملة");
        return;
      }
      setRefund(data.refund as Refund);
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }, [refundId]);

  useEffect(() => { void load(); }, [load]);

  const submitConfirm = async () => {
    if (!method) {
      alert("اختر طريقة الإرجاع أولاً");
      return;
    }
    if (method === "bank" && (!bankName.trim() || !iban.trim() || !holder.trim())) {
      alert("للطريقة البنكية: اسم البنك، رقم IBAN، واسم صاحب الحساب مطلوبة");
      return;
    }
    setSubmitting(true);
    try {
      const body: any = { refund_method: method };
      if (method === "bank") {
        body.bank = {
          bank_name: bankName.trim(),
          bank_account_iban: iban.trim(),
          account_holder_name: holder.trim(),
        };
      }
      const res = await fetch(`${API_URL}/api/refunds/customer/${refundId}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "تعذّر التأكيد");
        setSubmitting(false);
        return;
      }
      await load();
      setSubmitting(false);
    } catch {
      alert("خطأ في الاتصال");
      setSubmitting(false);
    }
  };

  const submitDecline = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/refunds/customer/${refundId}/decline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ note: declineNote.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "تعذّر الإلغاء");
        setSubmitting(false);
        return;
      }
      setDeclineOpen(false);
      await load();
      setSubmitting(false);
    } catch {
      alert("خطأ في الاتصال");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <Loader2 className="w-10 h-10 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (error || !refund) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4" dir="rtl">
        <div className="max-w-md bg-white rounded-2xl shadow-md border border-rose-200 p-6 text-center">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-black text-[#002845]">{error || "غير موجود"}</h2>
          <button onClick={() => router.push("/account")} className="mt-4 px-4 py-2 rounded-xl bg-[#002845] text-white text-sm font-bold">
            رجوع للحساب
          </button>
        </div>
      </div>
    );
  }

  // Terminal states — show a status card, no form.
  if (refund.status === "awaiting_bank_transfer" || refund.status === "proof_uploaded" || refund.status === "completed") {
    return (
      <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
        <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl border border-emerald-200 overflow-hidden">
          <div className="h-1.5 bg-emerald-500" />
          <div className="p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
            <h1 className="text-2xl font-black text-[#002845]">تم تأكيد معاملتك</h1>
            <p className="text-slate-600 mt-2">معاملة الاسترداد <span className="font-mono">{refund.case_number}</span></p>
            <div className="mt-6 bg-slate-50 rounded-2xl p-4 text-right">
              <Row label="المبلغ" value={arabicCurrency(Number(refund.amount))} />
              <Row label="طريقة الإرجاع" value={refund.refund_method === "credit_card" ? "بطاقة ائتمانية (نفس البطاقة)" : "حساب بنكي"} />
              {refund.refund_method === "bank" && refund.bank_account_iban && (
                <Row label="IBAN" value={refund.bank_account_iban} mono />
              )}
              <Row label="الحالة الحالية" value={
                refund.status === "completed" ? "اكتمل التحويل ✅"
                : refund.status === "proof_uploaded" ? "إيصال التحويل مرفوع"
                : "بانتظار تنفيذ التحويل البنكي"
              } />
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                مدة التنفيذ: ٥-٦ أيام عمل بنكية. سنرسل لك إشعاراً فور إتمام التحويل.
              </p>
            </div>
            <button onClick={() => router.push("/account")} className="mt-6 px-5 py-2.5 rounded-xl bg-[#002845] text-white text-sm font-bold inline-flex items-center gap-2">
              <ArrowRight className="w-4 h-4 rotate-180" />
              رجوع للحساب
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (refund.status === "rejected") {
    return (
      <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
        <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="h-1.5 bg-slate-400" />
          <div className="p-8 text-center">
            <XCircle className="w-16 h-16 text-slate-400 mx-auto mb-3" />
            <h1 className="text-2xl font-black text-[#002845]">المعاملة مغلقة</h1>
            <p className="text-slate-600 mt-2">معاملة الاسترداد <span className="font-mono">{refund.case_number}</span></p>
            <p className="text-sm text-slate-500 mt-4">
              {refund.customer_declined_at ? "أنت ألغيت هذه المعاملة." : "أُغلقت هذه المعاملة من قبل المالية أو انتهت مهلتها."}
            </p>
            <button onClick={() => router.push("/account")} className="mt-6 px-5 py-2.5 rounded-xl bg-[#002845] text-white text-sm font-bold">
              رجوع
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (refund.status !== "pending_customer_confirmation") {
    return (
      <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
        <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl border border-amber-200 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-black text-[#002845]">هذه المعاملة في حالة لا تحتاج إجراءً منك</h2>
          <p className="text-sm text-slate-600 mt-2">الحالة الحالية: {refund.status}</p>
          <button onClick={() => router.push("/account")} className="mt-4 px-4 py-2 rounded-xl bg-[#002845] text-white text-sm font-bold">رجوع</button>
        </div>
      </div>
    );
  }

  // pending_customer_confirmation — the active form
  const tr = timeRemaining(refund.customer_confirmation_deadline);

  return (
    <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl border border-[#D4AF37]/30 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-[#D4AF37] via-[#B8860B] to-[#002845]" />
          <div className="p-6 sm:p-8">
            <p className="text-[10px] font-mono text-slate-500">{refund.case_number}</p>
            <h1 className="text-2xl font-black text-[#002845] mt-1">تأكيد معاملة الاسترداد</h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              قسم المالية وافق على استرداد المبلغ. اختر كيف تريد استلامه، ثم اضغط تأكيد.
              لديك مهلة محددة للتأكيد.
            </p>

            {/* Amount + deadline summary */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="rounded-2xl bg-gradient-to-bl from-[#FFFCEE] to-white border border-[#D4AF37]/30 p-4">
                <p className="text-[10px] font-bold text-[#9A7D28]">المبلغ</p>
                <p className="text-2xl font-black text-[#D4AF37] mt-1">{arabicCurrency(Number(refund.amount))}</p>
                {refund.invoice_number && (
                  <p className="text-[10px] text-slate-500 mt-1">الفاتورة: {refund.invoice_number}</p>
                )}
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[10px] font-bold text-slate-600 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> الوقت المتبقي
                </p>
                <p className={`text-lg font-black mt-1 ${tr.tone}`}>{tr.label}</p>
                <p className="text-[10px] text-slate-500 mt-1">للتأكيد قبل الإلغاء التلقائي</p>
              </div>
            </div>

            {/* Method selection */}
            <div className="mt-6">
              <h2 className="text-sm font-black text-[#002845] mb-3">طريقة الإرجاع</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMethod("credit_card")}
                  className={`rounded-2xl p-4 text-right border-2 transition ${
                    method === "credit_card"
                      ? "border-[#D4AF37] bg-[#FFFCEE] shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <CreditCard className={`w-6 h-6 mb-2 ${method === "credit_card" ? "text-[#D4AF37]" : "text-slate-400"}`} />
                  <p className="font-black text-[#002845]">بطاقة ائتمانية</p>
                  <p className="text-[11px] text-slate-500 mt-1">يُرجَع للبطاقة الأصلية المستخدمة في الشراء</p>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("bank")}
                  className={`rounded-2xl p-4 text-right border-2 transition ${
                    method === "bank"
                      ? "border-[#D4AF37] bg-[#FFFCEE] shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <Building2 className={`w-6 h-6 mb-2 ${method === "bank" ? "text-[#D4AF37]" : "text-slate-400"}`} />
                  <p className="font-black text-[#002845]">حساب بنكي</p>
                  <p className="text-[11px] text-slate-500 mt-1">حوّل المبلغ إلى حسابك (IBAN)</p>
                </button>
              </div>
            </div>

            {/* Bank info collapsible */}
            {method === "bank" && (
              <div className="mt-4 rounded-2xl border border-slate-200 p-4 space-y-3 bg-slate-50/60">
                <h3 className="text-xs font-black text-[#002845]">بيانات الحساب البنكي</h3>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم البنك</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="مثال: مصرف الراجحي"
                    className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الـ IBAN</label>
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value.toUpperCase())}
                    placeholder="SA00 0000 0000 0000 0000 0000"
                    className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم صاحب الحساب</label>
                  <input
                    type="text"
                    value={holder}
                    onChange={(e) => setHolder(e.target.value)}
                    placeholder="كما هو مسجّل في البنك"
                    className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>
            )}

            {/* Confirm + Decline buttons */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <button
                type="button"
                onClick={() => void submitConfirm()}
                disabled={submitting || !method || (method === "bank" && (!bankName.trim() || !iban.trim() || !holder.trim()))}
                className="px-5 py-3 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-black inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle2 className="w-5 h-5" />
                تأكيد طلب الاسترداد
              </button>
              <button
                type="button"
                onClick={() => setDeclineOpen(true)}
                disabled={submitting}
                className="px-4 py-3 rounded-xl border-2 border-rose-200 text-rose-700 text-sm font-bold hover:bg-rose-50 disabled:opacity-50"
              >
                إلغاء المعاملة
              </button>
            </div>

            <p className="mt-4 text-[11px] text-slate-500 leading-relaxed text-center">
              بمجرد التأكيد، تنتقل المعاملة لقسم المحاسبة وتُنفّذ خلال ٥-٦ أيام عمل بنكية. ستصلك إشعارات على كل خطوة.
            </p>
          </div>
        </div>
      </div>

      {/* Decline modal */}
      {declineOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[80] flex items-center justify-center p-4" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-rose-500" />
            <div className="p-6">
              <h3 className="text-lg font-black text-[#002845]">إلغاء المعاملة</h3>
              <p className="text-sm text-slate-600 mt-2">
                هل أنت متأكد من إلغاء معاملة الاسترداد؟ بعد الإلغاء لا يمكن استعادتها — ستحتاج لفتح طلب دعم جديد.
              </p>
              <label className="block text-xs font-bold text-slate-700 mb-1 mt-4">السبب (اختياري)</label>
              <textarea
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                rows={3}
                placeholder="مثال: تراجعت عن طلب الاسترداد"
                className="w-full border-2 border-slate-200 focus:border-rose-400 rounded-xl px-3 py-2 text-sm outline-none resize-y"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeclineOpen(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={() => void submitDecline()}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  تأكيد الإلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold text-[#002845] ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
