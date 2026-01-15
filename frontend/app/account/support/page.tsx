"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Headset, MessageCircle, DollarSign, Settings, UserCircle, Plus, ArrowRight, Send, AlertCircle, X } from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";

interface Reply {
  id: number;
  sender_name: string;
  sender_type: string;
  message: string;
  created_at: string;
}

interface Complaint {
  id: number;
  ticket_number: string;
  subject: string;
  description: string;
  complaint_type: string;
  department?: string;
  subcategory?: string;
  status: string;
  priority: string;
  reply_count: number;
  sla_hours?: number;
  created_at: string;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المعالجة" },
  resolved: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل" },
  closed: { bg: "bg-slate-100", text: "text-slate-700", label: "مغلق" },
};

// 🎫 نظام التذاكر الموحد - الأقسام الثلاثة
const DEPARTMENTS = {
  financial: {
    id: "financial",
    label: "💰 مالية",
    icon: DollarSign,
    description: "استرداد، فواتير، اشتراكات، دفع",
    color: "#D4AF37",
    subcategories: [
      { id: "refund", label: "استرداد مبلغ" },
      { id: "invoice", label: "فاتورة أو إيصال" },
      { id: "payment_failed", label: "دفع فاشل" },
      { id: "subscription", label: "اشتراك أو تجديد" },
      { id: "pricing", label: "استفسار عن الأسعار" },
    ]
  },
  account: {
    id: "account",
    label: "👤 حسابي/إداري",
    icon: UserCircle,
    description: "تعديل بيانات، صلاحيات، توثيق",
    color: "#FF9800",
    subcategories: [
      { id: "profile_update", label: "تعديل بيانات الحساب" },
      { id: "delete_account", label: "حذف الحساب" },
      { id: "permissions", label: "صلاحيات أو وصول" },
      { id: "verification", label: "توثيق الحساب" },
      { id: "listing_issue", label: "مشكلة في إعلان" },
    ]
  },
  technical: {
    id: "technical",
    label: "🔧 تقنية",
    icon: Settings,
    description: "أعطال، أخطاء، بطء في الأداء",
    color: "#4CAF50",
    subcategories: [
      { id: "app_error", label: "خطأ في التطبيق" },
      { id: "display_issue", label: "مشكلة في العرض" },
      { id: "slow_performance", label: "بطء في الأداء" },
      { id: "upload_issue", label: "مشكلة رفع ملفات" },
      { id: "map_issue", label: "مشكلة في الخريطة" },
    ]
  }
};

const complaintTypes = Object.values(DEPARTMENTS);

const API_BASE = "";

export default function CustomerComplaintsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    department: "",
    subcategory: "",
    priority: "medium",
    subject: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (replies.length > 0) scrollToBottom();
  }, [replies]);

  const fetchComplaints = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/support`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.tickets || []);
      }
    } catch (err) {
      console.error("Error fetching complaints:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchComplaintDetails = useCallback(async (complaintId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/support/${complaintId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch (err) {
      console.error("Error fetching complaint details:", err);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) fetchComplaints();
  }, [user, authLoading, router, fetchComplaints]);

  useEffect(() => {
    if (selectedComplaint) fetchComplaintDetails(selectedComplaint.id);
  }, [selectedComplaint, fetchComplaintDetails]);

  const createComplaint = async () => {
    if (!formData.subject.trim() || !formData.description.trim() || !formData.department) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          department: formData.department,
          subcategory: formData.subcategory || null,
          priority: formData.priority,
          subject: formData.subject,
          description: formData.description,
        }),
      });
      if (res.ok) {
        setShowNewForm(false);
        setFormData({ department: "", subcategory: "", priority: "medium", subject: "", description: "" });
        setStep(1);
        fetchComplaints();
      }
    } catch (err) {
      console.error("Error creating complaint:", err);
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async () => {
    if (!selectedComplaint || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/${selectedComplaint.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        const data = await res.json();
        setReplies([...replies, data.reply]);
        setReply("");
      }
    } catch (err) {
      console.error("Error sending reply:", err);
    } finally {
      setSending(false);
    }
  };

  const getDepartmentInfo = (dept: string) => {
    return DEPARTMENTS[dept as keyof typeof DEPARTMENTS] || DEPARTMENTS.technical;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#002845] to-[#001830] flex items-center justify-center">
        <div className="text-white text-xl">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#002845] to-[#001830] py-8" dir="rtl">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/account")} className="text-white/70 hover:text-white">
              <ArrowRight className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Headset className="w-7 h-7 text-[#D4AF37]" />
                الشكاوى والدعم
              </h1>
              <p className="text-white/60 text-sm">تواصل معنا لحل أي مشكلة</p>
            </div>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#002845] rounded-xl font-medium hover:bg-[#c9a432] transition"
          >
            <Plus className="w-4 h-4" />
            شكوى جديدة
          </button>
        </div>

        {showNewForm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-l from-[#002845] to-[#003f6b] p-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">تقديم شكوى جديدة</h2>
                <button onClick={() => { setShowNewForm(false); setStep(1); setFormData({ department: "", subcategory: "", priority: "medium", subject: "", description: "" }); }} className="text-white/70 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {step === 1 && (
                <div className="p-6">
                  <p className="text-slate-600 mb-4 text-center">اختر نوع الشكوى</p>
                  <div className="space-y-3">
                    {complaintTypes.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => { setFormData({ ...formData, department: type.id }); setStep(2); }}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-[#D4AF37] transition group"
                      >
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${type.color}20` }}>
                          <type.icon className="w-6 h-6" style={{ color: type.color }} />
                        </div>
                        <div className="text-right flex-1">
                          <h3 className="font-semibold text-[#002845] group-hover:text-[#D4AF37] transition">{type.label}</h3>
                          <p className="text-sm text-slate-500">{type.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: `${getDepartmentInfo(formData.department).color}15` }}>
                    {(() => { const TypeIcon = getDepartmentInfo(formData.department).icon; return <TypeIcon className="w-5 h-5" style={{ color: getDepartmentInfo(formData.department).color }} />; })()}
                    <span className="font-medium text-[#002845]">{getDepartmentInfo(formData.department).label}</span>
                    <button onClick={() => setStep(1)} className="mr-auto text-xs text-slate-500 hover:text-[#D4AF37]">تغيير</button>
                  </div>

                  {/* التصنيف الفرعي */}
                  {getDepartmentInfo(formData.department).subcategories?.length > 0 && (
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">حدد نوع المشكلة (اختياري)</label>
                      <div className="flex flex-wrap gap-2">
                        {getDepartmentInfo(formData.department).subcategories.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => setFormData({ ...formData, subcategory: sub.id })}
                            className={`px-3 py-1.5 rounded-full text-sm border transition ${
                              formData.subcategory === sub.id
                                ? "bg-[#D4AF37] text-white border-[#D4AF37]"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:border-[#D4AF37]"
                            }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-slate-600 mb-1">الأولوية</label>
                    <div className="flex gap-2">
                      {[
                        { id: "low", label: "منخفضة", color: "bg-green-100 text-green-700 border-green-200" },
                        { id: "medium", label: "متوسطة", color: "bg-amber-100 text-amber-700 border-amber-200" },
                        { id: "high", label: "عالية", color: "bg-red-100 text-red-700 border-red-200" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setFormData({ ...formData, priority: p.id })}
                          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border-2 transition ${formData.priority === p.id ? p.color : "bg-slate-50 text-slate-500 border-slate-200"}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-1">الموضوع</label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="اكتب موضوع الشكوى..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600 mb-1">التفاصيل</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="اشرح مشكلتك بالتفصيل..."
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={createComplaint}
                      disabled={creating || !formData.subject.trim() || !formData.description.trim()}
                      className="flex-1 py-3 bg-[#D4AF37] text-[#002845] rounded-xl font-medium hover:bg-[#c9a432] transition disabled:opacity-50"
                    >
                      {creating ? "جاري الإرسال..." : "إرسال الشكوى"}
                    </button>
                    <button
                      onClick={() => { setShowNewForm(false); setStep(1); }}
                      className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedComplaint ? (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => { const dept = selectedComplaint.department || selectedComplaint.complaint_type || "technical"; const TypeIcon = getDepartmentInfo(dept).icon; return <TypeIcon className="w-5 h-5" style={{ color: getDepartmentInfo(dept).color }} />; })()}
                <div>
                  <h3 className="font-bold text-[#002845]">{selectedComplaint.subject}</h3>
                  <span className="text-xs text-slate-400 font-mono">{selectedComplaint.ticket_number}</span>
                </div>
              </div>
              <button onClick={() => setSelectedComplaint(null)} className="text-slate-500 hover:text-slate-700">
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[400px] overflow-y-auto space-y-3">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-sm text-slate-700">{selectedComplaint.description}</p>
                <p className="text-[10px] text-slate-500 mt-2">{new Date(selectedComplaint.created_at).toLocaleString("ar-SA")}</p>
              </div>
              {replies.map((r) => (
                <div key={r.id} className={`rounded-xl p-3 ${r.sender_type === 'admin' ? 'bg-[#D4AF37]/10 mr-4' : 'bg-blue-50 ml-4'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[#002845]">{r.sender_name || (r.sender_type === 'admin' ? 'الدعم' : 'أنت')}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.sender_type === 'admin' ? 'bg-[#D4AF37] text-white' : 'bg-blue-500 text-white'}`}>
                      {r.sender_type === 'admin' ? 'دعم' : 'أنت'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{r.message}</p>
                  <p className="text-[10px] text-slate-500 mt-2">{new Date(r.created_at).toLocaleString("ar-SA")}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {selectedComplaint.status !== 'resolved' && selectedComplaint.status !== 'closed' && (
              <div className="p-4 border-t border-slate-100 flex gap-2">
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendReply()}
                  placeholder="اكتب ردك..."
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="p-2 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#c9a432] transition disabled:opacity-50">
                  <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {complaints.length === 0 ? (
              <div className="bg-white/10 rounded-2xl p-8 text-center">
                <AlertCircle className="w-12 h-12 text-white/30 mx-auto mb-3" />
                <p className="text-white/60">لا توجد شكاوى سابقة</p>
                <p className="text-white/40 text-sm mt-1">اضغط على "شكوى جديدة" للتواصل معنا</p>
              </div>
            ) : (
              complaints.map((complaint) => (
                <div
                  key={complaint.id}
                  onClick={() => setSelectedComplaint(complaint)}
                  className="bg-white rounded-xl p-4 cursor-pointer hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {(() => { const dept = complaint.department || complaint.complaint_type || "technical"; const TypeIcon = getDepartmentInfo(dept).icon; return (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${getDepartmentInfo(dept).color}20` }}>
                          <TypeIcon className="w-5 h-5" style={{ color: getDepartmentInfo(dept).color }} />
                        </div>
                      ); })()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[#002845] truncate">{complaint.subject}</h3>
                          <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">{complaint.ticket_number}</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-1">{complaint.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-slate-400">{new Date(complaint.created_at).toLocaleDateString("ar-SA")}</span>
                          {complaint.reply_count > 0 && (
                            <span className="text-xs text-blue-600 flex items-center gap-1">
                              <MessageCircle className="w-3 h-3" />
                              {complaint.reply_count} رد
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${statusColors[complaint.status]?.bg || 'bg-slate-100'} ${statusColors[complaint.status]?.text || 'text-slate-700'}`}>
                      {statusColors[complaint.status]?.label || complaint.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
