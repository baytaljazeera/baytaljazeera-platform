"use client";

import { useState } from "react";
import { UserPlus, User, Mail, Phone, FileText, Send, ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 2000);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#003d5c] p-4" dir="rtl">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">تم إرسال طلبك</h1>
          <p className="text-sm text-white/60 mb-6">سيتم مراجعة طلبك والرد عليك خلال 24-48 ساعة</p>
          <Link 
            href="/"
            className="inline-flex items-center gap-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold px-6 py-3 rounded-xl hover:shadow-lg transition"
          >
            <ArrowRight className="w-4 h-4" />
            العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#003d5c] p-4" dir="rtl">
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl" />
      
      <div className="relative w-full max-w-lg">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] shadow-xl mb-4">
              <UserPlus className="w-10 h-10 text-[#002845]" />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">طلب الانضمام للإدارة</h1>
            <p className="text-sm text-white/60">أرسل طلبك للانضمام إلى فريق إدارة بيت الجزيرة</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">الاسم الكامل</label>
              <div className="relative">
                <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition"
                  placeholder="محمد أحمد"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="email"
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition"
                  placeholder="email@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">رقم الجوال</label>
              <div className="relative">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="tel"
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition"
                  placeholder="05XXXXXXXX"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">سبب الانضمام</label>
              <div className="relative">
                <FileText className="absolute right-4 top-4 w-5 h-5 text-white/40" />
                <textarea
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition resize-none h-24"
                  placeholder="اشرح لماذا تريد الانضمام لفريق الإدارة..."
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-70"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-[#002845] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  إرسال الطلب
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link 
              href="/admin/login"
              className="text-sm text-[#D4AF37] hover:underline"
            >
              لديك حساب بالفعل؟ سجل دخولك
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
