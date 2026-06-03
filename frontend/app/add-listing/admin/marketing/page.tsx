"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";
import { alertDialog } from "@/components/ui/ConfirmDialog";

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
  Zap,
  Timer,
  Radio,
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

interface WaCustomer {
  phone: string;
  last_inbound_at: string | null;
  last_snippet: string;
  window_status: "OPEN" | "CLOSED";
  remaining_seconds: number;
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
  const [waSubTab, setWaSubTab] = useState<"radar" | "templates">("radar");
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
      const res = await fetch(`${API_URL}/api/marketing/stats`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) setStats(await res.json());
    } catch (err) { console.error(err); }
  }

  async function fetchSegments() {
    try {
      const res = await fetch(`${API_URL}/api/marketing/segments`, { credentials: "include", headers: getAuthHeaders() });
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
      const res = await fetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) { console.error(err); }
  }

  async function fetchEmailCampaigns() {
    try {
      const res = await fetch(`${API_URL}/api/marketing/email-campaigns`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEmailCampaigns(data.campaigns || []);
      }
    } catch (err) { console.error(err); }
  }

  async function fetchWhatsappCampaigns() {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/campaigns`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWhatsappCampaigns(data.campaigns || []);
      }
    } catch (err) { console.error(err); }
  }

  async function fetchRetargeting() {
    try {
      const res = await fetch(`${API_URL}/api/marketing/retargeting`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) setRetargeting(await res.json());
    } catch (err) { console.error(err); }
  }

  async function fetchGoogleSettings() {
    try {
      const res = await fetch(`${API_URL}/api/marketing/google-review/settings`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setGoogleSettings(data.settings || { google_review_link: "", google_place_id: "" });
      }
    } catch (err) { console.error(err); }
  }

  async function autoAssignSegments() {
    try {
      const res = await fetch(`${API_URL}/api/marketing/segments/auto-assign`, {
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
      const res = await fetch(`${API_URL}/api/marketing/google-review/settings`, {
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
      const res = await fetch(`${API_URL}/api/marketing/google-review/send`, {
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
        <div className="space-y-5">
          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-[#002845] via-[#003d5c] to-emerald-800 rounded-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_#D4AF37_0%,_transparent_60%)]" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Radio className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <h2 className="text-xl font-bold">رادار الفرص الذكي</h2>
                </div>
                <p className="text-white/70 text-sm max-w-md">
                  استغل نافذة الـ 24 ساعة بذكاء — أرسل رسائل مخصصة بالذكاء الاصطناعي للعملاء النشطين.
                </p>
              </div>
              <Link
                href="/add-listing/admin/whatsapp"
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition"
              >
                <MessageSquare className="w-4 h-4" />
                صندوق الوارد
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* ── Sub-tabs ── */}
          <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit">
            {([
              { key: "radar", label: "رادار الفرص", icon: Radio },
              { key: "templates", label: "مُطلق القوالب", icon: Sparkles },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setWaSubTab(key)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition ${
                  waSubTab === key
                    ? "bg-[#002845] text-white shadow"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Smart Radar tab ── */}
          {waSubTab === "radar" && (
            <SmartRadar onSwitchToTemplates={() => setWaSubTab("templates")} />
          )}

          {/* ── Template Launcher tab ── */}
          {waSubTab === "templates" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-5">
                  <Sparkles className="w-5 h-5 text-green-500" />
                  <h3 className="font-bold text-[#002845]">إرسال قالب</h3>
                </div>
                <QuickWhatsappForm segments={segments} onSuccess={() => { fetchWhatsappCampaigns(); setMessage({ type: "success", text: "تم إرسال القالب بنجاح" }); }} />
              </div>

              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex-1">
                  <h3 className="font-bold text-[#002845] mb-4">آخر الحملات</h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {whatsappCampaigns.length === 0 ? (
                      <p className="text-center text-gray-400 py-4">لا توجد حملات</p>
                    ) : (
                      whatsappCampaigns.slice(0, 10).map((campaign) => (
                        <div key={campaign.id} className="p-3 bg-gray-50 rounded-xl">
                          <div className="flex justify-between items-start">
                            <p className="font-medium text-sm">{campaign.name}</p>
                            <span className={`px-2 py-1 rounded-full text-xs ${campaign.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
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

// ─── Hardcoded template definitions (mirrors backend WA_TEMPLATES) ────────────
const WA_TEMPLATES_FE = [
  {
    id: "hook_1",
    label: "رسالة استكشاف أولى",
    text: "مرحباً {{1}}، لاحظنا بحثك عن عقارات مؤخراً. لدينا عروض جديدة تناسبك، هل ترغب بالاطلاع عليها؟",
  },
  {
    id: "hook_2",
    label: "عرض حصري قبل النشر",
    text: "أهلاً {{1}}، تم إدراج عقار مميز في {{2}} قبل نشره للعامة. هل أنت مهتم بالتفاصيل؟",
  },
  {
    id: "hook_3",
    label: "تذكير بحث الإيجار",
    text: 'تذكير من بيت الجزيرة: هل ما زلت تبحث عن عقار للإيجار؟ أرسل "نعم" لمساعدتك.',
  },
];

function buildPreview(template: string, variables: string[]): string {
  let out = template;
  variables.forEach((v, i) => {
    out = out.replace(`{{${i + 1}}}`, v || `[المتغير ${i + 1}]`);
  });
  return out;
}

function countPlaceholders(template: string): number {
  const matches = template.match(/\{\{\d+\}\}/g);
  if (!matches) return 0;
  const indices = matches.map((m) => parseInt(m.replace(/\D/g, ""), 10));
  return Math.max(...indices);
}

function QuickWhatsappForm({ onSuccess }: { segments: Segment[]; onSuccess: () => void }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [variables, setVariables] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const template = WA_TEMPLATES_FE.find((t) => t.id === selectedTemplateId) ?? null;
  const varCount = template ? countPlaceholders(template.text) : 0;
  const preview = template ? buildPreview(template.text, variables) : "";

  function handleTemplateChange(id: string) {
    setSelectedTemplateId(id);
    setVariables([]);
  }

  function setVar(idx: number, val: string) {
    setVariables((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSend() {
    if (!template || !phone.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ phone: phone.trim(), templateId: selectedTemplateId, variables }),
      });

      if (res.ok) {
        showToast("تم إرسال القالب بنجاح. يمكنك متابعة رد العميل في صندوق الوارد.");
        setPhone("");
        setSelectedTemplateId("");
        setVariables([]);
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "حدث خطأ أثناء الإرسال");
      }
    } catch {
      showToast("تعذّر الاتصال بالخادم");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-5 relative">
      {/* Success / error toast */}
      {toast && (
        <div className="absolute -top-2 left-0 right-0 z-10 p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm text-center shadow">
          {toast}
        </div>
      )}

      {/* Phone number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          رقم الهاتف (مع رمز الدولة)
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+966501234567"
          dir="ltr"
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500 font-mono"
        />
      </div>

      {/* Template selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">اختر القالب</label>
        <select
          value={selectedTemplateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500 bg-white"
        >
          <option value="">— اختر قالباً —</option>
          {WA_TEMPLATES_FE.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Dynamic variable inputs */}
      {template && varCount > 0 && (
        <div className="space-y-3">
          {Array.from({ length: varCount }).map((_, i) => (
            <div key={i}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {i === 0 ? "المتغير الأول" : i === 1 ? "المتغير الثاني" : `المتغير ${i + 1}`}
              </label>
              <input
                type="text"
                value={variables[i] ?? ""}
                onChange={(e) => setVar(i, e.target.value)}
                placeholder={i === 0 ? "مثال: أحمد" : "مثال: الرياض"}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-green-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Live preview */}
      {template && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">معاينة مباشرة</p>
          <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm p-4 text-sm text-gray-800 leading-relaxed shadow-sm border border-green-100 min-h-[60px]" dir="rtl">
            {preview}
          </div>
          <p className="text-xs text-gray-400 mt-1 text-left">كما سيظهر في واتساب العميل</p>
        </div>
      )}

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={loading || !selectedTemplateId || !phone.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl font-bold disabled:opacity-50 hover:bg-green-600 transition"
      >
        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        إرسال
      </button>

      {/* Link to inbox */}
      {selectedTemplateId && (
        <p className="text-center text-xs text-gray-400">
          بعد الإرسال تابع ردود العملاء في{" "}
          <Link href="/add-listing/admin/whatsapp" className="text-green-600 underline font-medium">
            صندوق الوارد
          </Link>
        </p>
      )}
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
      const campaignRes = await fetch(`${API_URL}/api/marketing/email-campaigns`, {
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
        await alertDialog({
          title: "لا يوجد عملاء بأرقام هواتف",
          body: "لم نجد أي عميل لديه رقم جوال أو واتساب مسجّل في الفلتر الحالي.",
          variant: "warning",
        });
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/whatsapp/send-bulk`, {
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

// ─────────────────────────────────────────────────────────────────────────────
// Smart Opportunity Radar components
// ─────────────────────────────────────────────────────────────────────────────

function Countdown({ seconds: initialSeconds }: { seconds: number }) {
  const [secs, setSecs] = useState(initialSeconds);
  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (secs <= 0) return <span className="font-mono text-xs text-gray-400">00:00:00</span>;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const urgent = secs < 3600;
  return (
    <span className={`font-mono text-sm font-bold tabular-nums ${urgent ? "text-red-500" : "text-emerald-600"}`}>
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function CustomerCard({
  customer,
  selected,
  onToggleSelect,
  onAiSuggest,
  onSendTemplate,
}: {
  customer: WaCustomer;
  selected: boolean;
  onToggleSelect: (phone: string) => void;
  onAiSuggest: (phone: string) => void;
  onSendTemplate: () => void;
}) {
  const isOpen = customer.window_status === "OPEN";
  return (
    <div
      className={`relative bg-white rounded-2xl p-4 shadow-sm border transition-all ${
        isOpen
          ? selected
            ? "border-emerald-400 ring-2 ring-emerald-100 shadow-emerald-50"
            : "border-emerald-200 hover:border-emerald-300 hover:shadow-md"
          : "border-gray-100 opacity-70"
      }`}
    >
      {/* Checkbox for OPEN windows */}
      {isOpen && (
        <button
          onClick={() => onToggleSelect(customer.phone)}
          className={`absolute top-3 left-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
            selected ? "bg-emerald-500 border-emerald-500" : "border-gray-300 hover:border-emerald-400"
          }`}
        >
          {selected && <Check className="w-3 h-3 text-white" />}
        </button>
      )}

      {/* Status badge */}
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold mb-3 ${
        isOpen ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
        {isOpen ? "نافذة مفتوحة" : "نافذة مغلقة"}
      </div>

      {/* Phone */}
      <p className="font-mono text-sm text-[#002845] font-bold mb-1.5 truncate" dir="ltr">
        {customer.phone}
      </p>

      {/* Snippet */}
      <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed" dir="rtl">
        {customer.last_snippet}
      </p>

      {/* Countdown / closed notice */}
      {isOpen ? (
        <div className="flex items-center gap-1.5 mb-3 bg-emerald-50 rounded-lg px-2.5 py-1.5">
          <Timer className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs text-gray-500">متبقٍ:</span>
          <Countdown seconds={customer.remaining_seconds} />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mb-3 bg-gray-50 rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-[10px] text-gray-400">استخدم قالباً معتمداً للتواصل</span>
        </div>
      )}

      {/* Action button */}
      {isOpen ? (
        <button
          onClick={() => onAiSuggest(customer.phone)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#002845] to-[#003d5c] text-white text-xs font-bold rounded-xl hover:opacity-90 transition shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
          اقتراح ذكي بالـ AI
        </button>
      ) : (
        <button
          onClick={onSendTemplate}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 text-xs font-medium rounded-xl hover:bg-gray-50 transition"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          استخدم قالباً
        </button>
      )}
    </div>
  );
}

type AiModalState = { phone: string; suggestion: string; loading: boolean; sendLoading: boolean };
type BlastModalState = { suggestion: string; loading: boolean; sendLoading: boolean };

function SmartRadar({ onSwitchToTemplates }: { onSwitchToTemplates: () => void }) {
  const [customers, setCustomers] = useState<WaCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiModal, setAiModal] = useState<AiModalState | null>(null);
  const [blastModal, setBlastModal] = useState<BlastModalState | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4500);
  }

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/customers`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (res.ok) setCustomers((await res.json()).customers || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
    const id = setInterval(fetchCustomers, 60000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelect(phone: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  }

  function selectAllOpen() {
    setSelected(new Set(customers.filter((c) => c.window_status === "OPEN").map((c) => c.phone)));
  }

  async function requestAiSuggest(phone: string) {
    setAiModal({ phone, suggestion: "", loading: true, sendLoading: false });
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/ai-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      setAiModal((prev) => prev ? { ...prev, suggestion: data.suggestion || "", loading: false } : null);
    } catch {
      setAiModal((prev) => prev ? { ...prev, loading: false } : null);
      showToast("تعذّر الاتصال بخدمة الذكاء الاصطناعي", false);
    }
  }

  async function sendDirect(phone: string, message: string) {
    setAiModal((prev) => prev ? { ...prev, sendLoading: true } : null);
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ phone, message }),
      });
      if (res.ok) {
        showToast(`تم الإرسال إلى ${phone}`);
        setAiModal(null);
        fetchCustomers();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "فشل الإرسال", false);
        setAiModal((prev) => prev ? { ...prev, sendLoading: false } : null);
      }
    } catch {
      showToast("فشل الاتصال بالخادم", false);
      setAiModal((prev) => prev ? { ...prev, sendLoading: false } : null);
    }
  }

  async function startBlast() {
    setBlastModal({ suggestion: "", loading: true, sendLoading: false });
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/ai-blast-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
      });
      const data = await res.json();
      setBlastModal({ suggestion: data.suggestion || "", loading: false, sendLoading: false });
    } catch {
      setBlastModal(null);
      showToast("فشل توليد الرسالة الذكية", false);
    }
  }

  async function sendBlast(message: string) {
    setBlastModal((prev) => prev ? { ...prev, sendLoading: true } : null);
    const phones = Array.from(selected);
    let sent = 0;
    for (const phone of phones) {
      try {
        const res = await fetch(`${API_URL}/api/admin/whatsapp/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify({ phone, message }),
        });
        if (res.ok) sent++;
      } catch {}
    }
    showToast(`تم الإرسال إلى ${sent} من ${phones.length} عميل`);
    setBlastModal(null);
    setSelected(new Set());
    fetchCustomers();
  }

  const openCount = customers.filter((c) => c.window_status === "OPEN").length;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Toast notification */}
      {toast && (
        <div className={`p-3 rounded-xl text-sm text-center border ${
          toast.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {toast.text}
        </div>
      )}

      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl px-5 py-3.5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 font-bold text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {openCount} نافذة مفتوحة
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">{customers.length - openCount} مغلقة</span>
          {selected.size > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-[#002845] font-semibold">{selected.size} محدد</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllOpen}
            disabled={openCount === 0}
            className="text-xs px-3 py-1.5 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40 transition"
          >
            اختر كل المفتوحة ({openCount})
          </button>
          {selected.size > 0 && (
            <button
              onClick={startBlast}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-[#D4AF37] to-amber-500 text-white text-xs font-bold rounded-lg shadow hover:opacity-90 transition"
            >
              <Zap className="w-3.5 h-3.5" />
              إرسال ذكي ({selected.size})
            </button>
          )}
          <button onClick={fetchCustomers} className="p-1.5 text-gray-400 hover:text-gray-600 transition" title="تحديث">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Customer grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <Radio className="w-12 h-12 opacity-20" />
          <p className="text-sm">لا توجد بيانات عملاء بعد — ابدأ بتلقي رسائل واتساب</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {customers.map((c) => (
            <CustomerCard
              key={c.phone}
              customer={c}
              selected={selected.has(c.phone)}
              onToggleSelect={toggleSelect}
              onAiSuggest={requestAiSuggest}
              onSendTemplate={onSwitchToTemplates}
            />
          ))}
        </div>
      )}

      {/* ── AI Suggest Modal ── */}
      {aiModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-[#002845] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                اقتراح الذكاء الاصطناعي
              </h3>
              <button onClick={() => setAiModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4 font-mono" dir="ltr">{aiModal.phone}</p>
            {aiModal.loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/30 animate-ping" />
                  <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
                </div>
                <p className="text-sm text-gray-500">يحلل الذكاء الاصطناعي اهتمام العميل...</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2 font-semibold">الرسالة المقترحة:</p>
                <div
                  className="bg-[#dcf8c6] border border-green-100 rounded-2xl rounded-tr-sm p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-1 shadow-sm min-h-[80px]"
                  dir="rtl"
                >
                  {aiModal.suggestion || "لم يتمكن الذكاء الاصطناعي من توليد اقتراح."}
                </div>
                <p className="text-[10px] text-gray-400 mb-5 text-left">مولّد بواسطة محرّك AI الذكي</p>
                <div className="flex gap-3">
                  <button onClick={() => setAiModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition">
                    إغلاق
                  </button>
                  <button
                    onClick={() => sendDirect(aiModal.phone, aiModal.suggestion)}
                    disabled={!aiModal.suggestion || aiModal.sendLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#002845] text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-[#003d5c] transition"
                  >
                    {aiModal.sendLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    إرسال الآن
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Smart Blast Modal ── */}
      {blastModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#002845] flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#D4AF37]" />
                الإرسال الذكي — {selected.size} عميل
              </h3>
              <button onClick={() => setBlastModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            {blastModal.loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/30 animate-ping" />
                  <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
                </div>
                <p className="text-sm text-gray-500">يصيغ الذكاء الاصطناعي عرضاً فاخراً مخصصاً...</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2 font-semibold">الرسالة المقترحة (يمكنك التعديل):</p>
                <textarea
                  value={blastModal.suggestion}
                  onChange={(e) => setBlastModal((prev) => prev ? { ...prev, suggestion: e.target.value } : null)}
                  rows={6}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm mb-1 focus:outline-none focus:border-[#D4AF37] resize-none leading-relaxed"
                  dir="rtl"
                />
                <p className="text-[10px] text-gray-400 mb-5">سيُرسل إلى {selected.size} عميل لديهم نافذة مفتوحة</p>
                <div className="flex gap-3">
                  <button onClick={() => setBlastModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition">
                    إلغاء
                  </button>
                  <button
                    onClick={() => sendBlast(blastModal.suggestion)}
                    disabled={!blastModal.suggestion.trim() || blastModal.sendLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#D4AF37] to-amber-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:opacity-90 transition shadow"
                  >
                    {blastModal.sendLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    إرسال إلى {selected.size} عميل
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
