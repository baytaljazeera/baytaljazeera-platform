"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { 
  Users, Search, User, Mail, Phone, Calendar, RefreshCw, 
  Ban, Trash2, Check, Loader2, Clock, AlertTriangle,
  Crown, Eye, MoreVertical, UserX, PauseCircle, PlayCircle,
  TrendingUp, BarChart3, Shield
} from "lucide-react";

interface Plan {
  id: number;
  name_ar: string;
  logo: string;
  color: string;
  icon: string;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
  plan_id?: number;
  plan_name?: string;
  plan_color?: string;
  plan_logo?: string;
  subscription_status?: string;
  subscription_expires?: string;
}

interface UserStats {
  total: number;
  active: number;
  onHold: number;
  underReview: number;
  expired: number;
  byPlan: { plan_id: number; plan_name: string; plan_color: string; plan_logo: string; count: number }[];
}

const USER_STATUSES = [
  { value: "active", label: "نشط", color: "bg-green-100 text-green-700", bgColor: "#22c55e", icon: PlayCircle },
  { value: "on_hold", label: "إيقاف مؤقت", color: "bg-red-100 text-red-700", bgColor: "#ef4444", icon: PauseCircle },
  { value: "under_review", label: "تحت التدقيق", color: "bg-yellow-100 text-yellow-700", bgColor: "#eab308", icon: Clock },
];

export default function UsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ 
    show: boolean; 
    action: string; 
    userId: string; 
    userName: string 
  } | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.actions-dropdown')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [usersRes, plansRes, statsRes] = await Promise.all([
        fetch("/api/admin/users/customers", { credentials: "include" }),
        fetch("/api/plans", { credentials: "include" }),
        fetch("/api/admin/users/stats", { credentials: "include" }),
      ]);

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(userId: string, newStatus: string) {
    setActionLoading(userId);
    setOpenDropdown(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message || "تم تحديث الحالة بنجاح" });
        fetchData();
      } else {
        setMessage({ type: "error", text: data.error || "حدث خطأ" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ في الاتصال" });
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  }

  async function handleDeleteAccount(userId: string) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "تم حذف الحساب بنجاح" });
        fetchData();
      } else {
        setMessage({ type: "error", text: data.error || "حدث خطأ" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ في الاتصال" });
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    const matchesPlan = planFilter === "all" || (u.plan_id?.toString() === planFilter);
    const matchesSearch =
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone?.includes(searchTerm);
    return matchesStatus && matchesPlan && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = USER_STATUSES.find(s => s.value === status);
    if (!statusConfig) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">غير محدد</span>;
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
        {statusConfig.label}
      </span>
    );
  };

  const getPlanLogo = (logo: string) => {
    const logos: Record<string, string> = {
      "🏠": "🏠", "🏡": "🏡", "🏢": "🏢", "🏰": "🏰", "🌟": "🌟",
      "💎": "💎", "👑": "👑", "🔥": "🔥", "⭐": "⭐", "🎯": "🎯",
      "🚀": "🚀", "💼": "💼", "🎪": "🎪", "🎭": "🎭", "🎨": "🎨", "🎁": "🎁"
    };
    return logos[logo] || "🏷️";
  };

  const getMaxPlanCount = () => {
    if (!stats?.byPlan) return 1;
    return Math.max(...stats.byPlan.map(p => p.count), 1);
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg ${
          message.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">إدارة العملاء</h1>
          <p className="text-sm text-slate-500 mt-1">عرض وإدارة حسابات العملاء</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/admin/roles"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl hover:shadow-lg transition text-sm font-medium"
          >
            <Shield className="w-4 h-4" />
            إدارة الصلاحيات
          </a>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#003d5c] transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      {stats && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-lg font-bold text-[#002845]">إحصائيات سريعة</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <Users className="w-4 h-4" />
                حالة المستخدمين
              </h3>
              
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-600">إجمالي العملاء</span>
                  <span className="text-3xl font-bold text-[#002845]">{stats.total}</span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <PlayCircle className="w-3 h-3" /> نشط
                        </span>
                        <span className="text-sm font-bold text-green-600">{stats.active}</span>
                      </div>
                      <div className="h-2 bg-green-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${stats.total > 0 ? (stats.active / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                          <PauseCircle className="w-3 h-3" /> إيقاف مؤقت
                        </span>
                        <span className="text-sm font-bold text-red-600">{stats.onHold}</span>
                      </div>
                      <div className="h-2 bg-red-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-red-500 rounded-full transition-all duration-500"
                          style={{ width: `${stats.total > 0 ? (stats.onHold / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-yellow-600 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" /> تحت التدقيق
                        </span>
                        <span className="text-sm font-bold text-yellow-600">{stats.underReview}</span>
                      </div>
                      <div className="h-2 bg-yellow-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                          style={{ width: `${stats.total > 0 ? (stats.underReview / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-orange-600 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> منتهي الاشتراك
                        </span>
                        <span className="text-sm font-bold text-orange-600">{stats.expired}</span>
                      </div>
                      <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-orange-500 rounded-full transition-all duration-500"
                          style={{ width: `${stats.total > 0 ? (stats.expired / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                توزيع الباقات
              </h3>
              
              {stats.byPlan && stats.byPlan.length > 0 ? (
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-4 border border-amber-100">
                  <div className="space-y-3">
                    {stats.byPlan.map((plan, idx) => (
                      <div key={plan.plan_id} className="flex items-center gap-3">
                        <span className="text-xl w-8 text-center">{getPlanLogo(plan.plan_logo)}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium" style={{ color: plan.plan_color }}>
                              {plan.plan_name}
                            </span>
                            <span className="text-sm font-bold" style={{ color: plan.plan_color }}>
                              {plan.count}
                            </span>
                          </div>
                          <div className="h-3 bg-white/60 rounded-full overflow-hidden shadow-inner">
                            <div 
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{ 
                                width: `${(plan.count / getMaxPlanCount()) * 100}%`,
                                backgroundColor: plan.plan_color,
                                boxShadow: `0 0 10px ${plan.plan_color}40`
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl p-6 text-center text-slate-400">
                  لا توجد بيانات
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-100">
            <div className="text-center p-3 rounded-xl bg-blue-50">
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              <p className="text-xs text-blue-500">إجمالي</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-green-50">
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              <p className="text-xs text-green-500">نشط</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-50">
              <p className="text-2xl font-bold text-red-600">{stats.onHold}</p>
              <p className="text-xs text-red-500">إيقاف</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-yellow-50">
              <p className="text-2xl font-bold text-yellow-600">{stats.underReview}</p>
              <p className="text-xs text-yellow-600">تدقيق</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-orange-50">
              <p className="text-2xl font-bold text-orange-600">{stats.expired}</p>
              <p className="text-xs text-orange-500">منتهي</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="text-xs font-semibold text-slate-600">فلتر الحالة:</div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === "all" ? "bg-[#002845] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                الكل
              </button>
              {USER_STATUSES.map(status => {
                const statusCount = status.value === 'active' ? stats?.active : 
                                   status.value === 'on_hold' ? stats?.onHold : 
                                   status.value === 'under_review' ? stats?.underReview : 0;
                return (
                  <button
                    key={status.value}
                    onClick={() => setStatusFilter(status.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 relative ${
                      statusFilter === status.value 
                        ? "text-white" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    style={statusFilter === status.value ? { backgroundColor: status.bgColor } : {}}
                  >
                    <status.icon className="w-3 h-3" />
                    {status.label}
                    {statusCount !== undefined && statusCount > 0 && (
                      <span className={`absolute -top-2 -left-2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full ${
                        statusFilter === status.value 
                          ? "bg-white text-slate-700" 
                          : "text-white"
                      }`}
                      style={statusFilter !== status.value ? { backgroundColor: status.bgColor } : {}}
                      >
                        {statusCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="text-xs font-semibold text-slate-600">فلتر الباقة:</div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setPlanFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  planFilter === "all" ? "bg-[#002845] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                جميع الباقات
              </button>
              {plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => setPlanFilter(plan.id.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                    planFilter === plan.id.toString() 
                      ? "text-white" 
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  style={planFilter === plan.id.toString() ? { backgroundColor: plan.color } : {}}
                >
                  <span>{getPlanLogo(plan.logo)}</span>
                  {plan.name_ar}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="text-sm text-slate-500">
            عرض {filteredUsers.length} من {users.length} عميل
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالاسم أو البريد أو الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-9 pl-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-3 text-sm">جاري التحميل...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">لا يوجد عملاء مطابقين للفلتر</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 text-right">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">#</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">العميل</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">البريد</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">الهاتف</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">الباقة</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">الحالة</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">تاريخ التسجيل</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user, idx) => (
                  <tr 
                    key={`user-${user.id}-${idx}`} 
                    className={`hover:bg-slate-50 transition ${
                      user.status === "on_hold" ? "bg-red-50/50" : 
                      user.status === "under_review" ? "bg-yellow-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-slate-600">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br from-[#002845] to-[#004d7a]">
                          {user.name?.charAt(0) || "؟"}
                        </div>
                        <span className="text-sm font-medium text-[#002845]">{user.name || "بدون اسم"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Mail className="w-3 h-3" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Phone className="w-3 h-3" />
                        {user.phone || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.plan_name ? (
                        <span 
                          className="px-2 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1 w-fit"
                          style={{ backgroundColor: user.plan_color || '#666' }}
                        >
                          <span>{getPlanLogo(user.plan_logo || '')}</span>
                          {user.plan_name}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          بدون باقة
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(user.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {new Date(user.created_at).toLocaleDateString("ar-SA")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {actionLoading === user.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      ) : (
                        <div className="relative actions-dropdown">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdown(openDropdown === user.id ? null : user.id);
                            }}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition"
                          >
                            <MoreVertical className="w-4 h-4 text-slate-600" />
                          </button>
                          
                          {openDropdown === user.id && (
                            <div 
                              className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 z-50 min-w-[180px] py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {user.status !== "active" && (
                                <button
                                  onClick={() => handleStatusChange(user.id, "active")}
                                  className="w-full px-4 py-2 text-right text-sm hover:bg-green-50 flex items-center gap-2 text-green-600"
                                >
                                  <PlayCircle className="w-4 h-4" />
                                  تفعيل الحساب
                                </button>
                              )}
                              
                              {user.status !== "on_hold" && (
                                <button
                                  onClick={() => setConfirmModal({ 
                                    show: true, 
                                    action: "on_hold", 
                                    userId: user.id, 
                                    userName: user.name || "هذا المستخدم"
                                  })}
                                  className="w-full px-4 py-2 text-right text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
                                >
                                  <PauseCircle className="w-4 h-4" />
                                  إيقاف مؤقت
                                </button>
                              )}
                              
                              {user.status !== "under_review" && (
                                <button
                                  onClick={() => handleStatusChange(user.id, "under_review")}
                                  className="w-full px-4 py-2 text-right text-sm hover:bg-yellow-50 flex items-center gap-2 text-yellow-600"
                                >
                                  <Clock className="w-4 h-4" />
                                  تحت التدقيق
                                </button>
                              )}
                              
                              <div className="border-t border-slate-100 my-1"></div>
                              
                              <button
                                onClick={() => setConfirmModal({ 
                                  show: true, 
                                  action: "delete", 
                                  userId: user.id, 
                                  userName: user.name || "هذا المستخدم"
                                })}
                                className="w-full px-4 py-2 text-right text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                                إلغاء الاشتراك (حذف الحساب)
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
              confirmModal.action === "delete" ? "bg-red-100" : "bg-red-100"
            }`}>
              {confirmModal.action === "delete" ? (
                <Trash2 className="w-6 h-6 text-red-600" />
              ) : (
                <PauseCircle className="w-6 h-6 text-red-600" />
              )}
            </div>
            
            <h3 className="text-lg font-bold text-[#002845] mb-2 text-center">
              {confirmModal.action === "delete" && "إلغاء الاشتراك"}
              {confirmModal.action === "on_hold" && "إيقاف مؤقت"}
            </h3>
            
            <p className="text-slate-600 text-sm mb-4 text-center">
              {confirmModal.action === "delete" && (
                <>هل أنت متأكد من إلغاء اشتراك وحذف حساب "<span className="font-bold">{confirmModal.userName}</span>"؟<br/><span className="text-red-500 text-xs">هذا الإجراء لا يمكن التراجع عنه!</span></>
              )}
              {confirmModal.action === "on_hold" && (
                <>هل تريد إيقاف حساب "<span className="font-bold">{confirmModal.userName}</span>" مؤقتاً؟<br/><span className="text-slate-400 text-xs">يمكن تفعيله لاحقاً</span></>
              )}
            </p>
            
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (confirmModal.action === "delete") {
                    handleDeleteAccount(confirmModal.userId);
                  } else if (confirmModal.action === "on_hold") {
                    handleStatusChange(confirmModal.userId, "on_hold");
                  }
                }}
                className={`flex-1 px-4 py-2 rounded-lg text-white transition ${
                  confirmModal.action === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-red-500 hover:bg-red-600"
                }`}
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
