"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { 
  Settings, 
  Eye, 
  EyeOff, 
  Loader2, 
  AlertTriangle,
  CheckCircle,
  LayoutDashboard,
  FileText,
  Flag,
  Headset,
  MessageSquare,
  Newspaper,
  MapPin,
  Wallet,
  UserPlus2,
  CreditCard,
  Megaphone,
  Building2,
  BrainCircuit,
  Users,
  Shield,
  Lock
} from "lucide-react";

type SidebarSetting = {
  id: number;
  section_key: string;
  section_label: string;
  is_visible: boolean;
  sort_order: number;
  updated_by_name: string | null;
  updated_at: string;
};

const SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  'dashboard': LayoutDashboard,
  'listings': FileText,
  'reports': Flag,
  'customer-service': Headset,
  'customer-conversations': Eye,
  'messages': MessageSquare,
  'news': Newspaper,
  'featured-cities': MapPin,
  'finance': Wallet,
  'membership': UserPlus2,
  'plans': CreditCard,
  'marketing': Megaphone,
  'ambassador': Building2,
  'ai-center': BrainCircuit,
  'users': Users,
  'roles': Shield,
  'settings': Settings,
};

const PROTECTED_SECTIONS = ['dashboard', 'settings'];

export default function SidebarSettingsPage() {
  const [settings, setSettings] = useState<SidebarSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/sidebar-settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || []);
      } else {
        setError("فشل في تحميل الإعدادات");
      }
    } catch (err) {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisibility(sectionKey: string, currentValue: boolean) {
    if (PROTECTED_SECTIONS.includes(sectionKey)) return;
    
    setUpdating(sectionKey);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch(`/api/admin/sidebar-settings/${sectionKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_visible: !currentValue })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSettings(prev => prev.map(s => 
          s.section_key === sectionKey ? { ...s, is_visible: !currentValue } : s
        ));
        setSuccess(data.message);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "فشل في تحديث الإعداد");
      }
    } catch (err) {
      setError("حدث خطأ في الاتصال");
    } finally {
      setUpdating(null);
    }
  }

  const visibleCount = settings.filter(s => s.is_visible).length;
  const hiddenCount = settings.filter(s => !s.is_visible).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-[#D4AF37]" />
            التحكم في الشريط الجانبي
          </h1>
          <p className="text-white/60 mt-1">
            إظهار وإخفاء أقسام لوحة التحكم لجميع المشرفين
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/20 text-green-400">
            <Eye className="w-5 h-5" />
            <span className="font-bold">{visibleCount}</span>
            <span className="text-sm">ظاهر</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-400">
            <EyeOff className="w-5 h-5" />
            <span className="font-bold">{hiddenCount}</span>
            <span className="text-sm">مخفي</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-white/10">
          {settings.map((setting) => {
            const Icon = SECTION_ICONS[setting.section_key] || Settings;
            const isProtected = PROTECTED_SECTIONS.includes(setting.section_key);
            const isUpdating = updating === setting.section_key;
            
            return (
              <div 
                key={setting.section_key}
                className={`flex items-center justify-between p-5 transition-colors ${
                  setting.is_visible ? 'bg-transparent' : 'bg-red-500/5'
                } ${isProtected ? 'opacity-60' : 'hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    setting.is_visible 
                      ? 'bg-[#D4AF37]/20 text-[#D4AF37]' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white flex items-center gap-2">
                      {setting.section_label}
                      {isProtected && (
                        <Lock className="w-4 h-4 text-yellow-500" />
                      )}
                    </h3>
                    <p className="text-sm text-white/50">
                      {setting.is_visible ? 'ظاهر لجميع المشرفين' : 'مخفي من الشريط الجانبي'}
                      {setting.updated_by_name && (
                        <span className="mr-2">
                          • آخر تعديل: {setting.updated_by_name}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => toggleVisibility(setting.section_key, setting.is_visible)}
                  disabled={isProtected || isUpdating}
                  className={`relative w-16 h-8 rounded-full transition-all ${
                    isProtected 
                      ? 'bg-gray-600 cursor-not-allowed' 
                      : setting.is_visible 
                        ? 'bg-green-500 hover:bg-green-600' 
                        : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {isUpdating ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  ) : (
                    <span 
                      className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all ${
                        setting.is_visible ? 'right-1' : 'left-1'
                      }`}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold">ملاحظات مهمة:</p>
            <ul className="mt-2 space-y-1 text-sm text-yellow-400/80">
              <li>• لوحة التحكم والإعدادات لا يمكن إخفاؤها (محمية)</li>
              <li>• إخفاء قسم سيؤثر على جميع المشرفين</li>
              <li>• الأقسام المخفية لن تظهر في الشريط الجانبي ولكن الصفحات ستبقى موجودة</li>
              <li>• يمكنك إعادة إظهار أي قسم في أي وقت</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
