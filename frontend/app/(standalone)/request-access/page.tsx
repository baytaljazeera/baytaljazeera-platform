"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { UserPlus, User, Mail, Phone, FileText, Send, ArrowRight, CheckCircle, Briefcase, AlertCircle } from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

type JobTitle = { id: string; label: string };

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields — these are now actually bound to state (the previous
  // version of this page had inputs with no state and a setTimeout fake
  // submit, so everything the user typed was discarded).
  const [fullName, setFullName]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [jobTitle, setJobTitle]   = useState("");
  const [coverLetter, setCoverLetter] = useState("");

  // Pull job titles from backend so the dropdown reflects what
  // /api/membership/admin/requests filters by. Fail-soft fallback list.
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([
    { id: 'content_manager', label: 'مدير المحتوى' },
    { id: 'support_manager', label: 'مدير الدعم الفني' },
    { id: 'finance_manager', label: 'مدير المالية' },
    { id: 'admin_manager',   label: 'مدير إداري' },
    { id: 'other',           label: 'أخرى' },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/membership/job-titles`);
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j?.titles) && j.titles.length > 0) setJobTitles(j.titles);
        }
      } catch {}
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !phone.trim() || !jobTitle) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    setLoading(true);
    try {
      // Backend route is /api/membership/apply (multer-multipart for the
      // CV upload), but multer falls through gracefully when the
      // content-type isn't multipart — so plain JSON works for the
      // CV-less path the public form uses.
      const res = await fetch(`${API_URL}/api/membership/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name:    fullName.trim(),
          email:        email.trim(),
          phone:        phone.trim(),
          job_title:    jobTitle,
          cover_letter: coverLetter.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setError((err as Error)?.message || "تعذّر إرسال الطلب، حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#003d5c] p-4" dir="rtl">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">تم إرسال طلبك</h1>
          <p className="text-sm text-white/60 mb-6">
            وصل طلبك لإدارة بيت الجزيرة — سنراجعه ونتواصل معك خلال 24-48 ساعة.
          </p>
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

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-400/40 text-red-100 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">الاسم الكامل</label>
              <div className="relative">
                <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition"
                  placeholder="05XXXXXXXX"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">الدور المطلوب</label>
              <div className="relative">
                <Briefcase className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none" />
                <select
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white focus:outline-none focus:border-[#D4AF37] transition appearance-none cursor-pointer"
                  required
                >
                  <option value="" className="bg-[#002845]">— اختر الدور الذي تطلبه —</option>
                  {jobTitles.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#002845]">
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">سبب الانضمام (اختياري)</label>
              <div className="relative">
                <FileText className="absolute right-4 top-4 w-5 h-5 text-white/40" />
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition resize-none h-24"
                  placeholder="اشرح لماذا تريد الانضمام لفريق الإدارة..."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
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
              href="/admin-login"
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
