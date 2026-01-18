export default function EliteBookingPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#001525] flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">👑</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">نخبة العقارات</h1>
        <p className="text-gray-400 text-lg">صفحة حجز النخبة قيد التحديث</p>
        <a 
          href="/" 
          className="inline-block mt-6 px-6 py-3 bg-[#D4AF37] text-[#002845] font-bold rounded-full hover:bg-[#e5c868] transition"
        >
          العودة للرئيسية
        </a>
      </div>
    </div>
  );
}
