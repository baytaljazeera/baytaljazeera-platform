"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  MessageCircle, Search, Eye, Building, User, ChevronLeft, ChevronRight, 
  Filter, X, Flag, AlertTriangle, Shield, Brain, History, BarChart3,
  CheckCircle, Clock, XCircle, UserX
} from "lucide-react";
import { toast } from "sonner";

interface ConversationPreview {
  id: string;
  user1_id: string;
  user1_name: string;
  user2_id: string;
  user2_name: string;
  listing_id: string;
  listing_title: string;
  message_count: number;
  last_message: string;
  last_message_at: string;
}

interface Message {
  id: number;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
}

interface ConversationFlag {
  id: number;
  flag_type: string;
  flag_reason: string;
  ai_analysis: string;
  ai_risk_score: number;
  status: string;
  admin_note: string;
}

interface ConversationDetail {
  id: string;
  user1_id: string;
  user2_id: string;
  listing_id: string;
  user1_name: string;
  user2_name: string;
  listing_title: string;
  messages: Message[];
  flag: ConversationFlag | null;
}

interface CustomerHistory {
  user: { id: string; name: string; email: string; phone: string; created_at: string; status: string };
  conversations: Array<{ other_user_id: string; other_user_name: string; listing_id: string; listing_title: string; message_count: number; sent_count: number; received_count: number; first_message_at: string; last_message_at: string }>;
  flags: ConversationFlag[];
  stats: { unique_contacts: number; total_messages: number; sent_messages: number; received_messages: number; listings_discussed: number };
}

interface Stats {
  total_conversations: number;
  total_messages: number;
  unique_senders: number;
  listings_with_messages: number;
  pending_flags: number;
  investigating_flags: number;
  total_flags: number;
}

interface AIAnalysis {
  risk_score: number;
  risk_level: string;
  flags: string[];
  analysis: string;
  recommendation: string;
}

const API_BASE = "";

const FLAG_TYPES = [
  { value: 'suspicious', label: 'مشبوه', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  { value: 'fraud', label: 'احتيال', color: 'bg-red-100 text-red-700', icon: XCircle },
  { value: 'spam', label: 'إزعاج', color: 'bg-orange-100 text-orange-700', icon: UserX },
  { value: 'inappropriate', label: 'محتوى غير لائق', color: 'bg-purple-100 text-purple-700', icon: Flag },
  { value: 'external_contact', label: 'تواصل خارجي', color: 'bg-blue-100 text-blue-700', icon: Shield },
];

const FLAG_STATUSES = [
  { value: 'pending', label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'investigating', label: 'قيد التحقيق', color: 'bg-blue-100 text-blue-700' },
  { value: 'resolved', label: 'تم الحل', color: 'bg-green-100 text-green-700' },
  { value: 'dismissed', label: 'مرفوض', color: 'bg-gray-100 text-gray-700' },
];

export default function AdminCustomerConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>("");
  const limit = 20;
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [customerHistory, setCustomerHistory] = useState<CustomerHistory | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagType, setFlagType] = useState('suspicious');
  const [flagReason, setFlagReason] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'conversations' | 'flagged' | 'stats'>('conversations');
  const [flaggedConversations, setFlaggedConversations] = useState<Array<ConversationFlag & { id: number; user1_id: string; user2_id: string; user1_name: string; user2_name: string; listing_id: string; listing_title: string }>>([]);
  const [updatingFlagId, setUpdatingFlagId] = useState<number | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<(ConversationFlag & { user1_id: string; user2_id: string; user1_name: string; user2_name: string }) | null>(null);
  const [adminNote, setAdminNote] = useState('');;

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (searchQuery) params.append("search", searchQuery);
      if (dateFilter) params.append("date", dateFilter);

      const res = await fetch(`${API_BASE}/api/admin/customer-conversations?${params}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        router.push("/admin");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        setTotalPages(Math.ceil((data.total || 0) / limit) || 1);
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, dateFilter, router]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/conversation-stats`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const fetchFlaggedConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/flagged-conversations`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setFlaggedConversations(data.flags || []);
      }
    } catch (err) {
      console.error("Error fetching flagged conversations:", err);
    }
  };

  const fetchConversationDetail = async (convId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/customer-conversations/${convId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(data);
        setSelectedConvId(convId);
        setAiAnalysis(null);
      }
    } catch (err) {
      console.error("Error fetching conversation detail:", err);
    }
  };

  const fetchCustomerHistory = async (userId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/customer-history/${userId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCustomerHistory(data);
        setShowHistoryModal(true);
      }
    } catch (err) {
      console.error("Error fetching customer history:", err);
    }
  };

  const analyzeConversation = async () => {
    if (!selectedConversation || selectedConversation.messages.length === 0) return;
    
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/analyze-conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: selectedConversation.messages,
          user1_name: selectedConversation.user1_name,
          user2_name: selectedConversation.user2_name,
          listing_title: selectedConversation.listing_title
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data.analysis);
      }
    } catch (err) {
      console.error("Error analyzing conversation:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const flagConversation = async () => {
    if (!selectedConversation) return;
    
    setFlagging(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/flag-conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user1_id: selectedConversation.user1_id,
          user2_id: selectedConversation.user2_id,
          listing_id: selectedConversation.listing_id,
          flag_type: flagType,
          flag_reason: flagReason,
          ai_analysis: aiAnalysis?.analysis,
          ai_risk_score: aiAnalysis?.risk_score || 0
        })
      });
      
      if (res.ok) {
        setShowFlagModal(false);
        setFlagReason('');
        fetchConversationDetail(selectedConvId!);
        fetchFlaggedConversations();
      }
    } catch (err) {
      console.error("Error flagging conversation:", err);
    } finally {
      setFlagging(false);
    }
  };

  const updateFlagStatus = async (flagId: number, newStatus: string, note?: string) => {
    setUpdatingFlagId(flagId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/flag-conversation/${flagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus, admin_note: note })
      });
      
      if (res.ok) {
        fetchFlaggedConversations();
        fetchStats();
        if (selectedConvId) {
          fetchConversationDetail(selectedConvId);
        }
        setShowActionModal(false);
        setAdminNote('');
        setSelectedFlag(null);
      }
    } catch (err) {
      console.error("Error updating flag status:", err);
    } finally {
      setUpdatingFlagId(null);
    }
  };

  const openActionModal = (flag: typeof selectedFlag) => {
    setSelectedFlag(flag);
    setAdminNote(flag?.admin_note || '');
    setShowActionModal(true);
  };

  const sendWarningAlert = async (userId: string, userName: string) => {
    if (!adminNote.trim()) {
      toast.warning("يرجى كتابة نص التحذير أولاً");
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE}/api/admin/send-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: userId,
          alert_type: "warning",
          title: "تحذير من إدارة المنصة",
          message: adminNote,
          related_conversation_id: selectedConvId,
          related_flag_id: selectedFlag?.id
        })
      });
      
      if (res.ok) {
        toast.success(`تم إرسال التحذير إلى ${userName}`, {
          description: 'سيصل الإشعار للمستخدم فوراً',
          duration: 4000,
        });
        return true;
      } else {
        toast.error("فشل إرسال التحذير");
        return false;
      }
    } catch (err) {
      console.error("Error sending warning:", err);
      toast.error("خطأ في الاتصال بالخادم");
      return false;
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchStats();
    fetchFlaggedConversations();
  }, [fetchConversations]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString("ar-SA");
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'safe': return 'text-green-600 bg-green-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      case 'medium': return 'text-amber-600 bg-amber-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#002845] flex items-center gap-2">
            <Shield className="w-7 h-7 text-[#D4AF37]" />
            مركز مراقبة المحادثات
          </h1>
          <p className="text-slate-500 text-sm mt-1">نظام أمني متكامل لمراقبة وتحليل محادثات العملاء</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('conversations')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'conversations' ? 'bg-[#002845] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            <MessageCircle className="w-4 h-4 inline ml-1" />
            المحادثات
          </button>
          <button
            onClick={() => setActiveTab('flagged')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'flagged' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            <Flag className="w-4 h-4 inline ml-1" />
            الموسومة {stats?.pending_flags ? `(${stats.pending_flags})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'stats' ? 'bg-[#D4AF37] text-[#002845]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            <BarChart3 className="w-4 h-4 inline ml-1" />
            الإحصائيات
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <p className="text-xs text-slate-500">المحادثات</p>
            <p className="text-xl font-bold text-[#002845]">{stats.total_conversations || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <p className="text-xs text-slate-500">الرسائل</p>
            <p className="text-xl font-bold text-[#002845]">{stats.total_messages || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <p className="text-xs text-slate-500">المستخدمين النشطين</p>
            <p className="text-xl font-bold text-[#002845]">{stats.unique_senders || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <p className="text-xs text-slate-500">إعلانات بمحادثات</p>
            <p className="text-xl font-bold text-[#002845]">{stats.listings_with_messages || 0}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-3 shadow-sm border border-yellow-200">
            <p className="text-xs text-yellow-600">قيد الانتظار</p>
            <p className="text-xl font-bold text-yellow-700">{stats.pending_flags || 0}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 shadow-sm border border-blue-200">
            <p className="text-xs text-blue-600">قيد التحقيق</p>
            <p className="text-xl font-bold text-blue-700">{stats.investigating_flags || 0}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 shadow-sm border border-red-200">
            <p className="text-xs text-red-600">إجمالي الوسم</p>
            <p className="text-xl font-bold text-red-700">{stats.total_flags || 0}</p>
          </div>
        </div>
      )}

      {activeTab === 'conversations' && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="بحث بالاسم أو العنوان..."
                className="w-full pr-10 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
              />
            </div>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
            />
            {(searchQuery || dateFilter) && (
              <button
                onClick={() => { setSearchQuery(""); setDateFilter(""); setPage(1); }}
                className="p-2.5 text-slate-500 hover:text-red-500 transition bg-white rounded-xl border border-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-3">
              {loading ? (
                <div className="bg-white rounded-xl p-8 text-center">
                  <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-slate-500 mt-3">جاري التحميل...</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center">
                  <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">لا توجد محادثات</p>
                </div>
              ) : (
                <>
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => fetchConversationDetail(conv.id)}
                      className={`bg-white rounded-xl p-4 cursor-pointer transition border-2 ${selectedConvId === conv.id ? "border-[#D4AF37] shadow-md" : "border-transparent hover:border-slate-200 hover:shadow-sm"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#002845]/10 flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="w-5 h-5 text-[#002845]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <button
                              onClick={(e) => { e.stopPropagation(); fetchCustomerHistory(conv.user1_id); }}
                              className="font-medium text-[#002845] truncate hover:text-[#D4AF37] hover:underline"
                            >
                              {conv.user1_name}
                            </button>
                            <span className="text-slate-400">↔</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); fetchCustomerHistory(conv.user2_id); }}
                              className="font-medium text-[#002845] truncate hover:text-[#D4AF37] hover:underline"
                            >
                              {conv.user2_name}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                            <Building className="w-3 h-3" />
                            <span className="truncate">{conv.listing_title}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-2 line-clamp-1">{conv.last_message}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-slate-400">{formatDate(conv.last_message_at)}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">{conv.message_count} رسالة</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-slate-600">{page} / {totalPages}</span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="lg:col-span-2 space-y-4">
              {selectedConversation ? (
                <>
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-[#002845] to-[#003f6b]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Eye className="w-5 h-5 text-[#D4AF37]" />
                          <div>
                            <h3 className="font-bold text-white">{selectedConversation.user1_name} ↔ {selectedConversation.user2_name}</h3>
                            <p className="text-xs text-white/60">{selectedConversation.listing_title}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={analyzeConversation}
                            disabled={analyzing}
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 transition disabled:opacity-50"
                          >
                            <Brain className="w-3.5 h-3.5" />
                            {analyzing ? 'جاري التحليل...' : 'تحليل AI'}
                          </button>
                          {!selectedConversation.flag && (
                            <button
                              onClick={() => setShowFlagModal(true)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition"
                            >
                              <Flag className="w-3.5 h-3.5" />
                              وسم
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedConversation.flag && (
                      <div className="p-3 bg-red-50 border-b border-red-100">
                        <div className="flex items-center gap-3 mb-2">
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-700">
                              هذه المحادثة موسومة: {FLAG_TYPES.find(f => f.value === selectedConversation.flag?.flag_type)?.label}
                            </p>
                            <p className="text-xs text-red-600">{selectedConversation.flag.flag_reason}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${FLAG_STATUSES.find(s => s.value === selectedConversation.flag?.status)?.color}`}>
                            {FLAG_STATUSES.find(s => s.value === selectedConversation.flag?.status)?.label}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-2">
                          {selectedConversation.flag.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateFlagStatus(selectedConversation.flag!.id, 'investigating')}
                                disabled={updatingFlagId === selectedConversation.flag.id}
                                className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                              >
                                بدء التحقيق
                              </button>
                              <button
                                onClick={() => updateFlagStatus(selectedConversation.flag!.id, 'dismissed')}
                                disabled={updatingFlagId === selectedConversation.flag.id}
                                className="px-3 py-1.5 bg-gray-400 text-white text-xs rounded-lg hover:bg-gray-500 transition disabled:opacity-50"
                              >
                                رفض البلاغ
                              </button>
                            </>
                          )}
                          {selectedConversation.flag.status === 'investigating' && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedFlag(selectedConversation.flag as typeof selectedFlag);
                                  setAdminNote(selectedConversation.flag?.admin_note || '');
                                  setShowActionModal(true);
                                }}
                                className="px-3 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition"
                              >
                                إغلاق وحل
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedFlag(selectedConversation.flag as typeof selectedFlag);
                                  setAdminNote(selectedConversation.flag?.admin_note || '');
                                  setShowActionModal(true);
                                }}
                                className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition"
                              >
                                تحذير/حظر
                              </button>
                            </>
                          )}
                          {(selectedConversation.flag.status === 'resolved' || selectedConversation.flag.status === 'dismissed') && (
                            <span className="text-xs text-slate-500">تم الإغلاق</span>
                          )}
                        </div>
                        {selectedConversation.flag.admin_note && (
                          <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded">ملاحظة: {selectedConversation.flag.admin_note}</p>
                        )}
                      </div>
                    )}

                    {aiAnalysis && (
                      <div className="p-4 bg-purple-50 border-b border-purple-100">
                        <div className="flex items-center gap-3 mb-3">
                          <Brain className="w-5 h-5 text-purple-600" />
                          <h4 className="font-bold text-purple-800">تحليل الذكاء الاصطناعي</h4>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRiskColor(aiAnalysis.risk_level)}`}>
                            مستوى الخطر: {aiAnalysis.risk_score}%
                          </span>
                        </div>
                        <p className="text-sm text-purple-900 mb-2">{aiAnalysis.analysis}</p>
                        <p className="text-sm text-purple-700"><strong>التوصية:</strong> {aiAnalysis.recommendation}</p>
                        {aiAnalysis.flags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {aiAnalysis.flags.map((flag, i) => (
                              <span key={i} className="px-2 py-0.5 bg-purple-200 text-purple-800 text-xs rounded-full">{flag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-4 max-h-[400px] overflow-y-auto space-y-3 bg-slate-50">
                      {selectedConversation.messages.map((msg) => (
                        <div key={msg.id} className="bg-white rounded-xl p-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-7 h-7 rounded-full bg-[#002845] flex items-center justify-center text-white text-xs font-bold">
                              {msg.sender_name.charAt(0)}
                            </div>
                            <button
                              onClick={() => fetchCustomerHistory(msg.sender_id)}
                              className="font-medium text-[#002845] text-sm hover:text-[#D4AF37] hover:underline"
                            >
                              {msg.sender_name}
                            </button>
                            <span className="text-[10px] text-slate-400 mr-auto">
                              {new Date(msg.created_at).toLocaleString("ar-SA")}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 pr-9">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl p-12 text-center">
                  <Shield className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400">اختر محادثة من القائمة لعرض تفاصيلها وتحليلها</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'flagged' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-[#002845] flex items-center gap-2">
              <Flag className="w-5 h-5 text-red-500" />
              المحادثات الموسومة
            </h3>
          </div>
          {flaggedConversations.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-slate-500">لا توجد محادثات موسومة</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {flaggedConversations.map((flag) => (
                <div key={flag.id} className="p-4 hover:bg-slate-50 transition">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${FLAG_TYPES.find(f => f.value === flag.flag_type)?.color}`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[#002845]">{flag.user1_name} ↔ {flag.user2_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${FLAG_STATUSES.find(s => s.value === flag.status)?.color}`}>
                          {FLAG_STATUSES.find(s => s.value === flag.status)?.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">{flag.listing_title}</p>
                      <p className="text-sm text-slate-700">{flag.flag_reason}</p>
                      {flag.ai_risk_score > 0 && (
                        <p className="text-xs text-purple-600 mt-1">درجة الخطر AI: {flag.ai_risk_score}%</p>
                      )}
                      {flag.admin_note && (
                        <p className="text-xs text-slate-600 mt-1 bg-slate-100 p-2 rounded">ملاحظة: {flag.admin_note}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {flag.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateFlagStatus(flag.id, 'investigating')}
                            disabled={updatingFlagId === flag.id}
                            className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                          >
                            بدء التحقيق
                          </button>
                          <button
                            onClick={() => updateFlagStatus(flag.id, 'dismissed')}
                            disabled={updatingFlagId === flag.id}
                            className="px-3 py-1.5 bg-gray-400 text-white text-xs rounded-lg hover:bg-gray-500 transition disabled:opacity-50"
                          >
                            رفض البلاغ
                          </button>
                        </>
                      )}
                      {flag.status === 'investigating' && (
                        <>
                          <button
                            onClick={() => openActionModal(flag as typeof selectedFlag)}
                            className="px-3 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition"
                          >
                            إغلاق وحل
                          </button>
                          <button
                            onClick={() => openActionModal(flag as typeof selectedFlag)}
                            className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition"
                          >
                            تحذير/حظر
                          </button>
                        </>
                      )}
                      {(flag.status === 'resolved' || flag.status === 'dismissed') && (
                        <span className="text-xs text-slate-400">تم الإغلاق</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-[#002845] flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
            إحصائيات تفصيلية
          </h3>
          <div className="text-center text-slate-500 py-8">
            يتم عرض الإحصائيات في البطاقات أعلاه
          </div>
        </div>
      )}

      {showHistoryModal && customerHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-[#002845] to-[#003f6b] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-[#D4AF37]" />
                <div>
                  <h3 className="font-bold text-white">{customerHistory.user.name}</h3>
                  <p className="text-xs text-white/60">{customerHistory.user.email}</p>
                </div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-100px)]">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#002845]">{customerHistory.stats?.total_messages || 0}</p>
                  <p className="text-xs text-slate-500">الرسائل</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#002845]">{customerHistory.stats?.unique_contacts || 0}</p>
                  <p className="text-xs text-slate-500">جهات الاتصال</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#002845]">{customerHistory.stats?.sent_messages || 0}</p>
                  <p className="text-xs text-slate-500">مرسلة</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#002845]">{customerHistory.stats?.received_messages || 0}</p>
                  <p className="text-xs text-slate-500">مستلمة</p>
                </div>
              </div>

              {customerHistory.flags.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 rounded-xl">
                  <p className="text-sm font-medium text-red-700 mb-2">تنبيهات ({customerHistory.flags.length})</p>
                  {customerHistory.flags.map(f => (
                    <p key={f.id} className="text-xs text-red-600">{f.flag_reason}</p>
                  ))}
                </div>
              )}

              <h4 className="font-medium text-[#002845] mb-3">المحادثات ({customerHistory.conversations.length})</h4>
              <div className="space-y-2">
                {customerHistory.conversations.map((conv, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-[#002845]">{conv.other_user_name}</span>
                      <span className="text-xs text-slate-500">{conv.message_count} رسالة</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{conv.listing_title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showFlagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-[#002845] flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-500" />
                وسم المحادثة
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-2">نوع الوسم</label>
                <div className="grid grid-cols-2 gap-2">
                  {FLAG_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFlagType(type.value)}
                      className={`p-2 rounded-xl text-sm flex items-center gap-2 transition ${flagType === type.value ? type.color + ' ring-2 ring-offset-2' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      <type.icon className="w-4 h-4" />
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-2">سبب الوسم</label>
                <textarea
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="اشرح سبب وسم هذه المحادثة..."
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFlagModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={flagConversation}
                  disabled={!flagReason.trim() || flagging}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
                >
                  {flagging ? 'جاري الوسم...' : 'تأكيد الوسم'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showActionModal && selectedFlag && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-[#002845] to-[#003f6b]">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#D4AF37]" />
                اتخاذ إجراء
              </h3>
              <p className="text-xs text-white/70 mt-1">{selectedFlag.user1_name} ↔ {selectedFlag.user2_name}</p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-2">ملاحظة الإدارة</label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="سجل ملاحظاتك والإجراءات المتخذة..."
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                  rows={3}
                />
              </div>
              
              <div className="bg-slate-50 p-3 rounded-xl">
                <p className="text-xs text-slate-500 mb-2">اختر الإجراء:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateFlagStatus(selectedFlag.id, 'resolved', adminNote)}
                    disabled={updatingFlagId === selectedFlag.id}
                    className="p-3 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition disabled:opacity-50 flex flex-col items-center gap-1"
                  >
                    <CheckCircle className="w-5 h-5" />
                    تم الحل
                    <span className="text-[10px] opacity-75">إغلاق بدون عقوبة</span>
                  </button>
                  <button
                    onClick={() => updateFlagStatus(selectedFlag.id, 'dismissed', adminNote)}
                    disabled={updatingFlagId === selectedFlag.id}
                    className="p-3 bg-gray-400 text-white rounded-xl text-sm font-medium hover:bg-gray-500 transition disabled:opacity-50 flex flex-col items-center gap-1"
                  >
                    <XCircle className="w-5 h-5" />
                    رفض البلاغ
                    <span className="text-[10px] opacity-75">بلاغ غير صحيح</span>
                  </button>
                </div>
              </div>

              <div className="bg-red-50 p-3 rounded-xl">
                <p className="text-xs text-red-600 mb-2">إجراءات عقابية:</p>
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500">إرسال تحذير لـ:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        const sent = await sendWarningAlert(selectedFlag.user1_id, selectedFlag.user1_name);
                        if (sent) {
                          updateFlagStatus(selectedFlag.id, 'resolved', `تحذير أُرسل إلى: ${selectedFlag.user1_name} - ${adminNote}`);
                        }
                      }}
                      disabled={updatingFlagId === selectedFlag.id || !adminNote.trim()}
                      className="p-2 bg-amber-500 text-white rounded-xl text-xs font-medium hover:bg-amber-600 transition disabled:opacity-50"
                    >
                      تحذير {selectedFlag.user1_name?.split(' ')[0]}
                    </button>
                    <button
                      onClick={async () => {
                        const sent = await sendWarningAlert(selectedFlag.user2_id, selectedFlag.user2_name);
                        if (sent) {
                          updateFlagStatus(selectedFlag.id, 'resolved', `تحذير أُرسل إلى: ${selectedFlag.user2_name} - ${adminNote}`);
                        }
                      }}
                      disabled={updatingFlagId === selectedFlag.id || !adminNote.trim()}
                      className="p-2 bg-amber-500 text-white rounded-xl text-xs font-medium hover:bg-amber-600 transition disabled:opacity-50"
                    >
                      تحذير {selectedFlag.user2_name?.split(' ')[0]}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      await sendWarningAlert(selectedFlag.user1_id, selectedFlag.user1_name);
                      const sent = await sendWarningAlert(selectedFlag.user2_id, selectedFlag.user2_name);
                      if (sent) {
                        updateFlagStatus(selectedFlag.id, 'resolved', `تحذير أُرسل للطرفين - ${adminNote}`);
                      }
                    }}
                    disabled={updatingFlagId === selectedFlag.id || !adminNote.trim()}
                    className="w-full p-2 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition disabled:opacity-50"
                  >
                    تحذير الطرفين معاً
                  </button>
                </div>
              </div>
              
              <button
                onClick={() => {
                  setShowActionModal(false);
                  setSelectedFlag(null);
                  setAdminNote('');
                }}
                className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
