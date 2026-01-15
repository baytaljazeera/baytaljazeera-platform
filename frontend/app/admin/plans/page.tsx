"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X,
  Loader2,
  Check,
  AlertTriangle,
  Globe,
} from "lucide-react";
import Link from "next/link";
import {
  iconOptions,
  badgeOptions,
  logoOptions,
  colorOptions,
  MAX_PLANS,
  getIconComponent,
  primaryIconOptions,
} from "@/lib/planOptions";

interface Plan {
  id: number;
  name_ar: string;
  name_en: string;
  slug: string;
  price: number;
  duration_days: number;
  max_listings: number;
  max_photos_per_listing: number;
  max_videos_per_listing: number;
  show_on_map: boolean;
  ai_support_level: number;
  highlights_allowed: number;
  description: string;
  logo: string | null;
  icon: string | null;
  color: string;
  badge: string | null;
  visible: boolean;
  features: string[];
  sort_order: number;
  support_level: number;
  max_video_duration: number;
  custom_icon: string | null;
  badge_enabled: boolean;
  badge_text: string | null;
  badge_position: string;
  badge_shape: string;
  badge_bg_color: string;
  badge_text_color: string;
  horizontal_badge_enabled: boolean;
  horizontal_badge_text: string | null;
  horizontal_badge_bg_color: string;
  horizontal_badge_text_color: string;
  header_bg_color: string | null;
  header_text_color: string | null;
  body_bg_color: string | null;
  body_text_color: string | null;
  badge_font_size: number;
  header_bg_opacity: number;
  body_bg_opacity: number;
  badge_bg_opacity: number;
  elite_feature_title: string | null;
  elite_feature_description: string | null;
  ai_feature_title: string | null;
  ai_feature_description: string | null;
  seo_level: number;
  seo_feature_title: string | null;
  seo_feature_description: string | null;
  feature_display_order: {
    listings: number;
    photos: number;
    map: number;
    ai: number;
    video: number;
    elite: number;
    seo: number;
  } | string | null;
}

interface IconFile {
  filename: string;
  path: string;
  name: string;
}

const defaultPlan: Partial<Plan> = {
  name_ar: "",
  name_en: "",
  slug: "",
  price: 0,
  duration_days: 30,
  max_listings: 1,
  max_photos_per_listing: 5,
  max_videos_per_listing: 0,
  show_on_map: false,
  ai_support_level: 0,
  highlights_allowed: 0,
  description: "",
  logo: null,
  icon: "crown",
  color: "#D4AF37",
  badge: null,
  visible: true,
  features: [],
  sort_order: 0,
  support_level: 0,
  max_video_duration: 60,
  custom_icon: null,
  badge_enabled: false,
  badge_text: null,
  badge_position: "top-right",
  badge_shape: "ribbon",
  badge_bg_color: "#D4AF37",
  badge_text_color: "#FFFFFF",
  horizontal_badge_enabled: false,
  horizontal_badge_text: null,
  horizontal_badge_bg_color: "#D4AF37",
  horizontal_badge_text_color: "#002845",
  header_bg_color: null,
  header_text_color: null,
  body_bg_color: null,
  body_text_color: null,
  badge_font_size: 16,
  header_bg_opacity: 100,
  body_bg_opacity: 100,
  badge_bg_opacity: 100,
  elite_feature_title: "الاشتراك في نخبة الإعلانات",
  elite_feature_description: "اعرض عقارك في نخبة العقارات المختارة على الصفحة الرئيسية",
  ai_feature_title: "مركز الذكاء الاصطناعي",
  ai_feature_description: "تحليل ذكي للتسعير وتوليد محتوى احترافي",
  seo_level: 0,
  seo_feature_title: "تحسين محركات البحث SEO",
  seo_feature_description: "تحسين ظهور عقاراتك في نتائج البحث",
  feature_display_order: { listings: 1, photos: 2, map: 3, ai: 4, video: 5, elite: 6, seo: 7 },
};

const FEATURE_ORDER_LABELS: Record<string, string> = {
  listings: "عدد الإعلانات",
  photos: "الصور",
  map: "الخريطة",
  ai: "الذكاء الاصطناعي",
  video: "الفيديو",
  elite: "نخبة العقارات",
  seo: "تحسين SEO",
};

const BADGE_POSITIONS = [
  { value: "top-right", label: "أعلى اليمين" },
  { value: "top-left", label: "أعلى اليسار" },
  { value: "bottom-right", label: "أسفل اليمين" },
  { value: "bottom-left", label: "أسفل اليسار" },
];

const BADGE_SHAPES = [
  { value: "ribbon", label: "شريط" },
  { value: "circle", label: "دائرة" },
  { value: "rectangle", label: "مستطيل" },
  { value: "tag", label: "علامة" },
];

const AI_LEVELS = [
  { value: 0, label: "بدون ذكاء اصطناعي", description: "لا يوجد دعم AI" },
  { value: 1, label: "أساسي", description: "مساعدة بسيطة في الوصف" },
  { value: 2, label: "متقدم", description: "تحليل الصور والاقتراحات" },
  { value: 3, label: "متميز", description: "دعم كامل مع تحليل السوق" },
];

const SUPPORT_LEVELS = [
  { value: 0, label: "غير مفعّل", description: "لا يظهر في نخبة العقارات" },
  { value: 3, label: "مفعّل", description: "يظهر في نخبة العقارات المختارة" },
];

const SEO_LEVELS = [
  { value: 0, label: "غير مفعّل", description: "بدون تحسين محركات البحث" },
  { value: 1, label: "أساسي", description: "عنوان ووصف SEO فقط" },
  { value: 2, label: "متقدم", description: "SEO كامل + Schema.org + كلمات مفتاحية" },
];

export default function PlansManagement() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [originalPlan, setOriginalPlan] = useState<Plan | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isNewPlan, setIsNewPlan] = useState(false);
  const [newFeature, setNewFeature] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [availableIcons, setAvailableIcons] = useState<IconFile[]>([]);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchIcons();
  }, []);

  const fetchIcons = async () => {
    try {
      const res = await fetch("/api/plans/icons/list");
      const data = await res.json();
      setAvailableIcons(data.icons || []);
    } catch (err) {
      console.error("Error fetching icons:", err);
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingIcon(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const res = await fetch("/api/plans/icons/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            filename: file.name,
            data: reader.result
          })
        });

        if (res.ok) {
          const data = await res.json();
          setAvailableIcons(prev => [...prev, data.icon]);
          if (editingPlan) {
            setEditingPlan({ ...editingPlan, custom_icon: data.icon.path });
          }
          setMessage({ type: "success", text: "تم رفع الأيقونة بنجاح" });
        } else {
          setMessage({ type: "error", text: "فشل رفع الأيقونة" });
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Error uploading icon:", err);
      setMessage({ type: "error", text: "خطأ في رفع الأيقونة" });
    } finally {
      setUploadingIcon(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch("/api/plans?all=true", {
        credentials: "include",
      });
      const data = await res.json();
      setPlans(data.plans || []);
    } catch (err) {
      console.error("Error fetching plans:", err);
      setMessage({ type: "error", text: "فشل في تحميل الباقات" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (plan: Plan) => {
    const planWithDefaults = {
      ...plan,
      features: plan.features || [],
      icon: plan.icon || "crown",
      color: plan.color || "#D4AF37",
      logo: plan.logo || null,
      badge: plan.badge || null,
      support_level: plan.support_level || 0,
      max_video_duration: plan.max_video_duration || 60,
      custom_icon: plan.custom_icon || null,
    };
    setEditingPlan(planWithDefaults);
    setOriginalPlan(planWithDefaults);
    setIsNewPlan(false);
    setShowModal(true);
  };

  const handleReset = () => {
    setEditingPlan(originalPlan);
    setMessage({ type: "success", text: "تم الرجوع للقيم السابقة" });
  };

  const handleNew = () => {
    if (plans.length >= MAX_PLANS) {
      setMessage({ type: "error", text: `لا يمكن إضافة أكثر من ${MAX_PLANS} باقات للحفاظ على تصميم الموقع` });
      return;
    }
    setEditingPlan({ ...defaultPlan, sort_order: plans.length } as Plan);
    setIsNewPlan(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingPlan) return;

    if (!editingPlan.name_ar || !editingPlan.name_en) {
      setMessage({ type: "error", text: "يجب إدخال اسم الباقة بالعربية والإنجليزية" });
      return;
    }

    setSaving(true);
    try {
      const url = isNewPlan
        ? "/api/plans"
        : `/api/plans/${editingPlan.id}`;

      const res = await fetch(url, {
        method: isNewPlan ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingPlan),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: "success", text: isNewPlan ? "تم إنشاء الباقة بنجاح" : "تم تحديث الباقة بنجاح" });
        setShowModal(false);
        fetchPlans();
      } else {
        setMessage({ type: "error", text: data.error || "حدث خطأ" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "فشل في حفظ الباقة" });
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPlan(null);
    setOriginalPlan(null);
  };

  const handleToggleVisibility = async (plan: Plan) => {
    try {
      const res = await fetch(`/api/plans/${plan.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ visible: !plan.visible }),
      });

      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchPlans();
      }
    } catch (err) {
      setMessage({ type: "error", text: "فشل في تغيير حالة الباقة" });
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`هل أنت متأكد من حذف باقة "${plan.name_ar}"؟`)) return;

    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "تم حذف الباقة بنجاح" });
        fetchPlans();
      } else {
        setMessage({ type: "error", text: data.error || "فشل في حذف الباقة" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "فشل في حذف الباقة" });
    }
  };

  const addFeature = () => {
    if (!newFeature.trim() || !editingPlan) return;
    setEditingPlan({
      ...editingPlan,
      features: [...(editingPlan.features || []), newFeature.trim()],
    });
    setNewFeature("");
  };

  const removeFeature = (index: number) => {
    if (!editingPlan) return;
    const newFeatures = [...(editingPlan.features || [])];
    newFeatures.splice(index, 1);
    setEditingPlan({ ...editingPlan, features: newFeatures });
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
            message.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {message.type === "error" && <AlertTriangle className="w-5 h-5" />}
          {message.type === "success" && <Check className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B]">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#003366]">إدارة الباقات</h1>
            <p className="text-sm text-gray-500">
              {plans.length} من {MAX_PLANS} باقات • تحكم كامل في الأسعار والمميزات
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/plans/country-pricing"
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition bg-[#003366] text-white hover:bg-[#002244]"
          >
            <Globe className="w-5 h-5" />
            تسعير حسب الدولة
          </Link>
          <button
            onClick={handleNew}
            disabled={plans.length >= MAX_PLANS}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition ${
              plans.length >= MAX_PLANS
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white hover:opacity-90"
            }`}
          >
            <Plus className="w-5 h-5" />
            إضافة باقة جديدة
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <CreditCard className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-600 mb-2">لا توجد باقات</h3>
          <p className="text-gray-400 mb-4">أضف باقتك الأولى للبدء</p>
          <button
            onClick={handleNew}
            className="px-6 py-2 rounded-xl bg-[#D4AF37] text-white font-medium hover:opacity-90"
          >
            إضافة باقة
          </button>
        </div>
      ) : (
        <div className="max-w-[90rem] mx-auto grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {plans.map((plan) => {
            const IconComponent = getIconComponent(plan.icon);
            const isFree = plan.price === 0;
            
            const headerBgStyle = isFree
              ? { backgroundColor: "#E8F5E9" }
              : { background: `linear-gradient(to bottom, #fdf6db, #e5cf8b)` };

            const bottomBgStyle = isFree ? { backgroundColor: "#D0E8D8" } : {};

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-[30px] overflow-visible transition-transform shadow-[0_10px_30px_-10px_rgba(0,0,0,0.3)] bg-white h-full group ${plan.visible ? 'z-0' : 'opacity-60'}`}
                style={{ border: '4px solid #1B5E20' }}
              >
                {/* شريط الأكثر طلباً */}
                {plan.badge && (
                  <div className="absolute -top-6 inset-x-0 flex items-center justify-center z-20">
                    <div className="relative flex items-center justify-center px-6 py-2 rounded-full shadow-lg" style={{ minWidth: '200px', backgroundColor: plan.color }}>
                      <span className="text-white font-bold text-base">{plan.badge}</span>
                    </div>
                  </div>
                )}

                {/* شريط مجاني */}
                {isFree && (
                  <div className="absolute -top-8 right-0 bg-gradient-to-r from-[#d4af37] to-[#fdf6db] text-[#002845] text-xl font-extrabold px-12 py-2 rotate-12 shadow-lg transform translate-x-4 z-30">
                    مجاني
                  </div>
                )}

                {/* رأس البطاقة */}
                <div className={`relative p-5 ${plan.badge ? 'pb-16' : 'pb-12'} flex flex-col items-center text-center rounded-t-[30px]`} style={headerBgStyle}>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-md mb-3 p-1 bg-white/20 text-4xl overflow-hidden">
                    {plan.custom_icon ? (
                      <img src={plan.custom_icon} alt={plan.name_ar} className="w-14 h-14 rounded-full object-cover" />
                    ) : plan.logo ? (
                      <span>{plan.logo}</span>
                    ) : (
                      <IconComponent className="w-10 h-10" style={{ color: plan.color }} />
                    )}
                  </div>

                  <h2 className="text-xl font-extrabold text-[#002845] mb-2">{plan.name_ar}</h2>
                  <p className="text-xs font-bold text-[#0a3d66]">{plan.name_en}</p>
                  
                  <p className="text-3xl font-black mt-3" style={{ color: plan.color }}>
                    {plan.price === 0 ? "مجاني" : `${Math.round(plan.price)} ر.س`}
                  </p>
                  {plan.price > 0 && <p className="text-xs text-gray-500">/ {plan.duration_days} يوم</p>}
                </div>

                {/* جسم البطاقة */}
                <div className={`p-5 pt-10 flex-1 ${isFree ? 'rounded-b-[30px]' : 'bg-white rounded-b-[30px]'}`} style={isFree ? bottomBgStyle : {}}>
                  <ul className="space-y-2.5 text-right text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                      <span className="text-sm font-semibold">{plan.max_listings} إعلان</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                      <span className="text-sm font-semibold">حتى {plan.max_photos_per_listing} صور</span>
                    </li>
                    <li className={`flex items-start gap-2 ${plan.show_on_map ? '' : 'opacity-60'}`}>
                      {plan.show_on_map ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" /> : <X className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />}
                      <span className="text-sm font-semibold">ظهور على الخريطة</span>
                    </li>
                    <li className={`flex items-start gap-2 ${plan.ai_support_level > 0 ? '' : 'opacity-60'}`}>
                      {plan.ai_support_level > 0 ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" /> : <X className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />}
                      <span className="text-sm font-semibold">ذكاء اصطناعي</span>
                    </li>
                    <li className={`flex items-start gap-2 ${plan.max_videos_per_listing > 0 ? '' : 'opacity-60'}`}>
                      {plan.max_videos_per_listing > 0 ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" /> : <X className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />}
                      <span className="text-sm font-semibold">فيديو</span>
                    </li>
                    <li className={`flex items-start gap-2 ${plan.support_level > 0 ? '' : 'opacity-60'}`}>
                      {plan.support_level > 0 ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" /> : <X className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />}
                      <span className="text-sm font-semibold">نخبة العقارات المختارة</span>
                    </li>
                    <li className={`flex items-start gap-2 ${plan.seo_level > 0 ? '' : 'opacity-60'}`}>
                      {plan.seo_level > 0 ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-500" /> : <X className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />}
                      <span className="text-sm font-semibold">تحسين محركات البحث SEO</span>
                    </li>
                  </ul>
                </div>

                {/* أزرار التحكم - مخفية بشكل افتراضي، تظهر عند التمرير */}
                <div className="absolute inset-0 rounded-[30px] bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 z-40">
                  <button
                    onClick={() => handleEdit(plan)}
                    className="px-6 py-2 rounded-xl bg-[#003366] text-white font-medium hover:bg-[#002244] transition flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    تعديل
                  </button>
                  <button
                    onClick={() => handleToggleVisibility(plan)}
                    className={`px-6 py-2 rounded-xl font-medium transition flex items-center gap-2 ${
                      plan.visible
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "bg-green-500 text-white hover:bg-green-600"
                    }`}
                  >
                    {plan.visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {plan.visible ? "إخفاء" : "إظهار"}
                  </button>
                  <button
                    onClick={() => handleDelete(plan)}
                    className="px-6 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition font-medium flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف
                  </button>
                </div>

                {/* شارة المخفية */}
                {!plan.visible && (
                  <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-gray-400/80 text-white text-xs font-bold flex items-center gap-1 z-10">
                    <EyeOff className="w-3 h-3" />
                    مخفية
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-[#003366]">
                {isNewPlan ? "إضافة باقة جديدة" : `تعديل باقة: ${editingPlan.name_ar}`}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الاسم بالعربية *
                  </label>
                  <input
                    type="text"
                    value={editingPlan.name_ar}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, name_ar: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    placeholder="مثال: الباقة الذهبية"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الاسم بالإنجليزية *
                  </label>
                  <input
                    type="text"
                    value={editingPlan.name_en}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, name_en: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    placeholder="Example: Gold Plan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    السعر (ر.س) *
                  </label>
                  <input
                    type="number"
                    value={editingPlan.price}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    min="0"
                    step="0.01"
                  />
                  {!isNewPlan && (
                    <Link
                      href={`/admin/plans/country-pricing?plan=${editingPlan.id}`}
                      className="inline-flex items-center gap-1 mt-2 text-xs text-[#003366] hover:text-[#D4AF37] transition"
                    >
                      <Globe className="w-3 h-3" />
                      إدارة أسعار الدول الأخرى
                    </Link>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    مدة الباقة (أيام)
                  </label>
                  <input
                    type="number"
                    value={editingPlan.duration_days}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, duration_days: parseInt(e.target.value) || 30 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الترتيب
                  </label>
                  <input
                    type="number"
                    value={editingPlan.sort_order}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, sort_order: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    عدد الإعلانات
                  </label>
                  <input
                    type="number"
                    value={editingPlan.max_listings}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, max_listings: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    عدد الصور لكل إعلان
                  </label>
                  <input
                    type="number"
                    value={editingPlan.max_photos_per_listing}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, max_photos_per_listing: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    عدد الفيديوهات
                  </label>
                  <input
                    type="number"
                    value={editingPlan.max_videos_per_listing}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, max_videos_per_listing: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    min="0"
                  />
                </div>
              </div>

              {/* إعدادات الفيديو المتقدمة */}
              {editingPlan.max_videos_per_listing > 0 && (
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h4 className="text-sm font-bold text-purple-800 mb-3">⏱️ إعدادات الفيديو</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      مدة الفيديو القصوى (بالثواني)
                    </label>
                    <input
                      type="number"
                      value={editingPlan.max_video_duration}
                      onChange={(e) =>
                        setEditingPlan({ ...editingPlan, max_video_duration: parseInt(e.target.value) || 60 })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      min="10"
                      max="600"
                    />
                    <p className="text-xs text-gray-500 mt-1">الحد الأقصى: 600 ثانية (10 دقائق)</p>
                  </div>
                </div>
              )}

              {/* مستوى الذكاء الاصطناعي */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-sm font-bold text-blue-800 mb-3">🤖 مستوى الذكاء الاصطناعي</h4>
                <div className="grid grid-cols-2 gap-2">
                  {AI_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, ai_support_level: level.value })}
                      className={`p-3 rounded-lg border-2 transition text-right ${
                        editingPlan.ai_support_level === level.value
                          ? "border-blue-500 bg-blue-100"
                          : "border-gray-200 hover:border-blue-300"
                      }`}
                    >
                      <div className="font-bold text-sm">{level.label}</div>
                      <div className="text-xs text-gray-500">{level.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* مستوى الدعم */}
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="text-sm font-bold text-green-800 mb-3">🏆 نخبة العقارات المختارة</h4>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORT_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, support_level: level.value })}
                      className={`p-3 rounded-lg border-2 transition text-right ${
                        editingPlan.support_level === level.value
                          ? "border-green-500 bg-green-100"
                          : "border-gray-200 hover:border-green-300"
                      }`}
                    >
                      <div className="font-bold text-sm">{level.label}</div>
                      <div className="text-xs text-gray-500">{level.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* مستوى تحسين محركات البحث SEO */}
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="text-sm font-bold text-purple-800 mb-3">🔍 تحسين محركات البحث SEO</h4>
                <div className="grid grid-cols-3 gap-2">
                  {SEO_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, seo_level: level.value })}
                      className={`p-3 rounded-lg border-2 transition text-right ${
                        editingPlan.seo_level === level.value
                          ? "border-purple-500 bg-purple-100"
                          : "border-gray-200 hover:border-purple-300"
                      }`}
                    >
                      <div className="font-bold text-sm">{level.label}</div>
                      <div className="text-xs text-gray-500">{level.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ترتيب عرض الميزات */}
              <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                <h4 className="text-sm font-bold text-indigo-800 mb-3">📊 ترتيب عرض الميزات</h4>
                <p className="text-xs text-indigo-600 mb-4">حدد الترتيب الرقمي لكل ميزة (1 = أولاً، 7 = أخيراً)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.keys(FEATURE_ORDER_LABELS).map((key) => {
                    const rawOrder = editingPlan.feature_display_order;
                    const currentOrder = typeof rawOrder === "string" ? JSON.parse(rawOrder) : (rawOrder || { listings: 1, photos: 2, map: 3, ai: 4, video: 5, elite: 6, seo: 7 });
                    return (
                      <div key={key} className="bg-white rounded-lg p-2 border border-indigo-200">
                        <label className="block text-xs font-semibold text-indigo-700 mb-1">{FEATURE_ORDER_LABELS[key]}</label>
                        <input
                          type="number"
                          min={1}
                          max={7}
                          value={currentOrder[key as keyof typeof currentOrder] || 1}
                          onChange={(e) => {
                            const newOrder = { ...currentOrder, [key]: parseInt(e.target.value) || 1 };
                            setEditingPlan({ ...editingPlan, feature_display_order: newOrder });
                          }}
                          className="w-full p-2 border rounded-lg text-sm text-center"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* تخصيص نصوص الميزات */}
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h4 className="text-sm font-bold text-amber-800 mb-3">✏️ تخصيص نصوص الميزات</h4>
                <p className="text-xs text-amber-600 mb-4">يمكنك تخصيص النصوص التي تظهر للمستخدمين عند عرض ميزات الباقة</p>
                
                {/* نصوص ميزة نخبة العقارات */}
                <div className="bg-white rounded-lg p-3 mb-4 border border-amber-200">
                  <label className="block text-xs font-semibold text-green-700 mb-2">🏆 عنوان ميزة النخبة</label>
                  <input
                    type="text"
                    value={editingPlan.elite_feature_title || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, elite_feature_title: e.target.value })}
                    placeholder="مثال: الاشتراك في نخبة الإعلانات"
                    className="w-full p-2 border rounded-lg text-sm mb-2"
                    dir="rtl"
                  />
                  <label className="block text-xs font-semibold text-green-700 mb-2">وصف ميزة النخبة</label>
                  <textarea
                    value={editingPlan.elite_feature_description || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, elite_feature_description: e.target.value })}
                    placeholder="مثال: اعرض عقارك في نخبة العقارات المختارة على الصفحة الرئيسية"
                    className="w-full p-2 border rounded-lg text-sm resize-none"
                    rows={2}
                    dir="rtl"
                  />
                </div>
                
                {/* نصوص ميزة الذكاء الاصطناعي */}
                <div className="bg-white rounded-lg p-3 border border-amber-200">
                  <label className="block text-xs font-semibold text-blue-700 mb-2">🤖 عنوان ميزة الذكاء الاصطناعي</label>
                  <input
                    type="text"
                    value={editingPlan.ai_feature_title || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, ai_feature_title: e.target.value })}
                    placeholder="مثال: مركز الذكاء الاصطناعي"
                    className="w-full p-2 border rounded-lg text-sm mb-2"
                    dir="rtl"
                  />
                  <label className="block text-xs font-semibold text-blue-700 mb-2">وصف ميزة الذكاء الاصطناعي</label>
                  <textarea
                    value={editingPlan.ai_feature_description || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, ai_feature_description: e.target.value })}
                    placeholder="مثال: تحليل ذكي للتسعير وتوليد محتوى احترافي"
                    className="w-full p-2 border rounded-lg text-sm resize-none"
                    rows={2}
                    dir="rtl"
                  />
                </div>

                {/* نصوص ميزة SEO */}
                <div className="bg-white rounded-lg p-3 border border-amber-200">
                  <label className="block text-xs font-semibold text-purple-700 mb-2">🔍 عنوان ميزة تحسين محركات البحث</label>
                  <input
                    type="text"
                    value={editingPlan.seo_feature_title || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, seo_feature_title: e.target.value })}
                    placeholder="مثال: تحسين محركات البحث SEO"
                    className="w-full p-2 border rounded-lg text-sm mb-2"
                    dir="rtl"
                  />
                  <label className="block text-xs font-semibold text-purple-700 mb-2">وصف ميزة SEO</label>
                  <textarea
                    value={editingPlan.seo_feature_description || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, seo_feature_description: e.target.value })}
                    placeholder="مثال: تحسين ظهور عقاراتك في نتائج البحث"
                    className="w-full p-2 border rounded-lg text-sm resize-none"
                    rows={2}
                    dir="rtl"
                  />
                </div>
              </div>

              {/* أيقونات مخصصة (صور) */}
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h4 className="text-sm font-bold text-amber-800 mb-3">🖼️ أيقونة مخصصة (صورة)</h4>
                <p className="text-xs text-gray-600 mb-3">اختر أيقونة موجودة أو ارفع صورة جديدة</p>
                
                {/* الأيقونات الموجودة */}
                {availableIcons.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, custom_icon: null })}
                      className={`p-2 rounded-lg border-2 transition ${
                        !editingPlan.custom_icon
                          ? "border-amber-500 bg-amber-100"
                          : "border-gray-200 hover:border-amber-300"
                      }`}
                    >
                      <span className="text-sm">❌ بدون صورة</span>
                    </button>
                    {availableIcons.map((icon) => (
                      <button
                        key={icon.filename}
                        type="button"
                        onClick={() => setEditingPlan({ ...editingPlan, custom_icon: icon.path })}
                        className={`p-2 rounded-lg border-2 transition ${
                          editingPlan.custom_icon === icon.path
                            ? "border-amber-500 bg-amber-100"
                            : "border-gray-200 hover:border-amber-300"
                        }`}
                      >
                        <img
                          src={icon.path}
                          alt={icon.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* رفع أيقونة جديدة */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium cursor-pointer hover:bg-amber-600 transition">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleIconUpload}
                      className="hidden"
                      disabled={uploadingIcon}
                    />
                    {uploadingIcon ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        جاري الرفع...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        رفع صورة جديدة
                      </>
                    )}
                  </label>
                  {editingPlan.custom_icon && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500" />
                      تم اختيار: {editingPlan.custom_icon.split('/').pop()}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  الأيقونة (الخمسة الرئيسية)
                </label>
                <div className="flex flex-wrap gap-3 mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  {primaryIconOptions.map((opt) => {
                    const IconComp = opt.Icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditingPlan({ ...editingPlan, icon: opt.value })}
                        className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 min-w-[80px] ${
                          editingPlan.icon === opt.value
                            ? "border-[#D4AF37] bg-[#D4AF37]/20 shadow-lg"
                            : "border-gray-300 hover:border-[#D4AF37] bg-white"
                        }`}
                        title={opt.label}
                      >
                        <IconComp
                          className="w-6 h-6"
                          style={{ color: editingPlan.icon === opt.value ? editingPlan.color : "#666" }}
                        />
                        <span className="text-xs font-semibold text-gray-700">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
                
                <details className="mb-4">
                  <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800">
                    عرض جميع الأيقونات المتاحة
                  </summary>
                  <div className="flex flex-wrap gap-2 mt-3 p-3 bg-gray-50 rounded-lg">
                    {iconOptions.map((opt) => {
                      const IconComp = opt.Icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditingPlan({ ...editingPlan, icon: opt.value })}
                          className={`p-2 rounded-lg border-2 transition flex flex-col items-center gap-1 ${
                            editingPlan.icon === opt.value
                              ? "border-[#D4AF37] bg-[#D4AF37]/10"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                          title={opt.label}
                        >
                          <IconComp
                            className="w-4 h-4"
                            style={{ color: editingPlan.icon === opt.value ? editingPlan.color : "#666" }}
                          />
                          <span className="text-[10px] text-gray-500">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اللوجو (إيموجي)
                </label>
                <div className="flex flex-wrap gap-2">
                  {logoOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, logo: opt.value || null })}
                      className={`p-3 rounded-lg border-2 transition flex flex-col items-center gap-1 min-w-[60px] ${
                        editingPlan.logo === opt.value || (!editingPlan.logo && !opt.value)
                          ? "border-[#D4AF37] bg-[#D4AF37]/10"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      title={opt.label}
                    >
                      <span className="text-xl">{opt.emoji}</span>
                      <span className="text-[10px] text-gray-500">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اللون
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {colorOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, color: opt.value })}
                      className={`w-10 h-10 rounded-lg border-2 transition ${
                        editingPlan.color === opt.value
                          ? "border-gray-800 ring-2 ring-offset-2 ring-gray-400"
                          : "border-gray-200"
                      }`}
                      style={{ backgroundColor: opt.value }}
                      title={opt.label}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editingPlan.color}
                    onChange={(e) => setEditingPlan({ ...editingPlan, color: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={editingPlan.color}
                    onChange={(e) => setEditingPlan({ ...editingPlan, color: e.target.value })}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    placeholder="#D4AF37"
                  />
                  <span className="text-sm text-gray-500">أو اختر لون مخصص</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  الشارة
                </label>
                <div className="flex flex-wrap gap-2">
                  {badgeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, badge: opt.value || null })}
                      className={`px-4 py-2 rounded-lg border-2 transition text-sm ${
                        editingPlan.badge === opt.value || (!editingPlan.badge && !opt.value)
                          ? "border-[#D4AF37] bg-[#D4AF37]/10 font-bold"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {opt.value ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-white text-xs"
                          style={{ backgroundColor: opt.color }}
                        >
                          {opt.label}
                        </span>
                      ) : (
                        <span className="text-gray-500">{opt.label}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPlan.show_on_map}
                    onChange={(e) => setEditingPlan({ ...editingPlan, show_on_map: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                  />
                  <span className="text-sm text-gray-700">ظهور الإعلانات على الخريطة</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الوصف
                </label>
                <textarea
                  value={editingPlan.description || ""}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent resize-none"
                  rows={3}
                  placeholder="وصف مختصر للباقة..."
                />
              </div>

              {/* قسم الشارة الرئيسية */}
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-[#002845]">شارة الزاوية</h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPlan.badge_enabled || false}
                      onChange={(e) => setEditingPlan({ ...editingPlan, badge_enabled: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span className="text-sm text-gray-700">تفعيل الشارة</span>
                  </label>
                </div>
                
                {editingPlan.badge_enabled && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">نص الشارة</label>
                      <input
                        type="text"
                        value={editingPlan.badge_text || ""}
                        onChange={(e) => setEditingPlan({ ...editingPlan, badge_text: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37]"
                        placeholder="مثال: مجاني، عرض خاص، الأكثر طلباً..."
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">موضع الشارة</label>
                        <select
                          value={editingPlan.badge_position || "top-right"}
                          onChange={(e) => setEditingPlan({ ...editingPlan, badge_position: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37]"
                        >
                          {BADGE_POSITIONS.map(pos => (
                            <option key={pos.value} value={pos.value}>{pos.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">شكل الشارة</label>
                        <select
                          value={editingPlan.badge_shape || "ribbon"}
                          onChange={(e) => setEditingPlan({ ...editingPlan, badge_shape: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37]"
                        >
                          {BADGE_SHAPES.map(shape => (
                            <option key={shape.value} value={shape.value}>{shape.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">لون الخلفية</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.badge_bg_color || "#D4AF37"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, badge_bg_color: e.target.value })}
                            className="w-12 h-10 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.badge_bg_color || "#D4AF37"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, badge_bg_color: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">لون النص</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.badge_text_color || "#FFFFFF"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, badge_text_color: e.target.value })}
                            className="w-12 h-10 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.badge_text_color || "#FFFFFF"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, badge_text_color: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* حجم خط الشارة */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">حجم الخط: {editingPlan.badge_font_size || 16}px</label>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="10"
                          max="32"
                          value={editingPlan.badge_font_size || 16}
                          onChange={(e) => setEditingPlan({ ...editingPlan, badge_font_size: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <input
                          type="number"
                          min="10"
                          max="32"
                          value={editingPlan.badge_font_size || 16}
                          onChange={(e) => setEditingPlan({ ...editingPlan, badge_font_size: parseInt(e.target.value) })}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                      </div>
                    </div>
                    
                    {/* شفافية الخلفية للشارة */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">شفافية الخلفية: {editingPlan.badge_bg_opacity ?? 100}%</label>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={editingPlan.badge_bg_opacity ?? 100}
                          onChange={(e) => setEditingPlan({ ...editingPlan, badge_bg_opacity: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editingPlan.badge_bg_opacity ?? 100}
                          onChange={(e) => setEditingPlan({ ...editingPlan, badge_bg_opacity: parseInt(e.target.value) })}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                      </div>
                    </div>

                    {/* معاينة الشارة */}
                    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
                      <p className="text-xs text-gray-500 mb-2">معاينة الشارة:</p>
                      <div className="relative w-32 h-20 bg-gray-100 rounded-lg">
                        {editingPlan.badge_shape === "ribbon" && (
                          <div
                            className={`absolute ${editingPlan.badge_position === "top-right" ? "top-2 -right-1" : editingPlan.badge_position === "top-left" ? "top-2 -left-1" : editingPlan.badge_position === "bottom-right" ? "bottom-2 -right-1" : "bottom-2 -left-1"} px-3 py-1 text-xs font-bold shadow-md`}
                            style={{ backgroundColor: editingPlan.badge_bg_color, color: editingPlan.badge_text_color }}
                          >
                            {editingPlan.badge_text || "نص الشارة"}
                          </div>
                        )}
                        {editingPlan.badge_shape === "circle" && (
                          <div
                            className={`absolute ${editingPlan.badge_position === "top-right" ? "-top-2 -right-2" : editingPlan.badge_position === "top-left" ? "-top-2 -left-2" : editingPlan.badge_position === "bottom-right" ? "-bottom-2 -right-2" : "-bottom-2 -left-2"} w-12 h-12 rounded-full flex items-center justify-center text-[8px] font-bold shadow-md text-center`}
                            style={{ backgroundColor: editingPlan.badge_bg_color, color: editingPlan.badge_text_color }}
                          >
                            {editingPlan.badge_text || "شارة"}
                          </div>
                        )}
                        {editingPlan.badge_shape === "rectangle" && (
                          <div
                            className={`absolute ${editingPlan.badge_position === "top-right" ? "top-1 right-1" : editingPlan.badge_position === "top-left" ? "top-1 left-1" : editingPlan.badge_position === "bottom-right" ? "bottom-1 right-1" : "bottom-1 left-1"} px-2 py-1 text-xs font-bold rounded shadow-md`}
                            style={{ backgroundColor: editingPlan.badge_bg_color, color: editingPlan.badge_text_color }}
                          >
                            {editingPlan.badge_text || "شارة"}
                          </div>
                        )}
                        {editingPlan.badge_shape === "tag" && (
                          <div
                            className={`absolute ${editingPlan.badge_position === "top-right" ? "top-0 right-0" : editingPlan.badge_position === "top-left" ? "top-0 left-0" : editingPlan.badge_position === "bottom-right" ? "bottom-0 right-0" : "bottom-0 left-0"} px-2 py-1 text-xs font-bold rounded-bl-lg shadow-md`}
                            style={{ backgroundColor: editingPlan.badge_bg_color, color: editingPlan.badge_text_color }}
                          >
                            {editingPlan.badge_text || "شارة"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* قسم الشارة الأفقية */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-[#002845]">شارة أفقية (وسط البطاقة)</h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPlan.horizontal_badge_enabled || false}
                      onChange={(e) => setEditingPlan({ ...editingPlan, horizontal_badge_enabled: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span className="text-sm text-gray-700">تفعيل</span>
                  </label>
                </div>
                
                {editingPlan.horizontal_badge_enabled && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">نص الشارة</label>
                      <input
                        type="text"
                        value={editingPlan.horizontal_badge_text || ""}
                        onChange={(e) => setEditingPlan({ ...editingPlan, horizontal_badge_text: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37]"
                        placeholder="مثال: بداية قوية، قيمة ممتازة..."
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">لون الخلفية</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.horizontal_badge_bg_color || "#D4AF37"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, horizontal_badge_bg_color: e.target.value })}
                            className="w-12 h-10 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.horizontal_badge_bg_color || "#D4AF37"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, horizontal_badge_bg_color: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">لون النص</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.horizontal_badge_text_color || "#002845"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, horizontal_badge_text_color: e.target.value })}
                            className="w-12 h-10 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.horizontal_badge_text_color || "#002845"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, horizontal_badge_text_color: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* معاينة الشارة الأفقية */}
                    <div className="mt-2 p-3 bg-white rounded-lg border border-gray-200">
                      <p className="text-xs text-gray-500 mb-2">معاينة:</p>
                      <div
                        className="px-4 py-2 rounded-full text-sm font-bold text-center max-w-[200px] mx-auto"
                        style={{ backgroundColor: editingPlan.horizontal_badge_bg_color, color: editingPlan.horizontal_badge_text_color }}
                      >
                        {editingPlan.horizontal_badge_text || "نص الشارة"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ألوان أقسام البطاقة */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
                <h4 className="text-lg font-bold text-[#002845] mb-3">ألوان أقسام البطاقة</h4>
                <p className="text-sm text-gray-500 mb-4">تخصيص ألوان القسم العلوي والسفلي للبطاقة (اتركها فارغة لاستخدام الألوان الافتراضية)</p>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* القسم العلوي */}
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <h5 className="font-semibold text-sm text-gray-700 mb-2">القسم العلوي (الرأس)</h5>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">لون الخلفية</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.header_bg_color || "#fdf6db"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, header_bg_color: e.target.value })}
                            className="w-10 h-8 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.header_bg_color || ""}
                            onChange={(e) => setEditingPlan({ ...editingPlan, header_bg_color: e.target.value })}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="افتراضي"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">لون النص</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.header_text_color || "#002845"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, header_text_color: e.target.value })}
                            className="w-10 h-8 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.header_text_color || ""}
                            onChange={(e) => setEditingPlan({ ...editingPlan, header_text_color: e.target.value })}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="افتراضي"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">الشفافية: {editingPlan.header_bg_opacity || 100}%</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={editingPlan.header_bg_opacity || 100}
                          onChange={(e) => setEditingPlan({ ...editingPlan, header_bg_opacity: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* القسم السفلي */}
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <h5 className="font-semibold text-sm text-gray-700 mb-2">القسم السفلي (المحتوى)</h5>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">لون الخلفية</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.body_bg_color || "#ffffff"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, body_bg_color: e.target.value })}
                            className="w-10 h-8 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.body_bg_color || ""}
                            onChange={(e) => setEditingPlan({ ...editingPlan, body_bg_color: e.target.value })}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="افتراضي"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">لون النص</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={editingPlan.body_text_color || "#1e293b"}
                            onChange={(e) => setEditingPlan({ ...editingPlan, body_text_color: e.target.value })}
                            className="w-10 h-8 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={editingPlan.body_text_color || ""}
                            onChange={(e) => setEditingPlan({ ...editingPlan, body_text_color: e.target.value })}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                            placeholder="افتراضي"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">الشفافية: {editingPlan.body_bg_opacity || 100}%</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={editingPlan.body_bg_opacity || 100}
                          onChange={(e) => setEditingPlan({ ...editingPlan, body_bg_opacity: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* معاينة */}
                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500 mb-2">معاينة:</p>
                  <div className="rounded-xl overflow-hidden border border-gray-300 max-w-[200px] mx-auto">
                    <div 
                      className="p-3 text-center text-sm font-bold"
                      style={{ 
                        backgroundColor: editingPlan.header_bg_color || "#fdf6db",
                        color: editingPlan.header_text_color || "#002845"
                      }}
                    >
                      القسم العلوي
                    </div>
                    <div 
                      className="p-3 text-center text-sm"
                      style={{ 
                        backgroundColor: editingPlan.body_bg_color || "#ffffff",
                        color: editingPlan.body_text_color || "#1e293b"
                      }}
                    >
                      القسم السفلي
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  المميزات الإضافية
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    placeholder="أضف ميزة جديدة..."
                  />
                  <button
                    type="button"
                    onClick={addFeature}
                    className="px-4 py-2 rounded-lg bg-[#003366] text-white hover:bg-[#002244] transition"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {editingPlan.features && editingPlan.features.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {editingPlan.features.map((f, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-sm"
                      >
                        {f}
                        <button
                          type="button"
                          onClick={() => removeFeature(i)}
                          className="w-4 h-4 rounded-full bg-gray-300 text-gray-600 hover:bg-red-400 hover:text-white flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg border border-orange-300 text-orange-600 hover:bg-orange-50 transition font-medium text-sm"
                >
                  ↩️ رجوع للأصلي
                </button>
                <button
                  onClick={closeModal}
                  className="px-6 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
                >
                  إلغاء
                </button>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
