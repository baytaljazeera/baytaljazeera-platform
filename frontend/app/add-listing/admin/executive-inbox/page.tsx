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
  Lock, MessageCircle, EyeOff, Send,
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
  id: number | string;
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
  visibility?: string | null;
  target_kind?: string | null;
  target_user_id?: number | null;
  target_role?: string | null;
  target_name_snapshot?: string | null;
  target_email_snapshot?: string | null;
  due_at?: string | null;
  assignment_priority?: string | null;
  assignment_status?: string | null;
  read_at?: string | null;
  recipients?: {
    users?: Array<{ id: number; name: string; email: string; role: string }>;
    roles?: Array<{ role: string; member_count: number }>;
    everyone?: boolean;
  } | null;
  created_at: string;
};

type StaffMember = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type DirectiveKind = "note" | "department" | "user" | "assignment";

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
  note_added: "أضاف ملاحظة",
  internal_note: "ملاحظة داخلية",
  directive: "توجيه",
  assignment: "تكليف رسمي",
  admin_reply: "رد مباشر للعميل",
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

// Age-based urgency. Anything that sits more than 24h in the executive
// inbox is a warning sign; past 48h it is screaming for action. Used to
// tint the whole card chrome AND the time cell so a four-day-old case
// can't blend in with a fresh one.
type AgeTone = "normal" | "warn" | "urgent";
function ageTone(iso?: string): { tone: AgeTone; hours: number } {
  if (!iso) return { tone: "normal", hours: 0 };
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours >= 48) return { tone: "urgent", hours };
  if (hours >= 24) return { tone: "warn", hours };
  return { tone: "normal", hours };
}

const AGE_CARD_CHROME: Record<AgeTone, string> = {
  urgent:
    "border-rose-300 ring-2 ring-rose-200 shadow-[0_0_0_4px_rgba(244,63,94,0.06)]",
  warn: "border-amber-300 ring-1 ring-amber-200",
  normal: "border-slate-200",
};

const AGE_STRIP_BG: Record<AgeTone, string> = {
  urgent: "bg-gradient-to-l from-rose-50 to-white",
  warn: "bg-gradient-to-l from-amber-50 to-white",
  normal: "bg-gradient-to-l from-[#FFF7E0] to-white",
};

const AGE_TIME_BOX: Record<AgeTone, string> = {
  urgent: "bg-rose-50 border-rose-200 text-rose-700",
  warn: "bg-amber-50 border-amber-200 text-amber-800",
  normal: "bg-slate-50 border-slate-100 text-[#002845]",
};

const AGE_TIME_LABEL: Record<AgeTone, string> = {
  urgent: "متجاوز ٤٨ ساعة",
  warn: "تجاوز ٢٤ ساعة",
  normal: "ضمن المهلة",
};
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

  // Action-modal state — five distinct flows:
  //   customer   → POST /reply  with visibility=customer_visible
  //   directive  → POST /directive (rich: kind + recipient + assignment fields)
  //   transfer   → PATCH /transfer  with target_role
  //   close      → PATCH / with status=closed
  const [actionModal, setActionModal] = useState<{
    kind: "customer" | "directive" | "transfer" | "close";
    complaint: Complaint;
    note: string;
    targetRole: string;
    // Directive-specific (multi-recipient)
    directiveKind?: DirectiveKind;
    directiveUserIds?: number[];     // selected staff
    directiveRoles?: string[];       // selected whole-department(s)
    directiveEveryone?: boolean;     // notify all active staff
    directiveStaffSearch?: string;   // text filter on the staff picker
    directiveDueAt?: string;
    directivePriority?: "low" | "medium" | "high" | "urgent";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Staff directory — lazy-loaded the first time a directive modal opens.
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const ensureStaff = useCallback(async () => {
    if (staff.length > 0 || staffLoading) return;
    setStaffLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/_/staff`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff || []);
      }
    } catch {} finally { setStaffLoading(false); }
  }, [staff.length, staffLoading]);

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

  // Customer-visible reply — fires notification + mirrors to admin_note.
  const submitCustomerReply = async () => {
    if (!actionModal) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${actionModal.complaint.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ visibility: "customer_visible", message: actionModal.note }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      toast.success("تم إرسال الرد للعميل");
      const cid = actionModal.complaint.id;
      setActionModal(null);
      setEventsById((p) => { const n = { ...p }; delete n[cid]; return n; });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "خطأ في الحفظ");
    } finally { setSubmitting(false); }
  };

  // Multi-recipient directive.
  const submitDirective = async () => {
    if (!actionModal || actionModal.kind !== "directive") return;
    const dk = actionModal.directiveKind || "note";
    const body: any = {
      kind: dk,
      message: actionModal.note,
      recipients: {
        user_ids: actionModal.directiveUserIds || [],
        roles: actionModal.directiveRoles || [],
        everyone: !!actionModal.directiveEveryone,
      },
    };
    if (dk === "assignment") {
      if (actionModal.directiveDueAt) body.due_at = actionModal.directiveDueAt;
      if (actionModal.directivePriority) body.priority = actionModal.directivePriority;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${actionModal.complaint.id}/directive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      const data = await res.json();
      toast.success(data.message || "تم حفظ التوجيه");
      const cid = actionModal.complaint.id;
      setActionModal(null);
      setEventsById((p) => { const n = { ...p }; delete n[cid]; return n; });
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
              const age = ageTone(c.created_at);

              return (
                <div
                  key={c.id}
                  className={`relative bg-white border rounded-2xl overflow-hidden shadow-sm transition ${AGE_CARD_CHROME[age.tone]}`}
                >
                  {age.tone === "urgent" && (
                    <span
                      className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-4 ring-rose-100"
                      aria-label="متجاوز المهلة"
                    />
                  )}
                  {/* Header strip — identity + critical badges */}
                  <div className={`px-4 py-3 border-b border-slate-100 ${AGE_STRIP_BG[age.tone]}`}>
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
                      <div className={`border rounded-lg p-2.5 ${AGE_TIME_BOX[age.tone]}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-[10px] opacity-80">التوقيت</p>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              age.tone === "urgent"
                                ? "bg-rose-500 text-white"
                                : age.tone === "warn"
                                  ? "bg-amber-500 text-white"
                                  : "bg-emerald-500/80 text-white"
                            }`}
                          >
                            {AGE_TIME_LABEL[age.tone]}
                          </span>
                        </div>
                        <p className="font-bold flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span className={age.tone !== "normal" ? "tabular-nums" : ""}>
                            {timeAgo(c.created_at)}
                          </span>
                          {age.tone !== "normal" && (
                            <span className="text-[10px] opacity-75 font-normal">
                              ({Math.round(age.hours)} ساعة)
                            </span>
                          )}
                        </p>
                        <p
                          className={`mt-0.5 text-[11px] ${
                            age.tone === "urgent"
                              ? "text-rose-600/80"
                              : age.tone === "warn"
                                ? "text-amber-700/80"
                                : "text-slate-500"
                          }`}
                        >
                          {formatFullDate(c.created_at)}
                        </p>
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
                          events.map((ev) => {
                            const isCustomerVisible = ev.visibility === "customer_visible";
                            const railColor = isCustomerVisible ? "border-[#D4AF37]" : "border-slate-300";
                            // Build the recipient summary.  Prefers the new
                            // recipients JSONB (multi); falls back to the legacy
                            // single-target fields for older events.
                            const recipientLines: string[] = [];
                            if (ev.recipients) {
                              if (ev.recipients.everyone) {
                                recipientLines.push("الجميع (كل أعضاء الفريق النشطين)");
                              }
                              if (ev.recipients.roles && ev.recipients.roles.length > 0) {
                                for (const r of ev.recipients.roles) {
                                  recipientLines.push(`${ROLE_LABEL[r.role] || r.role} (${r.member_count} أعضاء)`);
                                }
                              }
                              if (ev.recipients.users && ev.recipients.users.length > 0) {
                                for (const u of ev.recipients.users) {
                                  recipientLines.push(`${u.name}${u.email ? ` · ${u.email}` : ""}`);
                                }
                              }
                            } else {
                              // Legacy single-target fallback
                              if (ev.target_kind === "department" && ev.target_role) {
                                recipientLines.push(`قسم: ${ROLE_LABEL[ev.target_role] || ev.target_role}`);
                              }
                              if ((ev.target_kind === "user" || ev.target_kind === "assignment") && ev.target_name_snapshot) {
                                recipientLines.push(`${ev.target_name_snapshot}${ev.target_email_snapshot ? ` · ${ev.target_email_snapshot}` : ""}`);
                              }
                            }
                            return (
                              <div key={ev.id} className={`border-r-2 ${railColor} pr-2 py-1.5 text-xs`}>
                                <p className="font-semibold text-[#002845] flex items-center gap-1.5 flex-wrap">
                                  <span>
                                    {EVENT_LABEL[ev.event_type] || ev.event_type}
                                    {ev.from_role && ev.to_role && (
                                      <> — {ROLE_LABEL[ev.from_role] || ev.from_role} → {ROLE_LABEL[ev.to_role] || ev.to_role}</>
                                    )}
                                    {ev.from_status && ev.to_status && (
                                      <> — {STATUS_LABEL[ev.from_status] || ev.from_status} → {STATUS_LABEL[ev.to_status] || ev.to_status}</>
                                    )}
                                  </span>
                                  {ev.visibility && (
                                    isCustomerVisible ? (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#9a7d28] inline-flex items-center gap-1">
                                        <MessageCircle className="w-2.5 h-2.5" /> للعميل
                                      </span>
                                    ) : (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-slate-100 border-slate-200 text-slate-600 inline-flex items-center gap-1">
                                        <Lock className="w-2.5 h-2.5" /> داخلي
                                      </span>
                                    )
                                  )}
                                  {ev.target_kind === "assignment" && ev.assignment_status && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                      ev.assignment_status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : ev.assignment_status === "cancelled" ? "bg-slate-100 text-slate-500 border-slate-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                                    }`}>
                                      {ev.assignment_status === "completed" ? "منجز"
                                       : ev.assignment_status === "cancelled" ? "ملغي"
                                       : "قيد التنفيذ"}
                                    </span>
                                  )}
                                </p>
                                <p className="text-slate-500 mt-0.5 text-[11px]">
                                  <span className="font-semibold text-slate-600">من:</span>{" "}
                                  {ev.actor_name_snapshot || "النظام"}
                                  {ev.actor_email_snapshot && <> · {ev.actor_email_snapshot}</>}
                                  {ev.actor_role_snapshot && <> · {ROLE_LABEL[ev.actor_role_snapshot] || ev.actor_role_snapshot}</>}
                                </p>
                                {recipientLines.length > 0 && (
                                  <div className="text-slate-500 mt-0.5 text-[11px]">
                                    <span className="font-semibold text-slate-600">إلى:</span>
                                    <ul className="list-disc pr-4 mt-0.5 space-y-0.5">
                                      {recipientLines.map((line, i) => (
                                        <li key={i}>{line}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <p className="text-slate-400 mt-0.5 text-[10px]">{formatFullDate(ev.created_at)}
                                  {ev.due_at && (
                                    <> · <span className="font-semibold text-slate-600">استحقاق:</span> {formatFullDate(ev.due_at)}</>
                                  )}
                                  {ev.assignment_priority && (
                                    <> · أولوية: {ev.assignment_priority}</>
                                  )}
                                  {ev.read_at && (
                                    <> · <span className="text-emerald-600">تمت قراءته {formatFullDate(ev.read_at)}</span></>
                                  )}
                                </p>
                                {ev.note && (
                                  <p className={`mt-1 p-1.5 rounded whitespace-pre-wrap text-[11px] ${
                                    isCustomerVisible ? "bg-[#D4AF37]/5 border border-[#D4AF37]/20 text-[#5c4a18]" : "bg-slate-50 text-slate-700"
                                  }`}>{ev.note}</p>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action row — four explicit flows so the agent never
                      guesses whether their message reaches the customer. */}
                  <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => setActionModal({ kind: "customer", complaint: c, note: "", targetRole: "" })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] hover:shadow-md transition text-xs font-bold"
                      title="رسالة تُرسل للعميل وتظهر في صفحته"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> رد مباشر للعميل
                    </button>
                    <button
                      onClick={() => {
                        setActionModal({
                          kind: "directive", complaint: c, note: "", targetRole: "",
                          directiveKind: "note",
                          directiveUserIds: [],
                          directiveRoles: [],
                          directiveEveryone: false,
                          directiveStaffSearch: "",
                          directivePriority: "medium",
                        });
                        ensureStaff();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-800 transition text-xs font-medium"
                      title="ملاحظة / توجيه / تكليف — كلها داخلية لا يراها العميل"
                    >
                      <Lock className="w-3.5 h-3.5" /> توجيه داخلي
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

      {/* Action modal — 4 kinds, each makes the recipient unmistakable. */}
      {actionModal && (() => {
        const k = actionModal.kind;
        const isCustomerReply = k === "customer";
        const isDirective = k === "directive";
        const isTransfer = k === "transfer";
        const isClose = k === "close";
        const dk = actionModal.directiveKind || "note";

        const submit = isCustomerReply ? submitCustomerReply
          : isDirective ? submitDirective
          : isTransfer ? submitTransfer
          : submitClose;

        const hasAnyRecipient = !!(
          (actionModal.directiveUserIds && actionModal.directiveUserIds.length > 0)
          || (actionModal.directiveRoles && actionModal.directiveRoles.length > 0)
          || actionModal.directiveEveryone
        );
        const directiveValid =
          dk === "note" ? !!actionModal.note.trim()
          : dk === "department" ? !!(hasAnyRecipient && actionModal.note.trim())
          : dk === "user" ? !!(hasAnyRecipient && actionModal.note.trim())
          : dk === "assignment" ? !!(hasAnyRecipient && actionModal.note.trim())
          : false;
        const disabled = submitting
          || (isCustomerReply && !actionModal.note.trim())
          || (isDirective && !directiveValid)
          || (isTransfer && !actionModal.targetRole);

        const ROLE_OPTIONS = [
          { value: "support_admin", label: "🎧 الدعم" },
          { value: "finance_admin", label: "💰 المالية" },
          { value: "content_admin", label: "📋 المحتوى" },
          { value: "admin_manager", label: "🎯 مدير الإدارة" },
          { value: "admin", label: "👑 الإدارة العليا" },
        ];
        const dirKinds: { value: DirectiveKind; label: string; hint: string; icon: any }[] = [
          { value: "note", label: "ملاحظة داخلية", hint: "تُحفظ في السجل، لا تُرسل إشعاراً لأحد", icon: FileText },
          { value: "department", label: "توجيه لقسم", hint: "تُرسل لكل أعضاء القسم المختار", icon: Building2 },
          { value: "user", label: "توجيه لموظف", hint: "تُرسل للموظف المُختار فقط", icon: UserIcon },
          { value: "assignment", label: "تكليف رسمي", hint: "تكليف بمسؤول + أولوية + موعد استحقاق", icon: Crown },
        ];

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
              <div className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
                isCustomerReply ? "bg-gradient-to-l from-[#FFF7E0] to-white border-[#D4AF37]/30"
                : isDirective   ? "bg-slate-50 border-slate-200"
                : isTransfer    ? "bg-amber-50 border-amber-200"
                                : "bg-emerald-50 border-emerald-200"
              }`}>
                <h3 className="text-sm font-bold text-[#002845] inline-flex items-center gap-2">
                  {isCustomerReply && <><MessageCircle className="w-4 h-4 text-[#D4AF37]" /> رد مباشر للعميل</>}
                  {isDirective    && <><Lock className="w-4 h-4 text-slate-600" /> توجيه داخلي</>}
                  {isTransfer     && <><Building2 className="w-4 h-4 text-amber-600" /> إعادة تحويل الشكوى</>}
                  {isClose        && <><CheckCircle className="w-4 h-4 text-emerald-600" /> إغلاق الشكوى</>}
                </h3>
                <button onClick={() => !submitting && setActionModal(null)} disabled={submitting} className="p-1 hover:bg-white rounded-lg">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto">
                {isCustomerReply && (
                  <div className="px-3 py-2 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[11px] text-[#9a7d28] inline-flex items-start gap-1.5">
                    <Send className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>هذه الرسالة <b>ستظهر للعميل</b> ويصله إشعار فوري.</span>
                  </div>
                )}
                {isDirective && (
                  <div className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-700 inline-flex items-start gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>كل أنواع التوجيه الداخلي <b>لا تظهر للعميل أبداً</b>. اختر نوع التوجيه ثم المستلم.</span>
                  </div>
                )}

                <p className="text-xs text-slate-500 truncate">الشكوى: {actionModal.complaint.subject}</p>

                {isDirective && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">نوع التوجيه</label>
                      <div className="grid grid-cols-2 gap-2">
                        {dirKinds.map((opt) => {
                          const Icon = opt.icon;
                          const selected = dk === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setActionModal({ ...actionModal, directiveKind: opt.value })}
                              className={`text-right p-2.5 rounded-lg border-2 transition flex items-start gap-2 ${
                                selected ? "border-[#D4AF37] bg-[#D4AF37]/10" : "border-slate-200 hover:border-slate-300 bg-white"
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${selected ? "text-[#9a7d28]" : "text-slate-500"}`} />
                              <div className="min-w-0 flex-1">
                                <p className={`text-[12px] font-bold ${selected ? "text-[#002845]" : "text-slate-700"}`}>{opt.label}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.hint}</p>
                              </div>
                              {selected && <CheckCircle className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {(dk === "department" || dk === "user" || dk === "assignment") && (() => {
                      // Helpers for the multi-recipient picker.
                      const sUserIds = actionModal.directiveUserIds || [];
                      const sRoles = actionModal.directiveRoles || [];
                      const everyone = !!actionModal.directiveEveryone;
                      const search = (actionModal.directiveStaffSearch || "").toLowerCase().trim();
                      const filteredStaff = staff.filter((s) => {
                        if (!search) return true;
                        return (
                          (s.name || "").toLowerCase().includes(search) ||
                          (s.email || "").toLowerCase().includes(search) ||
                          (ROLE_LABEL[s.role] || s.role || "").toLowerCase().includes(search)
                        );
                      });
                      const toggleUser = (uid: number) => {
                        setActionModal({
                          ...actionModal,
                          directiveUserIds: sUserIds.includes(uid) ? sUserIds.filter(x => x !== uid) : [...sUserIds, uid],
                          directiveEveryone: false,
                        });
                      };
                      const toggleRole = (role: string) => {
                        setActionModal({
                          ...actionModal,
                          directiveRoles: sRoles.includes(role) ? sRoles.filter(x => x !== role) : [...sRoles, role],
                          directiveEveryone: false,
                        });
                      };
                      const toggleEveryone = () => {
                        setActionModal({
                          ...actionModal,
                          directiveEveryone: !everyone,
                          directiveUserIds: !everyone ? [] : sUserIds,
                          directiveRoles: !everyone ? [] : sRoles,
                        });
                      };
                      const clearAll = () => {
                        setActionModal({
                          ...actionModal,
                          directiveUserIds: [],
                          directiveRoles: [],
                          directiveEveryone: false,
                          directiveStaffSearch: "",
                        });
                      };
                      // Total notification count preview — explicit users + role
                      // expansion (use staff array as a snapshot of who's active).
                      const previewIds = new Set<number>(sUserIds);
                      if (everyone) staff.forEach((s) => previewIds.add(s.id));
                      else if (sRoles.length > 0) {
                        for (const s of staff) if (sRoles.includes(s.role)) previewIds.add(s.id);
                      }
                      const previewCount = previewIds.size;

                      return (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-600">المستلمون</label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={toggleEveryone}
                                className={`text-[10px] px-2 py-1 rounded-full border font-bold ${
                                  everyone ? "bg-[#D4AF37] border-[#D4AF37] text-[#002845]" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {everyone ? "✓ الجميع" : "اختيار الجميع"}
                              </button>
                              {(sUserIds.length > 0 || sRoles.length > 0 || everyone) && (
                                <button type="button" onClick={clearAll} className="text-[10px] text-red-500 hover:underline">مسح</button>
                              )}
                            </div>
                          </div>

                          {/* Selected chips */}
                          {(sUserIds.length > 0 || sRoles.length > 0 || everyone) && (
                            <div className="flex items-center gap-1.5 flex-wrap p-2 rounded-lg bg-slate-50 border border-slate-100">
                              {everyone && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#9a7d28] text-[11px] font-bold border border-[#D4AF37]/30">
                                  <Crown className="w-3 h-3" /> الجميع
                                  <button onClick={toggleEveryone} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                                </span>
                              )}
                              {sRoles.map((r) => (
                                <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-medium">
                                  <Building2 className="w-3 h-3" /> {ROLE_LABEL[r] || r}
                                  <button onClick={() => toggleRole(r)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                                </span>
                              ))}
                              {sUserIds.map((uid) => {
                                const s = staff.find((x) => x.id === uid);
                                return (
                                  <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium border border-blue-100">
                                    <UserIcon className="w-3 h-3" /> {s ? s.name : `#${uid}`}
                                    <button onClick={() => toggleUser(uid)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* Department row */}
                          <div>
                            <p className="text-[10px] text-slate-400 mb-1">أقسام كاملة</p>
                            <div className="flex flex-wrap gap-1.5">
                              {ROLE_OPTIONS.map((o) => {
                                const checked = sRoles.includes(o.value);
                                const memberCount = staff.filter((s) => s.role === o.value).length;
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    disabled={everyone}
                                    onClick={() => toggleRole(o.value)}
                                    className={`text-[11px] px-2 py-1 rounded-lg border transition ${
                                      checked
                                        ? "bg-slate-700 text-white border-slate-700"
                                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                    }`}
                                  >
                                    {o.label} <span className="opacity-70">({memberCount})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Individual user picker */}
                          <div>
                            <p className="text-[10px] text-slate-400 mb-1">أو موظفون محددون</p>
                            <div className="relative">
                              <input
                                type="text"
                                value={actionModal.directiveStaffSearch || ""}
                                onChange={(e) => setActionModal({ ...actionModal, directiveStaffSearch: e.target.value })}
                                placeholder="ابحث بالاسم أو الإيميل أو القسم..."
                                disabled={everyone}
                                className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </div>
                            <div className="mt-1.5 max-h-40 overflow-y-auto border border-slate-100 rounded-lg bg-white">
                              {staffLoading ? (
                                <p className="text-xs text-slate-400 text-center py-3">جاري تحميل الموظفين...</p>
                              ) : filteredStaff.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-3">لا توجد نتائج</p>
                              ) : (
                                filteredStaff.map((s) => {
                                  const selected = sUserIds.includes(s.id);
                                  const disabled = everyone;
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => toggleUser(s.id)}
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-right text-xs border-b border-slate-50 last:border-b-0 transition ${
                                        selected ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-50"
                                      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                                    >
                                      <span className={`w-3.5 h-3.5 rounded border shrink-0 inline-flex items-center justify-center ${
                                        selected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"
                                      }`}>
                                        {selected && <CheckCircle className="w-3 h-3" />}
                                      </span>
                                      <span className="flex-1 min-w-0">
                                        <span className="font-semibold text-[#002845] block truncate">{s.name}</span>
                                        <span className="text-[10px] text-slate-500 block truncate">
                                          {ROLE_LABEL[s.role] || s.role} · {s.email}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {previewCount > 0 && (
                            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded px-2 py-1.5">
                              سيتم إرسال هذا التوجيه إلى <b>{previewCount}</b> {previewCount === 1 ? "مستلم" : "مستلمين"}
                              {dk === "assignment" && previewCount > 1 && <> (تكليف مشترك)</>}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {dk === "assignment" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">الأولوية</label>
                          <select
                            value={actionModal.directivePriority || "medium"}
                            onChange={(e) => setActionModal({ ...actionModal, directivePriority: e.target.value as any })}
                            className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white"
                          >
                            <option value="low">منخفض</option>
                            <option value="medium">متوسط</option>
                            <option value="high">عالٍ</option>
                            <option value="urgent">عاجل</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">تاريخ الاستحقاق</label>
                          <input
                            type="datetime-local"
                            value={actionModal.directiveDueAt || ""}
                            onChange={(e) => setActionModal({ ...actionModal, directiveDueAt: e.target.value })}
                            className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {isTransfer && (
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
                    {isCustomerReply ? "نص الرسالة للعميل"
                      : isDirective ? (dk === "assignment" ? "تفاصيل التكليف" : "نص الرسالة")
                      : isTransfer ? "سبب إعادة التحويل (اختياري)"
                                   : "ملاحظة الإغلاق (اختياري)"}
                  </label>
                  <textarea
                    value={actionModal.note}
                    onChange={(e) => setActionModal({ ...actionModal, note: e.target.value })}
                    rows={3}
                    placeholder={isCustomerReply ? "السلام عليكم..." : ""}
                    className="w-full p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 p-4 pt-2 border-t border-slate-100 shrink-0">
                <button onClick={() => setActionModal(null)} disabled={submitting} className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium disabled:opacity-50">إلغاء</button>
                <button
                  onClick={submit}
                  disabled={disabled}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${
                    isCustomerReply ? "bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845]"
                    : isDirective   ? "bg-slate-700 text-white hover:bg-slate-800"
                    : isTransfer    ? "bg-amber-600 text-white hover:bg-amber-700"
                                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                    isCustomerReply ? <Send className="w-3.5 h-3.5" /> :
                    isDirective     ? <Lock className="w-3.5 h-3.5" /> : null}
                  {isCustomerReply ? "إرسال للعميل"
                    : isDirective ? (dk === "note" ? "حفظ الملاحظة" : dk === "department" ? "إرسال للقسم" : dk === "user" ? "إرسال للموظف" : "إنشاء التكليف")
                    : "تأكيد"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
