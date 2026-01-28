"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Gift, Plus, Edit, Trash2, ToggleLeft, ToggleRight, 
  Calendar, Users, Tag, Percent, Clock, Target,
  TrendingUp, Eye, CheckCircle, XCircle, Pause, Play,
  Sparkles, Crown, Zap, Star, Wand2, Loader2
} from "lucide-react";

interface Plan {
  id: number;
  name_ar: string;
  price: number;
}

interface Promotion {
  id: number;
  name: string;
  name_ar: string;
  slug: string;
  description: string;
  description_ar: string;
  status: string;
  promotion_type: string;
  discount_type: string;
  discount_value: number;
  skip_payment: boolean;
  applies_to: string;
  target_plan_ids: number[];
  start_at: string | null;
  end_at: string | null;
  seasonal_tag: string | null;
  duration_value: number;
  duration_unit: string;
  usage_limit_total: number | null;
  usage_limit_per_user: number;
  current_usage: number;
  badge_text: string | null;
  badge_color: string;
  banner_enabled: boolean;
  banner_text: string | null;
  display_mode: string;
  display_position: string;
  background_color: string;
  dismiss_type: string;
  auto_dismiss_seconds: number;
  animation_type: string;
  target_pages: string[];
  overlay_title: string | null;
  overlay_description: string | null;
  overlay_cta_text: string | null;
  overlay_cta_url: string | null;
  priority: number;
  total_used?: number;
  created_at: string;
}

const PROMOTION_TYPES: Record<string, string> = {
  free_trial: "تجربة مجانية",
  free_plan: "باقة مجانية بالكامل",
  percentage_discount: "خصم بنسبة",
  fixed_discount: "خصم ثابت"
};

const SEASONAL_TAGS: Record<string, string> = {
  // مناسبات إسلامية
  ramadan: "🌙 رمضان",
  eid_fitr: "🎉 عيد الفطر",
  eid_adha: "🕌 عيد الأضحى",
  hajj: "🕋 موسم الحج",
  // مناسبات خليجية وطنية
  uae_national: "🇦🇪 اليوم الوطني الإماراتي",
  uae_flag: "🇦🇪 يوم العلم الإماراتي",
  kuwait_national: "🇰🇼 اليوم الوطني الكويتي",
  kuwait_liberation: "🇰🇼 يوم التحرير الكويتي",
  qatar_national: "🇶🇦 اليوم الوطني القطري",
  qatar_sports: "⚽ اليوم الرياضي القطري",
  bahrain_national: "🇧🇭 اليوم الوطني البحريني",
  oman_national: "🇴🇲 اليوم الوطني العُماني",
  oman_renaissance: "🇴🇲 يوم النهضة العُماني",
  saudi_national: "🇸🇦 اليوم الوطني السعودي",
  saudi_founding: "🏰 يوم التأسيس السعودي",
  // مناسبات عامة
  new_year: "🎊 رأس السنة",
  summer: "☀️ موسم الصيف",
  winter: "❄️ موسم الشتاء",
  back_to_school: "📚 العودة للمدارس",
  launch: "🚀 عرض الإطلاق",
  special: "✨ عرض خاص"
};

const EMOJI_CATEGORIES: Record<string, { label: string; emojis: string[] }> = {
  offers: {
    label: "🎁 العروض",
    emojis: ["🎁", "🎉", "🎊", "🎯", "🔥", "💥", "⚡", "💫", "✨", "🌟", "⭐", "💎", "👑", "🏆", "🥇", "🎖️"]
  },
  seasons: {
    label: "🌙 المواسم",
    emojis: ["🌙", "☀️", "❄️", "🌸", "🍂", "🌴", "🏖️", "⛱️", "🎄", "🎃", "🕌", "🕋", "🌹", "🌺"]
  },
  flags: {
    label: "🏳️ الأعلام",
    emojis: ["🇸🇦", "🇦🇪", "🇰🇼", "🇶🇦", "🇧🇭", "🇴🇲", "🏴", "🏳️", "🚩"]
  },
  business: {
    label: "💼 الأعمال",
    emojis: ["💼", "📊", "📈", "💰", "💵", "💸", "🏢", "🏠", "🏡", "🏘️", "🏗️", "🔑", "🗝️", "📍", "🚀", "🎪"]
  },
  actions: {
    label: "👆 الإجراءات",
    emojis: ["👆", "👉", "👇", "✅", "❌", "⏰", "🔔", "📢", "📣", "💡", "🎯", "🔒", "🔓", "📌", "📎"]
  },
  faces: {
    label: "😀 الوجوه",
    emojis: ["😀", "😃", "🤩", "😍", "🥰", "😎", "🤑", "🥳", "👏", "🙌", "💪", "🤝", "❤️", "💛", "💚", "💙"]
  }
};

const DURATION_UNITS: Record<string, string> = {
  hours: "ساعات",
  days: "أيام",
  weeks: "أسابيع",
  months: "أشهر"
};

const DISPLAY_MODES: Record<string, { label: string; icon: string; description: string }> = {
  banner: { 
    label: "بانر فقط", 
    icon: "📢", 
    description: "شريط إعلاني في أعلى أو أسفل الصفحة" 
  },
  fullpage: { 
    label: "صفحة كاملة", 
    icon: "📱", 
    description: "إعلان يغطي الشاشة بالكامل مع خلفية مظللة" 
  },
  both: { 
    label: "الاثنين معاً", 
    icon: "🎯", 
    description: "بانر + إعلان صفحة كاملة للزائر الأول" 
  }
};

const DISPLAY_POSITIONS: Record<string, string> = {
  top_banner: "أعلى الصفحة",
  bottom_banner: "أسفل الصفحة"
};

const DISMISS_TYPES: Record<string, { label: string; icon: string; description: string }> = {
  click: { 
    label: "بالنقر فقط", 
    icon: "👆", 
    description: "المستخدم يضغط زر X للإغلاق" 
  },
  timer: { 
    label: "تلقائي بعد مدة", 
    icon: "⏱️", 
    description: "يختفي تلقائياً بعد ثوانٍ محددة" 
  },
  both: { 
    label: "النقر أو تلقائي", 
    icon: "🔄", 
    description: "يختفي بالنقر أو بعد مدة (أيهما أسبق)" 
  },
  none: { 
    label: "لا يختفي", 
    icon: "📌", 
    description: "يبقى ظاهراً دائماً" 
  }
};

const ANIMATION_TYPES: Record<string, string> = {
  fade: "تلاشي",
  slide_down: "انزلاق للأسفل",
  slide_up: "انزلاق للأعلى",
  bounce: "نطاط",
  zoom: "تكبير",
  none: "بدون"
};

const TARGET_PAGES: Record<string, string> = {
  "/plans": "صفحة الباقات",
  "/upgrade": "صفحة الترقية",
  "/": "الصفحة الرئيسية",
  "/listings": "صفحة الإعلانات",
  "/listings/new": "إضافة إعلان جديد",
  "/dashboard": "لوحة التحكم"
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
  archived: "bg-slate-100 text-slate-700"
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [aiIdea, setAiIdea] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTarget, setEmojiTarget] = useState<"badge" | "banner" | "overlay_title" | "overlay_desc" | "overlay_cta" | null>(null);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState("offers");

  const [form, setForm] = useState({
    name: "",
    name_ar: "",
    slug: "",
    description: "",
    description_ar: "",
    promotion_type: "free_trial",
    discount_type: "percentage",
    discount_value: 100,
    skip_payment: true,
    applies_to: "specific_plans",
    target_plan_ids: [] as number[],
    start_at: "",
    end_at: "",
    seasonal_tag: "",
    duration_value: 7,
    duration_unit: "days",
    usage_limit_total: "",
    usage_limit_per_user: 1,
    badge_text: "",
    badge_color: "#D4AF37",
    banner_enabled: true,
    banner_text: "",
    display_mode: "banner",
    display_position: "top_banner",
    background_color: "#002845",
    dismiss_type: "click",
    auto_dismiss_seconds: 5,
    animation_type: "fade",
    target_pages: [] as string[],
    overlay_title: "",
    overlay_description: "",
    overlay_cta_text: "",
    overlay_cta_url: "",
    priority: 0,
    status: "draft"
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [promosRes, plansRes] = await Promise.all([
        fetch(`${API_URL}/api/promotions", { credentials: "include", headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/plans", { credentials: "include", headers: getAuthHeaders() })
      ]);
      
      const promosData = await promosRes.json();
      const plansData = await plansRes.json();
      
      if (promosData.ok) setPromotions(promosData.promotions);
      if (plansData.plans) setPlans(plansData.plans);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      name_ar: "",
      slug: "",
      description: "",
      description_ar: "",
      promotion_type: "free_trial",
      discount_type: "percentage",
      discount_value: 100,
      skip_payment: true,
      applies_to: "specific_plans",
      target_plan_ids: [],
      start_at: "",
      end_at: "",
      seasonal_tag: "",
      duration_value: 7,
      duration_unit: "days",
      usage_limit_total: "",
      usage_limit_per_user: 1,
      badge_text: "",
      badge_color: "#D4AF37",
      banner_enabled: true,
      banner_text: "",
      display_mode: "banner",
      display_position: "top_banner",
      background_color: "#002845",
      dismiss_type: "click",
      auto_dismiss_seconds: 5,
      animation_type: "fade",
      target_pages: [],
      overlay_title: "",
      overlay_description: "",
      overlay_cta_text: "",
      overlay_cta_url: "",
      priority: 0,
      status: "draft"
    });
    setEditingPromo(null);
    setAiIdea("");
  };

  const generateWithAI = async () => {
    if (!aiIdea.trim()) return;
    
    setAiGenerating(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/generate-promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          idea: aiIdea,
          availablePlans: plans.map(p => ({ id: p.id, name: p.name_ar }))
        })
      });
      
      const data = await res.json();
      if (data.ok && data.promotion) {
        const p = data.promotion;
        setForm(prev => ({
          ...prev,
          name: p.name || prev.name,
          name_ar: p.name_ar || prev.name_ar,
          description: p.description || prev.description,
          description_ar: p.description_ar || prev.description_ar,
          promotion_type: p.promotion_type || prev.promotion_type,
          discount_value: p.discount_value ?? prev.discount_value,
          duration_value: p.duration_value ?? prev.duration_value,
          duration_unit: p.duration_unit || prev.duration_unit,
          applies_to: p.applies_to || prev.applies_to,
          target_plan_ids: p.target_plan_ids || prev.target_plan_ids,
          seasonal_tag: p.seasonal_tag || prev.seasonal_tag,
          badge_text: p.badge_text || prev.badge_text,
          badge_color: p.badge_color || prev.badge_color,
          banner_text: p.banner_text || prev.banner_text,
          background_color: p.background_color || prev.background_color,
          skip_payment: p.promotion_type === "free_trial" || p.promotion_type === "free_plan",
          end_at: p.end_at || prev.end_at
        }));
        setMessage({ type: "success", text: "تم توليد العرض بنجاح! راجع التفاصيل وعدّل ما تريد" });
      } else {
        setMessage({ type: "error", text: data.error || "فشل في توليد العرض" });
      }
    } catch (error) {
      console.error("AI generation error:", error);
      setMessage({ type: "error", text: "حدث خطأ أثناء التوليد" });
    } finally {
      setAiGenerating(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    if (!emojiTarget) return;
    
    switch (emojiTarget) {
      case "badge":
        setForm({ ...form, badge_text: form.badge_text + emoji });
        break;
      case "banner":
        setForm({ ...form, banner_text: (form.banner_text || "") + emoji });
        break;
      case "overlay_title":
        setForm({ ...form, overlay_title: (form.overlay_title || "") + emoji });
        break;
      case "overlay_desc":
        setForm({ ...form, overlay_description: (form.overlay_description || "") + emoji });
        break;
      case "overlay_cta":
        setForm({ ...form, overlay_cta_text: (form.overlay_cta_text || "") + emoji });
        break;
    }
    setShowEmojiPicker(false);
    setEmojiTarget(null);
  };

  const openEmojiPicker = (target: "badge" | "banner" | "overlay_title" | "overlay_desc" | "overlay_cta") => {
    setEmojiTarget(target);
    setShowEmojiPicker(true);
  };

  const openEditModal = (promo: Promotion) => {
    setEditingPromo(promo);
    setForm({
      name: promo.name,
      name_ar: promo.name_ar,
      slug: promo.slug || "",
      description: promo.description || "",
      description_ar: promo.description_ar || "",
      promotion_type: promo.promotion_type,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value,
      skip_payment: promo.skip_payment,
      applies_to: promo.applies_to,
      target_plan_ids: promo.target_plan_ids || [],
      start_at: promo.start_at ? promo.start_at.slice(0, 16) : "",
      end_at: promo.end_at ? promo.end_at.slice(0, 16) : "",
      seasonal_tag: promo.seasonal_tag || "",
      duration_value: promo.duration_value,
      duration_unit: promo.duration_unit,
      usage_limit_total: promo.usage_limit_total?.toString() || "",
      usage_limit_per_user: promo.usage_limit_per_user ?? 1,
      badge_text: promo.badge_text || "",
      badge_color: promo.badge_color,
      banner_enabled: promo.banner_enabled,
      banner_text: promo.banner_text || "",
      display_mode: promo.display_mode || "banner",
      display_position: promo.display_position || "top_banner",
      background_color: promo.background_color || "#002845",
      dismiss_type: promo.dismiss_type || "click",
      auto_dismiss_seconds: promo.auto_dismiss_seconds || 5,
      animation_type: promo.animation_type || "fade",
      target_pages: Array.isArray(promo.target_pages) ? promo.target_pages : [],
      overlay_title: promo.overlay_title || "",
      overlay_description: promo.overlay_description || "",
      overlay_cta_text: promo.overlay_cta_text || "",
      overlay_cta_url: promo.overlay_cta_url || "",
      priority: promo.priority,
      status: promo.status
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const url = editingPromo 
        ? `/api/promotions/${editingPromo.id}` 
        : "/api/promotions";
      
      const res = await fetch(url, {
        method: editingPromo ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          usage_limit_total: form.usage_limit_total ? parseInt(form.usage_limit_total) : null,
          start_at: form.start_at || null,
          end_at: form.end_at || null,
          seasonal_tag: form.seasonal_tag || null
        })
      });
      
      const data = await res.json();
      
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        setShowModal(false);
        resetForm();
        fetchData();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id: number) => {
    try {
      const res = await fetch(`/api/promotions/${id}/toggle`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchData();
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    }
  };

  const deletePromotion = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا العرض؟")) return;
    
    try {
      const res = await fetch(`/api/promotions/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchData();
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    }
  };

  const togglePlanSelection = (planId: number) => {
    setForm(prev => ({
      ...prev,
      target_plan_ids: prev.target_plan_ids.includes(planId)
        ? prev.target_plan_ids.filter(id => id !== planId)
        : [...prev.target_plan_ids, planId]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg">
            <Gift className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">العروض الترويجية</h1>
            <p className="text-slate-500">إدارة العروض والخصومات والتجارب المجانية</p>
          </div>
        </div>
        
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          عرض جديد
        </button>
      </div>

      {message.text && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-lg flex items-center gap-2 ${
            message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {message.text}
          <button onClick={() => setMessage({ type: "", text: "" })} className="mr-auto">
            <XCircle className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {promotions.map((promo) => (
          <motion.div
            key={promo.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden hover:shadow-xl transition-all"
          >
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: promo.badge_color + "20" }}
                  >
                    {promo.promotion_type === "free_trial" && <Clock className="w-5 h-5" style={{ color: promo.badge_color }} />}
                    {promo.promotion_type === "free_plan" && <Crown className="w-5 h-5" style={{ color: promo.badge_color }} />}
                    {promo.promotion_type === "percentage_discount" && <Percent className="w-5 h-5" style={{ color: promo.badge_color }} />}
                    {promo.promotion_type === "fixed_discount" && <Tag className="w-5 h-5" style={{ color: promo.badge_color }} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{promo.name_ar}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[promo.status]}`}>
                      {promo.status === "active" ? "نشط" : 
                       promo.status === "paused" ? "موقف" :
                       promo.status === "draft" ? "مسودة" :
                       promo.status === "expired" ? "منتهي" : "مؤرشف"}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleStatus(promo.id)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    title={promo.status === "active" ? "إيقاف" : "تفعيل"}
                  >
                    {promo.status === "active" ? 
                      <Pause className="w-4 h-4 text-amber-600" /> : 
                      <Play className="w-4 h-4 text-green-600" />
                    }
                  </button>
                  <button
                    onClick={() => openEditModal(promo)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4 text-blue-600" />
                  </button>
                  <button
                    onClick={() => deletePromotion(promo.id)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-slate-600 line-clamp-2">{promo.description_ar || PROMOTION_TYPES[promo.promotion_type]}</p>
            </div>

            <div className="p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">نوع العرض</span>
                <span className="font-medium text-slate-700">{PROMOTION_TYPES[promo.promotion_type]}</span>
              </div>
              
              {promo.promotion_type !== "free_plan" && promo.promotion_type !== "free_trial" && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">قيمة الخصم</span>
                  <span className="font-bold text-green-600">
                    {promo.discount_type === "percentage" ? `${promo.discount_value}%` : `${promo.discount_value} ر.س`}
                  </span>
                </div>
              )}
              
              {promo.promotion_type === "free_trial" && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">مدة التجربة</span>
                  <span className="font-medium text-slate-700">
                    {promo.duration_value} {DURATION_UNITS[promo.duration_unit]}
                  </span>
                </div>
              )}
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">الاستخدامات</span>
                <span className="font-medium text-slate-700">
                  {promo.total_used || 0}
                  {promo.usage_limit_total && ` / ${promo.usage_limit_total}`}
                </span>
              </div>
              
              {promo.end_at && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">ينتهي خلال</span>
                  {(() => {
                    const endDate = new Date(promo.end_at);
                    const now = new Date();
                    const diffTime = endDate.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays <= 0) {
                      return <span className="font-bold text-red-600">منتهي</span>;
                    } else if (diffDays <= 3) {
                      return (
                        <span className="font-bold text-red-600 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {diffDays === 1 ? "يوم واحد" : `${diffDays} أيام`}
                        </span>
                      );
                    } else {
                      return (
                        <span className="font-medium text-slate-700">
                          {diffDays} {diffDays > 10 ? "يوم" : "أيام"}
                        </span>
                      );
                    }
                  })()}
                </div>
              )}
              
              {promo.seasonal_tag && (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium" style={{ color: promo.badge_color }}>
                    {SEASONAL_TAGS[promo.seasonal_tag]}
                  </span>
                </div>
              )}
              
              {promo.target_plan_ids && promo.target_plan_ids.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {promo.target_plan_ids.map(planId => {
                    const plan = plans.find(p => p.id === planId);
                    return plan ? (
                      <span key={planId} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {plan.name_ar}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {promotions.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl shadow">
          <Gift className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-600">لا توجد عروض بعد</h3>
          <p className="text-slate-400 mt-1">أنشئ أول عرض ترويجي لجذب العملاء</p>
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
                <h2 className="text-xl font-bold text-slate-800">
                  {editingPromo ? "تعديل العرض" : "إنشاء عرض جديد"}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {!editingPromo && (
                  <div className="p-4 bg-gradient-to-l from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                        <Wand2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-purple-800">توليد بالذكاء الاصطناعي</h3>
                        <p className="text-xs text-purple-600">اكتب فكرتك وخلي الذكاء يبدع!</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={aiIdea}
                        onChange={(e) => setAiIdea(e.target.value)}
                        placeholder="مثال: عرض رمضان خصم 30% لباقة التميز والنخبة لمدة شهر..."
                        className="flex-1 p-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        disabled={aiGenerating}
                      />
                      <button
                        type="button"
                        onClick={generateWithAI}
                        disabled={aiGenerating || !aiIdea.trim()}
                        className="px-4 py-2 bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[100px] justify-center"
                      >
                        {aiGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>جاري...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>ولّد</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">الاسم (عربي) *</label>
                    <input
                      type="text"
                      value={form.name_ar}
                      onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="مثال: عرض رمضان"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">الاسم (إنجليزي) *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder="Ramadan Offer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">نوع العرض *</label>
                  <select
                    value={form.promotion_type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setForm({ 
                        ...form, 
                        promotion_type: type,
                        skip_payment: type === "free_trial" || type === "free_plan",
                        discount_value: type === "free_trial" || type === "free_plan" ? 100 : form.discount_value
                      });
                    }}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    {Object.entries(PROMOTION_TYPES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                {form.promotion_type === "free_trial" && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">مدة التجربة</label>
                      <input
                        type="number"
                        value={form.duration_value}
                        onChange={(e) => setForm({ ...form, duration_value: parseInt(e.target.value) || 1 })}
                        className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-700 mb-1">وحدة المدة</label>
                      <select
                        value={form.duration_unit}
                        onChange={(e) => setForm({ ...form, duration_unit: e.target.value })}
                        className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {Object.entries(DURATION_UNITS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {(form.promotion_type === "percentage_discount" || form.promotion_type === "fixed_discount") && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-green-700 mb-1">
                        قيمة الخصم {form.discount_type === "percentage" ? "(%)" : "(ر.س)"}
                      </label>
                      <input
                        type="number"
                        value={form.discount_value}
                        onChange={(e) => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })}
                        className="w-full p-3 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500"
                        min="0"
                        max={form.discount_type === "percentage" ? 100 : undefined}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-green-700 mb-1">نوع الخصم</label>
                      <select
                        value={form.discount_type}
                        onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                        className="w-full p-3 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500"
                      >
                        <option value="percentage">نسبة مئوية</option>
                        <option value="fixed">مبلغ ثابت</option>
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الباقات المستهدفة</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, applies_to: "all_plans", target_plan_ids: [] })}
                      className={`px-4 py-2 rounded-lg transition-all ${
                        form.applies_to === "all_plans" 
                          ? "bg-amber-500 text-white" 
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      جميع الباقات
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, applies_to: "specific_plans" })}
                      className={`px-4 py-2 rounded-lg transition-all ${
                        form.applies_to === "specific_plans" 
                          ? "bg-amber-500 text-white" 
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      باقات محددة
                    </button>
                  </div>
                  
                  {form.applies_to === "specific_plans" && (
                    <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-lg">
                      {plans.map((plan) => (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => togglePlanSelection(plan.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            form.target_plan_ids.includes(plan.id)
                              ? "bg-amber-500 text-white"
                              : "bg-white text-slate-700 border border-slate-300 hover:border-amber-500"
                          }`}
                        >
                          {plan.name_ar}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700">مدة العرض</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { days: 7, label: "أسبوع" },
                      { days: 14, label: "أسبوعين" },
                      { days: 30, label: "شهر" },
                      { days: 60, label: "شهرين" },
                      { days: 90, label: "3 أشهر" }
                    ].map(({ days, label }) => {
                      const now = new Date();
                      const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
                      const startStr = now.toISOString().slice(0, 16);
                      const endStr = endDate.toISOString().slice(0, 16);
                      const isSelected = form.start_at && form.end_at && 
                        Math.abs(new Date(form.end_at).getTime() - new Date(form.start_at).getTime() - days * 24 * 60 * 60 * 1000) < 60000;
                      
                      return (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setForm({ ...form, start_at: startStr, end_at: endStr })}
                          className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            isSelected
                              ? "bg-amber-500 text-white shadow-md"
                              : "bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-700"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, start_at: "", end_at: "" })}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        !form.start_at && !form.end_at
                          ? "bg-green-500 text-white shadow-md"
                          : "bg-slate-100 text-slate-700 hover:bg-green-100 hover:text-green-700"
                      }`}
                    >
                      بدون حد زمني
                    </button>
                  </div>
                  
                  <details className="mt-2">
                    <summary className="text-sm text-slate-500 cursor-pointer hover:text-amber-600">
                      تخصيص التاريخ يدوياً ▼
                    </summary>
                    <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-slate-50 rounded-lg">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ البداية</label>
                        <input
                          type="datetime-local"
                          value={form.start_at}
                          onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                          className="w-full p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">تاريخ النهاية</label>
                        <input
                          type="datetime-local"
                          value={form.end_at}
                          onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                          className="w-full p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                  </details>
                  
                  {form.start_at && form.end_at && (
                    <div className="text-sm text-slate-600 bg-amber-50 p-2 rounded-lg">
                      📅 من <span className="font-medium">{new Date(form.start_at).toLocaleDateString('ar-SA')}</span> إلى <span className="font-medium">{new Date(form.end_at).toLocaleDateString('ar-SA')}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الموسم (اختياري)</label>
                  <select
                    value={form.seasonal_tag}
                    onChange={(e) => setForm({ ...form, seasonal_tag: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">بدون موسم</option>
                    {Object.entries(SEASONAL_TAGS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">حد الاستخدام الكلي</label>
                    <input
                      type="number"
                      value={form.usage_limit_total}
                      onChange={(e) => setForm({ ...form, usage_limit_total: e.target.value })}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      placeholder="بدون حد (اتركه فارغاً)"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">حد الاستخدام لكل مستخدم</label>
                    <input
                      type="number"
                      value={form.usage_limit_per_user}
                      onChange={(e) => setForm({ ...form, usage_limit_per_user: parseInt(e.target.value) || 1 })}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                      min="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">نص الشارة</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.badge_text}
                        onChange={(e) => setForm({ ...form, badge_text: e.target.value })}
                        className="flex-1 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        placeholder="مثال: 🎁 عرض محدود"
                      />
                      <button
                        type="button"
                        onClick={() => openEmojiPicker("badge")}
                        className="px-4 py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition-colors text-xl"
                        title="إضافة إيموجي"
                      >
                        😀
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">لون الشارة</label>
                    <input
                      type="color"
                      value={form.badge_color}
                      onChange={(e) => setForm({ ...form, badge_color: e.target.value })}
                      className="w-full h-12 p-1 border border-slate-300 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* إعدادات عرض البانر */}
                <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-200">
                  <h4 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    إعدادات العرض المتقدمة
                  </h4>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-purple-700 mb-3">نوع العرض</label>
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(DISPLAY_MODES).map(([key, mode]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setForm({ ...form, display_mode: key })}
                          className={`p-4 rounded-xl border-2 transition-all text-center ${
                            form.display_mode === key
                              ? "border-purple-500 bg-purple-50 shadow-lg"
                              : "border-purple-200 bg-white hover:border-purple-300"
                          }`}
                        >
                          <div className="text-2xl mb-2">{mode.icon}</div>
                          <div className="font-bold text-purple-800 text-sm">{mode.label}</div>
                          <div className="text-xs text-purple-600 mt-1">{mode.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {(form.display_mode === "banner" || form.display_mode === "both") && (
                    <div className="p-4 bg-purple-50 rounded-xl mb-4">
                      <h5 className="font-bold text-purple-700 mb-3 flex items-center gap-2">
                        <span>📢</span> إعدادات البانر
                      </h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-purple-700 mb-1">موضع البانر</label>
                          <select
                            value={form.display_position}
                            onChange={(e) => setForm({ ...form, display_position: e.target.value })}
                            className="w-full p-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                          >
                            {Object.entries(DISPLAY_POSITIONS).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-purple-700 mb-1">لون الخلفية</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={form.background_color}
                              onChange={(e) => setForm({ ...form, background_color: e.target.value })}
                              className="w-16 h-12 p-1 border border-purple-200 rounded-lg cursor-pointer"
                            />
                            <input
                              type="text"
                              value={form.background_color}
                              onChange={(e) => setForm({ ...form, background_color: e.target.value })}
                              className="flex-1 p-3 border border-purple-200 rounded-lg font-mono text-sm"
                              placeholder="#002845"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {(form.display_mode === "fullpage" || form.display_mode === "both") && (
                    <div className="p-4 bg-indigo-50 rounded-xl mb-4">
                      <h5 className="font-bold text-indigo-700 mb-3 flex items-center gap-2">
                        <span>📱</span> إعدادات الصفحة الكاملة (Overlay)
                      </h5>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-indigo-700 mb-1">عنوان الإعلان</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={form.overlay_title}
                              onChange={(e) => setForm({ ...form, overlay_title: e.target.value })}
                              className="flex-1 p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                              placeholder="مثال: 🎉 عرض خاص لفترة محدودة!"
                            />
                            <button
                              type="button"
                              onClick={() => openEmojiPicker("overlay_title")}
                              className="px-4 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors text-xl"
                              title="إضافة إيموجي"
                            >
                              😀
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-indigo-700 mb-1">وصف الإعلان</label>
                          <div className="flex gap-2">
                            <textarea
                              value={form.overlay_description}
                              onChange={(e) => setForm({ ...form, overlay_description: e.target.value })}
                              className="flex-1 p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                              rows={3}
                              placeholder="وصف تفصيلي للعرض..."
                            />
                            <button
                              type="button"
                              onClick={() => openEmojiPicker("overlay_desc")}
                              className="px-4 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors text-xl self-start"
                              title="إضافة إيموجي"
                            >
                              😀
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-indigo-700 mb-1">نص زر CTA</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={form.overlay_cta_text}
                                onChange={(e) => setForm({ ...form, overlay_cta_text: e.target.value })}
                                className="flex-1 p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                placeholder="مثال: 🚀 اشترك الآن"
                              />
                              <button
                                type="button"
                                onClick={() => openEmojiPicker("overlay_cta")}
                                className="px-3 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors text-lg"
                                title="إضافة إيموجي"
                              >
                                😀
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-indigo-700 mb-1">رابط زر CTA</label>
                            <input
                              type="text"
                              value={form.overlay_cta_url}
                              onChange={(e) => setForm({ ...form, overlay_cta_url: e.target.value })}
                              className="w-full p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                              placeholder="/plans أو /upgrade"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-purple-700 mb-3">طريقة الإخفاء</label>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(DISMISS_TYPES).map(([key, dismiss]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setForm({ ...form, dismiss_type: key })}
                          className={`p-3 rounded-xl border-2 transition-all text-right ${
                            form.dismiss_type === key
                              ? "border-purple-500 bg-purple-50"
                              : "border-purple-200 bg-white hover:border-purple-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span>{dismiss.icon}</span>
                            <span className="font-bold text-purple-800 text-sm">{dismiss.label}</span>
                          </div>
                          <div className="text-xs text-purple-600">{dismiss.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {(form.dismiss_type === "timer" || form.dismiss_type === "both") && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-purple-700 mb-1">مدة الإخفاء التلقائي (ثواني)</label>
                      <input
                        type="number"
                        value={form.auto_dismiss_seconds}
                        onChange={(e) => setForm({ ...form, auto_dismiss_seconds: parseInt(e.target.value) || 5 })}
                        className="w-full p-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                        min="1"
                        max="60"
                        placeholder="5"
                      />
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-purple-700 mb-1">الأنيميشن</label>
                    <select
                      value={form.animation_type}
                      onChange={(e) => setForm({ ...form, animation_type: e.target.value })}
                      className="w-full p-3 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      {Object.entries(ANIMATION_TYPES).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-purple-700 mb-2">الصفحات المستهدفة</label>
                    <p className="text-xs text-purple-500 mb-2">اتركها فارغة للعرض في جميع الصفحات</p>
                    <div className="flex flex-wrap gap-2 p-3 bg-white rounded-lg border border-purple-200">
                      {Object.entries(TARGET_PAGES).map(([path, label]) => {
                        const currentPages = Array.isArray(form.target_pages) ? form.target_pages : [];
                        const isSelected = currentPages.includes(path);
                        return (
                          <button
                            key={path}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isSelected) {
                                setForm(prev => ({ ...prev, target_pages: currentPages.filter(p => p !== path) }));
                              } else {
                                setForm(prev => ({ ...prev, target_pages: [...currentPages, path] }));
                              }
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-purple-500 text-white"
                                : "bg-purple-50 text-purple-700 border border-purple-200 hover:border-purple-500"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {Array.isArray(form.target_pages) && form.target_pages.length > 0 && (
                      <p className="text-xs text-purple-600 mt-2">
                        سيظهر البانر في: {form.target_pages.map(p => TARGET_PAGES[p as keyof typeof TARGET_PAGES]).join("، ")}
                      </p>
                    )}
                  </div>
                  
                  <div className="mt-4 p-3 bg-purple-100 rounded-lg">
                    <div className="text-sm text-purple-700">
                      <strong>معاينة:</strong> سيظهر العرض كـ
                      <span className="font-bold mx-1">{DISPLAY_MODES[form.display_mode as keyof typeof DISPLAY_MODES]?.label || "بانر"}</span>
                      {form.display_mode !== "fullpage" && (
                        <>
                          في
                          <span className="font-bold mx-1">{DISPLAY_POSITIONS[form.display_position as keyof typeof DISPLAY_POSITIONS]}</span>
                        </>
                      )}
                      مع أنيميشن
                      <span className="font-bold mx-1">{ANIMATION_TYPES[form.animation_type as keyof typeof ANIMATION_TYPES]}</span>
                      {form.dismiss_type !== "none" && (
                        <>
                          ويختفي
                          <span className="font-bold mx-1">{DISMISS_TYPES[form.dismiss_type as keyof typeof DISMISS_TYPES]?.label || "بالنقر"}</span>
                          {form.auto_dismiss_seconds > 0 && `(${form.auto_dismiss_seconds} ثانية)`}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الحالة</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="draft">مسودة</option>
                    <option value="active">نشط</option>
                    <option value="paused">موقف</option>
                  </select>
                </div>

                <div className="flex items-center gap-4 pt-4 border-t">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-medium hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50"
                  >
                    {saving ? "جاري الحفظ..." : editingPromo ? "حفظ التغييرات" : "إنشاء العرض"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji Picker Modal */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => { setShowEmojiPicker(false); setEmojiTarget(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  😀 اختر إيموجي
                </h3>
                <p className="text-amber-100 text-sm mt-1">
                  {emojiTarget === "badge" && "للشارة"}
                  {emojiTarget === "banner" && "للبانر"}
                  {emojiTarget === "overlay_title" && "لعنوان الإعلان"}
                  {emojiTarget === "overlay_desc" && "لوصف الإعلان"}
                  {emojiTarget === "overlay_cta" && "لزر الإجراء"}
                </p>
              </div>

              <div className="p-4">
                {/* Category Tabs */}
                <div className="flex flex-wrap gap-2 mb-4 border-b pb-3">
                  {Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedEmojiCategory(key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        selectedEmojiCategory === key
                          ? "bg-amber-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Emoji Grid */}
                <div className="grid grid-cols-8 gap-2 max-h-64 overflow-y-auto p-2">
                  {EMOJI_CATEGORIES[selectedEmojiCategory]?.emojis.map((emoji, idx) => (
                    <button
                      key={idx}
                      onClick={() => insertEmoji(emoji)}
                      className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-amber-100 rounded-lg transition-all hover:scale-110"
                      title={`إضافة ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t flex justify-end">
                <button
                  onClick={() => { setShowEmojiPicker(false); setEmojiTarget(null); }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-all"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
