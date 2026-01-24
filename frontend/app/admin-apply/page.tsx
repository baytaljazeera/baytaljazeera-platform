"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Crown, User, Mail, Phone, MapPin, Briefcase, 
  FileText, Upload, Send, CheckCircle, Loader2,
  ArrowLeft, Building2
} from "lucide-react";

type JobTitle = {
  id: string;
  label: string;
};

const COUNTRIES = [
  "السعودية", "الإمارات", "الكويت", "قطر", "البحرين", "عُمان",
  "مصر", "الأردن", "لبنان", "سوريا", "العراق", "فلسطين",
  "المغرب", "تونس", "الجزائر", "ليبيا", "السودان", "اليمن",
  "تركيا", "أخرى"
];

export default function AdminApplyPage() {
  const router = useRouter();
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    age: "",
    country: "",
    job_title: "",
    cover_letter: ""
  });
  const [cvFile, setCvFile] = useState<File | null>(null);

  useEffect(() => {
    fetchJobTitles();
  }, []);

  async function fetchJobTitles() {
    try {
      const res = await fetch("/api/membership/job-titles");
      if (res.ok) {
        const data = await res.json();
        setJobTitles(data.titles || []);
      }
    } catch (err) {
      console.error("Error fetching job titles:", err);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError("");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("حجم الملف يجب أن يكون أقل من 5 ميجابايت");
        return;
      }
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        setError("يُسمح فقط بملفات PDF و Word");
        return;
      }
      setCvFile(file);
      setError("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    
    if (!formData.full_name || !formData.email || !formData.phone || !formData.job_title) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("البريد الإلكتروني غير صالح");
      return;
    }

    setLoading(true);

    try {
      const submitData = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value) submitData.append(key, value);
      });
      if (cvFile) {
        submitData.append("cv", cvFile);
      }

      const res = await fetch("/api/membership/apply", {
        method: "POST",
        body: submitData
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ أثناء إرسال الطلب");
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#001a2e] via-[#002845] to-[#003d5c] flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-md w-full text-center border border-white/20">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">تم إرسال طلبك بنجاح!</h1>
          <p className="text-white/70 mb-6">
            سيقوم فريقنا بمراجعة طلبك والتواصل معك قريباً عبر البريد الإلكتروني أو الهاتف.
          </p>
          <button
            onClick={() => router.push("/")}
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold rounded-xl hover:opacity-90 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            العودة للموقع الرئيسي
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#001a2e] via-[#002845] to-[#003d5c] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center mx-auto mb-4 shadow-xl">
            <Crown className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">انضم لفريق بيت الجزيرة</h1>
          <p className="text-white/70">قدّم طلبك للانضمام لفريق الإدارة</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-white/20 space-y-5">
          {error && (
            <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                <User className="w-4 h-4 inline ml-1" />
                الاسم الكامل <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="أدخل اسمك الكامل"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#D4AF37] transition"
                required
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                <Mail className="w-4 h-4 inline ml-1" />
                البريد الإلكتروني <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="example@email.com"
                dir="ltr"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#D4AF37] transition text-left"
                required
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                <Phone className="w-4 h-4 inline ml-1" />
                رقم الهاتف <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+966 5XX XXX XXXX"
                dir="ltr"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#D4AF37] transition text-left"
                required
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                العمر
              </label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                placeholder="25"
                min="18"
                max="70"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#D4AF37] transition"
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                <MapPin className="w-4 h-4 inline ml-1" />
                البلد
              </label>
              <select
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:border-[#D4AF37] transition appearance-none cursor-pointer"
              >
                <option value="" className="bg-[#002845]">اختر البلد</option>
                {COUNTRIES.map(c => (
                  <option key={c} value={c} className="bg-[#002845]">{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-2">
                <Briefcase className="w-4 h-4 inline ml-1" />
                المسمى الوظيفي <span className="text-red-400">*</span>
              </label>
              <select
                name="job_title"
                value={formData.job_title}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:border-[#D4AF37] transition appearance-none cursor-pointer"
                required
              >
                <option value="" className="bg-[#002845]">اختر المسمى الوظيفي</option>
                {jobTitles.map(jt => (
                  <option key={jt.id} value={jt.id} className="bg-[#002845]">{jt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              <FileText className="w-4 h-4 inline ml-1" />
              نبذة عنك / رسالة تقديم
            </label>
            <textarea
              name="cover_letter"
              value={formData.cover_letter}
              onChange={handleChange}
              placeholder="اكتب نبذة مختصرة عن خبراتك ولماذا تريد الانضمام..."
              rows={4}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#D4AF37] transition resize-none"
            />
          </div>

          <div>
            <label className="block text-white/80 text-sm font-medium mb-2">
              <Upload className="w-4 h-4 inline ml-1" />
              السيرة الذاتية (PDF أو Word)
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
                id="cv-upload"
              />
              <label
                htmlFor="cv-upload"
                className="flex items-center justify-center gap-3 w-full px-4 py-4 bg-white/5 border-2 border-dashed border-white/30 rounded-xl text-white/60 hover:border-[#D4AF37] hover:text-[#D4AF37] transition cursor-pointer"
              >
                <Upload className="w-5 h-5" />
                {cvFile ? (
                  <span className="text-[#D4AF37]">{cvFile.name}</span>
                ) : (
                  <span>اضغط لرفع السيرة الذاتية</span>
                )}
              </label>
            </div>
            <p className="text-white/40 text-xs mt-2">الحد الأقصى: 5 ميجابايت</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                جاري الإرسال...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                إرسال الطلب
              </>
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-white/60 hover:text-white transition text-sm"
            >
              العودة للموقع الرئيسي
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-white/40 text-sm">
          <Building2 className="w-4 h-4 inline ml-1" />
          بيت الجزيرة - منصة عقارية سعودية
        </div>
      </div>
    </div>
  );
}
