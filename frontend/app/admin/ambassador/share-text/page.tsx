"use client";

import { useState, useEffect } from "react";
import { 
  Save, 
  Loader2, 
  Sparkles, 
  MessageSquare,
  RefreshCw,
  Eye,
  ArrowRight
} from "lucide-react";
import Link from "next/link";

type ShareTextConfig = {
  main_title: string;
  code_line: string;
  benefit_line: string;
  cta_line: string;
};

export default function ShareTextSettingsPage() {
  const [config, setConfig] = useState<ShareTextConfig>({
    main_title: "",
    code_line: "",
    benefit_line: "",
    cta_line: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [message, setMessage] = useState<{type: 'success' | 'error'; text: string} | null>(null);
  const [previewCode] = useState("AQR7B7FA2");

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      setLoading(true);
      const res = await fetch('/api/ambassador/admin/share-text', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch('/api/ambassador/admin/share-text', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include'
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'تم حفظ نصوص المشاركة بنجاح' });
      } else {
        setMessage({ type: 'error', text: 'حدث خطأ في حفظ النصوص' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال' });
    } finally {
      setSaving(false);
    }
  }

  async function suggestWithAI(field: string) {
    try {
      setSuggesting(field);
      const res = await fetch('/api/ambassador/admin/ai-suggest-share-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: field, 
          current_text: config[field as keyof ShareTextConfig] 
        }),
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        if (field === 'all' && data.suggestion) {
          setConfig(data.suggestion);
        } else if (data.suggestion) {
          setConfig(prev => ({ ...prev, [field]: data.suggestion }));
        }
      } else {
        const data = await res.json();
        if (data.fallback) {
          if (field === 'all') {
            setConfig(data.fallback);
          } else {
            setConfig(prev => ({ ...prev, [field]: data.fallback }));
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSuggesting(null);
    }
  }

  const formatPreview = () => {
    const lines = [
      config.main_title,
      '',
      config.code_line.replace('{CODE}', previewCode),
      config.benefit_line,
      '',
      config.cta_line,
      'https://aqar-aljazeera.com/register?ref=' + previewCode
    ];
    return lines.join('\n');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link href="/admin/ambassador" className="hover:text-[#D4AF37] transition">
              سفراء البيت
            </Link>
            <ArrowRight className="w-4 h-4" />
            <span>نصوص المشاركة</span>
          </div>
          <h1 className="text-2xl font-bold text-[#003366] flex items-center gap-3">
            <MessageSquare className="w-7 h-7 text-[#D4AF37]" />
            إعدادات نصوص المشاركة
          </h1>
          <p className="text-slate-600 mt-1">تحكم في النصوص التي تظهر عند مشاركة كود السفير</p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => suggestWithAI('all')}
            disabled={suggesting !== null}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition disabled:opacity-50"
          >
            {suggesting === 'all' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            اقتراح كامل بالذكاء الاصطناعي
          </button>
          
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-[#D4AF37] text-white rounded-lg hover:bg-[#B8860B] transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ التغييرات
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-xl ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
            <h2 className="text-lg font-bold text-[#003366] mb-4">تعديل النصوص</h2>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">العنوان الرئيسي</label>
                  <button
                    onClick={() => suggestWithAI('main_title')}
                    disabled={suggesting !== null}
                    className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 transition disabled:opacity-50"
                  >
                    {suggesting === 'main_title' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    اقتراح
                  </button>
                </div>
                <input
                  type="text"
                  value={config.main_title}
                  onChange={(e) => setConfig(prev => ({ ...prev, main_title: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                  placeholder="مثال: 🏠 انضم لعالم العقارات!"
                  dir="rtl"
                />
                <p className="text-xs text-slate-500 mt-1">السطر الأول الذي يراه المستلم</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">سطر الكود</label>
                  <button
                    onClick={() => suggestWithAI('code_line')}
                    disabled={suggesting !== null}
                    className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 transition disabled:opacity-50"
                  >
                    {suggesting === 'code_line' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    اقتراح
                  </button>
                </div>
                <input
                  type="text"
                  value={config.code_line}
                  onChange={(e) => setConfig(prev => ({ ...prev, code_line: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                  placeholder="مثال: ✨ استخدم كود السفير: {CODE}"
                  dir="rtl"
                />
                <p className="text-xs text-slate-500 mt-1">استخدم {'{CODE}'} ليتم استبداله بكود المستخدم</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">سطر الفائدة</label>
                  <button
                    onClick={() => suggestWithAI('benefit_line')}
                    disabled={suggesting !== null}
                    className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 transition disabled:opacity-50"
                  >
                    {suggesting === 'benefit_line' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    اقتراح
                  </button>
                </div>
                <input
                  type="text"
                  value={config.benefit_line}
                  onChange={(e) => setConfig(prev => ({ ...prev, benefit_line: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                  placeholder="مثال: 🎁 احصل على مميزات حصرية"
                  dir="rtl"
                />
                <p className="text-xs text-slate-500 mt-1">يوضح الفائدة التي سيحصل عليها المستخدم</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">دعوة للتسجيل (CTA)</label>
                  <button
                    onClick={() => suggestWithAI('cta_line')}
                    disabled={suggesting !== null}
                    className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 transition disabled:opacity-50"
                  >
                    {suggesting === 'cta_line' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    اقتراح
                  </button>
                </div>
                <input
                  type="text"
                  value={config.cta_line}
                  onChange={(e) => setConfig(prev => ({ ...prev, cta_line: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition"
                  placeholder="مثال: سجل الآن:"
                  dir="rtl"
                />
                <p className="text-xs text-slate-500 mt-1">السطر الأخير قبل الرابط</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-purple-800">نصائح للنص المثالي</h3>
            </div>
            <ul className="text-sm text-purple-700 space-y-2">
              <li>• استخدم إيموجي مناسبة ولكن باعتدال (1-2 في السطر)</li>
              <li>• اجعل النص قصير ومباشر</li>
              <li>• ركز على الفائدة التي سيحصل عليها المستخدم</li>
              <li>• استخدم لغة عربية فصحى مناسبة للسوق الخليجي</li>
              <li>• تجنب المبالغة والوعود غير الواقعية</li>
            </ul>
          </div>
        </div>

        <div className="lg:sticky lg:top-4">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="text-lg font-bold text-[#003366]">معاينة الرسالة</h2>
            </div>
            
            <div className="bg-slate-100 rounded-xl p-4">
              <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed" dir="rtl">
                  {formatPreview()}
                </pre>
              </div>
            </div>

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-700">
                <strong>ملاحظة:</strong> هذه المعاينة توضح كيف ستظهر الرسالة عند مشاركتها على منصات التواصل الاجتماعي
              </p>
            </div>

            <button
              onClick={fetchConfig}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-slate-600 hover:text-[#003366] transition"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة تحميل النصوص المحفوظة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
