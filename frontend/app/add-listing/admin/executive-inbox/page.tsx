"use client";

/**
 * Executive Inbox — a real workspace, not a list of links.
 *
 * Shows ONLY complaints currently assigned to leadership (auto_assigned_role
 * IN admin / super_admin). Each card is a full triage surface:
 *   - identity & priority pills
 *   - customer info + how it got here (from_role, transferring agent)
 *   - SLA badge (remaining or breached)
 *   - inline-expandable Timeline with every audit event
 *   - action row: add note, re-transfer, close
 *
 * Backed by /api/account-complaints (filtered) and the new
 * /api/account-complaints/:id/events audit endpoint.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { toast } from "sonner";
import {
  Crown, RefreshCcw, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, MessageSquarePlus, Building2, CheckCircle,
  User as UserIcon, Mail, Clock, FileText, History, X,
} from "lucide-react";

type Complaint = {
  id: number;
  subject: string;
  details: string;
  priority?: string;
  category?: string;
  complaint_type?: string;
  status: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  invoice_id?: number | null;
  created_at: string;
  sla_due_at?: string | null;
  sla_hours?: number | null;
  plan_tier?: string | null;
  auto_assigned_role?: string | null;
  admin_note?: string | null;
};

type AuditEvent = {
  id: number;
  event_type: string;
  actor_user_id: number | null;
  actor_name_snapshot: string | null;
  actor_email_snapshot: string | null;
  actor_role_snapshot: string | null;
  from_role: string | null;
  to_role: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

const PRIORITY_LABEL: Record<string, string> = { urgent: "عاجل", high: "عالٍ", medium: "متوسط", low: "منخفض" };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};
const ROLE_LABEL: Record<string, string> = {
  finance_admin: "المالية",
  content_admin: "فريق المحتوى",
  support_admin: "الدعم",
  admin_manager: "مدير الإدارة",
  admin: "الإدارة العليا",
  super_admin: "الإدارة العليا",
  user: "العميل",
};
const STATUS_LABEL: Record<string, string> = {
  new: "جديدة", in_review: "قيد المراجعة", in_progress: "قيد المعالجة",
  closed: "مغلقة", resolved: "تم الحل", dismissed: "غير مقبولة",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-red-50 text-red-700 border-red-200",
  in_review: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dismissed: "bg-slate-100 text-slate-500 border-slate-200",
};
const EVENT_LABEL: Record<string, string> = {
  created: "أنشأ الشكوى",
  status_changed: "غيّر الحالة",
  note_added: "أضاف توجيهاً",
  transferred: "حوّل الشكوى",
  reopened: "أعاد فتح الشكوى",
};

function timeAgo(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
}
function formatFullDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ar-SA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function dueBadge(due?: string | null) {
  if (!due) return null;
  const remainingMs = new Date(due).getTime() - Date.now();
  const breached = remainingMs < 0;
  const hrs = Math.abs(Math.round(remainingMs / 3600000));
  const label = breached ? `تجاوز SLA بـ ${hrs} س` : `متبقي ${hrs} س`;
  const cls = breached
    ? "bg-red-50 text-red-700 border-red-200"
    : remainingMs < 6 * 3600000
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

export default function ExecutiveInboxPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [eventsById, setEventsById] = useState<Record<number, AuditEvent[]>>({});
  const [eventsLoadingId, setEventsLoadingId] = useState<number | null>(null);

  // Action-modal state — used for "add note" and "re-transfer" and "close"
  const [actionModal, setActionModal] = useState<{
    kind: "note" | "transfer" | "close";
    complaint: Complaint;
    note: string;
    targetRole: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints?limit=100`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const all: Complaint[] = data.complaints || [];
      const escalated = all.filter((c) =>
        (c.auto_assigned_role === "admin" || c.auto_assigned_role === "super_admin")
        && !["closed", "resolved", "dismissed"].includes(c.status)
      );
      setComplaints(escalated);
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (c: Complaint) => {
    if (expandedId === c.id) { setExpandedId(null); return; }
    setExpandedId(c.id);
    if (eventsById[c.id]) return; // already cached
    setEventsLoadingId(c.id);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${c.id}/events`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      const data = res.ok ? await res.json() : { events: [] };
      setEventsById((prev) => ({ ...prev, [c.id]: data.events || [] }));
    } catch {
      setEventsById((prev) => ({ ...prev, [c.id]: [] }));
    } finally {
      setEventsLoadingId(null);
    }
  };

  const submitNote = async () => {
    if (!actionModal) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${actionModal.complaint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ adminNote: actionModal.note }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("تم حفظ التوجيه");
      setActionModal(null);
      setEventsById((p) => { const n = { ...p }; delete n[actionModal.complaint.id]; return n; });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "خطأ في الحفظ");
    } finally { setSubmitting(false); }
  };
  const submitTransfer = async () => {
    if (!actionModal) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${actionModal.complaint.id}/transfer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ target_role: actionModal.targetRole, note: actionModal.note.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("تم إعادة التحويل");
      setActionModal(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "خطأ في التحويل");
    } finally { setSubmitting(false); }
  };
  const submitClose = async () => {
    if (!actionModal) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${actionModal.complaint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ status: "closed", adminNote: actionModal.note || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("تم إغلاق الشكوى");
      setActionModal(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "خطأ في الإغلاق");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#002845] flex items-center gap-2">
              <Crown className="w-6 h-6 md:w-7 md:h-7 text-[#D4AF37]" />
              صندوق الإدارة العليا
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              الحالات المُصعّدة بصلاحية القيادة. {complaints.length > 0 && `(${complaints.length} بانتظار قرارك)`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            تحديث
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> جاري التحميل...
          </div>
        ) : complaints.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <Crown className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#002845]">لا توجد حالات مُصعّدة</p>
            <p className="text-xs text-slate-500 mt-1">تظهر هنا فقط الشكاوى التي يحوّلها فريق الدعم إلى الإدارة العليا.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {complaints.map((c) => {
              const events = eventsById[c.id] || [];
              const transferEvent = events.find((e) => e.event_type === "transferred");
              const isOpen = expandedId === c.id;

              return (
                <div key={c.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {/* Header strip — identity + critical badges */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-[#FFF7E0] to-white">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[#002845] text-base truncate">{c.subject}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {c.priority && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${PRIORITY_COLOR[c.priority] || PRIORITY_COLOR.medium}`}>
                              أولوية: {PRIORITY_LABEL[c.priority] || c.priority}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${STATUS_COLOR[c.status] || STATUS_COLOR.new}`}>
                            {STATUS_LABEL[c.status] || c.status}
                          </span>
                          {c.plan_tier && /royal|ملكي|elite/i.test(c.plan_tier) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[#D4AF37]/10 text-[#9a7d28] border-[#D4AF37]/30 font-bold">
                              عميل ملكي
                            </span>
                          )}
                          {dueBadge(c.sla_due_at)}
                          {c.complaint_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                              {c.complaint_type}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Body — customer + transfer summary */}
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 mb-0.5">العميل</p>
                        <p className="font-semibold text-[#002845] flex items-center gap-1">
                          <UserIcon className="w-3 h-3" /> {c.user_name || "—"}
                        </p>
                        {c.user_email && (
                          <p className="text-slate-500 flex items-center gap-1 mt-0.5 text-[11px]">
                            <Mail className="w-3 h-3" /> {c.user_email}
                          </p>
                        )}
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 mb-0.5">التوقيت</p>
                        <p className="font-semibold text-[#002845] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {timeAgo(c.created_at)}
                        </p>
                        <p className="text-slate-500 mt-0.5 text-[11px]">{formatFullDate(c.created_at)}</p>
                      </div>
                    </div>

                    {/* Transfer summary — best-effort from cached events. If not
                        loaded yet, we still surface what we know from the row. */}
                    {transferEvent && (
                      <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2.5 text-xs">
                        <p className="text-[10px] text-amber-700/80 mb-1 font-bold tracking-wider">سبب التصعيد</p>
                        <p className="text-amber-900 leading-relaxed">{transferEvent.note || "—"}</p>
                        <div className="mt-2 text-[11px] text-amber-700/90">
                          <span className="font-bold">حوّلها:</span> {transferEvent.actor_name_snapshot || "—"}
                          {transferEvent.actor_email_snapshot && <> · {transferEvent.actor_email_snapshot}</>}
                          {transferEvent.actor_role_snapshot && <> · {ROLE_LABEL[transferEvent.actor_role_snapshot] || transferEvent.actor_role_snapshot}</>}
                          <br />
                          <span className="font-bold">من:</span> {transferEvent.from_role ? (ROLE_LABEL[transferEvent.from_role] || transferEvent.from_role) : "—"}
                          {" → "}
                          <span className="font-bold">إلى:</span> {ROLE_LABEL[transferEvent.to_role || ""] || transferEvent.to_role || "—"}
                          <br />
                          <span className="font-bold">وقت التحويل:</span> {formatFullDate(transferEvent.created_at)}
                        </div>
                      </div>
                    )}

                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-500 hover:text-[#002845] inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" /> نص الشكوى
                      </summary>
                      <p className="mt-1.5 p-2.5 bg-slate-50 rounded-lg whitespace-pre-wrap leading-relaxed text-slate-700">{c.details}</p>
                    </details>

                    {/* Expandable Timeline */}
                    <button
                      onClick={() => toggleExpand(c)}
                      className="w-full inline-flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition text-xs font-semibold text-slate-700 border border-slate-100"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" />
                        سجل الأحداث ({events.length || "—"})
                      </span>
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {isOpen && (
                      <div className="border border-slate-100 rounded-lg p-2.5 bg-white space-y-2">
                        {eventsLoadingId === c.id ? (
                          <p className="text-xs text-slate-400 text-center py-3"><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> جاري التحميل...</p>
                        ) : events.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-3">لا توجد أحداث مسجلة</p>
                        ) : (
                          events.map((ev) => (
                            <div key={ev.id} className="border-r-2 border-[#D4AF37]/40 pr-2 py-1.5 text-xs">
                              <p className="font-semibold text-[#002845]">
                                {EVENT_LABEL[ev.event_type] || ev.event_type}
                                {ev.from_role && ev.to_role && (
                                  <> — {ROLE_LABEL[ev.from_role] || ev.from_role} → {ROLE_LABEL[ev.to_role] || ev.to_role}</>
                                )}
                                {ev.from_status && ev.to_status && (
                                  <> — {STATUS_LABEL[ev.from_status] || ev.from_status} → {STATUS_LABEL[ev.to_status] || ev.to_status}</>
                                )}
                              </p>
                              <p className="text-slate-500 mt-0.5 text-[11px]">
                                {ev.actor_name_snapshot || "النظام"}
                                {ev.actor_email_snapshot && <> · {ev.actor_email_snapshot}</>}
                                {ev.actor_role_snapshot && <> · {ROLE_LABEL[ev.actor_role_snapshot] || ev.actor_role_snapshot}</>}
                                <span className="mx-1.5 text-slate-300">|</span>
                                {formatFullDate(ev.created_at)}
                              </p>
                              {ev.note && (
                                <p className="mt-1 p-1.5 bg-slate-50 rounded text-slate-700 whitespace-pre-wrap text-[11px]">{ev.note}</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action row */}
                  <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => setActionModal({ kind: "note", complaint: c, note: "", targetRole: "" })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition text-xs font-medium"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" /> إضافة توجيه
                    </button>
                    <button
                      onClick={() => setActionModal({ kind: "transfer", complaint: c, note: "", targetRole: "content_admin" })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 transition text-xs font-medium"
                    >
                      <Building2 className="w-3.5 h-3.5" /> إعادة تحويل
                    </button>
                    <button
                      onClick={() => setActionModal({ kind: "close", complaint: c, note: "", targetRole: "" })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-l from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 transition text-xs font-bold"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> إغلاق بعد المعالجة
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action modal — shared shell for note / transfer / close */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-l from-[#FFF7E0] to-white">
              <h3 className="text-sm font-bold text-[#002845]">
                {actionModal.kind === "note" && "إضافة توجيه إداري"}
                {actionModal.kind === "transfer" && "إعادة تحويل الشكوى"}
                {actionModal.kind === "close" && "إغلاق الشكوى"}
              </h3>
              <button onClick={() => !submitting && setActionModal(null)} disabled={submitting} className="p-1 hover:bg-white rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-500 truncate">{actionModal.complaint.subject}</p>
              {actionModal.kind === "transfer" && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">إلى أي قسم؟</label>
                  <select
                    value={actionModal.targetRole}
                    onChange={(e) => setActionModal({ ...actionModal, targetRole: e.target.value })}
                    className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 bg-white"
                  >
                    <option value="content_admin">📋 فريق المحتوى</option>
                    <option value="finance_admin">💰 المالية</option>
                    <option value="admin_manager">🎯 مدير الإدارة</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {actionModal.kind === "close" ? "ملاحظة الإغلاق (اختياري)" : "ملاحظة"}
                </label>
                <textarea
                  value={actionModal.note}
                  onChange={(e) => setActionModal({ ...actionModal, note: e.target.value })}
                  rows={3}
                  placeholder={actionModal.kind === "transfer" ? "سبب إعادة التحويل..." : "أكتب التوجيه..."}
                  className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 p-4 pt-2 border-t border-slate-100">
              <button onClick={() => setActionModal(null)} disabled={submitting} className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium disabled:opacity-50">إلغاء</button>
              <button
                onClick={actionModal.kind === "note" ? submitNote : actionModal.kind === "transfer" ? submitTransfer : submitClose}
                disabled={submitting || (actionModal.kind === "note" && !actionModal.note.trim()) || (actionModal.kind === "transfer" && !actionModal.targetRole)}
                className="flex-1 px-3 py-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] rounded-lg text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
