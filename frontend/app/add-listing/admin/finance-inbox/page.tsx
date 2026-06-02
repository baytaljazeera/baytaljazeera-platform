"use client";

// ─────────────────────────────────────────────────────────────────
// /admin/finance-inbox — Round 3 rebuild.
//
// The finance team's working surface. Lists tickets the support team
// has transferred to finance. Finance can:
//   1. Open the conversation — they see the full thread (customer +
//      support replies + internal notes).
//   2. Reply to the customer (visibility='customer_visible').
//   3. Drop an internal note for support / their team
//      (visibility='internal' — never reaches the customer).
//   4. Convert the ticket into a Refund Transaction (which then
//      enters pending_customer_confirmation; customer picks method
//      and confirms within 4 days).
//   5. Hand the ticket back to support if it shouldn't have come.
//
// Backend: /api/finance/inbox/* (NOT /api/support/*).
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { alertDialog, promptDialog } from "@/components/ui/ConfirmDialog";
import {
  Loader2, RefreshCw, MessageSquare, Send, Lock, ArrowRight,
  Wallet, X, FileText,
} from "lucide-react";

type InboxRow = {
  id: number;
  ticket_number: string;
  subject: string;
  description: string;
  status: string;
  priority?: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  refund_id?: number | null;
  refund_case_number?: string | null;
  refund_status?: string | null;
  invoice_id?: number | null;
  invoice_number?: string | null;
  invoice_total?: number | null;
  reply_count?: number;
  last_reply_at?: string | null;
  transferred_to_finance_at?: string | null;
  created_at: string;
  updated_at: string;
};

type Reply = {
  id: number;
  sender_id: string;
  sender_type: "user" | "admin" | "internal";
  sender_role?: string | null;
  sender_name?: string;
  message: string;
  visibility: "customer_visible" | "internal";
  created_at: string;
};

const ROLE_BADGE: Record<string, { label: string; tone: string }> = {
  support_admin: { label: "الدعم", tone: "bg-sky-50 text-sky-900 border-sky-200" },
  finance_admin: { label: "المالية", tone: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  super_admin:   { label: "الإدارة العليا", tone: "bg-amber-50 text-amber-900 border-amber-200" },
  admin_manager: { label: "مدير", tone: "bg-violet-50 text-violet-900 border-violet-200" },
  user:          { label: "العميل", tone: "bg-slate-50 text-slate-900 border-slate-200" },
};

export default function FinanceInboxPage() {
  const [list, setList] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<InboxRow | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const [composer, setComposer] = useState("");
  const [visibility, setVisibility] = useState<"customer_visible" | "internal">("customer_visible");
  const [sending, setSending] = useState(false);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertAmount, setConvertAmount] = useState("");
  const [convertReason, setConvertReason] = useState("");
  const [convertLoading, setConvertLoading] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/finance/inbox`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setList((data.tickets || []) as InboxRow[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const openTicket = useCallback(async (row: InboxRow) => {
    setSelected(row);
    setLoadingThread(true);
    setReplies([]);
    try {
      const res = await fetch(`${API_URL}/api/finance/inbox/${row.id}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setReplies((data.replies || []) as Reply[]);
      }
    } finally {
      setLoadingThread(false);
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, []);

  useEffect(() => { void fetchInbox(); }, [fetchInbox]);

  const sendReply = async () => {
    if (!selected || !composer.trim()) return;
    setSending(true);
    const endpoint = visibility === "internal" ? "internal-note" : "reply";
    try {
      const res = await fetch(`${API_URL}/api/finance/inbox/${selected.id}/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ message: composer.trim() }),
      });
      if (res.ok) {
        setComposer("");
        await openTicket(selected);
      } else {
        const data = await res.json().catch(() => ({}));
        await alertDialog({ title: "فشل الإرسال", body: data?.error || "حاول مرة أخرى.", variant: "danger" });
      }
    } finally {
      setSending(false);
    }
  };

  const returnToSupport = async () => {
    if (!selected) return;
    const note = await promptDialog({
      title: "إعادة التذكرة للدعم",
      body: "اكتب سبب الإرجاع باختصار. هذه ملاحظة داخلية لن يراها العميل.",
      placeholder: "اختياري — مثال: ليست مالية، خطأ توجيه.",
      multiline: true,
      variant: "warning",
      confirmText: "إعادة للدعم",
      cancelText: "تراجع",
    });
    if (note === null) return; // user cancelled
    const res = await fetch(`${API_URL}/api/finance/inbox/${selected.id}/return-to-support`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ note }),
    });
    if (res.ok) {
      setSelected(null);
      await fetchInbox();
    } else {
      const data = await res.json().catch(() => ({}));
      await alertDialog({ title: "فشل الإرجاع", body: data?.error || "حاول مجدداً.", variant: "danger" });
    }
  };

  const submitConvert = async () => {
    if (!selected) return;
    const amount = parseFloat(convertAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      await alertDialog({ title: "المبلغ غير صحيح", body: "أدخل قيمة موجبة بالريال.", variant: "warning" });
      return;
    }
    setConvertLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/finance/inbox/${selected.id}/convert-to-refund-transaction`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ amount, reason: convertReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await alertDialog({
          title: "تم فتح معاملة الاسترداد",
          body: `الرقم: ${data?.refund?.case_number || ""}. العميل لديه ٤ أيام لاختيار طريقة الإرجاع والتأكيد. سيصلك إشعار عندما يرد.`,
          variant: "success",
        });
        setConvertOpen(false);
        setConvertAmount("");
        setConvertReason("");
        await openTicket(selected);
        await fetchInbox();
      } else {
        await alertDialog({ title: "فشل فتح المعاملة", body: data?.error || "حاول مجدداً.", variant: "danger" });
      }
    } finally {
      setConvertLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-[#002845] flex items-center gap-2">
            <Wallet className="w-6 h-6 text-[#D4AF37]" />
            صندوق المالية
          </h1>
          <button
            onClick={() => void fetchInbox()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-[#002845]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>

        <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-4">
          هذي التذاكر حوّلها الدعم للمالية. تشاركها معهم — يمكنك الرد على العميل، إضافة ملاحظة داخلية لا يراها العميل، أو فتح معاملة استرداد رسمية.
        </p>

        <div className="grid lg:grid-cols-[400px_1fr] gap-4">
          {/* List */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {loading && list.length === 0 ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" /></div>
            ) : list.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                لا توجد تذاكر محوّلة من الدعم
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[75vh] overflow-y-auto">
                {list.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void openTicket(t)}
                      className={`w-full text-right p-3 hover:bg-slate-50 transition ${selected?.id === t.id ? "bg-[#FFFCEE] border-r-4 border-[#D4AF37]" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-mono text-[10px] text-slate-500">{t.ticket_number}</span>
                        {t.refund_id && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">
                            ↪ {t.refund_case_number || `#${t.refund_id}`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-[#002845] truncate">{t.subject}</p>
                      <p className="text-xs text-slate-500 truncate">{t.user_name || "—"} · {t.user_email || ""}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        حُوّلت: {t.transferred_to_finance_at ? new Date(t.transferred_to_finance_at).toLocaleString("ar-SA") : "—"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Thread */}
          {selected ? (
            <div className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[80vh]">
              <div className="border-b border-slate-100 p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-slate-500">{selected.ticket_number}</p>
                  <h2 className="text-lg font-black text-[#002845] truncate">{selected.subject}</h2>
                  <p className="text-xs text-slate-600 mt-1">{selected.user_name} · {selected.user_email}</p>
                  {selected.invoice_number && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      الفاتورة: <span className="font-mono">{selected.invoice_number}</span>
                      {selected.invoice_total != null && <> · {Number(selected.invoice_total)} ر.س</>}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {!selected.refund_id && (
                    <button
                      type="button"
                      onClick={() => setConvertOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] text-[11px] font-black hover:shadow inline-flex items-center gap-1"
                    >
                      <Wallet className="w-3 h-3" /> فتح معاملة استرداد
                    </button>
                  )}
                  {selected.refund_id && (
                    <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                      ↪ معاملة {selected.refund_case_number}: {selected.refund_status}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void returnToSupport()}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-[#002845] hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <ArrowRight className="w-3 h-3 rotate-180" /> إعادة للدعم
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {loadingThread ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" /></div>
                ) : (
                  <>
                    {selected.description && (
                      <div className="bg-slate-50 rounded-xl p-3 text-sm">
                        <p className="text-[10px] text-slate-500 mb-1">الطلب الأصلي</p>
                        <p className="whitespace-pre-wrap text-[#002845]">{selected.description}</p>
                      </div>
                    )}
                    {replies.map((r) => {
                      const isInternal = r.visibility === "internal" || r.sender_type === "internal";
                      const isCustomer = r.sender_type === "user";
                      const badge = r.sender_role ? ROLE_BADGE[r.sender_role] : ROLE_BADGE[r.sender_type === 'user' ? 'user' : 'support_admin'];
                      return (
                        <div
                          key={r.id}
                          className={`rounded-xl p-3 text-sm ${
                            isInternal
                              ? "bg-amber-50 border border-amber-200"
                              : isCustomer
                                ? "bg-slate-50 border border-slate-200 ml-8"
                                : "bg-sky-50 border border-sky-200 mr-8"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5">
                              {badge && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.tone}`}>
                                  {badge.label}
                                </span>
                              )}
                              {isInternal && (
                                <span className="text-[9px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  ملاحظة داخلية
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500">{r.sender_name || "—"}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">{new Date(r.created_at).toLocaleString("ar-SA")}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-[#002845]">{r.message}</p>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} />
                  </>
                )}
              </div>

              <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/50">
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setVisibility("customer_visible")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition ${visibility === "customer_visible" ? "bg-sky-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
                  >
                    💬 رد للعميل
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility("internal")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition ${visibility === "internal" ? "bg-amber-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
                  >
                    🔒 ملاحظة داخلية
                  </button>
                </div>
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder={visibility === "internal" ? "ملاحظة داخلية لن يراها العميل..." : "ردك سيظهر للعميل في صفحة طلباته..."}
                  rows={3}
                  className={`w-full border-2 rounded-xl p-2 text-sm outline-none resize-y ${
                    visibility === "internal" ? "border-amber-200 focus:border-amber-400 bg-amber-50/30" : "border-slate-200 focus:border-sky-400"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={!composer.trim() || sending}
                  className={`w-full py-2 rounded-xl text-white text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-40 ${
                    visibility === "internal" ? "bg-amber-500 hover:bg-amber-600" : "bg-sky-600 hover:bg-sky-700"
                  }`}
                >
                  {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Send className="w-4 h-4" />
                  {visibility === "internal" ? "إضافة الملاحظة" : "إرسال للعميل"}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 flex items-center justify-center">
              <div>
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                اختر تذكرة من القائمة لعرض المحادثة
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Convert to Refund Transaction modal */}
      {convertOpen && selected && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[80] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="h-1.5 bg-gradient-to-l from-[#D4AF37] via-[#B8860B] to-[#002845]" />
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="font-black text-[#002845]">فتح معاملة استرداد</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {selected.ticket_number} · {selected.user_name}
                </p>
              </div>
              <button onClick={() => setConvertOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                سيُرسَل للعميل إشعار بمعاملة الاسترداد. عنده 4 أيام لاختيار طريقة الإرجاع (بطاقة أو حساب بنكي) والتأكيد. إذا لم يؤكد تُلغى المعاملة تلقائياً.
              </p>
              <div>
                <label className="block text-xs font-bold text-[#002845] mb-1">المبلغ (ر.س)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                  className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm outline-none"
                />
                {selected.invoice_total != null && (
                  <p className="text-[10px] text-slate-500 mt-1">قيمة الفاتورة المرتبطة: {Number(selected.invoice_total)} ر.س</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-[#002845] mb-1">السبب (اختياري)</label>
                <input
                  type="text"
                  value={convertReason}
                  onChange={(e) => setConvertReason(e.target.value)}
                  className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm outline-none"
                  placeholder="مثال: تكرار خصم، إلغاء قبل بدء الخدمة"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => setConvertOpen(false)}
                disabled={convertLoading}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={() => void submitConvert()}
                disabled={convertLoading || !convertAmount}
                className="flex-1 px-5 py-2 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {convertLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                إنشاء المعاملة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
