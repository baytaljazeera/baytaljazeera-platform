"use client";

/**
 * HR Landing page (Phase 0 of the Administrative OS refactor).
 *
 * This is the front door for the new "الموارد البشرية" sidebar section.
 * It surfaces the two views that exist today (applications + staff) and
 * leaves clear placeholders for the views that come in Phase 4 (contracts,
 * evaluations, attendance) — so the owner sees the planned shape, and we
 * have a stable URL to grow into.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  Users, UserPlus2, FileSignature, CalendarClock,
  Loader2, ArrowLeft, AlertCircle,
} from "lucide-react";

type Counters = {
  pendingApplications: number;
  staffActive: number;
};

export default function HRPage() {
  const [counters, setCounters] = useState<Counters>({
    pendingApplications: 0,
    staffActive: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Two independent counters — failures on one shouldn't blank the page.
      const [appsRes, staffRes] = await Promise.all([
        fetch(`${API_URL}/api/membership/admin/requests?status=pending&limit=1`, {
          credentials: "include", headers: getAuthHeaders(),
        }).catch(() => null),
        fetch(`${API_URL}/api/membership/admin/staff?limit=1`, {
          credentials: "include", headers: getAuthHeaders(),
        }).catch(() => null),
      ]);
      let pending = 0, staff = 0;
      try {
        if (appsRes && appsRes.ok) {
          const d = await appsRes.json();
          pending = d.pagination?.total ?? d.requests?.length ?? 0;
        }
      } catch {}
      try {
        if (staffRes && staffRes.ok) {
          const d = await staffRes.json();
          staff = d.pagination?.total ?? d.staff?.length ?? 0;
        }
      } catch {}
      setCounters({ pendingApplications: pending, staffActive: staff });
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cards = [
    {
      title: "طلبات التوظيف",
      sub: "طلبات الانضمام بانتظار قرارك",
      href: "/add-listing/admin/roles?tab=applications",
      icon: UserPlus2,
      count: counters.pendingApplications,
      tone: "bg-amber-50 border-amber-200 text-amber-700",
      ready: true,
    },
    {
      title: "الموظفون",
      sub: "كل الفريق الإداري — أدوار، حالة، نشاط، تفاصيل",
      href: "/add-listing/admin/hr/employees",
      icon: Users,
      count: counters.staffActive,
      tone: "bg-blue-50 border-blue-200 text-blue-700",
      ready: true,
    },
    {
      title: "العقود والتقييمات",
      sub: "تُدار من داخل ملف كل موظف — افتح الموظف ثم سجّل أو راجع",
      href: "/add-listing/admin/hr/employees",
      icon: FileSignature,
      count: null,
      tone: "bg-blue-50 border-blue-200 text-blue-700",
      ready: true,
    },
    {
      title: "الحضور (Activity-based)",
      sub: "آخر دخول + آخر إجراء — يظهر في قائمة الموظفين",
      href: "/add-listing/admin/hr/employees",
      icon: CalendarClock,
      count: null,
      tone: "bg-blue-50 border-blue-200 text-blue-700",
      ready: true,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#002845] flex items-center gap-2">
            <Users className="w-6 h-6 md:w-7 md:h-7 text-pink-500" />
            الموارد البشرية
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            استقبال الطلبات، إدارة الفريق، وتوزيع المهام عبر الأقسام. كل اعتماد دور جديد يمر من هنا.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((c, i) => {
            const Icon = c.icon;
            const inner = (
              <div className={`bg-white border border-slate-200 rounded-xl p-4 h-full transition ${
                c.ready ? "hover:border-[#D4AF37]/40 hover:shadow-sm" : "opacity-70"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className={`w-10 h-10 rounded-lg border ${c.tone} flex items-center justify-center shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {c.ready && c.count !== null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      c.count > 0 ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-50 text-slate-500 border border-slate-200"
                    }`}>
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : c.count}
                    </span>
                  )}
                  {!c.ready && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                      قيد التطوير
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm font-bold text-[#002845]">{c.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p>
                {c.ready && (
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#9a7d28]">
                    <ArrowLeft className="w-3 h-3" /> فتح
                  </div>
                )}
              </div>
            );
            return c.ready ? (
              <Link key={i} href={c.href}>{inner}</Link>
            ) : (
              <div key={i}>{inner}</div>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
          <p className="leading-relaxed">
            <b className="text-[#002845]">نموذج العمل:</b> العقود + التقييمات + الحضور تُدار من داخل صفحة كل موظف. افتح الموظف من قائمة "الموظفون" → أضف عقداً جديداً أو سجّل تقييماً أو راجع التوجيهات المستلمة. الحضور يُحسب تلقائياً من آخر دخول + آخر إجراء على النظام.
          </p>
        </div>
      </div>
    </div>
  );
}
