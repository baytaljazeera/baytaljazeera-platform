"use client";

import { useEffect, useState } from "react";

export default function ComingSoonPage() {
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const launchDate = new Date();
    launchDate.setDate(launchDate.getDate() + 7);

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = launchDate.getTime() - now;

      if (distance > 0) {
        setCountdown({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#01273C] via-[#023047] to-[#0B6B4C] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 right-20 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-[#0B6B4C]/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative text-center p-8 max-w-4xl">
        <div className="text-9xl mb-6 animate-bounce">🏠</div>
        
        <h1 className="text-5xl md:text-7xl font-bold text-[#D4AF37] mb-4 font-cairo">
          بيت الجزيرة
        </h1>
        
        <div className="inline-block bg-[#D4AF37]/20 backdrop-blur-sm rounded-full px-8 py-3 mb-8">
          <span className="text-2xl md:text-3xl text-[#D4AF37] font-bold">
            🎉 ترقبوا الافتتاح الكبير 🎉
          </span>
        </div>
        
        <p className="text-xl md:text-2xl text-white/90 mb-8 leading-relaxed max-w-2xl mx-auto">
          منصة عقارية خليجية شاملة تجمع كل ما تحتاجه في مكان واحد
        </p>

        <div className="flex justify-center gap-4 md:gap-8 mb-12">
          {[
            { value: countdown.days, label: "يوم" },
            { value: countdown.hours, label: "ساعة" },
            { value: countdown.minutes, label: "دقيقة" },
            { value: countdown.seconds, label: "ثانية" }
          ].map((item, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 md:p-6 min-w-[70px] md:min-w-[100px]">
              <div className="text-3xl md:text-5xl font-bold text-[#D4AF37] font-cairo">
                {String(item.value).padStart(2, '0')}
              </div>
              <div className="text-sm md:text-base text-white/70 mt-1">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-3xl mx-auto">
          {[
            { icon: "🇸🇦", text: "السعودية" },
            { icon: "🇦🇪", text: "الإمارات" },
            { icon: "🇰🇼", text: "الكويت" },
            { icon: "🇶🇦", text: "قطر" },
            { icon: "🇧🇭", text: "البحرين" },
            { icon: "🇴🇲", text: "عمان" },
            { icon: "🇪🇬", text: "مصر" },
            { icon: "🇹🇷", text: "تركيا" }
          ].map((country, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-sm rounded-xl p-3 flex items-center justify-center gap-2">
              <span className="text-2xl">{country.icon}</span>
              <span className="text-white/80">{country.text}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-white/60 text-sm">
          <div className="flex items-center gap-2">
            <span>🏢</span>
            <span>آلاف العقارات</span>
          </div>
          <div className="hidden md:block w-1 h-1 bg-white/40 rounded-full" />
          <div className="flex items-center gap-2">
            <span>🤖</span>
            <span>ذكاء اصطناعي متقدم</span>
          </div>
          <div className="hidden md:block w-1 h-1 bg-white/40 rounded-full" />
          <div className="flex items-center gap-2">
            <span>🎁</span>
            <span>عروض حصرية</span>
          </div>
        </div>
      </div>
    </div>
  );
}
