"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useCallback } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  MessageCircle,
  Settings,
  Send,
  CheckCheck,
  RefreshCw,
  Phone,
  Clock,
  Save,
  Inbox,
  AlertCircle,
  User,
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

  // Track last known inbound count to detect new messages
  const prevInboundRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setLoadingConvos(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/whatsapp/messages`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const convos: Conversation[] = data.conversations || [];

        // Detect new inbound messages across all conversations
        const totalUnread = convos.reduce((s, c) => s + c.unread_count, 0);
        if (silent && totalUnread > prevInboundRef.current) {
          playDing();
        }
        prevInboundRef.current = totalUnread;
        setConversations(convos);
      }
    } catch {}
    if (!silent) setLoadingConvos(false);
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

  // ── Measure the sticky topbar height so we can position the panel exactly ──
  const [topbarH, setTopbarH] = useState(0);
  useEffect(() => {
    function measure() {
      const header = document.querySelector("header");
      if (header) setTopbarH(header.getBoundingClientRect().height);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ── Lock body scroll so the global footer never peeks below the chat UI ────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleSelectConversation(phone: string) {
    setSelectedPhone(phone);
    await fetchMessages(phone);
    replyInputRef.current?.focus();
  }

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
    /*
     * Root: fills exactly the remaining viewport below the admin topbar.
     * overflow-hidden stops any child from pushing the page down or into the
     * global footer. flex-col lets header/tabs stay fixed-height while the
     * content area stretches to fill all remaining space.
     */
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden bg-[#f0f4f8] px-4 pt-4 md:px-6 md:pt-6"
      style={{ top: topbarH || 0 }}
      dir="rtl"
    >
      {/* ── Header — shrink-0 so it never grows or scrolls ─────────────── */}
      <div className="shrink-0 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#002845]">
              مركز القيادة — واتساب
            </h1>
            <p className="text-sm text-slate-500">
              {totalUnread > 0 ? (
                <span className="text-emerald-600 font-semibold">
                  {totalUnread} رسالة غير مقروءة
                </span>
              ) : (
                "لا توجد رسائل غير مقروءة"
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchConversations(false)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium shadow-sm transition"
        >
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      {/* ── Tabs — shrink-0 ──────────────────────────────────────────────── */}
      <div className="shrink-0 flex gap-2 mb-4">
        {(
          [
            { key: "inbox", label: "صندوق الوارد", icon: Inbox },
            { key: "settings", label: "الإعدادات", icon: Settings },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              tab === key
                ? "bg-[#002845] text-white shadow-md"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === "inbox" && totalUnread > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/*
       * ── Content area — flex-1 min-h-0 ────────────────────────────────────
       * min-h-0 overrides the default min-height:auto so this div can shrink
       * below its content height and give the split-pane a real boundary.
       */}
      <div className="flex-1 min-h-0">

        {/* ── Settings Tab ───────────────────────────────────────────────── */}
        {tab === "settings" && (
          <div className="h-full overflow-y-auto pb-6">
            <div className="max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-lg font-bold text-[#002845] mb-1 flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#D4AF37]" />
                الرسالة الترحيبية التلقائية
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                تُرسل تلقائياً لكل عميل يتواصل معكم عبر واتساب لأول مرة.
              </p>
              <textarea
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#002845]/30 resize-y font-tajawal"
                placeholder="اكتب الرسالة الترحيبية هنا..."
                dir="rtl"
                lang="ar"
              />
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {welcomeMsg.length} حرف
                </span>
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#002845] text-white font-semibold text-sm hover:bg-[#003d5c] disabled:opacity-60 transition shadow"
                >
                  {savingSettings ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  حفظ الرسالة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Inbox Tab ──────────────────────────────────────────────────── */}
        {tab === "inbox" && (
          /*
           * h-full fills the flex-1 content area exactly.
           * Both child panes are flex-col with overflow-hidden so they
           * never spill outside this boundary.
           */
          <div className="flex gap-4 h-full">

            {/* Left pane — conversation list */}
            <div className="w-80 shrink-0 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Fixed header */}
              <div className="shrink-0 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-bold text-[#002845] flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-500" />
                  المحادثات ({conversations.length})
                </h3>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loadingConvos ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
                    <MessageCircle className="w-8 h-8 opacity-30" />
                    <p className="text-sm">لا توجد محادثات بعد</p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.phone}
                      onClick={() => handleSelectConversation(conv.phone)}
                      className={`w-full text-right px-4 py-3 border-b border-slate-50 transition-colors ${
                        selectedPhone === conv.phone
                          ? "bg-[#002845]/5 border-r-2 border-r-[#002845]"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-sm font-bold text-[#002845] truncate">
                              {conv.phone}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 truncate pr-10">
                            {conv.last_direction === "inbound" ? "← " : "→ "}
                            {conv.last_message}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {timeAgo(conv.last_message_at)}
                          </span>
                          {conv.unread_count > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-emerald-500 text-white text-[10px] font-bold rounded-full px-1">
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

            {/* Right pane — chat thread */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {!selectedPhone ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <MessageCircle className="w-14 h-14 opacity-20" />
                  <p className="text-base font-medium">اختر محادثة للبدء</p>
                  <p className="text-sm opacity-70">
                    اضغط على أي محادثة من القائمة اليسار
                  </p>
                </div>
              ) : (
                <>
                  {/* Thread header — pinned, never scrolls */}
                  <div className="shrink-0 px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#002845]">
                        {selectedPhone}
                      </p>
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        واتساب
                      </p>
                    </div>
                  </div>

                  {/* Messages — scrolls internally, never pushes reply box down */}
                  <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 bg-[#e5ddd5]/20">
                    {loadingMsgs ? (
                      <div className="flex items-center justify-center h-24">
                        <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-slate-400 gap-2">
                        <AlertCircle className="w-4 h-4" />
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
                              className={`max-w-[72%] px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                isOutbound
                                  ? "bg-white text-slate-800 rounded-tl-sm"
                                  : "bg-[#002845] text-white rounded-tr-sm"
                              }`}
                            >
                              {msg.message}
                              <div
                                className={`flex items-center gap-1 mt-1 text-[10px] ${
                                  isOutbound
                                    ? "text-slate-400 justify-start"
                                    : "text-white/60 justify-end"
                                }`}
                              >
                                {formatTime(msg.created_at)}
                                {isOutbound && <CheckCheck className="w-3 h-3" />}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply box — shrink-0 keeps it pinned at the bottom */}
                  <div className="shrink-0 border-t border-slate-100 px-4 py-3 bg-white">
                    <div className="flex items-end gap-3">
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
                        placeholder="اكتب ردك هنا... (Enter للإرسال، Shift+Enter لسطر جديد)"
                        rows={2}
                        className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#002845]/30 font-tajawal"
                        dir="rtl"
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={sending || !replyText.trim()}
                        className="w-11 h-11 rounded-xl bg-[#002845] text-white flex items-center justify-center hover:bg-[#003d5c] disabled:opacity-40 transition shadow shrink-0 mb-0.5"
                      >
                        {sending ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 text-right">
                      سيُرسل الرد من رقم واتساب الرسمي لبيت الجزيرة
                    </p>
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
