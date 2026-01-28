"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useState, useRef, useEffect } from "react";
import { BrainCircuit, Sparkles, MessageSquare, Wand2, BarChart3, Send, Loader2, Bot, User, Settings, FileText, Users, Building, ChevronDown, Copy, Check, RefreshCw } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AICenterPage() {
  const [activeTab, setActiveTab] = useState<"chat" | "description" | "response" | "settings">("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiSupportEnabled, setAiSupportEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [propertyType, setPropertyType] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [area, setArea] = useState("");
  const [location, setLocation] = useState("");
  const [features, setFeatures] = useState("");
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [complaint, setComplaint] = useState("");
  const [draftedResponse, setDraftedResponse] = useState("");
  const [responseLoading, setResponseLoading] = useState(false);
  const [responseCopied, setResponseCopied] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/support-settings", { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAiSupportEnabled(data.ai_support_enabled === "true");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const toggleAiSupport = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/support-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ai_support_enabled: !aiSupportEnabled }),
      });
      if (res.ok) {
        setAiSupportEnabled(!aiSupportEnabled);
      }
    } catch (error) {
      console.error("Error updating settings:", error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: prompt };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setPrompt("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى." }]);
      }
    } catch (error) {
      setMessages([...newMessages, { role: "assistant", content: "عذراً، لا يمكن الاتصال بالخادم." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateDescription = async () => {
    if (descriptionLoading) return;
    setDescriptionLoading(true);
    setGeneratedDescription("");

    try {
      const response = await fetch(`${API_URL}/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propertyType,
          bedrooms,
          bathrooms,
          area,
          location,
          features,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setGeneratedDescription(data.description);
      } else {
        setGeneratedDescription("عذراً، حدث خطأ في توليد الوصف.");
      }
    } catch (error) {
      setGeneratedDescription("عذراً، لا يمكن الاتصال بالخادم.");
    } finally {
      setDescriptionLoading(false);
    }
  };

  const copyDescription = () => {
    navigator.clipboard.writeText(generatedDescription);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const draftResponse = async () => {
    if (responseLoading || !complaint.trim()) return;
    setResponseLoading(true);
    setDraftedResponse("");

    try {
      const response = await fetch(`${API_URL}/api/ai/draft-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerName,
          complaint,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setDraftedResponse(data.response);
      } else {
        setDraftedResponse("عذراً، حدث خطأ في صياغة الرد.");
      }
    } catch (error) {
      setDraftedResponse("عذراً، لا يمكن الاتصال بالخادم.");
    } finally {
      setResponseLoading(false);
    }
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(draftedResponse);
    setResponseCopied(true);
    setTimeout(() => setResponseCopied(false), 2000);
  };

  const quickPrompts = [
    "كيف أحسّن مبيعات العقارات؟",
    "ما هي أفضل استراتيجيات التسويق؟",
    "حلل أداء المنصة هذا الشهر",
    "اقترح أفكار لجذب عملاء جدد",
  ];

  const propertyTypes = [
    "شقة",
    "فيلا",
    "أرض",
    "عمارة",
    "دور",
    "استراحة",
    "مكتب",
    "محل تجاري",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">مركز الذكاء الاصطناعي</h1>
          <p className="text-sm text-slate-500 mt-1">أدوات ذكية لتحسين تجربة المنصة</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-l from-green-500 to-emerald-600 text-white rounded-full text-xs font-medium">
          <Sparkles className="w-3 h-3" />
          مُفعّل
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveTab("chat")}
          className={`bg-white rounded-2xl p-4 border shadow-sm hover:shadow-md transition cursor-pointer relative overflow-hidden text-right ${
            activeTab === "chat" ? "border-blue-400 ring-2 ring-blue-100" : "border-blue-200"
          }`}
        >
          <div className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
            <MessageSquare className="w-5 h-5 text-blue-600" />
          </div>
          <h3 className="font-semibold text-[#002845] text-sm">مساعد الدردشة</h3>
          <p className="text-xs text-slate-500 mt-1">تحدث مع الذكاء الاصطناعي</p>
        </button>

        <button
          onClick={() => setActiveTab("description")}
          className={`bg-white rounded-2xl p-4 border shadow-sm hover:shadow-md transition cursor-pointer relative overflow-hidden text-right ${
            activeTab === "description" ? "border-green-400 ring-2 ring-green-100" : "border-green-200"
          }`}
        >
          <div className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-3">
            <Wand2 className="w-5 h-5 text-green-600" />
          </div>
          <h3 className="font-semibold text-[#002845] text-sm">توليد الأوصاف</h3>
          <p className="text-xs text-slate-500 mt-1">أوصاف جذابة للعقارات</p>
        </button>

        <button
          onClick={() => setActiveTab("response")}
          className={`bg-white rounded-2xl p-4 border shadow-sm hover:shadow-md transition cursor-pointer relative overflow-hidden text-right ${
            activeTab === "response" ? "border-purple-400 ring-2 ring-purple-100" : "border-purple-200"
          }`}
        >
          <div className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <h3 className="font-semibold text-[#002845] text-sm">صياغة الردود</h3>
          <p className="text-xs text-slate-500 mt-1">ردود احترافية للعملاء</p>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`bg-white rounded-2xl p-4 border shadow-sm hover:shadow-md transition cursor-pointer relative overflow-hidden text-right ${
            activeTab === "settings" ? "border-amber-400 ring-2 ring-amber-100" : "border-amber-200"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
            <Settings className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="font-semibold text-[#002845] text-sm">الإعدادات</h3>
          <p className="text-xs text-slate-500 mt-1">إدارة الدعم الآلي</p>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6">
          {activeTab === "chat" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-[#D4AF37]" />
                <h2 className="font-bold text-[#002845]">المساعد الذكي</h2>
                <span className="text-xs text-slate-500">- اسأل أي سؤال حول إدارة المنصة</span>
              </div>

              <div className="h-80 bg-gradient-to-b from-slate-50 to-white rounded-xl p-4 overflow-y-auto border border-slate-100">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center mb-4 shadow-lg">
                      <Bot className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-[#002845] font-semibold text-lg">مرحباً! أنا مساعدك الذكي</p>
                    <p className="text-slate-500 text-sm mt-2 max-w-md">
                      اسألني عن أي شيء يتعلق بإدارة المنصة، التسويق، خدمة العملاء، أو تحليل الأداء
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {quickPrompts.map((qp, idx) => (
                        <button
                          key={idx}
                          onClick={() => setPrompt(qp)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-[#D4AF37] hover:text-[#002845] transition"
                        >
                          {qp}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                      >
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          msg.role === "user" 
                            ? "bg-[#002845]" 
                            : "bg-gradient-to-br from-[#D4AF37] to-[#B8860B]"
                        }`}>
                          {msg.role === "user" ? (
                            <User className="w-4 h-4 text-white" />
                          ) : (
                            <Bot className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <div
                          className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                            msg.role === "user"
                              ? "bg-[#002845] text-white rounded-tr-none"
                              : "bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm"
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2 text-slate-500 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            جاري التفكير...
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="اكتب رسالتك هنا..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !prompt.trim()}
                  className="px-5 py-3 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] rounded-xl hover:opacity-90 transition font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                  إرسال
                </button>
              </div>
            </div>
          )}

          {activeTab === "description" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Wand2 className="w-5 h-5 text-green-600" />
                <h2 className="font-bold text-[#002845]">توليد وصف عقاري</h2>
                <span className="text-xs text-slate-500">- أدخل تفاصيل العقار للحصول على وصف جذاب</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">نوع العقار</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">اختر نوع العقار</option>
                    {propertyTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">الموقع</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="مثال: الرياض، حي النرجس"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">عدد الغرف</label>
                  <input
                    type="number"
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    placeholder="عدد غرف النوم"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">عدد الحمامات</label>
                  <input
                    type="number"
                    value={bathrooms}
                    onChange={(e) => setBathrooms(e.target.value)}
                    placeholder="عدد الحمامات"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">المساحة (م²)</label>
                  <input
                    type="number"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="المساحة بالمتر المربع"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">المميزات</label>
                  <input
                    type="text"
                    value={features}
                    onChange={(e) => setFeatures(e.target.value)}
                    placeholder="مثال: مسبح، حديقة، مصعد"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
              </div>

              <button
                onClick={generateDescription}
                disabled={descriptionLoading}
                className="w-full py-3 bg-gradient-to-l from-green-500 to-emerald-600 text-white rounded-xl hover:opacity-90 transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {descriptionLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    جاري التوليد...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    توليد الوصف
                  </>
                )}
              </button>

              {generatedDescription && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-green-800">الوصف المُولَّد:</span>
                    <button
                      onClick={copyDescription}
                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 transition"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          تم النسخ
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          نسخ
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{generatedDescription}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "response" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-purple-600" />
                <h2 className="font-bold text-[#002845]">صياغة رد احترافي</h2>
                <span className="text-xs text-slate-500">- أدخل شكوى العميل للحصول على رد مناسب</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">اسم العميل (اختياري)</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="اسم العميل"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#002845] mb-2">الشكوى أو الاستفسار</label>
                  <textarea
                    value={complaint}
                    onChange={(e) => setComplaint(e.target.value)}
                    placeholder="اكتب نص شكوى العميل أو استفساره هنا..."
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                  />
                </div>
              </div>

              <button
                onClick={draftResponse}
                disabled={responseLoading || !complaint.trim()}
                className="w-full py-3 bg-gradient-to-l from-purple-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {responseLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    جاري الصياغة...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    صياغة الرد
                  </>
                )}
              </button>

              {draftedResponse && (
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-purple-800">الرد المُقترح:</span>
                    <button
                      onClick={copyResponse}
                      className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition"
                    >
                      {responseCopied ? (
                        <>
                          <Check className="w-4 h-4" />
                          تم النسخ
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          نسخ
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{draftedResponse}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-[#002845]">إعدادات الذكاء الاصطناعي</h2>
              </div>

              <div className="bg-gradient-to-l from-slate-50 to-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#002845]">الدعم الآلي للعملاء</h3>
                      <p className="text-sm text-slate-500 mt-0.5">
                        تفعيل الرد التلقائي على استفسارات العملاء عبر المساعد الذكي
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={toggleAiSupport}
                    disabled={settingsLoading}
                    className={`relative w-14 h-8 rounded-full transition-colors ${
                      aiSupportEnabled ? "bg-green-500" : "bg-slate-300"
                    } ${settingsLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${
                      aiSupportEnabled ? "left-1" : "right-1"
                    }`}>
                      {settingsLoading && (
                        <Loader2 className="w-4 h-4 m-1 animate-spin text-slate-400" />
                      )}
                    </div>
                  </button>
                </div>
                
                <div className={`mt-4 p-4 rounded-lg ${aiSupportEnabled ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                  <div className="flex items-center gap-2">
                    {aiSupportEnabled ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-sm font-medium text-green-700">الدعم الآلي مُفعّل</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-amber-500 rounded-full" />
                        <span className="text-sm font-medium text-amber-700">الدعم الآلي مُعطّل - سيتم تحويل جميع الاستفسارات للدعم البشري</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h4 className="font-bold text-[#002845] mb-4">كيف يعمل الدعم الآلي؟</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">1</div>
                    <div>
                      <p className="text-sm font-medium text-[#002845]">استقبال الاستفسار</p>
                      <p className="text-xs text-slate-500">يتلقى المساعد الذكي سؤال العميل من خلال زر الدردشة</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs font-bold">2</div>
                    <div>
                      <p className="text-sm font-medium text-[#002845]">الرد التلقائي</p>
                      <p className="text-xs text-slate-500">يجيب على الأسئلة الشائعة فوراً بشكل ذكي</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold">3</div>
                    <div>
                      <p className="text-sm font-medium text-[#002845]">التصعيد الذكي</p>
                      <p className="text-xs text-slate-500">الأسئلة المعقدة تُحوّل تلقائياً لفريق الدعم كتذكرة دعم</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
