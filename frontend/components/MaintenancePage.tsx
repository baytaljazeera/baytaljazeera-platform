"use client";

export default function MaintenancePage() {
  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#01273C] via-[#023047] to-[#0B6B4C] flex items-center justify-center">
      <div className="text-center p-8 max-w-xl">
        <div className="text-8xl mb-8 animate-pulse">🔧</div>
        
        <h1 className="text-4xl md:text-5xl font-bold text-[#D4AF37] mb-6 font-cairo">
          الموقع تحت الصيانة
        </h1>
        
        <p className="text-xl text-white/90 mb-4 leading-relaxed">
          نعمل على تحسين تجربتكم وإضافة مميزات جديدة
        </p>
        
        <p className="text-lg text-white/70 mb-8">
          سنعود قريباً بإذن الله
        </p>
        
        <div className="flex items-center justify-center gap-3 text-[#D4AF37] text-2xl font-bold">
          <span>🏠</span>
          <span>بيت الجزيرة</span>
        </div>
        
        <div className="mt-12 text-white/50 text-sm">
          نعتذر عن أي إزعاج قد يسببه ذلك
        </div>
      </div>
    </div>
  );
}
