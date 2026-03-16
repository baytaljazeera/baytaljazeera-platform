"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import {
  FileText,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface Question {
  id: number;
  question_text_ar: string;
  question_type: string;
  options: { value: string; label: string }[] | null;
  is_required: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

const QUESTION_TYPES = [
  { value: "rating", label: "تقييم (1-5)" },
  { value: "yes_no", label: "نعم / لا" },
  { value: "short_text", label: "نص قصير" },
  { value: "multiple_choice", label: "اختيار من متعدد" },
];

export default function FeedbackQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    question_text_ar: "",
    question_type: "short_text",
    options: [] as { value: string; label: string }[],
    is_required: false,
    sort_order: 0,
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/feedback/admin/questions`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("فشل تحميل الأسئلة");
      const json = await res.json();
      setQuestions(json.questions || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const openEdit = (q: Question) => {
    setEditingId(q.id);
    setForm({
      question_text_ar: q.question_text_ar,
      question_type: q.question_type,
      options: Array.isArray(q.options) ? q.options : [],
      is_required: q.is_required,
      sort_order: q.sort_order,
    });
    setShowForm(false);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({
      question_text_ar: "",
      question_type: "short_text",
      options: [],
      is_required: false,
      sort_order: questions.length,
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const saveQuestion = async () => {
    if (!form.question_text_ar.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`${API_URL}/api/feedback/admin/questions/${editingId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("فشل التحديث");
      } else {
        const res = await fetch(`${API_URL}/api/feedback/admin/questions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("فشل الإضافة");
      }
      await fetchQuestions();
      cancelForm();
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ");
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (id: number) => {
    if (!confirm("هل تريد حذف هذا السؤال؟")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}/api/feedback/admin/questions/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("فشل الحذف");
      await fetchQuestions();
    } catch (e) {
      alert(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  const moveQuestion = async (index: number, direction: "up" | "down") => {
    const newOrder = [...questions];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    const ids = newOrder.map((q) => q.id);
    const res = await fetch(`${API_URL}/api/feedback/admin/questions/reorder`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) await fetchQuestions();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-[#002845] flex items-center gap-2">
        <FileText className="w-7 h-7 text-[#D4AF37]" />
        إدارة أسئلة التغذية الراجعة
      </h1>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6">
        {(showForm || editingId !== null) && (
          <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <h3 className="font-bold text-[#002845]">
              {editingId ? "تعديل السؤال" : "سؤال جديد"}
            </h3>
            <input
              type="text"
              placeholder="نص السؤال"
              value={form.question_text_ar}
              onChange={(e) => setForm((f) => ({ ...f, question_text_ar: e.target.value }))}
              className="rounded-lg border border-slate-300 px-4 py-2 w-full"
            />
            <select
              value={form.question_type}
              onChange={(e) => setForm((f) => ({ ...f, question_type: e.target.value }))}
              className="rounded-lg border border-slate-300 px-4 py-2"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))}
                className="rounded border-slate-300 text-[#D4AF37]"
              />
              <span className="text-[#002845]">مطلوب</span>
            </label>
            {form.question_type === "multiple_choice" && (
              <div>
                <p className="text-sm font-medium text-[#002845] mb-2">الخيارات (قيمة، تسمية)</p>
                {form.options.map((opt, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="قيمة"
                      value={opt.value}
                      onChange={(e) => {
                        const o = [...form.options];
                        o[i] = { ...o[i], value: e.target.value };
                        setForm((f) => ({ ...f, options: o }));
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 flex-1"
                    />
                    <input
                      type="text"
                      placeholder="تسمية"
                      value={opt.label}
                      onChange={(e) => {
                        const o = [...form.options];
                        o[i] = { ...o[i], label: e.target.value };
                        setForm((f) => ({ ...f, options: o }));
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 flex-1"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, options: [...f.options, { value: "", label: "" }] }))
                  }
                  className="text-sm text-[#D4AF37] font-medium"
                >
                  + إضافة خيار
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveQuestion}
                disabled={saving || !form.question_text_ar.trim()}
                className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#002845] font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                حفظ
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 rounded-lg border border-slate-300"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {!showForm && editingId === null && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D4AF37] text-[#002845] font-bold mb-4"
          >
            <Plus className="w-5 h-5" />
            إضافة سؤال
          </button>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          </div>
        ) : (
          <ul className="space-y-2">
            {questions.length === 0 ? (
              <li className="text-slate-500 py-4">لا توجد أسئلة. أضف سؤالاً من الزر أعلاه.</li>
            ) : (
              questions.map((q, index) => (
                <li
                  key={q.id}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-0">
                    <button
                      type="button"
                      onClick={() => moveQuestion(index, "up")}
                      disabled={index === 0}
                      className="p-1 text-slate-500 disabled:opacity-30"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(index, "down")}
                      disabled={index === questions.length - 1}
                      className="p-1 text-slate-500 disabled:opacity-30"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#002845]">{q.question_text_ar}</p>
                    <p className="text-xs text-slate-500">
                      {QUESTION_TYPES.find((t) => t.value === q.question_type)?.label || q.question_type} —
                      {q.is_required ? " مطلوب" : " اختياري"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(q)}
                    className="p-2 rounded-lg text-[#002845] hover:bg-slate-200"
                    title="تعديل"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteQuestion(q.id)}
                    disabled={deletingId === q.id}
                    className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                    title="حذف"
                  >
                    {deletingId === q.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
