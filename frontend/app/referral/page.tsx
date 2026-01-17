"use client";

import { useState, useEffect } from "react";
import { 
  Building2, 
  Copy, 
  Check, 
  Users, 
  Gift, 
  Flag,
  Loader2,
  Share2,
  Star,
  Sparkles,
  Trophy,
  User,
  X,
  Zap,
  Clock,
  ChevronDown,
  Send,
  Building,
  Lock,
  Wallet,
  DollarSign,
  Banknote,
  ArrowDownCircle,
  Plus,
  Trash2,
  Edit3,
  PlusCircle,
  ShieldCheck,
  FileText,
  Calendar,
  AlertCircle,
  AlertTriangle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import type { 
  AmbassadorStats as AmbassadorStatsType, 
  BuildingData as BuildingDataType, 
  ReferralData as ReferralDataType,
  ShareTextConfig as ShareTextConfigType 
} from "./types";

type AmbassadorStats = {
  ambassador_code: string;
  // الإحصائيات الجديدة
  built_floors?: number;
  collapsed_floors?: number;
  healthy_floors?: number;
  floors_consumed?: number;
  available_floors?: number;
  pending_listing_count?: number;
  // للتوافق مع الكود القديم
  current_floors: number;
  flagged_floors: number;
  flagged_floors_details?: Array<{id: string; status: string; created_at: string; referred_name: string; collapse_reason?: string; collapsed_at?: string; floor_number: number}>;
  total_floors_earned: number;
  max_floors: number;
  rewards_config: Array<{floors: number; plan_name: string; plan_months: number; plan_tier?: string}>;
  available_reward: {floors: number; plan_name: string; plan_months: number} | null;
  can_consume: boolean;
  consumption_enabled: boolean;
  pending_request: any;
  referrals: Array<{id: string; status: string; created_at: string; referred_name: string; collapse_reason?: string; collapsed_at?: string; floor_number: number; risk_score?: number; risk_level?: string; triggered_rules?: any[]; ai_explanation?: string}>;
  consumptions: Array<{id: string; consumed_at: string; plan_name: string; floors_consumed: number}>;
  requirements?: {
    require_first_listing: boolean;
    require_email_verified: boolean;
  };
};

type BuildingData = {
  buildingNumber: number;
  floors: Array<{
    floorNumber: number;
    referral?: ReferralData;
    status: 'empty' | 'completed' | 'flagged' | 'suspicious';
  }>;
  status: 'empty' | 'partial' | 'complete' | 'flagged';
  totalFloors: number;
  flaggedCount: number;
  suspiciousCount: number;
};

type ShareTextConfig = {
  main_title: string;
  code_line: string;
  benefit_line: string;
  cta_line: string;
};

function SocialShareModal({ 
  isOpen, 
  onClose, 
  code, 
  shareUrl,
  shareTextConfig
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  code: string;
  shareUrl: string;
  shareTextConfig: ShareTextConfig;
}) {
  if (!isOpen) return null;

  const formatShareText = () => {
    const lines = [
      shareTextConfig.main_title,
      '',
      shareTextConfig.code_line.replace('{CODE}', code),
      shareTextConfig.benefit_line,
      '',
      shareTextConfig.cta_line
    ];
    return lines.join('\n');
  };

  const shareText = formatShareText();
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  const socialPlatforms = [
    {
      name: 'واتساب',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      ),
      color: 'bg-[#25D366] hover:bg-[#1da851]',
      url: `https://wa.me/?text=${encodedText}%20${encodedUrl}`
    },
    {
      name: 'تويتر / X',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      color: 'bg-black hover:bg-gray-800',
      url: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`
    },
    {
      name: 'فيسبوك',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
      color: 'bg-[#1877F2] hover:bg-[#0d65d9]',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`
    },
    {
      name: 'انستجرام',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.757-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
        </svg>
      ),
      color: 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90',
      url: null,
      action: 'copy'
    },
    {
      name: 'تيك توك',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
      ),
      color: 'bg-black hover:bg-gray-800',
      url: null,
      action: 'copy'
    },
    {
      name: 'تيليجرام',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
      color: 'bg-[#0088cc] hover:bg-[#0077b5]',
      url: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    },
    {
      name: 'لينكدإن',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      ),
      color: 'bg-[#0A66C2] hover:bg-[#004182]',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    }
  ];

  const [copied, setCopied] = useState(false);

  const handleShare = (platform: typeof socialPlatforms[0]) => {
    if (platform.action === 'copy' || !platform.url) {
      const fullText = `${shareText} ${shareUrl}`;
      navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      window.open(platform.url, '_blank', 'width=600,height=400');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#003366]">مشاركة كود السفير</h3>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">اختر المنصة المفضلة لديك</p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-4 gap-4">
            {socialPlatforms.map((platform, idx) => (
              <button
                key={idx}
                onClick={() => handleShare(platform)}
                className="flex flex-col items-center gap-2 group"
              >
                <div className={`w-14 h-14 rounded-2xl ${platform.color} text-white flex items-center justify-center transform transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg`}>
                  {platform.icon}
                </div>
                <span className="text-xs text-slate-600 font-medium">{platform.name}</span>
              </button>
            ))}
          </div>

          {copied && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-green-700 font-medium text-sm">تم نسخ الرابط! الصقه في المنصة</p>
            </div>
          )}

          <div className="mt-6 bg-gradient-to-l from-[#003366]/5 to-[#D4AF37]/10 rounded-xl p-4">
            <p className="text-center text-sm text-slate-600 mb-2">أو انسخ الرابط</p>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={shareUrl}
                readOnly
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-[#003366] font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-2 bg-[#003366] text-white rounded-lg hover:bg-[#002244] transition"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type ReferralData = {
  id: string;
  status: string;
  created_at: string;
  referred_name: string;
  collapse_reason?: string;
  collapsed_at?: string;
  floor_number: number;
  risk_score?: number;
  risk_level?: string;
  triggered_rules?: any[];
  ai_explanation?: string;
};

function InfoGuideStrip({ code, requirements, pendingListingCount }: { 
  code: string; 
  requirements?: { require_first_listing: boolean; require_email_verified: boolean };
  pendingListingCount?: number;
}) {
  const [activeModal, setActiveModal] = useState<'about' | 'howto' | 'rewards' | 'terms' | null>(null);

  const guides = [
    { id: 'about' as const, icon: Building2, label: 'ما هو البرنامج؟', color: 'from-violet-500 to-purple-600' },
    { id: 'howto' as const, icon: Share2, label: 'كيف أشارك؟', color: 'from-cyan-500 to-blue-600' },
    { id: 'rewards' as const, icon: Gift, label: 'المكافآت', color: 'from-amber-500 to-orange-600' },
    { id: 'terms' as const, icon: FileText, label: 'الشروط', color: 'from-slate-500 to-slate-600' }
  ];

  const modalContent = {
    about: {
      title: 'برنامج سفراء البيت',
      content: (
        <div className="space-y-3 text-right">
          <p className="text-slate-300">برنامج <strong className="text-[#D4AF37]">سفراء البيت</strong> فرصتك لتحقيق دخل إضافي.</p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>✓ احصل على باقات مجانية</li>
            <li>✓ اجمع أموالاً في محفظتك</li>
            <li>✓ كل تسجيل = طابق جديد 🏢</li>
          </ul>
        </div>
      )
    },
    howto: {
      title: 'كيف تشارك وتكسب؟',
      content: (
        <div className="space-y-3 text-right">
          <div className="bg-slate-700/50 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-400 mb-1">كودك</p>
            <p className="text-xl font-black text-[#D4AF37] tracking-widest font-mono">{code}</p>
          </div>
          <div className="space-y-2 text-sm text-slate-400">
            <p>1️⃣ انسخ الكود</p>
            <p>2️⃣ شارك مع أصدقائك</p>
            <p>3️⃣ احصد المكافآت!</p>
          </div>
        </div>
      )
    },
    rewards: {
      title: 'نظام المكافآت',
      content: (
        <div className="space-y-3 text-right">
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="bg-slate-700/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-white">1</p>
              <p className="text-xs text-slate-400">تسجيل = طابق</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-[#D4AF37]">20</p>
              <p className="text-xs text-slate-400">طابق = مبنى</p>
            </div>
          </div>
          <p className="text-sm text-emerald-400 text-center">💰 كل 5 مباني = $1</p>
        </div>
      )
    },
    terms: {
      title: 'الشروط والأحكام',
      content: (
        <div className="space-y-4 text-right">
          {(requirements?.require_first_listing || requirements?.require_email_verified) && (
            <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-3">
              <p className="text-sm font-bold text-emerald-400 mb-2">✅ شروط احتساب الإحالة:</p>
              <ul className="space-y-1 text-xs text-emerald-300/80">
                {requirements?.require_email_verified && (
                  <li>• يجب على المُحال تأكيد بريده الإلكتروني</li>
                )}
                {requirements?.require_first_listing && (
                  <li>• يجب على المُحال إضافة أول إعلان عقاري</li>
                )}
              </ul>
              {typeof pendingListingCount === 'number' && pendingListingCount > 0 && (
                <p className="text-xs text-amber-400 mt-2">
                  ⏳ لديك {pendingListingCount} إحالة بانتظار إضافة أول إعلان
                </p>
              )}
            </div>
          )}
          <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3">
            <p className="text-sm font-bold text-amber-400 mb-2">⚠️ متطلبات السحب المالي:</p>
            <ul className="space-y-1 text-xs text-amber-300/80">
              <li>• يجب توفر حساب بنكي مقبول ومُوثّق</li>
              <li>• الحد الأدنى للسحب: $1 (5 مباني مكتملة)</li>
            </ul>
          </div>
          <div className="bg-blue-500/20 border border-blue-500/40 rounded-xl p-3">
            <p className="text-sm font-bold text-blue-400 mb-2">🔄 في حال تعثر التحويل:</p>
            <p className="text-xs text-blue-300/80">يتم تحويل المبلغ تلقائياً إلى اشتراك مجاني في باقات المنصة بقيمة معادلة.</p>
          </div>
          <div className="bg-slate-700/50 rounded-xl p-3">
            <p className="text-sm font-bold text-slate-300 mb-2">📋 شروط عامة:</p>
            <ul className="space-y-1 text-xs text-slate-400">
              <li>• التسجيلات الوهمية تؤدي لانهيار الطوابق</li>
              <li>• الطوابق المنهارة لا تُحتسب في المكافآت</li>
              <li>• يحق للإدارة مراجعة أي طلب سحب</li>
            </ul>
          </div>
        </div>
      )
    }
  };

  return (
    <>
      <div className="flex justify-center gap-3">
        {guides.map((guide) => (
          <button
            key={guide.id}
            onClick={() => setActiveModal(guide.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 border border-[#D4AF37]/30 hover:border-[#D4AF37]/60 hover:shadow-md transition-all text-sm"
          >
            <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${guide.color} flex items-center justify-center`}>
              <guide.icon className="w-4 h-4 text-white" />
            </span>
            <span className="text-[#003366] hidden sm:inline">{guide.label}</span>
          </button>
        ))}
      </div>

      {activeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-slate-800 rounded-2xl max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-white">{modalContent[activeModal].title}</h3>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-lg hover:bg-slate-700">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-4">{modalContent[activeModal].content}</div>
            <div className="p-4 border-t border-slate-700">
              <button onClick={() => setActiveModal(null)} className="w-full py-2 bg-[#D4AF37] text-slate-900 rounded-xl font-bold hover:bg-[#C5A028] transition">
                فهمت!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SimpleWalletCard({ 
  amount, 
  buildings, 
  onWithdraw 
}: { 
  amount: number; 
  buildings: number; 
  onWithdraw: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 border border-[#D4AF37]/30 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center">
          <DollarSign className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-lg font-bold text-[#003366]">${amount.toFixed(2)}</p>
          <p className="text-[10px] text-[#5a4a2a]">{buildings} مبنى مكتمل</p>
        </div>
      </div>
      {amount >= 1 && (
        <button
          onClick={onWithdraw}
          className="text-xs text-emerald-600 hover:text-emerald-500 font-medium flex items-center gap-1 transition"
        >
          <Wallet className="w-3 h-3" />
          سحب
        </button>
      )}
    </div>
  );
}

function AmbassadorCodeCard({ 
  code, 
  onCopy, 
  onShare,
  termsAccepted,
  onActivate
}: { 
  code: string; 
  onCopy: () => void; 
  onShare: () => void;
  termsAccepted?: boolean | null;
  onActivate?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!termsAccepted) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  // إذا لم يوافق على الشروط، اعرض غطاء التفعيل
  if (termsAccepted === false) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-[#FDF6E3] to-[#F5E6C8] p-3 shadow border border-[#D4AF37]/30 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <p className="text-base font-bold text-slate-700">كودك الخاص</p>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Gift className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        
        {/* الكود مخفي */}
        <div className="text-center py-1 relative">
          <p className="text-2xl sm:text-3xl font-black text-slate-300 tracking-[0.2em] font-mono blur-sm select-none">
            XXXXXXXX
          </p>
        </div>
        
        {/* غطاء التفعيل */}
        <button
          onClick={onActivate}
          className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#B8860B] to-[#D4AF37] text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all animate-pulse"
        >
          <ShieldCheck className="w-5 h-5" />
          فعّل حسابك كسفير
        </button>
        <p className="text-center text-[10px] text-[#5a4a2a] mt-1.5">
          وافق على الشروط والأحكام لتفعيل كود السفير الخاص بك
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-[#FDF6E3] to-[#F5E6C8] p-3 shadow border border-[#D4AF37]/30">
      <div className="flex items-center justify-between mb-2">
        <p className="text-base font-bold text-slate-700">كودك الخاص</p>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <Gift className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      
      <div className="text-center py-1">
        <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-[0.2em] font-mono">{code || '---'}</p>
      </div>
      
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={handleCopy}
          className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 text-xs font-medium ${
            copied ? 'bg-green-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'
          }`}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'تم' : 'نسخ'}
        </button>
        <button
          onClick={onShare}
          className="flex-1 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition flex items-center justify-center gap-1.5 text-xs font-medium"
        >
          <Share2 className="w-3 h-3" />
          مشاركة
        </button>
      </div>
    </div>
  );
}

function RealisticBuilding({ 
  currentFloors, 
  maxFloors, 
  consumedFloors = 0,
  flaggedFloors = 0,
  referrals = [],
  onFloorClick,
  highlightedFloor,
  selectedBuilding = null,
  onClearSelection
}: { 
  currentFloors: number; 
  maxFloors: number;
  consumedFloors?: number;
  flaggedFloors?: number;
  referrals?: ReferralData[];
  onFloorClick?: (floor: ReferralData) => void;
  highlightedFloor?: number;
  selectedBuilding?: BuildingData | null;
  onClearSelection?: () => void;
}) {
  const [showCelebration, setShowCelebration] = useState(false);
  const isDetailMode = !!selectedBuilding;
  const floors = Array.from({ length: maxFloors }, (_, i) => i + 1);
  const isComplete = currentFloors >= maxFloors && !isDetailMode;
  const clampedFlagged = Math.min(flaggedFloors, currentFloors - consumedFloors);
  const validFloors = Math.max(0, currentFloors - clampedFlagged);
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    });
  };

  const getDetailFloorStyle = (floor: BuildingData['floors'][0]) => {
    if (floor.status === 'flagged') return {
      bg: 'bg-gradient-to-l from-red-400/60 to-red-500/60',
      border: 'border-red-600/70',
      text: 'text-white',
      label: 'منهار',
      labelBg: 'bg-red-800'
    };
    if (floor.status === 'suspicious') return {
      bg: 'bg-gradient-to-l from-amber-300/70 to-amber-400/70',
      border: 'border-amber-500/80',
      text: 'text-slate-900',
      label: 'غير سليم',
      labelBg: 'bg-amber-700'
    };
    if (floor.status === 'completed') return {
      bg: 'bg-gradient-to-l from-[#ECD9A9] to-[#D4B896]',
      border: 'border-[#8B4513]',
      text: 'text-slate-800',
      label: 'سليم',
      labelBg: 'bg-emerald-700'
    };
    return {
      bg: 'bg-slate-100/20',
      border: 'border-slate-400/20',
      text: 'text-slate-500',
      label: 'فارغ',
      labelBg: 'bg-slate-600'
    };
  };

  const getBuildingHeaderStatus = () => {
    if (!selectedBuilding) return null;
    if (selectedBuilding.flaggedCount > 0) return { color: 'from-red-700 to-red-800', icon: '🏚️', text: 'عمارة بها مشاكل' };
    if (selectedBuilding.suspiciousCount > 0) return { color: 'from-amber-600 to-orange-700', icon: '⚠️', text: 'تحتاج مراجعة' };
    if (selectedBuilding.totalFloors === 20) return { color: 'from-emerald-600 to-green-700', icon: '🏆', text: 'عمارة مكتملة' };
    return { color: 'from-[#003366] to-[#002244]', icon: '🏗️', text: 'قيد البناء' };
  };
  
  useEffect(() => {
    if (isComplete) {
      setShowCelebration(true);
    }
  }, [isComplete]);
  
  const getFlaggedFloorAbove = (floorNum: number): boolean => {
    return referrals.some(r => r.status === 'flagged_fraud' && r.floor_number > floorNum);
  };
  
  const getFloorData = (floorNum: number): ReferralData | undefined => {
    return referrals.find(r => r.floor_number === floorNum);
  };
  
  const starPositions = [
    { left: '8%', top: '15%' }, { left: '25%', top: '8%' }, { left: '45%', top: '12%' },
    { left: '68%', top: '6%' }, { left: '85%', top: '18%' }, { left: '12%', top: '35%' },
    { left: '78%', top: '28%' }, { left: '92%', top: '45%' }, { left: '5%', top: '55%' },
    { left: '35%', top: '22%' }, { left: '55%', top: '32%' }, { left: '72%', top: '48%' }
  ];
  
  return (
    <div className="relative py-5 px-3">
      <div className={`absolute inset-0 rounded-2xl overflow-hidden transition-all duration-1000 ${
        isComplete && showCelebration 
          ? 'bg-gradient-to-b from-[#1a2744] via-[#243356] to-[#0a1525]' 
          : 'bg-gradient-to-b from-[#0f1c2e] via-[#162942] to-[#0a1525]'
      }`}>
        {starPositions.map((pos, i) => (
          <div 
            key={i}
            className={`absolute rounded-full transition-all duration-500 ${
              isComplete && showCelebration 
                ? 'w-1 h-1 bg-[#D4AF37]' 
                : 'w-0.5 h-0.5 bg-white/60'
            }`}
            style={{ 
              left: pos.left, 
              top: pos.top, 
              animation: isComplete && showCelebration 
                ? `celebrateTwinkle ${1 + (i % 2)}s ease-in-out ${i * 0.2}s infinite` 
                : `twinkle ${2 + (i % 3)}s ease-in-out ${i * 0.2}s infinite`
            }}
          />
        ))}
        <div className={`absolute top-3 right-4 rounded-full transition-all duration-1000 ${
          isComplete && showCelebration 
            ? 'w-8 h-8 bg-gradient-to-br from-[#D4AF37] to-[#FFD700] blur-md animate-pulse' 
            : 'w-4 h-4 bg-gradient-to-br from-[#D4AF37]/40 to-transparent blur-sm'
        }`} />
        
        {isComplete && showCelebration && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-[#D4AF37]/10 to-transparent animate-pulse" />
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#D4AF37]/20 to-transparent" />
            {[...Array(8)].map((_, i) => (
              <div
                key={`firework-${i}`}
                className="absolute w-1 h-1 bg-[#D4AF37] rounded-full"
                style={{
                  left: `${15 + (i * 10)}%`,
                  top: `${10 + (i % 3) * 8}%`,
                  animation: `firework ${1.5 + (i % 3) * 0.5}s ease-out ${i * 0.3}s infinite`
                }}
              />
            ))}
          </>
        )}
      </div>
      
      
      {isDetailMode && selectedBuilding ? (
        <div className="relative z-10 mx-2">
          {/* رأس المبنى المختار */}
          <div className={`p-3 rounded-t-xl bg-gradient-to-r ${getBuildingHeaderStatus()?.color} relative`}>
            <button 
              onClick={onClearSelection}
              className="absolute top-2 left-2 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
            <div className="flex items-center gap-2 pr-1">
              <span className="text-xl">{getBuildingHeaderStatus()?.icon}</span>
              <div>
                <h3 className="text-sm font-bold text-white">العمارة {selectedBuilding.buildingNumber}</h3>
                <p className="text-white/80 text-[10px]">{getBuildingHeaderStatus()?.text} - {selectedBuilding.totalFloors}/20</p>
              </div>
            </div>
          </div>
          
          {/* طوابق المبنى المختار */}
          <div className="max-h-64 overflow-y-auto">
            <div className="flex flex-col-reverse">
              {selectedBuilding.floors.map((floor) => {
                const style = getDetailFloorStyle(floor);
                const isClickable = floor.referral && floor.status === 'flagged';
                
                return (
                  <div
                    key={floor.floorNumber}
                    onClick={() => isClickable && onFloorClick?.(floor.referral!)}
                    className={`
                      h-8 border-x border-b ${style.bg} ${style.border}
                      ${isClickable ? 'cursor-pointer hover:brightness-110' : ''}
                      relative flex items-center px-2 gap-2 transition-all
                    `}
                  >
                    <div className="w-5 h-5 bg-black/20 rounded flex items-center justify-center flex-shrink-0">
                      <span className={`font-bold text-[10px] ${style.text}`}>{floor.floorNumber}</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      {floor.referral ? (
                        <p className={`font-medium text-[10px] truncate ${style.text}`}>
                          {floor.referral.referred_name || 'مستخدم'}
                        </p>
                      ) : (
                        <p className="text-slate-400 text-[9px]">فارغ</p>
                      )}
                    </div>
                    
                    <div className={`px-1.5 py-0.5 rounded text-[7px] font-bold ${style.labelBg} text-white flex-shrink-0`}>
                      {style.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* زر الرجوع */}
          <div className="p-2 bg-[#0a1525] rounded-b-xl border-t border-slate-700/50">
            <button
              onClick={onClearSelection}
              className="w-full py-1.5 bg-[#D4AF37] hover:bg-[#B8860B] text-[#003366] rounded-lg text-xs font-bold transition"
            >
              ← رجوع للعمارة الرئيسية
            </button>
          </div>
        </div>
      ) : (
      <div className="relative mx-auto z-10" style={{ width: '120px' }}>
        <div className="relative mb-0.5">
          <div className="absolute left-1/2 -translate-x-1/2 -top-6 z-10">
            <div className="w-2 h-6 bg-gradient-to-b from-[#D4AF37] to-[#B8860B] rounded-t-full" />
            <div 
              className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#D4AF37]" 
              style={{ marginTop: '-10px', boxShadow: '0 0 12px #D4AF37, 0 0 20px rgba(212, 175, 55, 0.5)' }}
            />
          </div>
          
          <svg viewBox="0 0 120 36" className="w-full" style={{ marginBottom: '-2px' }}>
            <defs>
              <linearGradient id="roofGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="50%" stopColor="#1d4ed8" />
                <stop offset="100%" stopColor="#1e3a5f" />
              </linearGradient>
              <linearGradient id="domeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            <ellipse cx="60" cy="12" rx="22" ry="12" fill="url(#domeGradient)" stroke="#1e40af" strokeWidth="0.5"/>
            <path d="M8 36 L60 14 L112 36 Z" fill="url(#roofGradient)" stroke="#1e40af" strokeWidth="0.5"/>
            <rect x="8" y="34" width="104" height="3" fill="#1e3a5f" stroke="#1e40af" strokeWidth="0.3"/>
          </svg>
        </div>

        <div className="flex flex-col-reverse">
          {floors.map((floorNum) => {
              const isBuilt = floorNum <= currentFloors;
              const isConsumed = floorNum <= consumedFloors;
              const isNext = floorNum === currentFloors + 1;
              const floorData = getFloorData(floorNum);
              const isFlagged = floorData?.status === 'flagged_fraud';
              const isHighlighted = highlightedFloor === floorNum;
              const isClickable = isFlagged && floorData && onFloorClick;
              
              return (
                <div 
                  key={floorNum}
                  className={`relative transition-all duration-300 ${isBuilt ? '' : isNext ? '' : 'opacity-50'} ${isHighlighted ? 'z-20' : ''}`}
                >
                  {(() => {
                    const hasDamagedAbove = getFlaggedFloorAbove(floorNum);
                    const isAtRisk = hasDamagedAbove && isBuilt && !isFlagged && !isConsumed;
                    const completionGlow = isComplete && showCelebration && isBuilt && !isFlagged && !isConsumed;
                    
                    return (
                  <div 
                    onClick={() => isClickable && onFloorClick?.(floorData)}
                    className={`
                      h-6 border-x border-b relative overflow-hidden transition-all duration-500
                      ${isClickable ? 'cursor-pointer hover:scale-[1.03] hover:z-10' : ''}
                      ${isFlagged
                        ? 'bg-gradient-to-l from-red-500/80 via-red-600/70 to-red-500/80 border-red-700/90 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]'
                        : isAtRisk
                          ? 'bg-gradient-to-l from-amber-400/80 via-amber-500/70 to-amber-400/80 border-amber-600/90 animate-pulse shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]'
                          : isBuilt 
                            ? isConsumed
                              ? 'bg-gradient-to-l from-slate-500/90 via-slate-600/80 to-slate-500/90 border-slate-700/90 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]'
                              : completionGlow
                                ? 'bg-gradient-to-l from-[#FFE4B5] via-[#FFD700]/60 to-[#FFE4B5] border-[#D4AF37]/90 shadow-[0_0_12px_rgba(212,175,55,0.6),inset_0_2px_6px_rgba(255,215,0,0.3)]'
                                : 'bg-gradient-to-l from-[#F5E6C8] via-[#ECD9A9] to-[#F5E6C8] border-[#8B4513]/90 shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.1)]'
                            : isNext
                              ? 'border-2 border-emerald-400/90 bg-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.4),inset_0_0_6px_rgba(16,185,129,0.2)]'
                              : 'bg-slate-200/15 border-slate-400/25 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]'
                      }
                      ${isHighlighted && isFlagged ? 'animate-shake animate-collapse ring-2 ring-red-600 ring-offset-2 shadow-[0_0_20px_rgba(239,68,68,0.8)]' : ''}
                    `}
                    style={
                      completionGlow 
                        ? { boxShadow: '0 0 16px rgba(212, 175, 55, 0.6), inset 0 2px 8px rgba(255, 215, 0, 0.4)', animation: 'completionPulse 2s ease-in-out infinite' } 
                        : isNext 
                          ? { boxShadow: '0 0 16px rgba(16, 185, 129, 0.6), inset 0 0 10px rgba(16, 185, 129, 0.3)', animation: 'glow 1.5s ease-in-out infinite' } 
                          : isBuilt && !isFlagged && !isConsumed
                            ? { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }
                            : undefined
                    }
                  >
                    {isFlagged && (
                      <>
                        <div className="absolute inset-0 opacity-50" style={{
                          backgroundImage: `
                            repeating-linear-gradient(135deg, 
                              transparent 0px, 
                              transparent 3px, 
                              rgba(0,0,0,0.15) 3px, 
                              rgba(0,0,0,0.15) 6px
                            ),
                            repeating-linear-gradient(45deg, 
                              transparent 0px, 
                              transparent 3px, 
                              rgba(0,0,0,0.1) 3px, 
                              rgba(0,0,0,0.1) 6px
                            )
                          `,
                          backgroundSize: '12px 12px'
                        }} />
                        <div className="absolute top-0 left-1/4 w-1 h-full bg-red-900/60 transform rotate-12 shadow-[2px_0_4px_rgba(0,0,0,0.5)]" />
                        <div className="absolute top-0 right-1/3 w-1 h-full bg-red-900/50 transform -rotate-6 shadow-[-2px_0_4px_rgba(0,0,0,0.5)]" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 bg-red-900/70 transform rotate-45" />
                        {isHighlighted && (
                          <div className="absolute inset-0 bg-red-600/40 animate-pulse ring-2 ring-red-400/50" />
                        )}
                      </>
                    )}
                    
                    <div className="absolute inset-0 flex items-center justify-around px-0.5">
                      {[1, 2, 3].map((windowNum) => {
                        const hasDamagedAbove = getFlaggedFloorAbove(floorNum);
                        const windowLit = isComplete && showCelebration && isBuilt && !isFlagged && !isConsumed;
                        return (
                          <div 
                            key={windowNum}
                            className={`
                              w-3 h-3.5 rounded-t-md border transition-all duration-500 relative
                              ${isFlagged
                                ? 'bg-gradient-to-b from-red-300/40 to-red-400/30 border-red-700/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]'
                                : hasDamagedAbove && isBuilt && !isConsumed
                                  ? 'bg-gradient-to-b from-amber-400/90 to-amber-600/80 border-amber-700/90 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.6),inset_0_1px_2px_rgba(255,255,255,0.3)]'
                                  : isBuilt 
                                    ? isConsumed
                                      ? 'bg-gradient-to-b from-slate-400/80 to-slate-600/70 border-slate-700/90 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]'
                                      : windowLit
                                        ? 'bg-gradient-to-b from-[#FFD700] via-[#FFA500] to-[#FF8C00] border-[#D4AF37]/90 shadow-[0_0_12px_rgba(255,215,0,0.9),0_0_20px_rgba(255,165,0,0.6),inset_0_2px_4px_rgba(255,255,255,0.4)]'
                                        : 'bg-gradient-to-b from-[#A8D8F0] via-[#87CEEB] to-[#4682B4] border-[#8B4513]/90 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-1px_2px_rgba(0,0,0,0.2)]'
                                    : isNext
                                      ? 'bg-emerald-400/30 border-emerald-500/70 shadow-[0_0_4px_rgba(16,185,129,0.5)]'
                                      : 'bg-white/8 border-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]'
                              }
                            `}
                            style={windowLit ? { animation: `windowGlow ${1.5 + (windowNum * 0.3)}s ease-in-out infinite` } : undefined}
                          >
                            {!isFlagged && isBuilt && !isConsumed && !windowLit && (
                              <div className="absolute top-0.5 left-0.5 w-1 h-1 bg-white/60 rounded-full" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className={`
                      absolute right-0.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-bold
                      ${isFlagged
                        ? 'bg-red-600 text-white'
                        : isBuilt 
                          ? isConsumed
                            ? 'bg-slate-500 text-white'
                            : 'bg-[#D4AF37] text-white'
                          : isNext
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white/30 text-white/70'
                      }
                    `}
                    style={isNext ? { boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)' } : undefined}
                    >
                      {floorNum}
                    </div>

                    {isFlagged && (
                      <div className="absolute left-0.5 top-1/2 -translate-y-1/2">
                        <X className="w-2.5 h-2.5 text-red-700" />
                      </div>
                    )}
                    
                    {isBuilt && !isConsumed && !isFlagged && (
                      <div className="absolute left-0.5 top-1/2 -translate-y-1/2">
                        <User className="w-2.5 h-2.5 text-[#003366]" />
                      </div>
                    )}
                    
                    {isConsumed && (
                      <div className="absolute left-0.5 top-1/2 -translate-y-1/2">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                      </div>
                    )}
                    
                    {isNext && (
                      <div className="absolute left-0.5 top-1/2 -translate-y-1/2">
                        <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                      </div>
                    )}
                  </div>
                  );
                })()}
                </div>
              );
            })}
        </div>
        
        <div className="h-10 bg-gradient-to-b from-[#654321] to-[#3d2e22] border border-[#2d2117] rounded-b-lg flex items-center justify-center">
          <div className="w-6 h-8 bg-gradient-to-b from-[#8B4513] to-[#654321] rounded-t-lg border border-[#2d2117] relative">
            <div className="absolute top-1.5 right-0.5 w-1 h-1 rounded-full bg-[#D4AF37]" />
          </div>
        </div>
        
        <div className="flex justify-center gap-3 mt-0.5">
          {[1, 2, 3].map((step) => (
            <div key={step} className="w-5 h-1 bg-slate-500 rounded-b" style={{ marginTop: `${step}px` }} />
          ))}
        </div>
        
        <div className="mt-3 text-center">
          <p className="text-[9px] text-white/70 font-medium mb-2">🏗️ سلامة المبنى</p>
          <div className="flex flex-wrap justify-center gap-1.5 text-[8px]">
            <div className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded-full">
              <div className="w-2 h-2 bg-[#D4B896] rounded border border-[#8B4513]" />
              <span className="text-[#003366]">مبني ({Math.max(0, validFloors - consumedFloors)})</span>
            </div>
            <div className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded-full">
              <div className="w-2 h-2 bg-slate-400 rounded border border-slate-500" />
              <span className="text-slate-600">مستهلك ({consumedFloors})</span>
            </div>
            {clampedFlagged > 0 && (
              <div className="flex items-center gap-1 bg-red-50/90 px-1.5 py-0.5 rounded-full border border-red-200">
                <div className="w-2 h-2 bg-red-400/70 rounded border border-red-600/60" />
                <span className="text-red-700">غير سليم ({clampedFlagged})</span>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
      
      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes celebrateTwinkle {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        @keyframes firework {
          0% { transform: scale(0); opacity: 0; }
          20% { transform: scale(1.5); opacity: 1; }
          40% { transform: scale(2); opacity: 0.8; }
          60% { transform: scale(2.5); opacity: 0.5; }
          80% { transform: scale(3); opacity: 0.2; }
          100% { transform: scale(4); opacity: 0; }
        }
        @keyframes windowGlow {
          0%, 100% { box-shadow: 0 0 4px rgba(255,215,0,0.4); }
          50% { box-shadow: 0 0 12px rgba(255,215,0,0.9), 0 0 20px rgba(255,165,0,0.5); }
        }
        @keyframes completionPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(212, 175, 55, 0.3); }
          50% { box-shadow: 0 0 16px rgba(212, 175, 55, 0.6), 0 0 24px rgba(255, 215, 0, 0.3); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.5), inset 0 0 8px rgba(16, 185, 129, 0.2); }
          50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.8), inset 0 0 12px rgba(16, 185, 129, 0.4); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        @keyframes collapse {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          20% { transform: translateY(-3px) rotate(-2deg); }
          40% { transform: translateY(2px) rotate(3deg); }
          60% { transform: translateY(-1px) rotate(-1deg); }
          80% { transform: translateY(4px) rotate(2deg); opacity: 0.8; }
          100% { transform: translateY(0) rotate(0deg); opacity: 1; }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        .animate-collapse {
          animation: collapse 0.8s ease-in-out;
        }
      `}</style>
    </div>
  );
}

function CollapsedFloorModal({
  isOpen,
  onClose,
  floor,
  onRemove,
  removing
}: {
  isOpen: boolean;
  onClose: () => void;
  floor: ReferralData | null;
  onRemove: (id: string) => void;
  removing: boolean;
}) {
  if (!isOpen || !floor) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-300 overflow-hidden border-2 border-red-200/50">
        {/* Header with enhanced design */}
        <div className="relative p-5 bg-gradient-to-br from-red-600 via-red-700 to-red-800 rounded-t-3xl overflow-hidden">
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-full h-full" style={{
              backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)`
            }} />
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-lg border border-white/30">
                <Flag className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  طابق منهار
                </h3>
                <p className="text-white/80 text-xs mt-0.5">الطابق رقم {floor.floor_number}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/20 transition-all backdrop-blur-sm border border-white/20 hover:scale-110"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 bg-gradient-to-b from-white to-slate-50">
          {/* Enhanced collapse reason card */}
          <div className="relative bg-gradient-to-br from-red-50 to-red-100/50 rounded-2xl p-4 border-2 border-red-200 shadow-lg overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-red-200/30 rounded-full -mr-10 -mt-10 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg border-2 border-white/50">
                <X className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-900 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  سبب الانهيار:
                </p>
                <p className="text-sm text-red-800 leading-relaxed font-medium">
                  {floor.collapse_reason || 'تم رصد نشاط غير سليم في هذه الإحالة'}
                </p>
              </div>
            </div>
          </div>

          {/* Enhanced info cards */}
          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
              <span className="text-slate-600 font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                اسم المُحال:
              </span>
              <span className="font-bold text-slate-800 text-sm">{floor.referred_name}</span>
            </div>
            <div className="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
              <span className="text-slate-600 font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                تاريخ التسجيل:
              </span>
              <span className="font-medium text-slate-800 text-sm">{formatDate(floor.created_at)}</span>
            </div>
            {floor.collapsed_at && (
              <div className="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-red-50 to-red-100/30 rounded-xl border-2 border-red-200 shadow-sm">
                <span className="text-red-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  تاريخ الانهيار:
                </span>
                <span className="font-bold text-red-700 text-sm">{formatDate(floor.collapsed_at)}</span>
              </div>
            )}
          </div>

          {/* Enhanced warning note */}
          <div className="relative bg-gradient-to-br from-amber-50 via-yellow-50/50 to-amber-50 rounded-2xl p-4 border-2 border-amber-300 shadow-lg overflow-hidden">
            <div className="absolute top-0 left-0 w-16 h-16 bg-amber-200/40 rounded-full -ml-8 -mt-8 blur-xl" />
            <div className="relative flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                  <strong className="text-amber-950">ملاحظة مهمة:</strong> إزالة هذا الطابق ستفسح المجال لبناء طابق جديد صالح بدلاً منه. هذا الإجراء لا يمكن التراجع عنه.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced action buttons */}
        <div className="p-5 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200 rounded-b-3xl flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 hover:border-slate-400 transition-all font-bold text-sm shadow-sm hover:shadow-md"
          >
            إغلاق
          </button>
          <button
            onClick={() => onRemove(floor.id)}
            disabled={removing}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 via-red-700 to-red-600 text-white rounded-xl hover:from-red-700 hover:via-red-800 hover:to-red-700 transition-all font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:shadow-sm"
          >
            {removing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                جاري الإزالة...
              </>
            ) : (
              <>
                <X className="w-5 h-5" />
                إزالة الطابق
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function BuildingFloorsModal({
  isOpen,
  onClose,
  building,
  onFloorClick
}: {
  isOpen: boolean;
  onClose: () => void;
  building: BuildingData | null;
  onFloorClick?: (floor: ReferralData) => void;
}) {
  if (!isOpen || !building) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    });
  };

  const getFloorStyle = (floor: BuildingData['floors'][0]) => {
    if (floor.status === 'flagged') return {
      bg: 'bg-gradient-to-r from-red-600/90 to-red-700/90',
      border: 'border-red-500',
      text: 'text-white',
      label: 'بناء منهار',
      labelBg: 'bg-red-800'
    };
    if (floor.status === 'suspicious') return {
      bg: 'bg-gradient-to-r from-amber-600/90 to-orange-600/90',
      border: 'border-amber-500',
      text: 'text-white',
      label: 'بناء غير سليم',
      labelBg: 'bg-amber-800'
    };
    if (floor.status === 'completed') return {
      bg: 'bg-gradient-to-r from-emerald-600/90 to-green-600/90',
      border: 'border-emerald-500',
      text: 'text-white',
      label: 'بناء سليم',
      labelBg: 'bg-emerald-800'
    };
    return {
      bg: 'bg-slate-800/60',
      border: 'border-slate-600/50',
      text: 'text-slate-500',
      label: 'طابق فارغ',
      labelBg: 'bg-slate-700'
    };
  };

  const getBuildingStatus = () => {
    if (building.flaggedCount > 0) return { color: 'from-red-700 to-red-800', icon: '🏚️', text: 'عمارة بها مشاكل' };
    if (building.suspiciousCount > 0) return { color: 'from-amber-600 to-orange-700', icon: '⚠️', text: 'عمارة تحتاج مراجعة' };
    if (building.totalFloors === 20) return { color: 'from-emerald-600 to-green-700', icon: '🏆', text: 'عمارة مكتملة' };
    return { color: 'from-slate-700 to-slate-800', icon: '🏗️', text: 'عمارة قيد البناء' };
  };

  const buildingStatus = getBuildingStatus();
  const floorsReversed = [...building.floors].reverse();

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300 border border-slate-700/50 max-h-[90vh] overflow-hidden flex flex-col">
        {/* سطح العمارة */}
        <div className={`p-4 bg-gradient-to-r ${buildingStatus.color} rounded-t-3xl relative overflow-hidden`}>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-2 left-1/4 w-8 h-8 bg-white/20 rounded-full" />
            <div className="absolute top-4 right-1/3 w-4 h-4 bg-white/10 rounded-full" />
          </div>
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{buildingStatus.icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">العمارة رقم {building.buildingNumber}</h3>
                <p className="text-white/80 text-sm">{buildingStatus.text}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="flex gap-4 mt-3 text-sm">
            <span className="bg-white/20 px-3 py-1 rounded-full text-white">
              {building.totalFloors}/20 طابق
            </span>
            {building.flaggedCount > 0 && (
              <span className="bg-red-500/50 px-3 py-1 rounded-full text-white">
                {building.flaggedCount} منهار
              </span>
            )}
            {building.suspiciousCount > 0 && (
              <span className="bg-amber-500/50 px-3 py-1 rounded-full text-white">
                {building.suspiciousCount} غير سليم
              </span>
            )}
          </div>
        </div>

        {/* جسم العمارة - الطوابق */}
        <div className="flex-1 overflow-y-auto p-3 bg-gradient-to-b from-slate-800/50 to-slate-900/50">
          <div className="relative">
            {/* خط العمارة الجانبي */}
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-slate-600 to-slate-700 rounded-full" />
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-slate-600 to-slate-700 rounded-full" />
            
            <div className="space-y-1 px-2">
              {floorsReversed.map((floor) => {
                const style = getFloorStyle(floor);
                const isClickable = floor.referral && floor.status === 'flagged';
                
                return (
                  <div
                    key={floor.floorNumber}
                    onClick={() => isClickable && onFloorClick?.(floor.referral!)}
                    className={`
                      relative rounded-lg border-2 ${style.bg} ${style.border}
                      ${isClickable ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg' : ''}
                      transition-all duration-200
                    `}
                  >
                    <div className="flex items-center gap-3 p-2.5">
                      {/* رقم الطابق */}
                      <div className="w-10 h-10 bg-black/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className={`font-bold text-lg ${style.text}`}>{floor.floorNumber}</span>
                      </div>
                      
                      {/* معلومات الساكن */}
                      <div className="flex-1 min-w-0">
                        {floor.referral ? (
                          <>
                            <p className={`font-medium truncate ${style.text}`}>
                              {floor.referral.referred_name || 'مستخدم'}
                            </p>
                            <p className="text-white/50 text-xs">
                              {formatDate(floor.referral.created_at)}
                            </p>
                          </>
                        ) : (
                          <p className="text-slate-500 text-sm">لا يوجد ساكن</p>
                        )}
                      </div>
                      
                      {/* حالة الطابق */}
                      <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${style.labelBg} text-white flex-shrink-0`}>
                        {style.label}
                      </div>
                    </div>
                    
                    {/* تفاصيل إضافية للطوابق غير السليمة */}
                    {(floor.status === 'flagged' || floor.status === 'suspicious') && floor.referral && (
                      <div className="px-3 pb-2.5 pt-0">
                        <div className="bg-black/20 rounded-lg p-2 text-xs">
                          {floor.referral.collapse_reason ? (
                            <p className="text-white/80">{floor.referral.collapse_reason}</p>
                          ) : floor.referral.triggered_rules && floor.referral.triggered_rules.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {floor.referral.triggered_rules.slice(0, 2).map((rule: any, idx: number) => (
                                <span key={idx} className="bg-white/10 text-white/70 px-2 py-0.5 rounded">
                                  {rule.detail || rule.factor}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-white/60">تم رصد نشاط غير طبيعي</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* قاعدة العمارة */}
        <div className="p-3 bg-gradient-to-t from-slate-950 to-slate-900 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-gradient-to-r from-emerald-600 to-green-600" />
                <span className="text-slate-400">سليم</span>
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-gradient-to-r from-amber-600 to-orange-600" />
                <span className="text-slate-400">غير سليم</span>
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-gradient-to-r from-red-600 to-red-700" />
                <span className="text-slate-400">منهار</span>
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RewardActionModal({
  isOpen,
  onClose,
  stats,
  onRequestReward,
  requesting,
  requestSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  stats: AmbassadorStats;
  onRequestReward: () => void;
  requesting: boolean;
  requestSuccess: boolean;
}) {
  if (!isOpen) return null;

  const availableFloors = stats.current_floors - (stats.consumptions?.reduce((sum, c) => sum + (c.floors_consumed || 0), 0) || 0);
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="p-6 bg-gradient-to-l from-[#003366] to-[#002244] rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Gift className="w-6 h-6 text-[#D4AF37]" />
              إدارة المكافآت
            </h3>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 rounded-xl p-4 text-center">
              <Building2 className="w-6 h-6 text-[#D4AF37] mx-auto mb-2" />
              <p className="text-2xl font-bold text-[#003366]">{stats.current_floors}</p>
              <p className="text-xs text-slate-600">إجمالي المبني</p>
            </div>
            <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl p-4 text-center">
              <Zap className="w-6 h-6 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-green-600">{availableFloors}</p>
              <p className="text-xs text-slate-600">متاح للاستخدام</p>
            </div>
            <div className="bg-gradient-to-br from-slate-500/10 to-slate-500/5 rounded-xl p-4 text-center">
              <Check className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-600">{stats.current_floors - availableFloors}</p>
              <p className="text-xs text-slate-600">تم استهلاكه</p>
            </div>
          </div>

          {requestSuccess ? (
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-8 text-center animate-pulse">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-12 h-12 text-white" />
              </div>
              <h4 className="text-2xl font-bold text-white mb-2">تم إرسال طلبك بنجاح!</h4>
              <p className="text-white/90">
                سيقوم فريق الإدارة بمراجعة طلبك والرد عليك قريباً
              </p>
              <div className="mt-4 bg-white/20 rounded-lg p-3">
                <p className="text-white text-sm">📩 طلبك الآن في انتظار الموافقة</p>
              </div>
            </div>
          ) : stats.available_reward ? (
            <div className="bg-gradient-to-l from-[#D4AF37]/20 to-[#B8860B]/10 border-2 border-[#D4AF37] rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center">
                  <Flag className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-[#003366]">مكافأة متاحة لك!</h4>
                  <p className="text-sm text-slate-600">
                    {stats.available_reward.plan_name} - {stats.available_reward.plan_months} شهر
                  </p>
                </div>
              </div>

              {stats.pending_request ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <Clock className="w-6 h-6 text-amber-600 mx-auto mb-2" />
                  <p className="text-amber-700 font-bold">طلبك قيد المراجعة</p>
                  <p className="text-amber-600 text-sm mt-1">سيتم التواصل معك قريباً</p>
                </div>
              ) : (
                <button
                  onClick={() => onRequestReward()}
                  disabled={requesting}
                  className="w-full py-4 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-bold cursor-pointer hover:shadow-xl hover:scale-[1.03] hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg active:scale-95 active:brightness-90 focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/50"
                >
                  {requesting ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Gift className="w-6 h-6" />
                      اطلب هديتك: {stats.available_reward.plan_name} ({stats.available_reward.plan_months} شهر)
                    </>
                  )}
                </button>
              )}
            </div>
          ) : null}

          {!stats.available_reward && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
              <Building className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="font-bold text-[#003366] mb-2">استمر في البناء!</h4>
              <p className="text-sm text-slate-600">
                أكمل {stats.rewards_config?.[0]?.floors - stats.current_floors} طابق إضافي للحصول على أول مكافأة
              </p>
            </div>
          )}

          {stats.consumptions && stats.consumptions.length > 0 && (
            <div>
              <h4 className="font-bold text-[#003366] mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#D4AF37]" />
                سجل الاستهلاك
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {stats.consumptions.map((consumption, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-slate-700">{consumption.plan_name}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {consumption.floors_consumed} طابق
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const defaultShareTextConfig: ShareTextConfig = {
  main_title: "🏠 انضم لعالم العقارات مع بيت الجزيرة!",
  code_line: "✨ استخدم كود السفير: {CODE}",
  benefit_line: "🎁 احصل على مميزات حصرية",
  cta_line: "سجل الآن:"
};

export default function ReferralPage() {
  const router = useRouter();
  const { user, isAuthenticated, isHydrated, checkAuth, checkOAuthStatus, isLoading } = useAuthStore();
  const [stats, setStats] = useState<AmbassadorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [consuming, setConsuming] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<'full' | 'custom'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [showAddBuildingModal, setShowAddBuildingModal] = useState(false);
  const [systemEnabled, setSystemEnabled] = useState<boolean | null>(null);
  const [addBuildingNote, setAddBuildingNote] = useState('');
  const [submittingBuilding, setSubmittingBuilding] = useState(false);
  const [selectedTier, setSelectedTier] = useState<{floors: number, plan_tier?: string, plan_name: string, plan_months: number} | null>(null);
  const [shareTextConfig, setShareTextConfig] = useState<ShareTextConfig>(defaultShareTextConfig);
  const [authChecked, setAuthChecked] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [walletData, setWalletData] = useState<{
    wallet: { balance_cents: number; total_buildings_completed: number; total_earned_cents: number; total_withdrawn_cents: number } | null;
    settings: { buildings_per_dollar: number; min_withdrawal_cents: number; financial_rewards_enabled: boolean };
    pending_withdrawal: { id: string; amount_cents: number; status: string } | null;
  } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  
  const [showCollapsedModal, setShowCollapsedModal] = useState(false);
  const [selectedCollapsedFloor, setSelectedCollapsedFloor] = useState<ReferralData | null>(null);
  const [removingFloor, setRemovingFloor] = useState(false);
  const [highlightedFloor, setHighlightedFloor] = useState<number | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingData | null>(null);
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsCheckbox, setTermsCheckbox] = useState(false);
  const [acceptingTerms, setAcceptingTerms] = useState(false);
  const [showTestTools, setShowTestTools] = useState(true); // Toggle for test tools
  const [testToolsLoading, setTestToolsLoading] = useState(false);

  useEffect(() => {
    async function verifyAuth() {
      await checkAuth();
      if (!useAuthStore.getState().isAuthenticated) {
        await checkOAuthStatus();
      }
      setAuthChecked(true);
    }
    verifyAuth();
  }, [checkAuth, checkOAuthStatus]);

  useEffect(() => {
    if (authChecked && !isLoading && !isAuthenticated) {
      router.push("/login?redirect=/referral");
    }
  }, [authChecked, isLoading, isAuthenticated, router]);

  useEffect(() => {
    async function checkSystemStatus() {
      try {
        const res = await fetch('/api/ambassador/status');
        if (res.ok) {
          const data = await res.json();
          setSystemEnabled(data.enabled);
        }
      } catch (err) {
        console.error('Error checking ambassador status:', err);
      }
    }
    checkSystemStatus();
  }, []);

  useEffect(() => {
    if (isAuthenticated && systemEnabled) {
      fetchStats();
      fetchShareTextConfig();
      fetchWalletData();
      fetchTermsStatus();
    }
  }, [isAuthenticated, systemEnabled]);

  async function fetchTermsStatus() {
    try {
      const res = await fetch('/api/ambassador/terms-status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const accepted = data.terms_accepted;
        setTermsAccepted(accepted);
        
        // ✅ فتح Modal الشروط تلقائياً إذا لم يوافق المستخدم
        if (accepted === false) {
          setShowTermsModal(true);
        }
      } else {
        // إذا لم يوجد wallet بعد، يعني لم يوافق على الشروط
        setTermsAccepted(false);
        setShowTermsModal(true);
      }
    } catch (err) {
      console.error('Error fetching terms status:', err);
      // في حالة الخطأ، افترض أنه لم يوافق وافتح الـ modal
      setTermsAccepted(false);
      setShowTermsModal(true);
    }
  }

  async function acceptTerms() {
    if (!termsCheckbox) return;
    setAcceptingTerms(true);
    try {
      const res = await fetch('/api/ambassador/accept-terms', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setTermsAccepted(true);
        setShowTermsModal(false);
        
        // ✅ رسالة نجاح محسّنة
        setSuccessMessage('🎉 مبروك! تم تفعيل برنامج سفير البيت بنجاح');
        setTimeout(() => setSuccessMessage(null), 5000);
        
        // تحديث البيانات بعد القبول
        fetchStats();
        fetchWalletData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || 'فشل تفعيل الخدمة، حاول مرة أخرى');
      }
    } catch (err) {
      console.error('Error accepting terms:', err);
    } finally {
      setAcceptingTerms(false);
      setTermsCheckbox(false);
    }
  }

  async function fetchWalletData() {
    try {
      const res = await fetch('/api/ambassador/wallet', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setWalletData(data);
      }
    } catch (err) {
      console.error('Error fetching wallet data:', err);
    }
  }

  async function requestWithdrawal(amountInDollars?: number) {
    if (!walletData?.wallet || !walletData.settings.financial_rewards_enabled) return;
    
    const amountCents = amountInDollars 
      ? Math.round(amountInDollars * 100) 
      : walletData.wallet.balance_cents;
    
    setWithdrawing(true);
    try {
      const res = await fetch('/api/ambassador/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount_cents: amountCents,
          payment_method: 'bank_transfer'
        })
      });
      if (res.ok) {
        await fetchWalletData();
        setSuccessMessage(`تم تقديم طلب سحب $${(amountCents / 100).toFixed(2)} بنجاح!`);
        setWithdrawAmount('full');
        setCustomAmount('');
      } else {
        const err = await res.json();
        alert(err.error || 'حدث خطأ');
      }
    } catch (err) {
      alert('حدث خطأ في الاتصال');
    } finally {
      setWithdrawing(false);
    }
  }

  async function fetchShareTextConfig() {
    try {
      const res = await fetch('/api/ambassador/share-text');
      if (res.ok) {
        const data = await res.json();
        setShareTextConfig(data);
      }
    } catch (err) {
      console.error('Error fetching share text config:', err);
    }
  }

  async function fetchStats() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch('/api/ambassador/my-stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        const fallback = {
          ambassador_code: (user as any)?.ambassador_code || generateTempCode(),
          current_floors: 0,
          flagged_floors: 0,
          total_floors_earned: 0,
          max_floors: 20,
          rewards_config: [
            { floors: 5, plan_name: 'باقة الصفوة', plan_tier: 'elite', plan_months: 1 },
            { floors: 10, plan_name: 'باقة الصفوة', plan_tier: 'elite', plan_months: 2 },
            { floors: 15, plan_name: 'باقة التميز', plan_tier: 'premium', plan_months: 2 },
            { floors: 20, plan_name: 'باقة رجال الأعمال', plan_tier: 'business', plan_months: 2 },
          ],
          available_reward: null,
          can_consume: false,
          consumption_enabled: true,
          pending_request: null,
          referrals: [],
          consumptions: []
        };
        setStats(fallback as AmbassadorStats);
      }
    } catch (err) {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }

  function generateTempCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'AQR';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  const copyCode = () => {
    if (stats?.ambassador_code) {
      navigator.clipboard.writeText(stats.ambassador_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const requestReward = async () => {
    setRequesting(true);
    setRequestSuccess(false);
    try {
      const res = await fetch('/api/ambassador/request-reward', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        setRequestSuccess(true);
        await fetchStats();
        setTimeout(() => {
          setShowRewardModal(false);
          setSelectedTier(null);
          setRequestSuccess(false);
        }, 5000);
      } else {
        const data = await res.json();
        console.error('Request failed:', data);
        alert(data.error || 'حدث خطأ');
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ في الاتصال');
    } finally {
      setRequesting(false);
    }
  };

  const handleFloorClick = (floor: ReferralData) => {
    if (floor.status === 'flagged_fraud') {
      setSelectedCollapsedFloor(floor);
      setShowCollapsedModal(true);
    }
  };

  const handleRemoveCollapsedFloor = async (referralId: string) => {
    if (removingFloor) return;
    setRemovingFloor(true);
    setShowCollapsedModal(false);
    setSelectedCollapsedFloor(null);
    
    try {
      const res = await fetch(`/api/ambassador/floor/${referralId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        await fetchStats();
        setSuccessMessage('تم إزالة الطابق المنهار بنجاح! يمكنك الآن بناء طابق جديد 🎉');
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingFloor(false);
    }
  };

  const scrollToFlaggedFloor = () => {
    const firstFlagged = stats?.referrals?.find(r => r.status === 'flagged_fraud');
    if (firstFlagged) {
      setHighlightedFloor(firstFlagged.floor_number);
      setTimeout(() => setHighlightedFloor(undefined), 2000);
    }
  };

  const consumeReward = async () => {
    if (!stats?.can_consume) return;
    setConsuming(true);
    try {
      const res = await fetch('/api/ambassador/consume', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        await fetchStats();
        setShowRewardModal(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConsuming(false);
    }
  };

  const cancelRequest = async () => {
    try {
      const res = await fetch('/api/ambassador/cancel-request', {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        await fetchStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // [DEV ONLY] إضافة إحالات اختبارية
  const addTestReferrals = async (count: number) => {
    try {
      const res = await fetch('/api/ambassador/dev/add-test-referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count })
      });
      if (res.ok) {
        await fetchStats();
        await fetchWalletData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // [DEV ONLY] حذف الإحالات الاختبارية
  const clearTestReferrals = async () => {
    try {
      const res = await fetch('/api/ambassador/dev/clear-test-referrals', {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        await fetchStats();
        await fetchWalletData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isHydrated || loading || systemEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F5F1E8] via-[#FBF9F4] to-[#F5F1E8]">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }
  
  if (systemEnabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "radial-gradient(circle at top center, #fef8e6, #f7e8b7, #eadda4)" }}>
        <div className="text-center max-w-md mx-auto p-8 bg-white/80 rounded-3xl shadow-xl border border-[#D4AF37]/30">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#003366]/10 flex items-center justify-center">
            <Building2 className="w-10 h-10 text-[#003366]" />
          </div>
          <h1 className="text-2xl font-bold text-[#003366] mb-3">برنامج السفراء متوقف حالياً</h1>
          <p className="text-[#5a4a2a] mb-6">نعتذر، برنامج سفراء البيت غير متاح حالياً. يرجى المحاولة لاحقاً.</p>
          <button 
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (!authChecked || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "radial-gradient(circle at top center, #fef8e6, #f7e8b7, #eadda4)" }}>
        <div className="animate-spin w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // استخدام الحسابات الجديدة من الـ API
  const builtFloors = stats?.built_floors || stats?.current_floors || 0;
  const collapsedFloors = stats?.collapsed_floors || stats?.flagged_floors || 0;
  const healthyFloors = stats?.healthy_floors || (builtFloors - collapsedFloors);
  const floorsConsumed = stats?.floors_consumed ?? (stats?.consumptions?.reduce((sum: number, c: any) => sum + (c.floors_consumed || 0), 0) || 0);
  const availableFloors = stats?.available_floors || (healthyFloors - floorsConsumed);
  const maxFloors = stats?.max_floors || 20;
  
  // للتوافق مع الكود القديم
  const currentFloors = builtFloors;
  const consumedFloors = floorsConsumed;
  const flaggedFloors = collapsedFloors;
  
  // حساب الطوابق المتبقية للمكافأة التالية (بدلاً من maxFloors - builtFloors الذي يعطي أرقام سالبة)
  // المنطق: كم طابق يحتاج للوصول لأقرب عتبة مكافأة
  const rewardsConfig = stats?.rewards_config || [];
  const sortedThresholds = rewardsConfig.map((r: any) => r.floors).sort((a: number, b: number) => a - b);
  const nextThreshold = sortedThresholds.find((t: number) => t > availableFloors) || sortedThresholds[sortedThresholds.length - 1] || maxFloors;
  const remaining = availableFloors >= nextThreshold ? 0 : Math.max(0, nextThreshold - availableFloors);
  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/register?ref=${stats?.ambassador_code}` 
    : '';

  // بناء قائمة المباني من الإحالات
  const buildBuildingsData = (): BuildingData[] => {
    if (!stats?.referrals) return [];
    
    const referrals = stats.referrals as ReferralData[];
    const buildings: BuildingData[] = [];
    const floorsPerBuilding = maxFloors;
    const totalBuildings = Math.ceil(referrals.length / floorsPerBuilding);
    
    for (let b = 0; b < Math.max(totalBuildings, 1); b++) {
      const buildingFloors: BuildingData['floors'] = [];
      let flaggedCount = 0;
      let suspiciousCount = 0;
      let totalFloors = 0;
      
      for (let f = 1; f <= floorsPerBuilding; f++) {
        const referralIndex = b * floorsPerBuilding + (f - 1);
        const referral = referrals[referralIndex];
        
        let status: 'empty' | 'completed' | 'flagged' | 'suspicious' = 'empty';
        if (referral) {
          totalFloors++;
          if (referral.status === 'flagged_fraud') {
            status = 'flagged';
            flaggedCount++;
          } else if (referral.risk_level && ['critical', 'high', 'medium'].includes(referral.risk_level)) {
            status = 'suspicious';
            suspiciousCount++;
          } else {
            status = 'completed';
          }
        }
        
        buildingFloors.push({
          floorNumber: f,
          referral,
          status
        });
      }
      
      let buildingStatus: BuildingData['status'] = 'empty';
      if (flaggedCount > 0) buildingStatus = 'flagged';
      else if (totalFloors === floorsPerBuilding) buildingStatus = 'complete';
      else if (totalFloors > 0) buildingStatus = 'partial';
      
      buildings.push({
        buildingNumber: b + 1,
        floors: buildingFloors,
        status: buildingStatus,
        totalFloors,
        flaggedCount,
        suspiciousCount
      });
    }
    
    return buildings;
  };

  const buildingsData = buildBuildingsData();

  const handleBuildingClick = (building: BuildingData) => {
    setSelectedBuilding(building);
  };
  
  const clearSelectedBuilding = () => {
    setSelectedBuilding(null);
  };

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6" style={{ background: "radial-gradient(circle at top center, #fef8e6, #f7e8b7, #eadda4)" }} dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-[#D4AF37] via-[#F5D76E] to-[#B8860B] mb-4 sm:mb-6 shadow-[0_0_40px_rgba(212,175,55,0.4)] relative animate-pulse">
            <Building2 className="w-10 h-10 sm:w-14 sm:h-14 text-[#003366]" />
            <div className="absolute -top-1 -right-1 w-7 h-7 sm:w-9 sm:h-9 bg-[#003366] rounded-full flex items-center justify-center border-3 border-[#D4AF37] shadow-lg">
              <Flag className="w-4 h-4 sm:w-5 sm:h-5 text-[#D4AF37]" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-[#003366] mb-3 sm:mb-4 tracking-wide">
            🏠 سفراء البيت
          </h1>
          <p className="text-base sm:text-xl text-[#5a4a2a] max-w-2xl mx-auto leading-relaxed px-4 font-medium">
            شارك كودك، انشر الخير، وكن سببًا في بيت لغيرك
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        {stats && (
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-6">
              <InfoGuideStrip 
                code={stats.ambassador_code} 
                requirements={stats.requirements}
                pendingListingCount={stats.pending_listing_count}
              />
              
              <AmbassadorCodeCard 
                code={stats.ambassador_code}
                onCopy={() => setCopied(true)}
                onShare={() => setShowShareModal(true)}
                termsAccepted={termsAccepted}
                onActivate={() => setShowTermsModal(true)}
              />
              
              <SimpleWalletCard 
                amount={(Math.floor(availableFloors / 20) / 5)}
                buildings={Math.floor(availableFloors / 20)}
                onWithdraw={() => setShowWithdrawModal(true)}
              />

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-xl p-5 sm:p-8 border border-[#D4AF37]/30">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-5 sm:mb-6">
                  <h2 className="text-lg sm:text-xl font-bold text-[#003366] flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center shadow-lg">
                      <Star className="w-5 h-5 text-[#003366]" />
                    </div>
                    <span>سلم المكافآت</span>
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap text-[11px]">
                    <span className="text-blue-600"><Building2 className="w-3 h-3 inline ml-1" />{builtFloors} طابق</span>
                    <span className="text-emerald-600"><Check className="w-3 h-3 inline ml-1" />{availableFloors} متاح</span>
                    <span className="text-[#B8860B]"><Gift className="w-3 h-3 inline ml-1" />{floorsConsumed} مستهلك</span>
                    {collapsedFloors > 0 && (
                      <button onClick={scrollToFlaggedFloor} className="text-red-600 hover:text-red-500">
                        <Flag className="w-3 h-3 inline ml-1" />{collapsedFloors} منهار
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="space-y-3">
                  {stats.rewards_config?.map((reward, idx) => {
                    const isAchieved = availableFloors >= reward.floors;
                    const progress = Math.min((availableFloors / reward.floors) * 100, 100);
                    const hasAnyPending = !!stats.pending_request;
                    const thisLevelPending = hasAnyPending && stats.pending_request?.reward_tier === reward.plan_tier;
                    const isConsumed = floorsConsumed >= reward.floors;
                    const floorsProgress = Math.min(availableFloors, reward.floors);
                    const canClaim = isAchieved && !isConsumed && !hasAnyPending;
                    
                    return (
                      <div 
                        key={idx}
                        className={`relative overflow-hidden rounded-2xl border-2 transition-all ${
                          isConsumed
                            ? 'bg-gradient-to-l from-slate-100 to-slate-50 border-slate-300'
                            : isAchieved 
                              ? 'bg-gradient-to-l from-green-50 to-emerald-50 border-green-300' 
                              : 'bg-[#003366]/5 border-[#003366]/20'
                        }`}
                      >
                        {!isAchieved && (
                          <div 
                            className="absolute inset-y-0 right-0 bg-gradient-to-l from-[#D4AF37]/20 to-transparent transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        )}
                        <div className="relative p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${
                                isConsumed
                                  ? 'bg-slate-400 text-white'
                                  : isAchieved 
                                    ? 'bg-green-500 text-white' 
                                    : 'bg-gradient-to-br from-[#D4AF37] to-[#B8860B] text-white'
                              }`}>
                                {isConsumed ? (
                                  <Check className="w-5 h-5" />
                                ) : isAchieved ? (
                                  <Gift className="w-5 h-5" />
                                ) : (
                                  <span>{floorsProgress}/{reward.floors}</span>
                                )}
                              </div>
                              <div>
                                <span className={`font-bold ${isAchieved ? 'text-green-600' : 'text-[#003366]'}`}>
                                  {isAchieved ? 'اكتمل!' : reward.plan_name}
                                </span>
                                {!isAchieved && <p className="text-xs text-slate-500">{reward.plan_months} شهر مجاناً</p>}
                              </div>
                            </div>
                            <div className="text-left">
                              <span className={`font-bold ${isConsumed ? 'text-slate-500' : isAchieved ? 'text-green-600' : 'text-[#003366]'}`}>
                                {floorsProgress} من {reward.floors}
                              </span>
                              {isAchieved && <p className="text-xs text-green-500">{reward.plan_months} شهر مجاناً</p>}
                            </div>
                          </div>
                          
                          {thisLevelPending ? (
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-amber-100 text-amber-700 flex items-center justify-center gap-2">
                                <Clock className="w-4 h-4" />
                                طلبك قيد المراجعة
                              </div>
                              <button
                                onClick={() => cancelRequest()}
                                className="py-2.5 px-4 rounded-xl font-bold text-sm bg-red-500 text-white hover:bg-red-600 transition"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (canClaim) {
                                  setSelectedTier(reward);
                                  setShowRewardModal(true);
                                }
                              }}
                              disabled={!canClaim}
                              className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                !isAchieved
                                  ? 'bg-[#003366]/15 text-[#003366]/70 cursor-not-allowed'
                                  : isConsumed
                                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                    : canClaim
                                      ? 'bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white hover:shadow-lg cursor-pointer animate-pulse'
                                      : 'bg-blue-50 text-blue-600 cursor-not-allowed'
                              }`}
                            >
                              {!isAchieved ? (
                                <>
                                  <Gift className="w-4 h-4" />
                                  هديتك في انتظارك - اكمل الطوابق
                                </>
                              ) : isConsumed ? (
                                <>
                                  <Check className="w-4 h-4" />
                                  تم الحصول على الهدية: {reward.plan_name || 'باقة الصفوة'} ({reward.plan_months} شهر)
                                </>
                              ) : canClaim ? (
                                <>
                                  <Gift className="w-4 h-4" />
                                  اطلب هدية سفير: {reward.plan_name || 'باقة الصفوة'} ({reward.plan_months} شهر)
                                </>
                              ) : (
                                <>
                                  <Clock className="w-4 h-4" />
                                  انتظر مراجعة طلبك السابق
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {stats.referrals && stats.referrals.length > 0 && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-xl p-5 sm:p-8 border border-[#D4AF37]/30">
                  <h2 className="text-lg sm:text-xl font-bold text-[#003366] mb-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <span>آخر التسجيلات عن طريقك</span>
                  </h2>
                  <div className="space-y-3">
                    {stats.referrals.slice(0, 5).map((ref, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-[#FDF6E3] p-4 rounded-xl border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center shadow-lg">
                          <User className="w-6 h-6 text-[#003366]" />
                        </div>
                        <span className="text-[#003366] font-medium flex-1 text-base">{ref.referred_name}</span>
                        <span className={`text-xs px-4 py-2 rounded-full font-bold ${
                          ref.status === 'completed' 
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' 
                            : ref.status === 'flagged_fraud'
                              ? 'bg-red-100 text-red-700 border border-red-300'
                              : 'bg-amber-100 text-amber-700 border border-amber-300'
                        }`}>
                          {ref.status === 'completed' ? '✓ سليم' : ref.status === 'flagged_fraud' ? '⚠ منهار' : '⏳ قيد التفعيل'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 lg:sticky lg:top-4 space-y-4">
              <div data-building-view className="rounded-3xl shadow-xl overflow-hidden border border-[#D4AF37]/30">
                <RealisticBuilding 
                  currentFloors={currentFloors} 
                  maxFloors={maxFloors}
                  consumedFloors={consumedFloors}
                  flaggedFloors={flaggedFloors}
                  referrals={stats?.referrals as ReferralData[] || []}
                  onFloorClick={handleFloorClick}
                  highlightedFloor={highlightedFloor}
                  selectedBuilding={selectedBuilding}
                  onClearSelection={clearSelectedBuilding}
                />
              </div>
              
              {/* حصالة السفير الجذابة تحت المبنى */}
              {walletData?.settings?.financial_rewards_enabled && (() => {
                const buildingsPerDollar = walletData?.settings?.buildings_per_dollar || 5;
                // حساب المباني المكتملة تلقائياً من الطوابق المبنية
                const calculatedBuildings = Math.floor(builtFloors / maxFloors);
                const totalBuildings = Math.max(calculatedBuildings, walletData?.wallet?.total_buildings_completed || 0);
                const completedDollars = Math.floor(totalBuildings / buildingsPerDollar);
                const currentCycleProgress = totalBuildings % buildingsPerDollar;
                const totalRows = completedDollars + 1;
                
                // مبدأ الشفافية: حساب الرصيد الجزئي التقديري
                const dbBalance = (walletData?.wallet?.balance_cents || 0) / 100;
                const estimatedBalance = totalBuildings / buildingsPerDollar;
                const displayBalance = Math.max(dbBalance, estimatedBalance);
                
                return (
                  <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400/50 shadow-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                    {/* خلفية متحركة */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-emerald-500/10" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 animate-pulse" />
                    
                    {/* العنوان الرئيسي */}
                    <div className="relative p-4 border-b border-amber-400/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
                              <Banknote className="w-6 h-6 text-amber-900" />
                            </div>
                            {totalBuildings > 0 && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-slate-900">
                                {completedDollars}$
                              </div>
                            )}
                          </div>
                          <div>
                            <h3 className="text-amber-400 font-bold text-sm">حصالة الأرباح</h3>
                            <p className="text-slate-400 text-[10px]">اجمع المباني واكسب!</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-3xl font-black bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 bg-clip-text text-transparent">
                            ${displayBalance.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-emerald-400">{totalBuildings} مبنى مكتمل</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* صفوف المباني - تصميم جديد */}
                    <div className="relative p-4 space-y-3 max-h-48 overflow-y-auto">
                      {Array.from({ length: totalRows }).map((_, rowIndex) => {
                        const isCurrentRow = rowIndex === completedDollars;
                        const isCompletedRow = rowIndex < completedDollars;
                        const buildingsInThisRow = isCurrentRow ? currentCycleProgress : buildingsPerDollar;
                        
                        return (
                          <div key={rowIndex} className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${
                            isCompletedRow 
                              ? 'bg-[#d4edda] border-2 border-emerald-400' 
                              : isCurrentRow 
                                ? 'bg-slate-700/40 border border-amber-400/30' 
                                : 'bg-slate-800/30'
                          }`}>
                            {/* أيقونة الدولار */}
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                              isCompletedRow 
                                ? 'bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-500/40' 
                                : 'bg-slate-700 border-2 border-dashed border-slate-500'
                            }`}>
                              <DollarSign className={`w-5 h-5 ${isCompletedRow ? 'text-amber-900' : 'text-slate-500'}`} />
                            </div>
                            
                            {/* المباني كدوائر تقدم - مع الألوان حسب الحالة */}
                            <div className="flex-1 flex items-center justify-center gap-2">
                              {Array.from({ length: buildingsPerDollar }).map((_, buildingIndex) => {
                                const globalBuildingIndex = rowIndex * buildingsPerDollar + buildingIndex;
                                const building = buildingsData[globalBuildingIndex];
                                const isBuilt = isCompletedRow || (isCurrentRow && buildingIndex < buildingsInThisRow);
                                const isFlagged = building?.status === 'flagged';
                                const hasSuspicious = building?.suspiciousCount > 0;
                                
                                const hasAnyFloors = building?.totalFloors > 0;
                                const isClickable = building && (hasAnyFloors || isFlagged || hasSuspicious);
                                
                                return (
                                  <div 
                                    key={buildingIndex}
                                    onClick={() => isClickable && handleBuildingClick(building)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 relative ${
                                      isFlagged
                                        ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-md shadow-red-500/40 cursor-pointer hover:scale-110 animate-pulse'
                                        : hasSuspicious
                                          ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-md shadow-amber-500/40 cursor-pointer hover:scale-110'
                                          : isBuilt 
                                            ? 'bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md shadow-amber-400/30 cursor-pointer hover:scale-105' 
                                            : hasAnyFloors
                                              ? 'bg-gradient-to-br from-amber-300 to-yellow-400 shadow-md shadow-amber-300/20 cursor-pointer hover:scale-105 opacity-80'
                                              : 'bg-slate-700/60 border border-slate-600'
                                    }`}
                                  >
                                    {isFlagged ? (
                                      <Building2 className="w-4 h-4 text-white" />
                                    ) : hasSuspicious ? (
                                      <Building2 className="w-4 h-4 text-white" />
                                    ) : isBuilt ? (
                                      <Building2 className="w-4 h-4 text-amber-900" />
                                    ) : (
                                      <Building2 className="w-4 h-4 text-slate-500" />
                                    )}
                                    {(isFlagged || hasSuspicious) && (
                                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center">
                                        <Flag className={`w-2 h-2 ${isFlagged ? 'text-red-600' : 'text-amber-600'}`} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            
                            {/* رقم الصف وعلامة الاكتمال */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isCompletedRow 
                                ? 'bg-emerald-500 text-white' 
                                : 'bg-slate-700 text-slate-400 border border-slate-600'
                            }`}>
                              {isCompletedRow ? <Check className="w-4 h-4" /> : rowIndex + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* شريط التقدم */}
                    <div className="px-4 pb-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span>تقدم الدولار التالي</span>
                        <span className="text-amber-400 font-bold">{currentCycleProgress}/{buildingsPerDollar}</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${(currentCycleProgress / buildingsPerDollar) * 100}%` }}
                        />
                      </div>
                    </div>
                    
                    {/* زر السحب */}
                    <div className="p-4 pt-2 border-t border-amber-400/20">
                      {walletData?.pending_withdrawal ? (
                        <div className="py-2 px-3 bg-amber-500/20 text-amber-400 rounded-xl text-xs text-center font-medium flex items-center justify-center gap-2 border border-amber-500/30">
                          <Clock className="w-4 h-4 animate-spin" />
                          طلب سحب ${(walletData.pending_withdrawal.amount_cents / 100).toFixed(2)} قيد المراجعة
                        </div>
                      ) : (walletData?.wallet?.balance_cents || 0) >= (walletData?.settings?.min_withdrawal_cents || 100) ? (
                        <button
                          onClick={() => setShowWithdrawModal(true)}
                          className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/30"
                        >
                          <ArrowDownCircle className="w-4 h-4" />
                          اسحب أموالك
                        </button>
                      ) : (
                        <div className="text-center text-[10px] text-slate-400">
                          <p>أكمل <span className="text-amber-400 font-bold">{buildingsPerDollar - currentCycleProgress}</span> مباني أخرى للدولار التالي</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              {/* أدوات تجريبية - للاختبار قبل الإطلاق - تظهر دائماً */}
              <div className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                showTestTools 
                  ? 'bg-gradient-to-br from-amber-50/90 via-yellow-50/80 to-amber-50/90 border-amber-400/60 shadow-lg' 
                  : 'bg-slate-100/50 border-slate-300/30'
              }`}>
                {/* Header with Toggle */}
                <div 
                  onClick={() => setShowTestTools(!showTestTools)}
                  className="p-3 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border-b border-amber-400/30 cursor-pointer hover:from-amber-500/30 hover:to-yellow-500/30 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-lg flex items-center justify-center shadow-md">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-amber-900 flex items-center gap-2">
                        🧪 أدوات تجريبية
                      </p>
                      <p className="text-[10px] text-amber-700">للاستخدام قبل الإطلاق - قابلة للإزالة لاحقاً</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-amber-700 transition-transform duration-300 ${showTestTools ? 'rotate-180' : ''}`} />
                </div>
                
                {/* Test Tools Content */}
                {showTestTools && (
                  <div className="p-4 space-y-3">
                    <div className="bg-white/60 rounded-xl p-3 border border-amber-200">
                      <p className="text-xs text-amber-900 font-medium mb-3">إضافة عملاء تجريبيين:</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          onClick={() => addTestReferrals(10)}
                          disabled={testToolsLoading}
                          className="px-3 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {testToolsLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              10 عملاء
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => addTestReferrals(50)}
                          disabled={testToolsLoading}
                          className="px-3 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {testToolsLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              50 عميل
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => addTestReferrals(100)}
                          disabled={testToolsLoading}
                          className="px-3 py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {testToolsLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              100 عميل
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => addTestReferrals(maxFloors)}
                          disabled={testToolsLoading}
                          className="px-3 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          {testToolsLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Building2 className="w-3.5 h-3.5" />
                              مبنى واحد ({maxFloors})
                            </>
                          )}
                        </button>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => addTestReferrals(maxFloors * 5)}
                            disabled={testToolsLoading}
                            className="flex-1 px-3 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            {testToolsLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                5 مباني ({maxFloors * 5} إحالة)
                              </>
                            )}
                          </button>
                          <button
                            onClick={clearTestReferrals}
                            disabled={testToolsLoading}
                            className="flex-1 px-3 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs font-bold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            {testToolsLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5" />
                                حذف الكل
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-amber-100/50 rounded-lg p-2 border border-amber-300/50">
                      <p className="text-[10px] text-amber-800 text-center leading-relaxed">
                        ⚠️ <strong>ملاحظة:</strong> هذه الأدوات للاختبار فقط قبل الإطلاق. يمكن إزالتها لاحقاً من الكود.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {stats && (
        <>
          <SocialShareModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            code={stats.ambassador_code}
            shareUrl={shareUrl}
            shareTextConfig={shareTextConfig}
          />
          
          <RewardActionModal
            isOpen={showRewardModal}
            onClose={() => { setShowRewardModal(false); setRequestSuccess(false); }}
            stats={stats}
            onRequestReward={requestReward}
            requesting={requesting}
            requestSuccess={requestSuccess}
          />
          
          <CollapsedFloorModal
            isOpen={showCollapsedModal}
            onClose={() => { setShowCollapsedModal(false); setSelectedCollapsedFloor(null); }}
            floor={selectedCollapsedFloor}
            onRemove={handleRemoveCollapsedFloor}
            removing={removingFloor}
          />
          
          {/* نافذة إضافة مبنى */}
          {showAddBuildingModal && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl border-2 border-violet-400/50 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="relative p-5 border-b border-violet-400/30 bg-gradient-to-r from-violet-500/10 to-purple-500/10">
                  <button 
                    onClick={() => { setShowAddBuildingModal(false); setAddBuildingNote(''); }}
                    className="absolute top-4 left-4 p-1.5 hover:bg-white/10 rounded-full transition"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-violet-400 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30 mb-3">
                      <Building2 className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white">طلب إضافة مبنى</h3>
                    <p className="text-slate-400 text-sm mt-1">سيتم مراجعة طلبك للتحقق من صحته</p>
                  </div>
                </div>
                
                {/* المحتوى */}
                <div className="p-4 space-y-4">
                  {/* معلومات التدقيق */}
                  <div className="bg-violet-500/10 border border-violet-400/30 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="w-5 h-5 text-violet-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-violet-300 text-sm font-bold">لماذا التدقيق؟</p>
                        <p className="text-slate-400 text-xs mt-1">نقوم بفحص كل مبنى للتأكد من سلامته من التلاعب والاحتيال. بعد الموافقة، سيُضاف المبنى إلى رصيدك.</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* ملاحظات */}
                  <div>
                    <label className="text-slate-400 text-xs block mb-2">ملاحظات إضافية (اختياري)</label>
                    <textarea
                      value={addBuildingNote}
                      onChange={(e) => setAddBuildingNote(e.target.value)}
                      placeholder="أضف أي ملاحظات تريد إرفاقها مع طلبك..."
                      className="w-full bg-slate-800 border-2 border-violet-500/30 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-violet-400 transition resize-none h-20"
                    />
                  </div>
                  
                  {/* ما سيحدث */}
                  <div className="bg-slate-800/50 rounded-xl p-3 space-y-2">
                    <p className="text-slate-300 text-xs font-bold">عند الموافقة على طلبك:</p>
                    <ul className="text-slate-400 text-xs space-y-1">
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                        يُضاف مبنى جديد (20 طابق) إلى حسابك
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                        يُحسب ضمن رصيدك المالي
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                        يتم تصفير استخداماته السابقة
                      </li>
                    </ul>
                  </div>
                  
                  {/* زر الإرسال */}
                  <button
                    onClick={async () => {
                      setSubmittingBuilding(true);
                      try {
                        const res = await fetch('/api/ambassador/request-building', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ note: addBuildingNote })
                        });
                        if (res.ok) {
                          setSuccessMessage('تم إرسال طلب إضافة المبنى بنجاح! سنراجعه قريباً.');
                          setShowAddBuildingModal(false);
                          setAddBuildingNote('');
                        } else {
                          const err = await res.json();
                          alert(err.error || 'حدث خطأ');
                        }
                      } catch (err) {
                        alert('حدث خطأ في الاتصال');
                      } finally {
                        setSubmittingBuilding(false);
                      }
                    }}
                    disabled={submittingBuilding}
                    className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-violet-500/30 disabled:opacity-50"
                  >
                    {submittingBuilding ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <PlusCircle className="w-5 h-5" />
                        إرسال الطلب
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* نافذة سحب الرصيد */}
          {showWithdrawModal && (() => {
            // استخدام الرصيد من API (يأخذ بعين الاعتبار الأموال المحجوزة)
            const apiBalanceCents = walletData?.wallet?.balance_cents || 0;
            const calculatedBalance = Math.floor(availableFloors / 20) / 5;
            // استخدام قيمة API إذا متوفرة، وإلا الحساب المحلي كـ fallback
            const balanceAmount = walletData?.wallet ? (apiBalanceCents / 100) : calculatedBalance;
            
            return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border-2 border-[#D4AF37]/40 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="relative p-5 border-b border-[#D4AF37]/20 bg-gradient-to-r from-[#D4AF37]/10 to-emerald-500/10">
                  <button 
                    onClick={() => setShowWithdrawModal(false)}
                    className="absolute top-4 left-4 p-1.5 hover:bg-[#003366]/10 rounded-full transition"
                  >
                    <X className="w-5 h-5 text-[#003366]" />
                  </button>
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-2xl flex items-center justify-center shadow-lg shadow-[#D4AF37]/30 mb-3">
                      <Wallet className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-[#003366]">سحب الرصيد</h3>
                    <p className="text-[#5a4a2a] text-sm mt-1">حوّل أرباحك إلى رصيد حقيقي</p>
                  </div>
                </div>
                
                {/* الرصيد المتاح */}
                <div className="p-4">
                  <div className="bg-[#FDF6E3] rounded-xl p-4 border border-[#D4AF37]/30 mb-4">
                    <p className="text-[#5a4a2a] text-xs mb-1">الرصيد المتاح للسحب</p>
                    <p className="text-3xl font-black bg-gradient-to-r from-[#D4AF37] via-[#B8860B] to-[#D4AF37] bg-clip-text text-transparent">
                      ${balanceAmount.toFixed(2)}
                    </p>
                  </div>
                  
                  {/* خيارات السحب */}
                  <div className="space-y-3 mb-4">
                    {/* كامل المبلغ */}
                    <button
                      onClick={() => { setWithdrawAmount('full'); setCustomAmount(''); }}
                      className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                        withdrawAmount === 'full' 
                          ? 'border-emerald-500 bg-emerald-50' 
                          : 'border-[#D4AF37]/30 hover:border-[#D4AF37]/60 bg-white'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        withdrawAmount === 'full' ? 'bg-emerald-500' : 'bg-[#D4AF37]'
                      }`}>
                        <Banknote className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-right flex-1">
                        <p className="text-[#003366] font-bold">كامل المبلغ</p>
                        <p className="text-[#5a4a2a] text-xs">${balanceAmount.toFixed(2)}</p>
                      </div>
                      {withdrawAmount === 'full' && (
                        <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                    
                    {/* مبلغ محدد */}
                    <button
                      onClick={() => setWithdrawAmount('custom')}
                      className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                        withdrawAmount === 'custom' 
                          ? 'border-[#D4AF37] bg-[#FDF6E3]' 
                          : 'border-[#D4AF37]/30 hover:border-[#D4AF37]/60 bg-white'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        withdrawAmount === 'custom' ? 'bg-[#D4AF37]' : 'bg-[#003366]/20'
                      }`}>
                        <Edit3 className={`w-5 h-5 ${withdrawAmount === 'custom' ? 'text-white' : 'text-[#003366]'}`} />
                      </div>
                      <div className="text-right flex-1">
                        <p className="text-[#003366] font-bold">مبلغ محدد</p>
                        <p className="text-[#5a4a2a] text-xs">اختر المبلغ الذي تريده</p>
                      </div>
                      {withdrawAmount === 'custom' && (
                        <div className="w-6 h-6 bg-[#D4AF37] rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                    
                    {/* حقل إدخال المبلغ المخصص */}
                    {withdrawAmount === 'custom' && (
                      <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
                        <label className="text-[#5a4a2a] text-xs block mb-2">أدخل المبلغ المطلوب ($)</label>
                        <div className="relative">
                          <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#D4AF37]" />
                          <input
                            type="number"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="0.00"
                            min="1"
                            max={balanceAmount}
                            step="0.01"
                            className="w-full bg-[#FDF6E3] border-2 border-[#D4AF37]/50 rounded-xl py-3 px-10 text-[#003366] text-lg font-bold text-center focus:outline-none focus:border-[#D4AF37] transition"
                          />
                        </div>
                        {customAmount && parseFloat(customAmount) > balanceAmount && (
                          <p className="text-red-500 text-xs mt-1">المبلغ أكبر من الرصيد المتاح!</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* زر تأكيد السحب */}
                  <button
                    onClick={async () => {
                      const amountToWithdraw = withdrawAmount === 'full' 
                        ? balanceAmount
                        : parseFloat(customAmount) || 0;
                      
                      if (amountToWithdraw <= 0) {
                        alert('الرجاء إدخال مبلغ صحيح');
                        return;
                      }
                      if (amountToWithdraw > balanceAmount) {
                        alert('المبلغ أكبر من الرصيد المتاح!');
                        return;
                      }
                      
                      setShowWithdrawModal(false);
                      await requestWithdrawal(amountToWithdraw);
                    }}
                    disabled={withdrawing || (withdrawAmount === 'custom' && (!customAmount || parseFloat(customAmount) <= 0 || parseFloat(customAmount) > balanceAmount))}
                    className="w-full py-3.5 bg-gradient-to-r from-[#D4AF37] via-[#B8860B] to-[#D4AF37] hover:from-[#B8860B] hover:to-[#D4AF37] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-[#D4AF37]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {withdrawing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <ArrowDownCircle className="w-5 h-5" />
                        تأكيد السحب
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
          })()}
        </>
      )}

      {successMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-emerald-500 to-green-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/50">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-base">{successMessage}</p>
            </div>
            <button 
              onClick={() => setSuccessMessage(null)}
              className="mr-2 p-1 hover:bg-white/20 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* نافذة الشروط والأحكام مع خانة الموافقة */}
      {showTermsModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onClick={() => {
            // ⚠️ منع الإغلاق إذا لم يوافق (يجب الموافقة أولاً)
            if (termsAccepted === false) return;
            setShowTermsModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border-2 border-[#D4AF37]/40 overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[#D4AF37]/20 bg-gradient-to-r from-[#D4AF37]/10 to-[#B8860B]/10 flex items-center justify-between">
              <h3 className="font-bold text-[#003366] text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#D4AF37]" />
                الشروط والأحكام
              </h3>
              {/* ⚠️ إخفاء زر الإغلاق إذا لم يوافق - يجب الموافقة أولاً */}
              {termsAccepted !== false && (
                <button onClick={() => setShowTermsModal(false)} className="p-1.5 rounded-lg hover:bg-[#D4AF37]/20 transition">
                  <X className="w-5 h-5 text-[#003366]" />
                </button>
              )}
            </div>
            
            <div className="p-5 space-y-4 max-h-[50vh] overflow-y-auto">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm font-bold text-emerald-700 mb-2">✅ شروط احتساب الإحالة:</p>
                <ul className="space-y-1 text-xs text-emerald-600">
                  <li>• يجب على المُحال تأكيد بريده الإلكتروني</li>
                  <li>• يجب على المُحال إضافة أول إعلان عقاري</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-bold text-amber-700 mb-2">⚠️ متطلبات السحب المالي:</p>
                <ul className="space-y-1 text-xs text-amber-600">
                  <li>• يجب توفر حساب بنكي مقبول ومُوثّق</li>
                  <li>• الحد الأدنى للسحب: $1 (5 مباني مكتملة)</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm font-bold text-blue-700 mb-2">🔄 في حال تعثر التحويل:</p>
                <p className="text-xs text-blue-600">يتم تحويل المبلغ تلقائياً إلى اشتراك مجاني في باقات المنصة بقيمة معادلة.</p>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-bold text-gray-700 mb-2">📋 شروط عامة:</p>
                <ul className="space-y-1 text-xs text-gray-600">
                  <li>• التسجيلات الوهمية تؤدي لانهيار الطوابق</li>
                  <li>• الطوابق المنهارة لا تُحتسب في المكافآت</li>
                  <li>• يحق للإدارة مراجعة أو إلغاء أي طلب</li>
                </ul>
              </div>
            </div>
            
            <div className="p-5 border-t border-[#D4AF37]/20 bg-[#FDF6E3] space-y-4">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsCheckbox}
                  onChange={(e) => setTermsCheckbox(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-[#D4AF37] text-[#D4AF37] focus:ring-[#D4AF37] mt-0.5 cursor-pointer"
                />
                <span className="text-sm text-[#003366] leading-relaxed group-hover:text-[#D4AF37] transition">
                  قرأت وأوافق على <span className="font-bold text-[#D4AF37]">الشروط والأحكام</span> الخاصة بخدمة سفير البيت
                </span>
              </label>
              
              <div className="flex gap-3">
                {/* زر الرفض (فقط إذا لم يوافق بعد) */}
                {termsAccepted === false && (
                  <button
                    onClick={() => {
                      // عند الرفض، نغلق الـ modal لكن الكود يبقى مخفي
                      setShowTermsModal(false);
                    }}
                    className="flex-1 py-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                  >
                    <X className="w-5 h-5" />
                    رفض
                  </button>
                )}
                
                {/* زر القبول */}
                <button
                  onClick={acceptTerms}
                  disabled={!termsCheckbox || acceptingTerms}
                  className={`${termsAccepted === false ? 'flex-1' : 'w-full'} py-3.5 bg-gradient-to-r from-[#D4AF37] via-[#B8860B] to-[#D4AF37] hover:from-[#B8860B] hover:to-[#D4AF37] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-[#D4AF37]/30 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {acceptingTerms ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      {termsAccepted === false ? 'أقبل الشروط' : 'تفعيل خدمة سفير البيت'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
