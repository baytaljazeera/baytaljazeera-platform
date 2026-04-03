"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
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
  Ban,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Conversation {
  phone: string;
  last_message: string;
  last_direction: "inbound" | "outbound";
  last_message_at: string;
  unread_count: number;
  status?: "open" | "pending" | "resolved";
  is_blocked?: boolean;
}

function normalizeConversationStatus(
  s: unknown
): NonNullable<Conversation["status"]> {
  if (s === "open" || s === "pending" || s === "resolved") return s;
  return "open";
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
  const [filterStatus, setFilterStatus] = useState<
    "all" | "open" | "pending" | "resolved"
  >("all");
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
          const raw = data.conversations || [];
          const convos: Conversation[] = raw.map((c: Record<string, unknown>) => {
            const status = normalizeConversationStatus(c.status);
            const is_blocked = c.is_blocked === true;
            return { ...c, status, is_blocked } as Conversation;
          });

          const totalUnread = convos.reduce((s, c) => s + c.unread_count, 0);
          if (silent && totalUnread > prevInboundRef.current) {
            playDing();

            const newMsgConvo = convos.find((c) => c.unread_count > 0);
            if (newMsgConvo) {
              toast(`رسالة جديدة من ${newMsgConvo.phone}`, {
                icon: "📩",
                duration: 5000,
                position: "top-right",
                style: {
                  borderRadius: "10px",
                  background: "#333",
                  color: "#fff",
                  padding: "16px",
                  fontWeight: "bold",
                },
              });

              if (
                !document.hasFocus() &&
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                const notification = new Notification(
                  "بيت الجزيرة — رسالة جديدة 🏠",
                  {
                    body: `من: ${newMsgConvo.phone}\n${newMsgConvo.last_message}`,
                    icon: "/favicon.ico",
                    tag: "new-whatsapp-msg",
                    requireInteraction: true,
                  }
                );

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

  // Keep UI label in sync with real Notification.permission (fixes hydration / settings changes)
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
          body: "إشعارات بيت الجزيرة تعمل بشكل ممتاز!",
          icon: "/favicon.ico",
        });
        setTimeout(() => testNotif.close(), 4000);
        toast.success("تم إرسال إشعار تجريبي");
      } catch {
        toast.error("تعذر عرض الإشعار — جرّب إعدادات الموقع في المتصفح");
      }
      return;
    }

    toast.error(
      "تم رفض الإشعارات. افتح إعدادات الموقع في المتصفح واسمح بالإشعارات لبيت الجزيرة."
    );
  }, []);

  const handleUpdateStatus = async (
    newStatus: "open" | "pending" | "resolved"
  ) => {
    if (!selectedPhone) return;
    try {
      const res = await fetch(
        `${API_URL}/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/status`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          credentials: "include",
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) =>
            c.phone === selectedPhone ? { ...c, status: newStatus } : c
          )
        );
        toast.success("تم تحديث حالة المحادثة");
      }
    } catch {}
  };

  const handleToggleBlock = async (
    phone: string,
    _currentBlockStatus: boolean
  ) => {
    try {
      const res = await fetch(
        `${API_URL}/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}/block`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { is_blocked?: boolean };
        setConversations((prev) =>
          prev.map((c) =>
            c.phone === phone ? { ...c, is_blocked: data.is_blocked === true } : c
          )
        );
        toast.success(
          data.is_blocked ? "تم حظر العميل 🚫" : "تم فك الحظر ✅"
        );
      }
    } catch {}
  };

  const handleDeleteConversation = async (phone: string) => {
    if (
      !confirm(
        "هل أنت متأكد من حذف هذه المحادثة بالكامل؟ لا يمكن التراجع عن هذا الإجراء."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `${API_URL}/api/admin/whatsapp/conversations/${encodeURIComponent(phone)}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.phone !== phone));
        if (selectedPhone === phone) {
          setSelectedPhone(null);
          setMessages([]);
        }
        toast.success("تم حذف المحادثة 🗑️");
      }
    } catch {}
  };

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
        setConversations((prev) =>
          prev.map((c) =>
            c.phone === selectedPhone ? { ...c, status: "pending" } : c
          )
        );
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

  const filteredConversations = useMemo(() => {
    if (filterStatus === "all") return conversations;
    return conversations.filter((c) => {
      const s = c.status ?? "open";
      return s === filterStatus;
    });
  }, [conversations, filterStatus]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.phone === selectedPhone),
    [conversations, selectedPhone]
  );

  const selectedHeaderStatus = useMemo(
    () => selectedConversation?.status ?? "open",
    [selectedConversation]
  );

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
                  المحادثات ({filteredConversations.length}
                  {filterStatus !== "all"
                    ? ` / ${conversations.length}`
                    : ""}
                  )
                </h3>
              </div>
              <div className="shrink-0 flex flex-wrap gap-1 border-b border-slate-100 bg-white px-2 py-2">
                {(
                  [
                    { key: "all" as const, label: "الكل" },
                    { key: "open" as const, label: "مفتوحة" },
                    { key: "pending" as const, label: "في الانتظار" },
                    { key: "resolved" as const, label: "مغلقة" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterStatus(key)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                      filterStatus === key
                        ? "bg-[#002845] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
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
                ) : filteredConversations.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center gap-2 px-3 text-center text-slate-400">
                    <p className="text-sm">لا توجد محادثات ضمن هذا التصفية</p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const st = conv.status ?? "open";
                    const isResolved = st === "resolved";
                    return (
                      <button
                        key={conv.phone}
                        type="button"
                        onClick={() => handleSelectConversation(conv.phone)}
                        className={`w-full border-b border-slate-50 px-4 py-3 text-right transition-colors ${
                          selectedPhone === conv.phone
                            ? "border-r-2 border-r-[#002845] bg-[#002845]/5"
                            : "hover:bg-slate-50"
                        } ${isResolved ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {st === "open" && (
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500 shadow-sm"
                                  title="مفتوحة"
                                />
                              )}
                              {st === "pending" && (
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 shadow-sm"
                                  title="في الانتظار"
                                />
                              )}
                              {st === "resolved" && (
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300 shadow-sm"
                                  title="مغلقة"
                                />
                              )}
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-600">
                                <User className="h-4 w-4 text-white" />
                              </div>
                              <span
                                className={`flex min-w-0 items-center gap-1 truncate text-sm font-bold text-[#002845] ${isResolved ? "text-slate-500" : ""}`}
                              >
                                {conv.phone}
                                {conv.is_blocked && (
                                  <Ban className="h-3.5 w-3.5 shrink-0 text-red-500" />
                                )}
                              </span>
                            </div>
                            <p
                              className={`mt-1 truncate pr-10 text-xs ${isResolved ? "text-slate-400" : "text-slate-500"}`}
                            >
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
                    );
                  })
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
                  <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border-b border-slate-100">
                    <p className="min-w-0 font-bold text-[#002845]">
                      {selectedPhone}
                    </p>
                    {selectedConversation && selectedPhone && (
                      <div
                        className="flex flex-wrap items-center gap-2"
                        dir="rtl"
                      >
                        <button
                          type="button"
                          onClick={() => void handleUpdateStatus("open")}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            selectedHeaderStatus === "open"
                              ? "border border-rose-200 bg-rose-100 text-rose-700"
                              : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          مفتوحة 🔴
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUpdateStatus("pending")}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            selectedHeaderStatus === "pending"
                              ? "border border-amber-200 bg-amber-100 text-amber-700"
                              : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          في الانتظار 🟡
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUpdateStatus("resolved")}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            selectedHeaderStatus === "resolved"
                              ? "border border-emerald-200 bg-emerald-100 text-emerald-700"
                              : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          إغلاق 🟢
                        </button>
                        <div className="mx-1 h-6 w-px bg-slate-200" />
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleBlock(
                              selectedPhone,
                              !!selectedConversation.is_blocked
                            )
                          }
                          className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                            selectedConversation.is_blocked
                              ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                              : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          <Ban className="h-3.5 w-3.5" />
                          {selectedConversation.is_blocked ? "محظور" : "حظر"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteConversation(selectedPhone)
                          }
                          className="flex items-center gap-1 rounded-full border border-transparent px-3 py-1 text-xs font-bold text-red-500 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          مسح
                        </button>
                      </div>
                    )}
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
