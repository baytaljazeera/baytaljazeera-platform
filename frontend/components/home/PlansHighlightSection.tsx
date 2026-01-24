"use client";

import Link from "next/link";
import { Crown, Gift, Users, Sparkles, Star, Building2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function PlansHighlightSection() {
  return (
    <section className="py-12 pb-8 bg-gradient-to-b from-[#FBF7F0] to-white relative overflow-hidden" dir="rtl">
      {/* نقاط الخلفية الزخرفية */}
      <div className="absolute inset-0 opacity-30 pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(circle, #D4AF37 1.5px, transparent 1.5px)`,
          backgroundSize: '24px 24px'
        }}
      />
      
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* العنوان الرئيسي */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#003366] mb-4">
            🌟 اكتشف مزايا بيت الجزيرة
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm md:text-base">
            باقات متنوعة تناسب الجميع، برامج حصرية للسفراء، وفرص مميزة لإبراز عقارك
          </p>
        </div>

        {/* البطاقات المتداخلة بتصميم مبتكر */}
        <div className="relative min-h-[450px] md:min-h-[380px]">
          {/* خلفية زجاجية */}
          <div className="absolute inset-x-4 md:inset-x-16 top-8 bottom-4 bg-white/40 backdrop-blur-sm rounded-[2.5rem] shadow-inner hidden md:block" />
          
          {/* البطاقات */}
          <div className="relative grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-0 items-start">
            
            {/* بطاقة نخبة العقارات - يسار */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="md:col-span-4 md:col-start-1 md:row-start-1 md:translate-y-12 md:-ml-2 z-10"
            >
              <div className="bg-gradient-to-br from-blue-50 to-sky-100 rounded-3xl p-6 border-2 border-blue-200 shadow-xl hover:shadow-2xl transition-all max-w-[320px] mx-auto md:mx-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#002845] to-[#1a3a5c] flex items-center justify-center mb-4 shadow-lg">
                  <Building2 className="w-7 h-7 text-[#D4AF37]" />
                </div>
                <h3 className="text-xl font-bold text-[#002845] mb-2">نخبة العقارات 👑</h3>
                <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                  اجعل عقارك يتصدر الصفحة الرئيسية! احجز موقعك المميز وضاعف مشاهداتك 10 أضعاف.
                </p>
                <Link 
                  href="/elite-booking"
                  className="inline-flex items-center gap-2 bg-gradient-to-l from-[#002845] to-[#1a3a5c] text-white font-bold px-5 py-2.5 rounded-xl hover:shadow-lg transition text-sm group"
                >
                  <Crown className="w-4 h-4 text-[#D4AF37]" />
                  احجز خانتك
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>

            {/* بطاقة برنامج السفراء - وسط (أكبر ومرتفعة) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -10, scale: 1.03 }}
              transition={{ type: "spring", stiffness: 300, delay: 0.1 }}
              className="md:col-span-5 md:col-start-4 md:row-start-1 md:-translate-y-4 z-20"
            >
              <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-3xl p-7 border-2 border-amber-300 shadow-2xl hover:shadow-[0_25px_60px_-15px_rgba(212,175,55,0.4)] transition-all relative overflow-hidden max-w-[360px] mx-auto">
                {/* شريط برنامج حصري */}
                <div className="absolute top-0 left-0 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white text-xs font-bold px-5 py-2 rounded-br-2xl shadow-md">
                  🏆 برنامج حصري
                </div>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center mb-5 shadow-lg mt-6">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-[#002845] mb-3">كن سفير البيت</h3>
                <p className="text-slate-600 text-sm mb-5 leading-relaxed">
                  انضم لبرنامج سفراء بيت الجزيرة. ادعُ 10 أصدقاء واحصل على باقة رجال الأعمال مجاناً لسنة كاملة!
                </p>
                <Link 
                  href="/referral"
                  className="inline-flex items-center gap-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white font-bold px-6 py-3 rounded-xl hover:shadow-xl transition text-sm group"
                >
                  <Star className="w-4 h-4" />
                  انضم الآن
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>

            {/* بطاقة ابدأ مجاناً - يمين */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
              className="md:col-span-4 md:col-start-9 md:row-start-1 md:translate-y-8 md:-mr-2 z-10"
            >
              <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-3xl p-6 border-2 border-green-200 shadow-xl hover:shadow-2xl transition-all max-w-[320px] mx-auto md:mr-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-4 shadow-lg">
                  <Gift className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-[#002845] mb-2">ابدأ مجاناً 🎉</h3>
                <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                  استمتع بباقة الأساس المجانية وأعلن عن عقارك الأول بدون أي تكلفة. تجربة كاملة للمنصة!
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    <span>إعلان مجاني لمدة 30 يوم</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    <span>حتى 3 صور للعقار</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* زر استعراض الباقات */}
        <div className="text-center mt-8">
          <Link
            href="/plans"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-l from-[#003366] to-[#1a4a6e] text-white font-bold text-base hover:shadow-xl transition group"
          >
            <span>استعرض جميع الباقات بالتفصيل</span>
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}
