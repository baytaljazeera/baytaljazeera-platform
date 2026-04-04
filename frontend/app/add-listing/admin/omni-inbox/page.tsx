"use client";

export const dynamic = "force-dynamic";

import { API_URL, getAuthHeaders } from "@/lib/api";
import { resolveAdminHref } from "@/components/admin/adminNavigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Loader2,
  RefreshCw,
  Send,
  Lock,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  MessageSquare,
  User,
  Headset,
  Bot,
} from "lucide-react";
import { toast } from "sonner";

type InboxItem = {
  kind: "omni" | "ticket_pending";
  omni_id: number | null;
  source_type: string;
  source_id: number | null;
  status: string;
  updated_at: string;
  created_at: string;
  title: string;
  subtitle: string;
  last_snippet: string;
  ticket_id: number | null;
  ai_session_id: string | null;
};

type TimelineEntry = {
  entry_kind: "omni" | "ticket_reply";
  id: number;
  sender_type: string;
  sender_id: string;
  sender_name: string;
  content: string;
  visibility: string;
  created_at: string;
};

type AiLog = {
  id: number;
  user_message: string;
  ai_response: string;
  escalated: boolean;
  escalate_reason: string | null;
  created_at: string;
};

const JSON_HEADERS = () => ({
  ...getAuthHeaders(),
  "Content-Type": "application/json",
});

export default function OmniInboxPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const [loadingList, setLoadingList] = useState(true);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [omniId, setOmniId] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [ticketMeta, setTicketMeta] = useState<{
    id: number;
    subject: string;
    user_name?: string;
    user_email?: string;
  } | null>(null);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [visibility, setVisibility] = useState<"public" | "internal_note">("public");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchInbox = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/omni/inbox`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/admin-login");
        return;
      }
      if (!res.ok) throw new Error("فشل التحميل");
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      toast.error("تعذر تحميل صندوق الوارد");
    } finally {
      setLoadingList(false);
    }
  }, [router]);

  const fetchAiContext = useCallback(async (sessionId: string) => {
    setLoadingAi(true);
    setAiLogs([]);
    try {
      const enc = encodeURIComponent(sessionId);
      const res = await fetch(`${API_URL}/api/admin/omni/ai-context/${enc}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAiLogs(data.logs || []);
      }
    } catch {
      toast.error("تعذر تحميل سجل الذكاء الاصطناعي");
    } finally {
      setLoadingAi(false);
    }
  }, []);

  const loadThread = useCallback(
    async (item: InboxItem) => {
      setSelected(item);
      setLoadingThread(true);
      setTimeline([]);
      setTicketMeta(null);
      setAiSessionId(null);
      setOmniId(null);

      try {
        let oid = item.omni_id;

        if (item.kind === "ticket_pending" && item.ticket_id) {
          const ens = await fetch(
            `${API_URL}/api/admin/omni/ensure-ticket/${item.ticket_id}`,
            {
              method: "POST",
              credentials: "include",
              headers: JSON_HEADERS(),
              body: "{}",
            }
          );
          if (!ens.ok) throw new Error("تعذر تهيئة المحادثة");
          const ed = await ens.json();
          oid = ed.omni_id;
        }

        if (!oid) {
          toast.error("لا يوجد معرف محادثة");
          return;
        }

        setOmniId(oid);

        const res = await fetch(`${API_URL}/api/admin/omni/conversations/${oid}`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error("فتح المحادثة فشل");
        const data = await res.json();
        setTimeline(data.timeline || []);
        if (data.ticket) {
          setTicketMeta({
            id: data.ticket.id,
            subject: data.ticket.subject,
            user_name: data.ticket.user_name,
            user_email: data.ticket.user_email,
          });
        }
        const sid = data.ai_session_id as string | null;
        setAiSessionId(sid || null);
        if (sid) {
          void fetchAiContext(sid);
        } else {
          setAiLogs([]);
        }

        setSelected({
          ...item,
          omni_id: oid,
          kind: "omni",
        });
        void fetchInbox();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "خطأ");
      } finally {
        setLoadingThread(false);
      }
    },
    [fetchAiContext, fetchInbox]
  );

  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    scrollToBottom();
  }, [timeline, scrollToBottom]);

  const handleSend = async () => {
    if (!omniId || !composer.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/omni/conversations/${omniId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS(),
        body: JSON.stringify({
          content: composer.trim(),
          visibility,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل الإرسال");
      }
      setComposer("");
      toast.success(visibility === "public" ? "تم إرسال الرد للعميل" : "تم حفظ الملاحظة الداخلية");
      if (selected && omniId) {
        await loadThread({ ...selected, omni_id: omniId, kind: "omni" });
      }
      void fetchInbox();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  const showAiPanel = useMemo(
    () => !!(aiSessionId || selected?.ai_session_id),
    [aiSessionId, selected?.ai_session_id]
  );

  const internalComposer = visibility === "internal_note";

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 md:px-6 pt-4 pb-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#002845] via-[#003a56] to-[#0c4a6e] flex items-center justify-center shadow-lg ring-1 ring-white/10">
            <Inbox className="w-6 h-6 text-[#F5E6B8]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#002845]">البريد الموحد</h1>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
              مسار واحد للتذاكر، التغذية الراجعة، وتصعيد الذكاء الاصطناعي — مع تمييز واضح بين ردود العملاء
              والملاحظات الداخلية.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Link
                href={resolveAdminHref("/admin/messages")}
                className="text-xs font-semibold text-[#002845]/80 hover:text-[#D4AF37] underline-offset-2 hover:underline inline-flex items-center gap-1"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                مراسلات الفريق الداخلية السابقة
              </Link>
              <span className="text-slate-300">|</span>
              <Link
                href={resolveAdminHref("/admin/support")}
                className="text-xs font-semibold text-slate-600 hover:text-[#D4AF37] underline-offset-2 hover:underline inline-flex items-center gap-1"
              >
                <Headset className="w-3.5 h-3.5" />
                إدارة التذاكر
              </Link>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchInbox()}
          disabled={loadingList}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loadingList ? "animate-spin" : ""}`} />
          تحديث القائمة
        </button>
      </div>

      <div className="flex-1 flex min-h-0 border-t border-slate-200/80 bg-gradient-to-b from-slate-50 to-white">
        {/* Thread list */}
        <aside className="w-full max-w-[380px] shrink-0 border-l border-slate-200 bg-white/90 backdrop-blur flex flex-col">
          <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            المحادثات
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList && items.length === 0 ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
              </div>
            ) : items.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">لا توجد عناصر بعد. تظهر هنا متابعات التغذية الراجعة والتذاكر المربوطة.</p>
            ) : (
              items.map((it) => {
                const active =
                  selected &&
                  ((it.omni_id && it.omni_id === selected.omni_id) ||
                    (it.ticket_id && it.ticket_id === selected.ticket_id && it.kind === selected.kind));
                return (
                  <button
                    key={`${it.kind}-${it.omni_id ?? "x"}-${it.ticket_id ?? "n"}-${it.updated_at}`}
                    type="button"
                    onClick={() => void loadThread(it)}
                    className={`w-full text-right px-4 py-3 border-b border-slate-100 transition hover:bg-slate-50/90 ${
                      active ? "bg-[#002845]/[0.06] border-r-[3px] border-r-[#D4AF37]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-[#002845] text-sm line-clamp-1">{it.title}</span>
                      {it.kind === "ticket_pending" && (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          جديد
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">{it.subtitle}</p>
                    {it.last_snippet ? (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{it.last_snippet}</p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Main chat */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#f4f7fb]">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <Inbox className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium text-slate-500">اختر محادثة من القائمة</p>
            </div>
          ) : loadingThread ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-[#002845]" />
            </div>
          ) : (
            <>
              <div className="shrink-0 px-4 py-3 bg-white/95 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-[#002845] truncate">{selected.title}</h2>
                  {ticketMeta && (
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {ticketMeta.user_name || "عميل"} {ticketMeta.user_email ? `· ${ticketMeta.user_email}` : ""}
                      </span>
                    </p>
                  )}
                </div>
                {showAiPanel && (
                  <button
                    type="button"
                    onClick={() => setPanelOpen((v) => !v)}
                    className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#002845] hover:bg-slate-50"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    سياق الذكاء الاصطناعي
                    {panelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <div className="flex-1 flex min-h-0">
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {timeline.map((m) => {
                      const isOmni = m.entry_kind === "omni";
                      const isInternal = isOmni && m.visibility === "internal_note";
                      const isTicket = m.entry_kind === "ticket_reply";
                      const isUser = m.sender_type === "user";

                      if (isInternal) {
                        return (
                          <div
                            key={`${m.entry_kind}-${m.id}`}
                            className="rounded-2xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50 to-amber-100/90 px-4 py-3 shadow-sm max-w-[92%] mr-0 ml-auto ring-1 ring-amber-200/60"
                          >
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Lock className="w-4 h-4 text-amber-800 shrink-0" />
                              <span className="text-[10px] font-black uppercase tracking-wide text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md">
                                ملاحظة داخلية — مخفية عن العميل
                              </span>
                              <span className="text-[11px] text-amber-800/80 mr-auto">
                                {m.sender_name} ·{" "}
                                {new Date(m.created_at).toLocaleString("ar-SA")}
                              </span>
                            </div>
                            <p className="text-sm text-amber-950 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                          </div>
                        );
                      }

                      const bubbleSide = isUser ? "mr-auto ml-0" : "mr-0 ml-auto";
                      const bubbleStyle = isTicket
                        ? "bg-white border border-slate-200 text-slate-800 shadow-sm"
                        : isUser
                          ? "bg-slate-200 text-slate-900"
                          : "bg-[#002845] text-white shadow-md";

                      return (
                        <div key={`${m.entry_kind}-${m.id}`} className={`flex flex-col max-w-[min(92%,720px)] ${bubbleSide}`}>
                          <div className={`rounded-2xl px-4 py-3 ${bubbleStyle}`}>
                            <div className="flex items-center gap-2 mb-1 text-[11px] opacity-90">
                              {isTicket ? (
                                <span className="font-bold">تذكرة · {isUser ? "العميل" : "الدعم"}</span>
                              ) : (
                                <span className="font-bold">{m.sender_name}</span>
                              )}
                              <span className="opacity-70">
                                {new Date(m.created_at).toLocaleString("ar-SA")}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                          </div>
                          {isOmni && m.visibility === "public" && (
                            <span className="text-[10px] text-emerald-600 font-bold mt-1 px-1">مرئي للعميل</span>
                          )}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Smart composer */}
                  <div
                    className={`shrink-0 border-t p-4 transition-colors ${
                      internalComposer ? "bg-amber-50/95 border-amber-200" : "bg-white border-slate-200"
                    }`}
                  >
                    <div className="max-w-4xl mx-auto space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-600">وضع الإرسال</span>
                        <div className="flex items-center gap-3 bg-slate-100/90 rounded-2xl p-1.5 border border-slate-200/80">
                          <button
                            type="button"
                            onClick={() => setVisibility("public")}
                            className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                              visibility === "public"
                                ? "bg-white text-[#002845] shadow-md"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            رد للعميل (Public)
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisibility("internal_note")}
                            className={`rounded-xl px-4 py-2 text-xs font-black transition flex items-center gap-1.5 ${
                              visibility === "internal_note"
                                ? "bg-amber-400 text-amber-950 shadow-md"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            ملاحظة سرية لفريق العمل
                          </button>
                        </div>
                      </div>
                      <textarea
                        ref={composerRef}
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        placeholder={
                          internalComposer
                            ? "ملاحظة لا يراها العميل — للتنسيق الداخلي فقط…"
                            : "رد يظهر للعميل في صفحة التذكرة ويصله إشعار…"
                        }
                        rows={3}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 resize-none transition ${
                          internalComposer
                            ? "bg-amber-100/80 border-amber-300 text-amber-950 placeholder:text-amber-800/50"
                            : "bg-white border-slate-200 text-slate-900"
                        }`}
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={sending || !composer.trim()}
                          onClick={() => void handleSend()}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[#002845] text-white px-6 py-3 text-sm font-black shadow-lg hover:bg-[#003d5c] disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          إرسال
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI context drawer */}
                {showAiPanel && panelOpen && (
                  <aside className="w-[min(100%,380px)] shrink-0 border-r border-slate-200 bg-gradient-to-b from-slate-900 to-[#0c1829] text-white flex flex-col max-h-[calc(100vh-200px)]">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                      <Bot className="w-5 h-5 text-cyan-400" />
                      <div>
                        <p className="text-sm font-black">سياق المحادثة مع الذكاء الاصطناعي</p>
                        <p className="text-[10px] text-white/50">قراءة فقط — قبل التصعيد للبشري</p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                      {loadingAi ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
                        </div>
                      ) : aiLogs.length === 0 ? (
                        <p className="text-xs text-white/50 text-center py-6">لا يوجد سجل جلسة محفوظ لهذا التصعيد.</p>
                      ) : (
                        aiLogs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2"
                          >
                            <p className="text-[10px] font-bold text-cyan-300/90">
                              {new Date(log.created_at).toLocaleString("ar-SA")}
                            </p>
                            <div>
                              <p className="text-[10px] uppercase text-white/40 mb-0.5">المستخدم</p>
                              <p className="text-xs text-white/90 whitespace-pre-wrap">{log.user_message || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase text-white/40 mb-0.5">المساعد الآلي</p>
                              <p className="text-xs text-white/80 whitespace-pre-wrap">{log.ai_response || "—"}</p>
                            </div>
                            {log.escalated && (
                              <p className="text-[10px] text-amber-300 font-bold">
                                تصعيد: {log.escalate_reason || "نعم"}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </aside>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
