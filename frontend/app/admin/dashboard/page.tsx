"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  AlertCircle,
  TrendingUp,
  CheckCircle,
  Clock,
  RefreshCw,
  Loader2,
  Crown,
  MapPin,
  CreditCard,
  Building2,
  BarChart3,
  PieChart as PieChartIcon,
  Wallet,
  Star,
  Home,
  Activity,
  Calendar
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://baytaljazeera-backend.onrender.com';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend
} from "recharts";

interface DashboardStats {
  totalListings: number;
  activeUsers: number;
  newReports: number;
  pendingListings: number;
}

interface AdvancedStats {
  listings: {
    total: number;
    approved: number;
    pending: number;
    new_this_week: number;
    new_this_month: number;
  };
  elite: {
    active_slots: number;
    pending_approval: number;
    pending_payment: number;
    unique_properties: number;
  };
  cities: { city: string; count: number }[];
  subscriptions: {
    total_subscriptions: number;
    active: number;
    business: number;
    premium: number;
    basic: number;
  };
  revenue: {
    total_revenue: number;
    this_month: number;
    this_week: number;
    total_transactions: number;
  };
  weeklyListings: { day: string; count: number }[];
  propertyTypes: { property_type: string; count: number }[];
}

interface ActivityItem {
  id: string;
  type: string;
  text: string;
  time: string;
}

const SUBSCRIPTION_COLORS = ["#D4AF37", "#8B5CF6", "#64748B"];
const CITY_COLORS = ["#002845", "#01456d", "#D4AF37", "#10B981", "#8B5CF6", "#F59E0B"];
const PROPERTY_TYPE_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];
const AMBASSADOR_COLORS = ["#D4AF37", "#10B981"];

interface AmbassadorStats {
  active_ambassadors: number;
  pending_requests: number;
  consumptions_today: number;
  total_referrals: number;
  total_floors_consumed: number;
}

interface AmbassadorChartData {
  date: string;
  referrals: number;
  consumptions: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalListings: 0,
    activeUsers: 0,
    newReports: 0,
    pendingListings: 0
  });
  const [advancedStats, setAdvancedStats] = useState<AdvancedStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [ambassadorStats, setAmbassadorStats] = useState<AmbassadorStats | null>(null);
  const [ambassadorChartData, setAmbassadorChartData] = useState<AmbassadorChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("جاري التحميل...");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [listingsRes, usersRes, complaintsRes, notificationsRes, advancedRes, ambassadorRes, ambassadorChartRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/listings/stats`, { credentials: `include", headers }),
        fetch(`${API_URL}/api/admin/users/stats`, { credentials: `include", headers }),
        fetch(`${API_URL}/api/admin/complaints/stats`, { credentials: `include", headers }),
        fetch(`${API_URL}/api/notifications/recent`, { credentials: `include", headers }),
        fetch(`${API_URL}/api/admin/dashboard/advanced-stats`, { credentials: `include", headers }),
        fetch(`${API_URL}/api/ambassador/admin/stats`, { credentials: `include", headers }),
        fetch(`${API_URL}/api/ambassador/admin/chart-data?days=14`, { credentials: `include", headers })
      ]);

      let totalListings = 0, pendingListings = 0;
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        totalListings = data.total || 0;
        pendingListings = data.pending || 0;
      }

      let activeUsers = 0;
      if (usersRes.ok) {
        const data = await usersRes.json();
        activeUsers = data.total || data.active || 0;
      }

      let newReports = 0;
      if (complaintsRes.ok) {
        const data = await complaintsRes.json();
        newReports = data.new || data.pending || 0;
      }

      let recentActivities: ActivityItem[] = [];
      if (notificationsRes.ok) {
        const data = await notificationsRes.json();
        recentActivities = (data.notifications || []).slice(0, 4).map((n: any, i: number) => ({
          id: n.id || i,
          type: n.type || "general",
          text: n.title || n.body || "نشاط جديد",
          time: formatTimeAgo(n.created_at)
        }));
      }

      if (advancedRes.ok) {
        const data = await advancedRes.json();
        setAdvancedStats(data);
      }

      if (ambassadorRes.ok) {
        const data = await ambassadorRes.json();
        setAmbassadorStats(data.stats);
      }

      if (ambassadorChartRes.ok) {
        const data = await ambassadorChartRes.json();
        setAmbassadorChartData(data);
      }

      setStats({
        totalListings,
        activeUsers,
        newReports,
        pendingListings
      });
      setActivities(recentActivities);
      setLastUpdate(new Date().toLocaleTimeString("ar-SA"));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return "الآن";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    return `منذ ${diffDays} يوم`;
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)} مليون`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)} ألف`;
    }
    return amount.toLocaleString("en-US");
  };

  const formatDay = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return days[date.getDay()];
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const statsConfig = [
    { label: "إجمالي الإعلانات", value: stats.totalListings, icon: FileText, color: "from-blue-500 to-blue-600", bgColor: "bg-blue-50" },
    { label: "المستخدمون", value: stats.activeUsers, icon: Users, color: "from-emerald-500 to-emerald-600", bgColor: "bg-emerald-50" },
    { label: "شكاوى جديدة", value: stats.newReports, icon: AlertCircle, color: "from-amber-500 to-amber-600", bgColor: "bg-amber-50" },
    { label: "إعلانات معلقة", value: stats.pendingListings, icon: Clock, color: "from-purple-500 to-purple-600", bgColor: "bg-purple-50" },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "listing_approved":
      case "listing_created":
        return FileText;
      case "user_registered":
        return Users;
      case "complaint":
      case "report":
        return AlertCircle;
      default:
        return CheckCircle;
    }
  };

  const subscriptionChartData = [
    { name: "بزنس", value: advancedStats?.subscriptions?.business || 0 },
    { name: "بريميوم", value: advancedStats?.subscriptions?.premium || 0 },
    { name: "أساسي", value: advancedStats?.subscriptions?.basic || 0 },
  ].filter(d => d.value > 0);

  const weeklyChartData = (advancedStats?.weeklyListings || []).map(item => ({
    name: formatDay(item.day),
    count: item.count
  }));

  const cityChartData = (advancedStats?.cities || []).map(city => ({
    name: city.city,
    count: city.count
  }));

  const propertyTypeChartData = (advancedStats?.propertyTypes || []).map(type => ({
    name: type.property_type,
    value: type.count
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-mobile-2xl md:text-2xl font-black text-[#002845] flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 md:w-7 md:h-7 text-[#D4AF37]" />
            لوحة التحكم
          </h1>
          <p className="text-mobile-sm md:text-sm text-slate-500 mt-1">نظرة عامة شاملة على أداء المنصة</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <button 
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-2 min-h-[48px] px-4 md:px-4 py-3 md:py-2.5 bg-gradient-to-r from-[#002845] to-[#01456d] text-white rounded-xl hover:shadow-lg active:scale-95 transition disabled:opacity-50 text-mobile-sm md:text-sm font-medium touch-manipulation"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            تحديث البيانات
          </button>
          <div className="text-right bg-white px-3 md:px-4 py-2.5 md:py-2 rounded-xl border border-slate-200">
            <p className="text-xs md:text-xs text-slate-500">آخر تحديث</p>
            <p className="text-sm md:text-sm font-bold text-[#002845]">{lastUpdate}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statsConfig.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#D4AF37]/30 transition-all duration-300">
              <div className="flex items-start justify-between mb-3 md:mb-3">
                <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg shrink-0`}>
                  <Icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div className={`px-2.5 py-1.5 md:px-2 md:py-1 rounded-lg text-xs md:text-xs font-medium ${stat.bgColor} text-slate-600 shrink-0`}>
                  <TrendingUp className="w-3.5 h-3.5 md:w-3 md:h-3 inline ml-1" />
                  مباشر
                </div>
              </div>
              <p className="text-mobile-2xl md:text-3xl font-black text-[#002845]">
                {loading ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : stat.value.toLocaleString("en-US")}
              </p>
              <p className="text-mobile-sm md:text-sm text-slate-500 mt-1.5 md:mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-gradient-to-br from-[#002845] to-[#01456d] rounded-2xl p-4 md:p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="font-bold text-base md:text-lg flex items-center gap-2">
              <Crown className="w-5 h-5 md:w-5 md:h-5 text-[#D4AF37]" />
              إحصائيات النخبة
            </h2>
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 md:w-5 md:h-5 text-[#D4AF37]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/10 rounded-xl p-3 md:p-4 backdrop-blur">
              <p className="text-2xl md:text-3xl font-black text-[#D4AF37]">{advancedStats?.elite?.active_slots || 0}</p>
              <p className="text-xs md:text-xs text-white/70 mt-1.5 md:mt-1">حجوزات نشطة</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 md:p-4 backdrop-blur">
              <p className="text-2xl md:text-3xl font-black text-amber-400">{advancedStats?.elite?.pending_approval || 0}</p>
              <p className="text-xs md:text-xs text-white/70 mt-1.5 md:mt-1">بانتظار الموافقة</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 md:p-4 backdrop-blur">
              <p className="text-2xl md:text-3xl font-black text-emerald-400">{advancedStats?.elite?.unique_properties || 0}</p>
              <p className="text-xs md:text-xs text-white/70 mt-1.5 md:mt-1">إعلانات مميزة</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 md:p-4 backdrop-blur">
              <p className="text-2xl md:text-3xl font-black text-blue-400">{advancedStats?.elite?.pending_payment || 0}</p>
              <p className="text-xs md:text-xs text-white/70 mt-1.5 md:mt-1">بانتظار الدفع</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base md:text-lg text-[#002845] flex items-center gap-2">
              <Wallet className="w-5 h-5 md:w-5 md:h-5 text-[#D4AF37]" />
              الإيرادات
            </h2>
            <span className="text-xs md:text-xs text-slate-500 bg-slate-100 px-2.5 py-1.5 md:px-2 md:py-1 rounded-lg shrink-0">ريال سعودي</span>
          </div>
          <div className="space-y-3 md:space-y-4">
            <div className="text-center p-4 md:p-4 bg-gradient-to-r from-emerald-50 to-emerald-100 rounded-xl">
              <p className="text-sm md:text-xs text-emerald-600 mb-1.5 md:mb-1">إجمالي الإيرادات</p>
              <p className="text-xl md:text-2xl font-black text-emerald-700">
                {formatCurrency(Number(advancedStats?.revenue?.total_revenue) || 0)} <span className="text-sm md:text-sm font-normal">ر.س</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 md:gap-3">
              <div className="p-3 md:p-3 bg-blue-50 rounded-xl text-center">
                <p className="text-base md:text-lg font-bold text-blue-700">{formatCurrency(Number(advancedStats?.revenue?.this_month) || 0)}</p>
                <p className="text-xs md:text-[10px] text-blue-600 mt-1">هذا الشهر</p>
              </div>
              <div className="p-3 md:p-3 bg-purple-50 rounded-xl text-center">
                <p className="text-base md:text-lg font-bold text-purple-700">{formatCurrency(Number(advancedStats?.revenue?.this_week) || 0)}</p>
                <p className="text-xs md:text-[10px] text-purple-600 mt-1">هذا الأسبوع</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 md:p-3 bg-slate-50 rounded-xl">
              <span className="text-sm md:text-sm text-slate-600">عدد المعاملات</span>
              <span className="text-base md:text-lg font-bold text-[#002845]">{advancedStats?.revenue?.total_transactions || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#002845] flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#D4AF37]" />
              الاشتراكات
            </h2>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
              {advancedStats?.subscriptions?.active || 0} نشط
            </span>
          </div>
          {mounted && subscriptionChartData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subscriptionChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {subscriptionChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={SUBSCRIPTION_COLORS[index % SUBSCRIPTION_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} اشتراك`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>لا توجد اشتراكات</p>
              </div>
            </div>
          )}
          <div className="flex justify-center gap-4 mt-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-[#D4AF37]"></div>
              <span className="text-xs text-slate-600">بزنس</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
              <span className="text-xs text-slate-600">بريميوم</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-[#64748B]"></div>
              <span className="text-xs text-slate-600">أساسي</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[#002845] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#D4AF37]" />
            سفراء البيت
          </h2>
          <a 
            href="/admin/ambassador" 
            className="text-xs text-[#D4AF37] hover:underline"
          >
            عرض الكل
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="p-3 bg-blue-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-blue-700">{ambassadorStats?.active_ambassadors || 0}</p>
            <p className="text-xs text-blue-600">سفير نشط</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-amber-700">{ambassadorStats?.pending_requests || 0}</p>
            <p className="text-xs text-amber-600">طلب معلق</p>
          </div>
          <div className="p-3 bg-green-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-green-700">{ambassadorStats?.consumptions_today || 0}</p>
            <p className="text-xs text-green-600">استهلاك اليوم</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-purple-700">{ambassadorStats?.total_referrals || 0}</p>
            <p className="text-xs text-purple-600">إجمالي الإحالات</p>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-rose-700">{ambassadorStats?.total_floors_consumed || 0}</p>
            <p className="text-xs text-rose-600">طابق مستهلك</p>
          </div>
        </div>
        {mounted && ambassadorChartData.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ambassadorChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value: string) => new Date(value).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value: string | number) => new Date(String(value)).toLocaleDateString("ar-SA")}
                />
                <Legend formatter={(value: string) => value === "referrals" ? "الإحالات" : "الاستهلاكات"} />
                <Line 
                  type="monotone" 
                  dataKey="referrals" 
                  stroke="#D4AF37" 
                  strokeWidth={2}
                  dot={{ fill: "#D4AF37", r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="consumptions" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  dot={{ fill: "#10B981", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <Building2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>لا توجد بيانات كافية للرسم البياني</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#002845] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#D4AF37]" />
              الإعلانات خلال الأسبوع
            </h2>
            <Activity className="w-5 h-5 text-slate-400" />
          </div>
          {mounted && weeklyChartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorListings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${value} إعلان`, "الإعلانات"]} />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#D4AF37" 
                    strokeWidth={2}
                    fill="url(#colorListings)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>لا توجد إعلانات هذا الأسبوع</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#002845] flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#D4AF37]" />
              توزيع الإعلانات حسب المدينة
            </h2>
            <BarChart3 className="w-5 h-5 text-slate-400" />
          </div>
          {mounted && cityChartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cityChartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(value) => [`${value} إعلان`, "العدد"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {cityChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CITY_COLORS[index % CITY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <MapPin className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>لا توجد بيانات</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#002845] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#D4AF37]" />
              أنواع العقارات
            </h2>
            <PieChartIcon className="w-5 h-5 text-slate-400" />
          </div>
          {mounted && propertyTypeChartData.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={propertyTypeChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                  >
                    {propertyTypeChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PROPERTY_TYPE_COLORS[index % PROPERTY_TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} عقار`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Building2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>لا توجد بيانات</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#002845] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
              إحصائيات الإعلانات
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl text-center">
              <p className="text-2xl font-black text-blue-600">{advancedStats?.listings?.new_this_week || 0}</p>
              <p className="text-xs text-blue-600 mt-1">جديد هذا الأسبوع</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl text-center">
              <p className="text-2xl font-black text-emerald-600">{advancedStats?.listings?.new_this_month || 0}</p>
              <p className="text-xs text-emerald-600 mt-1">جديد هذا الشهر</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl text-center">
              <p className="text-2xl font-black text-purple-600">{advancedStats?.listings?.approved || 0}</p>
              <p className="text-xs text-purple-600 mt-1">إعلانات معتمدة</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl text-center">
              <p className="text-2xl font-black text-amber-600">{advancedStats?.listings?.pending || 0}</p>
              <p className="text-xs text-amber-600 mt-1">بانتظار المراجعة</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#002845] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#D4AF37]" />
              النشاط الأخير
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-3">آخر الإشعارات والأحداث على المنصة</p>
          <div className="space-y-2">
            {activities.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا يوجد نشاط حديث</p>
                <p className="text-xs mt-1">ستظهر هنا الإشعارات الجديدة</p>
              </div>
            ) : (
              activities.map((activity) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <div key={activity.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#002845] to-[#01456d] flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#002845] truncate">{activity.text}</p>
                      <p className="text-[10px] text-slate-500">{activity.time}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
