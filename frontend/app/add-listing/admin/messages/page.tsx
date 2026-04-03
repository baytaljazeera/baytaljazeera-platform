"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";
import { playDing, adminToastStyle } from "@/lib/adminNotifications";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Send,
  Plus,
  Clock,
  CheckCircle2,
  Loader2,
  X,
  ChevronLeft,
  Users,
  Bell,
  RefreshCw,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";

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
  super_admin: "المدير العام",
  finance_admin: "المالية",
  support_admin: "الدعم الفني",
  content_admin: "المحتوى",
  admin: "مدير",
};

const JSON_HEADERS = () => ({
  ...getAuthHeaders(),
  "Content-Type": "application/json",
});

export default function AdminMessagesPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const prevUnreadTotalRef = useRef(-1);

  const [isLoading, setIsLoading] = useState(true);
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationWithMessages | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [newConvDepartment, setNewConvDepartment] = useState("");
  const [newConvSubject, setNewConvSubject] = useState("");
  const [newConvMessage, setNewConvMessage] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    []
  );
  const [replyMessage, setReplyMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [notifyPermission, setNotifyPermission] = useState(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default"
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUserId(data.user?.id || data.id || "");
      }
    } catch (err) {
      console.error("Error fetching user:", err);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin-messages/departments`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
      }
    } catch (err) {
      console.error("Error fetching departments:", err);
    }
  }, []);

  const fetchAdmins = useCallback(async (department: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/admin-messages/admins?department=${encodeURIComponent(department)}`,
        { credentials: "include", headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setAdmins(data);
      }
    } catch (err) {
      console.error("Error fetching admins:", err);
    }
  }, []);

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
        setLoadingConvos(true);
      }
      try {
        const res = await fetch(`${API_URL}/api/admin-messages/conversations`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.status === 401 || res.status === 403) {
          router.push("/admin-login");
          return;
        }
        if (res.ok) {
          const data: Conversation[] = await res.json();
          const totalUnread = data.reduce((s, c) => s + (c.unread_count || 0), 0);
          if (
            silent &&
            prevUnreadTotalRef.current >= 0 &&
            totalUnread > prevUnreadTotalRef.current
          ) {
            playDing();
            const hot = data.find((c) => (c.unread_count || 0) > 0);
            if (hot) {
              toast(`رسالة داخلية جديدة — ${hot.subject}`, {
                icon: "💬",
                duration: 5000,
                position: "top-right",
                style: adminToastStyle,
              });
              if (
                !document.hasFocus() &&
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                const notification = new Notification(
                  "بيت الجزيرة — مراسلة داخلية",
                  {
                    body: `${hot.last_message?.content?.slice(0, 120) || "محادثة فريق الإدارة"}`,
                    icon: "/favicon.ico",
                    tag: `internal-msg-${hot.id}`,
                    requireInteraction: true,
                  }
                );
                notification.onclick = () => {
                  window.focus();
                  notification.close();
                };
              }
            }
          }
          prevUnreadTotalRef.current = totalUnread;
          setConversations(data);
        }
      } catch (err) {
        console.error("Error fetching conversations:", err);
      } finally {
        if (!silent) {
          setIsLoading(false);
          setLoadingConvos(false);
        }
      }
    },
    [router]
  );

  const fetchConversation = useCallback(async (id: number) => {
    try {
      const res = await fetch(
        `${API_URL}/api/admin-messages/conversations/${id}`,
        { credentials: "include", headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(data);
        setConversations((prev) => {
          const next = prev.map((c) =>
            c.id === id ? { ...c, unread_count: 0 } : c
          );
          prevUnreadTotalRef.current = next.reduce(
            (s, c) => s + (c.unread_count || 0),
            0
          );
          return next;
        });
      }
    } catch (err) {
      console.error("Error fetching conversation:", err);
    }
  }, []);

  useEffect(() => {
    void fetchConversations(false);
    void fetchDepartments();
    void fetchCurrentUser();
  }, [fetchConversations, fetchDepartments, fetchCurrentUser]);

  useEffect(() => {
    const id = setInterval(() => void fetchConversations(true), 10000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    const cid = selectedConversation?.id;
    if (!cid) return;
    const id = setInterval(() => {
      void fetch(`${API_URL}/api/admin-messages/conversations/${cid}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.messages) {
            setSelectedConversation((prev) =>
              prev && prev.id === cid
                ? {
                    ...prev,
                    ...data,
                    messages: data.messages,
                    participants: data.participants ?? prev.participants,
                  }
                : prev
            );
          }
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [selectedConversation?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages, scrollToBottom]);

  useEffect(() => {
    if (newConvDepartment) fetchAdmins(newConvDepartment);
  }, [newConvDepartment, fetchAdmins]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const sync = () => setNotifyPermission(Notification.permission);
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const handleBellNotificationClick = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("المتصفح لا يدعم إشعارات سطح المكتب");
      return;
    }
    if (!window.isSecureContext) {
      toast.error("الإشعارات تعمل على اتصال آمن (HTTPS)");
      return;
    }
    let perm = Notification.permission;
    setNotifyPermission(perm);
    if (perm === "default") {
      try {
        perm = await Notification.requestPermission();
        setNotifyPermission(perm);
      } catch {
        toast.error("فشل طلب إذن الإشعارات");
        return;
      }
    }
    if (perm === "granted") {
      try {
        const testNotif = new Notification("تجربة ناجحة 🎉", {
          body: "إشعارات المراسلات الداخلية جاهزة.",
          icon: "/favicon.ico",
        });
        setTimeout(() => testNotif.close(), 4000);
        toast.success("تم إرسال إشعار تجريبي");
      } catch {
        toast.error("تعذر عرض الإشعار");
      }
      return;
    }
    toast.error(
      "تم رفض الإشعارات. اسمح بالإشعارات من إعدادات المتصفح لهذا الموقع."
    );
  }, []);

  async function handleCreateConversation() {
    if (!newConvDepartment || !newConvSubject.trim() || !newConvMessage.trim())
      return;

    try {
      setSending(true);
      const res = await fetch(`${API_URL}/api/admin-messages/conversations`, {
        method: "POST",
        headers: JSON_HEADERS(),
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
        setConversations((prev) => [newConv, ...prev]);
        setShowNewMessage(false);
        setNewConvDepartment("");
        setNewConvSubject("");
        setNewConvMessage("");
        setSelectedParticipants([]);
        void fetchConversation(newConv.id);
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
      const res = await fetch(
        `${API_URL}/api/admin-messages/conversations/${selectedConversation.id}/messages`,
        {
          method: "POST",
          headers: JSON_HEADERS(),
          credentials: "include",
          body: JSON.stringify({ content: replyMessage.trim() }),
        }
      );

      if (res.ok) {
        const newMessage = await res.json();
        setSelectedConversation((prev) =>
          prev
            ? { ...prev, messages: [...prev.messages, newMessage] }
            : null
        );
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
    return date.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const previewLine = (text: string, max = 52) => {
    const t = (text || "").trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  };

  const totalUnread = conversations.reduce(
    (s, c) => s + (c.unread_count || 0),
    0
  );

  const selectThread = (id: number) => {
    void fetchConversation(id);
    replyInputRef.current?.focus();
  };

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-96" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#002845]" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-90px)] w-full max-w-[1600px] mx-auto bg-[#f0f4f8] overflow-hidden rounded-xl border border-slate-200"
      dir="rtl"
    >
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#002845] to-[#003d5c] flex items-center justify-center shadow-md shrink-0">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-[#002845] truncate">
              المراسلات الداخلية
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              {totalUnread > 0 ? (
                <span className="text-emerald-600 font-bold">
                  {totalUnread} غير مقروء — بين زملاء الإدارة فقط
                </span>
              ) : (
                "لا توجد رسائل غير مقروءة في فريقك"
              )}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
              يختلف عن «مراقبة المحادثات»: هناك تتابع رسائل المستخدمين على
              الإعلانات؛ هنا محادثات الموظفين داخل لوحة التحكم.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchConversations(false)}
            disabled={loadingConvos}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingConvos ? "animate-spin" : ""}`}
            />
            تحديث
          </button>
          {notifyPermission !== "denied" && (
            <button
              type="button"
              onClick={() => void handleBellNotificationClick()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <Bell className="h-4 w-4" />
              {notifyPermission === "granted"
                ? "تجربة الإشعار"
                : "تفعيل الإشعارات"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewMessage(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#002845] text-white px-4 py-2 text-sm font-bold hover:bg-[#003d5c] shadow-sm"
          >
            <Plus className="w-4 h-4" />
            رسالة جديدة
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div
          className={`w-full md:w-80 flex flex-col shrink-0 bg-slate-50 border-l border-slate-200 overflow-hidden ${
            selectedConversation ? "max-md:hidden" : ""
          }`}
        >
          <div className="shrink-0 p-3 bg-white border-b border-slate-100">
            <h2 className="text-sm font-bold text-[#002845]">
              المحادثات ({conversations.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">لا توجد محادثات</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {conversations.map((conv) => {
                  const isSelected = selectedConversation?.id === conv.id;
                  const recipients = conv.other_participants || [];
                  const recipientNames = recipients
                    .map((p) => p.name || ROLE_NAMES[p.role] || "مدير")
                    .join("، ");
                  const unread = conv.unread_count || 0;
                  const awaiting = conv.awaiting_reply_count || 0;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => selectThread(conv.id)}
                      className={`w-full p-3 text-right transition-colors border-b border-slate-50 ${
                        isSelected
                          ? "border-r-2 border-r-[#002845] bg-[#002845]/5"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="relative shrink-0">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base"
                            style={{
                              backgroundColor:
                                conv.department_info?.color || "#4CAF50",
                            }}
                          >
                            {conv.department_info?.icon || "📢"}
                          </div>
                          {unread > 0 && (
                            <span
                              className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
                              title="غير مقروء"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-[#002845] truncate">
                              {conv.subject}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {awaiting > 0 && (
                                <span
                                  className="bg-rose-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full"
                                  title="بانتظار ردك"
                                >
                                  {awaiting}
                                </span>
                              )}
                              {unread > 0 && (
                                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                                  {unread}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500">
                            <span>{conv.initiated_by_me ? "إلى:" : "من:"}</span>
                            <span className="truncate font-medium">
                              {conv.initiated_by_me
                                ? recipientNames || "المدراء"
                                : conv.creator_name}
                            </span>
                          </div>
                          {conv.last_message && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {conv.last_message_by_me ? "أنت: " : ""}
                              {previewLine(conv.last_message.content || "")}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${conv.department_info?.color || "#4CAF50"}20`,
                                color: conv.department_info?.color || "#4CAF50",
                              }}
                            >
                              {conv.department_info?.name_ar || "عام"}
                            </span>
                            <span className="text-[10px] text-slate-400">
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

        <div
          className={`flex-1 flex flex-col min-h-0 overflow-hidden bg-white ${
            !selectedConversation ? "max-md:hidden" : ""
          }`}
        >
          {selectedConversation ? (
            <>
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedConversation(null)}
                    className="md:hidden p-2 rounded-lg hover:bg-slate-200 shrink-0"
                    aria-label="رجوع للقائمة"
                  >
                    <ChevronLeft className="w-5 h-5 text-[#002845]" />
                  </button>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base shrink-0"
                    style={{
                      backgroundColor:
                        selectedConversation.department_info?.color || "#4CAF50",
                    }}
                  >
                    {selectedConversation.department_info?.icon || "📢"}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-[#002845] text-sm truncate">
                      {selectedConversation.subject}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {selectedConversation.department_info?.name_ar || "عام"}
                    </p>
                  </div>
                </div>
                <div className="text-left text-[11px] text-slate-500">
                  {(() => {
                    const otherParticipants =
                      selectedConversation.participants?.filter(
                        (p) => String(p.user_id) !== String(currentUserId)
                      ) || [];
                    return (
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {otherParticipants.length > 0
                            ? `${otherParticipants.length} مشارك`
                            : "أنت فقط"}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3 bg-[#e5ddd5]/20"
              >
                {selectedConversation.messages.map((msg) => {
                  const isMe = String(msg.sender_id) === String(currentUserId);

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[72%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                          isMe
                            ? "rounded-tl-sm bg-white text-slate-800"
                            : "rounded-tr-sm bg-[#002845] text-white"
                        }`}
                      >
                        <div
                          className={`flex items-center gap-2 mb-1 flex-wrap ${isMe ? "" : "justify-end"}`}
                        >
                          <span
                            className={`text-[11px] font-bold ${isMe ? "text-slate-700" : "text-white/90"}`}
                          >
                            {isMe ? "أنت" : msg.sender_name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isMe
                                ? "bg-slate-100 text-slate-600"
                                : "bg-white/15 text-white/85"
                            }`}
                          >
                            {ROLE_NAMES[msg.sender_role] || msg.sender_role}
                          </span>
                        </div>
                        <p
                          className={
                            isMe ? "text-slate-800" : "text-white"
                          }
                        >
                          {msg.content}
                        </p>
                        <div
                          className={`mt-1 flex items-center gap-1 text-[10px] ${
                            isMe
                              ? "justify-start text-slate-400"
                              : "justify-end text-white/60"
                          }`}
                        >
                          {formatTime(msg.created_at)}
                          {isMe && <CheckCheck className="h-3 w-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="shrink-0 p-3 bg-white border-t border-slate-200">
                <div className="flex gap-2">
                  <textarea
                    ref={replyInputRef}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendReply();
                      }
                    }}
                    rows={2}
                    placeholder="اكتب ردك هنا..."
                    className="flex-1 resize-none rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#002845]/25 font-sans leading-relaxed"
                    dir="rtl"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendReply()}
                    disabled={sending || !replyMessage.trim()}
                    className="w-12 rounded-xl bg-[#002845] text-white flex items-center justify-center hover:bg-[#003d5c] disabled:opacity-50"
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
            <div className="flex-1 flex items-center justify-center text-slate-400 p-6">
              <div className="text-center max-w-sm">
                <MessageCircle className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                <p className="font-bold text-slate-500">اختر محادثة</p>
                <p className="text-sm mt-1">
                  أو ابدأ رسالة جديدة مع فريق الإدارة
                </p>
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
              <div className="p-5 border-b border-slate-100 bg-[#002845] flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">رسالة جديدة</h3>
                <button
                  type="button"
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
                      const sel = newConvDepartment === dept.id;
                      return (
                        <button
                          key={dept.id}
                          type="button"
                          onClick={() => setNewConvDepartment(dept.id)}
                          className={`p-3 rounded-xl border-2 transition-all text-center ${
                            sel
                              ? "border-[#002845] bg-[#002845]/5"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div
                            className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-xl text-white"
                            style={{ backgroundColor: dept.color }}
                          >
                            {dept.icon}
                          </div>
                          <span
                            className={`text-xs font-medium ${sel ? "text-[#002845]" : "text-slate-600"}`}
                          >
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
                        const sel = selectedParticipants.includes(admin.id);
                        return (
                          <button
                            key={admin.id}
                            type="button"
                            onClick={() => toggleParticipant(admin.id)}
                            className={`w-full p-3 rounded-xl border transition-all text-right flex items-center gap-3 ${
                              sel
                                ? "border-[#002845] bg-[#002845]/5"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                              {admin.name?.charAt(0) || "؟"}
                            </div>
                            <div className="flex-1 text-right">
                              <p className="text-sm font-medium text-slate-700">
                                {admin.name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {ROLE_NAMES[admin.role]}
                              </p>
                            </div>
                            {sel && (
                              <CheckCircle2 className="w-5 h-5 text-[#002845]" />
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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-[#002845] focus:ring-2 focus:ring-[#002845]/20 outline-none"
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
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-[#002845] focus:ring-2 focus:ring-[#002845]/20 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewMessage(false)}
                  className="flex-1 px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateConversation()}
                  disabled={
                    sending ||
                    !newConvDepartment ||
                    !newConvSubject.trim() ||
                    !newConvMessage.trim()
                  }
                  className="flex-1 px-5 py-3 bg-[#002845] text-white rounded-xl font-semibold shadow-md hover:bg-[#003d5c] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
