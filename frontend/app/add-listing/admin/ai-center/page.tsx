"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  Clock,
  Copy,
  Check,
  Coins,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  TrendingUp,
  User as UserIcon,
  Users,
  Wand2,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    estimated_cost_usd: number;
    model: string;
  };
}

interface CenterStats {
  today: {
    customer_chats: number;
    admin_chats: number;
    escalations: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number | string;
  };
  week: { total_chats: number; escalations: number; cost_usd: number | string };
  month: { total_chats: number; escalations: number; cost_usd: number | string };
  by_hour_24h: { hour: string; n: number }[];
  recent_escalations: {
    id: number;
    user_message: string;
    escalate_reason: string;
    created_at: string;
  }[];
  top_sessions_7d: { session_id: string; chats: number }[];
}

interface AiSettings {
  ai_support_enabled: string;
  ai_system_prompt: string;
  ai_model: string;
  ai_temperature: string;
  ai_max_tokens: string;
  ai_banned_topics: string;
  ai_working_hours_start: string;
  ai_working_hours_end: string;
  ai_per_user_daily_limit: string;
  ai_sentiment_enabled: string;
  ai_ab_testing_enabled: string;
  ai_auto_escalate_negative: string;
  _meta?: {
    allowed_models: string[];
    pricing_per_1k_tokens: Record<string, { input: number; output: number }>;
  };
}

interface PromptVariant {
  id: number;
  label: string;
  prompt_text: string;
  weight: number;
  is_active: boolean;
  created_at: string;
  chats?: number;
  escalations?: number;
  negative?: number;
  positive?: number;
}

interface SentimentSummary {
  window: string;
  very_negative: number;
  negative: number;
  neutral: number;
  positive: number;
  very_positive: number;
  scored: number;
  total: number;
}

interface ChatLog {
  id: number;
  session_id: string | null;
  source: string;
  model: string | null;
  user_message: string | null;
  ai_response: string | null;
  escalated: boolean;
  escalate_reason: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: string;
  sentiment: string | null;
  sentiment_score: string | null;
  variant_id: number | null;
  created_at: string;
}

interface GeneratedDescription {
  id: string;
  prompt: { propertyType: string; location: string; area: string };
  description: string;
  at: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const TABS = [
  { key: "overview", label: "نظرة عامة", icon: Activity },
  { key: "chat", label: "المساعد الذكي", icon: MessageSquare },
  { key: "generate", label: "توليد محتوى", icon: Wand2 },
  { key: "logs", label: "سجل المحادثات", icon: FileText },
  { key: "ab", label: "تجارب A/B", icon: TrendingUp },
  { key: "settings", label: "الإعدادات المتقدّمة", icon: SettingsIcon },
] as const;

const SENTIMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  very_negative: { label: "سلبي جداً", color: "text-rose-700", bg: "bg-rose-500" },
  negative:      { label: "سلبي",       color: "text-rose-600", bg: "bg-rose-400" },
  neutral:       { label: "محايد",      color: "text-slate-600", bg: "bg-slate-400" },
  positive:      { label: "إيجابي",     color: "text-emerald-600", bg: "bg-emerald-400" },
  very_positive: { label: "إيجابي جداً", color: "text-emerald-700", bg: "bg-emerald-500" },
};

type TabKey = (typeof TABS)[number]["key"];

const PROPERTY_TYPES = ["شقة", "فيلا", "أرض", "عمارة", "دور", "استراحة", "مكتب", "محل تجاري"];

const QUICK_PROMPTS = [
  "كيف أحسّن مبيعات العقارات؟",
  "ما هي أفضل استراتيجيات التسويق؟",
  "حلل أداء المنصة هذا الشهر",
  "اقترح أفكار لجذب عملاء جدد",
];

const HISTORY_KEY = "baytaljazeera_ai_descriptions_history";

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatCost(n: number | string | undefined) {
  const v = Number(n) || 0;
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}ك`;
  return String(n);
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
  return `قبل ${Math.floor(diff / 86400)} يوم`;
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function AICenterPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [stats, setStats] = useState<CenterStats | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Chat tab
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generate tab
  const [genMode, setGenMode] = useState<"description" | "response">("description");
  const [propertyType, setPropertyType] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [area, setArea] = useState("");
  const [location, setLocation] = useState("");
  const [features, setFeatures] = useState("");
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [complaint, setComplaint] = useState("");
  const [draftedResponse, setDraftedResponse] = useState("");
  const [responseLoading, setResponseLoading] = useState(false);
  const [history, setHistory] = useState<GeneratedDescription[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Logs tab filters
  const [logSource, setLogSource] = useState<"" | "customer" | "admin">("");
  const [logEscalated, setLogEscalated] = useState(false);
  const [logQuery, setLogQuery] = useState("");

  // Sentiment + A/B
  const [sentiment, setSentiment] = useState<SentimentSummary | null>(null);
  const [variants, setVariants] = useState<PromptVariant[]>([]);

  // Settings draft
  const [settingsDraft, setSettingsDraft] = useState<AiSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // ─── Mount: load everything ──────────────────────────────────────────────
  useEffect(() => {
    refreshAll();
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (activeTab === "logs") void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, logSource, logEscalated]);

  async function refreshAll() {
    await Promise.all([fetchStats(), fetchSettings(), fetchSentiment(), fetchVariants()]);
  }

  async function fetchSentiment() {
    try {
      const res = await fetch(`${API_URL}/api/ai/center/sentiment`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) setSentiment(await res.json());
    } catch {
      /* ignore */
    }
  }

  async function fetchVariants() {
    try {
      const res = await fetch(`${API_URL}/api/ai/center/prompt-variants`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setVariants(data.variants || []);
      }
    } catch {
      /* ignore */
    }
  }

  async function saveVariant(payload: Partial<PromptVariant> & { id?: number }) {
    const isNew = !payload.id;
    const url = isNew
      ? `${API_URL}/api/ai/center/prompt-variants`
      : `${API_URL}/api/ai/center/prompt-variants/${payload.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success(isNew ? "تم إضافة النسخة" : "تم التحديث");
      void fetchVariants();
    } else {
      toast.error("تعذّر الحفظ");
    }
  }

  async function deleteVariant(id: number) {
    if (!confirm("حذف هذه النسخة؟")) return;
    const res = await fetch(`${API_URL}/api/ai/center/prompt-variants/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      toast.success("تم الحذف");
      void fetchVariants();
    } else {
      toast.error("تعذّر الحذف");
    }
  }

  async function fetchStats() {
    setLoadingStats(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/center/stats`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: CenterStats = await res.json();
        setStats(data);
      }
    } finally {
      setLoadingStats(false);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch(`${API_URL}/api/ai/support-settings`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: AiSettings = await res.json();
        setSettings(data);
        setSettingsDraft(data);
      }
    } catch {
      /* ignore */
    }
  }

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const qs = new URLSearchParams();
      if (logSource) qs.set("source", logSource);
      if (logEscalated) qs.set("escalated", "1");
      if (logQuery.trim()) qs.set("q", logQuery.trim());
      qs.set("limit", "150");
      const res = await fetch(`${API_URL}/api/ai/center/logs?${qs.toString()}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } finally {
      setLoadingLogs(false);
    }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/support-settings`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_support_enabled: settingsDraft.ai_support_enabled === "true",
          ai_system_prompt: settingsDraft.ai_system_prompt,
          ai_model: settingsDraft.ai_model,
          ai_temperature: settingsDraft.ai_temperature,
          ai_max_tokens: settingsDraft.ai_max_tokens,
          ai_banned_topics: settingsDraft.ai_banned_topics,
          ai_working_hours_start: settingsDraft.ai_working_hours_start,
          ai_working_hours_end: settingsDraft.ai_working_hours_end,
          ai_per_user_daily_limit: settingsDraft.ai_per_user_daily_limit,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("تم حفظ الإعدادات");
        setSettings(data.settings || settingsDraft);
        setSettingsDraft(data.settings || settingsDraft);
      } else {
        toast.error("تعذّر الحفظ");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleSupport() {
    if (!settings) return;
    const next = settings.ai_support_enabled === "true" ? "false" : "true";
    try {
      const res = await fetch(`${API_URL}/api/ai/support-settings`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ai_support_enabled: next === "true" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || { ...settings, ai_support_enabled: next });
        setSettingsDraft(data.settings || { ...settings, ai_support_enabled: next });
        toast.success(next === "true" ? "تم تفعيل الدعم الآلي" : "تم تعطيل الدعم الآلي");
      } else {
        toast.error("تعذّر التحديث");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    }
  }

  // ─── Chat tab ──────────────────────────────────────────────────────────
  async function sendChat() {
    if (!prompt.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: prompt };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setPrompt("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages([
          ...newMsgs,
          { role: "assistant", content: data.message, usage: data.usage },
        ]);
      } else {
        setMessages([
          ...newMsgs,
          { role: "assistant", content: data.error || "حدث خطأ في الذكاء الاصطناعي" },
        ]);
      }
    } catch {
      setMessages([
        ...newMsgs,
        { role: "assistant", content: "تعذّر الاتصال بالخادم" },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // ─── Generate tab ──────────────────────────────────────────────────────
  async function generateDescription() {
    setDescriptionLoading(true);
    setGeneratedDescription("");
    try {
      const res = await fetch(`${API_URL}/api/ai/generate-description`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ propertyType, bedrooms, bathrooms, area, location, features }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedDescription(data.description);
        const entry: GeneratedDescription = {
          id: String(Date.now()),
          prompt: { propertyType, location, area },
          description: data.description,
          at: new Date().toISOString(),
        };
        const next = [entry, ...history].slice(0, 20);
        setHistory(next);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      } else {
        toast.error(data.error || "تعذّر التوليد");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setDescriptionLoading(false);
    }
  }

  async function draftResponse() {
    if (!complaint.trim()) return;
    setResponseLoading(true);
    setDraftedResponse("");
    try {
      const res = await fetch(`${API_URL}/api/ai/draft-response`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, complaint }),
      });
      const data = await res.json();
      if (res.ok) setDraftedResponse(data.response);
      else toast.error(data.error || "تعذّر الصياغة");
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setResponseLoading(false);
    }
  }

  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // ─── Derived ───────────────────────────────────────────────────────────
  const supportEnabled = settings?.ai_support_enabled === "true";
  const totalToday =
    (stats?.today?.customer_chats ?? 0) + (stats?.today?.admin_chats ?? 0);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 md:space-y-10" dir="rtl">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-[#EDE6D6] bg-gradient-to-l from-white via-[#FAF8F4] to-white">
        <div className="pointer-events-none absolute -left-12 -top-12 w-48 h-48 rounded-full bg-[#D4AF37]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-12 w-56 h-56 rounded-full bg-[#002845]/5 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #002845 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 md:px-8 py-7 md:py-9">
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-white border border-[#EDE6D6] shadow-sm flex items-center justify-center">
              <Bot className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#9A7D28] tracking-[0.2em] uppercase mb-1 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                AI Command
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-[#002845] leading-tight">
                مركز الذكاء الاصطناعي
              </h1>
              <p className="text-sm text-slate-500 mt-1.5">
                التحكم في البوت، توليد المحتوى، مراجعة المحادثات، وضبط الكلفة
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={toggleSupport}
              disabled={!settings}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border transition ${
                supportEnabled
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${supportEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
              />
              {supportEnabled ? "الدعم الآلي مُفعّل" : "الدعم الآلي مُعطّل"}
            </button>
            <button
              onClick={refreshAll}
              disabled={loadingStats}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4AF37]/40 text-[#9A7D28] bg-white hover:bg-[#FFFCEE] active:scale-95 transition disabled:opacity-50"
            >
              {loadingStats ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              تحديث
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition ${
                active
                  ? "border-[#D4AF37] bg-[#FFFCEE] text-[#9A7D28] font-bold shadow-sm"
                  : "border-[#EDE6D6] bg-white text-slate-600 hover:border-[#D4AF37]/40"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab
          stats={stats}
          sentiment={sentiment}
          totalToday={totalToday}
          loadingStats={loadingStats}
          onJump={(k) => setActiveTab(k)}
        />
      )}

      {activeTab === "chat" && (
        <ChatTab
          messages={messages}
          prompt={prompt}
          setPrompt={setPrompt}
          chatLoading={chatLoading}
          sendChat={sendChat}
          messagesEndRef={messagesEndRef}
          model={settings?.ai_model}
        />
      )}

      {activeTab === "generate" && (
        <GenerateTab
          mode={genMode}
          setMode={setGenMode}
          propertyType={propertyType}
          setPropertyType={setPropertyType}
          bedrooms={bedrooms}
          setBedrooms={setBedrooms}
          bathrooms={bathrooms}
          setBathrooms={setBathrooms}
          area={area}
          setArea={setArea}
          location={location}
          setLocation={setLocation}
          features={features}
          setFeatures={setFeatures}
          generateDescription={generateDescription}
          generatedDescription={generatedDescription}
          descriptionLoading={descriptionLoading}
          customerName={customerName}
          setCustomerName={setCustomerName}
          complaint={complaint}
          setComplaint={setComplaint}
          draftResponse={draftResponse}
          draftedResponse={draftedResponse}
          responseLoading={responseLoading}
          history={history}
          copyText={copyText}
          copiedKey={copiedKey}
        />
      )}

      {activeTab === "logs" && (
        <LogsTab
          logs={logs}
          loading={loadingLogs}
          source={logSource}
          setSource={setLogSource}
          escalated={logEscalated}
          setEscalated={setLogEscalated}
          query={logQuery}
          setQuery={setLogQuery}
          refresh={fetchLogs}
        />
      )}

      {activeTab === "ab" && (
        <ABTab
          variants={variants}
          onSave={saveVariant}
          onDelete={deleteVariant}
          abEnabled={settings?.ai_ab_testing_enabled === "true"}
        />
      )}

      {activeTab === "settings" && settingsDraft && (
        <SettingsTab
          draft={settingsDraft}
          setDraft={setSettingsDraft}
          original={settings}
          save={saveSettings}
          saving={savingSettings}
        />
      )}
    </div>
  );
}

// ─── Tab components ───────────────────────────────────────────────────────
function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-1.5 h-6 rounded-full bg-[#D4AF37]" />
      <h2 className="text-base md:text-lg font-bold text-[#002845]">{title}</h2>
      <div className="flex-1 h-px bg-[#EDE6D6]" />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "normal",
  onClick,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "normal" | "attention" | "urgent";
  onClick?: () => void;
}) {
  const chrome =
    tone === "urgent"
      ? "border-rose-200 bg-rose-50/60 hover:border-rose-300"
      : tone === "attention"
        ? "border-amber-200 bg-amber-50/60 hover:border-amber-300"
        : "border-[#EDE6D6] bg-white hover:border-[#D4AF37]/50 hover:shadow-[0_1px_24px_-12px_rgba(212,175,55,0.4)]";
  const iconColor =
    tone === "urgent" ? "text-rose-600" : tone === "attention" ? "text-amber-600" : "text-[#D4AF37]";
  const inner = (
    <div className={`group h-full rounded-2xl border p-5 transition ${chrome}`}>
      <Icon className={`w-5 h-5 mb-3 ${iconColor}`} />
      <p className="text-3xl font-black text-[#002845] leading-none tabular-nums">{value}</p>
      <p className="text-sm font-semibold text-[#002845] mt-3">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
  if (onClick) return <button type="button" onClick={onClick} className="text-right">{inner}</button>;
  return inner;
}

function OverviewTab({
  stats,
  sentiment,
  totalToday,
  loadingStats,
  onJump,
}: {
  stats: CenterStats | null;
  sentiment: SentimentSummary | null;
  totalToday: number;
  loadingStats: boolean;
  onJump: (k: TabKey) => void;
}) {
  if (loadingStats && !stats) {
    return (
      <div className="py-20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }
  const today = stats?.today;
  const week = stats?.week;
  const month = stats?.month;
  const todayTokens = (today?.prompt_tokens || 0) + (today?.completion_tokens || 0);
  const escalationsToday = today?.escalations || 0;

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle title="نشاط آخر ٢٤ ساعة" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            icon={MessageSquare}
            label="محادثات اليوم"
            value={totalToday.toLocaleString("en-US")}
            sub={`${today?.customer_chats || 0} عميل · ${today?.admin_chats || 0} إدارة`}
            onClick={() => onJump("logs")}
          />
          <StatCard
            icon={AlertTriangle}
            label="تصعيدات اليوم"
            value={escalationsToday}
            sub={escalationsToday > 0 ? "تحتاج تدخّل بشري" : "كل شيء هادئ"}
            tone={escalationsToday >= 5 ? "urgent" : escalationsToday > 0 ? "attention" : "normal"}
            onClick={() => onJump("logs")}
          />
          <StatCard
            icon={Coins}
            label="استهلاك Tokens"
            value={formatTokens(todayTokens)}
            sub={`prompt: ${formatTokens(today?.prompt_tokens || 0)} · response: ${formatTokens(today?.completion_tokens || 0)}`}
          />
          <StatCard
            icon={TrendingUp}
            label="كلفة تقديرية اليوم"
            value={formatCost(today?.cost_usd)}
            sub={`الأسبوع: ${formatCost(week?.cost_usd)} · الشهر: ${formatCost(month?.cost_usd)}`}
          />
        </div>
      </section>

      {sentiment && sentiment.scored > 0 && (
        <section>
          <SectionTitle title="مشاعر العملاء (آخر ٧ أيام)" />
          <SentimentWidget data={sentiment} />
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
          <h3 className="text-base font-bold text-[#002845] flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-[#D4AF37]" />
            توزيع آخر ٢٤ ساعة بحسب الساعة
          </h3>
          <HourBars data={stats?.by_hour_24h || []} />
        </div>

        <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
          <h3 className="text-base font-bold text-[#002845] flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            أحدث التصعيدات
          </h3>
          {(stats?.recent_escalations || []).length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">لا تصعيدات حديثة</p>
          ) : (
            <ul className="divide-y divide-[#F1ECE0]">
              {stats?.recent_escalations.map((e) => (
                <li key={e.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-rose-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#002845] truncate">{e.user_message || "—"}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {e.escalate_reason || "بدون سبب محدّد"} · {timeAgo(e.created_at)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <SectionTitle title="ملخّص الأسبوع والشهر" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <StatCard
            icon={MessageSquare}
            label="محادثات ٧ أيام"
            value={(week?.total_chats || 0).toLocaleString("en-US")}
          />
          <StatCard
            icon={AlertTriangle}
            label="تصعيدات ٧ أيام"
            value={week?.escalations || 0}
            tone={(week?.escalations || 0) >= 10 ? "attention" : "normal"}
          />
          <StatCard
            icon={MessageSquare}
            label="محادثات ٣٠ يوم"
            value={(month?.total_chats || 0).toLocaleString("en-US")}
          />
        </div>
      </section>
    </div>
  );
}

function HourBars({ data }: { data: { hour: string; n: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">لا بيانات</p>;
  }
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <div className="flex items-end justify-between gap-1 h-32" dir="ltr">
      {data.slice(-24).map((d, i) => {
        const h = Math.round((d.n / max) * 100);
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
            <div
              className="w-full bg-gradient-to-t from-[#D4AF37] to-[#E6C966] rounded-t"
              style={{ height: `${h}%`, minHeight: d.n > 0 ? 2 : 0 }}
              title={`${d.n} محادثات`}
            />
          </div>
        );
      })}
    </div>
  );
}

function ChatTab({
  messages,
  prompt,
  setPrompt,
  chatLoading,
  sendChat,
  messagesEndRef,
  model,
}: {
  messages: ChatMessage[];
  prompt: string;
  setPrompt: (s: string) => void;
  chatLoading: boolean;
  sendChat: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  model?: string;
}) {
  return (
    <section className="rounded-3xl border border-[#EDE6D6] bg-white overflow-hidden">
      <div className="px-5 md:px-6 py-4 border-b border-[#EDE6D6] flex items-center justify-between">
        <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#D4AF37]" />
          المساعد الذكي
        </h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FAF8F4] border border-[#EDE6D6] text-slate-500 tabular-nums">
          {model || "gpt-4o-mini"}
        </span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-5 md:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#FAF8F4] border border-[#EDE6D6] flex items-center justify-center">
              <Bot className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <p className="text-sm font-semibold text-[#002845]">اسأل عن أي شيء يخص المنصة</p>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              التحليل، التسويق، خدمة العملاء، الأداء
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(q)}
                  className="px-3 py-1.5 rounded-full text-xs border border-[#EDE6D6] bg-[#FAF8F4] text-slate-600 hover:border-[#D4AF37]/40 hover:bg-[#FFFCEE] transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border ${
                  m.role === "user"
                    ? "bg-[#002845] border-[#002845]"
                    : "bg-[#FAF8F4] border-[#EDE6D6]"
                }`}
              >
                {m.role === "user" ? (
                  <UserIcon className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-[#D4AF37]" />
                )}
              </div>
              <div className={`min-w-0 max-w-[80%]`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#002845] text-white"
                      : "bg-[#FAF8F4] border border-[#EDE6D6] text-[#002845]"
                  }`}
                >
                  {m.content}
                </div>
                {m.usage && (
                  <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                    {m.usage.prompt_tokens + m.usage.completion_tokens} tokens ·{" "}
                    {formatCost(m.usage.estimated_cost_usd)}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        {chatLoading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-[#FAF8F4] border border-[#EDE6D6] flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
            </div>
            <div className="rounded-2xl bg-[#FAF8F4] border border-[#EDE6D6] px-4 py-3 text-sm text-slate-500">
              يكتب الردّ...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-[#EDE6D6] p-4 flex items-end gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendChat();
            }
          }}
          rows={1}
          placeholder="اكتب رسالتك..."
          className="flex-1 resize-none rounded-2xl border border-[#EDE6D6] bg-[#FAF8F4] px-4 py-3 text-sm text-[#002845] placeholder:text-slate-400 focus:outline-none focus:border-[#D4AF37]/50"
        />
        <button
          onClick={() => void sendChat()}
          disabled={chatLoading || !prompt.trim()}
          className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[#D4AF37] text-white hover:bg-[#B8932E] active:scale-95 transition disabled:opacity-40"
        >
          {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </section>
  );
}

function GenerateTab(props: {
  mode: "description" | "response";
  setMode: (m: "description" | "response") => void;
  propertyType: string;
  setPropertyType: (s: string) => void;
  bedrooms: string;
  setBedrooms: (s: string) => void;
  bathrooms: string;
  setBathrooms: (s: string) => void;
  area: string;
  setArea: (s: string) => void;
  location: string;
  setLocation: (s: string) => void;
  features: string;
  setFeatures: (s: string) => void;
  generateDescription: () => void;
  generatedDescription: string;
  descriptionLoading: boolean;
  customerName: string;
  setCustomerName: (s: string) => void;
  complaint: string;
  setComplaint: (s: string) => void;
  draftResponse: () => void;
  draftedResponse: string;
  responseLoading: boolean;
  history: GeneratedDescription[];
  copyText: (key: string, text: string) => void;
  copiedKey: string | null;
}) {
  return (
    <section className="space-y-5">
      <div className="flex gap-2">
        {[
          { key: "description" as const, label: "وصف عقار", icon: Wand2 },
          { key: "response" as const, label: "رد على شكوى", icon: Users },
        ].map((opt) => {
          const Icon = opt.icon;
          const active = props.mode === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => props.setMode(opt.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm transition ${
                active
                  ? "border-[#D4AF37] bg-[#FFFCEE] text-[#9A7D28] font-bold"
                  : "border-[#EDE6D6] bg-white text-slate-600 hover:border-[#D4AF37]/40"
              }`}
            >
              <Icon className="w-4 h-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {props.mode === "description" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6 space-y-3">
            <h3 className="text-base font-bold text-[#002845] mb-3">معطيات العقار</h3>
            <FormSelect label="نوع العقار" value={props.propertyType} onChange={props.setPropertyType} options={PROPERTY_TYPES} />
            <div className="grid grid-cols-2 gap-3">
              <FormInput label="غرف النوم" value={props.bedrooms} onChange={props.setBedrooms} type="number" />
              <FormInput label="الحمامات" value={props.bathrooms} onChange={props.setBathrooms} type="number" />
            </div>
            <FormInput label="المساحة (م²)" value={props.area} onChange={props.setArea} type="number" />
            <FormInput label="الموقع" value={props.location} onChange={props.setLocation} placeholder="مثل: الرياض، حي النرجس" />
            <FormInput label="المميزات" value={props.features} onChange={props.setFeatures} placeholder="مسبح، حديقة، مصعد..." />
            <button
              onClick={props.generateDescription}
              disabled={props.descriptionLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#D4AF37] text-white hover:bg-[#B8932E] active:scale-95 transition disabled:opacity-50"
            >
              {props.descriptionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              توليد الوصف
            </button>
          </div>

          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#002845]">الوصف المُولّد</h3>
              {props.generatedDescription && (
                <button
                  onClick={() => props.copyText("desc-current", props.generatedDescription)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#9A7D28] hover:underline"
                >
                  {props.copiedKey === "desc-current" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  نسخ
                </button>
              )}
            </div>
            <div className="rounded-2xl bg-[#FAF8F4] border border-[#EDE6D6] p-4 min-h-[180px] text-sm text-[#002845] leading-relaxed whitespace-pre-wrap">
              {props.generatedDescription || (
                <span className="text-slate-400">ستظهر النتيجة هنا...</span>
              )}
            </div>

            {props.history.length > 0 && (
              <div className="mt-5">
                <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  آخر {props.history.length} وصف مولّد (مخزّن محلياً)
                </h4>
                <ul className="space-y-2 max-h-[200px] overflow-y-auto">
                  {props.history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-xl border border-[#EDE6D6] bg-white p-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-[#002845] truncate">
                          {h.prompt.propertyType || "—"} · {h.prompt.location || "—"}
                        </span>
                        <button
                          onClick={() => props.copyText(`hist-${h.id}`, h.description)}
                          className="shrink-0 text-[#9A7D28] hover:underline"
                        >
                          {props.copiedKey === `hist-${h.id}` ? "✓" : "نسخ"}
                        </button>
                      </div>
                      <p className="text-slate-600 line-clamp-3">{h.description}</p>
                      <p className="text-[10px] text-slate-400 mt-1.5">{timeAgo(h.at)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6 space-y-3">
            <h3 className="text-base font-bold text-[#002845] mb-3">تفاصيل الشكوى</h3>
            <FormInput label="اسم العميل" value={props.customerName} onChange={props.setCustomerName} />
            <FormTextarea label="نص الشكوى" value={props.complaint} onChange={props.setComplaint} rows={6} />
            <button
              onClick={props.draftResponse}
              disabled={props.responseLoading || !props.complaint.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#D4AF37] text-white hover:bg-[#B8932E] active:scale-95 transition disabled:opacity-50"
            >
              {props.responseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              صياغة الرد
            </button>
          </div>
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#002845]">الرد المقترح</h3>
              {props.draftedResponse && (
                <button
                  onClick={() => props.copyText("resp", props.draftedResponse)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#9A7D28] hover:underline"
                >
                  {props.copiedKey === "resp" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  نسخ
                </button>
              )}
            </div>
            <div className="rounded-2xl bg-[#FAF8F4] border border-[#EDE6D6] p-4 min-h-[280px] text-sm text-[#002845] leading-relaxed whitespace-pre-wrap">
              {props.draftedResponse || (
                <span className="text-slate-400">ستظهر صياغة الرد هنا...</span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LogsTab({
  logs,
  loading,
  source,
  setSource,
  escalated,
  setEscalated,
  query,
  setQuery,
  refresh,
}: {
  logs: ChatLog[];
  loading: boolean;
  source: "" | "customer" | "admin";
  setSource: (s: "" | "customer" | "admin") => void;
  escalated: boolean;
  setEscalated: (b: boolean) => void;
  query: string;
  setQuery: (s: string) => void;
  refresh: () => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <section className="space-y-5">
      {/* Filters */}
      <div className="rounded-2xl border border-[#EDE6D6] bg-white p-3 md:p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">المصدر:</span>
        <div className="flex gap-1.5">
          {[
            { key: "" as const, label: "الكل" },
            { key: "customer" as const, label: "العملاء" },
            { key: "admin" as const, label: "الإدارة" },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setSource(o.key)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                source === o.key
                  ? "border-[#D4AF37] bg-[#FFFCEE] text-[#9A7D28] font-bold"
                  : "border-slate-200 bg-white text-slate-500 hover:border-[#D4AF37]/40"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-[#002845] cursor-pointer">
          <input
            type="checkbox"
            checked={escalated}
            onChange={(e) => setEscalated(e.target.checked)}
            className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]/30"
          />
          المُصعّدة فقط
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && refresh()}
          placeholder="بحث في النص..."
          className="flex-1 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-[#002845] placeholder:text-slate-400 focus:outline-none focus:border-[#D4AF37]/50"
        />
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D4AF37]/40 text-[#9A7D28] bg-white hover:bg-[#FFFCEE] transition text-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#EDE6D6] bg-white p-16 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">لا توجد محادثات مطابقة</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => {
            const isOpen = openId === log.id;
            return (
              <li key={log.id}>
                <div
                  className={`rounded-2xl border transition overflow-hidden ${
                    log.escalated
                      ? "border-rose-200 bg-rose-50/40"
                      : "border-[#EDE6D6] bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : log.id)}
                    className="w-full flex items-start gap-3 p-4 text-right"
                  >
                    <span
                      className={`shrink-0 mt-1.5 w-2 h-2 rounded-full ${
                        log.escalated ? "bg-rose-500" : log.source === "admin" ? "bg-[#D4AF37]" : "bg-emerald-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] mb-1">
                        <span className="px-2 py-0.5 rounded-full bg-[#FAF8F4] border border-[#EDE6D6] text-slate-500">
                          {log.source === "admin" ? "إدارة" : "عميل"}
                        </span>
                        {log.escalated && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-200 text-rose-700 font-bold">
                            مُصعّدة
                          </span>
                        )}
                        {log.model && (
                          <span className="text-slate-400 tabular-nums">{log.model}</span>
                        )}
                        {log.sentiment && SENTIMENT_META[log.sentiment] && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 ${SENTIMENT_META[log.sentiment].color}`}
                            title={log.sentiment_score ? `score: ${log.sentiment_score}` : ''}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${SENTIMENT_META[log.sentiment].bg}`} />
                            {SENTIMENT_META[log.sentiment].label}
                          </span>
                        )}
                        <span className="text-slate-400 mr-auto">{timeAgo(log.created_at)}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#002845] truncate">
                        {log.user_message || "—"}
                      </p>
                    </div>
                    <ChevronDown
                      className={`shrink-0 w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#EDE6D6] p-4 space-y-3 bg-white">
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">رسالة العميل</p>
                        <p className="text-sm text-[#002845] whitespace-pre-wrap">
                          {log.user_message || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">رد البوت</p>
                        <p className="text-sm text-[#002845] whitespace-pre-wrap">
                          {log.ai_response || "—"}
                        </p>
                      </div>
                      {log.escalated && (
                        <div>
                          <p className="text-[11px] font-bold text-rose-700 mb-1">سبب التصعيد</p>
                          <p className="text-sm text-rose-700">{log.escalate_reason || "—"}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 pt-2 border-t border-[#F1ECE0] tabular-nums">
                        <span>tokens: {log.prompt_tokens + log.completion_tokens}</span>
                        <span>cost: ${Number(log.cost_usd).toFixed(4)}</span>
                        {log.session_id && (
                          <span className="truncate">session: {log.session_id}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SettingsTab({
  draft,
  setDraft,
  original,
  save,
  saving,
}: {
  draft: AiSettings;
  setDraft: (d: AiSettings) => void;
  original: AiSettings | null;
  save: () => void;
  saving: boolean;
}) {
  const dirty = useMemo(() => {
    if (!original) return true;
    return (
      original.ai_support_enabled !== draft.ai_support_enabled ||
      original.ai_system_prompt !== draft.ai_system_prompt ||
      original.ai_model !== draft.ai_model ||
      original.ai_temperature !== draft.ai_temperature ||
      original.ai_max_tokens !== draft.ai_max_tokens ||
      original.ai_banned_topics !== draft.ai_banned_topics ||
      original.ai_working_hours_start !== draft.ai_working_hours_start ||
      original.ai_working_hours_end !== draft.ai_working_hours_end ||
      original.ai_per_user_daily_limit !== draft.ai_per_user_daily_limit ||
      original.ai_sentiment_enabled !== draft.ai_sentiment_enabled ||
      original.ai_ab_testing_enabled !== draft.ai_ab_testing_enabled ||
      original.ai_auto_escalate_negative !== draft.ai_auto_escalate_negative
    );
  }, [draft, original]);

  const allowedModels = original?._meta?.allowed_models || ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
  const pricing = original?._meta?.pricing_per_1k_tokens || {};

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
        <h3 className="text-base font-bold text-[#002845] mb-4 flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#D4AF37]" />
          شخصية المساعد
        </h3>
        <FormTextarea
          label="نص النظام (System Prompt)"
          value={draft.ai_system_prompt}
          onChange={(v) => setDraft({ ...draft, ai_system_prompt: v })}
          rows={8}
          hint="هذا النص يحدد شخصية البوت، نبرته، والمهام المسموحة. يُرسل في بداية كل محادثة."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6 space-y-4">
          <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-[#D4AF37]" />
            النموذج والخصائص
          </h3>

          <FormSelect
            label="النموذج"
            value={draft.ai_model}
            onChange={(v) => setDraft({ ...draft, ai_model: v })}
            options={allowedModels}
            hint={
              pricing[draft.ai_model]
                ? `سعر تقديري لكل ١٠٠٠ token: input $${pricing[draft.ai_model].input} · output $${pricing[draft.ai_model].output}`
                : undefined
            }
          />

          <div>
            <label className="block text-sm font-bold text-[#002845] mb-2">
              Temperature: <span className="text-[#9A7D28] tabular-nums">{draft.ai_temperature}</span>
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={draft.ai_temperature}
              onChange={(e) => setDraft({ ...draft, ai_temperature: e.target.value })}
              className="w-full accent-[#D4AF37]"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              0 = إجابات دقيقة وثابتة · 2 = إبداع عالٍ
            </p>
          </div>

          <FormInput
            label="أقصى عدد tokens للرد"
            value={draft.ai_max_tokens}
            onChange={(v) => setDraft({ ...draft, ai_max_tokens: v })}
            type="number"
            hint="بين 50 و 4000. الرد الأطول = كلفة أعلى."
          />
        </div>

        <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6 space-y-4">
          <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            القيود والحماية
          </h3>

          <FormTextarea
            label="مواضيع محظورة"
            value={draft.ai_banned_topics}
            onChange={(v) => setDraft({ ...draft, ai_banned_topics: v })}
            rows={3}
            placeholder="سياسة، دين، رياضة..."
            hint="كلمات/مواضيع مفصولة بفواصل أو أسطر. لو ذُكرت يرفض البوت الردّ."
          />

          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="بداية العمل"
              value={draft.ai_working_hours_start}
              onChange={(v) => setDraft({ ...draft, ai_working_hours_start: v })}
              placeholder="08:00"
              hint="HH:MM (24h)"
            />
            <FormInput
              label="نهاية العمل"
              value={draft.ai_working_hours_end}
              onChange={(v) => setDraft({ ...draft, ai_working_hours_end: v })}
              placeholder="22:00"
              hint="فارغ = ٢٤/٧"
            />
          </div>

          <FormInput
            label="حد يومي لكل عميل"
            value={draft.ai_per_user_daily_limit}
            onChange={(v) => setDraft({ ...draft, ai_per_user_daily_limit: v })}
            type="number"
            hint="عدد الرسائل المسموح بها لكل عميل/يوم. 0 = بلا حد."
          />
        </div>
      </div>

      {/* Phase 3 toggles */}
      <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6 space-y-4">
        <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#D4AF37]" />
          الذكاء المتقدّم
        </h3>
        <ToggleRow
          label="تحليل مشاعر العملاء"
          hint="يُصنّف كل رسالة عميل (سلبي/محايد/إيجابي) لرصد المزاج العام. تكلفة إضافية بسيطة."
          value={draft.ai_sentiment_enabled === "true"}
          onChange={(v) => setDraft({ ...draft, ai_sentiment_enabled: v ? "true" : "false" })}
        />
        <ToggleRow
          label="تصعيد تلقائي للسلبي جداً"
          hint="عند مزاج سلبي جداً → تصعيد فوري للدعم البشري بدون انتظار طلب العميل."
          value={draft.ai_auto_escalate_negative === "true"}
          onChange={(v) => setDraft({ ...draft, ai_auto_escalate_negative: v ? "true" : "false" })}
          disabled={draft.ai_sentiment_enabled !== "true"}
          disabledHint="فعّل تحليل المشاعر أولاً"
        />
        <ToggleRow
          label="تفعيل A/B testing لنسخ system prompt"
          hint="عند تفعيله، يختار البوت عشوائياً (حسب الأوزان) من النسخ النشطة في تبويب A/B."
          value={draft.ai_ab_testing_enabled === "true"}
          onChange={(v) => setDraft({ ...draft, ai_ab_testing_enabled: v ? "true" : "false" })}
        />
      </div>

      <div className="sticky bottom-4 z-10 rounded-2xl border border-[#EDE6D6] bg-white shadow-lg p-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {dirty ? "هناك تغييرات غير محفوظة" : "لا تغييرات"}
        </p>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D4AF37] text-white font-bold hover:bg-[#B8932E] active:scale-95 transition disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ الإعدادات
        </button>
      </div>
    </section>
  );
}

// ─── Small form primitives ────────────────────────────────────────────────
function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  disabledHint,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[#002845]">{label}</p>
        {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
        {disabled && disabledHint && (
          <p className="text-[11px] text-amber-700 mt-1">⚠ {disabledHint}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition ${
          value ? "bg-[#D4AF37]" : "bg-slate-300"
        } ${disabled ? "cursor-not-allowed" : ""}`}
        aria-pressed={value}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            value ? "translate-x-1" : "translate-x-5"
          }`}
        />
      </button>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-[#002845] mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#EDE6D6] bg-[#FAF8F4] px-3 py-2 text-sm text-[#002845] placeholder:text-slate-400 focus:outline-none focus:border-[#D4AF37]/50"
      />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function FormTextarea({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-[#002845] mb-2">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-lg border border-[#EDE6D6] bg-[#FAF8F4] px-3 py-2 text-sm text-[#002845] placeholder:text-slate-400 focus:outline-none focus:border-[#D4AF37]/50"
      />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Sentiment widget ─────────────────────────────────────────────────────
function SentimentWidget({ data }: { data: SentimentSummary }) {
  const keys: (keyof SentimentSummary)[] = [
    "very_negative",
    "negative",
    "neutral",
    "positive",
    "very_positive",
  ];
  const total = keys.reduce((s, k) => s + (Number(data[k]) || 0), 0) || 1;
  return (
    <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          تحليلاً لـ {data.scored} رسالة من أصل {data.total}
        </p>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden mb-5">
        {keys.map((k) => {
          const n = Number(data[k]) || 0;
          const pct = (n / total) * 100;
          if (n === 0) return null;
          return (
            <div
              key={k}
              className={`${SENTIMENT_META[k].bg}`}
              style={{ width: `${pct}%` }}
              title={`${SENTIMENT_META[k].label}: ${n}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {keys.map((k) => {
          const n = Number(data[k]) || 0;
          const pct = ((n / total) * 100).toFixed(0);
          const meta = SENTIMENT_META[k];
          return (
            <div key={k} className="rounded-2xl border border-[#EDE6D6] bg-[#FAF8F4] p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${meta.bg}`} />
                <p className={`text-xs font-semibold ${meta.color}`}>{meta.label}</p>
              </div>
              <p className="text-xl font-black text-[#002845] tabular-nums">{n}</p>
              <p className="text-[10px] text-slate-400">{pct}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── A/B testing tab ──────────────────────────────────────────────────────
function ABTab({
  variants,
  onSave,
  onDelete,
  abEnabled,
}: {
  variants: PromptVariant[];
  onSave: (p: Partial<PromptVariant> & { id?: number }) => void;
  onDelete: (id: number) => void;
  abEnabled: boolean;
}) {
  const [draft, setDraft] = useState<{ label: string; prompt_text: string; weight: string }>({
    label: "",
    prompt_text: "",
    weight: "1",
  });

  return (
    <section className="space-y-5">
      {!abEnabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠ تجارب A/B معطّلة حالياً. لتفعيل اختيار النسخ تلقائياً مع العملاء، فعّل
          <strong className="mx-1">"تفعيل A/B testing"</strong>
          من تبويب الإعدادات المتقدّمة.
        </div>
      )}

      <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
        <h3 className="text-base font-bold text-[#002845] mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
          إضافة نسخة جديدة من system prompt
        </h3>
        <div className="space-y-3">
          <FormInput
            label="اسم تعريفي"
            value={draft.label}
            onChange={(v) => setDraft({ ...draft, label: v })}
            placeholder="مثال: نسخة ودودة / نسخة رسمية"
          />
          <FormTextarea
            label="نص النظام"
            value={draft.prompt_text}
            onChange={(v) => setDraft({ ...draft, prompt_text: v })}
            rows={6}
            placeholder="أنت مساعد ذكي لبيت الجزيرة..."
          />
          <FormInput
            label="الوزن"
            value={draft.weight}
            onChange={(v) => setDraft({ ...draft, weight: v })}
            type="number"
            hint="كلما زاد الوزن، تكرّر استخدام هذه النسخة. مثلاً 1 و 3 يعني 25% / 75%."
          />
          <button
            disabled={!draft.label || !draft.prompt_text}
            onClick={() => {
              onSave({
                label: draft.label,
                prompt_text: draft.prompt_text,
                weight: parseInt(draft.weight, 10) || 1,
                is_active: true,
              });
              setDraft({ label: "", prompt_text: "", weight: "1" });
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D4AF37] text-white font-bold hover:bg-[#B8932E] active:scale-95 transition disabled:opacity-40"
          >
            <Save className="w-4 h-4" />
            إضافة نسخة
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
        <h3 className="text-base font-bold text-[#002845] mb-4">
          النسخ النشطة ({variants.length})
        </h3>
        {variants.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            لا نسخ محفوظة. أضف النسخة الأولى أعلاه لبدء التجربة.
          </p>
        ) : (
          <ul className="space-y-3">
            {variants.map((v) => {
              const chats = v.chats || 0;
              const escalRate = chats > 0 ? ((v.escalations || 0) / chats) * 100 : 0;
              const posRate = chats > 0 ? ((v.positive || 0) / chats) * 100 : 0;
              const negRate = chats > 0 ? ((v.negative || 0) / chats) * 100 : 0;
              return (
                <li
                  key={v.id}
                  className={`rounded-2xl border p-4 ${v.is_active ? "border-[#EDE6D6] bg-white" : "border-slate-200 bg-slate-50/60 opacity-70"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#002845]">{v.label}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-3 whitespace-pre-wrap">
                        {v.prompt_text}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={v.weight}
                        onChange={(e) =>
                          onSave({ id: v.id, weight: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-16 rounded-lg border border-[#EDE6D6] bg-white px-2 py-1 text-sm text-[#002845] focus:outline-none focus:border-[#D4AF37]/50"
                        title="الوزن"
                      />
                      <button
                        onClick={() => onSave({ id: v.id, is_active: !v.is_active })}
                        className={`text-xs px-3 py-1 rounded-full border transition ${
                          v.is_active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-300 bg-slate-100 text-slate-500"
                        }`}
                      >
                        {v.is_active ? "نشطة" : "معطّلة"}
                      </button>
                      <button
                        onClick={() => onDelete(v.id)}
                        className="text-xs px-3 py-1 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs mt-3 pt-3 border-t border-[#F1ECE0]">
                    <Metric label="محادثات" value={chats} />
                    <Metric label="تصعيد" value={`${escalRate.toFixed(0)}%`} tone={escalRate > 20 ? "bad" : "neutral"} />
                    <Metric label="إيجابي" value={`${posRate.toFixed(0)}%`} tone={posRate > 50 ? "good" : "neutral"} />
                    <Metric label="سلبي" value={`${negRate.toFixed(0)}%`} tone={negRate > 30 ? "bad" : "neutral"} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "good" | "bad" }) {
  const color =
    tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-[#002845]";
  return (
    <div>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-[#002845] mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#EDE6D6] bg-[#FAF8F4] px-3 py-2 text-sm text-[#002845] focus:outline-none focus:border-[#D4AF37]/50"
      >
        <option value="">— اختر —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
