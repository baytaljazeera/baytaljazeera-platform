"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  Users,
  TrendingUp,
  Star,
  Target,
  BarChart3,
  RefreshCw,
  Search,
  Mail,
  MessageSquare,
  UserCheck,
  Heart,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Clock,
  Send,
  Plus,
  Crown,
  Activity,
  UserPlus,
  UserX,
  Check,
  X,
  ExternalLink,
  Settings,
  Copy,
  Phone,
  ArrowUpRight,
  Gift,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface MarketingStats {
  clients: { total: number; active: number; withAds: number; satisfied: number };
  ratings: { average: number; total: number; distribution: Array<{ rating: number; count: number }>; satisfactionRate: number };
  listings: { total: number; active: number };
  upgrades: { total: number; byPlan: Array<{ name_ar: string; color: string; count: number }> };
  retention: { firstTimeSubscribers: number; renewedSubscribers: number; rate: number };
  monthlyNewClients: Array<{ month: string; count: number }>;
}

interface Segment {
  id: number;
  name: string;
  name_ar: string;
  description: string;
  color: string;
  icon: string;
  user_count: number;
}

interface CampaignUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  segments: string[];
}

interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  created_at: string;
}

interface WhatsappCampaign {
  id: number;
  name: string;
  message: string;
  total_recipients: number;
  success_count: number;
  status: string;
  created_at: string;
}

interface GoogleReviewSettings {
  google_review_link: string;
  google_place_id: string;
}

interface RetargetingData {
  inactiveClients: Array<{ id: string; name: string; email: string; phone?: string; last_listing_date: string | null; total_listings: number }>;
  expiredSubscriptions: Array<{ id: string; name: string; email: string; phone?: string; last_plan: string; expires_at: string }>;
  lowSatisfaction: Array<{ id: string; name: string; email: string; rating: number; feedback: string; created_at: string }>;
}

export default function MarketingPage() {
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [users, setUsers] = useState<CampaignUser[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([]);
  const [whatsappCampaigns, setWhatsappCampaigns] = useState<WhatsappCampaign[]>([]);
  const [retargeting, setRetargeting] = useState<RetargetingData | null>(null);
  const [googleSettings, setGoogleSettings] = useState<GoogleReviewSettings>({ google_review_link: "", google_place_id: "" });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "segments" | "email" | "whatsapp" | "google" | "retargeting">("overview");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchStats(),
      fetchSegments(),
      fetchUsers(),
      fetchEmailCampaigns(),
      fetchWhatsappCampaigns(),
      fetchRetargeting(),
      fetchGoogleSettings(),
    ]);
    setLoading(false);
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/marketing/stats", { credentials: "include" });
      if (res.ok) setStats(await res.json());
    } catch (err) { console.error(err); }
  }

  async function fetchSegments() {
    try {
      const res = await fetch("/api/marketing/segments", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSegments(data.segments || []);
      }
    } catch (err) { console.error(err); }
  }

  async function fetchUsers(segmentId?: number) {
    try {
      let url: string;
      if (segmentId) {
        url = `/api/marketing/segments/${segmentId}/users?limit=100`;
      } else {
        url = "/api/marketing/users-for-campaign?limit=100";
      }
      if (searchQuery) url += `&search=${searchQuery}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) { console.error(err); }
  }

  async function fetchEmailCampaigns() {
    try {
      const res = await fetch("/api/marketing/email-campaigns", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEmailCampaigns(data.campaigns || []);
      }
    } catch (err) { console.error(err); }
  }

  async function fetchWhatsappCampaigns() {
    try {
      const res = await fetch("/api/whatsapp/campaigns", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setWhatsappCampaigns(data.campaigns || []);
      }
    } catch (err) { console.error(err); }
  }

  async function fetchRetargeting() {
    try {
      const res = await fetch("/api/marketing/retargeting", { credentials: "include" });
      if (res.ok) setRetargeting(await res.json());
    } catch (err) { console.error(err); }
  }

  async function fetchGoogleSettings() {
    try {
      const res = await fetch("/api/marketing/google-review/settings", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setGoogleSettings(data.settings || { google_review_link: "", google_place_id: "" });
      }
    } catch (err) { console.error(err); }
  }

  async function autoAssignSegments() {
    try {
      const res = await fetch("/api/marketing/segments/auto-assign", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: "success", text: data.message });
        fetchSegments();
      }
    } catch (err) {
      setMessage({ type: "error", text: "خطأ في التصنيف التلقائي" });
    }
  }

  async function updateGoogleSettings() {
    try {
      const res = await fetch("/api/marketing/google-review/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(googleSettings),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "تم حفظ رابط التقييم" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "خطأ في الحفظ" });
    }
  }

  async function sendGoogleReviewRequest() {
    if (selectedUsers.length === 0) {
      setMessage({ type: "error", text: "اختر عملاء أولاً" });
      return;
    }
    try {
      const res = await fetch("/api/marketing/google-review/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userIds: selectedUsers }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: "success", text: data.message });
        setSelectedUsers([]);
      }
    } catch (err) {
      setMessage({ type: "error", text: "خطأ في الإرسال" });
    }
  }

  function toggleUserSelection(userId: string) {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  function selectAllUsers() {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(u => u.id));
    }
  }

  const segmentIcons: Record<string, typeof Crown> = {
    crown: Crown,
    activity: Activity,
    "user-plus": UserPlus,
    clock: Clock,
    "user-x": UserX,
    users: Users,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">التسويق والدعاية</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة الحملات وتصنيف العملاء والعروض الترويجية</p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#003d5c] transition"
        >
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      {/* بطاقة العروض الترويجية - وصول سريع */}
      <Link href="/admin/marketing/promotions">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#D4AF37] via-[#B8860B] to-[#D4AF37] p-1 shadow-xl hover:shadow-2xl transition-all cursor-pointer group">
          <div className="relative rounded-xl bg-gradient-to-l from-[#002845] via-[#01375e] to-[#002845] px-6 py-5">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyMTIsMTc1LDU1LDAuMDgpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50"></div>
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] shadow-lg group-hover:scale-110 transition-transform">
                  <Gift className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                    إدارة العروض الترويجية
                  </h2>
                  <p className="text-[#D4AF37] mt-1">
                    إنشاء وتحرير العروض - تجربة مجانية - خصومات - باقات مجانية
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl border border-[#D4AF37]/30">
                  <span className="text-sm text-white/80">تحكم كامل بالعروض</span>
                </div>
                <ArrowUpRight className="w-8 h-8 text-[#D4AF37] group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      </Link>

      {message.text && (
        <div className={`p-4 rounded-xl flex items-center gap-2 ${
          message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.type === "success" ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          {message.text}
          <button onClick={() => setMessage({ type: "", text: "" })} className="mr-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {[
          { id: "overview", label: "نظرة عامة", icon: BarChart3 },
          { id: "segments", label: "تصنيف العملاء", icon: Users },
          { id: "email", label: "حملات الإيميل", icon: Mail },
          { id: "whatsapp", label: "واتساب", icon: MessageSquare },
          { id: "google", label: "تقييم Google", icon: Star },
          { id: "retargeting", label: "إعادة الاستهداف", icon: Target },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition whitespace-nowrap ${
              activeTab === tab.id
                ? "border-[#D4AF37] text-[#D4AF37] font-bold"
                : "border-transparent text-gray-500 hover:text-[#002845]"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="إجمالي العملاء" value={stats.clients.total} color="blue" />
            <StatCard icon={UserCheck} label="عملاء نشطون" value={stats.clients.active} color="green" subtext="لديهم إعلانات نشطة" />
            <StatCard icon={Heart} label="عملاء راضون" value={stats.clients.satisfied} color="pink" subtext="تقييم 4+ نجوم" />
            <StatCard icon={Star} label="متوسط التقييم" value={stats.ratings.average} color="gold" subtext={`${stats.ratings.total} تقييم`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-[#002845] mb-4">توزيع التقييمات</h3>
              <div className="space-y-3">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const data = stats.ratings.distribution.find((r) => r.rating === rating);
                  const count = parseInt(String(data?.count)) || 0;
                  const percentage = stats.ratings.total > 0 ? (count / stats.ratings.total) * 100 : 0;
                  return (
                    <div key={rating} className="flex items-center gap-3">
                      <div className="flex items-center gap-1 w-20">
                        <span className="text-sm font-bold">{rating}</span>
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      </div>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="text-sm text-gray-500 w-12">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-[#002845] mb-4">تصنيفات العملاء</h3>
              <div className="space-y-3">
                {segments.map((segment) => {
                  const Icon = segmentIcons[segment.icon] || Users;
                  return (
                    <div key={segment.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: `${segment.color}20` }}>
                        <Icon className="w-5 h-5" style={{ color: segment.color }} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-[#002845]">{segment.name_ar}</p>
                        <p className="text-xs text-gray-500">{segment.description}</p>
                      </div>
                      <span className="font-bold text-lg" style={{ color: segment.color }}>
                        {segment.user_count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "segments" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#002845]">تصنيفات العملاء</h2>
            <button
              onClick={autoAssignSegments}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-amber-500 text-white rounded-xl hover:from-[#c4a030] hover:to-amber-600 transition"
            >
              <RefreshCw className="w-4 h-4" />
              تصنيف تلقائي
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {segments.map((segment) => {
              const Icon = segmentIcons[segment.icon] || Users;
              return (
                <div
                  key={segment.id}
                  onClick={() => {
                    setSelectedSegment(segment.id);
                    fetchUsers(segment.id);
                  }}
                  className={`bg-white rounded-2xl p-6 shadow-sm border-2 cursor-pointer transition hover:shadow-md ${
                    selectedSegment === segment.id ? "border-[#D4AF37]" : "border-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-xl" style={{ backgroundColor: `${segment.color}20` }}>
                      <Icon className="w-6 h-6" style={{ color: segment.color }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#002845]">{segment.name_ar}</h3>
                      <p className="text-xs text-gray-500">{segment.description}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-4xl font-bold" style={{ color: segment.color }}>
                      {segment.user_count}
                    </span>
                    <p className="text-sm text-gray-500">عميل</p>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedSegment && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#002845]">
                  عملاء: {segments.find(s => s.id === selectedSegment)?.name_ar}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowEmailModal(true)}
                    disabled={selectedUsers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl disabled:opacity-50"
                  >
                    <Mail className="w-4 h-4" />
                    إرسال إيميل ({selectedUsers.length})
                  </button>
                  <button
                    onClick={() => setShowWhatsappModal(true)}
                    disabled={selectedUsers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4" />
                    واتساب ({selectedUsers.length})
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-3 text-right">
                        <input
                          type="checkbox"
                          checked={selectedUsers.length === users.length && users.length > 0}
                          onChange={selectAllUsers}
                          className="w-4 h-4 rounded"
                        />
                      </th>
                      <th className="p-3 text-right text-sm font-bold text-gray-600">الاسم</th>
                      <th className="p-3 text-right text-sm font-bold text-gray-600">التواصل</th>
                      <th className="p-3 text-center text-sm font-bold text-gray-600">الباقة</th>
                      <th className="p-3 text-center text-sm font-bold text-gray-600">العقارات</th>
                      <th className="p-3 text-center text-sm font-bold text-gray-600">آخر دخول</th>
                      <th className="p-3 text-center text-sm font-bold text-gray-600">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user: any) => (
                      <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={() => toggleUserSelection(user.id)}
                            className="w-4 h-4 rounded"
                          />
                        </td>
                        <td className="p-3">
                          <p className="font-medium text-[#002845]">{user.name || "بدون اسم"}</p>
                          <p className="text-xs text-gray-400">دخول: {user.login_count || 0} مرة</p>
                        </td>
                        <td className="p-3">
                          <p className="text-sm text-gray-600">{user.email || "-"}</p>
                          <p className="text-xs text-gray-400">{user.phone || user.whatsapp || "-"}</p>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs">
                            {user.current_plan || "بدون باقة"}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-bold text-[#002845]">{user.active_listings || 0}</span>
                          <span className="text-gray-400 text-xs"> / {user.listings_count || 0}</span>
                        </td>
                        <td className="p-3 text-center text-xs text-gray-500">
                          {user.last_login_at 
                            ? new Date(user.last_login_at).toLocaleDateString("ar-SA")
                            : "لم يسجل دخول"}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-lg text-xs ${
                            user.activity_status === "نشط جداً" ? "bg-green-100 text-green-700" :
                            user.activity_status === "نشط" ? "bg-blue-100 text-blue-700" :
                            user.activity_status === "غير نشط" ? "bg-amber-100 text-amber-700" :
                            user.activity_status === "متوقف" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-500"
                          }`}>
                            {user.activity_status || "غير معروف"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "email" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#002845]">حملات الإيميل</h2>
            <button
              onClick={() => setShowEmailModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl"
            >
              <Plus className="w-4 h-4" />
              حملة جديدة
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right text-sm font-bold text-gray-600">الحملة</th>
                  <th className="p-4 text-center text-sm font-bold text-gray-600">المستلمين</th>
                  <th className="p-4 text-center text-sm font-bold text-gray-600">المرسل</th>
                  <th className="p-4 text-center text-sm font-bold text-gray-600">الحالة</th>
                  <th className="p-4 text-center text-sm font-bold text-gray-600">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {emailCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">
                      لا توجد حملات بعد
                    </td>
                  </tr>
                ) : (
                  emailCampaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-4">
                        <p className="font-medium text-[#002845]">{campaign.name}</p>
                        <p className="text-xs text-gray-500">{campaign.subject}</p>
                      </td>
                      <td className="p-4 text-center">{campaign.total_recipients}</td>
                      <td className="p-4 text-center">{campaign.sent_count}</td>
                      <td className="p-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          campaign.status === "sent" ? "bg-green-100 text-green-700" :
                          campaign.status === "draft" ? "bg-gray-100 text-gray-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {campaign.status === "sent" ? "مرسل" : campaign.status === "draft" ? "مسودة" : "قيد الإرسال"}
                        </span>
                      </td>
                      <td className="p-4 text-center text-sm text-gray-500">
                        {new Date(campaign.created_at).toLocaleDateString("ar-SA")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "whatsapp" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="w-8 h-8" />
              <h2 className="text-xl font-bold">رسائل واتساب</h2>
            </div>
            <p className="text-white/80">أرسل رسائل تذكير وتسويقية عبر واتساب</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-[#002845] mb-4">إرسال رسالة سريعة</h3>
              <QuickWhatsappForm segments={segments} onSuccess={() => { fetchWhatsappCampaigns(); setMessage({ type: "success", text: "تم إرسال الرسائل" }); }} />
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-[#002845] mb-4">آخر الحملات</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {whatsappCampaigns.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">لا توجد حملات</p>
                ) : (
                  whatsappCampaigns.slice(0, 10).map((campaign) => (
                    <div key={campaign.id} className="p-3 bg-gray-50 rounded-xl">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-sm">{campaign.name}</p>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          campaign.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {campaign.success_count}/{campaign.total_recipients}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{campaign.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "google" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Star className="w-8 h-8" />
              <h2 className="text-xl font-bold">تقييم Google</h2>
            </div>
            <p className="text-white/80">أرسل طلبات تقييم لعملائك الراضين</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-gray-500" />
                <h3 className="font-bold text-[#002845]">إعدادات رابط التقييم</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    رابط تقييم Google
                  </label>
                  <input
                    type="url"
                    value={googleSettings.google_review_link}
                    onChange={(e) => setGoogleSettings(prev => ({ ...prev, google_review_link: e.target.value }))}
                    placeholder="https://g.page/r/..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37]"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    يمكنك الحصول عليه من Google Business Profile
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Place ID (اختياري)
                  </label>
                  <input
                    type="text"
                    value={googleSettings.google_place_id}
                    onChange={(e) => setGoogleSettings(prev => ({ ...prev, google_place_id: e.target.value }))}
                    placeholder="ChIJ..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <button
                  onClick={updateGoogleSettings}
                  className="w-full px-4 py-3 bg-[#002845] text-white rounded-xl font-bold hover:bg-[#003d5c] transition"
                >
                  حفظ الإعدادات
                </button>
              </div>

              {googleSettings.google_review_link && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-600 mb-2">رابط صفحة التقييم الداخلية:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white p-2 rounded border">/rate</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/rate`)}
                      className="p-2 bg-white border rounded-lg hover:bg-gray-100"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-[#002845] mb-4">إرسال طلب تقييم</h3>
              
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="بحث عن عميل..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); fetchUsers(); }}
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {segments.map((segment) => (
                    <button
                      key={segment.id}
                      onClick={() => { setSelectedSegment(segment.id); fetchUsers(segment.id); }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                        selectedSegment === segment.id
                          ? "text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                      style={selectedSegment === segment.id ? { backgroundColor: segment.color } : {}}
                    >
                      {segment.name_ar}
                    </button>
                  ))}
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-xl p-2">
                  {users.slice(0, 20).map((user) => (
                    <label key={user.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="w-4 h-4 rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{user.name || "بدون اسم"}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  onClick={sendGoogleReviewRequest}
                  disabled={selectedUsers.length === 0 || !googleSettings.google_review_link}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                  إرسال طلب التقييم ({selectedUsers.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "retargeting" && retargeting && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Target className="w-8 h-8" />
              <h2 className="text-xl font-bold">إعادة الاستهداف</h2>
            </div>
            <p className="text-white/80">قوائم العملاء الذين يحتاجون متابعة</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <RetargetingCard
              title="عملاء غير نشطين"
              subtitle="لم ينشروا إعلان منذ 30 يوم"
              icon={Clock}
              color="orange"
              clients={retargeting.inactiveClients}
              onSendEmail={(ids) => { setSelectedUsers(ids); setShowEmailModal(true); }}
              onSendWhatsapp={(ids) => { setSelectedUsers(ids); setShowWhatsappModal(true); }}
            />
            <RetargetingCard
              title="اشتراكات منتهية"
              subtitle="انتهت خلال آخر 30 يوم"
              icon={AlertCircle}
              color="yellow"
              clients={retargeting.expiredSubscriptions}
              onSendEmail={(ids) => { setSelectedUsers(ids); setShowEmailModal(true); }}
              onSendWhatsapp={(ids) => { setSelectedUsers(ids); setShowWhatsappModal(true); }}
            />
            <RetargetingCard
              title="تقييمات سلبية"
              subtitle="تقييم 2 نجمة أو أقل"
              icon={ThumbsDown}
              color="red"
              clients={retargeting.lowSatisfaction}
              onSendEmail={(ids) => { setSelectedUsers(ids); setShowEmailModal(true); }}
              onSendWhatsapp={(ids) => { setSelectedUsers(ids); setShowWhatsappModal(true); }}
            />
          </div>
        </div>
      )}

      {showEmailModal && (
        <EmailModal
          selectedUsers={selectedUsers}
          onClose={() => setShowEmailModal(false)}
          onSuccess={() => { setShowEmailModal(false); fetchEmailCampaigns(); setMessage({ type: "success", text: "تم إرسال الحملة" }); }}
        />
      )}

      {showWhatsappModal && (
        <WhatsappModal
          selectedUsers={selectedUsers}
          users={users.filter(u => selectedUsers.includes(u.id))}
          onClose={() => setShowWhatsappModal(false)}
          onSuccess={() => { setShowWhatsappModal(false); fetchWhatsappCampaigns(); setMessage({ type: "success", text: "تم إرسال الرسائل" }); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, subtext }: { icon: typeof Users; label: string; value: string | number; color: "blue" | "green" | "pink" | "gold"; subtext?: string }) {
  const colors = { blue: "bg-blue-100 text-blue-600", green: "bg-green-100 text-green-600", pink: "bg-pink-100 text-pink-600", gold: "bg-[#D4AF37]/20 text-[#D4AF37]" };
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl ${colors[color]}`}><Icon className="w-5 h-5" /></div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#002845]">{value}</p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}

function RetargetingCard({ title, subtitle, icon: Icon, color, clients, onSendEmail, onSendWhatsapp }: { title: string; subtitle: string; icon: typeof Clock; color: string; clients: any[]; onSendEmail: (ids: string[]) => void; onSendWhatsapp: (ids: string[]) => void }) {
  const colorClasses: Record<string, string> = { orange: "bg-orange-100 text-orange-600", yellow: "bg-yellow-100 text-yellow-600", red: "bg-red-100 text-red-600" };
  const ids = clients.map(c => c.id);
  
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-xl ${colorClasses[color]}`}><Icon className="w-5 h-5" /></div>
        <div>
          <h3 className="font-bold text-[#002845]">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
        {clients.length === 0 ? (
          <p className="text-center text-gray-400 py-4">لا يوجد</p>
        ) : (
          clients.slice(0, 8).map((client) => (
            <div key={client.id} className="p-2 bg-gray-50 rounded-lg">
              <p className="font-medium text-sm">{client.name || "بدون اسم"}</p>
              <p className="text-xs text-gray-500">{client.email}</p>
            </div>
          ))
        )}
      </div>
      {clients.length > 0 && (
        <div className="flex gap-2">
          <button onClick={() => onSendEmail(ids)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm">
            <Mail className="w-4 h-4" />
            إيميل
          </button>
          <button onClick={() => onSendWhatsapp(ids)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg text-sm">
            <Phone className="w-4 h-4" />
            واتساب
          </button>
        </div>
      )}
    </div>
  );
}

function QuickWhatsappForm({ segments, onSuccess }: { segments: Segment[]; onSuccess: () => void }) {
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!selectedSegment || !message) return;
    setLoading(true);
    try {
      const usersRes = await fetch(`/api/marketing/segments/${selectedSegment}/users?limit=100`, { credentials: "include" });
      const usersData = await usersRes.json();
      const recipients = usersData.users?.filter((u: any) => u.phone || u.whatsapp).map((u: any) => ({ userId: u.id, phone: u.whatsapp || u.phone })) || [];
      
      if (recipients.length === 0) {
        alert("لا يوجد عملاء بأرقام هواتف");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/whatsapp/send-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipients, message, campaign_name: campaignName || "حملة واتساب" }),
      });

      if (res.ok) {
        onSuccess();
        setMessage("");
        setCampaignName("");
        setSelectedSegment(null);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">اسم الحملة</label>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="حملة تذكير..."
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">تصنيف العملاء</label>
        <select
          value={selectedSegment || ""}
          onChange={(e) => setSelectedSegment(Number(e.target.value) || null)}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500"
        >
          <option value="">اختر تصنيف...</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>{s.name_ar} ({s.user_count})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">الرسالة</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="مرحباً {name}، نفتقدك في بيت الجزيرة..."
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500 resize-none"
        />
      </div>
      <button
        onClick={handleSend}
        disabled={loading || !selectedSegment || !message}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl font-bold disabled:opacity-50"
      >
        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        إرسال
      </button>
    </div>
  );
}

function EmailModal({ selectedUsers, onClose, onSuccess }: { selectedUsers: string[]; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!name || !subject || !content) return;
    setLoading(true);
    try {
      const campaignRes = await fetch("/api/marketing/email-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, subject, content }),
      });
      
      if (campaignRes.ok) {
        const campaignData = await campaignRes.json();
        await fetch(`/api/marketing/email-campaigns/${campaignData.campaign.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ recipientIds: selectedUsers }),
        });
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#002845]">إرسال إيميل</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-700 text-sm">
            سيتم الإرسال إلى {selectedUsers.length} مستلم
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">اسم الحملة</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="حملة ترحيبية..." className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">عنوان الإيميل</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مرحباً بك في بيت الجزيرة" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">محتوى الرسالة</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="محتوى الإيميل..." className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37] resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50">إلغاء</button>
            <button onClick={handleSend} disabled={loading || !name || !subject || !content} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#002845] text-white rounded-xl font-bold disabled:opacity-50">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              إرسال
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsappModal({ selectedUsers, users, onClose, onSuccess }: { selectedUsers: string[]; users: CampaignUser[]; onClose: () => void; onSuccess: () => void }) {
  const [message, setMessage] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!message) return;
    setLoading(true);
    try {
      const recipients = users.filter(u => u.phone || u.whatsapp).map(u => ({ userId: u.id, phone: u.whatsapp || u.phone }));
      
      if (recipients.length === 0) {
        alert("لا يوجد عملاء بأرقام هواتف");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/whatsapp/send-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipients, message, campaign_name: campaignName || "حملة واتساب" }),
      });

      if (res.ok) {
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#002845]">إرسال واتساب</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="p-3 bg-green-50 rounded-xl text-green-700 text-sm">
            سيتم الإرسال إلى {users.filter(u => u.phone || u.whatsapp).length} من أصل {selectedUsers.length} (من لديهم أرقام)
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">اسم الحملة</label>
            <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="حملة تذكير..." className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الرسالة</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="مرحباً، نود تذكيرك..." className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500 resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50">إلغاء</button>
            <button onClick={handleSend} disabled={loading || !message} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl font-bold disabled:opacity-50">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              إرسال
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
