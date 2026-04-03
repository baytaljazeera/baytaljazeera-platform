"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  MessageCircle,
  Send,
  CheckCheck,
  RefreshCw,
  Clock,
  AlertCircle,
  User,
  Bell,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Conversation {
  phone: string;
  last_message: string;
  last_direction: "inbound" | "outbound";
  last_message_at: string;
  unread_count: number;
}

interface Message {
  id: number;
  phone: string;
  message: string;
  direction: "inbound" | "outbound";
  is_read: boolean;
  status: string;
  twilio_sid: string | null;
  created_at: string;
}

// ─── Audio helper (Web Audio API — no external file needed) ──────────────────
function playDing() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  return `منذ ${Math.floor(h / 24)} ي`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WhatsAppCommandCenter() {
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");

  // Settings
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // Inbox
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [notifyPermission, setNotifyPermission] = useState(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default"
  );

  // Track last known inbound count to detect new messages
  const prevInboundRef = useRef<number>(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/settings`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setWelcomeMsg(data.welcome_message || "");
      }
    } catch {}
  }, []);

  const fetchMessages = useCallback(
    async (phone: string, silent = false) => {
      if (!silent) setLoadingMsgs(true);
      try {
        const res = await fetch(
          `${API_URL}/api/admin/whatsapp/messages/${encodeURIComponent(phone)}`,
          { headers: getAuthHeaders(), credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
        // Mark as read
        await fetch(
          `${API_URL}/api/admin/whatsapp/read/${encodeURIComponent(phone)}`,
          {
            method: "PUT",
            headers: getAuthHeaders(),
            credentials: "include",
          }
        );
        // Refresh unread badge
        setConversations((prev) =>
          prev.map((c) =>
            c.phone === phone ? { ...c, unread_count: 0 } : c
          )
        );
      } catch {}
      if (!silent) setLoadingMsgs(false);
    },
    []
  );

  const handleSelectConversation = useCallback(
    async (phone: string) => {
      setSelectedPhone(phone);
      await fetchMessages(phone);
      replyInputRef.current?.focus();
    },
    [fetchMessages]
  );

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingConvos(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/whatsapp/messages`, {
          headers: getAuthHeaders(),
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const convos: Conversation[] = data.conversations || [];

          const totalUnread = convos.reduce((s, c) => s + c.unread_count, 0);
          if (silent && totalUnread > prevInboundRef.current) {
            playDing();

            if (
              document.visibilityState === "hidden" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              const newMsgConvo = convos.find((c) => c.unread_count > 0);
              if (newMsgConvo) {
                const notification = new Notification(
                  "بيت الجزيرة — رسالة جديدة 🏠",
                  {
                    body: `من: ${newMsgConvo.phone}\n${newMsgConvo.last_message}`,
                    icon: "/favicon.ico",
                    tag: "new-whatsapp-msg",
                  }
                );

                setTimeout(() => notification.close(), 5000);

                notification.onclick = () => {
                  window.focus();
                  void handleSelectConversation(newMsgConvo.phone);
                  notification.close();
                };
              }
            }
          }
          prevInboundRef.current = totalUnread;
          setConversations(convos);
        }
      } catch {}
      if (!silent) setLoadingConvos(false);
    },
    [handleSelectConversation]
  );

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSettings();
    fetchConversations();
  }, [fetchSettings, fetchConversations]);

  // Auto-poll conversations every 5 s
  useEffect(() => {
    const id = setInterval(() => fetchConversations(true), 5000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  // Auto-poll open thread every 5 s
  useEffect(() => {
    if (!selectedPhone) return;
    const id = setInterval(() => fetchMessages(selectedPhone, true), 5000);
    return () => clearInterval(id);
  }, [selectedPhone, fetchMessages]);

  // Scroll to bottom when messages change (double rAF so layout is final before scroll)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    let rafId: number;

    const scrollToBottom = () => {
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: selectedPhone ? "auto" : "smooth",
          });
        });
      });
    };

    scrollToBottom();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [messages, selectedPhone]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotifyPermission(permission);
    if (permission === "granted") {
      toast.success("تم تفعيل إشعارات سطح المكتب");
    }
  };

  async function handleSaveSettings() {
    if (!welcomeMsg.trim()) {
      toast.error("الرسالة الترحيبية لا يمكن أن تكون فارغة");
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/settings`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ welcome_message: welcomeMsg }),
      });
      const data = await res.json();
      if (res.ok) toast.success(data.message || "تم الحفظ");
      else toast.error(data.error || "حدث خطأ");
    } catch {
      toast.error("فشل الاتصال بالخادم");
    }
    setSavingSettings(false);
  }

  async function handleSendReply() {
    if (!selectedPhone || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/send`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ phone: selectedPhone, message: replyText.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setReplyText("");
        await fetchMessages(selectedPhone, true);
      } else {
        toast.error(data.error || "فشل الإرسال");
      }
    } catch {
      toast.error("فشل الاتصال بالخادم");
    }
    setSending(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div
      className="flex flex-col h-[calc(100vh-90px)] w-full bg-[#f0f4f8] overflow-hidden rounded-xl border border-slate-200"
      dir="rtl"
    >
      {/* 1. Header Area - MUST NOT SHRINK OR GROW */}
      <div className="shrink-0 flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#002845]">
              مركز القيادة — واتساب
            </h1>
            <p className="text-xs text-slate-500">
              {totalUnread > 0 ? (
                <span className="text-emerald-600 font-bold">
                  {totalUnread} رسالة غير مقروءة
                </span>
              ) : (
                "لا توجد رسائل غير مقروءة"
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fetchConversations(false)}
            disabled={loadingConvos}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingConvos ? "animate-spin" : ""}`}
            />
            تحديث
          </button>
          {notifyPermission === "default" && (
            <button
              type="button"
              onClick={() => void requestNotificationPermission()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <Bell className="h-4 w-4" />
              تفعيل الإشعارات
            </button>
          )}
          {(["inbox", "settings"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                tab === key
                  ? "bg-[#002845] text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {key === "inbox" ? "صندوق الوارد" : "الإعدادات"}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Main Content Area - MUST HAVE min-h-0 to force internal scroll */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {tab === "settings" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-lg font-bold text-[#002845] mb-4">
                الرسالة الترحيبية التلقائية
              </h2>
              <textarea
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#002845]/30 resize-y font-sans tracking-normal leading-relaxed"
                dir="rtl"
              />
              <div className="mt-4 text-left">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl bg-[#002845] text-white font-semibold text-sm"
                >
                  {savingSettings ? (
                    <RefreshCw className="inline h-4 w-4 animate-spin" />
                  ) : (
                    "حفظ الرسالة"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "inbox" && (
          <div className="flex-1 flex min-h-0 w-full">
            {/* LEFT PANE: Conversations List */}
            <div className="w-80 flex flex-col shrink-0 bg-slate-50 border-l border-slate-200 overflow-hidden">
              <div className="shrink-0 p-3 bg-white border-b border-slate-100">
                <h3 className="text-sm font-bold text-[#002845]">
                  المحادثات ({conversations.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {loadingConvos ? (
                  <div className="flex h-32 items-center justify-center">
                    <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center gap-2 text-slate-400">
                    <MessageCircle className="h-8 w-8 opacity-30" />
                    <p className="text-sm">لا توجد محادثات بعد</p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.phone}
                      type="button"
                      onClick={() => handleSelectConversation(conv.phone)}
                      className={`w-full border-b border-slate-50 px-4 py-3 text-right transition-colors ${
                        selectedPhone === conv.phone
                          ? "border-r-2 border-r-[#002845] bg-[#002845]/5"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-600">
                              <User className="h-4 w-4 text-white" />
                            </div>
                            <span className="truncate text-sm font-bold text-[#002845]">
                              {conv.phone}
                            </span>
                          </div>
                          <p className="mt-1 truncate pr-10 text-xs text-slate-500">
                            {conv.last_direction === "inbound" ? "← " : "→ "}
                            {conv.last_message}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                            <Clock className="h-2.5 w-2.5" />
                            {timeAgo(conv.last_message_at)}
                          </span>
                          {conv.unread_count > 0 && (
                            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT PANE: Chat Thread */}
            <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden relative">
              {!selectedPhone ? (
                <div className="flex-1 flex items-center justify-center text-slate-400">
                  اختر محادثة للبدء
                </div>
              ) : (
                <>
                  <div className="shrink-0 flex items-center p-4 bg-slate-50 border-b border-slate-100">
                    <p className="font-bold text-[#002845]">{selectedPhone}</p>
                  </div>

                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 bg-[#e5ddd5]/20"
                  >
                    {loadingMsgs ? (
                      <div className="flex h-24 items-center justify-center">
                        <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex h-24 items-center justify-center gap-2 text-slate-400">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">لا توجد رسائل</span>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isOutbound = msg.direction === "outbound";
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOutbound ? "justify-start" : "justify-end"}`}
                          >
                            <div
                              className={`max-w-[72%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                                isOutbound
                                  ? "rounded-tl-sm bg-white text-slate-800"
                                  : "rounded-tr-sm bg-[#002845] text-white"
                              }`}
                            >
                              {msg.message}
                              <div
                                className={`mt-1 flex items-center gap-1 text-[10px] ${
                                  isOutbound
                                    ? "justify-start text-slate-400"
                                    : "justify-end text-white/60"
                                }`}
                              >
                                {formatTime(msg.created_at)}
                                {isOutbound && <CheckCheck className="h-3 w-3" />}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="shrink-0 p-3 bg-white border-t border-slate-200">
                    <div className="flex gap-2">
                      <textarea
                        ref={replyInputRef}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply();
                          }
                        }}
                        rows={2}
                        className="flex-1 resize-none rounded-xl border border-slate-200 p-3 text-sm focus:outline-none font-sans tracking-normal leading-relaxed"
                        placeholder="اكتب ردك هنا..."
                        dir="rtl"
                      />
                      <button
                        type="button"
                        onClick={handleSendReply}
                        disabled={sending || !replyText.trim()}
                        className="w-12 rounded-xl bg-[#002845] text-white flex items-center justify-center hover:bg-[#003d5c]"
                      >
                        {sending ? (
                          <RefreshCw className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
