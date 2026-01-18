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
        <div className="absolute top-10 right-10 w-60 h-60 bg-[#D4AF37]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 left-10 w-48 h-48 bg-[#0B6B4C]/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative text-center p-4 max-w-3xl">
        <div className="text-6xl mb-4 animate-bounce">🏠</div>
        
        <h1 className="text-3xl md:text-4xl font-bold text-[#D4AF37] mb-3 font-cairo">
          بيت الجزيرة
        </h1>
        
        <div className="inline-block bg-[#D4AF37]/20 backdrop-blur-sm rounded-full px-5 py-2 mb-5">
          <span className="text-lg md:text-xl text-[#D4AF37] font-bold">
            🎉 ترقبوا الافتتاح الكبير 🎉
          </span>
        </div>
        
        <p className="text-base md:text-lg text-white/90 mb-5 leading-relaxed max-w-xl mx-auto">
          منصة عقارية خليجية شاملة تجمع كل ما تحتاجه في مكان واحد
        </p>

        <div className="flex justify-center gap-3 md:gap-5 mb-8">
          {[
            { value: countdown.days, label: "يوم" },
            { value: countdown.hours, label: "ساعة" },
            { value: countdown.minutes, label: "دقيقة" },
            { value: countdown.seconds, label: "ثانية" }
          ].map((item, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 md:p-4 min-w-[55px] md:min-w-[70px]">
              <div className="text-xl md:text-3xl font-bold text-[#D4AF37] font-cairo">
                {String(item.value).padStart(2, '0')}
              </div>
              <div className="text-xs md:text-sm text-white/70 mt-1">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 max-w-2xl mx-auto">
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
            <div key={i} className="bg-white/5 backdrop-blur-sm rounded-lg p-2 flex items-center justify-center gap-2">
              <span className="text-xl">{country.icon}</span>
              <span className="text-sm text-white/80">{country.text}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-3 text-white/60 text-xs">
          <div className="flex items-center gap-1">
            <span>🏢</span>
            <span>آلاف العقارات</span>
          </div>
          <div className="hidden md:block w-1 h-1 bg-white/40 rounded-full" />
          <div className="flex items-center gap-1">
            <span>🤖</span>
            <span>ذكاء اصطناعي متقدم</span>
          </div>
          <div className="hidden md:block w-1 h-1 bg-white/40 rounded-full" />
          <div className="flex items-center gap-1">
            <span>🎁</span>
            <span>عروض حصرية</span>
          </div>
        </div>
      </div>
    </div>
  );
}
