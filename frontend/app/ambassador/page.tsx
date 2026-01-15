"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast, Toaster } from "sonner";
import { 
  Building2, Gift, Copy, Check, ChevronLeft, 
  Share2, Target, Trophy, Sparkles, Clock, CheckCircle2,
  Users, Crown, Star, AlertTriangle, Send, Loader2
} from "lucide-react";

interface RewardConfig {
  floors: number;
  plan_tier: string;
  plan_months: number;
  description: string;
}

interface AmbassadorData {
  ambassador_code: string;
  current_floors: number;
  total_floors_earned: number;
  max_floors: number;
  rewards_config: RewardConfig[];
  available_reward: RewardConfig | null;
  can_consume: boolean;
  consumption_enabled: boolean;
  pending_request: {
    id: number;
    status: string;
    reward_tier: string;
    created_at: string;
  } | null;
  referrals: {
    id: number;
    status: string;
    created_at: string;
    referred_name: string | null;
  }[];
  consumptions: {
    id: number;
    floors_consumed: number;
    plan_name: string;
    consumed_at: string;
    notes: string;
  }[];
}

function BuildingFloor({ 
  floor, 
  isBuilt, 
  isRewardLevel,
  rewardText
}: { 
  floor: number; 
  isBuilt: boolean; 
  isRewardLevel: boolean;
  rewardText?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: floor * 0.03 }}
      className={`relative flex items-center gap-2 p-2 rounded-lg transition-all ${
        isBuilt 
          ? 'bg-gradient-to-r from-[#D4AF37]/30 to-[#D4AF37]/10 border border-[#D4AF37]/50' 
          : 'bg-[#1a2942]/50 border border-[#1a2942]'
      }`}
    >
      <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${
        isBuilt ? 'bg-[#D4AF37] text-[#0A1628]' : 'bg-[#0A1628] text-gray-500'
      }`}>
        {floor}
      </div>
      
      <div className="flex-1 h-6 rounded overflow-hidden bg-[#0A1628]">
        {isBuilt && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.5, delay: floor * 0.05 }}
            className="h-full bg-gradient-to-r from-[#D4AF37] to-[#f4d03f]"
          />
        )}
      </div>
      
      {isRewardLevel && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2">
          <div className="bg-[#D4AF37] text-[#0A1628] px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap">
            <Gift className="w-3 h-3" />
            {rewardText}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function AmbassadorPage() {
  const router = useRouter();
  const [data, setData] = useState<AmbassadorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showConsumeModal, setShowConsumeModal] = useState(false);
  const [consuming, setConsuming] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [consumeSuccess, setConsumeSuccess] = useState<{ reward: RewardConfig } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ambassador/my-stats", {
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

  async function copyCode() {
    if (!data?.ambassador_code) return;
    
    try {
      await navigator.clipboard.writeText(data.ambassador_code);
      setCopied(true);
      toast.success("تم نسخ الكود!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("فشل في نسخ الكود");
    }
  }

  async function shareCode() {
    if (!data?.ambassador_code) return;
    
    const shareText = `انضم إلى بيت الجزيرة وكن سفيراً للبيت!\n\nاستخدم كود السفير: ${data.ambassador_code}\n\nشارك كودك، انشر الخير، وكن سببًا في بيت لغيرك.\n\nسجّل الآن: ${window.location.origin}/register?ref=${data.ambassador_code}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "دعوة لتصبح سفير البيت",
          text: shareText,
        });
      } catch {
        copyCode();
      }
    } else {
      copyCode();
    }
  }

  async function handleConsume() {
    setConsuming(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ambassador/consume", {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
      });

      const result = await res.json();
      
      if (!res.ok) {
        toast.error(result.error || "حدث خطأ");
        return;
      }

      setConsumeSuccess({ reward: result.reward });
      setShowConsumeModal(false);
      fetchData();
    } catch (err) {
      toast.error("حدث خطأ في الاستهلاك");
    } finally {
      setConsuming(false);
    }
  }

  async function handleRequestReward() {
    setRequesting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ambassador/request-reward", {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
      });

      const result = await res.json();
      
      if (!res.ok) {
        toast.error(result.error || "حدث خطأ");
        return;
      }

      toast.success("تم إرسال طلبك للإدارة بنجاح!");
      fetchData();
    } catch (err) {
      toast.error("حدث خطأ في إرسال الطلب");
    } finally {
      setRequesting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#0A1628] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
      </div>
    );
  }

  const currentFloors = data?.current_floors || 0;
  const maxFloors = data?.max_floors || 20;
  const progress = (currentFloors / maxFloors) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1628] via-[#0d1f3c] to-[#0A1628]" dir="rtl">
      <Toaster position="top-center" richColors />
      
      <div className="sticky top-0 z-50 bg-[#0A1628]/95 backdrop-blur-md border-b border-[#D4AF37]/20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/account" className="p-2 rounded-lg bg-[#1a2942] hover:bg-[#243a5e] transition-colors">
            <ChevronLeft className="w-5 h-5 text-[#D4AF37]" />
          </Link>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Star className="w-6 h-6 text-[#D4AF37]" />
            سفراء البيت
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#D4AF37]/20 via-[#1a2942] to-[#0d1f3c] rounded-2xl p-6 border border-[#D4AF37]/30 text-center"
        >
          <h2 className="text-2xl font-bold text-white mb-2">
            شارك كودك، انشر الخير، وكن سببًا في بيت لغيرك.
          </h2>
          <p className="text-[#D4AF37] text-lg">
            كل تسجيل حقيقي = طابق جديد في إنجازك 🏗️
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-[#D4AF37]" />
            كودك الخاص
          </h3>

          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#0A1628] rounded-xl p-4 text-center">
              <span className="text-2xl font-bold text-[#D4AF37] tracking-wider">
                {data?.ambassador_code || "---"}
              </span>
            </div>
            
            <button
              onClick={copyCode}
              className="p-4 rounded-xl bg-[#0A1628] hover:bg-[#0d1f3c] transition-all hover:scale-105 active:scale-95 border border-[#D4AF37]/20"
            >
              {copied ? (
                <Check className="w-6 h-6 text-green-400" />
              ) : (
                <Copy className="w-6 h-6 text-[#D4AF37]" />
              )}
            </button>
            
            <button
              onClick={shareCode}
              className="p-4 rounded-xl bg-[#D4AF37] hover:bg-[#c4a030] transition-all hover:scale-105 active:scale-95"
            >
              <Share2 className="w-6 h-6 text-[#0A1628]" />
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#D4AF37]" />
              عمارتك الحالية
            </h3>
            <div className="text-[#D4AF37] font-bold">
              {currentFloors} / {maxFloors} طابق
            </div>
          </div>

          <div className="mb-4">
            <div className="h-3 bg-[#0A1628] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#f4d03f] rounded-full"
              />
            </div>
          </div>

          <div className="grid gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {Array.from({ length: maxFloors }, (_, i) => {
              const floorNum = maxFloors - i;
              const isBuilt = floorNum <= currentFloors;
              const reward = data?.rewards_config?.find(r => r.floors === floorNum);
              
              return (
                <BuildingFloor
                  key={floorNum}
                  floor={floorNum}
                  isBuilt={isBuilt}
                  isRewardLevel={!!reward}
                  rewardText={reward?.description}
                />
              );
            })}
          </div>

          {currentFloors < maxFloors && (
            <p className="text-gray-400 text-sm mt-4 text-center">
              بقي {maxFloors - currentFloors} طوابق للوصول إلى المكافأة الكبرى 🎁
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#D4AF37]" />
            مكافآتك
          </h3>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between p-3 bg-[#0A1628] rounded-xl">
              <span className="text-gray-400">التسجيلات الفعّالة</span>
              <span className="text-[#D4AF37] font-bold">{currentFloors}</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-[#0A1628] rounded-xl">
              <span className="text-gray-400">الرصيد القابل للاستهلاك</span>
              {data?.available_reward ? (
                <span className="text-green-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  متاح
                </span>
              ) : (
                <span className="text-gray-500 flex items-center gap-1">
                  غير مكتمل
                </span>
              )}
            </div>

            {data?.available_reward && (
              <div className="p-4 bg-gradient-to-r from-[#D4AF37]/20 to-transparent rounded-xl border border-[#D4AF37]/30">
                <p className="text-white font-bold mb-1">المكافأة المتاحة:</p>
                <p className="text-[#D4AF37]">{data.available_reward.description}</p>
              </div>
            )}
          </div>

          {data?.pending_request ? (
            <div className="p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <Clock className="w-5 h-5" />
                <span className="font-bold">طلبك قيد المراجعة</span>
              </div>
              <p className="text-gray-400 text-sm">
                تم إرسال طلب للحصول على: {data.pending_request.reward_tier}
              </p>
            </div>
          ) : data?.can_consume ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowConsumeModal(true)}
                className="flex-1 py-4 px-6 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                استهلك رصيدي الآن
              </button>
              
              <button
                onClick={handleRequestReward}
                disabled={requesting}
                className="py-4 px-6 bg-[#D4AF37] hover:bg-[#c4a030] text-[#0A1628] font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 disabled:opacity-50"
              >
                {requesting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
                طلب العرض
              </button>
            </div>
          ) : null}
        </motion.div>

        {data && data.referrals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4AF37]" />
              تسجيلاتك ({data.referrals.filter(r => r.status === 'completed').length})
            </h3>

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {data.referrals.map((referral) => {
                const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; text: string }> = {
                  completed: { color: "text-green-400", icon: CheckCircle2, text: "فعّال" },
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

        {data && data.consumptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-[#D4AF37]/20 via-[#1a2942] to-[#0d1f3c] rounded-2xl p-6 border border-[#D4AF37]/30"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Crown className="w-5 h-5 text-[#D4AF37]" />
              سجل المكافآت
            </h3>

            <div className="space-y-3">
              {data.consumptions.map((consumption) => (
                <div
                  key={consumption.id}
                  className="flex items-center justify-between p-4 bg-[#0A1628]/50 rounded-xl border border-[#D4AF37]/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#D4AF37] flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-[#0A1628]" />
                    </div>
                    <div>
                      <p className="text-white font-bold">{consumption.plan_name || consumption.notes}</p>
                      <p className="text-gray-400 text-sm">{consumption.floors_consumed} طابق</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-[#D4AF37] font-bold">مجاناً</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(consumption.consumed_at).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-[#1a2942] rounded-2xl p-6 border border-[#D4AF37]/20"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
            كيف يعمل البرنامج؟
          </h3>

          <div className="space-y-4">
            {[
              { step: 1, text: "شارك كودك الخاص مع أصدقائك ومعارفك" },
              { step: 2, text: "عندما يسجلون ويصبحون فعّالين، تبني طابقاً جديداً" },
              { step: 3, text: "عند اكتمال العمارة، استهلك رصيدك واحصل على المكافأة" },
              { step: 4, text: "ابدأ بناء عمارة جديدة... بلا حدود! 🏗️" },
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
      </div>

      <AnimatePresence>
        {showConsumeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowConsumeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a2942] rounded-2xl p-6 max-w-md w-full border border-[#D4AF37]/30"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
                <h3 className="text-xl font-bold text-white">تأكيد استهلاك الرصيد</h3>
              </div>

              <p className="text-gray-300 mb-6">
                عند المتابعة، سيتم تفعيل مكافأتك الحالية (<span className="text-[#D4AF37] font-bold">{data?.available_reward?.description}</span>)،
                وستعود العمارة إلى الصفر لبدء إنجاز جديد.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConsumeModal(false)}
                  className="flex-1 py-3 px-4 bg-[#0A1628] hover:bg-[#0d1f3c] text-white font-bold rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConsume}
                  disabled={consuming}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-[#D4AF37] to-[#f4d03f] text-[#0A1628] font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {consuming ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      تأكيد واستهلاك
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {consumeSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConsumeSuccess(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-[#D4AF37]/30 via-[#1a2942] to-[#0d1f3c] rounded-2xl p-8 max-w-md w-full border border-[#D4AF37]/50 text-center"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"
              >
                <Trophy className="w-10 h-10 text-green-400" />
              </motion.div>

              <h3 className="text-2xl font-bold text-white mb-2">
                🎉 تم استهلاك رصيدك بنجاح
              </h3>
              
              <p className="text-[#D4AF37] text-lg mb-4">
                تم تفعيل باقة: {consumeSuccess.reward.description}
              </p>
              
              <p className="text-gray-400 mb-6">
                بدأت عمارة جديدة… هيا نكمل البناء 🏗️
              </p>

              <button
                onClick={() => setConsumeSuccess(null)}
                className="w-full py-4 px-6 bg-[#D4AF37] hover:bg-[#c4a030] text-[#0A1628] font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                متابعة البناء
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0A1628;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #D4AF37;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
