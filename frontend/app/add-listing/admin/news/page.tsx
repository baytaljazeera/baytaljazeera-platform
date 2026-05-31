"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { 
  Newspaper, Plus, Edit, Trash2, Eye, EyeOff, Calendar, RefreshCw, Save, X, 
  Sparkles, Megaphone, AlertCircle, Palette, Link2, Clock, ArrowUp, ArrowDown,
  Gauge, ChevronRight, Globe, MapPin, Wand2, Loader2, CheckCircle2
} from "lucide-react";

interface NewsItem {
  id: number;
  title: string;
  content: string;
  type: string;
  active: boolean;
  priority: number;
  speed: number;
  background_color: string | null;
  text_color: string | null;
  icon: string | null;
  cta_label: string | null;
  cta_url: string | null;
  start_at: string | null;
  end_at: string | null;
  target_countries: string[] | null;
  target_cities: string[] | null;
  is_global: boolean;
  ai_generated: boolean;
  created_at: string;
}

interface Country {
  code: string;
  name_ar: string;
  name_en: string;
}

interface City {
  name_ar: string;
  name_en: string;
  country_code: string;
}

const newsTypes = [
  { value: "general", label: "عام", icon: Newspaper, color: "#6b7280" },
  { value: "promo", label: "عروض", icon: Sparkles, color: "#D4AF37" },
  { value: "announcement", label: "إعلان", icon: Megaphone, color: "#3b82f6" },
  { value: "alert", label: "تنبيه", icon: AlertCircle, color: "#ef4444" },
];

const toneOptions = [
  { value: "professional", label: "احترافي" },
  { value: "friendly", label: "ودود" },
  { value: "urgent", label: "عاجل" },
  { value: "exciting", label: "حماسي" },
];

const occasionTemplates = [
  { 
    id: "ramadan", 
    label: "رمضان", 
    emoji: "🌙",
    topic: "عروض رمضان الحصرية على العقارات الفاخرة - خصومات مميزة لشهر الخير",
    tone: "friendly",
    type: "promo",
    include_cta: true
  },
  { 
    id: "eid_fitr", 
    label: "عيد الفطر", 
    emoji: "🎉",
    topic: "تهنئة بعيد الفطر المبارك مع عروض خاصة على أفضل العقارات",
    tone: "exciting",
    type: "promo",
    include_cta: true
  },
  { 
    id: "eid_adha", 
    label: "عيد الأضحى", 
    emoji: "🐑",
    topic: "عيد أضحى مبارك - احتفل معنا بأفضل العروض العقارية",
    tone: "exciting",
    type: "promo",
    include_cta: true
  },
  { 
    id: "hijri_new_year", 
    label: "السنة الهجرية", 
    emoji: "📅",
    topic: "كل عام وأنتم بخير بمناسبة السنة الهجرية الجديدة - ابدأ سنتك بعقار أحلامك",
    tone: "friendly",
    type: "announcement",
    include_cta: true
  },
];

const iconOptions = [
  { value: "newspaper", label: "صحيفة" },
  { value: "star", label: "نجمة" },
  { value: "megaphone", label: "مكبر صوت" },
  { value: "alert", label: "تنبيه" },
  { value: "gift", label: "هدية" },
  { value: "tag", label: "عرض" },
  { value: "fire", label: "نار" },
  { value: "sparkles", label: "لمعان" },
];

const defaultFormData = {
  title: "",
  content: "",
  type: "general",
  priority: 0,
  speed: 25,
  background_color: "",
  text_color: "",
  icon: "",
  cta_label: "",
  cta_url: "",
  start_at: "",
  end_at: "",
  target_countries: [] as string[],
  target_cities: [] as string[],
  is_global: true,
  ai_generated: false,
};

const defaultAIFormData = {
  news_type: "general",
  topic: "",
  country: "",
  city: "",
  tone: "professional",
  include_cta: false,
  custom_instructions: "",
};

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [formData, setFormData] = useState(defaultFormData);
  const [aiFormData, setAIFormData] = useState(defaultAIFormData);
  const [showPreview, setShowPreview] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCountryForCities, setSelectedCountryForCities] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all"); // Filter: all, promo, general, announcement, alert

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/news`);
      if (res.ok) {
        const data = await res.json();
        setNews(data.news || []);
      }
    } catch (error) {
      console.error("Error fetching news:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCountries = async () => {
    try {
      const res = await fetch(`${API_URL}/api/news/countries`);
      if (res.ok) {
        const data = await res.json();
        setCountries(data.countries || []);
      }
    } catch (error) {
      console.error("Error fetching countries:", error);
    }
  };

  const fetchCities = async (countryCode: string) => {
    if (!countryCode) {
      setCities([]);
      return;
    }
    try {
      const res = await fetch(`/api/news/cities?country=${countryCode}`);
      if (res.ok) {
        const data = await res.json();
        setCities(data.cities || []);
      }
    } catch (error) {
      console.error("Error fetching cities:", error);
    }
  };

  useEffect(() => {
    fetchNews();
    fetchCountries();
  }, []);

  useEffect(() => {
    if (selectedCountryForCities) {
      fetchCities(selectedCountryForCities);
    }
  }, [selectedCountryForCities]);

  const toggleActive = async (id: number, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/news/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        fetchNews();
      }
    } catch (error) {
      console.error("Error toggling news:", error);
    }
  };

  const deleteNews = async (id: number) => {
    const ok = await confirmDialog({
      title: "حذف الخبر",
      body: "سيتم حذف هذا الخبر من شريط الأخبار. الزوار لن يروه بعد الحذف.",
      confirmText: "احذف الخبر",
      variant: "danger",
    });
    if (!ok) return;
    
    try {
      const res = await fetch(`/api/news/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchNews();
      }
    } catch (error) {
      console.error("Error deleting news:", error);
    }
  };

  const updatePriority = async (id: number, newPriority: number) => {
    try {
      const res = await fetch(`/api/news/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (res.ok) {
        fetchNews();
      }
    } catch (error) {
      console.error("Error updating priority:", error);
    }
  };

  const generateAINews = async () => {
    if (!aiFormData.topic) return;
    
    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/api/news/generate-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiFormData),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.generated) {
          setFormData({
            ...defaultFormData,
            title: data.generated.title,
            content: data.generated.content,
            type: data.generated.type,
            cta_label: data.generated.cta_label || "",
            icon: data.generated.suggested_icon || "",
            target_countries: aiFormData.country ? [aiFormData.country] : [],
            target_cities: aiFormData.city ? [aiFormData.city] : [],
            is_global: !aiFormData.country,
            ai_generated: true,
          });
          setShowAIGenerator(false);
          setShowForm(true);
        }
      }
    } catch (error) {
      console.error("Error generating AI news:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title) {
      setError("العنوان مطلوب");
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const url = editingId ? `/api/news/${editingId}` : "/api/news";
      const method = editingId ? "PATCH" : "POST";
      
      const payload = {
        ...formData,
        active: formData.active !== undefined ? formData.active : true, // Ensure active is included
        background_color: formData.background_color || null,
        text_color: formData.text_color || null,
        icon: formData.icon || null,
        cta_label: formData.cta_label || null,
        cta_url: formData.cta_url || null,
        start_at: formData.start_at || null,
        end_at: formData.end_at || null,
        target_countries: formData.target_countries.length > 0 ? formData.target_countries : null,
        target_cities: formData.target_cities.length > 0 ? formData.target_cities : null,
      };
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccessMessage(editingId ? "تم تحديث الخبر بنجاح" : "تم إضافة الخبر بنجاح");
        fetchNews();
        setTimeout(() => {
          setFormData(defaultFormData);
          setShowForm(false);
          setEditingId(null);
          setSuccessMessage(null);
        }, 1500);
      } else {
        setError(data.error || "حدث خطأ أثناء الحفظ");
      }
    } catch (error: any) {
      console.error("Error saving news:", error);
      setError(error.message || "حدث خطأ في الاتصال");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: NewsItem) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      content: item.content || "",
      type: item.type || "general",
      active: item.active !== undefined ? item.active : true,
      priority: item.priority || 0,
      speed: item.speed || 25,
      background_color: item.background_color || "",
      text_color: item.text_color || "",
      icon: item.icon || "",
      cta_label: item.cta_label || "",
      cta_url: item.cta_url || "",
      start_at: item.start_at ? item.start_at.slice(0, 16) : "",
      end_at: item.end_at ? item.end_at.slice(0, 16) : "",
      target_countries: item.target_countries || [],
      target_cities: item.target_cities || [],
      is_global: item.is_global ?? true,
      ai_generated: item.ai_generated || false,
    });
    setError(null);
    setSuccessMessage(null);
    setShowForm(true);
  };

  const getTypeInfo = (type: string) => {
    return newsTypes.find(t => t.value === type) || newsTypes[0];
  };

  const getCountryName = (code: string) => {
    return countries.find(c => c.code === code)?.name_ar || code;
  };

  const toggleCountry = (code: string) => {
    const current = formData.target_countries;
    if (current.includes(code)) {
      setFormData({ ...formData, target_countries: current.filter(c => c !== code) });
    } else {
      setFormData({ ...formData, target_countries: [...current, code] });
    }
  };

  const toggleCity = (name: string) => {
    const current = formData.target_cities;
    if (current.includes(name)) {
      setFormData({ ...formData, target_cities: current.filter(c => c !== name) });
    } else {
      setFormData({ ...formData, target_cities: [...current, name] });
    }
  };

  const activeNews = news.filter(n => n.active);
  const aiGeneratedCount = news.filter(n => n.ai_generated).length;
  
  // Filter news based on selected filter
  const filteredNews = filterType === "all" 
    ? news 
    : news.filter(n => n.type === filterType);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">شريط الأخبار</h1>
          <p className="text-sm text-slate-500 mt-1">إدارة الأخبار والإعلانات في الشريط العلوي للصفحة الرئيسية</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
              showPreview ? "bg-[#002845] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <Eye className="w-4 h-4" />
            معاينة
          </button>
          <button
            onClick={fetchNews}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
          <button
            onClick={() => {
              setShowAIGenerator(true);
              setAIFormData(defaultAIFormData);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition font-semibold"
          >
            <Wand2 className="w-4 h-4" />
            توليد بالذكاء الاصطناعي
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setFormData(defaultFormData);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#c9a432] transition font-semibold"
          >
            <Plus className="w-4 h-4" />
            إضافة خبر
          </button>
        </div>
      </div>

      {showPreview && activeNews.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-medium text-slate-700">معاينة شريط الأخبار</p>
          </div>
          <div
            className="relative bg-gradient-to-l from-[#001a2e] via-[#002845] to-[#001a2e] text-white overflow-hidden"
            dir="rtl"
          >
            <div className="flex items-center h-10">
              <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold text-xs">
                <Newspaper className="w-4 h-4" />
                <span>آخر الأخبار</span>
              </div>
              <div className="flex-1 overflow-hidden px-4">
                <div className="flex whitespace-nowrap animate-marquee">
                  {[...activeNews, ...activeNews].map((item, idx) => {
                    const typeInfo = getTypeInfo(item.type);
                    const Icon = typeInfo.icon;
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className="inline-flex items-center gap-2 px-6 text-sm flex-shrink-0"
                        style={{ color: item.text_color || "white" }}
                      >
                        <span className="text-[#D4AF37]"><Icon className="w-4 h-4" /></span>
                        <span className="font-medium">{item.title}</span>
                        {item.content && (
                          <>
                            <span className="text-white/40 mx-2">|</span>
                            <span className="text-white/70">{item.content}</span>
                          </>
                        )}
                        {item.cta_label && (
                          <span className="bg-[#D4AF37] text-[#002845] px-2 py-0.5 rounded text-xs font-bold">
                            {item.cta_label}
                          </span>
                        )}
                        <span className="text-[#D4AF37] mx-6">✦</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <style jsx>{`
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(50%); }
            }
            .animate-marquee {
              animation: marquee 20s linear infinite;
            }
          `}</style>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#002845]">{news.length}</p>
              <p className="text-xs text-slate-500">إجمالي الأخبار</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-green-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{activeNews.length}</p>
              <p className="text-xs text-slate-500">نشط</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <EyeOff className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-600">{news.length - activeNews.length}</p>
              <p className="text-xs text-slate-500">مخفي</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#D4AF37]/30 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#D4AF37]">
                {news.filter((n) => n.type === "promo" && n.active).length}
              </p>
              <p className="text-xs text-slate-500">عروض نشطة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{aiGeneratedCount}</p>
              <p className="text-xs text-slate-500">مولدة بالذكاء</p>
            </div>
          </div>
        </div>
      </div>

      {showAIGenerator && (
        <div className="bg-gradient-to-bl from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-bl from-purple-600 to-indigo-600 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#002845]">توليد خبر بالذكاء الاصطناعي</h2>
                <p className="text-xs text-slate-500">أدخل الموضوع وسيقوم الذكاء الاصطناعي بصياغة خبر احترافي</p>
              </div>
            </div>
            <button
              onClick={() => setShowAIGenerator(false)}
              className="p-2 hover:bg-white/50 rounded-lg transition"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">قوالب المناسبات الجاهزة</label>
            <div className="flex gap-2 flex-wrap">
              {occasionTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setAIFormData({
                    ...aiFormData,
                    topic: template.topic,
                    tone: template.tone,
                    news_type: template.type,
                    include_cta: template.include_cta
                  })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition bg-gradient-to-l from-[#D4AF37]/20 to-amber-100 text-[#002845] hover:from-[#D4AF37]/30 hover:to-amber-200 border border-[#D4AF37]/30"
                >
                  <span>{template.emoji}</span>
                  {template.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نوع الخبر</label>
                <div className="flex gap-2 flex-wrap">
                  {newsTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setAIFormData({ ...aiFormData, news_type: type.value })}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                          aiFormData.news_type === type.value
                            ? "bg-[#002845] text-white"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الموضوع *</label>
                <textarea
                  value={aiFormData.topic}
                  onChange={(e) => setAIFormData({ ...aiFormData, topic: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white h-24 resize-none"
                  placeholder="مثال: عروض خاصة على العقارات في الرياض بمناسبة اليوم الوطني..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">أسلوب الكتابة</label>
                <div className="flex gap-2 flex-wrap">
                  {toneOptions.map((tone) => (
                    <button
                      key={tone.value}
                      type="button"
                      onClick={() => setAIFormData({ ...aiFormData, tone: tone.value })}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                        aiFormData.tone === tone.value
                          ? "bg-purple-600 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      {tone.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      استهداف دولة (اختياري)
                    </span>
                  </label>
                  <select
                    value={aiFormData.country}
                    onChange={(e) => {
                      setAIFormData({ ...aiFormData, country: e.target.value, city: "" });
                      if (e.target.value) fetchCities(e.target.value);
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    <option value="">جميع الدول</option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>{c.name_ar}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      استهداف مدينة (اختياري)
                    </span>
                  </label>
                  <select
                    value={aiFormData.city}
                    onChange={(e) => setAIFormData({ ...aiFormData, city: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    disabled={!aiFormData.country}
                  >
                    <option value="">جميع المدن</option>
                    {cities.map((c) => (
                      <option key={c.name_ar} value={c.name_ar}>{c.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">تعليمات إضافية (اختياري)</label>
                <input
                  type="text"
                  value={aiFormData.custom_instructions}
                  onChange={(e) => setAIFormData({ ...aiFormData, custom_instructions: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  placeholder="مثال: اذكر نسبة الخصم 20%..."
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={aiFormData.include_cta}
                  onChange={(e) => setAIFormData({ ...aiFormData, include_cta: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">إضافة زر إجراء (CTA)</span>
                  <p className="text-xs text-slate-500">سيقترح الذكاء الاصطناعي نص زر مناسب</p>
                </div>
              </label>
            </div>
          </div>
          
          <div className="flex gap-2 mt-6 pt-4 border-t border-purple-200">
            <button
              onClick={generateAINews}
              disabled={generating || !aiFormData.topic}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition font-semibold disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              {generating ? "جاري التوليد..." : "توليد الخبر"}
            </button>
            <button
              onClick={() => setShowAIGenerator(false)}
              className="px-6 py-2.5 bg-white text-slate-700 rounded-xl hover:bg-slate-100 transition border border-slate-200"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-[#002845]">
                {editingId ? "تعديل الخبر" : "إضافة خبر جديد"}
              </h2>
              {formData.ai_generated && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium flex items-center gap-1">
                  <Wand2 className="w-3 h-3" />
                  مولد بالذكاء
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormData(defaultFormData);
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نوع الخبر</label>
                <div className="flex gap-2 flex-wrap">
                  {newsTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: type.value })}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                          formData.type === type.value
                            ? "bg-[#002845] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">العنوان *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  placeholder="أدخل عنوان الخبر"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">المحتوى (اختياري)</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] h-20 resize-none"
                  placeholder="أدخل تفاصيل إضافية..."
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700">نشط</span>
                    <p className="text-xs text-slate-500">سيظهر هذا الخبر في شريط الأخبار</p>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <span className="flex items-center gap-1">
                      <ArrowUp className="w-3 h-3" />
                      الأولوية
                    </span>
                  </label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    min="0"
                    max="100"
                  />
                  <p className="text-xs text-slate-400 mt-1">كلما زاد الرقم، ظهر أولاً</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Gauge className="w-3 h-3" />
                      سرعة التحرك
                    </span>
                  </label>
                  <input
                    type="range"
                    value={formData.speed}
                    onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) })}
                    className="w-full"
                    min="10"
                    max="60"
                  />
                  <p className="text-xs text-slate-400 mt-1">{formData.speed} ثانية</p>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    الاستهداف الجغرافي
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_global}
                      onChange={(e) => setFormData({ ...formData, is_global: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-600">عالمي (جميع الدول)</span>
                  </label>
                </div>
                
                {!formData.is_global && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-2">اختر الدول المستهدفة:</p>
                      <div className="flex flex-wrap gap-2">
                        {countries.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              toggleCountry(c.code);
                              if (!formData.target_countries.includes(c.code)) {
                                setSelectedCountryForCities(c.code);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                              formData.target_countries.includes(c.code)
                                ? "bg-blue-600 text-white"
                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            {c.name_ar}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {formData.target_countries.length > 0 && cities.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-2">اختر المدن المستهدفة (اختياري):</p>
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                          {cities.map((c) => (
                            <button
                              key={c.name_ar}
                              type="button"
                              onClick={() => toggleCity(c.name_ar)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                formData.target_cities.includes(c.name_ar)
                                  ? "bg-green-600 text-white"
                                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                              }`}
                            >
                              {c.name_ar}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Palette className="w-3 h-3" />
                      لون الخلفية
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.background_color || "#002845"}
                      onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.background_color}
                      onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                      placeholder="#002845"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Palette className="w-3 h-3" />
                      لون النص
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.text_color || "#ffffff"}
                      onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.text_color}
                      onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm"
                      placeholder="#ffffff"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <span className="flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    زر الإجراء (CTA)
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={formData.cta_label}
                    onChange={(e) => setFormData({ ...formData, cta_label: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    placeholder="نص الزر"
                  />
                  <input
                    type="url"
                    value={formData.cta_url}
                    onChange={(e) => setFormData({ ...formData, cta_url: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    placeholder="رابط الزر"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    جدولة الظهور
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">يبدأ من</label>
                    <input
                      type="datetime-local"
                      value={formData.start_at}
                      onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">ينتهي في</label>
                    <input
                      type="datetime-local"
                      value={formData.end_at}
                      onChange={(e) => setFormData({ ...formData, end_at: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-600 mb-2 font-medium">معاينة سريعة:</p>
                <div 
                  className="p-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: formData.background_color || "#002845",
                    color: formData.text_color || "#ffffff"
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[#D4AF37]">✦</span>
                    <span className="font-medium">{formData.title || "عنوان الخبر"}</span>
                    {formData.content && (
                      <>
                        <span className="opacity-50">|</span>
                        <span className="opacity-80">{formData.content}</span>
                      </>
                    )}
                    {formData.cta_label && (
                      <span className="bg-[#D4AF37] text-[#002845] px-2 py-0.5 rounded text-xs font-bold">
                        {formData.cta_label}
                      </span>
                    )}
                  </div>
                </div>
                {!formData.is_global && formData.target_countries.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="w-3 h-3" />
                    <span>يظهر في: {formData.target_countries.map(c => getCountryName(c)).join("، ")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Error and Success Messages */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">{error}</span>
              </div>
            </div>
          )}
          
          {successMessage && (
            <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">{successMessage}</span>
              </div>
            </div>
          )}
          
          <div className="flex gap-2 mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={handleSubmit}
              disabled={saving || !formData.title}
              className="flex items-center gap-2 px-6 py-2 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#c9a432] transition font-semibold disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-[#002845] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {editingId ? "تحديث" : "إضافة"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormData(defaultFormData);
                setError(null);
                setSuccessMessage(null);
              }}
              className="px-6 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-[#002845]/5 to-transparent">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-slate-600">
              الأخبار النشطة ستظهر في شريط الأخبار أعلى الصفحة الرئيسية • مرتبة حسب الأولوية
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">فلترة:</span>
              <button
                onClick={() => setFilterType("all")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  filterType === "all"
                    ? "bg-[#002845] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                الكل ({news.length})
              </button>
              {newsTypes.map((type) => {
                const count = news.filter(n => n.type === type.value).length;
                return (
                  <button
                    key={type.value}
                    onClick={() => setFilterType(type.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                      filterType === type.value
                        ? "bg-[#002845] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <type.icon className="w-3 h-3" />
                    {type.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-3 text-sm">جاري التحميل...</p>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="p-12 text-center">
            <Newspaper className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">
              {filterType === "all" ? "لا توجد أخبار" : `لا توجد أخبار من نوع "${newsTypes.find(t => t.value === filterType)?.label || filterType}"`}
            </p>
            {filterType !== "all" && (
              <button
                onClick={() => setFilterType("all")}
                className="mt-4 text-[#D4AF37] hover:underline text-sm font-medium"
              >
                عرض جميع الأخبار
              </button>
            )}
            {filterType === "all" && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 text-[#D4AF37] hover:underline text-sm font-medium"
              >
                إضافة خبر جديد
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredNews.map((item, index) => {
              const typeInfo = getTypeInfo(item.type);
              const Icon = typeInfo.icon;
              
              return (
                <div key={item.id} className="p-4 hover:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => updatePriority(item.id, (item.priority || 0) + 1)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                          title="رفع الأولوية"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <span className="text-xs text-slate-400 text-center">{item.priority || 0}</span>
                        <button
                          onClick={() => updatePriority(item.id, Math.max(0, (item.priority || 0) - 1))}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                          title="خفض الأولوية"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: item.background_color ? `${item.background_color}20` : (item.active ? "rgba(212, 175, 55, 0.2)" : "#f1f5f9"),
                        }}
                      >
                        <Icon 
                          className="w-5 h-5" 
                          style={{ color: item.background_color || (item.active ? "#D4AF37" : "#94a3b8") }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`font-semibold ${item.active ? "text-[#002845]" : "text-slate-400"}`}>
                            {item.title}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            item.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}>
                            {item.active ? "نشط" : "مخفي"}
                          </span>
                          <span 
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ 
                              backgroundColor: `${typeInfo.color}20`,
                              color: typeInfo.color 
                            }}
                          >
                            {typeInfo.label}
                          </span>
                          {item.ai_generated && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
                              <Wand2 className="w-2.5 h-2.5" />
                              AI
                            </span>
                          )}
                          {!item.is_global && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
                              <Globe className="w-2.5 h-2.5" />
                              مستهدف
                            </span>
                          )}
                          {item.cta_label && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
                              <Link2 className="w-2.5 h-2.5" />
                              {item.cta_label}
                            </span>
                          )}
                          {(item.start_at || item.end_at) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              مجدول
                            </span>
                          )}
                        </div>
                        {item.content && (
                          <p className={`text-sm mt-1 ${item.active ? "text-slate-500" : "text-slate-400"}`}>
                            {item.content}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(item.created_at).toLocaleDateString("ar-SA")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Gauge className="w-3 h-3" />
                            سرعة: {item.speed || 25}ث
                          </span>
                          {item.target_countries && item.target_countries.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {item.target_countries.map(c => getCountryName(c)).join("، ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(item.id, item.active)}
                        className={`p-1.5 rounded-lg transition ${
                          item.active
                            ? "bg-yellow-100 text-yellow-600 hover:bg-yellow-200"
                            : "bg-green-100 text-green-600 hover:bg-green-200"
                        }`}
                        title={item.active ? "إخفاء" : "إظهار"}
                      >
                        {item.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition"
                        title="تعديل"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteNews(item.id)}
                        className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
