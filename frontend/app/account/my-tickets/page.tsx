"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Headset,
  MessageCircle,
  DollarSign,
  Settings,
  UserCircle,
  Plus,
  ArrowRight,
  Send,
  X,
  Bot,
  Inbox,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface Reply {
  id: number;
  sender_name?: string;
  sender_type: string;
  message: string;
  created_at: string;
}

interface SupportTicketRow {
  id: number;
  ticket_number: string;
  subject: string;
  description: string;
  complaint_type?: string;
  department?: string;
  subcategory?: string;
  status: string;
  priority: string;
  reply_count: number;
  sla_hours?: number;
  created_at: string;
  source?: string | null;
  category?: string | null;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد" },
  open: { bg: "bg-red-100", text: "text-red-700", label: "جديد" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المعالجة" },
  resolved: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل" },
  closed: { bg: "bg-slate-100", text: "text-slate-700", label: "مغلق" },
};

function normalizeStatusKey(status: string) {
  return (status || "").toLowerCase().trim();
}

function isTicketClosedStatus(status: string) {
  const s = normalizeStatusKey(status);
  return s === "resolved" || s === "closed";
}

function getStatusStyle(status: string) {
  const s = normalizeStatusKey(status);
  return statusColors[s] || { bg: "bg-slate-100", text: "text-slate-700", label: status || "—" };
}

const DEPARTMENTS = {
  financial: {
    id: "financial",
    label: "💰 مالية",
    icon: DollarSign,
    description: "استرداد، فواتير، اشتراكات، دفع",
    color: "#D4AF37",
    subcategories: [
      { id: "refund", label: "استرداد مبلغ" },
      { id: "invoice", label: "فاتورة أو إيصال" },
      { id: "payment_failed", label: "دفع فاشل" },
      { id: "subscription", label: "اشتراك أو تجديد" },
      { id: "pricing", label: "استفسار عن الأسعار" },
    ],
  },
  account: {
    id: "account",
    label: "👤 حسابي/إداري",
    icon: UserCircle,
    description: "تعديل بيانات، صلاحيات، توثيق",
    color: "#FF9800",
    subcategories: [
      { id: "profile_update", label: "تعديل بيانات الحساب" },
      { id: "delete_account", label: "حذف الحساب" },
      { id: "permissions", label: "صلاحيات أو وصول" },
      { id: "verification", label: "توثيق الحساب" },
      { id: "listing_issue", label: "مشكلة في إعلان" },
    ],
  },
  technical: {
    id: "technical",
    label: "🔧 تقنية",
    icon: Settings,
    description: "أعطال، أخطاء، بطء في الأداء",
    color: "#4CAF50",
    subcategories: [
      { id: "app_error", label: "خطأ في التطبيق" },
      { id: "display_issue", label: "مشكلة في العرض" },
      { id: "slow_performance", label: "بطء في الأداء" },
      { id: "upload_issue", label: "مشكلة رفع ملفات" },
      { id: "map_issue", label: "مشكلة في الخريطة" },
    ],
  },
};

const complaintTypes = Object.values(DEPARTMENTS);

function MyTicketsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openIdParam = searchParams.get("open");

  const { user, isLoading: authLoading } = useAuthStore();
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selected, setSelected] = useState<SupportTicketRow | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    department: "",
    subcategory: "",
    priority: "medium",
    subject: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // cardRef goes on the ticket-detail card; messagesContainerRef goes
  // on the scrollable messages region. We need BOTH:
  //   - cardRef to measure where the card sits in the viewport so we
  //     can compute the real available height (78vh blindly went off
  //     screen because the page has a header + nav + page title +
  //     promo bar above the card).
  //   - messagesContainerRef to scroll the messages region by setting
  //     scrollTop directly. scrollIntoView even with block:'nearest'
  //     could still bubble up to the page in some browsers (Chrome
  //     iOS, Safari) and yank the whole page around.
  const cardRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState<number>(560);

  // Compute the real available height for the ticket card based on
  // where it actually sits in the viewport. Recompute on resize and
  // on selection change.
  useLayoutEffect(() => {
    if (!selected) return;
    const compute = () => {
      if (!cardRef.current || typeof window === "undefined") return;
      const top = cardRef.current.getBoundingClientRect().top;
      const avail = window.innerHeight - top - 24; // 24px bottom gutter
      const h = Math.max(420, Math.min(720, avail));
      setCardHeight(h);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [selected?.id]);

  // Scroll ONLY the inner messages container, never the page. Using
  // scrollTop on the container itself can never bubble up to ancestor
  // scrollers, unlike scrollIntoView (even with block:'nearest' some
  // browsers still adjust ancestor scroll positions).
  const scrollMessagesToBottom = (smooth = true) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  };

  // First mount of a ticket: jump (no smooth) so the user lands at
  // the latest message immediately. Subsequent replies: smooth.
  useEffect(() => {
    if (replies.length === 0) return;
    scrollMessagesToBottom(true);
  }, [replies]);
  useEffect(() => {
    if (!selected || replies.length === 0) return;
    scrollMessagesToBottom(false);
  }, [selected?.id]);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/support`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error("fetch tickets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const markTicketRead = useCallback(async (ticketId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/support/${ticketId}/mark-read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.ok && typeof window !== "undefined") {
        window.dispatchEvent(new Event("notificationsUpdated"));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTicketDetail = useCallback(
    async (ticketId: number) => {
      try {
        const res = await fetch(`${API_URL}/api/support/${ticketId}`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setReplies(data.replies || []);
          await markTicketRead(ticketId);
        }
      } catch (err) {
        console.error("fetch ticket detail:", err);
      }
    },
    [markTicketRead]
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) fetchTickets();
  }, [user, authLoading, router, fetchTickets]);

  useEffect(() => {
    if (!selected) {
      setReplies([]);
      return;
    }
    fetchTicketDetail(selected.id);
  }, [selected, fetchTicketDetail]);

  useEffect(() => {
    if (!openIdParam || loading) return;
    const id = parseInt(openIdParam, 10);
    if (Number.isNaN(id)) return;
    const found = tickets.find((t) => t.id === id);
    if (found) {
      setSelected(found);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/support/${id}`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ticket) setSelected(data.ticket);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [openIdParam, tickets, loading]);

  const createTicket = async () => {
    if (!formData.subject.trim() || !formData.description.trim() || !formData.department) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          department: formData.department,
          subcategory: formData.subcategory || null,
          priority: formData.priority,
          subject: formData.subject,
          description: formData.description,
        }),
      });
      if (res.ok) {
        setShowNewForm(false);
        setFormData({ department: "", subcategory: "", priority: "medium", subject: "", description: "" });
        setStep(1);
        await fetchTickets();
      }
    } catch (err) {
      console.error("create ticket:", err);
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    if (isTicketClosedStatus(selected.status)) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/support/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setReplies((prev) => [...prev, data.reply]);
        }
        setReply("");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("notificationsUpdated"));
        }
      }
    } catch (err) {
      console.error("send reply:", err);
    } finally {
      setSending(false);
    }
  };

  const getDepartmentInfo = (dept: string) => {
    return DEPARTMENTS[dept as keyof typeof DEPARTMENTS] || DEPARTMENTS.technical;
  };

  const isAiHandoff = (t: SupportTicketRow) =>
    t.source === "ai_chatbot" || t.category === "ai_escalation";

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#002845] to-[#001830] py-8" dir="rtl">
        <div className="container mx-auto px-4 max-w-4xl space-y-4 animate-pulse">
          <div className="flex justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="h-8 bg-white/10 rounded-lg w-48" />
              <div className="h-4 bg-white/5 rounded w-72 max-w-full" />
            </div>
            <div className="h-10 w-32 bg-[#D4AF37]/20 rounded-xl shrink-0" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-28 rounded-xl bg-white/10 border border-white/5" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#002845] to-[#001830] py-8" dir="rtl">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.push("/account")} className="text-white/70 hover:text-white">
              <ArrowRight className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Headset className="w-7 h-7 text-[#D4AF37]" />
                طلبات الدعم
              </h1>
              <p className="text-white/60 text-sm mt-1">
                محادثتك مع فريق الدعم بعد تذكرة الدعم أو تصعيد الدعم الآلي — منفصلة عن{" "}
                <span className="text-white/90">الاستفسارات العقارية</span> بين المستخدمين وعن{" "}
                <span className="text-white/90">شكاواي</span> على الحساب.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#002845] rounded-xl font-medium hover:bg-[#c9a432] transition"
          >
            <Plus className="w-4 h-4" />
            تذكرة جديدة
          </button>
        </div>

        {showNewForm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-l from-[#002845] to-[#003f6b] p-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">فتح تذكرة دعم جديدة</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewForm(false);
                    setStep(1);
                    setFormData({ department: "", subcategory: "", priority: "medium", subject: "", description: "" });
                  }}
                  className="text-white/70 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {step === 1 && (
                <div className="p-6">
                  <p className="text-slate-600 mb-4 text-center">اختر نوع الطلب</p>
                  <div className="space-y-3">
                    {complaintTypes.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, department: type.id });
                          setStep(2);
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-[#D4AF37] transition group"
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${type.color}20` }}
                        >
                          <type.icon className="w-6 h-6" style={{ color: type.color }} />
                        </div>
                        <div className="text-right flex-1">
                          <h3 className="font-semibold text-[#002845] group-hover:text-[#D4AF37] transition">{type.label}</h3>
                          <p className="text-sm text-slate-500">{type.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="p-6 space-y-4">
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ backgroundColor: `${getDepartmentInfo(formData.department).color}15` }}
                  >
                    {(() => {
                      const TypeIcon = getDepartmentInfo(formData.department).icon;
                      return <TypeIcon className="w-5 h-5" style={{ color: getDepartmentInfo(formData.department).color }} />;
                    })()}
                    <span className="font-medium text-[#002845]">{getDepartmentInfo(formData.department).label}</span>
                    <button type="button" onClick={() => setStep(1)} className="mr-auto text-xs text-slate-500 hover:text-[#D4AF37]">
                      تغيير
                    </button>
                  </div>

                  {getDepartmentInfo(formData.department).subcategories?.length > 0 && (
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">حدد نوع المشكلة (اختياري)</label>
                      <div className="flex flex-wrap gap-2">
                        {getDepartmentInfo(formData.department).subcategories.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, subcategory: sub.id })}
                            className={`px-3 py-1.5 rounded-full text-sm border transition ${
                              formData.subcategory === sub.id
                                ? "bg-[#D4AF37] text-white border-[#D4AF37]"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:border-[#D4AF37]"
                            }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-slate-600 mb-1">الأولوية</label>
                    <div className="flex gap-2">
                      {[
                        { id: "low", label: "منخفضة", color: "bg-green-100 text-green-700 border-green-200" },
                        { id: "medium", label: "متوسطة", color: "bg-amber-100 text-amber-700 border-amber-200" },
                        { id: "high", label: "عالية", color: "bg-red-100 text-red-700 border-red-200" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, priority: p.id })}
                          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border-2 transition ${
                            formData.priority === p.id ? p.color : "bg-slate-50 text-slate-500 border-slate-200"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-1">الموضوع</label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="موضوع مختصر"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-1">التفاصيل</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="اشرح طلبك بالتفصيل..."
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={createTicket}
                      disabled={creating || !formData.subject.trim() || !formData.description.trim()}
                      className="flex-1 py-3 bg-[#D4AF37] text-[#002845] rounded-xl font-medium hover:bg-[#c9a432] transition disabled:opacity-50"
                    >
                      {creating ? "جاري الإرسال..." : "إرسال التذكرة"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewForm(false);
                        setStep(1);
                      }}
                      className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {selected ? (
          // Real chat-thread layout: card height is COMPUTED from the
          // cards top in the viewport (cardRef + getBoundingClientRect)
          // so the composer is always visible. The previous
          // h-[min(78vh,720px)] ignored the page chrome above the card
          // (nav + page title + promo bar) and pushed the composer
          // below the fold. Clamped to [420,720] so very tall screens
          // dont produce an awkwardly tall card and very short
          // screens still show enough conversation to be useful.
          <div
            ref={cardRef}
            className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col"
            style={{ height: `${cardHeight}px` }}
          >
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-start justify-between gap-3 min-w-0 shrink-0">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {(() => {
                  const dept = selected.department || selected.complaint_type || "technical";
                  const TypeIcon = getDepartmentInfo(dept).icon;
                  return <TypeIcon className="w-5 h-5 shrink-0" style={{ color: getDepartmentInfo(dept).color }} />;
                })()}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h3 className="font-bold text-[#002845] break-words">{selected.subject}</h3>
                    {isAiHandoff(selected) && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 shrink-0">
                        <Bot className="w-3 h-3" />
                        تصعيد من الدعم الآلي
                      </span>
                    )}
                    <span
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 whitespace-nowrap ${getStatusStyle(selected.status).bg} ${getStatusStyle(selected.status).text}`}
                    >
                      {getStatusStyle(selected.status).label}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono block mt-1">{selected.ticket_number}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  router.replace("/account/my-tickets");
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
            <div
              ref={messagesContainerRef}
              className="p-4 flex-1 min-h-0 overflow-y-auto space-y-3"
            >
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-sm text-slate-700">{selected.description}</p>
                <p className="text-[10px] text-slate-500 mt-2">{new Date(selected.created_at).toLocaleString("ar-SA")}</p>
              </div>
              {replies.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-xl p-3 ${r.sender_type === "admin" ? "bg-[#D4AF37]/10 mr-4" : "bg-blue-50 ml-4"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[#002845]">
                      {r.sender_name || (r.sender_type === "admin" ? "فريق الدعم" : "أنت")}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        r.sender_type === "admin" ? "bg-[#D4AF37] text-white" : "bg-blue-500 text-white"
                      }`}
                    >
                      {r.sender_type === "admin" ? "الدعم" : "أنت"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.message}</p>
                  <p className="text-[10px] text-slate-500 mt-2">{new Date(r.created_at).toLocaleString("ar-SA")}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {isTicketClosedStatus(selected.status) ? (
              <div
                className="shrink-0 p-4 border-t border-slate-200 bg-gradient-to-l from-slate-50 to-slate-100 flex items-center justify-center gap-2 text-slate-700"
                role="status"
              >
                <span className="text-lg leading-none shrink-0" aria-hidden>
                  🔒
                </span>
                <p className="text-sm font-medium text-center leading-relaxed">
                  هذه التذكرة مغلقة. لا يمكن الرد عليها.
                </p>
              </div>
            ) : (
              <div className="shrink-0 p-4 border-t border-slate-100 bg-white flex gap-2 min-w-0">
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendReply()}
                  placeholder="اكتب رسالتك لفريق الدعم..."
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="p-2 shrink-0 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#c9a432] transition disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${sending ? "animate-pulse" : ""}`} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-10 text-center backdrop-blur-sm">
                <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#D4AF37]/10 blur-3xl" />
                <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg mb-4">
                  <Inbox className="w-8 h-8 text-[#D4AF37]/90" />
                </div>
                <p className="text-white font-bold text-lg">لا توجد طلبات دعم بعد</p>
                <p className="text-white/55 text-sm mt-2 max-w-md mx-auto leading-relaxed">
                  عند تصعيد المحادثة من الدعم الآلي أو عند فتح تذكرة جديدة، ستظهر هنا مع تحديثات فورية — بأسلوب يشبه تطبيقات الدعم العالمية.
                </p>
                <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-white/35">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>واجهة جاهزة للتوسّع</span>
                </div>
              </div>
            ) : (
              tickets.map((t) => {
                const st = getStatusStyle(t.status);
                return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelected(t);
                    router.replace(`/account/my-tickets?open=${t.id}`);
                  }}
                  className="group w-full min-w-0 max-w-full text-right bg-white rounded-xl p-4 cursor-pointer border border-transparent transition-all duration-300 ease-out hover:shadow-xl hover:border-[#D4AF37]/25 hover:-translate-y-0.5 active:scale-[0.995] overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3 w-full min-w-0">
                    <div className="flex items-start gap-3 flex-1 min-w-0 overflow-hidden">
                      {(() => {
                        const dept = t.department || t.complaint_type || "technical";
                        const TypeIcon = getDepartmentInfo(dept).icon;
                        return (
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${getDepartmentInfo(dept).color}20` }}
                          >
                            <TypeIcon className="w-5 h-5" style={{ color: getDepartmentInfo(dept).color }} />
                          </div>
                        );
                      })()}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-semibold text-[#002845] truncate min-w-0">{t.subject}</h3>
                          {isAiHandoff(t) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 shrink-0">
                              دعم آلي → بشري
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-1 break-words">{t.description}</p>
                        <div className="flex items-center gap-3 mt-2 min-w-0 flex-wrap">
                          <span className="text-xs text-slate-400 shrink-0">{new Date(t.created_at).toLocaleDateString("ar-SA")}</span>
                          {t.reply_count > 0 && (
                            <span className="text-xs text-blue-600 flex items-center gap-1 shrink-0">
                              <MessageCircle className="w-3 h-3 shrink-0" />
                              {t.reply_count} رسالة
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 whitespace-nowrap self-center ${st.bg} ${st.text}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </button>
              );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyTicketsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-[#002845] to-[#001830] flex items-center justify-center px-4">
          <div className="w-full max-w-md space-y-3 animate-pulse">
            <div className="h-10 bg-white/10 rounded-xl" />
            <div className="h-24 bg-white/5 rounded-xl" />
            <div className="h-24 bg-white/5 rounded-xl" />
          </div>
        </div>
      }
    >
      <MyTicketsContent />
    </Suspense>
  );
}
