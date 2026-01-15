"use client";

import { useState, useEffect, useCallback } from "react";
import { Headset, MessageCircle, Clock, CheckCircle, AlertCircle, Search, RefreshCw, Send, User, Mail, Phone } from "lucide-react";

interface Reply {
  id: number;
  sender_name: string;
  sender_type: string;
  message: string;
  created_at: string;
}

interface Ticket {
  id: number;
  ticket_number: string;
  subject: string;
  description: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  category: string;
  department?: string;
  subcategory?: string;
  auto_assigned_role?: string;
  sla_hours?: number;
  status: string;
  priority: string;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: number;
  new: number;
  in_progress: number;
  resolved: number;
  closed: number;
  high_priority: number;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد" },
  open: { bg: "bg-red-100", text: "text-red-700", label: "مفتوح" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المعالجة" },
  resolved: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل" },
  closed: { bg: "bg-slate-100", text: "text-slate-600", label: "مغلق" },
};

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: "bg-purple-100", text: "text-purple-700", label: "عاجل" },
  high: { bg: "bg-red-100", text: "text-red-700", label: "عالي" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700", label: "متوسط" },
  low: { bg: "bg-green-100", text: "text-green-700", label: "منخفض" },
};

// 🎫 الأقسام الثلاثة للتوزيع الذكي
const departmentLabels: Record<string, { label: string; emoji: string; color: string }> = {
  financial: { label: "مالية", emoji: "💰", color: "#D4AF37" },
  account: { label: "حسابي/إداري", emoji: "👤", color: "#FF9800" },
  technical: { label: "تقنية", emoji: "🔧", color: "#4CAF50" },
  general: { label: "عام", emoji: "📋", color: "#607D8B" },
  billing: { label: "مالي", emoji: "💳", color: "#2196F3" },
  listing: { label: "إعلان", emoji: "🏠", color: "#9C27B0" },
};

const subcategoryLabels: Record<string, string> = {
  refund: "استرداد مبلغ",
  invoice: "فاتورة أو إيصال",
  payment_failed: "دفع فاشل",
  subscription: "اشتراك أو تجديد",
  pricing: "استفسار عن الأسعار",
  profile_update: "تعديل بيانات",
  delete_account: "حذف الحساب",
  permissions: "صلاحيات",
  verification: "توثيق الحساب",
  listing_issue: "مشكلة في إعلان",
  app_error: "خطأ في التطبيق",
  display_issue: "مشكلة في العرض",
  slow_performance: "بطء في الأداء",
  upload_issue: "مشكلة رفع ملفات",
  map_issue: "مشكلة في الخريطة",
};

const API_BASE = "";

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/support`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error("Error fetching tickets:", err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/support/stats`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, []);

  const fetchTicketDetails = useCallback(async (ticketId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/support/${ticketId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch (err) {
      console.error("Error fetching ticket details:", err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTickets(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTickets, fetchStats]);

  useEffect(() => {
    if (selectedTicket) {
      fetchTicketDetails(selectedTicket.id);
    }
  }, [selectedTicket, fetchTicketDetails]);

  const filteredTickets = tickets.filter((t) => {
    const matchesFilter = filter === "all" || t.status === filter;
    const matchesSearch =
      t.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const updateStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/support/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setTickets(tickets.map((t) => (t.id === id ? { ...t, status } : t)));
        if (selectedTicket?.id === id) {
          setSelectedTicket({ ...selectedTicket, status });
        }
        fetchStats();
      }
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket || !reply.trim()) return;
    
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/${selectedTicket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        const data = await res.json();
        setReplies([...replies, data.reply]);
        setReply("");
        fetchTickets();
      }
    } catch (err) {
      console.error("Error sending reply:", err);
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchTickets(), fetchStats()]);
    if (selectedTicket) {
      await fetchTicketDetails(selectedTicket.id);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">الدعم الفني</h1>
          <p className="text-sm text-slate-500 mt-1">إدارة تذاكر الدعم والاستفسارات</p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Headset className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#002845]">{stats?.total || 0}</p>
              <p className="text-xs text-slate-500">إجمالي التذاكر</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-red-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats?.new || 0}</p>
              <p className="text-xs text-slate-500">جديدة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-yellow-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{stats?.in_progress || 0}</p>
              <p className="text-xs text-slate-500">قيد المعالجة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-green-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats?.resolved || 0}</p>
              <p className="text-xs text-slate-500">تم الحل</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filter === "all" ? "bg-[#002845] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                الكل
              </button>
              {Object.entries(statusColors).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filter === key ? `${value.bg} ${value.text}` : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {value.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="بحث..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-9 pl-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-500">جاري التحميل...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-slate-500">لا توجد تذاكر</div>
            ) : (
              filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`p-4 cursor-pointer hover:bg-slate-50 transition ${
                    selectedTicket?.id === ticket.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[#002845]">{ticket.subject}</h3>
                        <span className="text-[10px] text-slate-400 font-mono">{ticket.ticket_number}</span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-1">{ticket.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-slate-500">{ticket.user_name || 'مستخدم'}</span>
                        <span className="text-xs text-slate-400">
                          {new Date(ticket.created_at).toLocaleDateString("ar-SA")}
                        </span>
                        {ticket.reply_count > 0 && (
                          <span className="text-xs text-blue-600 flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {ticket.reply_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[ticket.status]?.bg || 'bg-slate-100'} ${statusColors[ticket.status]?.text || 'text-slate-700'}`}
                      >
                        {statusColors[ticket.status]?.label || ticket.status}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${priorityColors[ticket.priority]?.bg || 'bg-slate-100'} ${priorityColors[ticket.priority]?.text || 'text-slate-700'}`}
                      >
                        {priorityColors[ticket.priority]?.label || ticket.priority}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {selectedTicket ? (
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[#002845]">{selectedTicket.subject}</h3>
                  <span className="text-[10px] text-slate-400 font-mono">{selectedTicket.ticket_number}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
                  {selectedTicket.user_name && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {selectedTicket.user_name}
                    </span>
                  )}
                  {selectedTicket.user_email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {selectedTicket.user_email}
                    </span>
                  )}
                  {selectedTicket.user_phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedTicket.user_phone}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {(() => {
                    const dept = selectedTicket.department || selectedTicket.category;
                    const deptInfo = departmentLabels[dept];
                    return (
                      <span 
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                        style={{ backgroundColor: deptInfo?.color || '#607D8B' }}
                      >
                        {deptInfo?.emoji || '📋'} {deptInfo?.label || dept}
                      </span>
                    );
                  })()}
                  {selectedTicket.subcategory && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                      {subcategoryLabels[selectedTicket.subcategory] || selectedTicket.subcategory}
                    </span>
                  )}
                  {selectedTicket.sla_hours && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                      SLA: {selectedTicket.sla_hours}h
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 p-4 overflow-y-auto max-h-[300px] space-y-3">
                <div className="bg-slate-100 rounded-xl p-3">
                  <p className="text-sm text-slate-700">{selectedTicket.description}</p>
                  <p className="text-[10px] text-slate-500 mt-2">
                    {new Date(selectedTicket.created_at).toLocaleString("en-US")}
                  </p>
                </div>
                
                {replies.map((r) => (
                  <div 
                    key={r.id} 
                    className={`rounded-xl p-3 ${r.sender_type === 'admin' ? 'bg-[#D4AF37]/10 mr-4' : 'bg-slate-100 ml-4'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[#002845]">{r.sender_name || (r.sender_type === 'admin' ? 'الدعم' : 'العميل')}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.sender_type === 'admin' ? 'bg-[#D4AF37] text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {r.sender_type === 'admin' ? 'دعم' : 'عميل'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{r.message}</p>
                    <p className="text-[10px] text-slate-500 mt-2">
                      {new Date(r.created_at).toLocaleString("en-US")}
                    </p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-slate-100">
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => updateStatus(selectedTicket.id, "in_progress")}
                    disabled={selectedTicket.status === 'in_progress'}
                    className="flex-1 py-2 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition disabled:opacity-50"
                  >
                    قيد المعالجة
                  </button>
                  <button
                    onClick={() => updateStatus(selectedTicket.id, "resolved")}
                    disabled={selectedTicket.status === 'resolved'}
                    className="flex-1 py-2 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition disabled:opacity-50"
                  >
                    تم الحل
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="اكتب ردك..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendReply()}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  />
                  <button 
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="p-2 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#c9a432] transition disabled:opacity-50"
                  >
                    <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">اختر تذكرة لعرض التفاصيل</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
