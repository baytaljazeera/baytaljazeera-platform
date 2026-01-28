"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, Plus, Clock, CheckCircle2,
  Loader2, X, ChevronLeft, Users, Bell
} from "lucide-react";

type Department = {
  id: string;
  name_ar: string;
  icon: string;
  color: string;
};

type Participant = {
  user_id: string;
  name: string;
  email: string;
  role: string;
};

type LastMessage = {
  content: string;
  sender_id: string;
  sender_name: string;
  created_at: string;
};

type Conversation = {
  id: number;
  department: string;
  subject: string;
  status: string;
  created_at: string;
  last_message_at: string;
  unread_count: number;
  awaiting_reply_count: number;
  creator_name: string;
  creator_role: string;
  created_by: string;
  department_info: Department;
  participants: Participant[];
  other_participants: Participant[];
  initiated_by_me: boolean;
  last_message_by_me: boolean;
  last_message: LastMessage;
};

type Message = {
  id: number;
  conversation_id: number;
  sender_id: string;
  sender_role: string;
  sender_name: string;
  content: string;
  created_at: string;
};

type ConversationWithMessages = Conversation & {
  messages: Message[];
  participants: Participant[];
};

type Admin = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const ROLE_NAMES: Record<string, string> = {
  super_admin: 'المدير العام',
  finance_admin: 'المالية',
  support_admin: 'الدعم الفني',
  content_admin: 'المحتوى',
  admin: 'مدير',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#FFD700',
  finance_admin: '#10B981',
  support_admin: '#3B82F6',
  content_admin: '#8B5CF6',
  admin: '#D4AF37',
};

export default function AdminMessagesPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithMessages | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const [newConvDepartment, setNewConvDepartment] = useState("");
  const [newConvSubject, setNewConvSubject] = useState("");
  const [newConvMessage, setNewConvMessage] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [replyMessage, setReplyMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchConversations();
    fetchDepartments();
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages]);

  useEffect(() => {
    if (newConvDepartment) {
      fetchAdmins(newConvDepartment);
    }
  }, [newConvDepartment]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  async function fetchCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCurrentUserId(data.user?.id || data.id || '');
      }
    } catch (err) {
      console.error('Error fetching user:', err);
    }
  }

  async function fetchDepartments() {
    try {
      const res = await fetch(`${API_URL}/api/admin-messages/departments`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
      }
    } catch (err) {
      console.error("Error fetching departments:", err);
    }
  }

  async function fetchAdmins(department: string) {
    try {
      const res = await fetch(`/api/admin-messages/admins?department=${department}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAdmins(data);
      }
    } catch (err) {
      console.error("Error fetching admins:", err);
    }
  }

  async function fetchConversations() {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL}/api/admin-messages/conversations`, { credentials: "include", headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) {
        router.push("/admin-login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchConversation(id: number) {
    try {
      const res = await fetch(`/api/admin-messages/conversations/${id}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(data);
        setConversations(prev =>
          prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c)
        );
      }
    } catch (err) {
      console.error("Error fetching conversation:", err);
    }
  }

  async function handleCreateConversation() {
    if (!newConvDepartment || !newConvSubject.trim() || !newConvMessage.trim()) return;

    try {
      setSending(true);
      const res = await fetch(`${API_URL}/api/admin-messages/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          department: newConvDepartment,
          subject: newConvSubject.trim(),
          message: newConvMessage.trim(),
          participants: selectedParticipants,
        }),
      });

      if (res.ok) {
        const newConv = await res.json();
        setConversations(prev => [newConv, ...prev]);
        setShowNewMessage(false);
        setNewConvDepartment("");
        setNewConvSubject("");
        setNewConvMessage("");
        setSelectedParticipants([]);
        fetchConversation(newConv.id);
      }
    } catch (err) {
      console.error("Error creating conversation:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleSendReply() {
    if (!selectedConversation || !replyMessage.trim()) return;

    try {
      setSending(true);
      const res = await fetch(`/api/admin-messages/conversations/${selectedConversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: replyMessage.trim() }),
      });

      if (res.ok) {
        const newMessage = await res.json();
        setSelectedConversation(prev => prev ? {
          ...prev,
          messages: [...prev.messages, newMessage],
        } : null);
        setReplyMessage("");
      }
    } catch (err) {
      console.error("Error sending reply:", err);
    } finally {
      setSending(false);
    }
  }

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

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">المراسلات الداخلية</h1>
          <p className="text-slate-500 mt-1">تواصل مع فريق الإدارة</p>
        </div>
        <button
          onClick={() => setShowNewMessage(true)}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>رسالة جديدة</span>
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
              <h2 className="text-lg font-bold text-white">المحادثات</h2>
            </div>

            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">لا توجد محادثات</p>
                <p className="text-sm text-slate-400 mt-1">ابدأ محادثة جديدة مع فريق الإدارة</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {conversations.map((conv) => {
                  const isSelected = selectedConversation?.id === conv.id;
                  const recipients = conv.other_participants || [];
                  const recipientNames = recipients.map(p => p.name || ROLE_NAMES[p.role] || 'مدير').join('، ');

                  return (
                    <button
                      key={conv.id}
                      onClick={() => fetchConversation(conv.id)}
                      className={`w-full p-4 text-right transition-all hover:bg-slate-50 ${
                        isSelected ? "bg-[#D4AF37]/10 border-r-4 border-[#D4AF37]" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg"
                            style={{ backgroundColor: conv.department_info?.color || "#4CAF50" }}
                          >
                            {conv.department_info?.icon || "📢"}
                          </div>
                          {conv.initiated_by_me && (
                            <div className="absolute -top-1 -left-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                              <Send className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-[#002845] truncate">
                                {conv.subject}
                              </span>
                              {conv.initiated_by_me && (
                                <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded shrink-0">
                                  أرسلته
                                </span>
                              )}
                            </div>
                            {conv.awaiting_reply_count > 0 && (
                              <span className="bg-red-500 text-white text-xs font-bold min-w-[22px] h-[22px] flex items-center justify-center rounded-full shrink-0 animate-pulse shadow-lg shadow-red-500/30">
                                {conv.awaiting_reply_count}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs">
                            <span className="text-slate-400">
                              {conv.initiated_by_me ? 'إلى:' : 'من:'}
                            </span>
                            <span className="text-slate-600 font-medium truncate">
                              {conv.initiated_by_me ? recipientNames || 'المدراء' : conv.creator_name}
                            </span>
                          </div>
                          {conv.last_message && (
                            <p className="text-xs text-slate-400 truncate mt-1">
                              {conv.last_message_by_me ? 'أنت: ' : `${conv.last_message.sender_name || 'مدير'}: `}
                              {conv.last_message.content?.slice(0, 50)}...
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: conv.department_info?.color + '20', color: conv.department_info?.color }}>
                              {conv.department_info?.name_ar || "عام"}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatDate(conv.last_message_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedConversation ? (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden h-[600px] flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="lg:hidden p-2 rounded-lg hover:bg-white/10"
                    >
                      <ChevronLeft className="w-5 h-5 text-white" />
                    </button>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg"
                      style={{ backgroundColor: selectedConversation.department_info?.color || "#4CAF50" }}
                    >
                      {selectedConversation.department_info?.icon || "📢"}
                    </div>
                    <div>
                      <h3 className="font-bold text-white">
                        {selectedConversation.subject}
                      </h3>
                      <p className="text-xs text-white/70">
                        {selectedConversation.department_info?.name_ar || "عام"}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    {(() => {
                      const otherParticipants = selectedConversation.participants?.filter(
                        p => String(p.user_id) !== String(currentUserId)
                      ) || [];
                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-white/60" />
                            <span className="text-xs text-white/60">
                              {otherParticipants.length > 0 ? `${otherParticipants.length} طرف آخر` : 'أنت فقط'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1 justify-end max-w-[200px]">
                            {otherParticipants.slice(0, 3).map((p, idx) => (
                              <span 
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/90"
                              >
                                {p.name || ROLE_NAMES[p.role] || 'مدير'}
                              </span>
                            ))}
                            {otherParticipants.length > 3 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white/90">
                                +{otherParticipants.length - 3}
                              </span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {selectedConversation.messages.map((msg) => {
                  const isMe = String(msg.sender_id) === String(currentUserId);
                  const roleColor = ROLE_COLORS[msg.sender_role] || '#6B7280';
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                          isMe
                            ? "bg-gradient-to-r from-[#FCA5A5] to-[#F87171] text-gray-800 rounded-bl-md"
                            : "bg-gradient-to-r from-[#16A34A] to-[#15803D] text-white rounded-br-md"
                        }`}
                      >
                        <div className={`flex items-center gap-2 mb-1 ${isMe ? "justify-end" : ""}`}>
                          <span className={`text-xs font-medium ${isMe ? "text-gray-700" : "text-white/90"}`}>
                            {isMe ? 'أنت' : msg.sender_name}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isMe ? "bg-white/50 text-gray-600" : "bg-white/20 text-white/80"}`}>
                            {ROLE_NAMES[msg.sender_role] || msg.sender_role}
                          </span>
                        </div>
                        <p className={`text-sm leading-relaxed ${isMe ? "text-gray-800" : "text-white"}`}>
                          {msg.content}
                        </p>
                        <div className={`flex items-center gap-1 mt-2 ${isMe ? "justify-end" : ""}`}>
                          <Clock className={`w-3 h-3 ${isMe ? "text-gray-500" : "text-white/60"}`} />
                          <span className={`text-[10px] ${isMe ? "text-gray-500" : "text-white/60"}`}>
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-slate-100 bg-white">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
                    placeholder="اكتب ردك هنا..."
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !replyMessage.trim()}
                    className="px-5 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 h-[600px] flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-400">اختر محادثة</h3>
                <p className="text-slate-400 mt-2">أو ابدأ محادثة جديدة مع فريق الإدارة</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showNewMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowNewMessage(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c] flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">رسالة جديدة</h3>
                <button
                  onClick={() => setShowNewMessage(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    اختر القسم <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {departments.map((dept) => {
                      const isSelected = newConvDepartment === dept.id;
                      return (
                        <button
                          key={dept.id}
                          onClick={() => setNewConvDepartment(dept.id)}
                          className={`p-3 rounded-xl border-2 transition-all text-center ${
                            isSelected
                              ? "border-[#D4AF37] bg-[#D4AF37]/10"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div
                            className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-xl text-white"
                            style={{ backgroundColor: dept.color }}
                          >
                            {dept.icon}
                          </div>
                          <span className={`text-xs font-medium ${isSelected ? "text-[#D4AF37]" : "text-slate-600"}`}>
                            {dept.name_ar}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {newConvDepartment && admins.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      المشاركون (اختياري)
                    </label>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {admins.map((admin) => {
                        const isSelected = selectedParticipants.includes(admin.id);
                        return (
                          <button
                            key={admin.id}
                            onClick={() => toggleParticipant(admin.id)}
                            className={`w-full p-3 rounded-xl border transition-all text-right flex items-center gap-3 ${
                              isSelected
                                ? "border-[#D4AF37] bg-[#D4AF37]/10"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                              style={{ backgroundColor: ROLE_COLORS[admin.role] || '#6B7280' }}
                            >
                              {admin.name?.charAt(0) || '؟'}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-700">{admin.name}</p>
                              <p className="text-xs text-slate-400">{ROLE_NAMES[admin.role]}</p>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-[#D4AF37]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    الموضوع <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newConvSubject}
                    onChange={(e) => setNewConvSubject(e.target.value)}
                    placeholder="مثال: استفسار عن الباقات"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    الرسالة <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newConvMessage}
                    onChange={(e) => setNewConvMessage(e.target.value)}
                    placeholder="اكتب رسالتك هنا..."
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setShowNewMessage(false)}
                  className="flex-1 px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCreateConversation}
                  disabled={sending || !newConvDepartment || !newConvSubject.trim() || !newConvMessage.trim()}
                  className="flex-1 px-5 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>إرسال</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
