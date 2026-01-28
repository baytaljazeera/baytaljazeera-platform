"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, ArrowRight, Clock, Loader2, User, Search, Building2
} from "lucide-react";

type ListingInquiry = {
  id: number;
  listing_id: string;
  listing_title: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  recipient_display_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
  conversation_id?: string;
};

type ConversationMessage = {
  id: number;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  is_mine: boolean;
};

type CustomerConversation = {
  id: string;
  other_user_id: string;
  other_user_name: string;
  listing_id: string;
  listing_title: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  messages: ConversationMessage[];
};

export default function MessagesPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [conversations, setConversations] = useState<CustomerConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<CustomerConversation | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, []);

  // تحديث تلقائي للرسائل كل 3 ثواني
  useEffect(() => {
    if (!selectedConversation?.id) return;
    
    const pollInterval = setInterval(() => {
      refreshCurrentConversation();
    }, 3000);
    
    return () => clearInterval(pollInterval);
  }, [selectedConversation?.id]);

  async function refreshCurrentConversation() {
    if (!selectedConversation?.id) return;
    try {
      const res = await fetch(`/api/messages/customer-conversations/${selectedConversation.id}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(prev => {
          if (!prev || prev.id !== data.id) return prev;
          if (data.messages?.length !== prev.messages?.length) {
            return data;
          }
          return prev;
        });
      }
    } catch (err) {
      // silent fail for polling
    }
  }

  const prevConversationId = useRef<string | null>(null);
  const prevMessagesLength = useRef(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedConversation?.messages) {
      const currentLength = selectedConversation.messages.length;
      const isNewConversation = selectedConversation.id !== prevConversationId.current;
      
      if (isNewConversation) {
        setTimeout(() => scrollToBottom(), 100);
        prevConversationId.current = selectedConversation.id;
      } else if (currentLength > prevMessagesLength.current) {
        scrollToBottom();
      }
      prevMessagesLength.current = currentLength;
    }
  }, [selectedConversation?.messages, selectedConversation?.id]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  async function fetchConversations() {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL}/api/messages/customer-conversations`, { credentials: "include", headers: getAuthHeaders() });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        const data = await res.json();
        if (data.requiresVerification && data.email) {
          router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
          return;
        }
      }
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchConversation(convId: string) {
    try {
      const res = await fetch(`/api/messages/customer-conversations/${convId}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(data);
        setShowChatOnMobile(true);
        setConversations(prev =>
          prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c)
        );
      }
    } catch (err) {
      console.error("Error fetching conversation:", err);
    }
  }

  const handleBackToList = () => {
    setShowChatOnMobile(false);
  };

  async function handleSendReply() {
    if (!selectedConversation || !replyMessage.trim()) return;

    try {
      setSending(true);
      const res = await fetch(`/api/messages/customer-conversations/${selectedConversation.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: replyMessage.trim() }),
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

  const filteredConversations = conversations.filter(c => 
    c.other_user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.listing_title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#002845] flex items-center gap-3">
              <MessageCircle className="w-8 h-8 text-[#D4AF37]" />
              المراسلات
            </h1>
            <p className="text-slate-500 mt-1">محادثاتك مع المعلنين الآخرين</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="flex flex-col lg:grid lg:grid-cols-3 min-h-[600px] lg:min-h-[600px]">
            <div className={`lg:col-span-1 border-l border-slate-200 ${showChatOnMobile ? 'hidden lg:block' : 'block'}`}>
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
                <h2 className="text-lg font-bold text-white mb-3">المحادثات</h2>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="بحث..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  />
                </div>
              </div>

              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg">لا توجد محادثات</p>
                  <p className="text-sm text-slate-400 mt-2">
                    عندما تتواصل مع معلن بخصوص إعلان، ستظهر المحادثات هنا
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                  {filteredConversations.map((conv) => {
                    const isSelected = selectedConversation?.id === conv.id;

                    return (
                      <button
                        key={conv.id}
                        onClick={() => fetchConversation(conv.id)}
                        className={`w-full p-4 text-right transition-all hover:bg-slate-50 ${
                          isSelected ? "bg-[#D4AF37]/10 border-r-4 border-[#D4AF37]" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#002845] to-[#003d5c] flex items-center justify-center text-white">
                            <User className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-[#002845] truncate">
                                {conv.other_user_name}
                              </span>
                              {conv.unread_count > 0 && (
                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                  {conv.unread_count}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#D4AF37] truncate mt-0.5 flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {conv.listing_title}
                            </p>
                            <p className="text-sm text-slate-500 truncate mt-1">{conv.last_message}</p>
                            <span className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(conv.last_message_at)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`lg:col-span-2 flex flex-col flex-1 min-h-[500px] lg:min-h-0 ${showChatOnMobile ? 'block' : 'hidden lg:flex'}`}>
              {selectedConversation ? (
                <>
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleBackToList}
                        className="lg:hidden w-10 h-10 rounded-xl bg-[#D4AF37] flex items-center justify-center text-white hover:bg-[#B8860B] transition-colors"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </button>
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#002845] to-[#003d5c] flex items-center justify-center text-white">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-[#002845]">{selectedConversation.other_user_name}</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span className="truncate max-w-[150px] lg:max-w-none">{selectedConversation.listing_title}</span>
                          <a 
                            href={`/listing/${selectedConversation.listing_id}`}
                            className="text-[#D4AF37] hover:underline mr-2"
                          >
                            عرض الإعلان
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div 
                    ref={messagesContainerRef}
                    className="flex-1 p-4 overflow-y-auto h-[calc(100vh-350px)] lg:max-h-[400px] space-y-4 bg-gradient-to-b from-slate-50 to-white"
                  >
                    <AnimatePresence>
                      {selectedConversation.messages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex ${msg.is_mine ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[75%] p-3 rounded-2xl ${
                              msg.is_mine
                                ? "bg-[#002845] text-white rounded-bl-none"
                                : "bg-gradient-to-br from-[#D4AF37]/20 to-[#B8860B]/10 border border-[#D4AF37]/30 text-[#002845] rounded-br-none shadow-sm"
                            }`}
                          >
                            <p className={`text-sm mb-1 font-medium ${msg.is_mine ? "text-white/70" : "text-[#D4AF37]"}`}>
                              {msg.sender_name}
                            </p>
                            <p className={`leading-relaxed ${msg.is_mine ? "text-sm" : "text-base"}`}>{msg.content}</p>
                            <span className={`text-[10px] mt-1 block ${msg.is_mine ? "text-white/60" : "text-[#B8860B]/70"}`}>
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="اكتب رسالتك..."
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={!replyMessage.trim() || sending}
                        className="px-5 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        {sending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center">
                    <MessageCircle className="w-20 h-20 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-[#002845] mb-2">اختر محادثة</h3>
                    <p className="text-slate-500">اختر محادثة من القائمة لعرض الرسائل</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            للتواصل مع الدعم أو تقديم شكوى، استخدم{" "}
            <a href="/account/complaints" className="text-[#D4AF37] hover:underline font-medium">
              صفحة الشكاوى
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
