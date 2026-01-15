"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, AlertTriangle, Headphones, Crown, Lock, Sparkles } from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";

interface Message {
  role: "user" | "assistant";
  content: string;
  escalated?: boolean;
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    async function fetchAILevel() {
      if (!isAuthenticated || !user) {
        setAiLevelInfo({ level: 0, levelName: "غير مشترك", planName: "" });
        return;
      }
      
      try {
        const response = await fetch("/api/user/ai-level", {
          credentials: "include",
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setShowEscalateOption(false);

    try {
      const response = await fetch("/api/ai/customer-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      
      const response = await fetch("/api/ai/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          sessionId, 
          lastMessage: lastUserMessage,
          reason: "طلب العميل التحدث مع الدعم البشري"
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages([...messages, { 
          role: "assistant", 
          content: `تم إنشاء تذكرة دعم برقم: ${data.ticketNumber}\n\nسيتواصل معك فريق الدعم قريباً. يمكنك متابعة التذكرة من صفحة حسابك.` 
        }]);
        setShowEscalateOption(false);
      } else {
        setMessages([...messages, { role: "assistant", content: "عذراً، حدث خطأ. حاول لاحقاً." }]);
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
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 md:left-6 md:right-auto z-50 w-14 h-14 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="فتح المحادثة"
      >
        <MessageCircle className="w-6 h-6 text-[#002845]" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
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
      <div className="fixed bottom-6 right-4 md:left-6 md:right-auto z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300" style={{ height: "520px", maxHeight: "calc(100vh - 100px)" }}>
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
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition group"
            title="إغلاق المحادثة"
          >
            <X className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
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

            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {currentLevel >= 2 ? (
                ["ساعدني في كتابة وصف لفيلا", "نصائح لزيادة مشاهدات إعلاني", "كيف أسوق عقاري؟"].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="px-3 py-1.5 bg-white border border-purple-200 rounded-full text-xs text-purple-700 hover:border-purple-400 hover:bg-purple-50 transition"
                  >
                    {q}
                  </button>
                ))
              ) : (
                ["كيف أضيف إعلان؟", "ما هي الباقات المتاحة؟", "كيف أبحث عن عقار؟"].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-[#D4AF37] hover:text-[#002845] transition"
                  >
                    {q}
                  </button>
                ))
              )}
            </div>
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
