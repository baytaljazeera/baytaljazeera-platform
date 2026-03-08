"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { 
  Trash2, AlertTriangle, Loader2, Check, RefreshCw,
  DollarSign, MessageSquare, Users, Bot, Phone, Bell,
  ShieldAlert, RotateCcw, UserX
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface CategoryStats {
  [table: string]: number;
  _total: number;
}

interface AllStats {
  [key: string]: CategoryStats;
}

const CATEGORIES = [
  {
    key: "financial",
    label: "المبالغ المالية",
    description: "مدفوعات، فواتير، استردادات، حجوزات النخبة",
    icon: DollarSign,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    tables: ["payments", "invoices", "refunds", "elite_reservations", "elite_extensions"],
    tableLabels: { payments: "مدفوعات", invoices: "فواتير", refunds: "استردادات", elite_reservations: "حجوزات نخبة", elite_extensions: "طلبات تمديد" },
  },
  {
    key: "messages",
    label: "الرسائل والمحادثات",
    description: "رسائل العملاء، محادثات الدعم",
    icon: MessageSquare,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    tables: ["messages", "conversations", "admin_messages", "admin_conversations"],
    tableLabels: { messages: "رسائل", conversations: "محادثات", admin_messages: "رسائل الدعم", admin_conversations: "محادثات الدعم" },
  },
  {
    key: "ambassador",
    label: "بيانات السفراء",
    description: "معاملات المحفظة، طلبات السحب، تصفير الأرصدة",
    icon: Users,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    tables: ["wallet_transactions", "withdrawal_requests", "wallets"],
    tableLabels: { wallet_transactions: "معاملات المحفظة", withdrawal_requests: "طلبات سحب", wallets: "محافظ بأرصدة" },
  },
  {
    key: "ai_logs",
    label: "سجلات الذكاء الاصطناعي",
    description: "محادثات الشات بوت وسجلات AI",
    icon: Bot,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    tables: ["chat_logs"],
    tableLabels: { chat_logs: "سجلات محادثات" },
  },
  {
    key: "whatsapp",
    label: "رسائل واتساب",
    description: "رسائل واتساب المرسلة والحملات",
    icon: Phone,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    tables: ["messages", "campaigns"],
    tableLabels: { messages: "رسائل واتساب", campaigns: "حملات" },
  },
  {
    key: "notifications",
    label: "الإشعارات والتنبيهات",
    description: "إشعارات النظام وتنبيهات الحسابات",
    icon: Bell,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    tables: ["notifications", "alerts"],
    tableLabels: { notifications: "إشعارات", alerts: "تنبيهات" },
  },
  {
    key: "customers",
    label: "جميع العملاء (حذف كامل)",
    description: "حذف جميع حسابات العملاء وإعلاناتهم واشتراكاتهم - لا يشمل حسابات الأدمن",
    icon: UserX,
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200",
    tables: ["users", "properties", "subscriptions"],
    tableLabels: { users: "عملاء", properties: "إعلانات", subscriptions: "اشتراكات" },
  },
];

export default function ResetDataPage() {
  const [stats, setStats] = useState<AllStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [results, setResults] = useState<Record<string, Record<string, number>> | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/reset-test-data/stats`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === CATEGORIES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(CATEGORIES.map((c) => c.key)));
    }
  }

  async function handleReset() {
    if (selected.size === 0) return;
    setResetting(true);
    setResults(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/reset-test-data`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ categories: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "تم تصفير البيانات بنجاح" });
        setResults(data.results);
        setSelected(new Set());
        fetchStats();
      } else {
        setMessage({ type: "error", text: data.error || "حدث خطأ" });
      }
    } catch {
      setMessage({ type: "error", text: "حدث خطأ في الاتصال" });
    } finally {
      setResetting(false);
      setConfirmModal(false);
    }
  }

  const totalSelected = Array.from(selected).reduce((sum, key) => {
    return sum + (stats?.[key]?._total || 0);
  }, 0);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-red-600" />
            </div>
            تصفير بيانات التجارب
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            حذف بيانات الاختبار مع الحفاظ على حسابات العملاء والإعلانات
          </p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition"
          title="تحديث الإحصائيات"
        >
          <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border ${
          message.type === "success" 
            ? "bg-green-50 border-green-200 text-green-700" 
            : "bg-red-50 border-red-200 text-red-700"
        } flex items-center gap-2`}>
          {message.type === "success" ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {results && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
            <Check className="w-5 h-5" />
            نتائج التصفير
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(results).map(([category, tables]) => (
              <div key={category} className="bg-white rounded-lg p-3 border border-green-100">
                <p className="text-xs text-green-600 font-medium mb-1">
                  {CATEGORIES.find(c => c.key === category)?.label}
                </p>
                {Object.entries(tables).map(([table, count]) => (
                  <p key={table} className="text-xs text-slate-600">
                    {table}: <span className="font-bold text-red-500">{count as number}</span> محذوف
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">تنبيه مهم</p>
          <p className="text-amber-700 text-xs mt-1">
            هذه العملية تحذف البيانات نهائياً ولا يمكن التراجع عنها. حسابات العملاء والإعلانات والباقات لن تتأثر.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={selectAll}
          className="px-4 py-2 bg-[#01273C] text-white text-sm rounded-lg hover:bg-[#01273C]/90 transition"
        >
          {selected.size === CATEGORIES.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
        </button>
        {selected.size > 0 && (
          <span className="text-sm text-red-600 font-medium">
            محدد: {selected.size} فئة ({totalSelected} سجل)
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37] mx-auto" />
          <p className="text-slate-500 mt-3 text-sm">جاري تحميل الإحصائيات...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CATEGORIES.map((cat) => {
            const catStats = stats?.[cat.key];
            const total = catStats?._total || 0;
            const isSelected = selected.has(cat.key);
            const Icon = cat.icon;

            return (
              <div
                key={cat.key}
                onClick={() => toggleCategory(cat.key)}
                className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                  isSelected
                    ? "border-red-400 bg-red-50/50 shadow-md ring-2 ring-red-200"
                    : `${cat.borderColor} ${cat.bgColor} hover:shadow-sm`
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isSelected ? "bg-red-100" : cat.bgColor
                    }`}>
                      <Icon className={`w-5 h-5 ${isSelected ? "text-red-600" : cat.color}`} />
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm ${isSelected ? "text-red-800" : "text-[#002845]"}`}>
                        {cat.label}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${total > 0 ? (isSelected ? "text-red-600" : cat.color) : "text-slate-300"}`}>
                      {total}
                    </span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-5 h-5 rounded border-slate-300 cursor-pointer accent-red-500"
                    />
                  </div>
                </div>

                {catStats && total > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap gap-2">
                    {cat.tables.map((table) => {
                      const count = catStats[table] || 0;
                      if (count === 0) return null;
                      const label = (cat.tableLabels as Record<string, string>)[table] || table;
                      return (
                        <span
                          key={table}
                          className={`text-xs px-2 py-1 rounded-full ${
                            isSelected ? "bg-red-100 text-red-700" : "bg-white/80 text-slate-600"
                          }`}
                        >
                          {label}: {count}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 bg-red-500 text-white rounded-xl p-4 shadow-xl flex items-center justify-between">
          <div>
            <p className="font-bold">
              تصفير {selected.size} فئة ({totalSelected} سجل)
            </p>
            <p className="text-red-100 text-xs mt-0.5">
              {Array.from(selected).map(k => CATEGORIES.find(c => c.key === k)?.label).join("، ")}
            </p>
          </div>
          <button
            onClick={() => setConfirmModal(true)}
            className="px-6 py-2.5 bg-white text-red-600 font-bold rounded-lg hover:bg-red-50 transition flex items-center gap-2"
          >
            <Trash2 className="w-5 h-5" />
            تصفير الآن
          </button>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-[#002845] mb-2 text-center">
              تأكيد تصفير البيانات
            </h3>
            <p className="text-slate-600 text-sm mb-3 text-center">
              سيتم حذف <span className="font-bold text-red-600">{totalSelected}</span> سجل نهائياً من:
            </p>
            <div className="bg-red-50 rounded-lg p-3 mb-4 space-y-1">
              {Array.from(selected).map((key) => {
                const cat = CATEGORIES.find(c => c.key === key);
                return (
                  <p key={key} className="text-sm text-red-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {cat?.label} ({stats?.[key]?._total || 0} سجل)
                  </p>
                );
              })}
            </div>
            <p className="text-xs text-red-500 text-center mb-4">
              هذا الإجراء لا يمكن التراجع عنه!
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(false)}
                disabled={resetting}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition flex items-center justify-center gap-2 font-medium"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري التصفير...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    تأكيد التصفير
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}