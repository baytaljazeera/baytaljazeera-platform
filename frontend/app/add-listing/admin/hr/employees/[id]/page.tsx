"use client";

/**
 * Phase 4 — Employee profile.
 *
 * Pulls everything the HR team needs about a staff member:
 *   - basic identity (from users)
 *   - linked inboxes (admin_inboxes whose required_roles include this role)
 *   - directives/assignments they received (from complaint_events)
 *   - contracts + evaluations (HR-owned tables)
 *   - activity timestamps (last login / last action)
 *
 * Includes inline forms to create a new contract and to record a new
 * evaluation — no separate page round-trip.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, ChevronLeft, Loader2, AlertTriangle, Mail, Phone, Inbox,
  ClipboardCheck, FileSignature, History, Star, RefreshCcw, Plus,
  Calendar, AlertCircle, Crown,
} from "lucide-react";

type EmployeeData = {
  user: { id: string; name: string; email: string; phone: string | null; role: string; status: string; joined_at: string; last_login_at: string | null };
  inboxes: Array<{ key: string; title: string; icon_name: string; accent_color: string }>;
  directives: Array<{
    id: number; event_type: string; actor_name_snapshot: string | null; actor_role_snapshot: string | null;
    target_kind: string | null; note: string | null; due_at: string | null;
    assignment_status: string | null; assignment_priority: string | null; created_at: string;
  }>;
  contracts: Array<{ id: number; start_date: string; end_date: string | null; status: string; contract_type: string | null; notes: string | null; created_at: string }>;
  evaluations: Array<{ id: number; evaluator_name_snapshot: string | null; evaluator_role_snapshot: string | null; response_speed: number | null; interaction_quality: number | null; commitment: number | null; notes: string | null; created_at: string }>;
  averages: { response_speed: number | null; interaction_quality: number | null; commitment: number | null } | null;
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "المدير العام", admin: "إدارة عليا", admin_manager: "مدير الإدارة",
  finance_admin: "المالية", support_admin: "الدعم", content_admin: "المحتوى", hr_admin: "الموارد البشرية",
};
function dateOnly(iso?: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" }); }
function dateTime(iso?: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`w-3 h-3 ${n <= Math.round(value) ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />
      ))}
      <span className="text-[11px] text-slate-500 mr-1">({value.toFixed(1)})</span>
    </span>
  );
}

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline create forms
  const [contractForm, setContractForm] = useState({ start_date: "", end_date: "", contract_type: "full_time", notes: "" });
  const [evalForm, setEvalForm] = useState({ response_speed: 3, interaction_quality: 3, commitment: 3, notes: "" });
  const [savingContract, setSavingContract] = useState(false);
  const [savingEval, setSavingEval] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/hr/employees/${id}`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      if (res.status === 404) throw new Error("الموظف غير موجود");
      if (res.status === 403) throw new Error("غير مصرح");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveContract() {
    if (!id) return;
    if (!contractForm.start_date) { toast.warning("تاريخ البداية مطلوب"); return; }
    setSavingContract(true);
    try {
      const res = await fetch(`${API_URL}/api/hr/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ user_id: id, ...contractForm, end_date: contractForm.end_date || null }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      toast.success("تم حفظ العقد");
      setContractForm({ start_date: "", end_date: "", contract_type: "full_time", notes: "" });
      load();
    } catch (e: any) {
      toast.error(e?.message || "خطأ في الحفظ");
    } finally { setSavingContract(false); }
  }
  async function saveEvaluation() {
    if (!id) return;
    setSavingEval(true);
    try {
      const res = await fetch(`${API_URL}/api/hr/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ user_id: id, ...evalForm }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      toast.success("تم حفظ التقييم");
      setEvalForm({ response_speed: 3, interaction_quality: 3, commitment: 3, notes: "" });
      load();
    } catch (e: any) {
      toast.error(e?.message || "خطأ في الحفظ");
    } finally { setSavingEval(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /><p className="text-sm text-slate-500 mt-2">جاري التحميل...</p></div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
        <Link href="/add-listing/admin/hr/employees" className="text-xs text-slate-500 hover:text-[#002845] inline-flex items-center gap-1 mb-4">
          <ChevronLeft className="w-3 h-3" /> رجوع للقائمة
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error || "بيانات غير متاحة"}
        </div>
      </div>
    );
  }

  const u = data.user;
  const isOwner = u.role === "super_admin";

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
        <Link href="/add-listing/admin/hr/employees" className="text-xs text-slate-500 hover:text-[#002845] inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> الموظفون
        </Link>

        {/* Header card — identity */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#002845] to-[#003366] text-white flex items-center justify-center font-bold text-2xl shrink-0 ring-2 ring-[#D4AF37]/30">
              {(u.name || "?").trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-[#002845]">{u.name || "—"}</h1>
                {isOwner && <Crown className="w-5 h-5 text-[#D4AF37]" />}
              </div>
              <div className="text-sm text-slate-500 mt-1 inline-flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>
                {u.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {u.phone}</span>}
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">{ROLE_LABEL[u.role] || u.role}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                انضم {dateOnly(u.joined_at)} · آخر دخول {dateTime(u.last_login_at)}
              </p>
            </div>
            <button onClick={load} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs inline-flex items-center gap-1">
              <RefreshCcw className="w-3 h-3" /> تحديث
            </button>
          </div>
        </div>

        {/* Linked inboxes */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-[#002845] inline-flex items-center gap-2 mb-3">
            <Inbox className="w-4 h-4 text-slate-500" /> صناديق الوصول المرتبطة
          </h2>
          {data.inboxes.length === 0 ? (
            <p className="text-xs text-slate-400">لا يوجد صناديق وصول مرتبطة بدور هذا الموظف.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.inboxes.map((ib) => (
                <Link key={ib.key} href={`/add-listing/admin/inbox/${ib.key}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 text-sm">
                  <Inbox className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-medium text-[#002845]">{ib.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Evaluations — averages + history + create */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#002845] inline-flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-600" /> التقييمات
          </h2>
          {data.averages && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                <p className="text-slate-500 mb-1">سرعة الرد</p>
                <Stars value={data.averages.response_speed} />
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                <p className="text-slate-500 mb-1">جودة التعامل</p>
                <Stars value={data.averages.interaction_quality} />
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                <p className="text-slate-500 mb-1">الالتزام</p>
                <Stars value={data.averages.commitment} />
              </div>
            </div>
          )}
          {/* History */}
          {data.evaluations.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-[#002845]">سجل التقييمات ({data.evaluations.length})</summary>
              <div className="mt-2 space-y-2">
                {data.evaluations.map((ev) => (
                  <div key={ev.id} className="text-xs border-r-2 border-emerald-200 pr-2 py-1">
                    <p className="text-slate-700">
                      {ev.evaluator_name_snapshot || "النظام"} · {ev.evaluator_role_snapshot ? (ROLE_LABEL[ev.evaluator_role_snapshot] || ev.evaluator_role_snapshot) : ""} · {dateTime(ev.created_at)}
                    </p>
                    <div className="flex gap-3 mt-0.5">
                      <span>سرعة: <Stars value={ev.response_speed} /></span>
                      <span>جودة: <Stars value={ev.interaction_quality} /></span>
                      <span>التزام: <Stars value={ev.commitment} /></span>
                    </div>
                    {ev.notes && <p className="mt-1 p-1.5 bg-slate-50 rounded text-slate-700 text-[11px]">{ev.notes}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
          {/* Inline create form */}
          <div className="border border-dashed border-slate-200 rounded-lg p-3 bg-slate-50/40">
            <p className="text-xs font-semibold text-[#002845] mb-2">إضافة تقييم جديد</p>
            <div className="grid grid-cols-3 gap-2">
              {(["response_speed", "interaction_quality", "commitment"] as const).map((k) => (
                <div key={k}>
                  <label className="block text-[10px] text-slate-500 mb-1">
                    {k === "response_speed" ? "سرعة الرد" : k === "interaction_quality" ? "جودة التعامل" : "الالتزام"}
                  </label>
                  <select
                    value={evalForm[k]}
                    onChange={(e) => setEvalForm({ ...evalForm, [k]: parseInt(e.target.value, 10) })}
                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                  >
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <textarea
              value={evalForm.notes}
              onChange={(e) => setEvalForm({ ...evalForm, notes: e.target.value })}
              placeholder="ملاحظات (اختياري)"
              rows={2}
              className="mt-2 w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white resize-none"
            />
            <button
              onClick={saveEvaluation}
              disabled={savingEval}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold disabled:opacity-50"
            >
              {savingEval ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              حفظ التقييم
            </button>
          </div>
        </div>

        {/* Contracts */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-[#002845] inline-flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-blue-600" /> العقود
          </h2>
          {data.contracts.length === 0 ? (
            <p className="text-xs text-slate-400">لا يوجد عقود مسجلة لهذا الموظف.</p>
          ) : (
            <div className="space-y-2">
              {data.contracts.map((c) => {
                const endingSoon = c.end_date && (new Date(c.end_date).getTime() - Date.now()) < 30 * 86_400_000 && c.status === 'active';
                return (
                  <div key={c.id} className="border border-slate-100 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#002845]">{c.contract_type || "عقد"}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        c.status === 'active' ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : c.status === 'ended' ? "bg-slate-100 text-slate-500 border-slate-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>{c.status}</span>
                      {endingSoon && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-50 border-red-200 text-red-700 inline-flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" /> ينتهي خلال 30 يوم
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 mt-1 inline-flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> {dateOnly(c.start_date)} → {c.end_date ? dateOnly(c.end_date) : "غير محدد"}
                    </p>
                    {c.notes && <p className="mt-1 p-1.5 bg-slate-50 rounded text-[11px] text-slate-700">{c.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
          {/* Inline create */}
          <div className="border border-dashed border-slate-200 rounded-lg p-3 bg-slate-50/40">
            <p className="text-xs font-semibold text-[#002845] mb-2">إضافة عقد جديد</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">تاريخ البداية</label>
                <input type="date" value={contractForm.start_date} onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })} className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">تاريخ النهاية</label>
                <input type="date" value={contractForm.end_date} onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })} className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">نوع العقد</label>
                <select value={contractForm.contract_type} onChange={(e) => setContractForm({ ...contractForm, contract_type: e.target.value })} className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white">
                  <option value="full_time">دوام كامل</option>
                  <option value="part_time">دوام جزئي</option>
                  <option value="contract">عقد محدد</option>
                  <option value="trial">تجريبي</option>
                </select>
              </div>
            </div>
            <textarea value={contractForm.notes} onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })} placeholder="ملاحظات (اختياري)" rows={2} className="mt-2 w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white resize-none" />
            <button onClick={saveContract} disabled={savingContract} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold disabled:opacity-50">
              {savingContract ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              حفظ العقد
            </button>
          </div>
        </div>

        {/* Directives + assignments received */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-[#002845] inline-flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-amber-600" /> التوجيهات المُستلمة ({data.directives.length})
          </h2>
          {data.directives.length === 0 ? (
            <p className="text-xs text-slate-400">لم يستلم هذا الموظف توجيهات أو تكليفات بعد.</p>
          ) : (
            <div className="space-y-2">
              {data.directives.map((d) => (
                <div key={d.id} className="border-r-2 border-amber-300 pr-2 py-1 text-xs">
                  <p className="font-semibold text-[#002845]">
                    {d.event_type === "assignment" ? "تكليف رسمي" : d.event_type === "directive" ? "توجيه" : "ملاحظة داخلية"}
                    {d.assignment_priority && <> · {d.assignment_priority}</>}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    من: {d.actor_name_snapshot || "—"} {d.actor_role_snapshot && <>· {ROLE_LABEL[d.actor_role_snapshot] || d.actor_role_snapshot}</>}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {dateTime(d.created_at)}
                    {d.due_at && <> · استحقاق: {dateTime(d.due_at)}</>}
                  </p>
                  {d.note && <p className="mt-1 p-1.5 bg-slate-50 rounded text-[11px] text-slate-700">{d.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
