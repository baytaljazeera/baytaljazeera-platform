"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { 
  MapPin, Plus, Edit, Trash2, Eye, EyeOff, RefreshCw, Save, X, 
  Upload, Image as ImageIcon, GripVertical, Building2, Globe
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

interface FeaturedCity {
  id: number;
  name_ar: string;
  name_en: string | null;
  country_code: string;
  country_name_ar: string | null;
  image_url: string | null;
  properties_count: number;
  sort_order: number;
  is_active: boolean;
  is_capital: boolean;
  created_at: string;
  updated_at: string;
}

const countries = [
  { code: "SA", name: "السعودية" },
  { code: "AE", name: "الإمارات" },
  { code: "QA", name: "قطر" },
  { code: "KW", name: "الكويت" },
  { code: "BH", name: "البحرين" },
  { code: "OM", name: "عمان" },
  { code: "EG", name: "مصر" },
  { code: "TR", name: "تركيا" },
  { code: "LB", name: "لبنان" },
];

const defaultFormData = {
  name_ar: "",
  name_en: "",
  country_code: "SA",
  country_name_ar: "السعودية",
  is_capital: false,
  sort_order: 0,
  is_active: true,
};

export default function FeaturedCitiesPage() {
  const [cities, setCities] = useState<FeaturedCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(defaultFormData);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCities = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/featured-cities`);
      if (res.ok) {
        const data = await res.json();
        setCities(data.cities || []);
      }
    } catch (error) {
      console.error("Error fetching cities:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCities();
  }, []);

  const toggleActive = async (id: number) => {
    try {
      const res = await fetch(`/api/featured-cities/${id}/toggle`, {
        method: "PATCH",
      });
      if (res.ok) {
        fetchCities();
      }
    } catch (error) {
      console.error("Error toggling city:", error);
    }
  };

  const deleteCity = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه المدينة؟")) return;
    
    try {
      const res = await fetch(`/api/featured-cities/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchCities();
      }
    } catch (error) {
      console.error("Error deleting city:", error);
    }
  };

  const handleEdit = (city: FeaturedCity) => {
    setEditingId(city.id);
    setFormData({
      name_ar: city.name_ar,
      name_en: city.name_en || "",
      country_code: city.country_code,
      country_name_ar: city.country_name_ar || "",
      is_capital: city.is_capital,
      sort_order: city.sort_order,
      is_active: city.is_active,
    });
    setImagePreview(city.image_url);
    setShowForm(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("name_ar", formData.name_ar);
      formDataToSend.append("name_en", formData.name_en);
      formDataToSend.append("country_code", formData.country_code);
      formDataToSend.append("country_name_ar", formData.country_name_ar);
      formDataToSend.append("is_capital", String(formData.is_capital));
      formDataToSend.append("sort_order", String(formData.sort_order));
      formDataToSend.append("is_active", String(formData.is_active));
      
      if (imageFile) {
        formDataToSend.append("image", imageFile);
      }

      const url = editingId 
        ? `/api/featured-cities/${editingId}`
        : "/api/featured-cities";
      
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        body: formDataToSend,
      });

      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setFormData(defaultFormData);
        setImageFile(null);
        setImagePreview(null);
        fetchCities();
        toast.success(editingId ? 'تم تحديث المدينة بنجاح' : 'تم إضافة المدينة بنجاح');
      } else {
        const data = await res.json();
        toast.error(data.error || "حدث خطأ في الحفظ");
      }
    } catch (error) {
      console.error("Error saving city:", error);
      toast.error("حدث خطأ في الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  const handleCountryChange = (code: string) => {
    const country = countries.find(c => c.code === code);
    setFormData({
      ...formData,
      country_code: code,
      country_name_ar: country?.name || "",
    });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultFormData);
    setImageFile(null);
    setImagePreview(null);
  };

  const activeCities = cities.filter(c => c.is_active);
  const inactiveCities = cities.filter(c => !c.is_active);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#e8c868] rounded-xl flex items-center justify-center shadow-lg">
            <MapPin className="w-6 h-6 text-[#002845]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#002845]">المدن الأكثر طلبًا</h1>
            <p className="text-sm text-slate-500">إدارة المدن المميزة في السايد بار</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCities}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setFormData({ ...defaultFormData, sort_order: cities.length + 1 });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#002845] rounded-lg hover:bg-[#e8c868] transition font-semibold text-sm"
          >
            <Plus className="w-4 h-4" />
            إضافة مدينة
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#002845]">{cities.length}</p>
              <p className="text-xs text-slate-500">إجمالي المدن</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{activeCities.length}</p>
              <p className="text-xs text-slate-500">مدن مفعلة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">
                {new Set(cities.map(c => c.country_code)).size}
              </p>
              <p className="text-xs text-slate-500">دول مختلفة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">
                {cities.filter(c => c.image_url).length}
              </p>
              <p className="text-xs text-slate-500">مدن بصور</p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#002845]">
                {editingId ? "تعديل المدينة" : "إضافة مدينة جديدة"}
              </h2>
              <button onClick={cancelForm} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-1">
                    اسم المدينة (عربي) *
                  </label>
                  <input
                    type="text"
                    value={formData.name_ar}
                    onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="الرياض"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-1">
                    اسم المدينة (إنجليزي)
                  </label>
                  <input
                    type="text"
                    value={formData.name_en}
                    onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="Riyadh"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-1">
                    الدولة *
                  </label>
                  <select
                    value={formData.country_code}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {countries.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-1">
                    ترتيب العرض
                  </label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    min="0"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_capital}
                    onChange={(e) => setFormData({ ...formData, is_capital: e.target.checked })}
                    className="w-4 h-4 accent-[#D4AF37]"
                  />
                  <span className="text-sm text-[#002845]">عاصمة</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 accent-[#D4AF37]"
                  />
                  <span className="text-sm text-[#002845]">مفعلة</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#002845] mb-2">
                  صورة المدينة
                </label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-[#D4AF37] transition"
                >
                  {imagePreview ? (
                    <div className="relative w-full h-32 rounded-lg overflow-hidden">
                      <Image
                        src={imagePreview}
                        alt="Preview"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="py-4">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">اضغط لرفع صورة</p>
                      <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP - حد أقصى 5MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={cancelForm}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[#D4AF37] text-[#002845] rounded-lg text-sm font-bold hover:bg-[#e8c868] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingId ? "تحديث" : "إضافة"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin" />
        </div>
      ) : cities.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-100">
          <MapPin className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#002845] mb-2">لا توجد مدن</h3>
          <p className="text-sm text-slate-500 mb-4">ابدأ بإضافة المدن الأكثر طلبًا</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-2 bg-[#D4AF37] text-[#002845] rounded-lg font-semibold text-sm"
          >
            إضافة مدينة
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">الترتيب</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">الصورة</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">المدينة</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">الدولة</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">الحالة</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cities.map((city) => (
                <tr key={city.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-slate-300" />
                      <span className="text-sm font-semibold text-[#002845]">{city.sort_order}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {city.image_url ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden relative">
                        <Image
                          src={city.image_url}
                          alt={city.name_ar}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-slate-300" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#002845]">{city.name_ar}</p>
                      {city.name_en && (
                        <p className="text-xs text-slate-500">{city.name_en}</p>
                      )}
                      {city.is_capital && (
                        <span className="inline-block mt-1 text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                          عاصمة
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600">{city.country_name_ar}</span>
                    <span className="block text-xs text-slate-400">{city.country_code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(city.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                        city.is_active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {city.is_active ? (
                        <>
                          <Eye className="w-3 h-3" />
                          مفعلة
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" />
                          معطلة
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(city)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="تعديل"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteCity(city.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
