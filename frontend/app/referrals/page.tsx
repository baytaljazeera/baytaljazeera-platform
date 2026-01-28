"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { 
  Users, Gift, Copy, Check, Crown, ChevronLeft, 
  Share2, Target, Trophy, Sparkles, Clock, CheckCircle2
} from "lucide-react";

interface ReferralData {
  referral_code: string;
  referral_count: number;
  reward_claimed: boolean;
  remaining_for_reward: number;
  referrals: {
    id: number;
    status: string;
    created_at: string;
    referred_name: string | null;
    referred_email: string;
  }[];
  rewards: {
    id: number;
    reward_type: string;
    plan_name: string;
    granted_at: string;
    notes: string | null;
  }[];
}

export default function ReferralsPage() {
  const router = useRouter();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, []);

  async function fetchReferralData() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/referrals/my-referrals`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        router.push("/login");
        return;
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      toast.error("حدث خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }

  async function copyReferralCode() {
    if (!data?.referral_code) return;
    
    try {
      await navigator.clipboard.writeText(data.referral_code);
      setCopied(true);
      toast.success("تم نسخ كود الإحالة!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("فشل في نسخ الكود");
    }
  }

  async function shareReferralCode() {
    if (!data?.referral_code) return;
    
    const shareText = `انضم إلى بيت الجزيرة واحصل على أفضل العقارات!\n\nاستخدم كود الإحالة: ${data.referral_code}\n\nسجّل الآن: ${window.location.origin}/register?ref=${data.referral_code}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "دعوة للانضمام لبيت الجزيرة",
          text: shareText,
        });
      } catch {
        copyReferralCode();
      }
    } else {
      copyReferralCode();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#0A1628] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
      </div>
    );
  }

  const progress = data ? Math.min((data.referral_count / 10) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#0A1628]" dir="rtl">
      <Toaster position="top-center" richColors />
      
      <div className="sticky top-0 z-50 bg-[#0A1628]/95 backdrop-blur-md border-b border-[#D4AF37]/20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/account" className="p-2 rounded-lg bg-[#1a2942] hover:bg-[#243a5e] transition-colors">
            <ChevronLeft className="w-5 h-5 text-[#D4AF37]" />
          </Link>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Gift className="w-6 h-6 text-[#D4AF37]" />
            ادعُ أصدقاءك واربح مجاناً
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#D4AF37]/20 via-[#1a2942] to-[#0d1f3c] rounded-2xl p-6 border border-[#D4AF37]/30"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">اجلب 10 عملاء</h2>
              <p className="text-[#D4AF37]">واحصل على اشتراك سنة رجال أعمال مجاناً!</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">التقدم نحو الهدف</span>
              <span className="text-[#D4AF37] font-bold">{data?.referral_count || 0} / 10</span>
            </div>
            
            <div className="h-4 bg-[#0A1628] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#f4d03f] rounded-full"
              />
            </div>

            {data?.reward_claimed ? (
              <div className="flex items-center gap-2 text-green-400 bg-green-500/10 rounded-lg p-3">
                <CheckCircle2 className="w-5 h-5" />
                <span>تهانينا! لقد حصلت على المكافأة</span>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                {data?.remaining_for_reward === 0 
                  ? "أنت مؤهل للحصول على المكافأة!" 
                  : `باقي ${data?.remaining_for_reward} إحالات للحصول على المكافأة`}
              </p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-[#D4AF37]" />
            كود الدعوة الخاص بك
          </h3>

          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#0A1628] rounded-xl p-4 text-center">
              <span className="text-2xl font-bold text-[#D4AF37] tracking-wider">
                {data?.referral_code || "---"}
              </span>
            </div>
            
            <button
              onClick={copyReferralCode}
              className="p-4 rounded-xl bg-[#0A1628] hover:bg-[#0d1f3c] transition-colors border border-[#D4AF37]/20"
            >
              {copied ? (
                <Check className="w-6 h-6 text-green-400" />
              ) : (
                <Copy className="w-6 h-6 text-[#D4AF37]" />
              )}
            </button>
            
            <button
              onClick={shareReferralCode}
              className="p-4 rounded-xl bg-[#D4AF37] hover:bg-[#c4a030] transition-colors"
            >
              <Share2 className="w-6 h-6 text-[#0A1628]" />
            </button>
          </div>

          <p className="text-gray-400 text-sm mt-4 text-center">
            شارك هذا الكود مع أصدقائك وعندما يسجلون ستحصل على نقطة إحالة
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
            كيف تربح؟
          </h3>

          <div className="space-y-4">
            {[
              { step: 1, text: "شارك كود الإحالة مع أصدقائك ومعارفك" },
              { step: 2, text: "عندما يسجلون باستخدام كودك، تحصل على نقطة" },
              { step: 3, text: "عند جمع 10 نقاط، تحصل على اشتراك سنة رجال أعمال مجاناً!" },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] font-bold">
                  {item.step}
                </div>
                <p className="text-gray-300 flex-1">{item.text}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {data && data.referrals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4AF37]" />
              إحالاتك ({data.referrals.filter(r => r.status === 'completed').length})
            </h3>

            <div className="space-y-3">
              {data.referrals.map((referral) => {
                const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; text: string }> = {
                  completed: { color: "text-green-400", icon: CheckCircle2, text: "مكتمل" },
                  pending: { color: "text-yellow-400", icon: Clock, text: "قيد الانتظار" },
                  failed: { color: "text-red-400", icon: Users, text: "لم يكتمل" },
                };
                const status = statusConfig[referral.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                
                return (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between p-3 bg-[#0A1628] rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-[#D4AF37]" />
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {referral.referred_name || "عميل جديد"}
                        </p>
                        <p className="text-gray-400 text-sm">
                          {new Date(referral.created_at).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 ${status.color}`}>
                      <StatusIcon className="w-5 h-5" />
                      <span className="text-sm">{status.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {data && data.rewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-[#D4AF37]/20 via-[#1a2942] to-[#0d1f3c] rounded-2xl p-6 border border-[#D4AF37]/30"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Crown className="w-5 h-5 text-[#D4AF37]" />
              مكافآتك
            </h3>

            <div className="space-y-3">
              {data.rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between p-4 bg-[#0A1628]/50 rounded-xl border border-[#D4AF37]/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#D4AF37] flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-[#0A1628]" />
                    </div>
                    <div>
                      <p className="text-white font-bold">{reward.plan_name}</p>
                      <p className="text-gray-400 text-sm">{reward.notes}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-[#D4AF37] font-bold">مجاناً</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(reward.granted_at).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
