"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { 
  Headset, MessageCircle, Clock, CheckCircle, AlertCircle, Search, RefreshCw, 
  Send, User, Mail, Phone, ExternalLink, FileText, Calendar, X, 
  AlertTriangle, Building2, XCircle, Eye
} from "lucide-react";
import Link from "next/link";

interface Reply {
  id: number;
  sender_name: string;
  sender_type: string;
  message: string;
  created_at: string;
}

interface SupportTicket {
  id: number;
  ticket_number: string;
  subject: string;
  description: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  category: string;
  status: string;
  priority: string;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

interface AccountComplaint {
  id: number;
  user_id: string | null;
  user_name: string;
  user_email: string;
  user_phone: string;
  category: string;
  subject: string;
  details: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  submitter_name?: string;
  submitter_email?: string;
}

interface SupportStats {
  total: number;
  new: number;
  in_progress: number;
  resolved: number;
  closed: number;
  high_priority: number;
}

interface ComplaintStats {
  total: number;
  new: number;
  in_review: number;
  closed: number;
  dismissed: number;
}

type TabType = "support" | "complaints";

const supportStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد" },
  open: { bg: "bg-red-100", text: "text-red-700", label: "مفتوح" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المعالجة" },
  resolved: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل" },
  closed: { bg: "bg-slate-100", text: "text-slate-600", label: "مغلق" },
};

const complaintStatusColors: Record<string, { bg: string; text: string; label: string; border: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد", border: "border-red-300" },
  in_review: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المراجعة", border: "border-amber-300" },
  closed: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل", border: "border-green-300" },
  dismissed: { bg: "bg-slate-100", text: "text-slate-600", label: "غير مقبول", border: "border-slate-300" },
};

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: "bg-purple-100", text: "text-purple-700", label: "عاجل" },
  high: { bg: "bg-red-100", text: "text-red-700", label: "عالي" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700", label: "متوسط" },
  low: { bg: "bg-green-100", text: "text-green-700", label: "منخفض" },
};

const supportCategoryLabels: Record<string, string> = {
  general: "عام",
  technical: "فني",
  billing: "مالي",
  account: "حساب",
  listing: "إعلان",
};

const complaintCategoryLabels: Record<string, string> = {
  account_issue: "مشكلة في الحساب",
  subscription: "مشكلة في الاشتراك",
  technical: "مشكلة تقنية",
  billing: "مشكلة في الفواتير",
  other: "شكوى أخرى",
};

export default function CustomerServicePage() {
  const [activeTab, setActiveTab] = useState<TabType>("support");
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [supportStats, setSupportStats] = useState<SupportStats | null>(null);
  const [supportFilter, setSupportFilter] = useState("all");
  const [supportSearch, setSupportSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  
  const [complaints, setComplaints] = useState<AccountComplaint[]>([]);
  const [complaintStats, setComplaintStats] = useState<ComplaintStats>({ new: 0, in_review: 0, closed: 0, dismissed: 0, total: 0 });
  const [complaintFilter, setComplaintFilter] = useState("all");
  const [complaintSearch, setComplaintSearch] = useState("");
  const [selectedComplaint, setSelectedComplaint] = useState<AccountComplaint | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/support`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error("Error fetching tickets:", err);
    }
  }, []);

  const fetchSupportStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/support/stats`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSupportStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, []);

  const fetchTicketDetails = useCallback(async (ticketId: number) => {
    try {
      const res = await fetch(`/api/support/${ticketId}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch (err) {
      console.error("Error fetching ticket details:", err);
    }
  }, []);

  const fetchComplaints = async () => {
    try {
      const res = await fetch(`${API_URL}/api/account-complaints`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.complaints || []);
        
        const newStats = { new: 0, in_review: 0, closed: 0, dismissed: 0, total: data.complaints?.length || 0 };
        data.complaints?.forEach((c: AccountComplaint) => {
          if (c.status in newStats) {
            (newStats as Record<string, number>)[c.status]++;
          }
        });
        setComplaintStats(newStats);
      }
    } catch (error) {
      console.error("Error fetching complaints:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTickets(), fetchSupportStats(), fetchComplaints()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTickets, fetchSupportStats]);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchTickets(), fetchSupportStats(), fetchComplaints()]);
    setLoading(false);
  };

  const handleSelectTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setReply("");
    await fetchTicketDetails(ticket.id);
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/${selectedTicket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        setReply("");
        await fetchTicketDetails(selectedTicket.id);
        await fetchTickets();
      }
    } catch (err) {
      console.error("Error sending reply:", err);
    } finally {
      setSending(false);
    }
  };

  const handleUpdateTicketStatus = async (status: string) => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`/api/support/${selectedTicket.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setSelectedTicket({ ...selectedTicket, status });
        await fetchTickets();
        await fetchSupportStats();
      }
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const openActionModal = (complaint: AccountComplaint, action: string) => {
    setSelectedComplaint(complaint);
    setActionType(action);
    setAdminNote(complaint.admin_note || "");
    setShowActionModal(true);
  };

  const executeAction = async () => {
    if (!selectedComplaint) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/account-complaints/${selectedComplaint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: actionType, adminNote }),
      });
      if (res.ok) {
        setShowActionModal(false);
        setSelectedComplaint(null);
        await fetchComplaints();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesFilter = supportFilter === "all" || t.status === supportFilter;
    const matchesSearch = 
      t.subject?.toLowerCase().includes(supportSearch.toLowerCase()) ||
      t.user_name?.toLowerCase().includes(supportSearch.toLowerCase()) ||
      t.ticket_number?.toLowerCase().includes(supportSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredComplaints = complaints.filter((c) => {
    const matchesFilter = complaintFilter === "all" || c.status === complaintFilter;
    const matchesSearch = 
      c.subject?.toLowerCase().includes(complaintSearch.toLowerCase()) ||
      c.user_name?.toLowerCase().includes(complaintSearch.toLowerCase()) ||
      c.details?.toLowerCase().includes(complaintSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalNew = (supportStats?.new || 0) + complaintStats.new;
  const totalInProgress = (supportStats?.in_progress || 0) + complaintStats.in_review;
  const totalResolved = (supportStats?.resolved || 0) + complaintStats.closed;
  const totalAll = (supportStats?.total || 0) + complaintStats.total;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionConfig = (action: string) => {
    switch (action) {
      case "in_review": return { title: "قيد المراجعة", color: "bg-amber-500 hover:bg-amber-600", icon: Eye };
      case "closed": return { title: "تم الحل", color: "bg-green-500 hover:bg-green-600", icon: CheckCircle };
      case "dismissed": return { title: "غير مقبول", color: "bg-slate-500 hover:bg-slate-600", icon: XCircle };
      default: return { title: "تحديث", color: "bg-blue-500 hover:bg-blue-600", icon: CheckCircle };
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#002845]">خدمة العملاء</h1>
          <p className="text-slate-500 text-sm mt-1">إدارة طلبات الدعم الفني وشكاوى الحساب</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#001a2e] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Headset className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#002845]">{totalAll}</p>
              <p className="text-xs text-slate-500">إجمالي الطلبات</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{totalNew}</p>
              <p className="text-xs text-slate-500">جديد</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{totalInProgress}</p>
              <p className="text-xs text-slate-500">قيد المعالجة</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{totalResolved}</p>
              <p className="text-xs text-slate-500">تم الحل</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("support")}
          className={`px-6 py-3 font-medium transition-all relative ${
            activeTab === "support"
              ? "text-[#002845] border-b-2 border-[#D4AF37]"
              : "text-slate-500 hover:text-[#002845]"
          }`}
        >
          <span className="flex items-center gap-2">
            <Headset className="w-4 h-4" />
            الدعم الفني
            {(supportStats?.new || 0) > 0 && (
              <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {supportStats?.new}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("complaints")}
          className={`px-6 py-3 font-medium transition-all relative ${
            activeTab === "complaints"
              ? "text-[#002845] border-b-2 border-[#D4AF37]"
              : "text-slate-500 hover:text-[#002845]"
          }`}
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            شكاوى الحساب
            {complaintStats.new > 0 && (
              <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {complaintStats.new}
              </span>
            )}
          </span>
        </button>
      </div>

      {activeTab === "support" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="بحث في التذاكر..."
                value={supportSearch}
                onChange={(e) => setSupportSearch(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["all", "new", "in_progress", "resolved", "closed"].map((status) => (
                <button
                  key={status}
                  onClick={() => setSupportFilter(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    supportFilter === status
                      ? "bg-[#002845] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {status === "all" ? "الكل" : supportStatusColors[status]?.label || status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <Headset className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">لا توجد تذاكر دعم</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className={`bg-white rounded-2xl border ${
                    selectedTicket?.id === ticket.id ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/20" : "border-slate-200"
                  } shadow-sm overflow-hidden`}
                >
                  <div className="p-4 md:p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${supportStatusColors[ticket.status]?.bg} ${supportStatusColors[ticket.status]?.text}`}>
                            {supportStatusColors[ticket.status]?.label}
                          </span>
                          <span className={`px-2 py-1 rounded-lg text-xs ${priorityColors[ticket.priority]?.bg} ${priorityColors[ticket.priority]?.text}`}>
                            {priorityColors[ticket.priority]?.label}
                          </span>
                          <span className="text-xs text-slate-400">#{ticket.ticket_number}</span>
                        </div>
                        
                        <h3 className="text-lg font-bold text-[#002845] mb-2">{ticket.subject}</h3>
                        <p className="text-sm text-slate-600 line-clamp-2 mb-3">{ticket.description}</p>
                        
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {ticket.user_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {ticket.user_email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDate(ticket.created_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-4 h-4" />
                            {ticket.reply_count} ردود
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex md:flex-col gap-2">
                        <button
                          onClick={() => handleSelectTicket(ticket)}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#002845] text-white rounded-xl hover:bg-[#001a2e] transition text-sm font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          عرض والرد
                        </button>
                        {ticket.status === "new" && (
                          <button
                            onClick={() => {
                              setSelectedTicket(ticket);
                              handleUpdateTicketStatus("in_progress");
                            }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition text-sm font-medium"
                          >
                            <Clock className="w-4 h-4" />
                            قيد المعالجة
                          </button>
                        )}
                        {(ticket.status === "in_progress" || ticket.status === "new") && (
                          <button
                            onClick={() => {
                              setSelectedTicket(ticket);
                              handleUpdateTicketStatus("resolved");
                            }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                          >
                            <CheckCircle className="w-4 h-4" />
                            تم الحل
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {selectedTicket?.id === ticket.id && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4 md:p-6">
                      <h4 className="text-sm font-bold text-[#002845] mb-4 flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        المحادثة
                      </h4>
                      
                      <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                        <div className="p-3 rounded-xl bg-slate-100">
                          <p className="text-xs text-slate-500 mb-1">الرسالة الأصلية</p>
                          <p className="text-sm text-slate-700">{ticket.description}</p>
                        </div>
                        
                        {replies.map((r) => (
                          <div
                            key={r.id}
                            className={`p-3 rounded-xl ${
                              r.sender_type === "admin" ? "bg-[#002845] text-white mr-8" : "bg-white border border-slate-200 ml-8"
                            }`}
                          >
                            <p className={`text-xs mb-1 ${r.sender_type === "admin" ? "text-white/70" : "text-slate-500"}`}>
                              {r.sender_name} - {formatDate(r.created_at)}
                            </p>
                            <p className="text-sm">{r.message}</p>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="اكتب ردك هنا..."
                          className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                          onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                        />
                        <button
                          onClick={handleSendReply}
                          disabled={!reply.trim() || sending}
                          className="px-4 py-2 bg-[#D4AF37] text-white rounded-xl hover:bg-[#B8860B] transition disabled:opacity-50"
                        >
                          {sending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "complaints" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="بحث في الشكاوى..."
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["all", "new", "in_review", "closed", "dismissed"].map((status) => (
                <button
                  key={status}
                  onClick={() => setComplaintFilter(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    complaintFilter === status
                      ? "bg-[#002845] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {status === "all" ? "الكل" : complaintStatusColors[status]?.label || status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">لا توجد شكاوى</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredComplaints.map((complaint) => (
                <div
                  key={complaint.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="p-4 md:p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${complaintStatusColors[complaint.status]?.bg} ${complaintStatusColors[complaint.status]?.text}`}>
                            {complaintStatusColors[complaint.status]?.label}
                          </span>
                          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs">
                            {complaintCategoryLabels[complaint.category] || complaint.category}
                          </span>
                          <span className="text-xs text-slate-400">#{complaint.id}</span>
                        </div>
                        
                        <h3 className="text-lg font-bold text-[#002845] mb-2">{complaint.subject}</h3>
                        <p className="text-sm text-slate-600 line-clamp-2 mb-3">{complaint.details}</p>
                        
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {complaint.user_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {complaint.user_email}
                          </span>
                          {complaint.user_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-4 h-4" />
                              {complaint.user_phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDate(complaint.created_at)}
                          </span>
                        </div>
                        
                        {complaint.admin_note && (
                          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                            <p className="text-xs text-amber-600 font-medium mb-1">ملاحظة الإدارة:</p>
                            <p className="text-sm text-amber-800">{complaint.admin_note}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex md:flex-col gap-2">
                        {complaint.status === "new" && (
                          <>
                            <button
                              onClick={() => openActionModal(complaint, "in_review")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition text-sm font-medium"
                            >
                              <Eye className="w-4 h-4" />
                              قيد المراجعة
                            </button>
                            <button
                              onClick={() => openActionModal(complaint, "closed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                            >
                              <CheckCircle className="w-4 h-4" />
                              تم الحل
                            </button>
                            <button
                              onClick={() => openActionModal(complaint, "dismissed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-sm font-medium"
                            >
                              <XCircle className="w-4 h-4" />
                              غير مقبول
                            </button>
                          </>
                        )}
                        {complaint.status === "in_review" && (
                          <>
                            <button
                              onClick={() => openActionModal(complaint, "closed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                            >
                              <CheckCircle className="w-4 h-4" />
                              تم الحل
                            </button>
                            <button
                              onClick={() => openActionModal(complaint, "dismissed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-sm font-medium"
                            >
                              <XCircle className="w-4 h-4" />
                              غير مقبول
                            </button>
                          </>
                        )}
                        {(complaint.status === "closed" || complaint.status === "dismissed") && (
                          <span className="text-xs text-slate-400 text-center py-2">تم الإغلاق</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showActionModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#002845]">
                {getActionConfig(actionType).title}
              </h3>
              <button
                onClick={() => setShowActionModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm text-slate-600 mb-2">ملاحظة للعميل (اختياري)</label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="اكتب ملاحظة للعميل..."
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowActionModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                إلغاء
              </button>
              <button
                onClick={executeAction}
                disabled={submitting}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition disabled:opacity-50 ${getActionConfig(actionType).color}`}
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
