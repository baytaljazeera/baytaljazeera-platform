"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, AlertTriangle, Headphones, Crown, Lock, Sparkles, CheckCircle2, Clock, ExternalLink, Home } from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";

interface TicketCard {
  ticketId: number | string;
  ticketNumber: string;
  status: string;          // 'new' | 'open' | …
  createdAt: string;       // ISO
}

interface Message {
  role: "user" | "assistant";
  content: string;
  escalated?: boolean;
  ticket?: TicketCard;     // when present, render as a card instead of plain text
}

// ─── Follow-up chip system ──────────────────────────────────────────────
// Detects what the user/bot just talked about and surfaces 3-4 chips so
// the visitor always has a next step instead of staring at a blank box.
// Built in the frontend (not relying on GPT to remember) — GPT also gets
// a system-prompt nudge to end with a short follow-up question.
type ChatIntent = "description" | "packages" | "search" | "edit" | "general";

interface FollowUpChip {
  label: string;
  payload: string; // sentinel "__home__" or "__escalate__" or literal text
}

const HOME_CHIP: FollowUpChip = { label: "🏠 القائمة الرئيسية", payload: "__home__" };
const ESCALATE_CHIP: FollowUpChip = { label: "👨‍💼 تحدث مع موظف", payload: "__escalate__" };

function detectLastBotIntent(lastUser: string, lastBot: string): ChatIntent {
  const text = `${lastUser || ""} ${lastBot || ""}`.toLowerCase();
  if (/تعديل|عدّل|عدل |غيّر|اقصر|أطول|أعد كتابة/.test(text)) return "edit";
  if (/وصف|اكتب لي|اوصف|وصفاً|description/i.test(text)) return "description";
  if (/(باقة|الباقات|اشتراك|بريميوم|نخبة|premium|elite|سعر الباقة)/i.test(text)) return "packages";
  if (/ابحث|بحث عن|عقار في|الرياض|جدة|مكة|المدينة|الدمام|ميزانية/.test(text)) return "search";
  return "general";
}

function getFollowUpChips(intent: ChatIntent): FollowUpChip[] {
  switch (intent) {
    case "description":
      return [
        { label: "✏️ عدّل الوصف", payload: "عدّل هذا الوصف وحسّن صياغته" },
        { label: "📝 وصف أقصر", payload: "اكتب وصفاً أقصر للعقار نفسه" },
        { label: "🚀 تسويق أقوى", payload: "أعد كتابة الوصف بأسلوب تسويقي أقوى يجذب المشترين" },
        HOME_CHIP,
      ];
    case "edit":
      return [
        { label: "📏 اقصر منه", payload: "اكتبه أقصر" },
        { label: "📖 أطول وأشمل", payload: "اكتبه أطول وأشمل" },
        { label: "🎨 أسلوب مختلف", payload: "أعد كتابته بأسلوب مختلف تماماً" },
        HOME_CHIP,
      ];
    case "packages":
      return [
        { label: "📦 اعرض الباقات", payload: "اعرض كل الباقات المتاحة مع الأسعار والميزات" },
        { label: "⚖️ قارن الباقات", payload: "قارن بين الباقات حسب السعر والميزات" },
        ESCALATE_CHIP,
        HOME_CHIP,
      ];
    case "search":
      return [
        { label: "🏙️ ابحث في الرياض", payload: "أريد البحث عن عقارات في الرياض" },
        { label: "🌊 ابحث في جدة", payload: "أريد البحث عن عقارات في جدة" },
        { label: "💰 حدد الميزانية", payload: "كيف أحدد ميزانية البحث بشكل صحيح؟" },
        HOME_CHIP,
      ];
    default:
      return [
        { label: "❓ سؤال آخر", payload: "لدي سؤال آخر" },
        ESCALATE_CHIP,
        HOME_CHIP,
      ];
  }
}

// ─── Ticket success card ────────────────────────────────────────────────
// Rendered in place of a normal chat bubble after handleEscalate succeeds.
// Gold-on-paper aesthetic matching the rest of the platform: ticket id,
// status pill, creation time, and two CTAs (follow-up / back-to-home).
function TicketSuccessCard({ ticket, onHome }: { ticket: TicketCard; onHome: () => void }) {
  const created = new Date(ticket.createdAt);
  const validTime = !Number.isNaN(created.getTime());
  const timeStr = validTime
    ? created.toLocaleString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "long",
      })
    : "الآن";
  const statusLabel = ticket.status === "in_progress"
    ? "قيد المعالجة"
    : ticket.status === "resolved"
      ? "تم الحل"
      : ticket.status === "closed"
        ? "مغلقة"
        : "مفتوحة";
  const statusTone = ticket.status === "in_progress"
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : ticket.status === "resolved" || ticket.status === "closed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-[#FFFCEE] text-[#9A7D28] border-[#D4AF37]";

  return (
    <div className="max-w-[85%] rounded-2xl rounded-tl-none border-2 border-[#D4AF37] bg-gradient-to-br from-[#FFFDF5] to-white shadow-md overflow-hidden">
      <div className="px-3 py-2.5 bg-gradient-to-l from-[#D4AF37]/15 to-[#FFFCEE] border-b border-[#D4AF37]/40 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div className="font-bold text-[13px] text-[#002845]">تم تحويل طلبك إلى الدعم البشري</div>
      </div>
      <div className="px-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-medium">رقم التذكرة</span>
          <span className="font-mono text-[12px] font-bold text-[#002845] bg-[#FFFCEE] px-2 py-0.5 rounded border border-[#D4AF37]/40">
            {ticket.ticketNumber}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-medium">الحالة</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" /> وقت الإنشاء
          </span>
          <span className="text-[11px] text-slate-700">{timeStr}</span>
        </div>
      </div>
      <div className="px-3 pb-3 grid grid-cols-2 gap-2">
        <a
          href={`/account/my-tickets?open=${ticket.ticketId}`}
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] text-[11px] font-bold hover:opacity-90 transition active:scale-95"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          متابعة الطلب
        </a>
        <button
          type="button"
          onClick={onHome}
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-white border border-[#D4AF37] text-[#9A7D28] text-[11px] font-bold hover:bg-[#FFFCEE] transition active:scale-95"
        >
          <Home className="w-3.5 h-3.5" />
          القائمة الرئيسية
        </button>
      </div>
    </div>
  );
}

// ─── Starter menu (welcome screen) ──────────────────────────────────────
// Replaces the old flat 3-button list with a categorized menu so the
// visitor sees the breadth of what the bot can answer (listings,
// packages, search, contact, plus AI tools for VIP tiers).
type StarterCategory = {
  title: string;
  icon: string;     // emoji is fine — RTL, no extra import
  tone: string;     // tailwind classes for the chip
  questions: string[];
};

const STARTER_BASE: StarterCategory[] = [
  {
    title: "إضافة إعلان",
    icon: "🏠",
    tone: "border-slate-200 text-slate-700 hover:border-[#D4AF37] hover:text-[#002845] hover:bg-[#FFFCEE]",
    questions: [
      "كيف أضيف إعلان جديد؟",
      "كم صورة يمكنني رفعها للعقار؟",
      "هل أستطيع رفع فيديو للعقار؟",
      "كم مدة عرض الإعلان؟",
    ],
  },
  {
    title: "الباقات والأسعار",
    icon: "💼",
    tone: "border-amber-200 text-amber-700 hover:border-[#D4AF37] hover:bg-[#FFFCEE]",
    questions: [
      "ما هي الباقات المتاحة؟",
      "كم سعر كل باقة؟",
      "ما الفرق بين الباقات؟",
      "هل يوجد خصومات على الباقات؟",
    ],
  },
  {
    title: "البحث والشراء",
    icon: "🔎",
    tone: "border-blue-200 text-blue-700 hover:border-blue-400 hover:bg-blue-50",
    questions: [
      "كيف أبحث عن عقار؟",
      "كيف أتواصل مع البائع؟",
      "كيف أحجز موعد معاينة؟",
      "ما هي رسوم العمولة؟",
    ],
  },
  {
    title: "الدعم والحساب",
    icon: "🛟",
    tone: "border-emerald-200 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50",
    questions: [
      "كيف أتواصل مع الدعم البشري؟",
      "كيف أعدّل بيانات حسابي؟",
      "نسيت كلمة المرور",
      "كيف أتابع طلبات الدعم؟",
    ],
  },
];

const STARTER_VIP: StarterCategory[] = [
  {
    title: "كتابة الأوصاف (AI)",
    icon: "✍️",
    tone: "border-purple-200 text-purple-700 hover:border-purple-400 hover:bg-purple-50",
    questions: [
      "اكتب لي وصف فيلا فاخرة",
      "اكتب لي وصف شقة عائلية",
      "اكتب لي وصف أرض استثمارية",
      "أعد كتابة وصفي بأسلوب تسويقي أقوى",
    ],
  },
  {
    title: "تسويق وأداء",
    icon: "📈",
    tone: "border-rose-200 text-rose-700 hover:border-rose-400 hover:bg-rose-50",
    questions: [
      "نصائح لزيادة مشاهدات إعلاني",
      "ما أفضل وقت لنشر إعلان؟",
      "كيف أحسّن صور إعلاني؟",
      "استراتيجية بيع سريع",
    ],
  },
  {
    title: "تسعير واستشارة",
    icon: "🎯",
    tone: "border-amber-200 text-amber-700 hover:border-[#D4AF37] hover:bg-[#FFFCEE]",
    questions: [
      "كيف أحدد سعر عقاري؟",
      "ما متوسط أسعار الحي؟",
      "هل العرض المتاح مناسب؟",
      "ما عوامل ارتفاع سعر العقار؟",
    ],
  },
];

function StarterMenu({
  currentLevel,
  onPick,
}: {
  currentLevel: number;
  onPick: (q: string) => void;
}) {
  const cats = currentLevel >= 2 ? [...STARTER_VIP, ...STARTER_BASE] : STARTER_BASE;
  return (
    <div className="mt-4 w-full space-y-3 text-right">
      <p className="text-[11px] text-slate-500 font-medium px-1">اختر سؤالاً للبدء، أو اكتب سؤالك:</p>
      {cats.map((cat, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-sm">{cat.icon}</span>
            <span className="text-[11px] font-bold text-[#002845]">{cat.title}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cat.questions.map((q, j) => (
              <button
                key={j}
                type="button"
                onClick={() => onPick(q)}
                className={`px-2.5 py-1.5 bg-white border rounded-full text-[11px] font-medium transition active:scale-95 ${cat.tone}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AILevelInfo {
  level: number;
  levelName: string;
  planName: string;
}

const AI_LEVEL_CONFIG = {
  0: {
    name: "غير مشترك",
    color: "from-slate-400 to-slate-500",
    badge: "محدود",
    description: "ردود أساسية فقط - قم بالترقية للحصول على دعم ذكي",
    icon: Lock,
    features: ["إجابات مختصرة جداً", "أسئلة أساسية فقط"],
    limitations: ["بدون نصائح تسويقية", "بدون كتابة أوصاف", "بدون أولوية دعم"],
  },
  1: {
    name: "دعم ذكي أساسي",
    color: "from-blue-500 to-blue-600",
    badge: "✦ أساسي",
    description: "إجابات على الأسئلة الشائعة حول المنصة",
    icon: Bot,
    features: ["شرح الباقات والأسعار", "كيفية إضافة إعلان", "البحث عن العقارات"],
    limitations: ["بدون كتابة أوصاف AI", "بدون نصائح تسويقية متقدمة"],
  },
  2: {
    name: "دعم VIP متقدم",
    color: "from-purple-500 to-purple-600",
    badge: "✦✦ VIP",
    description: "نصائح تسويقية احترافية + كتابة أوصاف بالذكاء الاصطناعي",
    icon: Sparkles,
    features: ["كتابة أوصاف إعلانات جذابة 🖊️", "نصائح تسويقية متقدمة 📈", "حل المشاكل التقنية 🔧", "ردود تفصيلية واحترافية"],
    limitations: [],
  },
  3: {
    name: "مساعد شخصي VIP+",
    color: "from-amber-500 to-amber-600",
    badge: "👑 رجال أعمال",
    description: "مساعدك الشخصي الحصري - أولوية قصوى وخدمة استثنائية",
    icon: Crown,
    features: ["🏆 أولوية قصوى في الردود", "📝 كتابة إعلانات كاملة", "💡 استشارات عقارية احترافية", "🎯 استراتيجيات بيع مخصصة", "⚡ استجابة فورية", "🤝 دعم شخصي 24/7"],
    limitations: [],
  },
};

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [showEscalateOption, setShowEscalateOption] = useState(false);
  const [aiLevelInfo, setAiLevelInfo] = useState<AILevelInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated } = useAuthStore();
  
  // Draggable button state
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chatbot-position");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // On mobile, ensure button is within screen bounds
          if (window.innerWidth < 768) {
            return {
              x: Math.max(8, Math.min(parsed.x, window.innerWidth - 64)),
              y: Math.max(8, Math.min(parsed.y, window.innerHeight - 64))
            };
          }
          return parsed;
        } catch {
          // Default position
          return { x: 12, y: window.innerHeight - 80 };
        }
      }
    }
    return { x: 0, y: 0 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize position on mount
  useEffect(() => {
    if (typeof window !== "undefined" && position.x === 0 && position.y === 0) {
      // Set default position based on screen size
      const isMobile = window.innerWidth < 768;
      const defaultX = isMobile ? 12 : 24;
      const defaultY = isMobile ? window.innerHeight - 80 : window.innerHeight - 80;
      setPosition({ x: defaultX, y: defaultY });
    }
  }, []);

  // Save position to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && position.x !== 0 && position.y !== 0) {
      localStorage.setItem("chatbot-position", JSON.stringify(position));
    }
  }, [position]);

  // Handle drag events
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Constrain to viewport - tighter constraints on mobile
      const isMobile = window.innerWidth < 768;
      const buttonSize = isMobile ? 56 : 56;
      const padding = isMobile ? 8 : 0;
      const maxX = window.innerWidth - buttonSize - padding;
      const maxY = window.innerHeight - buttonSize - padding;
      
      setPosition({
        x: Math.max(padding, Math.min(newX, maxX)),
        y: Math.max(padding, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  // Anchor the desktop popover relative to the button (Intercom/Drift
  // style: panel pops up next to the launcher). Previously we placed
  // the popover at the button's (x,y) then clamped with
  // Math.min(y, innerHeight - 540) — that means a button sitting near
  // the bottom of a tall screen pushed the panel up to top: small
  // number, so it materialised far away from the launcher and felt
  // like "the message appears at the top of the screen". The new
  // logic: prefer placing the panel ABOVE the button; if there isnt
  // enough headroom, place it BELOW; clamp to viewport with a small
  // gutter so it never overlaps the launcher.
  const computePopoverPosition = () => {
    if (typeof window === "undefined") {
      return { left: position.x, top: position.y };
    }
    const PANEL_WIDTH = 360;
    const PANEL_HEIGHT = 520;
    const BUTTON_SIZE = 56;
    const GAP = 12;
    const GUTTER = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // X: align the panel near the button. If the button sits on the
    // right half of the screen, right-align the panel; otherwise
    // left-align. Then clamp inside the viewport with a small gutter.
    let left;
    if (position.x + BUTTON_SIZE / 2 > vw / 2) {
      left = position.x + BUTTON_SIZE - PANEL_WIDTH;
    } else {
      left = position.x;
    }
    left = Math.max(GUTTER, Math.min(left, vw - PANEL_WIDTH - GUTTER));

    // Y: try ABOVE the button first.
    let top = position.y - PANEL_HEIGHT - GAP;
    if (top < GUTTER) {
      // Not enough headroom — drop below the button.
      top = position.y + BUTTON_SIZE + GAP;
    }
    // Final clamp so we never overflow the bottom edge either.
    top = Math.max(GUTTER, Math.min(top, vh - PANEL_HEIGHT - GUTTER));
    return { left, top };
  };

  useEffect(() => {
    async function fetchAILevel() {
      if (!isAuthenticated || !user) {
        setAiLevelInfo({ level: 0, levelName: "غير مشترك", planName: "" });
        return;
      }

      try {
        // Was hitting /api/user/ai-level which never existed → every
        // user (including super_admin) fell into the 404 branch and
        // got tagged "محدود". Correct endpoint is /api/ai/user/ai-level,
        // and we need the Bearer header for incognito Safari where
        // cross-origin cookies are blocked.
        const response = await fetch(`${API_URL}/api/ai/user/ai-level`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          setAiLevelInfo(data);
        } else {
          setAiLevelInfo({ level: 0, levelName: "غير مشترك", planName: "" });
        }
      } catch {
        setAiLevelInfo({ level: 0, levelName: "غير مشترك", planName: "" });
      }
    }

    if (isOpen) {
      fetchAILevel();
    }
  }, [isOpen, isAuthenticated, user]);

  // sendMessage accepts an explicit text so chip-clicks can fire a
  // message without round-tripping through the input state (which can
  // race against setState batching).
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setShowEscalateOption(false);

    try {
      const response = await fetch(`${API_URL}/api/ai/customer-chat`, {
        method: "POST",
        // Authorization Bearer header so the backend can read the
        // JWT and resolve the real user (admin bypass relies on this).
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ messages: newMessages, sessionId, userId: user?.id }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages([...newMessages, {
          role: "assistant",
          content: data.message,
          escalated: data.escalated
        }]);
        if (data.escalated) {
          setShowEscalateOption(true);
          // Bot-side escalation also creates an ai_escalations row +
          // (future) customer-inbox notification — keep the bell in
          // sync without waiting for the 30s navbar poll.
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("notificationsUpdated"));
          }
        }
      } else {
        setMessages([...newMessages, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى." }]);
      }
    } catch (error) {
      setMessages([...newMessages, { role: "assistant", content: "عذراً، لا يمكن الاتصال. حاول لاحقاً." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);

  // Reset the chat back to its welcome state without closing the
  // popover — the visitor stays inside the same session but starts
  // fresh. We deliberately keep sessionId so backend analytics still
  // tie everything to one customer journey.
  const resetChatToHome = () => {
    setMessages([]);
    setInput("");
    setShowEscalateOption(false);
  };

  const handleChipClick = (payload: string) => {
    if (payload === "__home__") return resetChatToHome();
    if (payload === "__escalate__") return handleEscalate();
    void sendMessage(payload);
  };

  const handleEscalate = async () => {
    if (!user) {
      setMessages([...messages, {
        role: "assistant",
        content: "للتواصل مع فريق الدعم، يرجى تسجيل الدخول أولاً."
      }]);
      return;
    }

    setIsLoading(true);
    try {
      const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content || "";

      // Bearer header is mandatory — without it Safari incognito drops
      // the cookie cross-origin and the request 401s. Previously this
      // was the actual cause of the "عذراً حدث خطأ" the customer saw
      // *after* a successful bot escalation reply.
      const response = await fetch(`${API_URL}/api/ai/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          lastMessage: lastUserMessage,
          reason: "طلب العميل التحدث مع الدعم البشري"
        }),
      });

      let data: any = null;
      try { data = await response.json(); } catch { /* non-JSON body */ }

      if (response.ok && data?.ticketNumber) {
        // Owner requirement: even if email/WhatsApp notifications
        // failed silently on the backend, the customer must see a
        // clear success message — never a generic error. The ticket
        // row is what counts; notifications are best-effort.
        // Rendered as a TicketCard (id, status badge, created time,
        // follow-up button, home button) — see the renderer below.
        setMessages([...messages, {
          role: "assistant",
          content: "تم تحويل طلبك إلى الدعم البشري",
          ticket: {
            ticketId: data.ticket?.id ?? data.ticketNumber,
            ticketNumber: data.ticketNumber,
            status: data.ticket?.status || "new",
            createdAt: data.ticket?.created_at || new Date().toISOString(),
          },
        }]);
        setShowEscalateOption(false);
        // Tick the navbar bell immediately — Navbar polls every 30s,
        // but it also listens for this event so a fresh notification
        // shows up the moment the ticket row + customer inbox row
        // exist. Without this the bell stayed stale up to half a
        // minute after the escalation message appeared in the chat.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("notificationsUpdated"));
        }
      } else {
        const backendMsg = data?.error || data?.message;
        setMessages([...messages, {
          role: "assistant",
          content: backendMsg || "تعذّر فتح التذكرة الآن. حاول بعد قليل أو راسلنا مباشرة."
        }]);
      }
    } catch (error) {
      setMessages([...messages, { role: "assistant", content: "عذراً، لا يمكن الاتصال. حاول لاحقاً." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const currentLevel = aiLevelInfo?.level ?? 0;
  const levelConfig = AI_LEVEL_CONFIG[currentLevel as keyof typeof AI_LEVEL_CONFIG] || AI_LEVEL_CONFIG[0];
  const LevelIcon = levelConfig.icon;

  if (!isOpen) {
    return (
      <button
        ref={buttonRef}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          // Only open if not dragging
          if (!isDragging) {
            setIsOpen(true);
          }
        }}
        style={{
          position: "fixed",
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        className="z-50 w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform active:cursor-grabbing touch-none"
        aria-label="فتح المحادثة"
      >
        <MessageCircle className="w-6 h-6 text-[#002845] pointer-events-none" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse pointer-events-none" />
      </button>
    );
  }

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/20 z-40 md:bg-transparent"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <div 
        className={`fixed z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-300 ease-out ${
          typeof window !== "undefined" && window.innerWidth < 768
            ? "w-[calc(100vw-1rem)] left-2 right-2 bottom-4 top-auto max-h-[calc(100vh-5rem)] animate-in slide-in-from-bottom-4 fade-in"
            : `w-[360px] max-w-[calc(100vw-2rem)] ${
                typeof window !== "undefined" && position.x > window.innerWidth / 2
                  ? "animate-in slide-in-from-right-4 fade-in"
                  : "animate-in slide-in-from-left-4 fade-in"
              }`
        }`}
        style={typeof window !== "undefined" && window.innerWidth < 768 ? {
          height: "calc(100vh - 5rem)",
          maxHeight: "calc(100vh - 5rem)",
        } : (() => {
          const { left, top } = computePopoverPosition();
          return {
            height: "520px",
            maxHeight: "calc(100vh - 16px)",
            left: `${left}px`,
            top: `${top}px`,
          };
        })()}
      >
        <div className="bg-gradient-to-l from-[#002845] to-[#003d66] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">مساعد بيت الجزيرة</h3>
              <p className="text-xs text-slate-300">متصل الآن</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                onClick={resetChatToHome}
                className="px-2.5 h-8 rounded-full bg-white/10 hover:bg-[#D4AF37]/30 text-xs font-bold flex items-center gap-1 transition"
                title="الرجوع للقائمة الرئيسية"
              >
                🏠 قائمة
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition group"
              title="إغلاق المحادثة"
            >
              <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>

      <div className={`px-4 py-2 bg-gradient-to-l ${levelConfig.color} text-white flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <LevelIcon className="w-4 h-4" />
          <span className="text-xs font-medium">
            {isAuthenticated ? `مستوى الخدمة: ${levelConfig.badge}` : "غير مسجل دخول"}
          </span>
          {aiLevelInfo?.planName && (
            <span className="text-xs opacity-80">({aiLevelInfo.planName})</span>
          )}
        </div>
        {currentLevel < 2 && isAuthenticated && (
          <a 
            href="/upgrade" 
            className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full transition flex items-center gap-1"
          >
            <Crown className="w-3 h-3" />
            ترقية
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-slate-50 to-white">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${levelConfig.color} flex items-center justify-center mb-4 shadow-lg`}>
              <LevelIcon className="w-8 h-8 text-white" />
            </div>
            <p className="text-[#002845] font-semibold">
              {currentLevel >= 2 ? "مرحباً! أنا مساعدك الشخصي" : "مرحباً! كيف يمكنني مساعدتك؟"}
            </p>
            <p className="text-slate-500 text-sm mt-2">
              {levelConfig.description}
            </p>
            
            {/* عرض الميزات حسب المستوى */}
            <div className="mt-4 w-full">
              {currentLevel === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4" />
                    <span className="font-semibold">خدمة محدودة</span>
                  </div>
                  <p className="mb-2">اشترك في باقة للحصول على دعم ذكي أفضل</p>
                  <a href="/plans" className="inline-block text-amber-800 font-semibold hover:underline">
                    عرض الباقات ←
                  </a>
                </div>
              )}

              {currentLevel === 1 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs">
                  <div className="flex items-center gap-2 mb-2 text-blue-700">
                    <Bot className="w-4 h-4" />
                    <span className="font-semibold">ميزاتك الحالية:</span>
                  </div>
                  <ul className="text-blue-600 space-y-1 mb-3">
                    {levelConfig.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <span className="text-green-500">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2 border-t border-blue-200">
                    <p className="text-blue-500 mb-1 font-medium">للحصول على المزيد:</p>
                    <ul className="text-slate-500 space-y-1">
                      {levelConfig.limitations.map((l, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <span className="text-red-400">✗</span> {l}
                        </li>
                      ))}
                    </ul>
                    <a href="/upgrade" className="mt-2 inline-flex items-center gap-1 text-purple-600 font-semibold hover:underline">
                      <Sparkles className="w-3 h-3" /> ترقية للـ VIP
                    </a>
                  </div>
                </div>
              )}

              {currentLevel === 2 && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs">
                  <div className="flex items-center gap-2 mb-2 text-purple-700">
                    <Sparkles className="w-4 h-4" />
                    <span className="font-semibold">ميزاتك VIP:</span>
                  </div>
                  <ul className="text-purple-600 space-y-1">
                    {levelConfig.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <span className="text-green-500">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 pt-2 border-t border-purple-200">
                    <a href="/upgrade" className="inline-flex items-center gap-1 text-amber-600 font-semibold hover:underline">
                      <Crown className="w-3 h-3" /> ترقية لرجال الأعمال - مساعد شخصي!
                    </a>
                  </div>
                </div>
              )}

              {currentLevel === 3 && (
                <div className="p-3 bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-xl text-xs">
                  <div className="flex items-center gap-2 mb-2 text-amber-700">
                    <Crown className="w-5 h-5" />
                    <span className="font-bold text-sm">مساعدك الشخصي VIP+</span>
                  </div>
                  <p className="text-amber-600 mb-2">أنت من كبار رجال الأعمال! 🎖️</p>
                  <ul className="text-amber-700 space-y-1">
                    {levelConfig.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1 font-medium">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <StarterMenu currentLevel={currentLevel} onPick={(q) => void sendMessage(q)} />
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  msg.role === "user"
                    ? "bg-[#002845]"
                    : `bg-gradient-to-br ${levelConfig.color}`
                }`}>
                  {msg.role === "user" ? (
                    <User className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <LevelIcon className="w-3.5 h-3.5 text-white" />
                  )}
                </div>
                {msg.ticket ? (
                  <TicketSuccessCard
                    ticket={msg.ticket}
                    onHome={resetChatToHome}
                  />
                ) : (
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#002845] text-white rounded-tr-none"
                        : msg.escalated
                          ? "bg-amber-50 border border-amber-200 text-slate-700 rounded-tl-none"
                          : "bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm"
                    }`}
                  >
                    {msg.escalated && (
                      <div className="flex items-center gap-1 text-amber-600 text-xs mb-1">
                        <AlertTriangle className="w-3 h-3" />
                        سيتم تحويلك للدعم
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br ${levelConfig.color} flex items-center justify-center`}>
                  <LevelIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    جاري الكتابة...
                  </div>
                </div>
              </div>
            )}

            {/* Follow-up chips — show after the latest assistant reply
                so the visitor always has a clear next step. Detection
                runs in the frontend so it works even when GPT forgets
                to add the prompt at the end. */}
            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (() => {
              const lastBot = messages[messages.length - 1].content;
              const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
              const intent = detectLastBotIntent(lastUser, lastBot);
              const chips = getFollowUpChips(intent).slice(0, 4);
              return (
                <div className="flex flex-wrap gap-1.5 mt-1 pr-9">
                  {chips.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleChipClick(c.payload)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition active:scale-95 ${
                        c.payload === "__home__"
                          ? "border-[#D4AF37] bg-[#FFFCEE] text-[#9A7D28] hover:bg-[#FFF7E0]"
                          : c.payload === "__escalate__"
                            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-slate-200 bg-white text-slate-600 hover:border-[#D4AF37] hover:text-[#002845]"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              );
            })()}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {showEscalateOption && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          <button
            onClick={handleEscalate}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-2 bg-gradient-to-l from-amber-500 to-amber-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            <Headphones className="w-4 h-4" />
            تحويل للدعم البشري
          </button>
        </div>
      )}

      <div className="p-3 border-t border-slate-100 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="اكتب رسالتك..."
            disabled={isLoading}
            className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent disabled:bg-slate-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2.5 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] rounded-xl hover:opacity-90 transition font-semibold disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
